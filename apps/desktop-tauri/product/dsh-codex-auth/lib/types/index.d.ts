/**
 * Codex-auth login plugin, host half. Mounts:
 *
 * - an LLM adapter owning the `openai-codex` provider route, wrapping the
 *   installed pi-ai codex provider (chatgpt.com/backend-api, Responses
 *   protocol) with the ChatGPT access token resolved live from the codex CLI's
 *   auth file;
 * - the `codexAuth` service: login status (value-free) and login-flow startup
 *   for the web surface.
 *
 * The credentials seam is deliberately untouched: it is single-provider by
 * design, and the codex token is not a key the harness should store or
 * describe — it lives in the codex CLI's own file, refreshed by this plugin
 * through the official OAuth endpoint.
 *
 * @module dsh-codex-auth
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CodexAuthTransport } from './codex-auth-adapter.ts';
export declare const name = "llm-codex-auth";
export declare const inject: string[];
/** Plugin configuration; every field has a default, so a bare row mounts the plugin. */
export interface Config {
    /** Whether this row owns the openai-codex LLM route; auth coordination remains available when false. */
    llmEnabled: boolean;
    /** Codex auth file path; empty (default) resolves `$CODEX_HOME` or `~/.codex/auth.json`. */
    authJsonPath: string;
    /** Credential reference advertised by the status card. */
    credentialRef: string;
    /** Lead time before access-token expiry that triggers a refresh. */
    refreshLeadMs: number;
    /** The codex CLI command used for login and version probing. */
    codexCommand: string;
    /** Selector label for the provider route. */
    displayName: string;
    /** Opt into the one-million-token context budget for supported GPT-5.6 models. */
    longContextEnabled: boolean;
    /** Streaming transport for the route; SSE by default because the WebSocket upgrade is unreliable through common HTTP proxies. */
    transport: CodexAuthTransport;
    /** WebSocket connect timeout in milliseconds; only used when `transport` is not `sse`; zero disables it. */
    websocketConnectTimeoutMs: number;
    /** Request timeout in milliseconds (SSE response-header phase and WebSocket message idle); zero disables it. */
    timeoutMs: number;
}
export declare const Config: z<Config>;
/** Mount the codex-auth adapter and service. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map