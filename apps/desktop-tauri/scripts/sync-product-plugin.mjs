/** Sync an allowlisted Harbor plugin snapshot into the XiaoHui product source. */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readPythonProjectMetadata } from './prepare-xiaohui-runtime.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultNodeDestination = join(desktopRoot, 'product', 'harbor-evolution')
const defaultPythonDestination = join(desktopRoot, 'product', 'harbor-python')
const nodeEntries = [
  'package.json',
  'index.js',
  'cordis.patch.yml',
  'README.md',
  'LICENSE',
  'lib',
  'bin',
  'schemas',
  'skills',
]
const pythonEntries = ['pyproject.toml', 'README.md', 'LICENSE', 'src']
const translationEntries = ['README.zh.md', 'README.i18n.yaml']

/**
 * @param {string} destination
 * @returns {Array<[string, Buffer]>}
 */
function readTranslations(destination) {
  return translationEntries
    .filter(name => existsSync(join(destination, name)))
    .map(name => [name, readFileSync(join(destination, name))])
}

/**
 * @param {string} destination
 * @param {Array<[string, Buffer]>} translations
 * @returns {void}
 */
function writeTranslations(destination, translations) {
  for (const [name, content] of translations) writeFileSync(join(destination, name), content)
}

/**
 * @param {string} destination
 * @returns {void}
 */
function ensureEnglishSwitcher(destination) {
  if (!existsSync(join(destination, 'README.zh.md'))) return
  const readme = join(destination, 'README.md')
  const source = readFileSync(readme, 'utf8')
  if (source.includes('[中文](README.zh.md)')) return
  const firstBreak = source.indexOf('\n')
  const insertion = firstBreak === -1 ? source.length : firstBreak
  const updated = `${source.slice(0, insertion)}\n\nEnglish | [中文](README.zh.md)${source.slice(insertion)}`
  writeFileSync(readme, updated)
}

/**
 * @param {string} source
 * @param {string[]} entries
 * @param {string} kind
 * @returns {void}
 */
function requireEntries(source, entries, kind) {
  for (const entry of entries) {
    if (!existsSync(join(source, entry))) {
      throw new Error(`${kind} artifact missing: ${join(source, entry)}`)
    }
  }
}

/**
 * @param {string} source
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function readJson(source, label) {
  try {
    return JSON.parse(readFileSync(source, 'utf8'))
  }
  catch (error) {
    throw new Error(`invalid ${label}: ${source}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Validate both Harbor components before either destination is changed.
 *
 * @param {string} nodeSource
 * @param {string} pythonSource
 * @returns {{ nodeManifest: Record<string, unknown>, version: string }}
 */
function validateSources(nodeSource, pythonSource) {
  requireEntries(nodeSource, nodeEntries, 'plugin')
  requireEntries(pythonSource, pythonEntries, 'Python integration')

  const manifestPath = join(nodeSource, 'package.json')
  const nodeManifest = readJson(manifestPath, 'plugin package.json')
  if (nodeManifest.name !== 'dsh-harbor-evolution') {
    throw new Error(`expected dsh-harbor-evolution, found ${String(nodeManifest.name || 'unnamed package')}`)
  }
  if (typeof nodeManifest.version !== 'string' || nodeManifest.version.length === 0) {
    throw new Error(`dsh-harbor-evolution version missing: ${manifestPath}`)
  }

  const pythonProjectPath = join(pythonSource, 'pyproject.toml')
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
  return { nodeManifest, version: nodeManifest.version }
}

/**
 * @param {string} source
 * @param {string[]} entries
 * @param {string} destination
 * @param {Array<[string, Buffer]>} translations
 * @returns {void}
 */
function stageSnapshot(source, entries, destination, translations) {
  mkdirSync(destination, { recursive: true })
  for (const entry of entries) {
    cpSync(join(source, entry), join(destination, entry), { recursive: true })
  }
  writeTranslations(destination, translations)
  ensureEnglishSwitcher(destination)
}

/**
 * @typedef {object} Replacement
 * @property {string} destination
 * @property {string} root
 * @property {string} next
 * @property {string} previous
 * @property {boolean} hadDestination
 * @property {boolean} installed
 */

/**
 * @param {string} destination
 * @returns {Replacement}
 */
