import assert from 'node:assert/strict'
import test from 'node:test'

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildTrimmedWorkspaceYaml, installProductPlugin } from './bundle-harness-source.mjs'

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

test('installProductPlugin makes Harbor an in-box CLI dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-product-plugin-'))
  const cli = join(root, 'apps', 'cli')
  mkdirSync(cli, { recursive: true })
  writeFileSync(join(cli, 'package.json'), '{"dependencies":{"kept":"1.0.0"}}\n')

  try {
    installProductPlugin(root)
    const manifest = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8'))
    assert.equal(manifest.dependencies.kept, '1.0.0')
    assert.equal(manifest.dependencies['dsh-harbor-evolution'], 'workspace:*')
    assert.ok(readFileSync(join(root, 'packages', 'product', 'harbor-evolution', 'skills', 'evolve-agent-with-harbor', 'SKILL.md'), 'utf8').length > 0)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
