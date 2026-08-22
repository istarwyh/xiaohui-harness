/** Browser-safe dedicated Connection RPC contract owned by codex-auth. */
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api';
/** Logical channel registered by the plugin's Host half and called by its browser half. */
export declare const CODEX_AUTH_RPC_CHANNEL = "/codex-auth";
/** One official codex CLI login flow. */
export type CodexAuthLoginMode = 'browser' | 'device';
/** Value-free login state; token values are intentionally absent. */
export interface CodexAuthStatusView {
    available: boolean;
    configured: boolean;
    authMode?: string;
    codexVersion?: string;
    tokenExpiresAt?: string;
    lastRefreshAt?: string;
    /** Locally decoded ChatGPT account claim; never a credential. */
    accountId?: string;
    /** Locally decoded ChatGPT plan claim, when present; never remotely probed. */
    planType?: string;
    credentialRef: string;
    authFileExists: boolean;
}
/** Value-free weekly quota snapshot for the settings login block. */
export interface CodexUsageView {
    /** Backend-reported plan claim for the account; absent when unknown. */
    planType?: string;
    /** Remaining percentage (0-100) of the seven-day usage window; absent when unknown. */
    weeklyRemainingPercent?: number;
    /** ISO timestamp of the seven-day usage window's next reset; absent when unknown. */
    weeklyResetAt?: string;
}
/** Browser-safe face consumed by the settings card. */
export interface CodexAuthRpcClient {
    /** Read the value-free codex login state. */
    status(signal?: AbortSignal): Promise<RpcResult<{
        status: CodexAuthStatusView;
    }>>;
    /** Read the value-free weekly quota snapshot from the ChatGPT backend. */
    usage(signal?: AbortSignal): Promise<RpcResult<{
        usage: CodexUsageView;
    }>>;
    /** Start one official codex CLI login flow. */
    login(mode: CodexAuthLoginMode, signal?: AbortSignal): Promise<RpcResult<{
        started: boolean;
    }>>;
}
/** Minimal generic Connection caller required by this plugin. */
export interface CodexAuthConnectionRpc {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>;
}
/** Build the browser face over Connection's plugin-owned unary channel. */
export declare function createCodexAuthRpcClient(rpc: CodexAuthConnectionRpc): CodexAuthRpcClient;
//# sourceMappingURL=rpc-contract.d.ts.map