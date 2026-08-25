/**
 * Build the self-contained Harbor Python runtime bundled by XiaoHui Harness.
 *
 * The committed product plugin already contains its Skill. This script adds
 * portable CPython and the matching Harbor adapter so end users do not need
 * Python, uv, or a separate plugin installation.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outRoot = join(desktopRoot, 'bundled', 'xiaohui-runtime')
const manifestPath = join(outRoot, 'manifest.json')
const pythonVersion = '3.12.14'
const integrationVersion = '0.7.3'
const vendoredPythonSource = join(desktopRoot, 'product', 'harbor-python')
const ignoredSourceDirectories = new Set(['.git', '.pytest_cache', '.venv', '__pycache__', 'dist'])
const ignoredSourceFiles = new Set(['.DS_Store', 'uv.lock'])

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`)
  }
}

export function sourceDigest(root) {
  const hash = createHash('sha256')
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredSourceDirectories.has(entry.name)) visit(path)
      }
      else if (entry.isFile()) {
        if (ignoredSourceFiles.has(entry.name) || entry.name.endsWith('.pyc')) continue
        hash.update(relative(root, path))
        hash.update('\0')
        hash.update(readFileSync(path))
        hash.update('\0')
      }
    }
  }
  visit(root)
  return hash.digest('hex')
}

function runtimeId(pythonSpec, sourceId) {
  return createHash('sha256')
    .update(JSON.stringify({ layoutVersion: 2, platform: process.platform, arch: process.arch, pythonVersion, pythonSpec, sourceId }))
    .digest('hex')
}

function readManifest() {
  if (!existsSync(manifestPath)) return undefined
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  }
  catch {
    return undefined
  }
}

function findPythonHome(root) {
  const entry = readdirSync(root, { withFileTypes: true })
    .find(item => item.isDirectory() && item.name.startsWith(`cpython-${pythonVersion}`))
  if (!entry) throw new Error(`uv did not create a CPython ${pythonVersion} runtime under ${root}`)
  return join(root, entry.name)
}

function removeAbsolutePythonAlias(root) {
  const alias = join(root, `cpython-${pythonVersion}-macos-aarch64-none`)
  if (existsSync(alias) && lstatSync(alias).isSymbolicLink() && readlinkSync(alias).startsWith('/')) {
    unlinkSync(alias)
  }
}

function makePythonLinkRelative(venv, pythonHome) {
  const link = join(venv, 'bin', 'python')
  if (!lstatSync(link).isSymbolicLink()) return
  const target = readlinkSync(link)
  if (!target.startsWith('/')) return
  unlinkSync(link)
  symlinkSync(relative(dirname(link), join(pythonHome, 'bin', 'python3.12')), link)
}

export function makePythonEntryPointRelocatable(entryPoint, runtimeRoot, pythonHome) {
  const source = readFileSync(entryPoint, 'utf8')
  const lines = source.split('\n')
  if (lines[0] !== '#!/bin/sh' || !lines[1]?.startsWith("'''exec' ")) {
    throw new Error(`unexpected Python entry point wrapper: ${entryPoint}`)
  }

  const relativePythonHome = relative(runtimeRoot, pythonHome)
  lines[1] = `'''exec' env PYTHONHOME="$(dirname -- "$(dirname -- "$(dirname -- "$(realpath -- "$0")")")")/${relativePythonHome}" "$(dirname -- "$(realpath -- "$0")")/python" "$0" "$@"`
  writeFileSync(entryPoint, lines.join('\n'))
}

function main() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error(`XiaoHui Harness supports macOS arm64 only; received ${process.platform}-${process.arch}`)
  }

  const override = process.env.XIAOHUI_HARBOR_PYTHON_SOURCE
  const pythonSpec = override || vendoredPythonSource
  if (!override && !existsSync(join(vendoredPythonSource, 'pyproject.toml'))) {
    throw new Error(`vendored Harbor Python source missing: ${vendoredPythonSource}`)
  }
  const sourceId = override ? override : sourceDigest(vendoredPythonSource)
  const id = runtimeId(pythonSpec, sourceId)
  const current = readManifest()
  if (current?.runtimeId === id
    && existsSync(join(outRoot, 'venv', 'bin', 'harbor'))
    && existsSync(join(outRoot, 'venv', 'bin', 'harbor-dsh'))) {
    console.log(`prepare-xiaohui-runtime: reuse ${outRoot}`)
    return
  }

  rmSync(outRoot, { recursive: true, force: true })
  mkdirSync(outRoot, { recursive: true })
  const pythonInstallRoot = join(outRoot, 'python')
  run('uv', ['python', 'install', pythonVersion, '--install-dir', pythonInstallRoot, '--no-bin', '--compile-bytecode'])
  const pythonHome = findPythonHome(pythonInstallRoot)
  const venv = join(outRoot, 'venv')
  run('uv', ['venv', '--python', join(pythonHome, 'bin', 'python3.12'), '--relocatable', '--seed', venv])
  run('uv', ['pip', 'install', '--python', join(venv, 'bin', 'python'), pythonSpec])
  makePythonLinkRelative(venv, pythonHome)
  for (const entryPoint of ['harbor', 'harbor-dsh']) {
    makePythonEntryPointRelocatable(join(venv, 'bin', entryPoint), outRoot, pythonHome)
  }
  removeAbsolutePythonAlias(pythonInstallRoot)

  const manifest = {
    product: 'XiaoHui Harness',
    runtimeId: id,
    platform: process.platform,
    arch: process.arch,
    pythonVersion,
    integrationVersion,
    integrationSource: override ? 'override' : 'vendored-source',
    pythonDirectory: relative(outRoot, pythonHome),
    harborBin: 'venv/bin/harbor',
    harborDshBin: 'venv/bin/harbor-dsh',
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`prepare-xiaohui-runtime: wrote ${outRoot}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
