import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type CodexAuthKey } from './locales.ts';
export { CodexCapabilitySettings } from './CodexCapabilitySettings.tsx';
export type { CodexCapabilitySettingsProps, ImageSettingsView, LlmSettingsView, SearchSettingsView, } from './CodexCapabilitySettings.tsx';
export { CodexImageToolView } from './CodexImageToolView.tsx';
export type { CodexImageToolViewProps } from './CodexImageToolView.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Copy for the unified GPT Auth section. */
        'settings.codexAuth': CodexAuthKey;
    }
}
/** Required browser services, including session-authorized attachment reads. */
export declare const inject: string[];
/** Register the four-card settings section and keyed image result renderers. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map