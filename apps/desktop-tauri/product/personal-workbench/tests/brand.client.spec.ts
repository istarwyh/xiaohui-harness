import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it } from 'vitest'
import {
  installPersonalBrandOccupants, resolveWorkbenchBrand,
  type WorkbenchSettingsValue,
} from '../src/client/index.tsx'
import { PERSONAL_WORKBENCH_CSS } from '../src/client/styles.ts'

class FakeScope implements SettingsScope<WorkbenchSettingsValue> {
  private listeners = new Set<() => void>()
  private snapshot: SettingsScopeSnapshot<WorkbenchSettingsValue>

  constructor(value: WorkbenchSettingsValue) {
    this.snapshot = {
      status: 'ready', value, base: {}, user: {}, revision: 0, writable: true, mode: 'host',
    }
  }

  getSnapshot(): SettingsScopeSnapshot<WorkbenchSettingsValue> { return this.snapshot }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  async set(): Promise<void> {}
  async unset(): Promise<void> {}

  replace(value: WorkbenchSettingsValue): void {
    this.snapshot = { ...this.snapshot, value, revision: (this.snapshot.revision ?? 0) + 1 }
    for (const listener of this.listeners) listener()
  }
}

const HOLES = [
  'sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark',
] as const

function declareBrandHoles(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
}

describe('personal workbench browser behavior', () => {
  it('pairs the primary button fill with the theme foreground token', () => {
    expect(PERSONAL_WORKBENCH_CSS).toContain('background:var(--dsw-alias-button-primary-fill)')
    expect(PERSONAL_WORKBENCH_CSS).toContain('color:var(--dsw-alias-label-primary-foreground)')
    expect(PERSONAL_WORKBENCH_CSS).not.toContain('color:white')
  })

  it('normalizes only enabled plain-text and bitmap branding', () => {
    expect(resolveWorkbenchBrand({ enabled: false, name: 'A', logo: 'data:image/png;base64,YQ==' }))
      .toEqual({})
    expect(resolveWorkbenchBrand({ enabled: true, name: '  My Lab  ', logo: 'data:image/webp;base64,YQ==' }))
      .toEqual({ name: 'My Lab', logo: 'data:image/webp;base64,YQ==' })
    expect(resolveWorkbenchBrand({ enabled: true, name: 'A', logo: 'https://example.com/a.svg' }))
      .toEqual({ name: 'A', logo: 'https://example.com/a.svg' })
  })

  it('adds lower-priority occupants while enabled and removes them on reset', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    declareBrandHoles(slots)
    const scope = new FakeScope({ enabled: false, name: '', logo: '' })
    const fiber = ctx.plugin({
      inject: ['slots'],
      apply(clientCtx) { installPersonalBrandOccupants(clientCtx as never, scope) },
    })
    await fiber.await()
    for (const hole of HOLES) expect(slots.entries(hole)).toHaveLength(0)

    scope.replace({ enabled: true, name: 'My Lab', logo: 'data:image/png;base64,YQ==' })
    for (const hole of HOLES) {
      expect(slots.entries(hole)).toHaveLength(1)
      expect(slots.entries(hole)[0]?.options.priority).toBe(-10)
    }

    scope.replace({ enabled: false, name: '', logo: '' })
    for (const hole of HOLES) expect(slots.entries(hole)).toHaveLength(0)
    await fiber.dispose()
  })
})
