/** Durable personal-workbench settings shared by the Host schema and browser client. */

import Schema from '@deepseek-ai/schemastery'

export { WORKBENCH_SETTINGS_NAMESPACE } from './constants.ts'

/** Durable settings for the user-owned workbench identity. */
export interface WorkbenchSettings {
  /** Whether custom occupants replace the shell's brand fallbacks. */
  enabled: boolean
  /** Plain-text workbench name. */
  name: string
  /** Image source used by the browser brand slots. */
  logo: string
}

/** Host schema for profile-persisted branding. */
export const WorkbenchSettingsSchema: Schema<WorkbenchSettings> = Schema.object({
  enabled: Schema.boolean().default(false),
  name: Schema.string().default(''),
  logo: Schema.string().default(''),
})
