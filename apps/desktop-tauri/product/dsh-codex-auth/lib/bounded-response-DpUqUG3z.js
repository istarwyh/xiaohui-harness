import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { homedir } from "node:os";
import { join } from "node:path";
import { open, readFile, stat } from "node:fs/promises";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { LlmError, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
//#region src/codex-auth.ts
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
const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
/** The OAuth token endpoint the codex CLI refreshes through. */
const CODEX_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
/** Default lead time before the access token expires that a refresh is triggered. */
const DEFAULT_REFRESH_LEAD_MS = 3e5;
/** Refresh when the last recorded refresh is older than this (the codex CLI's own TOKEN_REFRESH_INTERVAL). */
const MAX_REFRESH_AGE_MS = 6912e5;
/** The auth file path for the current environment (CODEX_HOME overrides ~/.codex). */
function defaultAuthJsonPath(env = process.env) {
	const home = env.CODEX_HOME;
	return home !== void 0 && home.length > 0 ? join(home, "auth.json") : join(homedir(), ".codex", "auth.json");
}
/**
* Decode the JWT payload of a codex access token without verifying it. The
* chatgpt_account_id claim is the one pi-ai's codex provider extracts to set
* the `chatgpt-account-id` request header.
*/
function decodeAccessToken(token) {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return {};
		const payload = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
		const auth = payload["https://api.openai.com/auth"];
		return {
			...typeof payload.exp === "number" && Number.isFinite(payload.exp) ? { expSeconds: payload.exp } : {},
			...typeof auth?.chatgpt_account_id === "string" ? { chatgptAccountId: auth.chatgpt_account_id } : {},
			...typeof auth?.chatgpt_plan_type === "string" ? { chatgptPlanType: auth.chatgpt_plan_type } : {}
		};
	} catch {
		return {};
	}
}
/**
* Read and parse the codex auth file. Absence answers `undefined`; a malformed
* document throws — a file that exists but cannot be trusted must never read
* as "no login" on the settings page.
*/
async function readAuthFile(path) {
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isNotFound(error)) return void 0;
		throw error;
	}
	return parseAuthFile(path, text);
}
/**
* Read auth bytes and version facts from one open file descriptor. Atomic
* replacement after the open leaves this snapshot bound to the old inode, so
* a later path stat reliably invalidates it instead of pairing old bytes with
* a new file's timestamp.
*/
async function readAuthSnapshot(path) {
	let handle;
	try {
		handle = await open(path, "r");
	} catch (error) {
		if (isNotFound(error)) return void 0;
		throw error;
	}
	try {
		const before = versionFromStat(await handle.stat({ bigint: true }));
		const text = await handle.readFile("utf8");
		const after = versionFromStat(await handle.stat({ bigint: true }));
		if (!sameAuthFileVersion(before, after)) throw new Error(`codex-auth: ${path} changed while it was being read`);
		return {
			file: parseAuthFile(path, text),
			version: after
		};
	} finally {
		await handle.close();
	}
}
/** Read only the current path version for a cheap credential-cache check. */
async function readAuthFileVersion(path) {
	try {
		return versionFromStat(await stat(path, { bigint: true }));
	} catch (error) {
		if (isNotFound(error)) return void 0;
		throw error;
	}
}
/** Exact equality for the inode and freshness fields used by the auth cache. */
function sameAuthFileVersion(left, right) {
	return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function versionFromStat(value) {
	return {
		dev: value.dev,
		ino: value.ino,
		size: value.size,
		mtimeNs: value.mtimeNs,
		ctimeNs: value.ctimeNs
	};
}
function parseAuthFile(path, text) {
	const parsed = JSON.parse(text);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError(`codex-auth: ${path} must be a JSON object`);
	return parsed;
}
function isNotFound(error) {
	return error?.code === "ENOENT";
}
/** The current access-token facts of one auth file. */
function authState(file) {
	const accessToken = typeof file?.tokens?.access_token === "string" && file.tokens.access_token.length > 0 ? file.tokens.access_token : void 0;
	const expSeconds = accessToken === void 0 ? void 0 : decodeAccessToken(accessToken).expSeconds;
	return {
		file,
		accessToken,
		accessTokenExpiresAt: expSeconds === void 0 ? void 0 : expSeconds * 1e3
	};
}
/** Whether the access token is stale enough to warrant a refresh before use. */
function needsRefresh(state, leadMs) {
	return state.accessTokenExpiresAt !== void 0 && state.accessTokenExpiresAt - Date.now() < leadMs;
}
/** Whether the recorded refresh is old enough that codex itself would refresh (TOKEN_REFRESH_INTERVAL). */
function refreshTooOld(file, maxAgeMs) {
	if (typeof file?.last_refresh !== "string" || file.last_refresh.length === 0) return false;
	const at = Date.parse(file.last_refresh);
	return Number.isFinite(at) && Date.now() - at > maxAgeMs;
}
/**
* Refresh the token set through the official OAuth endpoint. The request
* mirrors the codex CLI's own wire format (JSON body, same client_id), so
* behaviour tracks the primary source exactly.
*/
async function refreshTokens(refreshToken, fetchImpl = fetch, signal) {
	const response = await fetchImpl(CODEX_OAUTH_TOKEN_URL, {
		method: "POST",
		...signal === void 0 ? {} : { signal },
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			client_id: CODEX_OAUTH_CLIENT_ID,
			grant_type: "refresh_token",
			refresh_token: refreshToken
		})
	});
	if (!response.ok) throw new Error(`codex-auth: token refresh answered ${response.status}`);
	const parsed = await response.json();
	if (typeof parsed !== "object" || parsed === null) throw new Error("codex-auth: token refresh reply is not a JSON object");
	const reply = parsed;
	if (typeof reply.access_token !== "string" || reply.access_token.length === 0) throw new Error("codex-auth: token refresh reply carries no access_token");
	return {
		access_token: reply.access_token,
		...typeof reply.refresh_token === "string" ? { refresh_token: reply.refresh_token } : {},
		...typeof reply.id_token === "string" ? { id_token: reply.id_token } : {},
		...typeof reply.account_id === "string" ? { account_id: reply.account_id } : {}
	};
}
/** Fold a refresh reply into the auth document, preserving every unknown field. */
function mergeRefreshed(file, reply) {
	return {
		...file,
		tokens: {
			...file.tokens,
			access_token: reply.access_token,
			...reply.refresh_token === void 0 ? {} : { refresh_token: reply.refresh_token },
			...reply.id_token === void 0 ? {} : { id_token: reply.id_token },
			...reply.account_id === void 0 ? {} : { account_id: reply.account_id }
		},
		last_refresh: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/** Persist an auth document atomically at 0600, matching the codex CLI's own writes. */
async function writeAuthFile(path, file) {
	await writeFileAtomic(path, `${JSON.stringify(file, null, 2)}\n`, {
		mode: 384,
		dirMode: 448
	});
}
//#endregion
//#region src/codex-context.ts
/** Durable settings namespace for Codex LLM route preferences. */
const CODEX_LLM_SETTINGS_NAMESPACE = settingsNamespace("codex-llm");
/** Explicit opt-in budget matching Codex's documented one-million-token configuration. */
const CODEX_LONG_CONTEXT_WINDOW = 1e6;
const LONG_CONTEXT_MODEL_IDS = /* @__PURE__ */ new Set([
	"gpt-5.6-luna",
	"gpt-5.6-sol",
	"gpt-5.6-terra"
]);
const CodexLlmSettingsConfig = z.object({ longContextEnabled: z.boolean().default(false) });
/**
* Apply the plugin's narrow context policy without mutating pi-ai's generated
* catalog. Enabling the policy changes only the known GPT-5.6 family; every
* other descriptor and every non-capacity field remains provider-owned.
*/
function applyCodexContextPolicy(models, settings) {
	if (!settings.longContextEnabled) return models;
	return models.map((model) => LONG_CONTEXT_MODEL_IDS.has(model.id) ? {
		...model,
		contextWindow: CODEX_LONG_CONTEXT_WINDOW
	} : model);
}
//#endregion
//#region src/codex-auth-adapter.ts
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
/** The provider route this adapter registers. */
const CODEX_ROUTE = "openai-codex";
/** Default WebSocket connect timeout when a non-SSE transport is selected. */
const DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS = 5e3;
/** Default request timeout: the SSE response-header phase, and the WebSocket message idle interval. */
const DEFAULT_REQUEST_TIMEOUT_MS = 12e4;
/** Provider-idle ceiling for one outstanding stream read, mirroring llm-pi-ai's default. */
const STREAM_IDLE_TIMEOUT_MS = 3e5;
/** rc1's default maximum encoded image payload for one pi-ai request. */
const MAX_REQUEST_IMAGE_BYTES = 20971520;
/**
* Codex owns authentication in the Host-side coordinator and injects its token
* through `resolveApiKey` for each request. Pi-ai's login/storage surface must
* therefore remain deliberately inert: allowing it to discover or persist a
* second credential would break the single-source and secret-boundary rules.
*/
function codexAuthInjection() {
	return {
		credentials: {
			read: async () => void 0,
			list: async () => [],
			modify: async () => {
				throw new LlmError("llm-codex-auth: pi-ai credential persistence is disabled; use the Codex auth coordinator", "AUTH_PERSISTENCE_DISABLED");
			},
			delete: async () => {}
		},
		authContext: {
			env: async () => void 0,
			fileExists: async () => false
		}
	};
}
/**
* Api-key auth for a harness-authenticated route, mirroring llm-pi-ai's own
* helper: pi-ai honours a request's `apiKey` override only when the provider
* declares an api-key method, and the installed codex provider declares OAuth
* alone — so the method must be added beside it.
*/
function harnessApiKeyAuth(name) {
	return {
		name,
		resolve: ({ credential }) => Promise.resolve({
			auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
			source: name
		})
	};
}
/**
* The installed pi-ai catalog provider for the codex route, with the harness
* api-key method added beside its native OAuth — the same construction
* llm-pi-ai uses for a profile that names a credential on an OAuth-only
* catalog route.
*/
function codexProvider(displayName, settings) {
	const base = builtinProviders().find((candidate) => candidate.id === CODEX_ROUTE);
	if (base === void 0) throw new Error("llm-codex-auth: the installed pi-ai catalog ships no openai-codex provider");
	return {
		id: base.id,
		name: displayName,
		...base.baseUrl === void 0 ? {} : { baseUrl: base.baseUrl },
		auth: {
			...base.auth,
			apiKey: harnessApiKeyAuth(displayName)
		},
		getModels: () => applyCodexContextPolicy(base.getModels(), settings()),
		stream: (model, context, options) => base.stream(model, context, options),
		streamSimple: (model, context, options) => base.streamSimple(model, context, options)
	};
}
/**
* The codex-auth LLM adapter: one fixed `openai-codex` profile over the
* installed pi-ai provider, with the credential resolved from the codex auth
* file per request.
*/
var CodexAuthAdapter = class extends PiAiAdapter {
	constructor(ctx, options) {
		const profile = {
			provider: CODEX_ROUTE,
			displayName: options.displayName,
			streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
			maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
			retryPolicy: resolveRetryPolicy(void 0, `llm-codex-auth: provider "${CODEX_ROUTE}" retryPolicy`),
			piProvider: codexProvider(options.displayName, options.settings),
			configuredMaxTokens: /* @__PURE__ */ new Map(),
			transport: options.transport,
			websocketConnectTimeoutMs: options.websocketConnectTimeoutMs,
			timeoutMs: options.timeoutMs
		};
		const profiles = /* @__PURE__ */ new Map([[CODEX_ROUTE, profile]]);
		super({
			profiles: () => profiles,
			auth: codexAuthInjection(),
			resolveApiKey: async () => {
				const credential = await options.auth.credential();
				if (credential === void 0) throw new LlmError(`llm-codex-auth: no usable ChatGPT login for "${CODEX_ROUTE}"; run "codex login" (or use the "${options.credentialRef}" card on the Settings page) to sign in`, "MISSING_CREDENTIAL");
				return credential.accessToken;
			},
			resolveAttachments: () => ctx.get("attachments")
		});
	}
};
//#endregion
//#region src/bounded-response.ts
async function readBoundedResponseText(response, maxBytes, signal, errors) {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) {
		await cancelResponseBody(response);
		throw errors.tooLarge();
	}
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			if (signal?.aborted === true && errors.cancelled !== void 0) throw errors.cancelled();
			const next = await reader.read();
			if (next.done) break;
			total += next.value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw errors.tooLarge();
			}
			chunks.push(next.value);
		}
	} catch (error) {
		if (signal?.aborted === true && errors.cancelled !== void 0) throw errors.cancelled();
		throw error;
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}
async function cancelResponseBody(response) {
	try {
		await response.body?.cancel();
	} catch {}
}
//#endregion
export { readAuthSnapshot as _, DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS as a, sameAuthFileVersion as b, DEFAULT_REFRESH_LEAD_MS as c, decodeAccessToken as d, defaultAuthJsonPath as f, readAuthFileVersion as g, readAuthFile as h, DEFAULT_REQUEST_TIMEOUT_MS as i, MAX_REFRESH_AGE_MS as l, needsRefresh as m, CODEX_ROUTE as n, CODEX_LLM_SETTINGS_NAMESPACE as o, mergeRefreshed as p, CodexAuthAdapter as r, CodexLlmSettingsConfig as s, readBoundedResponseText as t, authState as u, refreshTokens as v, writeAuthFile as x, refreshTooOld as y };
