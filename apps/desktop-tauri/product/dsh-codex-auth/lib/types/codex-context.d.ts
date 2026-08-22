/** Live GPT-5.6 context-capacity policy owned by the Codex LLM route. */
import type { Api, Model } from '@earendil-works/pi-ai';
import z from '@deepseek-ai/schemastery';
/** Durable settings namespace for Codex LLM route preferences. */
export declare const CODEX_LLM_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Conservative Codex default that avoids automatic long-context usage. */
export declare const CODEX_STANDARD_CONTEXT_WINDOW = 272000;
/** Explicit opt-in budget matching Codex's documented one-million-token configuration. */
export declare const CODEX_LONG_CONTEXT_WINDOW = 1000000;
/** Independently live settings that affect the openai-codex model catalog. */
export interface CodexLlmSettings {
    longContextEnabled: boolean;
}
export declare const CodexLlmSettingsConfig: z<CodexLlmSettings>;
/**
 * Apply the plugin's narrow context policy without mutating pi-ai's generated
 * catalog. Enabling the policy changes only the known GPT-5.6 family; every
 * other descriptor and every non-capacity field remains provider-owned.
 */
export declare function applyCodexContextPolicy(models: readonly Model<Api>[], settings: CodexLlmSettings): readonly Model<Api>[];
//# sourceMappingURL=codex-context.d.ts.map