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
import { parse as parseToml } from 'smol-toml'

import { verifyExternalSnapshot } from './bundle-harness-source.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outRoot = join(desktopRoot, 'bundled', 'xiaohui-runtime')
const manifestPath = join(outRoot, 'manifest.json')
const pythonVersion = '3.12.14'
const vendoredPythonSource = join(desktopRoot, 'product', 'harbor-python')
const vendoredNodeManifest = join(desktopRoot, 'product', 'harbor-evolution', 'package.json')
const ignoredSourceDirectories = new Set(['.git', '.pytest_cache', '.venv', '__pycache__', 'dist'])
const ignoredSourceFiles = new Set(['.DS_Store', 'uv.lock'])

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`)
  }
}

/**
 * Parse the name and version declared by a Python project's `[project]` table.
 *
 * @param {string} source
 * @param {string} [sourceLabel]
 * @returns {{ name: string, version: string }}
 */
export function readPythonProjectMetadata(source, sourceLabel = 'pyproject.toml') {
  let document
  try {
    document = parseToml(source)
  }
  catch (error) {
    throw new Error(`invalid TOML in ${sourceLabel}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const project = document.project
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error(`[project] table missing in ${sourceLabel}`)
  }
  if (typeof project.name !== 'string' || project.name.length === 0) {
    throw new Error(`[project].name missing in ${sourceLabel}`)
  }
  if (typeof project.version !== 'string' || project.version.length === 0) {
    throw new Error(`[project].version missing in ${sourceLabel}`)
  }
  return { name: project.name, version: project.version }
}

/**
 * Read the paired XiaoHui Harbor snapshots and return their shared version.
 *
 * @param {object} [paths]
 * @param {string} [paths.nodeManifestPath]
 * @param {string} [paths.pythonProjectPath]
 * @returns {string}
 */
export function deriveHarborIntegrationVersion({
  nodeManifestPath = vendoredNodeManifest,
  pythonProjectPath = join(vendoredPythonSource, 'pyproject.toml'),
} = {}) {
  let nodeManifest
  try {
    nodeManifest = JSON.parse(readFileSync(nodeManifestPath, 'utf8'))
  }
  catch (error) {
    throw new Error(
      `invalid Harbor Node manifest ${nodeManifestPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (nodeManifest.name !== 'dsh-harbor-evolution') {
    throw new Error(`expected dsh-harbor-evolution, found ${String(nodeManifest.name || 'unnamed package')}`)
  }
  if (typeof nodeManifest.version !== 'string' || nodeManifest.version.length === 0) {
    throw new Error(`dsh-harbor-evolution version missing: ${nodeManifestPath}`)
  }

  const pythonProject = readPythonProjectMetadata(
    readFileSync(pythonProjectPath, 'utf8'),
    pythonProjectPath,
  )
  if (pythonProject.name !== 'harbor-dsh-evolution') {
    throw new Error(`expected harbor-dsh-evolution, found ${pythonProject.name}`)
  }
  if (pythonProject.version !== nodeManifest.version) {
    throw new Error(
      `Harbor product versions differ: dsh-harbor-evolution@${nodeManifest.version} and harbor-dsh-evolution@${pythonProject.version}`,
    )
  }
  return nodeManifest.version
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

function runtimeId(pythonSpec, sourceId, integrationVersion) {
  return createHash('sha256')
    .update(JSON.stringify({ layoutVersion: 2, platform: process.platform, arch: process.arch, pythonVersion, pythonSpec, sourceId, integrationVersion }))
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
  const overrideProject = override ? join(resolve(override), 'pyproject.toml') : undefined
  const overrideMetadata = overrideProject && existsSync(overrideProject)
    ? readPythonProjectMetadata(readFileSync(overrideProject, 'utf8'), overrideProject)
    : undefined
  if (overrideMetadata && overrideMetadata.name !== 'harbor-dsh-evolution') {
    throw new Error(`expected harbor-dsh-evolution, found ${overrideMetadata.name}`)
  }
  const integrationVersion = overrideMetadata?.version
    || (override ? 'override' : deriveHarborIntegrationVersion())
  if (!override) {
    const provenancePath = join(vendoredPythonSource, 'XIAOHUI_UPSTREAM.json')
    if (!existsSync(provenancePath)) {
      throw new Error(`vendored Harbor Python provenance missing: ${provenancePath}`)
    }
    verifyExternalSnapshot(vendoredPythonSource, {
      name: 'harbor-dsh-evolution',
      version: integrationVersion,
    })
  }
  const sourceId = overrideMetadata ? sourceDigest(resolve(override)) : (override || sourceDigest(vendoredPythonSource))
  const id = runtimeId(pythonSpec, sourceId, integrationVersion)
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
