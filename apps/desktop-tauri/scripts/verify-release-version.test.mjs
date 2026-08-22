import assert from 'node:assert/strict'
import test from 'node:test'

import { validateReleaseVersions, verifyReleaseVersion } from './verify-release-version.mjs'

const aligned = {
  packageVersion: '0.2.1',
  tauriVersion: '0.2.1',
  cargoVersion: '0.2.1',
  notesVersion: '0.2.1',
  iconVersion: '0.2.1',
}

test('validateReleaseVersions accepts one aligned desktop version and tag', () => {
  assert.deepEqual(validateReleaseVersions({ ...aligned, tag: 'xiaohui-v0.2.1' }), {
    version: '0.2.1',
    expectedTag: 'xiaohui-v0.2.1',
  })
})

test('validateReleaseVersions rejects source and tag drift', () => {
  assert.throws(
    () => validateReleaseVersions({ ...aligned, cargoVersion: '0.1.0' }),
    /Cargo\.toml=0\.1\.0/,
  )
  assert.throws(
    () => validateReleaseVersions({ ...aligned, tag: 'xiaohui-v0.2.0' }),
    /release tag mismatch/,
  )
})

test('repository desktop version sources are aligned', () => {
  assert.equal(verifyReleaseVersion('xiaohui-v0.2.1').version, '0.2.1')
})
