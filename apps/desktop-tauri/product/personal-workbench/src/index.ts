/** Host half: registers the profile-persisted personal-workbench namespace. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { createHostNetworkProxyRoute } from './host-network-proxy.ts'
import {
  WorkbenchSettingsSchema, WORKBENCH_SETTINGS_NAMESPACE,
} from './settings.ts'

export {
  WorkbenchSettingsSchema, WORKBENCH_SETTINGS_NAMESPACE,
  type WorkbenchSettings,
} from './settings.ts'

/** Cordis plugin name. */
export const name = 'personal-workbench'

/** Register this plugin's live settings namespace when the settings service is available. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(WORKBENCH_SETTINGS_NAMESPACE),
      WorkbenchSettingsSchema,
    )
  })
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(createHostNetworkProxyRoute()),
      'personal-workbench: Host network proxy diagnostic')
  })
}
