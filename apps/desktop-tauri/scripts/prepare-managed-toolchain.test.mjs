import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'

import { artifactMatches, TOOLCHAIN_ARTIFACTS } from './prepare-managed-toolchain.mjs'

test('artifactMatches accepts only the pinned digest', () => {
  const bytes = Buffer.from('xiaohui')
  const artifact = {
    algorithm: 'sha256',
    encoding: 'hex',
    digest: createHash('sha256').update(bytes).digest('hex'),
  }
  assert.equal(artifactMatches(bytes, artifact), true)
  assert.equal(artifactMatches(Buffer.from('changed'), artifact), false)
})

test('managed toolchain pins one macOS arm64 Node and pnpm artifact', () => {
  assert.deepEqual(TOOLCHAIN_ARTIFACTS.map(row => row.file), [
    'node-v22.19.0-darwin-arm64.tar.gz',
    'pnpm-11.7.0.tgz',
  ])
})
