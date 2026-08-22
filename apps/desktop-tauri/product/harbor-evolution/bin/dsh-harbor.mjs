#!/usr/bin/env node

import process from 'node:process'
import { snapshotCandidate } from '../lib/candidate.js'
import { runProcess } from '../lib/process.js'
import { parseSetupArgs, renderSetupResult, setupIntegration } from '../lib/setup.js'

function usage(stream = console.error) {
  stream('Usage: dsh-harbor setup [options]')
  stream('       dsh-harbor snapshot <candidate-dir> [--id <id>] [--version <version>]')
  stream('       dsh-harbor doctor')
  stream('')
  stream('Setup options:')
  stream('  --project-root <path>  Agent workspace (default: current directory)')
  stream('  --profile <name>       DSH profile (default: web)')
  stream('  --jobs-dir <path>      Job directory under projectRoot (default: jobs)')
  stream('  --dsh-home <path>      DSH state directory (default: DSH_HOME or ~/.dsh)')
  stream('  --runtime-dir <path>   Managed Harbor Python environment')
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'setup') {
    const options = parseSetupArgs(args)
    if (options.help) {
      usage(console.log)
      return
    }
    const result = await setupIntegration(options, { onProgress: message => console.log(message) })
    console.log(renderSetupResult(result))
    return
  }
  if (command === 'doctor') {
    const harbor = await runProcess(process.env.HARBOR_BIN || 'harbor', ['--version'], { timeoutMs: 10000 })
    const plugins = await runProcess(process.env.HARBOR_BIN || 'harbor', ['plugins', 'list'], { timeoutMs: 10000 })
    console.log(JSON.stringify({ harbor: harbor.stdout.trim(), plugins: plugins.stdout.trim() }, null, 2))
    return
  }
  if (command === 'snapshot') {
    const candidateDir = args.shift()
    const idIndex = args.indexOf('--id')
    const versionIndex = args.indexOf('--version')
    if (!candidateDir) throw new Error('snapshot requires candidate-dir')
    const manifest = await snapshotCandidate(candidateDir, {
      candidateId: idIndex < 0 ? undefined : args[idIndex + 1],
      version: versionIndex < 0 ? undefined : args[versionIndex + 1],
    })
    console.log(JSON.stringify(manifest, null, 2))
    return
  }
  usage()
  process.exitCode = 2
}

main().catch(error => {
  console.error(error.result?.stderr?.trim() || error.message)
  process.exitCode = 1
})
