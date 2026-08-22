/**
 * Codex CLI login-state access for the DeepSeek Harness: read, refresh, and
 * atomically persist the ChatGPT OAuth token set in the codex auth file
 * (`~/.codex/auth.json`, or `$CODEX_HOME/auth.json` when CODEX_HOME is set).
 *
 * The file is the codex CLI's own. This module only (a) reads the current
 * access token for a request, (b) refreshes it through the official OAuth
 * refresh endpoint when it is about to expire, writing the result back with
 * the same atomic-write discipline the codex CLI itself uses, and (c) reads
 * status facts for configuration surfaces. No token value is ever logged or
 * emitted by the status path.
 *
 * @module dsh-codex-auth/codex-auth
 */
/** The OAuth client id the official Codex CLI registers against auth.openai.com. */
export declare const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
/** The OAuth token endpoint the codex CLI refreshes through. */
export declare const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
/** Default lead time before the access token expires that a refresh is triggered. */
export declare const DEFAULT_REFRESH_LEAD_MS: number;
/** Refresh when the last recorded refresh is older than this (the codex CLI's own TOKEN_REFRESH_INTERVAL). */
export declare const MAX_REFRESH_AGE_MS: number;
/** The token set the codex CLI persists; unknown fields are preserved. */
export interface CodexTokenSet {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
}
/** The codex auth document; unknown top-level fields are preserved. */
export interface CodexAuthFile {
    auth_mode?: string;
    OPENAI_API_KEY?: string;
    tokens?: CodexTokenSet;
    last_refresh?: string;
}
/** Stable identity/freshness facts for the exact auth-file inode that was read. */
export interface CodexAuthFileVersion {
    dev: bigint;
    ino: bigint;
    size: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
}
/** Parsed auth state bound to the exact file version its bytes came from. */
export interface CodexAuthSnapshot {
    file: CodexAuthFile;
    version: CodexAuthFileVersion;
}
/** The refresh endpoint's reply; fields the codex CLI records are carried over. */
export interface CodexRefreshReply {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    account_id?: string;
}
/** One auth file plus its decoded access-token facts. */
export interface CodexAuthState {
    file: CodexAuthFile | undefined;
    /** The current access token, when present. */
    accessToken: string | undefined;
    /** The access token's expiry in epoch milliseconds, when decodable. */
    accessTokenExpiresAt: number | undefined;
}
/** The auth file path for the current environment (CODEX_HOME overrides ~/.codex). */
export declare function defaultAuthJsonPath(env?: NodeJS.ProcessEnv): string;
/**
 * Decode the JWT payload of a codex access token without verifying it. The
 * chatgpt_account_id claim is the one pi-ai's codex provider extracts to set
 * the `chatgpt-account-id` request header.
 */
export declare function decodeAccessToken(token: string): {
    expSeconds?: number;
    chatgptAccountId?: string;
    chatgptPlanType?: string;
};
/**
 * Read and parse the codex auth file. Absence answers `undefined`; a malformed
 * document throws — a file that exists but cannot be trusted must never read
 * as "no login" on the settings page.
 */
export declare function readAuthFile(path: string): Promise<CodexAuthFile | undefined>;
/**
 * Read auth bytes and version facts from one open file descriptor. Atomic
 * replacement after the open leaves this snapshot bound to the old inode, so
 * a later path stat reliably invalidates it instead of pairing old bytes with
 * a new file's timestamp.
 */
export declare function readAuthSnapshot(path: string): Promise<CodexAuthSnapshot | undefined>;
/** Read only the current path version for a cheap credential-cache check. */
export declare function readAuthFileVersion(path: string): Promise<CodexAuthFileVersion | undefined>;
/** Exact equality for the inode and freshness fields used by the auth cache. */
export declare function sameAuthFileVersion(left: CodexAuthFileVersion, right: CodexAuthFileVersion): boolean;
/** The current access-token facts of one auth file. */
export declare function authState(file: CodexAuthFile | undefined): CodexAuthState;
/** Whether the access token is stale enough to warrant a refresh before use. */
export declare function needsRefresh(state: CodexAuthState, leadMs: number): boolean;
/** Whether the recorded refresh is old enough that codex itself would refresh (TOKEN_REFRESH_INTERVAL). */
export declare function refreshTooOld(file: CodexAuthFile | undefined, maxAgeMs: number): boolean;
/**
 * Refresh the token set through the official OAuth endpoint. The request
 * mirrors the codex CLI's own wire format (JSON body, same client_id), so
 * behaviour tracks the primary source exactly.
 */
export declare function refreshTokens(refreshToken: string, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<CodexRefreshReply>;
/** Fold a refresh reply into the auth document, preserving every unknown field. */
export declare function mergeRefreshed(file: CodexAuthFile, reply: CodexRefreshReply): CodexAuthFile;
/** Persist an auth document atomically at 0600, matching the codex CLI's own writes. */
export declare function writeAuthFile(path: string, file: CodexAuthFile): Promise<void>;
//# sourceMappingURL=codex-auth.d.ts.map