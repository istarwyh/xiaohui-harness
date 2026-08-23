import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const MANIFEST_NAME = 'candidate-manifest.json'
const DIGEST_PREFIX = Buffer.from('harbor-dsh-candidate-v1\0')
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.harbor-runtime'])
const EXCLUDED_FILES = new Set([MANIFEST_NAME, '.DS_Store'])
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']
const CREDENTIAL_FILES = new Set([
  'credentials.json',
  'service-account.json',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
  'id_rsa',
  'id_ed25519',
])

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    if (entry.isSymbolicLink()) throw new Error(`Candidate must not contain symlinks: ${relative}`)
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...await walk(root, absolute))
    } else if (entry.isFile() && !EXCLUDED_FILES.has(entry.name)) {
      files.push({ absolute, relative })
    }
  }
  return files.sort((a, b) => Buffer.compare(Buffer.from(a.relative), Buffer.from(b.relative)))
}

export async function computeCandidate(candidateDir) {
  const root = path.resolve(candidateDir)
  if (!(await stat(root)).isDirectory()) throw new Error(`Candidate path is not a directory: ${root}`)
  const digest = createHash('sha256')
  digest.update(DIGEST_PREFIX)
  const files = []
  for (const item of await walk(root)) {
    const content = await readFile(item.absolute)
    files.push({
      path: item.relative,
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    })
    digest.update(item.relative)
    digest.update('\0')
    digest.update(String(content.length))
    digest.update('\0')
    digest.update(content)
    digest.update('\0')
  }
  return { digest: `sha256:${digest.digest('hex')}`, files }
}

async function validateCandidateContract(root) {
  try {
    await stat(path.join(root, '.harbor-runtime'))
    throw new Error('Candidate must not contain the reserved .harbor-runtime path')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const required of ['cordis.yml', 'package.json']) {
    try {
      if (!(await stat(path.join(root, required))).isFile()) throw new Error()
    } catch {
      throw new Error(`Candidate is missing required file: ${required}`)
    }
  }
  const files = await walk(root)
  if (!files.some(item => LOCKFILES.includes(item.relative))) {
    throw new Error(`Candidate requires a JavaScript lockfile: ${LOCKFILES.join(', ')}`)
  }
  const credentialPaths = files
    .map(item => item.relative)
    .filter((relative) => {
      const name = path.basename(relative).toLowerCase()
      return name.startsWith('.env') || CREDENTIAL_FILES.has(name)
    })
  if (credentialPaths.length > 0) {
    throw new Error(`Candidate contains credential-bearing files: ${credentialPaths.join(', ')}; inject credentials at runtime instead`)
  }
}

export async function snapshotCandidate(candidateDir, options = {}) {
  const root = path.resolve(candidateDir)
  await validateCandidateContract(root)
  let packageJson
  try {
    packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  } catch (error) {
    throw new Error(`Candidate package.json is not valid JSON: ${error.message}`)
  }
  const candidateId = options.candidateId ?? packageJson.name
  const version = options.version ?? packageJson.version
  const runtimeVersion = options.runtimeVersion ?? '0.1.0-rc.6'
  if (!candidateId || !version || !runtimeVersion) {
    throw new Error('Candidate id, version, and runtime version must not be empty; set package.json name/version or pass explicit values')
  }
  const computed = await computeCandidate(root)
  const manifest = {
    schema_version: 1,
    candidate_id: String(candidateId),
    version: String(version),
    digest: computed.digest,
    created_at: new Date().toISOString(),
    runtime: {
      kind: 'deepseek-harness',
      version: String(runtimeVersion),
      transport: 'acp',
    },
    files: computed.files,
    metadata: options.metadata ?? {},
  }
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}
