/** Sync an allowlisted Harbor plugin snapshot into the XiaoHui product source. */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const nodeDestination = join(desktopRoot, 'product', 'harbor-evolution')
const pythonDestination = join(desktopRoot, 'product', 'harbor-python')
const args = process.argv.slice(2).filter(value => value !== '--')
const sourceArg = args[0] || process.env.XIAOHUI_HARBOR_PLUGIN_SOURCE

if (!sourceArg) {
  throw new Error('usage: node scripts/sync-product-plugin.mjs <packages/dsh-plugin>')
}

const source = resolve(sourceArg)
const pythonSource = resolve(
  args[1]
    || process.env.XIAOHUI_HARBOR_PYTHON_SOURCE_DIR
    || join(dirname(source), 'harbor-plugin'),
)
const manifestPath = join(source, 'package.json')
if (!existsSync(manifestPath)) throw new Error(`plugin package.json missing: ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.name !== 'dsh-harbor-evolution') {
  throw new Error(`expected dsh-harbor-evolution, found ${manifest.name || 'unnamed package'}`)
}

const entries = [
  'package.json',
  'index.js',
  'cordis.patch.yml',
  'README.md',
  'LICENSE',
  'lib',
  'bin',
  'skills',
]

function preserveTranslations(destination) {
  return ['README.zh.md', 'README.i18n.yaml']
    .filter(name => existsSync(join(destination, name)))
    .map(name => [name, readFileSync(join(destination, name))])
}

function restoreTranslations(destination, translations) {
  for (const [name, content] of translations) writeFileSync(join(destination, name), content)
}

function ensureEnglishSwitcher(destination) {
  const readme = join(destination, 'README.md')
  const source = readFileSync(readme, 'utf8')
  if (source.includes('[中文](README.zh.md)')) return
  const firstBreak = source.indexOf('\n')
  const updated = `${source.slice(0, firstBreak)}\n\nEnglish | [中文](README.zh.md)${source.slice(firstBreak)}`
  writeFileSync(readme, updated)
}
for (const entry of entries) {
  if (!existsSync(join(source, entry))) throw new Error(`plugin artifact missing: ${join(source, entry)}`)
}

const nodeTranslations = preserveTranslations(nodeDestination)
rmSync(nodeDestination, { recursive: true, force: true })
mkdirSync(nodeDestination, { recursive: true })
for (const entry of entries) {
  cpSync(join(source, entry), join(nodeDestination, entry), { recursive: true })
}
restoreTranslations(nodeDestination, nodeTranslations)
ensureEnglishSwitcher(nodeDestination)

const pythonEntries = ['pyproject.toml', 'README.md', 'LICENSE', 'src']
for (const entry of pythonEntries) {
  if (!existsSync(join(pythonSource, entry))) {
    throw new Error(`Python integration artifact missing: ${join(pythonSource, entry)}`)
  }
}
const pythonProject = readFileSync(join(pythonSource, 'pyproject.toml'), 'utf8')
if (!pythonProject.includes('name = "harbor-dsh-evolution"')) {
  throw new Error(`expected harbor-dsh-evolution Python project: ${pythonSource}`)
}

const pythonTranslations = preserveTranslations(pythonDestination)
rmSync(pythonDestination, { recursive: true, force: true })
mkdirSync(pythonDestination, { recursive: true })
for (const entry of pythonEntries) {
  cpSync(join(pythonSource, entry), join(pythonDestination, entry), { recursive: true })
}
restoreTranslations(pythonDestination, pythonTranslations)
ensureEnglishSwitcher(pythonDestination)
rmSync(join(pythonDestination, 'src', 'harbor_dsh_evolution', '__pycache__'), {
  recursive: true,
  force: true,
})

console.log(`sync-product-plugin: ${manifest.name}@${manifest.version} -> ${nodeDestination}`)
console.log(`sync-product-plugin: harbor-dsh-evolution -> ${pythonDestination}`)
