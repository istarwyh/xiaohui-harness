import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  finalizeOfflineManifest,
  hashTree,
  removeWorkspaceInstallState,
  validateOfflineStoreCache,
} from './prepare-harness-offline-store.mjs'

test('hashTree is stable across directory creation order and changes with bytes', () => {
  const left = mkdtempSync(join(tmpdir(), 'xiaohui-store-left-'))
  const right = mkdtempSync(join(tmpdir(), 'xiaohui-store-right-'))
  try {
    mkdirSync(join(left, 'b'))
    writeFileSync(join(left, 'b', 'two'), '2')
    writeFileSync(join(left, 'one'), '1')
    writeFileSync(join(right, 'one'), '1')
    mkdirSync(join(right, 'b'))
    writeFileSync(join(right, 'b', 'two'), '2')
    assert.deepEqual(hashTree(left), hashTree(right))
    writeFileSync(join(right, 'b', 'two'), 'changed')
    assert.notEqual(hashTree(left).sha256, hashTree(right).sha256)
  }
  finally {
    rmSync(left, { recursive: true, force: true })
    rmSync(right, { recursive: true, force: true })
  }
})

test('finalizeOfflineManifest binds the generated store to the source digest', () => {
  const source = 'a'.repeat(64)
  const store = { files: 42, sha256: 'b'.repeat(64) }
  const archive = 'd'.repeat(64)
  const first = finalizeOfflineManifest({ contentSha256: source }, store, archive)
  const second = finalizeOfflineManifest({ contentSha256: source }, { ...store, sha256: 'c'.repeat(64) }, archive)
  assert.equal(first.sourceSha256, source)
  assert.equal(first.offlineStore.files, 42)
  assert.equal(first.offlineStore.archiveSha256, archive)
  assert.notEqual(first.contentSha256, source)
  assert.notEqual(first.contentSha256, second.contentSha256)
})

test('validateOfflineStoreCache rejects stale or corrupted release caches', () => {
  const lock = 'a'.repeat(64)
  const archive = 'b'.repeat(64)
  const metadata = {
    formatVersion: 1,
    lockSha256: lock,
    files: 35_000,
    storeSha256: 'c'.repeat(64),
    archiveSha256: archive,
  }
  assert.deepEqual(validateOfflineStoreCache(metadata, lock, archive), {
    files: 35_000,
    sha256: 'c'.repeat(64),
  })
  assert.throws(() => validateOfflineStoreCache(metadata, 'd'.repeat(64), archive), /lockfile digest/)
  assert.throws(() => validateOfflineStoreCache(metadata, lock, 'e'.repeat(64)), /archive digest/)
  assert.throws(() => validateOfflineStoreCache({ ...metadata, files: 10 }, lock, archive), /file count/)
})

test('workspace install cleanup preserves the standalone offline Store', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-install-state-'))
  try {
    mkdirSync(join(root, 'node_modules', '.pnpm'), { recursive: true })
    mkdirSync(join(root, 'packages', 'product', 'plugin', 'node_modules', 'dependency'), { recursive: true })
    mkdirSync(join(root, '.xiaohui-pnpm-store', 'v10', 'files'), { recursive: true })
    writeFileSync(join(root, '.xiaohui-pnpm-store', 'v10', 'files', 'kept'), 'store')
    removeWorkspaceInstallState(root)
    assert.equal(existsSync(join(root, 'node_modules')), false)
    assert.equal(existsSync(join(root, 'packages', 'product', 'plugin', 'node_modules')), false)
    assert.equal(existsSync(join(root, '.xiaohui-pnpm-store', 'v10', 'files', 'kept')), true)
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
