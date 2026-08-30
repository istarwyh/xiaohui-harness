/** General-settings card for XiaoHui application lifecycle actions. */

import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  isDesktopLifecycleAvailable, requestDesktopRestart, requestDesktopUpdate,
} from './desktop-lifecycle.ts'

/** Composed props for the application-lifecycle General settings item. */
export type ApplicationLifecycleRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings.personal-workbench'>

type LifecycleStatus =
  | 'idle'
  | 'checking'
  | 'update-result'
  | 'update-error'
  | 'restarting'
  | 'restart-error'

/**
 * Render desktop update and restart actions with their current status.
 *
 * @param props Localized General-settings item properties.
 * @returns The application-lifecycle settings card.
 */
export function ApplicationLifecycleRow({ t }: ApplicationLifecycleRowProps) {
  const [available] = useState(() => isDesktopLifecycleAvailable())
  const [status, setStatus] = useState<LifecycleStatus>('idle')
  const [detail, setDetail] = useState('')

  const check = async (): Promise<void> => {
    setStatus('checking')
    setDetail('')
    try {
      setDetail(await requestDesktopUpdate())
      setStatus('update-result')
    }
    catch (error) {
      setDetail(error instanceof Error ? error.message : String(error))
      setStatus('update-error')
    }
  }

  const restart = async (): Promise<void> => {
    setStatus('restarting')
    setDetail('')
    try {
      await requestDesktopRestart()
    }
    catch (error) {
      setDetail(error instanceof Error ? error.message : String(error))
      setStatus('restart-error')
    }
  }

  const busy = status === 'checking' || status === 'restarting'
  const shellUnavailable = detail === 'desktop-shell-unavailable'
  return (
    <section className="dpw-card" aria-labelledby="dpw-lifecycle-title">
      <div className="dpw-heading">
        <div id="dpw-lifecycle-title" className="dpw-title">{t('lifecycle.title')}</div>
        <div className="dpw-description">{t('lifecycle.description')}</div>
      </div>

      {!available && <div className="dpw-status">{t('lifecycle.desktop-only')}</div>}
      {status === 'checking' && <div className="dpw-status" role="status">{t('lifecycle.update.checking')}</div>}
      {status === 'restarting' && <div className="dpw-status" role="status">{t('lifecycle.restart.restarting')}</div>}
      {status === 'update-result' && <div className="dpw-status dpw-success" role="status">{detail}</div>}
      {(status === 'update-error' || status === 'restart-error') && (
        <div className="dpw-error" role="alert">
          {t(shellUnavailable
            ? 'lifecycle.shell-unavailable'
            : status === 'update-error' ? 'lifecycle.update.error' : 'lifecycle.restart.error')}
          {shellUnavailable ? '' : ` ${detail}`}
        </div>
      )}

      <div className="dpw-actions">
        <button
          type="button"
          className="dpw-button dpw-button-primary"
          disabled={!available || busy}
          onClick={() => { void check() }}
        >
          {t(status === 'checking' ? 'lifecycle.update.checking-action' : 'lifecycle.update.action')}
        </button>
        <button
          type="button"
          className="dpw-button"
          disabled={!available || busy}
          onClick={() => { void restart() }}
        >
          {t(status === 'restarting' ? 'lifecycle.restart.restarting-action' : 'lifecycle.restart.action')}
        </button>
      </div>
    </section>
  )
}
