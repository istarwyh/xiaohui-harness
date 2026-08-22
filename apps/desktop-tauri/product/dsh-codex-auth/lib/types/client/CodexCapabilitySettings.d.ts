import type { ReactNode } from 'react';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { CodexAuthRpcClient } from '../rpc-contract.ts';
import type { CodexAuthKey } from './locales.ts';
export interface LlmSettingsView {
    longContextEnabled: boolean;
}
export interface SearchSettingsView {
    enabled: boolean;
    mode: 'live' | 'cached' | 'indexed';
    contextSize: 'low' | 'medium' | 'high';
    fallbackModel: string;
    maxOutputTokens: number;
}
export interface ImageSettingsView {
    enabled: boolean;
    model: string;
    n: number;
    size: 'auto' | '1024x1024' | '1536x1024' | '1024x1536';
    quality: 'auto' | 'low' | 'medium' | 'high';
    background: 'auto' | 'opaque' | 'transparent';
}
export interface CodexCapabilitySettingsProps {
    rpc: CodexAuthRpcClient;
    t: (key: CodexAuthKey) => string;
    subscribe: (listener: () => void) => () => void;
    llmScope: SettingsScope<LlmSettingsView>;
    searchScope: SettingsScope<SearchSettingsView>;
    imageScope: SettingsScope<ImageSettingsView>;
}
/** One navigable GPT Auth section containing Auth/LLM, Search, and Image Creation cards. */
export declare function CodexCapabilitySettings({ rpc, t, subscribe, llmScope, searchScope, imageScope, }: CodexCapabilitySettingsProps): ReactNode;
//# sourceMappingURL=CodexCapabilitySettings.d.ts.map