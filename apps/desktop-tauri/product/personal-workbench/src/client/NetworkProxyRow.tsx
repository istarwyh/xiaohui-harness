/** General-settings card for XiaoHui application-wide network proxy policy. */

import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  isDesktopNetworkProxyAvailable,
  requestDesktopNetworkProxySave,
  requestDesktopNetworkProxySnapshot,
  requestDesktopNetworkProxyTest,
  type NetworkProxyMode,
  type NetworkProxySettings,
  type NetworkProxySnapshot,
  type NetworkProxyTestResult,
} from './desktop-network-proxy.ts'
import { requestDesktopRestart } from './desktop-lifecycle.ts'
import { requestHostNetworkProxyTest } from './host-network-proxy.ts'

/** Composed props for the network-proxy General settings item. */
export type NetworkProxyRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings.personal-workbench'>

type ProxyStatus = 'loading' | 'idle' | 'refreshing' | 'testing' | 'tested' | 'test-failed' | 'saving' | 'restarting' | 'error'

const EMPTY_SETTINGS: NetworkProxySettings = {
  mode: 'direct',
  httpProxy: '',
  httpsProxy: '',
  noProxy: '',
}

/** Render and operate the desktop-owned global proxy preferences. */
export function NetworkProxyRow({ t }: NetworkProxyRowProps) {
  const [available] = useState(() => isDesktopNetworkProxyAvailable())
  const [snapshot, setSnapshot] = useState<NetworkProxySnapshot | null>(null)
  const [draft, setDraft] = useState<NetworkProxySettings>(EMPTY_SETTINGS)
  const [status, setStatus] = useState<ProxyStatus>(available ? 'loading' : 'idle')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    if (!available) return
    let active = true
    void requestDesktopNetworkProxySnapshot()
      .then(value => {
        if (!active) return
        setSnapshot(value)
        setDraft(value.settings)
        setStatus('idle')
      })
      .catch(error => {
        if (!active) return
        setDetail(errorMessage(error))
        setStatus('error')
      })
    return () => { active = false }
  }, [available])

  const refresh = async (): Promise<void> => {
    setStatus('refreshing')
    setDetail('')
    try {
      setSnapshot(await requestDesktopNetworkProxySnapshot())
      setStatus('idle')
    }
    catch (error) {
      setDetail(errorMessage(error))
      setStatus('error')
    }
  }

  const test = async (): Promise<void> => {
    setStatus('testing')
    setDetail('')
    try {
      const [native, host] = await Promise.all([
        requestDesktopNetworkProxyTest(draft),
        requestHostNetworkProxyTest(),
      ])
      const pending = native.proxied === host.proxied ? '' : ` ${t('proxy.test.pending-restart')}`
      const certificateHint = [native.errorCode, host.errorCode].some(isCertificateErrorCode)
        ? ` ${t('proxy.test.certificate-hint')}`
        : ''
      setDetail(t('proxy.test.result')
        .replace('{native}', describeTestResult(native, t))
        .replace('{host}', describeTestResult(host, t)) + pending + certificateHint)
      setStatus(native.ok && host.ok ? 'tested' : 'test-failed')
    }
    catch (error) {
      setDetail(errorMessage(error))
      setStatus('error')
    }
  }

  const saveAndRestart = async (): Promise<void> => {
    setStatus('saving')
    setDetail('')
    try {
      const saved = await requestDesktopNetworkProxySave(draft)
      setSnapshot(saved)
      setStatus('restarting')
      await requestDesktopRestart()
    }
    catch (error) {
      setDetail(errorMessage(error))
      setStatus('error')
    }
  }

  const busy = ['loading', 'refreshing', 'testing', 'saving', 'restarting'].includes(status)
  const systemBlocked = draft.mode === 'system' && snapshot?.system.supported === false
  const setField = (field: keyof NetworkProxySettings) => (event: ChangeEvent<HTMLInputElement>): void => {
    setDraft(value => ({ ...value, [field]: event.target.value }))
    setStatus('idle')
    setDetail('')
  }
  const setMode = (event: ChangeEvent<HTMLSelectElement>): void => {
    setDraft(value => ({ ...value, mode: event.target.value as NetworkProxyMode }))
    setStatus('idle')
    setDetail('')
  }

  return (
    <section className="dpw-card" aria-labelledby="dpw-network-proxy-title">
      <div className="dpw-heading">
        <div id="dpw-network-proxy-title" className="dpw-title">{t('proxy.title')}</div>
        <div className="dpw-description">{t('proxy.description')}</div>
      </div>

      {!available && <div className="dpw-status">{t('proxy.desktop-only')}</div>}
      {available && (
        <div className="dpw-fields">
          <label className="dpw-field dpw-field-wide">
            <span className="dpw-label">{t('proxy.mode.label')}</span>
            <select
              className="dpw-input"
              value={draft.mode}
              disabled={busy}
              aria-label={t('proxy.mode.label')}
              onChange={setMode}
            >
              <option value="system">{t('proxy.mode.system')}</option>
              <option value="custom">{t('proxy.mode.custom')}</option>
              <option value="direct">{t('proxy.mode.direct')}</option>
            </select>
          </label>

          {draft.mode === 'system' && (
            <div className="dpw-proxy-panel dpw-field-wide">
              <div className="dpw-label">{t('proxy.system.detected')}</div>
              {snapshot?.system.supported === true && snapshot.system.configured && (
                <div className="dpw-code">
                  <div>HTTP_PROXY={snapshot.system.httpProxy || t('proxy.value.direct')}</div>
                  <div>HTTPS_PROXY={snapshot.system.httpsProxy || t('proxy.value.direct')}</div>
                  <div>NO_PROXY={snapshot.system.noProxy}</div>
                </div>
              )}
              {snapshot?.system.supported === true && !snapshot.system.configured && (
                <div className="dpw-hint">{t('proxy.system.none')}</div>
              )}
              {snapshot?.system.supported === false && (
                <div className="dpw-error">{localizedProxyError(snapshot.system.error, t)}</div>
              )}
              <button type="button" className="dpw-button" disabled={busy} onClick={() => { void refresh() }}>
                {status === 'refreshing' ? t('proxy.system.refreshing') : t('proxy.system.refresh')}
              </button>
            </div>
          )}

          {draft.mode === 'custom' && (
            <>
              <label className="dpw-field">
                <span className="dpw-label">{t('proxy.http.label')}</span>
                <input
                  className="dpw-input"
                  value={draft.httpProxy}
                  disabled={busy}
                  placeholder="http://127.0.0.1:7890"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={setField('httpProxy')}
                />
              </label>
              <label className="dpw-field">
                <span className="dpw-label">{t('proxy.https.label')}</span>
                <input
                  className="dpw-input"
                  value={draft.httpsProxy}
                  disabled={busy}
                  placeholder="http://127.0.0.1:7890"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={setField('httpsProxy')}
                />
              </label>
              <label className="dpw-field dpw-field-wide">
                <span className="dpw-label">{t('proxy.no-proxy.label')}</span>
                <input
                  className="dpw-input"
                  value={draft.noProxy}
                  disabled={busy}
                  placeholder="localhost,127.0.0.1,*.local"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={setField('noProxy')}
                />
                <span className="dpw-hint">{t('proxy.custom.hint')}</span>
              </label>
            </>
          )}

          {draft.mode === 'direct' && (
            <div className="dpw-hint dpw-field-wide">{t('proxy.direct.hint')}</div>
          )}
        </div>
      )}

      {status === 'loading' && <div className="dpw-status" role="status">{t('proxy.loading')}</div>}
      {status === 'testing' && <div className="dpw-status" role="status">{t('proxy.test.testing')}</div>}
      {status === 'tested' && (
        <div className="dpw-status dpw-success" role="status">
          {detail}
        </div>
      )}
      {status === 'test-failed' && <div className="dpw-error" role="alert">{detail}</div>}
      {status === 'saving' && <div className="dpw-status" role="status">{t('proxy.save.saving')}</div>}
      {status === 'restarting' && <div className="dpw-status" role="status">{t('proxy.save.restarting')}</div>}
      {status === 'error' && (
        <div className="dpw-error" role="alert">{localizedProxyError(detail, t)}</div>
      )}

      <div className="dpw-actions">
        <button
          type="button"
          className="dpw-button"
          disabled={!available || busy || systemBlocked}
          onClick={() => { void test() }}
        >
          {status === 'testing' ? t('proxy.test.testing-action') : t('proxy.test.action')}
        </button>
        <button
          type="button"
          className="dpw-button dpw-button-primary"
          disabled={!available || busy || systemBlocked}
          onClick={() => { void saveAndRestart() }}
        >
          {status === 'saving' || status === 'restarting'
            ? t('proxy.save.restarting-action')
            : t('proxy.save.action')}
        </button>
      </div>
    </section>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeTestResult(
  result: NetworkProxyTestResult,
  t: NetworkProxyRowProps['t'],
): string {
  const outcome = result.ok
    ? t('proxy.test.outcome.http').replace('{status}', String(result.status))
    : t('proxy.test.outcome.error').replace('{code}', result.errorCode)
  const route = result.proxied ? t('proxy.test.route.proxy') : t('proxy.test.route.direct')
  return t('proxy.test.outcome.routed')
    .replace('{outcome}', outcome)
    .replace('{route}', route)
}

function isCertificateErrorCode(code: string): boolean {
  return code.includes('CERT')
    || code.includes('ISSUER')
    || code.includes('SIGNATURE')
    || code.includes('VERIFY')
}

function localizedProxyError(error: string, t: NetworkProxyRowProps['t']): string {
  if (error === 'desktop-shell-unavailable') return t('proxy.shell-unavailable')
  if (error.includes('network-proxy-system-auto-config-unsupported')) return t('proxy.error.pac')
  if (error.includes('network-proxy-system-http-only-unsupported')) return t('proxy.error.http-only')
  if (error.includes('network-proxy-system-unsupported-platform')) return t('proxy.error.platform')
  if (error.includes('network-proxy-custom-http-and-https-required')) return t('proxy.error.required')
  if (error.includes('network-proxy-scheme-unsupported')) return t('proxy.error.scheme')
  if (error.includes('network-proxy-url-invalid')) return t('proxy.error.url')
  if (error.includes('network-proxy-no-proxy-invalid')) return t('proxy.error.no-proxy')
  if (error.includes('host-network-proxy-response-invalid')) return t('proxy.error.host-response')
  if (error.includes('network-proxy-test')) return t('proxy.error.test')
  return `${t('proxy.error.generic')} ${error}`
}
