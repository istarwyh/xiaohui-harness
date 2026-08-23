import { describe, expect, it } from 'vitest'
import { WorkbenchSettingsSchema } from '../src/settings.ts'

describe('personal-workbench settings schema', () => {
  it('defaults to the shell fallback', () => {
    expect(WorkbenchSettingsSchema()).toEqual({ enabled: false, name: '', logo: '' })
  })

  it('persists the user-selected name and image source', () => {
    expect(WorkbenchSettingsSchema({
      enabled: true,
      name: 'My Workbench',
      logo: 'data:image/png;base64,YQ==',
    }).logo).toBe('data:image/png;base64,YQ==')
    expect(WorkbenchSettingsSchema({
      enabled: true,
      name: 'Remote Workbench',
      logo: 'https://example.com/logo.svg',
    }).logo).toBe('https://example.com/logo.svg')
  })
})