function createReplacement(destination) {
  const parent = dirname(destination)
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, `.${basename(destination)}-sync-`))
  return {
    destination,
    root,
    next: join(root, 'next'),
    previous: join(root, 'previous'),
    hadDestination: existsSync(destination),
    installed: false,
  }
}

/**
 * Replace both destinations and restore the original pair if either rename fails.
 *
 * @param {Replacement[]} replacements
 * @returns {void}
 */
function installReplacements(replacements) {
  try {
    for (const replacement of replacements) {
      if (replacement.hadDestination) {
        renameSync(replacement.destination, replacement.previous)
      }
      renameSync(replacement.next, replacement.destination)
      replacement.installed = true
    }
  }
  catch (error) {
    for (const replacement of [...replacements].reverse()) {
      if (replacement.installed) {
        rmSync(replacement.destination, { recursive: true, force: true })
      }
      if (replacement.hadDestination && existsSync(replacement.previous)) {
        renameSync(replacement.previous, replacement.destination)
      }
    }
    throw error
  }
  finally {
    for (const replacement of replacements) {
      rmSync(replacement.root, { recursive: true, force: true })
    }
  }
}

/**
 * Sync matching Harbor Node and Python snapshots into explicit destinations.
 * Existing XiaoHui translations survive the replacement.
 *
 * @param {object} options
 * @param {string} options.source
 * @param {string} options.pythonSource
 * @param {string} options.nodeDestination
 * @param {string} options.pythonDestination
 * @returns {{ name: string, pythonName: string, version: string, nodeDestination: string, pythonDestination: string }}
 */
export function syncProductPlugin({
  source,
  pythonSource,
  nodeDestination,
  pythonDestination,
}) {
  const nodeSource = resolve(source)
  const python = resolve(pythonSource)
  const nodeTarget = resolve(nodeDestination)
  const pythonTarget = resolve(pythonDestination)
  if (nodeTarget === pythonTarget) {
    throw new Error('Harbor Node and Python destinations must be different directories')
  }
  const { version } = validateSources(nodeSource, python)

  const nodeTranslations = readTranslations(nodeTarget)
  const pythonTranslations = readTranslations(pythonTarget)
  /** @type {Replacement[]} */
  const replacements = []
  try {
    replacements.push(createReplacement(nodeTarget), createReplacement(pythonTarget))
  }
  catch (error) {
    for (const replacement of replacements) {
      rmSync(replacement.root, { recursive: true, force: true })
    }
    throw error
  }
  const [nodeReplacement, pythonReplacement] = replacements

  try {
    stageSnapshot(nodeSource, nodeEntries, nodeReplacement.next, nodeTranslations)
    stageSnapshot(python, pythonEntries, pythonReplacement.next, pythonTranslations)
    rmSync(join(pythonReplacement.next, 'src', 'harbor_dsh_evolution', '__pycache__'), {
      recursive: true,
      force: true,
    })
  }
  catch (error) {
    for (const replacement of replacements) {
      rmSync(replacement.root, { recursive: true, force: true })
    }
    throw error
  }

  installReplacements(replacements)
  return {
    name: 'dsh-harbor-evolution',
    pythonName: 'harbor-dsh-evolution',
    version,
    nodeDestination: nodeTarget,
    pythonDestination: pythonTarget,
  }
}

function main() {
  const args = process.argv.slice(2).filter(value => value !== '--')
  const sourceArg = args[0] || process.env.XIAOHUI_HARBOR_PLUGIN_SOURCE
  if (!sourceArg) {
    throw new Error('usage: node scripts/sync-product-plugin.mjs <packages/dsh-plugin>')
  }
  const nodeSource = resolve(sourceArg)
  const pythonSource = resolve(
    args[1]
      || process.env.XIAOHUI_HARBOR_PYTHON_SOURCE_DIR
      || join(dirname(nodeSource), 'harbor-plugin'),
  )
  const result = syncProductPlugin({
    source: nodeSource,
    pythonSource,
    nodeDestination: defaultNodeDestination,
    pythonDestination: defaultPythonDestination,
  })
  console.log(`sync-product-plugin: ${result.name}@${result.version} -> ${result.nodeDestination}`)
  console.log(`sync-product-plugin: ${result.pythonName}@${result.version} -> ${result.pythonDestination}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
