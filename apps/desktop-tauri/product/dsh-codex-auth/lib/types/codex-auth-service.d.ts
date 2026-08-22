/**
 * The `codexAuth` service: login status and login-flow startup for the web
 * surface. Status is value-free (no token material ever leaves this service),
 * and login only spawns the official codex CLI, which owns the whole flow —
 * browser PKCE by default, device-code on request.
 *
 * Authenticated operations resolve credentials through an in-memory cache
 * that is validated per call with a single stat: a fresh token with an
 * untouched auth file is served without any file read or cross-process lock.
 * Refresh happens proactively in the background (ahead of expiry and of the
 * codex CLI's 8-day refresh age), so the request path only refreshes
 * synchronously when a token is genuinely needed — after long process-down
 * idle, or when a refresh failed and the token is still required.
 *
 * @module dsh-codex-auth/codex-auth-service
 */
import { spawn } from 'node:child_process';
import type { Context } from '@deepseek-ai/cordis';
import { Service } from '@deepseek-ai/cordis';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { CodexAuthFile } from './codex-auth.ts';
import type { CodexAuthLoginMode, CodexAuthStatusView, CodexUsageView } from './rpc-contract.ts';
export type { CodexAuthLoginMode, CodexAuthStatusView, CodexUsageView } from './rpc-contract.ts';
/** Options one service instance is constructed with. */
export interface CodexAuthServiceOptions {
    /** The codex auth file path (`~/.codex/auth.json` by default). */
    authJsonPath: string;
    /** The codex CLI command to spawn for login and version probing. */
    codexCommand: string;
    /** The value-free CredentialRef advertised by status surfaces. */
    credentialRef: CredentialRef;
    /** Lead time before access-token expiry that triggers refresh. */
    refreshLeadMs?: number;
    /** Injectable refresh transport; defaults to the Host's fetch. */
    fetchImpl?: typeof fetch;
    /** Host-owned deadline for the best-effort usage probe; primarily injectable for tests. */
    usageTimeoutMs?: number;
    /** Maximum teardown wait for abortable auth work; atomic commits always drain. */
    disposeTimeoutMs?: number;
    /** Injectable atomic auth-file writer; defaults to the production writer. */
    authFileWriter?: (path: string, file: CodexAuthFile) => Promise<void>;
    /** Injectable process spawner for CLI lifecycle tests. */
    spawnImpl?: typeof spawn;
    /** Grace period before a stuck CLI probe is force-stopped. */
    probeStopTimeoutMs?: number;
}
/** Host-only credential facts returned at an authenticated operation boundary. */
export interface CodexCredential {
    accessToken: string;
    accountId?: string;
    /** Locally decoded plan claim; absence means unknown, not unavailable. */
    planType?: string;
}
/**
 * The codexAuth service. Constructing it registers it as `codexAuth`; this
 * package's dedicated Connection RPC channel is its only browser transport.
 */
export declare class CodexAuthService extends Service {
    private readonly options;
    private codexVersion;
    private lastStatus;
    private readonly statusListeners;
    private cachedCredential;
    private refreshTimer;
    private credentialFlight;
    private backgroundRefreshFlight;
    private readonly commitFlights;
    private readonly lifecycleAbort;
    private disposed;
    private statusReadAt;
    constructor(ctx: Context, options: CodexAuthServiceOptions);
    private disposeOperations;
    /** Whether the codex CLI resolved at startup. */
    get available(): boolean;
    /** Last locally observed value-free status, when one has been read. */
    get cachedStatus(): CodexAuthStatusView | undefined;
    /** Observe locally verified status changes without exposing credentials. */
    watchStatus(listener: () => void): () => void;
    /**
     * Resolve credentials for one authenticated operation. A fresh cached
     * credential with an untouched auth file is served directly (one stat, no
     * read, no lock); everything else shares one in-process flight, which
     * re-reads under the cross-process writer lock before deciding whether to
     * refresh.
     */
    credential(signal?: AbortSignal): Promise<CodexCredential | undefined>;
    /**
     * Whether a cached credential may still be served: the token must remain
     * comfortably valid, the entry must be younger than the cache ceiling, and
     * the auth file must not have changed under it (a `codex login` re-run or
     * another process's refresh). The file check is one stat — no read, no lock.
     */
    private cachedCredentialFresh;
    /** Describe the current login state without exposing any token material. */
    status(): Promise<CodexAuthStatusView>;
    /**
     * Read-only weekly usage snapshot for the settings login block. The ChatGPT
     * backend's `/wham/usage` endpoint answers multiple account windows; the
     * seven-day window is selected by duration rather than field position. The
     * probe never throws: a failure answers an empty view, which the settings
     * card renders as dashes instead of erroring the whole login block.
     */
    usage(signal?: AbortSignal): Promise<CodexUsageView>;
    /** Start the official codex login flow in the background. */
    login(mode: CodexAuthLoginMode): Promise<{
        started: boolean;
    }>;
    /** Resolve from the latest locked document and refresh at most once. */
    private resolveCredential;
    /**
     * Under the writer lock, read the auth file and return a side-effect-free
     * refresh decision. Callers publish/cache only after their lifecycle check.
     */
    private decideRefreshLocked;
    /**
     * Under the writer lock: fold a refresh reply into the current document,
     * preserving unknown fields — unless another writer already refreshed while
     * the OAuth round trip was in flight, in which case its newer document wins.
     * Returns the document to serve, or `undefined` when the login is gone.
     */
    private adoptRefreshedLocked;
    /** Commit one non-cancellable atomic write while keeping teardown joined. */
    private commitAuthFile;
    /**
     * Populate the in-memory credential cache from a version-bound snapshot and
     * arm the next background refresh. A snapshot failure never produces a cache
     * entry, so filesystem uncertainty fails closed.
     */
    private recordResolved;
    /**
     * Arm one background refresh at the earlier of (access-token expiry minus
     * the refresh lead) and (the codex 8-day refresh age), each with a grace
     * lead, and never closer than the minimum delay unless a refresh is already
     * due (then it fires immediately). The timer is unref'd so it never keeps
     * the process alive, and is cleared on dispose.
     */
    private scheduleBackgroundRefresh;
    /** Start or join the one lifecycle-tracked background refresh flight. */
    private startBackgroundRefresh;
    /**
     * Refresh the token set ahead of the request path when the auth file says it
     * is due. The request path still refreshes synchronously when a token is
     * genuinely needed, but this pre-arms it while the process is alive, so the
     * common case never waits on the OAuth round trip. Like the request path,
     * the OAuth round trip happens outside the writer lock (short critical
     * sections only), so a slow token endpoint never blocks other readers;
     * failures are logged and retried later.
     */
    private refreshInBackground;
    private clearRefreshTimer;
    /** Re-arm the background refresh after a failure. */
    private scheduleBackgroundRetry;
    private publishStatus;
    private warnCredentialFailure;
    /**
     * Probe the codex CLI once at startup without blocking the event loop;
     * failures (missing binary, timeout, non-zero exit) leave the service
     * unavailable.
     */
    private probeCodex;
}
/** Extract the settings-relevant facts from a `/wham/usage` payload, or none. */
export declare function usageFromPayload(value: unknown): CodexUsageView;
//# sourceMappingURL=codex-auth-service.d.ts.map