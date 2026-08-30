import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertCurrentDshRelease,
  assertRecordedDshRelease,
  resolveAllowedDshRelease,
  selectAllowedDshRelease,
  validateDshProvenance,
  validateDshUpdatePolicy,
} from './dsh-release-policy.mjs'

function policy(overrides = {}) {
  return validateDshUpdatePolicy({
    formatVersion: 1,
    repository: 'deepseek-ai/deepseek-harness',
    channel: 'stable-else-rc',
    tagPrefix: 'dsh-v',
    firstPartyPeerPackages: ['personal-workbench'],
    ...overrides,
  })
}

function release(version, overrides = {}) {
  return {
    draft: false,
    prerelease: version.includes('-'),
    tag_name: `dsh-v${version}`,
    html_url: `https://example.test/${version}`,
    ...overrides,
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('DSH policy accepts only the stable-else-RC channel and safe package directories', () => {
  assert.equal(policy().channel, 'stable-else-rc')
  assert.throws(() => policy({ channel: 'latest-prerelease' }), /channel must be stable-else-rc/)
  assert.throws(() => policy({ repository: 'https://github.com/deepseek-ai/deepseek-harness' }), /owner\/repository/)
  assert.throws(() => policy({ firstPartyPeerPackages: ['../escape'] }), /is invalid/)
  assert.throws(() => policy({ firstPartyPeerPackages: ['same', 'same'] }), /duplicate/)
})

test('DSH release selection prefers the highest stable and otherwise the highest RC', () => {
  assert.deepEqual(
    selectAllowedDshRelease(policy(), [
      release('0.3.0-alpha.1'),
      release('0.2.0-rc.2'),
      release('0.1.0'),
      release('0.2.0-rc.1'),
    ]),
    {
      tag: 'dsh-v0.1.0',
      version: '0.1.0',
      channel: 'stable',
      htmlUrl: 'https://example.test/0.1.0',
    },
  )
  assert.equal(
    selectAllowedDshRelease(policy(), [
      release('0.2.0-alpha.1'),
      release('0.1.1-rc.1'),
      release('0.1.1-rc.2'),
      release('0.1.2-beta.1'),
    ]).version,
    '0.1.1-rc.2',
  )
  assert.equal(
    selectAllowedDshRelease(policy(), [
      release('0.1.0', { prerelease: true }),
      release('0.1.1-rc.1'),
    ]).version,
    '0.1.1-rc.1',
  )
  assert.throws(
    () => selectAllowedDshRelease(policy(), [release('0.2.0-alpha.1'), release('0.2.0-beta.1')]),
    /no official stable or RC Release/,
  )
})

test('DSH release resolution pins an annotated GitHub tag to its commit', async () => {
  const tagObject = 'a'.repeat(40)
  const commit = 'b'.repeat(40)
  const requests = []
  const selected = await resolveAllowedDshRelease(policy(), async url => {
    requests.push(url)
    if (url.endsWith('/releases?per_page=100')) {
      return jsonResponse([release('0.1.2-alpha.1'), release('0.1.1-rc.2')])
    }
    if (url.includes('/git/ref/tags/')) {
      return jsonResponse({ object: { type: 'tag', sha: tagObject } })
    }
    return jsonResponse({ object: { type: 'commit', sha: commit } })
  })
  assert.deepEqual(selected, {
    tag: 'dsh-v0.1.1-rc.2',
    version: '0.1.1-rc.2',
    channel: 'rc',
    htmlUrl: 'https://example.test/0.1.1-rc.2',
    repository: 'deepseek-ai/deepseek-harness',
    commit,
  })
  assert.equal(requests.length, 3)
})

test('recorded and live DSH checks reject stale versions, provenance, and ancestry', () => {
  const selectedPolicy = policy()
  const commit = 'c'.repeat(40)
  const provenance = validateDshProvenance({
    repository: selectedPolicy.repository,
    channel: selectedPolicy.channel,
    tag: 'dsh-v0.1.1-rc.2',
    version: '0.1.1-rc.2',
    commit,
  })
  assert.doesNotThrow(() => assertRecordedDshRelease({
    policy: selectedPolicy,
    provenance,
    currentVersion: '0.1.1-rc.2',
  }))
  assert.doesNotThrow(() => assertCurrentDshRelease({
    currentVersion: '0.1.1-rc.2',
    provenance,
    release: {
      repository: provenance.repository,
      tag: provenance.tag,
      version: provenance.version,
      commit,
      channel: 'rc',
    },
    isAncestor: true,
  }))
  assert.throws(
    () => assertCurrentDshRelease({
      currentVersion: '0.1.1-rc.1',
      provenance: { ...provenance, tag: 'dsh-v0.1.1-rc.1', version: '0.1.1-rc.1' },
      release: { repository: provenance.repository, tag: provenance.tag, version: provenance.version, commit, channel: 'rc' },
      isAncestor: false,
    }),
    /is not the selected rc Release/,
  )
  assert.throws(
    () => assertCurrentDshRelease({
      currentVersion: '0.1.1-rc.2',
      provenance,
      release: { repository: provenance.repository, tag: provenance.tag, version: provenance.version, commit, channel: 'rc' },
      isAncestor: false,
    }),
    /is not an ancestor/,
  )
})
