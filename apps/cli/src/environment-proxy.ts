/** CLI-owned installation of Undici's process-wide environment proxy dispatcher. */

import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici'

/** HTTP(S) proxy variables that activate the process dispatcher. */
const PROXY_ENV_NAMES = [
  'https_proxy',
  'HTTPS_PROXY',
  'http_proxy',
  'HTTP_PROXY',
] as const

/** Process-local proof consumed by Host diagnostics after CLI installation. */
const ENVIRONMENT_PROXY_DISPATCHER_MARK = Symbol.for(
  '@deepseek-ai/dsh.environment-proxy-dispatcher',
)

/** Report whether this process has an HTTP(S) environment proxy to install. */
export function hasEnvironmentProxy(environment: NodeJS.ProcessEnv = process.env): boolean {
  return PROXY_ENV_NAMES.some((name) => {
    const value = environment[name]
    return value !== undefined && value.length > 0
  })
}

/**
 * Install the dispatcher before importing profile boot or any configured plugin.
 * The dispatcher freezes the materialized launch environment for this process.
 * @param environment - process environment after layered `.env` loading.
 * @returns whether an environment proxy dispatcher was installed.
 */
export function installEnvironmentProxyDispatcher(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!hasEnvironmentProxy(environment)) return false
  const httpProxy = environment.http_proxy ?? environment.HTTP_PROXY
  const httpsProxy = environment.https_proxy ?? environment.HTTPS_PROXY
  const noProxy = environment.no_proxy ?? environment.NO_PROXY
  setGlobalDispatcher(new EnvHttpProxyAgent({
    ...(httpProxy === undefined ? {} : { httpProxy }),
    ...(httpsProxy === undefined ? {} : { httpsProxy }),
    ...(noProxy === undefined ? {} : { noProxy }),
  }))
  Object.defineProperty(globalThis, ENVIRONMENT_PROXY_DISPATCHER_MARK, {
    configurable: true,
    value: true,
  })
  return true
}
