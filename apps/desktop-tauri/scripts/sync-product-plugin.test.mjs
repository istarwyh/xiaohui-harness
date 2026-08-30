import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { syncProductPlugin } from './sync-product-plugin.mjs'

const nodeEntries = ['index.js', 'cordis.patch.yml', 'README.md', 'LICENSE']
const nodeDirectories = ['lib', 'bin', 'schemas', 'skills']

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function createNodeSource(root, { name = 'dsh-harbor-evolution', version = '1.2.3' } = {}) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name, version }, null, 2)}\n`)
  for (const entry of nodeEntries) writeFileSync(join(root, entry), `${entry}\n`)
  for (const entry of nodeDirectories) {
    writeFile(join(root, entry, '.keep'), `${entry}\n`)
  }
}

function createPythonSource(root, { name = 'harbor-dsh-evolution', version = '1.2.3' } = {}) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'pyproject.toml'), `[project]\nname = "${name}"\nversion = "${version}"\n`)
  writeFileSync(join(root, 'README.md'), '# Harbor Python\n')
  writeFileSync(join(root, 'LICENSE'), 'MIT\n')
  writeFile(join(root, 'src', 'harbor_dsh_evolution', '__init__.py'), '__version__ = "fixture"\n')
  writeFile(join(root, 'src', 'harbor_dsh_evolution', '__pycache__', 'module.pyc'), 'cache\n')
}

function createDestination(root, label) {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'old-marker.txt'), `${label} old\n`)
  writeFileSync(join(root, 'README.zh.md'), `${label} 中文\n`)
  writeFileSync(join(root, 'README.i18n.yaml'), `source: ${label}\n`)
}

test('syncProductPlugin replaces a matching pair and preserves XiaoHui translations', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-harbor-sync-'))
  const source = join(root, 'source', 'dsh-plugin')
  const pythonSource = join(root, 'source', 'harbor-plugin')
  const nodeDestination = join(root, 'product', 'harbor-evolution')
  const pythonDestination = join(root, 'product', 'harbor-python')
  try {
    createNodeSource(source)
    createPythonSource(pythonSource)
    createDestination(nodeDestination, 'node')
    createDestination(pythonDestination, 'python')

    const result = syncProductPlugin({ source, pythonSource, nodeDestination, pythonDestination })

    assert.equal(result.version, '1.2.3')
    assert.equal(readFileSync(join(nodeDestination, 'README.zh.md'), 'utf8'), 'node 中文\n')
    assert.equal(readFileSync(join(nodeDestination, 'README.i18n.yaml'), 'utf8'), 'source: node\n')
    assert.match(readFileSync(join(nodeDestination, 'README.md'), 'utf8'), /English \| \[中文]\(README\.zh\.md\)/)
    assert.equal(readFileSync(join(pythonDestination, 'README.zh.md'), 'utf8'), 'python 中文\n')
    assert.match(readFileSync(join(pythonDestination, 'README.md'), 'utf8'), /English \| \[中文]\(README\.zh\.md\)/)
    assert.equal(existsSync(join(nodeDestination, 'old-marker.txt')), false)
    assert.equal(existsSync(join(pythonDestination, 'old-marker.txt')), false)
    assert.equal(
      existsSync(join(pythonDestination, 'src', 'harbor_dsh_evolution', '__pycache__')),
      false,
    )
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('syncProductPlugin validates both package names and their shared version', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-harbor-pair-'))
  const source = join(root, 'source', 'dsh-plugin')
  const pythonSource = join(root, 'source', 'harbor-plugin')
  const nodeDestination = join(root, 'product', 'harbor-evolution')
  const pythonDestination = join(root, 'product', 'harbor-python')
  try {
    createNodeSource(source, { name: 'wrong-node-name' })
    createPythonSource(pythonSource)
    assert.throws(
      () => syncProductPlugin({ source, pythonSource, nodeDestination, pythonDestination }),
      /expected dsh-harbor-evolution/,
    )

    createNodeSource(source)
    createPythonSource(pythonSource, { name: 'wrong-python-name' })
    assert.throws(
      () => syncProductPlugin({ source, pythonSource, nodeDestination, pythonDestination }),
      /expected harbor-dsh-evolution/,
    )

    createPythonSource(pythonSource, { version: '1.2.4' })
    assert.throws(
      () => syncProductPlugin({ source, pythonSource, nodeDestination, pythonDestination }),
      /Harbor product versions differ/,
    )
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('syncProductPlugin rejects a missing artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-harbor-missing-'))
  const source = join(root, 'source', 'dsh-plugin')
  const pythonSource = join(root, 'source', 'harbor-plugin')
  try {
    createNodeSource(source)
    createPythonSource(pythonSource)
    rmSync(join(pythonSource, 'src'), { recursive: true })
    assert.throws(
      () => syncProductPlugin({
        source,
        pythonSource,
        nodeDestination: join(root, 'product', 'harbor-evolution'),
        pythonDestination: join(root, 'product', 'harbor-python'),
      }),
      /Python integration artifact missing/,
    )
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('syncProductPlugin leaves both destinations untouched when validation fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'xiaohui-harbor-atomic-'))
  const source = join(root, 'source', 'dsh-plugin')
  const pythonSource = join(root, 'source', 'harbor-plugin')
  const productRoot = join(root, 'product')
  const nodeDestination = join(productRoot, 'harbor-evolution')
  const pythonDestination = join(productRoot, 'harbor-python')
  try {
    createNodeSource(source)
    createPythonSource(pythonSource, { version: '9.9.9' })
    createDestination(nodeDestination, 'node')
    createDestination(pythonDestination, 'python')
    const entriesBefore = readdirSync(productRoot).sort()

    assert.throws(
      () => syncProductPlugin({ source, pythonSource, nodeDestination, pythonDestination }),
      /Harbor product versions differ/,
    )

    assert.deepEqual(readdirSync(productRoot).sort(), entriesBefore)
    assert.equal(readFileSync(join(nodeDestination, 'old-marker.txt'), 'utf8'), 'node old\n')
    assert.equal(readFileSync(join(pythonDestination, 'old-marker.txt'), 'utf8'), 'python old\n')
    assert.equal(readFileSync(join(nodeDestination, 'README.zh.md'), 'utf8'), 'node 中文\n')
    assert.equal(readFileSync(join(pythonDestination, 'README.zh.md'), 'utf8'), 'python 中文\n')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
