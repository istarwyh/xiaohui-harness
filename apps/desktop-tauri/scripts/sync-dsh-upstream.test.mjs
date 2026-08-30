import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  retargetManifestDshPeers,
  syncDshUpstream,
} from './sync-dsh-upstream.mjs'

const oldVersion = '0.1.1-rc.1'
const nextVersion = '0.1.1-rc.2'
const oldCommit = '1'.repeat(40)
const nextCommit = '2'.repeat(40)

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function makeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-dsh-sync-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const product = join(root, 'apps', 'desktop-tauri', 'product')
  const personal = join(product, 'personal-workbench')
  mkdirSync(personal, { recursive: true })
  writeJson(join(root, 'package.json'), { name: '@deepseek-ai/dsh-root', version: oldVersion })
  writeJson(join(product, 'dsh-update-policy.json'), {
    formatVersion: 1,
    repository: 'deepseek-ai/deepseek-harness',
    channel: 'stable-else-rc',
    tagPrefix: 'dsh-v',
    firstPartyPeerPackages: ['personal-workbench'],
  })
  writeJson(join(product, 'DSH_UPSTREAM.json'), {
    repository: 'deepseek-ai/deepseek-harness',
    channel: 'stable-else-rc',
    tag: `dsh-v${oldVersion}`,
    version: oldVersion,
    commit: oldCommit,
  })
  writeJson(join(product, 'plugin-update-policy.json'), {
    formatVersion: 1,
    managedNodeVersion: '22.19.0',
    plugins: [{
      id: 'fixture',
      peerOverrides: {
        '1.0.0': {
          '@deepseek-ai/dsh-*': oldVersion,
          '@deepseek-ai/cordis': '^4.0.1',
        },
      },
    }],
  })
  writeJson(join(personal, 'package.json'), {
    name: 'dsh-personal-workbench',
    version: '0.1.0',
    peerDependencies: {
      '@deepseek-ai/dsh-settings': oldVersion,
      '@deepseek-ai/cordis': '^4.0.1',
    },
  })
  return { root, product, personal }
}

function releaseFetch() {
  return async url => {
    if (url.endsWith('/releases?per_page=100')) {
      return new Response(JSON.stringify([
        { draft: false, prerelease: true, tag_name: 'dsh-v0.1.2-alpha.1' },
        { draft: false, prerelease: true, tag_name: `dsh-v${nextVersion}` },
      ]), { status: 200 })
    }
    if (url.includes('/git/ref/tags/')) {
      return new Response(JSON.stringify({ object: { type: 'commit', sha: nextCommit } }), { status: 200 })
    }
    throw new Error(`unexpected request: ${url}`)
  }
}

test('manifest retargeting changes only DSH peer dependencies', () => {
  const manifest = {
    peerDependencies: {
      '@deepseek-ai/dsh-settings': oldVersion,
      '@deepseek-ai/cordis': '^4.0.1',
      react: '^18.2.0',
    },
  }
  assert.equal(retargetManifestDshPeers(manifest, nextVersion), 1)
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-settings'], nextVersion)
  assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '^4.0.1')
  assert.equal(manifest.peerDependencies.react, '^18.2.0')
})

test('DSH dry run reports the selected RC without touching Git or product files', async (t) => {
  const fixture = makeFixture(t)
  const before = readFileSync(join(fixture.product, 'plugin-update-policy.json'), 'utf8')
  const gitCalls = []
  const result = await syncDshUpstream({
    repositoryRoot: fixture.root,
    productRoot: fixture.product,
    fetchImpl: releaseFetch(),
    dryRun: true,
    git(args) {
      gitCalls.push(args)
      throw new Error('target commit is absent')
    },
  })
  assert.deepEqual(result.updates, [{
    package: '@deepseek-ai/dsh-root',
    from: oldVersion,
    to: nextVersion,
    tag: `dsh-v${nextVersion}`,
    commit: nextCommit,
  }])
  assert.equal(readFileSync(join(fixture.product, 'plugin-update-policy.json'), 'utf8'), before)
  assert.deepEqual(gitCalls, [['cat-file', '-e', `${nextCommit}^{commit}`]])
})

test('DSH sync prepares one upstream merge and rollback restores every owned file', async (t) => {
  const fixture = makeFixture(t)
  const paths = [
    join(fixture.product, 'plugin-update-policy.json'),
    join(fixture.product, 'DSH_UPSTREAM.json'),
    join(fixture.personal, 'package.json'),
  ]
  const before = new Map(paths.map(path => [path, readFileSync(path, 'utf8')]))
  let fetched = false
  let ancestor = false
  let mergeOpen = false
  const gitCalls = []
  const git = args => {
    gitCalls.push(args)
    if (args[0] === 'status') return ''
    if (args[0] === 'fetch') {
      fetched = true
      return ''
    }
    if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD^{commit}') return `${nextCommit}\n`
    if (args[0] === 'rev-parse' && args[1] === '--quiet') {
      if (!mergeOpen) throw new Error('no merge')
      return `${nextCommit}\n`
    }
    if (args[0] === 'cat-file') {
      if (!fetched) throw new Error('missing commit')
      return ''
    }
    if (args[0] === 'merge-base') {
      if (!ancestor) throw new Error('not an ancestor')
      return ''
    }
    if (args[0] === 'merge' && args[1] === '--no-commit') {
      ancestor = true
      mergeOpen = true
      writeJson(join(fixture.root, 'package.json'), { name: '@deepseek-ai/dsh-root', version: nextVersion })
      return ''
    }
    if (args[0] === 'merge' && args[1] === '--abort') {
      assert.equal(mergeOpen, true)
      ancestor = false
      mergeOpen = false
      writeJson(join(fixture.root, 'package.json'), { name: '@deepseek-ai/dsh-root', version: oldVersion })
      return ''
    }
    throw new Error(`unexpected git call: ${args.join(' ')}`)
  }

  const result = await syncDshUpstream({
    repositoryRoot: fixture.root,
    productRoot: fixture.product,
    fetchImpl: releaseFetch(),
    git,
  })
  assert.equal(result.updates[0].to, nextVersion)
  const pluginPolicy = JSON.parse(readFileSync(join(fixture.product, 'plugin-update-policy.json'), 'utf8'))
  assert.equal(pluginPolicy.plugins[0].peerOverrides['1.0.0']['@deepseek-ai/dsh-*'], nextVersion)
  const personal = JSON.parse(readFileSync(join(fixture.personal, 'package.json'), 'utf8'))
  assert.equal(personal.peerDependencies['@deepseek-ai/dsh-settings'], nextVersion)
  const provenance = JSON.parse(readFileSync(join(fixture.product, 'DSH_UPSTREAM.json'), 'utf8'))
  assert.equal(provenance.version, nextVersion)
  assert.equal(provenance.commit, nextCommit)
  assert.equal(mergeOpen, true)

  result.rollback()
  assert.equal(mergeOpen, false)
  assert.equal(JSON.parse(readFileSync(join(fixture.root, 'package.json'), 'utf8')).version, oldVersion)
  for (const path of paths) assert.equal(readFileSync(path, 'utf8'), before.get(path))
  assert.ok(gitCalls.some(args => args[0] === 'fetch'))
  assert.ok(gitCalls.some(args => args[0] === 'merge' && args[1] === '--abort'))
})
