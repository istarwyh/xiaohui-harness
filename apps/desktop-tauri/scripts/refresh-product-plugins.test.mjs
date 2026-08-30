import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import {
  assertNoDowngrade,
  assertSafeArchiveListing,
  readProductUpdatePolicy,
  refreshProductPlugins,
  resolveGitHubBranch,
  resolveGitHubLatestRelease,
  resolveNpmLatest,
  validateProductUpdatePolicy,
  verifyArchiveIntegrity,
  verifyArchiveExtractionLimits,
} from './refresh-product-plugins.mjs'

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function npmPolicy(overrides = {}) {
  return {
    id: 'fixture',
    kind: 'npm-latest',
    package: 'fixture-plugin',
    destination: 'fixture-plugin',
    ...overrides,
  }
}

function releasePairPolicy(overrides = {}) {
  return {
    id: 'harbor',
    kind: 'github-release-pair',
    repository: 'owner/project',
    package: 'fixture-plugin',
    destination: 'fixture-plugin',
    sourcePath: 'packages/node-plugin',
    pythonPackage: 'fixture-python',
    pythonDestination: 'fixture-python',
    pythonSourcePath: 'packages/python-plugin',
    ...overrides,
  }
}

function updatePolicy(plugins = [npmPolicy()]) {
  return { formatVersion: 1, managedNodeVersion: '22.19.0', plugins }
}

function writeTarString(header, offset, length, value) {
  Buffer.from(value).copy(header, offset, 0, length)
}

