/** Download and verify the fixed macOS arm64 Node/pnpm first-run toolchain. */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outRoot = join(desktopRoot, 'bundled', 'toolchain')

export const TOOLCHAIN_ARTIFACTS = [
  {
    file: 'node-v22.19.0-darwin-arm64.tar.gz',
    url: 'https://nodejs.org/dist/v22.19.0/node-v22.19.0-darwin-arm64.tar.gz',
    algorithm: 'sha256',
    encoding: 'hex',
    digest: 'c59006db713c770d6ec63ae16cb3edc11f49ee093b5c415d667bb4f436c6526d',
  },
  {
    file: 'pnpm-11.7.0.tgz',
    url: 'https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz',
    algorithm: 'sha512',
    encoding: 'base64',
    digest: 'GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA==',
  },
]

export function artifactMatches(bytes, artifact) {
  return createHash(artifact.algorithm).update(bytes).digest(artifact.encoding) === artifact.digest
}

async function ensureArtifact(artifact) {
  const destination = join(outRoot, artifact.file)
  if (existsSync(destination) && artifactMatches(readFileSync(destination), artifact)) return destination
  rmSync(destination, { force: true })

  const response = await fetch(artifact.url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`toolchain download failed: ${artifact.url} (${response.status})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!artifactMatches(bytes, artifact)) {
    throw new Error(`toolchain integrity mismatch: ${artifact.file}`)
  }
  const partial = `${destination}.part`
  writeFileSync(partial, bytes)
  renameSync(partial, destination)
  return destination
}

export async function prepareManagedToolchain() {
  mkdirSync(outRoot, { recursive: true })
  for (const artifact of TOOLCHAIN_ARTIFACTS) await ensureArtifact(artifact)
  const manifest = {
    platform: 'darwin-arm64',
    nodeVersion: '22.19.0',
    pnpmVersion: '11.7.0',
    artifacts: TOOLCHAIN_ARTIFACTS.map(({ file, url, algorithm, encoding, digest }) => ({
      file, url, algorithm, encoding, digest,
    })),
  }
  writeFileSync(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`prepare-managed-toolchain: wrote ${outRoot}`)
  return manifest
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) await prepareManagedToolchain()
