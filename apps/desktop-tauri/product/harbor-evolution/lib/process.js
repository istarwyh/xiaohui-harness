import { spawn } from 'node:child_process'

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Command timed out after ${options.timeoutMs}ms: ${command}`))
    }, options.timeoutMs ?? 1_800_000)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    if (options.input !== undefined) child.stdin.end(options.input)
    child.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timeout)
      const result = { command, args, code, stdout, stderr }
      const allowedExitCodes = options.allowedExitCodes ?? [0]
      if (allowedExitCodes.includes(code)) resolve(result)
      else reject(Object.assign(new Error(`Command failed with exit code ${code}: ${command}`), { result }))
    })
  })
}
