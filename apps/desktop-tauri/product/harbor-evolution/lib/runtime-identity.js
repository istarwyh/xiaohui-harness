import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

export const DSH_RUNTIME_VERSION = packageJson.harborEvolution.dshRuntimeVersion
export const CANDIDATE_ACP_PACKAGE = packageJson.harborEvolution.candidateAcpPackage
export const RUNTIME_POLICY = packageJson.harborEvolution.runtimePolicy
