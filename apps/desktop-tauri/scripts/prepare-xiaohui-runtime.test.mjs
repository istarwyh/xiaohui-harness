import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { makePythonEntryPointRelocatable } from './prepare-xiaohui-runtime.mjs'

test('Python entry points resolve PYTHONHOME after the runtime moves', {
  skip: process.platform === 'win32',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-runtime-wrapper-'))
  const original = join(root, 'build location', 'xiaohui-runtime')
  const relocated = join(root, 'installed location', 'xiaohui-runtime')
  const pythonHomeRelative = join('python', 'cpython-3.12.14-macos-aarch64-none')
  const pythonHome = join(original, pythonHomeRelative)
  const bin = join(original, 'venv', 'bin')
  const python = join(bin, 'python')
  const entryPoint = join(bin, 'harbor-dsh')

  try {
    mkdirSync(pythonHome, { recursive: true })
    mkdirSync(bin, { recursive: true })
    writeFileSync(python, '#!/bin/sh\nprintf \'%s\\n\' "$PYTHONHOME"\n')
    writeFileSync(entryPoint, [
      '#!/bin/sh',
      "'''exec' /nonexistent/python \"$0\" \"$@\"",
      "' '''",
      'print("not reached by the fake Python")',
      '',
    ].join('\n'))
    chmodSync(python, 0o755)
    chmodSync(entryPoint, 0o755)

    makePythonEntryPointRelocatable(entryPoint, original, pythonHome)
    assert.match(readFileSync(entryPoint, 'utf8'), /env PYTHONHOME=/)

    mkdirSync(join(root, 'installed location'), { recursive: true })
    renameSync(original, relocated)
    const result = spawnSync(join(relocated, 'venv', 'bin', 'harbor-dsh'), {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), realpathSync(join(relocated, pythonHomeRelative)))
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
