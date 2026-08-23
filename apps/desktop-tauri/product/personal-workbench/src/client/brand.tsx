/** Brand value normalization and slot occupants. */

import type { ComponentType } from 'react'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps,
} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Browser-side settings shape after Host schema resolution. */
export interface WorkbenchSettingsValue {
  enabled: boolean
  name: string
  logo: string
}

/** Active, normalized custom branding. Missing fields keep their shell fallback. */
export interface ResolvedWorkbenchBrand {
  name?: string
  logo?: string
}

/** Normalize one plain-text name at the browser boundary. */
export function normalizeWorkbenchName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  return name.length > 0 ? name : undefined
}

/** Accept one non-empty image source selected or configured by the user. */
export function normalizeLogoSource(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const logo = value.trim()
  return logo.length > 0 ? logo : undefined
}

/** Resolve custom occupants only while the durable enabled switch stands. */
export function resolveWorkbenchBrand(value: unknown): ResolvedWorkbenchBrand {
  if (typeof value !== 'object' || value === null || !('enabled' in value) || value.enabled !== true) {
    return {}
  }
  const record = value as Partial<WorkbenchSettingsValue>
  const name = normalizeWorkbenchName(record.name)
  const logo = normalizeLogoSource(record.logo)
  return {
    ...(name === undefined ? {} : { name }),
    ...(logo === undefined ? {} : { logo }),
  }
}

type MarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/** Build a mark occupant closed over one configured image source. */
export function createPersonalBrandMark(logo: string): ComponentType<MarkProps> {
  return function PersonalBrandMark({ size, className }: MarkProps) {
    return (
      <img
        src={logo}
        alt=""
        aria-hidden="true"
        className={className}
        width={size}
        height={size}
        style={{ display: 'block', objectFit: 'contain', borderRadius: '24%' }}
      />
    )
  }
}

/** Build a plain-text name occupant closed over one normalized name. */
export function createPersonalBrandName(name: string): ComponentType<SidebarBrandNameOwnerProps> {
  return function PersonalBrandName() {
    return <span>{name}</span>
  }
}
