/**
 * Status card for ChatGPT authentication through the local Codex CLI.
 * Credentials never cross the dedicated plugin-owned Connection RPC channel.
 *
 * @module dsh-codex-auth/client/card
 */
import type { ReactNode } from 'react';
import type { CodexAuthRpcClient } from '../rpc-contract.ts';
import type { CodexAuthKey } from './locales.ts';
/** Props injected by the client plugin's slot registration. */
export interface CodexAuthCardInjected {
    /** Dedicated plugin-owned RPC face. */
    rpc: CodexAuthRpcClient;
    /** Localized dictionary reader. */
    t: (key: CodexAuthKey) => string;
    /** Subscribe to connection resets that invalidate the current view. */
    subscribe: (listener: () => void) => () => void;
}
/** The GPT Auth-via-codex login card. */
export declare function CodexAuthCard({ rpc, t, subscribe }: CodexAuthCardInjected): ReactNode;
//# sourceMappingURL=CodexAuthCard.d.ts.map