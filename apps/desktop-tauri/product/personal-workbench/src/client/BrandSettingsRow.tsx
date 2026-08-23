/** General-settings card for editing and previewing the personal workbench identity. */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { WorkbenchSettingsValue } from './brand.tsx'
import { normalizeLogoSource, normalizeWorkbenchName } from './brand.tsx'
import type { PersonalWorkbenchKey } from './locales.ts'

/** Settings capability injected into the card. */
export interface BrandSettingsRowInjected {
  /** Durable namespace scope owned by this plugin. */
  scope: SettingsScope<WorkbenchSettingsValue>
}

/** Composed props for the General settings item. */
export type BrandSettingsRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings.personal-workbench'>
  & BrandSettingsRowInjected

type Status = 'idle' | 'saving' | 'saved' | 'reset' | 'error'

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => { reject(new Error('file-read-failed')) }
    reader.onload = () => {
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('file-read-failed'))
    }
    reader.readAsDataURL(file)
  })
}

/** Render the editable branding card with a local preview and explicit persistence. */
export function BrandSettingsRow({ scope, t }: BrandSettingsRowProps) {
  const snapshot = useSyncExternalStore(
    (listener: () => void) => scope.subscribe(listener),
    () => scope.getSnapshot(),
    () => scope.getSnapshot(),
  )
  const persisted = snapshot.value
  const [name, setName] = useState('')
  const [logo, setLogo] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorKey, setErrorKey] = useState<PersonalWorkbenchKey | undefined>()

  useEffect(() => {
    if (persisted === undefined) return
    setName(persisted.enabled ? persisted.name : '')
    setLogo(persisted.enabled ? persisted.logo : '')
  }, [persisted])

  const displayName = normalizeWorkbenchName(name) ?? t('title')
  const displayLogo = normalizeLogoSource(logo)
  const writable = snapshot.writable
  const busy = status === 'saving'

  const chooseLogo = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    try {
      const dataUrl = await readDataUrl(file)
      setLogo(dataUrl)
      setErrorKey(undefined)
      setStatus('idle')
    }
    catch {
      setErrorKey('error.read')
    }
  }

  const save = async (): Promise<void> => {
    const normalizedName = normalizeWorkbenchName(name)
    if (normalizedName === undefined) {
      setErrorKey('error.name')
      return
    }
    setStatus('saving')
    setErrorKey(undefined)
    try {
      await scope.set('name', normalizedName)
      await scope.set('logo', normalizeLogoSource(logo) ?? '')
      await scope.set('enabled', true)
      setStatus('saved')
    }
    catch {
      setStatus('error')
      setErrorKey('error.save')
    }
  }

  const reset = async (): Promise<void> => {
    setStatus('saving')
    setErrorKey(undefined)
    try {
      await scope.set('enabled', false)
      await scope.unset('name')
      await scope.unset('logo')
      setName('')
      setLogo('')
      setStatus('reset')
    }
    catch {
      setStatus('error')
      setErrorKey('error.save')
    }
  }

  return (
    <section className="dpw-card" aria-labelledby="dpw-title">
      <div className="dpw-heading">
        <div id="dpw-title" className="dpw-title">{t('title')}</div>
        <div className="dpw-description">{t('description')}</div>
      </div>

      <div className="dpw-preview" aria-label={t('preview')}>
        <div className="dpw-preview-mark" aria-hidden="true">
          {displayLogo === undefined ? '🐳' : <img src={displayLogo} alt="" />}
        </div>
        <div className="dpw-preview-copy">
          <span className="dpw-preview-label">{t('preview')}</span>
          <span className="dpw-preview-name">{displayName}</span>
        </div>
      </div>

      <div className="dpw-fields">
        <label className="dpw-field">
          <span className="dpw-label">{t('name.label')}</span>
          <input
            className="dpw-input"
            value={name}
            placeholder={t('name.placeholder')}
            disabled={!writable || busy}
            onChange={event => {
              setName(event.currentTarget.value)
              setStatus('idle')
              setErrorKey(undefined)
            }}
          />
        </label>

        <div className="dpw-field">
          <span className="dpw-label">{t('logo.label')}</span>
          <div className="dpw-upload-row">
            <label className="dpw-button">
              {logo === '' ? t('logo.choose') : t('logo.replace')}
              <input
                className="dpw-file"
                type="file"
                accept="image/*"
                disabled={!writable || busy}
                onChange={event => { void chooseLogo(event.currentTarget.files?.[0]) }}
              />
            </label>
            {logo !== '' && (
              <button
                type="button"
                className="dpw-button"
                disabled={!writable || busy}
                onClick={() => { setLogo(''); setStatus('idle'); setErrorKey(undefined) }}
              >
                {t('logo.remove')}
              </button>
            )}
          </div>
          <span className="dpw-hint">{t('logo.hint')}</span>
        </div>
      </div>

      {errorKey !== undefined && <div className="dpw-error" role="alert">{t(errorKey)}</div>}
      {!writable && <div className="dpw-status">{t('status.readonly')}</div>}
      {(status === 'saved' || status === 'reset') && (
        <div className="dpw-status dpw-success" role="status">
          {t(status === 'saved' ? 'saved' : 'reset.done')}
        </div>
      )}

      <div className="dpw-actions">
        <button
          type="button"
          className="dpw-button dpw-button-primary"
          disabled={!writable || busy}
          onClick={() => { void save() }}
        >
          {t('save')}
        </button>
        <button
          type="button"
          className="dpw-button"
          disabled={!writable || busy}
          onClick={() => { void reset() }}
        >
          {t('reset')}
        </button>
      </div>
    </section>
  )
}
