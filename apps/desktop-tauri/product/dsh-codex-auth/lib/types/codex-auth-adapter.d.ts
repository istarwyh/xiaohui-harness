/**
 * The LLM adapter half of the codex-auth plugin: registers the `openai-codex`
 * route with a pi-ai-backed adapter that resolves the ChatGPT access token
 * from the live codex auth file (refreshing through the official OAuth
 * endpoint when it is about to expire) instead of through the credentials
 * seam — which is single-provider by design and cannot be extended from a
 * plugin.
 *
 * Everything provider-specific — the chatgpt.com/backend-api Responses
 * protocol, tool calls, SSE/WebSocket transports, the model catalog — is the
 * installed pi-ai `openai-codex` provider, wrapped by the harness's own
 * `PiAiAdapter`; this package only supplies the credential and the route.
 *
 * The route streams over SSE by default: pi-ai prefers a WebSocket connection
 * (`wss://chatgpt.com/backend-api/codex/responses`) with a 15-second connect
 * timeout and a per-session SSE fallback, but the WebSocket upgrade is
 * unreliable through common HTTP proxies, and every new conversation pays the
 * connect timeout again before the fallback engages. Pinning SSE removes that
 * cliff (prompt caching via the `session-id`/`prompt_cache_key` still applies);
 * `auto` and `websocket` remain selectable for networks where the WebSocket
 * works.
 *
 * @module dsh-codex-auth/codex-auth-adapter
 */
import type { AuthContext, CredentialStore } from '@earendil-works/pi-ai';
import type { Context } from '@deepseek-ai/cordis';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { CodexAuthService } from './codex-auth-service.ts';
import type { CodexLlmSettings } from './codex-context.ts';
/** The provider route this adapter registers. */
export declare const CODEX_ROUTE = "openai-codex";
/** Streaming transports pi-ai's codex provider accepts; `sse` is the default here. */
export type CodexAuthTransport = 'auto' | 'sse' | 'websocket';
/**
 * Default streaming transport. SSE is reliable through HTTP proxies; `auto`
 * first tries a WebSocket with a 15-second connect timeout and falls back per
 * conversation, which makes every new conversation's first request slow on
 * networks where the WebSocket upgrade fails.
 */
export declare const DEFAULT_TRANSPORT: CodexAuthTransport;
/** Default WebSocket connect timeout when a non-SSE transport is selected. */
export declare const DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS = 5000;
/** Default request timeout: the SSE response-header phase, and the WebSocket message idle interval. */
export declare const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
/** rc1's default maximum encoded image payload for one pi-ai request. */
export declare const MAX_REQUEST_IMAGE_BYTES: number;
/** Default maximum pixel count for one normalized request image. */
export declare const REQUEST_IMAGE_PIXEL_BUDGET: number;
/** Default maximum encoded byte length for one normalized request image. */
export declare const REQUEST_IMAGE_MAX_BYTES: number;
/**
 * Codex owns authentication in the Host-side coordinator and injects its token
 * through `resolveApiKey` for each request. Pi-ai's login/storage surface must
 * therefore remain deliberately inert: allowing it to discover or persist a
 * second credential would break the single-source and secret-boundary rules.
 */
export declare function codexAuthInjection(): {
    credentials: CredentialStore;
    authContext: AuthContext;
};
/** Options one adapter instance is constructed with. */
export interface CodexAuthAdapterOptions {
    /** Shared Host-only coordinator used by every authenticated operation. */
    auth: Pick<CodexAuthService, 'credential'>;
    /** The codex auth file path (`~/.codex/auth.json` by default); retained for the legacy resolver fixture. */
    authJsonPath: string;
    /** The credential reference the status card advertises. */
    credentialRef: CredentialRef;
    /** Lead time before access-token expiry that triggers a refresh. */
    refreshLeadMs: number;
    /** Injectable fetch for tests. */
    fetchImpl: typeof fetch;
    /** Selector label for the route. */
    displayName: string;
    /** Live model-capacity settings read for each catalog access. */
    settings: () => CodexLlmSettings;
    /** Streaming transport preference (`sse` by default). */
    transport: CodexAuthTransport;
    /** WebSocket connect timeout in milliseconds; only used when `transport` is not `sse`. */
    websocketConnectTimeoutMs: number;
    /** Request timeout in milliseconds (SSE response-header phase and WebSocket message idle). */
    timeoutMs: number;
}
/**
 * The codex-auth LLM adapter: one fixed `openai-codex` profile over the
 * installed pi-ai provider, with the credential resolved from the codex auth
 * file per request.
 */
export declare class CodexAuthAdapter extends PiAiAdapter {
    constructor(ctx: Context, options: CodexAuthAdapterOptions);
}
/**
 * Resolve the live access token from the codex auth file, refreshing it
 * through the official OAuth endpoint when it is about to expire. A refresh
 * failure (or a missing login) answers `undefined`: the caller decides how to
 * fail, and the logged warning never carries token material.
 * @param options - auth file, expiry lead time, and injectable fetch.
 * @param warn - sink for non-secret diagnostics.
 * @returns the access token, or `undefined` when no usable login exists.
 */
export declare function resolveCodexAccessToken(options: Pick<CodexAuthAdapterOptions, 'authJsonPath' | 'refreshLeadMs' | 'fetchImpl'>, warn: (message: unknown) => void): Promise<string | undefined>;
//# sourceMappingURL=codex-auth-adapter.d.ts.map