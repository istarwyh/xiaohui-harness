import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  applyApprovedPeerOverrides,
  assertBundledProductPeerLinks,
  readLockImporterVersions,
  validateProductPlugin,
} from './product-plugin-compatibility.mjs'

function fixturePlugin(root, overrides = {}) {
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(join(root, 'LICENSE'), 'MIT\n')
  writeFileSync(join(root, 'cordis.patch.yml'), '- id: fixture\n')
  writeFileSync(join(root, 'lib', 'index.js'), 'export default {}\n')
  writeFileSync(join(root, 'lib', 'client.js'), 'export default {}\n')
  const manifest = {
    name: 'fixture-plugin',
    version: '1.0.0',
    license: 'MIT',
    main: './lib/index.js',
    engines: { node: '>=22' },
    peerDependencies: { '@deepseek-ai/dsh-tools': '^0.1.1-rc.1' },
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
      client: { inject: ['@deepseek-ai/dsh-client-runtime'] },
    },
    ...overrides,
  }
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

test('approved peer overrides are exact-version metadata changes', () => {
  const manifest = {
    name: 'fixture-plugin',
    version: '1.2.3',
    peerDependencies: {
      '@deepseek-ai/dsh-tools': '^0.1.0-rc.8',
      react: '^18.0.0',
    },
  }
  const changes = applyApprovedPeerOverrides(manifest, {
    peerOverrides: { '1.2.3': { '@deepseek-ai/dsh-*': '0.1.1-rc.1' } },
  })
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-tools'], '0.1.1-rc.1')
  assert.equal(manifest.peerDependencies.react, '^18.0.0')
  assert.equal(changes.length, 1)
  assert.deepEqual(applyApprovedPeerOverrides({ ...manifest, version: '1.2.4' }, {
    peerOverrides: { '1.2.3': { '@deepseek-ai/dsh-*': '0.1.1-rc.1' } },
  }), [])
})

test('product compatibility rejects a peer range that excludes the bundled prerelease', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-plugin-compat-'))
  try {
    fixturePlugin(root, {
      peerDependencies: { '@deepseek-ai/dsh-tools': '>=0.1.0-rc.6' },
    })
    const workspace = new Map([
      ['@deepseek-ai/dsh-tools', { version: '0.1.1-rc.1', root: '/tools' }],
      ['@deepseek-ai/dsh-client-runtime', { version: '0.1.1-rc.1', root: '/runtime' }],
    ])
    assert.throws(
      () => validateProductPlugin(root, { package: 'fixture-plugin' }, workspace, '22.19.0'),
      /requires @deepseek-ai\/dsh-tools@>=0\.1\.0-rc\.6/,
    )
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('product compatibility accepts matching peers and rejects bundled DSH dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-plugin-compat-'))
  try {
    fixturePlugin(root)
    const workspace = new Map([
      ['@deepseek-ai/dsh-tools', { version: '0.1.1-rc.1', root: '/tools' }],
      ['@deepseek-ai/dsh-client-runtime', { version: '0.1.1-rc.1', root: '/runtime' }],
    ])
    assert.equal(
      validateProductPlugin(root, { package: 'fixture-plugin' }, workspace, '22.19.0').version,
      '1.0.0',
    )
    fixturePlugin(root, { dependencies: { '@deepseek-ai/dsh-tools': '0.1.1-rc.1' } })
    assert.throws(
      () => validateProductPlugin(root, { package: 'fixture-plugin' }, workspace, '22.19.0'),
      /must be a peer/,
    )
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('product compatibility rejects manifest entries outside the plugin snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-plugin-compat-'))
  try {
    fixturePlugin(root, { main: join(root, 'lib', 'index.js') })
    const workspace = new Map([
      ['@deepseek-ai/dsh-tools', { version: '0.1.1-rc.1', root: '/tools' }],
      ['@deepseek-ai/dsh-client-runtime', { version: '0.1.1-rc.1', root: '/runtime' }],
    ])
    assert.throws(
      () => validateProductPlugin(root, { package: 'fixture-plugin' }, workspace, '22.19.0'),
      /absolute package entry is not allowed/,
    )
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('lock importer parsing and peer-link gate reject a registry DSH copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-product-lock-'))
  const product = join(root, 'packages', 'product', 'fixture')
  const tools = join(root, 'packages', 'core', 'tools')
  try {
    mkdirSync(product, { recursive: true })
    mkdirSync(tools, { recursive: true })
    writeFileSync(join(product, 'package.json'), JSON.stringify({
      name: 'fixture-plugin',
      version: '1.0.0',
      peerDependencies: { '@deepseek-ai/dsh-tools': '^0.1.1-rc.1' },
    }))
    writeFileSync(join(tools, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-tools',
      version: '0.1.1-rc.1',
    }))
    const linked = `lockfileVersion: '9.0'\n\nimporters:\n\n  packages/product/fixture:\n    dependencies:\n      '@deepseek-ai/dsh-tools':\n        specifier: ^0.1.1-rc.1\n        version: link:../../core/tools\n\npackages:\n`
    writeFileSync(join(root, 'pnpm-lock.yaml'), linked)
    assert.equal(readLockImporterVersions(linked, 'packages/product/fixture').get('@deepseek-ai/dsh-tools'), 'link:../../core/tools')
    assert.equal(assertBundledProductPeerLinks(root), 1)

    writeFileSync(join(root, 'pnpm-lock.yaml'), linked.replace('link:../../core/tools', '0.1.0-rc.8'))
    assert.throws(() => assertBundledProductPeerLinks(root), /outside the bundled workspace/)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
