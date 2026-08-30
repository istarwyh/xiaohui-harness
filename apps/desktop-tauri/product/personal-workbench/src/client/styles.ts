/** Lifecycle-owned styles for the personal-workbench settings card. */

import type { Context } from '@deepseek-ai/cordis'

const STYLE_ID = 'dsh-personal-workbench/settings'

export const PERSONAL_WORKBENCH_CSS = `
.dpw-card{display:grid;gap:16px;padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1)}
.dpw-heading{display:grid;gap:4px}.dpw-title{font-size:16px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dpw-description,.dpw-hint,.dpw-status{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dpw-preview{display:flex;align-items:center;gap:12px;min-height:72px;padding:14px;border-radius:14px;background:var(--dsw-alias-bg-layer-2)}
.dpw-preview-mark{display:grid;place-items:center;width:44px;height:44px;overflow:hidden;border-radius:12px;background:var(--dsw-alias-bg-base);font-size:25px}
.dpw-preview-mark img{width:100%;height:100%;object-fit:contain}.dpw-preview-copy{display:grid;gap:2px;min-width:0}
.dpw-preview-label{font-size:12px;color:var(--dsw-alias-label-secondary)}.dpw-preview-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dpw-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.dpw-field{display:grid;align-content:start;gap:8px}
.dpw-field-wide{grid-column:1/-1}.dpw-proxy-panel{display:grid;gap:10px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.dpw-code{display:grid;gap:4px;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:var(--dsw-alias-label-secondary)}
.dpw-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}.dpw-input{box-sizing:border-box;width:100%;height:38px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.dpw-upload-row,.dpw-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dpw-file{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.dpw-button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.dpw-button-primary{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.dpw-button-primary:hover:not(:disabled){border-color:var(--dsw-alias-button-primary-hover);background:var(--dsw-alias-button-primary-hover)}.dpw-button:disabled{cursor:not-allowed;opacity:.5}
.dpw-error{font-size:13px;color:var(--dsw-alias-state-error-primary)}.dpw-success{color:var(--dsw-alias-state-success-primary)}
@media (max-width:720px){.dpw-fields{grid-template-columns:1fr}}
`

/** Install one tagged stylesheet and remove it with the plugin lifecycle. */
export function installPersonalWorkbenchStyles(ctx: Context): void {
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin-css="${STYLE_ID}"]`)
    if (existing !== null) return () => {}
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-personal-workbench'
    style.dataset.pluginCss = STYLE_ID
    style.textContent = PERSONAL_WORKBENCH_CSS
    document.head.append(style)
    return () => { style.remove() }
  }, 'personal-workbench: settings styles')
}
