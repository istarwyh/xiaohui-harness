/** Host half: registers the profile-persisted personal-workbench namespace. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici'
import {
  WorkbenchSettingsSchema, WORKBENCH_SETTINGS_NAMESPACE,
} from './settings.ts'

export {
  WorkbenchSettingsSchema, WORKBENCH_SETTINGS_NAMESPACE,
  type WorkbenchSettings,
} from './settings.ts'

/** Cordis plugin name. */
export const name = 'personal-workbench'

let proxyDispatcherInstalled = false

function installApplicationProxyDispatcher(): void {
  if (proxyDispatcherInstalled) return
  const proxy = process.env.HTTPS_PROXY
    ?? process.env.https_proxy
    ?? process.env.HTTP_PROXY
    ?? process.env.http_proxy
  if (proxy === undefined || proxy.length === 0) return
  setGlobalDispatcher(new EnvHttpProxyAgent())
  proxyDispatcherInstalled = true
}

/** Register this plugin's live settings namespace when the settings service is available. */
export function apply(ctx: Context): void {
  installApplicationProxyDispatcher()
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(WORKBENCH_SETTINGS_NAMESPACE),
      WorkbenchSettingsSchema,
    )
  })
}
