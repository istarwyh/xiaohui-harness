import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { snapshotCandidate } from '../lib/candidate.js'

async function candidate() {
  const root = await mkdtemp(path.join(tmpdir(), 'xiaohui-candidate-'))
  await writeFile(path.join(root, 'cordis.yml'), '- id: acp-agent\n  name: app\n')
  await writeFile(path.join(root, 'package.json'), '{"name":"candidate","version":"1.0.0"}\n')
  await writeFile(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n')
  return root
}

test('reserves the Harbor runtime directory outside the immutable Candidate', async (t) => {
  const root = await candidate()
  t.after(() => rm(root, { recursive: true }))
  await mkdir(path.join(root, '.harbor-runtime'))
  await assert.rejects(snapshotCandidate(root), /reserved \.harbor-runtime path/)
})
