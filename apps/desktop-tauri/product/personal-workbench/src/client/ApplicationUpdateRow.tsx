/** General-settings card for manually triggering the signed desktop updater. */

import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { isDesktopUpdateAvailable, requestDesktopUpdate } from './desktop-update.ts'

/** Composed props for the application-update General settings item. */
export type ApplicationUpdateRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings.personal-workbench'>

type UpdateStatus = 'idle' | 'checking' | 'result' | 'error'

/**
 * Render the desktop-only action and its current check status.
 *
 * @param props Localized General-settings item properties.
 * @returns The application-update settings card.
 */
export function ApplicationUpdateRow({ t }: ApplicationUpdateRowProps) {
  const [available] = useState(() => isDesktopUpdateAvailable())
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [detail, setDetail] = useState('')

  const check = async (): Promise<void> => {
    setStatus('checking')
    setDetail('')
    try {
      setDetail(await requestDesktopUpdate())
      setStatus('result')
    }
    catch (error) {
      setDetail(error instanceof Error ? error.message : String(error))
      setStatus('error')
    }
  }

  const busy = status === 'checking'
  return (
    <section className="dpw-card" aria-labelledby="dpw-update-title">
      <div className="dpw-heading">
        <div id="dpw-update-title" className="dpw-title">{t('update.title')}</div>
        <div className="dpw-description">{t('update.description')}</div>
      </div>

      {!available && <div className="dpw-status">{t('update.desktop-only')}</div>}
      {busy && <div className="dpw-status" role="status">{t('update.checking')}</div>}
      {status === 'result' && <div className="dpw-status dpw-success" role="status">{detail}</div>}
      {status === 'error' && (
        <div className="dpw-error" role="alert">
          {t(detail === 'desktop-update-shell-unavailable' ? 'update.shell-unavailable' : 'update.error')}
          {detail === 'desktop-update-shell-unavailable' ? '' : ` ${detail}`}
        </div>
      )}

      <div className="dpw-actions">
        <button
          type="button"
          className="dpw-button dpw-button-primary"
          disabled={!available || busy}
          onClick={() => { void check() }}
        >
          {t(busy ? 'update.checking-action' : 'update.action')}
        </button>
      </div>
    </section>
  )
}
