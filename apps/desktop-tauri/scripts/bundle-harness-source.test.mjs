import assert from 'node:assert/strict'
import test from 'node:test'

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildTrimmedWorkspaceYaml,
  hashExternalSnapshot,
  installProductPlugins,
} from './bundle-harness-source.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function productVersion(directory) {
  return JSON.parse(readFileSync(join(desktopRoot, 'product', directory, 'package.json'), 'utf8')).version
}

test('buildTrimmedWorkspaceYaml keeps upstream patch and build declarations verbatim', () => {
  const source = `packages:
  - vendor/*
  - packages/*/*
  - apps/*
  - examples
  - python/sdk-runtime

linkWorkspacePackages: true

overrides:
  '@deepseek-ai/cosmokit': 'link:vendor/cosmokit'

allowBuilds:
  esbuild: true
  node-pty: true

patchedDependencies:
  node-pty@1.2.0-beta.15: patches/node-pty@1.2.0-beta.15.patch
`
  const trimmed = buildTrimmedWorkspaceYaml(source)

  assert.match(trimmed, /^packages:\n(?:  - .*\n)+/)
  for (const name of ['vendor/*', 'packages/*/*', 'native/landlock-run', 'apps/cli', 'apps/web']) {
    assert.ok(trimmed.includes(`  - ${name}\n`), `trimmed packages must include ${name}`)
  }
  assert.ok(!trimmed.includes('apps/*'))
  assert.ok(!trimmed.includes('examples'))

  assert.ok(
    trimmed.includes('  node-pty@1.2.0-beta.15: patches/node-pty@1.2.0-beta.15.patch\n'),
    'patchedDependencies must be copied from the source workspace, not hardcoded',
  )
  assert.ok(trimmed.includes('allowBuilds:\n  esbuild: true\n  node-pty: true\n'))
  assert.ok(trimmed.includes('linkWorkspacePackages: true\n'))
})

test('buildTrimmedWorkspaceYaml preserves comments after the packages block', () => {
  const source = `# workspace header
packages:
  - apps/*

# Why linkWorkspacePackages is on.
linkWorkspacePackages: true
`
  const trimmed = buildTrimmedWorkspaceYaml(source)

  assert.ok(trimmed.startsWith('# workspace header\n'))
  assert.ok(trimmed.includes('# Why linkWorkspacePackages is on.\n'))
})

test('buildTrimmedWorkspaceYaml rejects a workspace without a packages block', () => {
  assert.throws(() => buildTrimmedWorkspaceYaml('linkWorkspacePackages: true\n'), /packages/)
})

test('hashExternalSnapshot ignores only the XiaoHui provenance sidecar', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-external-plugin-'))
  try {
    writeFileSync(join(root, 'package.json'), '{"name":"example"}\n')
    const before = hashExternalSnapshot(root)
    writeFileSync(join(root, 'XIAOHUI_UPSTREAM.json'), '{"treeSha256":"recorded"}\n')
    assert.equal(hashExternalSnapshot(root), before)
    writeFileSync(join(root, 'package.json'), '{"name":"changed"}\n')
    assert.notEqual(hashExternalSnapshot(root), before)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('installProductPlugins makes every XiaoHui plugin an in-box CLI dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-product-plugin-'))
  const cli = join(root, 'apps', 'cli')
  mkdirSync(cli, { recursive: true })
  writeFileSync(join(cli, 'package.json'), '{"dependencies":{"kept":"1.0.0"}}\n')
  const agent = join(root, 'packages', 'core', 'agent')
  mkdirSync(agent, { recursive: true })
  writeFileSync(join(agent, 'package.json'), '{"name":"@deepseek-ai/dsh-agent","version":"0.1.1-rc.1"}\n')

  try {
    installProductPlugins(root)
    const manifest = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies.kept, '1.0.0')
    assert.equal(manifest.dependencies['dsh-harbor-evolution'], 'workspace:*')
    assert.equal(manifest.dependencies['dsh-codex-auth'], 'workspace:*')
    assert.equal(manifest.dependencies['dsh-better-sidebar'], 'workspace:*')
    assert.equal(manifest.dependencies['dsh-context-doctor'], 'workspace:*')
    assert.equal(manifest.dependencies['dsh-personal-workbench'], 'workspace:*')
    assert.equal(manifest.dependencies['@deepseek-ai/dsh-agent'], 'workspace:*')
    assert.ok(readFileSync(join(root, 'packages', 'product', 'harbor-evolution', 'skills', 'evolve-agent-with-harbor', 'SKILL.md'), 'utf8').length > 0)
    assert.equal(
      JSON.parse(readFileSync(join(root, 'packages', 'product', 'harbor-evolution', 'schemas', 'meta-evaluation-report.schema.json'), 'utf8')).title,
      'Evaluator Meta-Evaluation Report v1',
    )
    for (const [source, destination] of [
      ['harbor-evolution', 'harbor-evolution'],
      ['dsh-codex-auth', 'dsh-codex-auth'],
      ['dsh-better-sidebar', 'dsh-better-sidebar'],
      ['context-doctor', 'context-doctor'],
      ['personal-workbench', 'personal-workbench'],
    ]) {
      assert.equal(
        JSON.parse(readFileSync(join(root, 'packages', 'product', destination, 'package.json'), 'utf8')).version,
        productVersion(source),
      )
    }
    assert.ok(readFileSync(join(root, 'packages', 'product', 'dsh-codex-auth', 'lib', 'client.js'), 'utf8').length > 0)
    assert.ok(readFileSync(join(root, 'packages', 'product', 'dsh-better-sidebar', 'lib', 'client.js'), 'utf8').length > 0)
    assert.ok(readFileSync(join(root, 'packages', 'product', 'context-doctor', 'lib', 'client.js'), 'utf8').length > 0)
    assert.ok(readFileSync(join(root, 'packages', 'product', 'context-doctor', 'lib', 'index.js'), 'utf8').length > 0)
    assert.ok(readFileSync(join(root, 'packages', 'product', 'personal-workbench', 'lib', 'client.js'), 'utf8').length > 0)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
