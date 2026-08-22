import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Require every desktop version source and the optional release tag to name
 * one immutable artifact version.
 *
 * @param {{ packageVersion: string, tauriVersion: string, cargoVersion: string, notesVersion: string, iconVersion: string, tag?: string }} input
 */
export function validateReleaseVersions(input) {
  const versions = [
    ['package.json', input.packageVersion],
    ['tauri.conf.json', input.tauriVersion],
    ['Cargo.toml', input.cargoVersion],
    ['release-notes.md', input.notesVersion],
    ['icon resource', input.iconVersion],
  ]
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.packageVersion)) {
    throw new Error(`invalid desktop version: ${input.packageVersion}`)
  }
  const mismatches = versions.filter(([, version]) => version !== input.packageVersion)
  if (mismatches.length > 0) {
    throw new Error(`desktop version mismatch: ${mismatches.map(([source, version]) => `${source}=${version}`).join(', ')}`)
  }
  const expectedTag = `xiaohui-v${input.packageVersion}`
  if (input.tag !== undefined && input.tag !== expectedTag) {
    throw new Error(`release tag mismatch: expected ${expectedTag}, found ${input.tag}`)
  }
  return { version: input.packageVersion, expectedTag }
}

function capture(text, pattern, source) {
  const value = pattern.exec(text)?.[1]
  if (value === undefined) throw new Error(`cannot read desktop version from ${source}`)
  return value
}

export function verifyReleaseVersion(tag) {
  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
  const tauri = JSON.parse(readFileSync(join(desktopRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
  const cargo = readFileSync(join(desktopRoot, 'src-tauri', 'Cargo.toml'), 'utf8')
  const notes = readFileSync(join(desktopRoot, 'release-notes.md'), 'utf8')
  const iconDestination = tauri.bundle?.resources?.['icons/icon.ico'] ?? ''
  return validateReleaseVersions({
    packageVersion: manifest.version,
    tauriVersion: tauri.version,
    cargoVersion: capture(cargo, /^version\s*=\s*"([^"]+)"/m, 'Cargo.toml'),
    notesVersion: capture(notes, /^# XiaoHui Harness ([^\s]+)$/m, 'release-notes.md'),
    iconVersion: capture(iconDestination, /xiaohui-harness-icon-([^.]+\.[^.]+\.[^.]+)\.ico$/, 'icon resource'),
    ...(tag === undefined ? {} : { tag }),
  })
}

function parseTag(argv) {
  if (argv[0] === '--') argv = argv.slice(1)
  if (argv.length === 0) return undefined
  if (argv.length === 2 && argv[0] === '--tag') return argv[1]
  throw new Error('usage: node verify-release-version.mjs [--tag xiaohui-vX.Y.Z]')
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) {
  const result = verifyReleaseVersion(parseTag(process.argv.slice(2)))
  console.log(`verify-release-version: ${result.expectedTag}`)
}