function writeTarOctal(header, offset, length, value) {
  writeTarString(header, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`)
}

function tarHeader({ name, size, type = '0', linkName = '' }) {
  const header = Buffer.alloc(512)
  writeTarString(header, 0, 100, name)
  writeTarOctal(header, 100, 8, 0o644)
  writeTarOctal(header, 108, 8, 0)
  writeTarOctal(header, 116, 8, 0)
  writeTarOctal(header, 124, 12, size)
  writeTarOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  writeTarString(header, 156, 1, type)
  writeTarString(header, 157, 100, linkName)
  writeTarString(header, 257, 6, 'ustar\0')
  writeTarString(header, 263, 2, '00')
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  writeTarString(header, 148, 8, `${checksum.toString(8).padStart(6, '0')}\0 `)
  return header
}

function tarGzip(entries) {
  const chunks = []
  for (const entry of entries) {
    const body = Buffer.isBuffer(entry.body) ? entry.body : Buffer.from(entry.body ?? '')
    chunks.push(tarHeader({ ...entry, size: body.length }), body)
    const padding = (512 - (body.length % 512)) % 512
    if (padding > 0) chunks.push(Buffer.alloc(padding))
  }
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}

test('product update policy accepts every supported source kind', () => {
  const policy = updatePolicy([
    npmPolicy({
      peerOverrides: {
        '1.2.3': { '@deepseek-ai/dsh-*': '^0.1.1-rc.1' },
      },
    }),
    {
      id: 'context',
      kind: 'github-branch',
      repository: 'owner/context-doctor',
      branch: 'main',
      package: 'context-doctor',
      destination: 'context-doctor',
    },
    releasePairPolicy({
      id: 'harbor',
      package: 'harbor-plugin',
      destination: 'harbor-plugin',
      pythonDestination: 'harbor-python',
    }),
  ])
  assert.equal(validateProductUpdatePolicy(policy, '/tmp/xiaohui-product'), policy)
})

test('product update policy rejects unsafe and duplicate ids', () => {
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([npmPolicy({ id: '' })]), '/tmp/product'),
    /id must be a non-empty single path segment/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([npmPolicy({ id: 'nested/id' })]), '/tmp/product'),
    /id must be a non-empty single path segment/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([
      npmPolicy(),
      npmPolicy({ package: 'other-plugin', destination: 'other-plugin' }),
    ]), '/tmp/product'),
    /duplicate plugin id: fixture/,
  )
})

test('product update policy rejects escaped, duplicate, and overlapping destinations', () => {
  for (const destination of ['../escape', '/tmp/escape', 'nested\\escape', 'nested//escape']) {
    assert.throws(
      () => validateProductUpdatePolicy(updatePolicy([npmPolicy({ destination })]), '/tmp/product'),
      /destination must be a safe relative path/,
    )
  }
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([
      npmPolicy(),
      npmPolicy({ id: 'other', package: 'other-plugin' }),
    ]), '/tmp/product'),
    /destination overlaps/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([
      npmPolicy(),
      npmPolicy({ id: 'child', package: 'child-plugin', destination: 'fixture-plugin/child' }),
    ]), '/tmp/product'),
    /destination overlaps/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([
      releasePairPolicy({ pythonDestination: 'fixture-plugin/python' }),
    ]), '/tmp/product'),
    /destination overlaps .*pythonDestination/,
  )
})

test('product update policy rejects a destination that crosses an existing symlink', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-policy-symlink-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const product = join(root, 'product')
  const outside = join(root, 'outside')
  mkdirSync(product)
  mkdirSync(outside)
  symlinkSync(outside, join(product, 'linked'), 'dir')
  assert.throws(
    () => validateProductUpdatePolicy(
      updatePolicy([npmPolicy({ destination: 'linked/plugin' })]),
      product,
    ),
    /must not traverse a symbolic link/,
  )
})

test('product update policy rejects checkout paths that can escape', () => {
  for (const [field, sourcePath] of [
    ['sourcePath', '../packages/node-plugin'],
    ['sourcePath', '/tmp/node-plugin'],
    ['pythonSourcePath', 'packages\\python-plugin'],
  ]) {
    assert.throws(
      () => validateProductUpdatePolicy(
        updatePolicy([releasePairPolicy({ [field]: sourcePath })]),
        '/tmp/product',
      ),
      new RegExp(`${field} must be a safe relative path`),
    )
  }
})

test('product update policy validates required source metadata before refresh', () => {
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([npmPolicy({ kind: 'unknown' })]), '/tmp/product'),
    /kind is unsupported/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([npmPolicy({ package: 'Uppercase' })]), '/tmp/product'),
    /valid lowercase npm package name/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([{
      id: 'context',
      kind: 'github-branch',
      repository: 'https://github.com/owner/project',
      branch: 'main',
      package: 'context-doctor',
      destination: 'context-doctor',
    }]), '/tmp/product'),
    /GitHub owner\/repository name/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([{
      id: 'context',
      kind: 'github-branch',
      repository: 'owner/project',
      branch: 'bad..branch',
      package: 'context-doctor',
      destination: 'context-doctor',
    }]), '/tmp/product'),
    /valid Git branch name/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([{
      id: 'context',
      kind: 'github-branch',
      repository: 'owner/project',
      package: 'context-doctor',
      destination: 'context-doctor',
    }]), '/tmp/product'),
    /valid Git branch name/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([releasePairPolicy({ pythonPackage: undefined })]), '/tmp/product'),
    /valid Python package name/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([releasePairPolicy({ sourcePath: undefined })]), '/tmp/product'),
    /sourcePath must be a safe relative path/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([npmPolicy({ unexpected: true })]), '/tmp/product'),
    /unsupported field: unexpected/,
  )
  assert.throws(
    () => validateProductUpdatePolicy(updatePolicy([npmPolicy({
      peerOverrides: { '^1.2.3': { 'fixture-peer': '^1.0.0' } },
    })]), '/tmp/product'),
    /key must be an exact semantic version/,
  )
})

test('policy reader and refresh fail before network or an escaped path can be touched', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-policy-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const product = join(root, 'product')
  mkdirSync(product, { recursive: true })
  const sentinel = join(root, 'sentinel.txt')
  writeFileSync(sentinel, 'owned outside product\n')
  const policy = updatePolicy([npmPolicy({ destination: '../sentinel.txt' })])
  writeFileSync(join(product, 'plugin-update-policy.json'), `${JSON.stringify(policy)}\n`)

  assert.throws(() => readProductUpdatePolicy(product), /destination must be a safe relative path/)
  let requests = 0
  await assert.rejects(
    refreshProductPlugins({
      allowDirty: true,
      desktop: root,
      repository: root,
      fetchImpl: async () => {
        requests += 1
        return jsonResponse({})
      },
    }),
    /destination must be a safe relative path/,
  )
  assert.equal(requests, 0)
  assert.equal(readFileSync(sentinel, 'utf8'), 'owned outside product\n')
})

test('archive extraction limits reject excessive entry count and expanded bytes', () => {
  const twoEntries = tarGzip([
    { name: 'package/a.txt', body: 'a' },
    { name: 'package/b.txt', body: 'b' },
  ])
  assert.throws(
    () => verifyArchiveExtractionLimits(twoEntries, { maximumEntries: 1, maximumExpandedBytes: 4096 }),
    /exceeds the 1-entry limit/,
  )

  const expanded = tarGzip([{ name: 'package/large.bin', body: Buffer.alloc(2048) }])
  assert.throws(
    () => verifyArchiveExtractionLimits(expanded, { maximumEntries: 10, maximumExpandedBytes: 1024 }),
    /exceeds the 1024-byte expanded size limit/,
  )
  assert.deepEqual(
    verifyArchiveExtractionLimits(tarGzip([{ name: 'package/a.txt', body: 'ok' }])),
    { entries: 1, expandedBytes: 2 },
  )
})

test('archive listing rejects traversal paths and link entries before extraction', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-archive-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const traversal = join(root, 'traversal.tgz')
  writeFileSync(traversal, tarGzip([{ name: '../escape', body: 'owned' }]))
  assert.throws(() => assertSafeArchiveListing(traversal), /unsafe path/)

  const symlink = join(root, 'symlink.tgz')
  writeFileSync(symlink, tarGzip([{ name: 'package/link', type: '2', linkName: '../target' }]))
  assert.throws(() => assertSafeArchiveListing(symlink), /non-file entry/)
})

test('npm latest resolution selects one stable artifact with integrity', async () => {
  const requested = []
  const latest = await resolveNpmLatest('fixture-plugin', async url => {
    requested.push(url)
    return jsonResponse({
      name: 'fixture-plugin',
      version: '2.3.4',
      dist: {
        tarball: 'https://registry.npmjs.org/fixture-plugin/-/fixture-plugin-2.3.4.tgz',
        integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
      },
    })
  })
  assert.deepEqual(latest, {
    version: '2.3.4',
    source: 'https://registry.npmjs.org/fixture-plugin/-/fixture-plugin-2.3.4.tgz',
    integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
  })
  assert.deepEqual(requested, ['https://registry.npmjs.org/fixture-plugin/latest'])
})

test('npm latest resolution rejects a prerelease channel', async () => {
  await assert.rejects(
    resolveNpmLatest('fixture-plugin', async () => jsonResponse({
      name: 'fixture-plugin',
      version: '2.3.4-rc.1',
      dist: { tarball: 'https://registry.npmjs.org/a.tgz', integrity: 'sha512-AA==' },
    })),
    /latest metadata is invalid/,
  )
})

test('GitHub branch and annotated Release resolve to immutable commits', async () => {
  const branchCommit = '1'.repeat(40)
  assert.deepEqual(
    await resolveGitHubBranch('owner/project', 'main', async () => jsonResponse({ commit: { sha: branchCommit } })),
    { branch: 'main', commit: branchCommit },
  )

  const tagObject = '2'.repeat(40)
  const releaseCommit = '3'.repeat(40)
  const requests = []
  const release = await resolveGitHubLatestRelease('owner/project', async url => {
    requests.push(url)
    if (url.endsWith('/releases/latest')) {
      return jsonResponse({ draft: false, prerelease: false, tag_name: 'v4.5.6' })
    }
    if (url.includes('/git/ref/tags/')) {
      return jsonResponse({ object: { type: 'tag', sha: tagObject } })
    }
    return jsonResponse({ object: { type: 'commit', sha: releaseCommit } })
  })
  assert.deepEqual(release, { tag: 'v4.5.6', version: '4.5.6', commit: releaseCommit })
  assert.equal(requests.length, 3)
})

test('archive integrity and downgrade checks fail closed', () => {
  const bytes = Buffer.from('reviewed artifact')
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  assert.doesNotThrow(() => verifyArchiveIntegrity(bytes, integrity))
  assert.throws(() => verifyArchiveIntegrity(Buffer.from('changed'), integrity), /integrity mismatch/)
  assert.doesNotThrow(() => assertNoDowngrade('fixture-plugin', '1.2.3', '1.2.4'))
  assert.throws(() => assertNoDowngrade('fixture-plugin', '1.2.3', '1.2.2'), /would downgrade/)
})
