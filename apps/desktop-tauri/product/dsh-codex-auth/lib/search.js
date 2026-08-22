import { t as readBoundedResponseText } from "./bounded-response-DpUqUG3z.js";
import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { randomUUID } from "node:crypto";
import { WebError } from "@deepseek-ai/dsh-web";
//#region src/search.ts
/** Codex standalone-search provider and independently live Search row. */
/** Stable provider id selected by DSH's stock `web_search` Capability Tool. */
const CODEX_SEARCH_PROVIDER_ID = "codex";
/** Official standalone search endpoint used by Codex 0.147.0. */
const CODEX_SEARCH_ENDPOINT = "https://chatgpt.com/backend-api/codex/alpha/search";
const CODEX_SEARCH_SETTINGS_NAMESPACE = settingsNamespace("codex-search");
const MAX_SEARCH_ATTEMPTS = 5;
const MAX_SEARCH_RESPONSE_BYTES = 2097152;
const DEFAULT_RETRY_BASE_DELAY_MS = 100;
const Config = z.object({
	enabled: z.boolean().default(true),
	mode: z.union([
		z.const("live"),
		z.const("cached"),
		z.const("indexed")
	]).default("live"),
	contextSize: z.union([
		z.const("low"),
		z.const("medium"),
		z.const("high")
	]).default("medium"),
	fallbackModel: z.string().default("gpt-5.4"),
	maxOutputTokens: z.number().step(1).min(1).default(2048)
});
/** Codex backend implementation behind DSH's existing stock `web_search` tool. */
var CodexSearchProvider = class {
	options;
	id = CODEX_SEARCH_PROVIDER_ID;
	constructor(options) {
		this.options = options;
	}
	available() {
		return this.options.settings().enabled;
	}
	async search(request, signal) {
		throwIfAborted(signal, "CODEX_SEARCH_CANCELLED");
		const settings = this.options.settings();
		if (!settings.enabled) throw new WebError("Codex Web Search is disabled in GPT Auth settings", "CODEX_SEARCH_DISABLED");
		const credential = await this.options.auth.credential(signal);
		if (credential === void 0) throw new WebError("Codex Web Search requires a usable Codex Login State; run `codex login` and try again", "CODEX_AUTH_REQUIRED");
		const body = {
			id: this.options.requestId?.() ?? randomUUID(),
			model: this.options.initiatingModel?.() ?? settings.fallbackModel,
			input: request.query,
			commands: { search_query: [{ q: request.query }] },
			settings: {
				search_context_size: settings.contextSize,
				allowed_callers: ["direct"],
				external_web_access: settings.mode
			},
			max_output_tokens: settings.maxOutputTokens
		};
		return normalizeSearchResponse(await this.dispatch(body, credential, signal));
	}
	async dispatch(body, credential, signal) {
		const retryBaseDelayMs = this.options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
		for (let attempt = 1; attempt <= MAX_SEARCH_ATTEMPTS; attempt += 1) {
			throwIfAborted(signal, "CODEX_SEARCH_CANCELLED");
			let response;
			try {
				response = await this.options.fetchImpl(CODEX_SEARCH_ENDPOINT, {
					method: "POST",
					headers: {
						authorization: `Bearer ${credential.accessToken}`,
						...credential.accountId === void 0 ? {} : { "chatgpt-account-id": credential.accountId },
						"content-type": "application/json",
						originator: "dsh-codex-auth",
						"user-agent": "dsh-codex-auth/0.1.0"
					},
					body: JSON.stringify(body),
					...signal === void 0 ? {} : { signal }
				});
			} catch {
				if (signal?.aborted === true) throw cancelledError("CODEX_SEARCH_CANCELLED", signal);
				if (attempt < MAX_SEARCH_ATTEMPTS) {
					await abortableDelay(retryBaseDelayMs * 2 ** (attempt - 1), signal, "CODEX_SEARCH_CANCELLED");
					continue;
				}
				throw new WebError("Codex Web Search failed after five transport attempts", "CODEX_SEARCH_NETWORK");
			}
			if (response.status === 429) throw new WebError("Codex Web Search was rate-limited; retry later", "CODEX_SEARCH_RATE_LIMIT");
			if (response.status >= 500 && response.status <= 599 && attempt < MAX_SEARCH_ATTEMPTS) {
				await cancelBody(response);
				await abortableDelay(retryBaseDelayMs * 2 ** (attempt - 1), signal, "CODEX_SEARCH_CANCELLED");
				continue;
			}
			if (!response.ok) {
				await cancelBody(response);
				throw new WebError(`Codex Web Search returned HTTP ${response.status}`, "CODEX_SEARCH_UPSTREAM");
			}
			const text = await readBoundedResponseText(response, MAX_SEARCH_RESPONSE_BYTES, signal, {
				tooLarge: () => new WebError("Codex Web Search response exceeded the safe size limit", "CODEX_SEARCH_RESPONSE_TOO_LARGE"),
				cancelled: () => new WebError("Codex Web Search was cancelled", "CODEX_SEARCH_CANCELLED")
			});
			try {
				return JSON.parse(text);
			} catch {
				throw new WebError("Codex Web Search returned an invalid JSON envelope", "CODEX_SEARCH_RESPONSE");
			}
		}
		throw new WebError("Codex Web Search exhausted its retry policy", "CODEX_SEARCH_UPSTREAM");
	}
};
/** Cordis plugin name for the independent Search row. */
const name = "codex-search";
const inject = ["web", "codexAuth"];
/** Register the Global Codex Search Provider with independently live settings. */
function apply(ctx, config) {
	const auth = ctx.get("codexAuth");
	if (auth === void 0) throw new Error("codex-search: shared codexAuth service is unavailable");
	let current = () => config;
	installSettingsSection(ctx, CODEX_SEARCH_SETTINGS_NAMESPACE, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {}
	});
	ctx.web.registerSearchProvider(new CodexSearchProvider({
		auth,
		settings: () => current(),
		fetchImpl: fetch,
		requestId: () => String(ctx.get("agents")?.currentInitiator()?.id ?? randomUUID()),
		initiatingModel: () => initiatingCodexModel(ctx)
	}));
}
function initiatingCodexModel(ctx) {
	const agent = ctx.get("agents")?.currentInitiator();
	if (agent === void 0) return void 0;
	const config = agent.session.requestHeader()?.config;
	const provider = config?.provider ?? agent.options.provider;
	const model = config?.model ?? agent.options.model;
	return provider === "openai-codex" && typeof model === "string" && model.length > 0 ? model : void 0;
}
function normalizeSearchResponse(value) {
	if (!isRecord(value) || typeof value.output !== "string") throw new WebError("Codex Web Search returned an unusable response envelope", "CODEX_SEARCH_RESPONSE");
	const sources = [];
	const seen = /* @__PURE__ */ new Set();
	if (Array.isArray(value.results)) for (const candidate of value.results) {
		if (!isRecord(candidate)) continue;
		const rawUrl = trustedString(candidate.url, 8192) ?? trustedString(candidate.source_url, 8192);
		const url = rawUrl === void 0 ? void 0 : httpUrl(rawUrl);
		if (url === void 0 || seen.has(url)) continue;
		seen.add(url);
		const title = trustedString(candidate.title, 1e3) ?? trustedString(candidate.source_title, 1e3);
		const snippet = trustedString(candidate.snippet, 4e3) ?? trustedString(candidate.text, 4e3);
		sources.push({
			url,
			...title === void 0 ? {} : { title },
			...snippet === void 0 ? {} : { snippet }
		});
	}
	return {
		content: value.output,
		sources,
		truncated: false
	};
}
function trustedString(value, maxLength) {
	if (typeof value !== "string") return void 0;
	const text = value.trim();
	if (text.length === 0 || text.length > maxLength || hasControlCharacter(text)) return void 0;
	return text;
}
function hasControlCharacter(value) {
	for (let index = 0; index < value.length; index += 1) if ((value.charCodeAt(index) || 0) < 32) return true;
	return false;
}
function httpUrl(value) {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : void 0;
	} catch {
		return;
	}
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function cancelBody(response) {
	try {
		await response.body?.cancel();
	} catch {}
}
function throwIfAborted(signal, code) {
	if (signal?.aborted === true) throw cancelledError(code, signal);
}
function cancelledError(code, _signal) {
	return new WebError("Codex Web Search was cancelled", code);
}
function abortableDelay(ms, signal, code) {
	if (ms <= 0) {
		throwIfAborted(signal, code);
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const onAbort = () => {
			cleanup();
			reject(cancelledError(code, signal));
		};
		const cleanup = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}
//#endregion
export { CODEX_SEARCH_ENDPOINT, CODEX_SEARCH_PROVIDER_ID, CODEX_SEARCH_SETTINGS_NAMESPACE, CodexSearchProvider, Config, apply, inject, name };
