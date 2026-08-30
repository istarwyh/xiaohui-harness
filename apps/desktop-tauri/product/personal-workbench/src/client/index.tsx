/** Browser half: settings cards plus live brand-slot occupants. */

import type { Context } from '@deepseek-ai/cordis'
import type {
  ClientContext, SettingsScope,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  WORKBENCH_SETTINGS_NAMESPACE,
} from '../constants.ts'
import {
  createPersonalBrandMark, createPersonalBrandName, resolveWorkbenchBrand,
  type WorkbenchSettingsValue,
} from './brand.tsx'
import {
  BrandSettingsRow, type BrandSettingsRowInjected,
} from './BrandSettingsRow.tsx'
import { ApplicationLifecycleRow } from './ApplicationLifecycleRow.tsx'
import { en, zh, type PersonalWorkbenchKey } from './locales.ts'
import { installPersonalWorkbenchStyles } from './styles.ts'

export {
  normalizeLogoSource, normalizeWorkbenchName, resolveWorkbenchBrand,
  type ResolvedWorkbenchBrand, type WorkbenchSettingsValue,
} from './brand.tsx'
/** Locale namespace owning the settings card copy. */
export const SETTINGS_LOCALE_NAMESPACE = 'settings.personal-workbench'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Personal-workbench settings copy. */
    'settings.personal-workbench': PersonalWorkbenchKey
  }
}

/** Browser services required for settings persistence, localization, and slots. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

type BrandSlot =
  | 'sidebar.brand.mark'
  | 'sidebar.brand.name'
  | 'conversation.hero.brand.mark'

type SlotComponent =
  | ReturnType<typeof createPersonalBrandMark>
  | ReturnType<typeof createPersonalBrandName>

/**
 * Keep one custom occupant synchronized with the durable namespace. The
 * registration disappears while disabled, so the shell's own fallback is
 * restored instead of being copied into this plugin.
 */
function installBrandSlot(
  ctx: ClientContext,
  scope: SettingsScope<WorkbenchSettingsValue>,
  slot: BrandSlot,
  pick: (value: unknown) => SlotComponent | undefined,
): void {
  ctx.slots.inject(slot, () => {
    let dispose: (() => void) | undefined
    let selected: SlotComponent | undefined
    const sync = (): void => {
      const next = pick(scope.getSnapshot().value)
      if (next === selected) return
      dispose?.()
      selected = next
      dispose = next === undefined
        ? undefined
        : ctx.slots.register({ name: slot, priority: -10 } as never, next as never)
    }
    const unsubscribe = scope.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      dispose?.()
    }
  })
}

/** Install brand occupants whose lower priority intentionally shadows built-in occupants. */
export function installPersonalBrandOccupants(
  ctx: ClientContext,
  scope: SettingsScope<WorkbenchSettingsValue>,
): void {
  let markLogo: string | undefined
  let mark: SlotComponent | undefined
  const pickMark = (value: unknown): SlotComponent | undefined => {
    const logo = resolveWorkbenchBrand(value).logo
    if (logo === undefined) {
      markLogo = undefined
      mark = undefined
      return undefined
    }
    if (logo !== markLogo) {
      markLogo = logo
      mark = createPersonalBrandMark(logo)
    }
    return mark
  }

  let selectedName: string | undefined
  let nameComponent: SlotComponent | undefined
  const pickName = (value: unknown): SlotComponent | undefined => {
    const name = resolveWorkbenchBrand(value).name
    if (name === undefined) {
      selectedName = undefined
      nameComponent = undefined
      return undefined
    }
    if (name !== selectedName) {
      selectedName = name
      nameComponent = createPersonalBrandName(name)
    }
    return nameComponent
  }

  installBrandSlot(ctx, scope, 'sidebar.brand.mark', pickMark)
  installBrandSlot(ctx, scope, 'conversation.hero.brand.mark', pickMark)
  installBrandSlot(ctx, scope, 'sidebar.brand.name', pickName)
}

/** Register the settings cards and brand occupants. */
export function apply(ctx: ClientContext): void {
  installPersonalWorkbenchStyles(ctx as Context)
  const scope = ctx.settingsScope.bind<WorkbenchSettingsValue>({
    namespace: WORKBENCH_SETTINGS_NAMESPACE,
  })
  ctx.effect(
    () => ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, { zh, en }),
    'personal-workbench: settings dictionaries',
  )

  installPersonalBrandOccupants(ctx, scope)
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'personal-workbench',
    order: 20,
    locale: SETTINGS_LOCALE_NAMESPACE,
    inject: (): BrandSettingsRowInjected => ({ scope }),
  }, BrandSettingsRow))
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'application-lifecycle',
    order: 30,
    locale: SETTINGS_LOCALE_NAMESPACE,
  }, ApplicationLifecycleRow))
}

export type { ApplicationLifecycleRowProps } from './ApplicationLifecycleRow.tsx'
export type { BrandSettingsRowProps } from './BrandSettingsRow.tsx'
export type PersonalBrandSettingsLocaleProps = PropsLocale<'settings.personal-workbench'>
