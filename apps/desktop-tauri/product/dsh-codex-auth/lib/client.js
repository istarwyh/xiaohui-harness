window.__ModuleLoader__.load({
	id: "dsh-codex-auth",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		//#region src/rpc-contract.ts
		/** Logical channel registered by the plugin's Host half and called by its browser half. */
		const CODEX_AUTH_RPC_CHANNEL = "/codex-auth";
		/** Build the browser face over Connection's plugin-owned unary channel. */
		function createCodexAuthRpcClient(rpc) {
			return {
				status: async (signal) => {
					const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, "status", {}, signal);
					if (!result.ok) return result;
					const status = parseStatusResult(result.value);
					return status === void 0 ? invalidResponse("status") : {
						ok: true,
						value: { status }
					};
				},
				usage: async (signal) => {
					const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, "usage", {}, signal);
					if (!result.ok) return result;
					const usage = parseUsageResult(result.value);
					return usage === void 0 ? invalidResponse("usage") : {
						ok: true,
						value: { usage }
					};
				},
				login: async (mode, signal) => {
					const result = await rpc.call(CODEX_AUTH_RPC_CHANNEL, "login", { mode }, signal);
					if (!result.ok) return result;
					return isRecord$1(result.value) && typeof result.value.started === "boolean" ? {
						ok: true,
						value: { started: result.value.started }
					} : invalidResponse("login");
				}
			};
		}
		function parseStatusResult(value) {
			if (!isRecord$1(value) || !isRecord$1(value.status)) return void 0;
			const status = value.status;
			if (typeof status.available !== "boolean" || typeof status.configured !== "boolean" || typeof status.credentialRef !== "string" || typeof status.authFileExists !== "boolean") return void 0;
			for (const key of [
				"authMode",
				"codexVersion",
				"tokenExpiresAt",
				"lastRefreshAt",
				"accountId",
				"planType"
			]) if (status[key] !== void 0 && typeof status[key] !== "string") return void 0;
			return {
				available: status.available,
				configured: status.configured,
				...typeof status.authMode === "string" ? { authMode: status.authMode } : {},
				...typeof status.codexVersion === "string" ? { codexVersion: status.codexVersion } : {},
				...typeof status.tokenExpiresAt === "string" ? { tokenExpiresAt: status.tokenExpiresAt } : {},
				...typeof status.lastRefreshAt === "string" ? { lastRefreshAt: status.lastRefreshAt } : {},
				...typeof status.accountId === "string" ? { accountId: status.accountId } : {},
				...typeof status.planType === "string" ? { planType: status.planType } : {},
				credentialRef: status.credentialRef,
				authFileExists: status.authFileExists
			};
		}
		function parseUsageResult(value) {
			if (!isRecord$1(value) || !isRecord$1(value.usage)) return void 0;
			const usage = value.usage;
			if (usage.planType !== void 0 && typeof usage.planType !== "string") return void 0;
			if (usage.weeklyResetAt !== void 0 && typeof usage.weeklyResetAt !== "string") return void 0;
			if (usage.weeklyRemainingPercent !== void 0 && (!Number.isSafeInteger(usage.weeklyRemainingPercent) || usage.weeklyRemainingPercent < 0 || usage.weeklyRemainingPercent > 100)) return void 0;
			return {
				...typeof usage.planType === "string" ? { planType: usage.planType } : {},
				...typeof usage.weeklyRemainingPercent === "number" ? { weeklyRemainingPercent: usage.weeklyRemainingPercent } : {},
				...typeof usage.weeklyResetAt === "string" ? { weeklyResetAt: usage.weeklyResetAt } : {}
			};
		}
		function invalidResponse(endpoint) {
			return {
				ok: false,
				error: {
					code: "internal",
					message: `codex-auth: invalid ${endpoint} response from Host`,
					details: {}
				}
			};
		}
		function isRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		//#endregion
		//#region \0dsh-css:src/client/CodexCapabilitySettings.module.css.mjs
		const css$2 = "._bdKNq_bundle{max-width:820px;color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased;flex-direction:column;gap:16px;display:flex}._bdKNq_bundleHeader{justify-content:space-between;align-items:flex-start;gap:20px;display:flex}._bdKNq_bundleTitleLine{align-items:center;gap:8px;display:flex}._bdKNq_bundleTitle{letter-spacing:-.015em;text-wrap:balance;margin:0;font-size:20px;font-weight:600;line-height:28px}._bdKNq_titleDot{cursor:default;flex:none;justify-content:center;align-items:center;display:inline-flex}._bdKNq_srOnly{clip:rect(0, 0, 0, 0);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}._bdKNq_bundleIntro,._bdKNq_cardIntro{color:var(--dsw-alias-label-tertiary);text-wrap:pretty;margin:4px 0 0;font-size:13px;line-height:20px}._bdKNq_cards{flex-direction:column;gap:14px;display:flex}._bdKNq_card{background:var(--dsw-alias-bg-layer-2);box-shadow:0 1px 3px #0000000d, inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:16px;flex-direction:column;gap:14px;padding:18px 20px;transition-property:gap;transition-duration:.2s;transition-timing-function:cubic-bezier(.2,0,0,1);display:flex}._bdKNq_card[data-collapsed=true]{gap:0}._bdKNq_contextCard{gap:10px}._bdKNq_cardHeader{justify-content:space-between;align-items:flex-start;gap:16px;display:flex}._bdKNq_cardIdentity{flex:1;min-width:0}._bdKNq_cardTitleLine{align-items:center;gap:8px;display:flex}._bdKNq_cardTitle{color:var(--dsw-alias-label-primary);text-wrap:balance;margin:0;font-size:15px;font-weight:600;line-height:22px}._bdKNq_cardAction{flex:none;align-items:center;gap:8px;padding-top:2px;display:flex}._bdKNq_disclosureButton{border-radius:999px;width:32px;min-width:32px;height:32px;padding:0;transition-property:transform,background-color;transition-duration:.14s;position:relative}._bdKNq_disclosureButton:before{content:\"\";border-radius:999px;position:absolute;inset:-4px}._bdKNq_disclosureButton:active:not(:disabled){transform:scale(.96)}._bdKNq_disclosureIcon{justify-content:center;align-items:center;transition-property:transform;transition-duration:.2s;transition-timing-function:cubic-bezier(.2,0,0,1);display:inline-flex}._bdKNq_disclosureIcon[data-expanded=true]{transform:rotate(180deg)}._bdKNq_collapsibleRegion{opacity:0;visibility:hidden;grid-template-rows:0fr;transition:grid-template-rows .2s cubic-bezier(.2,0,0,1),opacity .15s cubic-bezier(.2,0,0,1),visibility 0s cubic-bezier(.2,0,0,1) .2s;display:grid}._bdKNq_collapsibleRegion[data-expanded=true]{opacity:1;visibility:visible;grid-template-rows:1fr;transition-delay:0s}._bdKNq_collapsibleInner{min-height:0;overflow:hidden}._bdKNq_badge{background:var(--dsw-alias-bg-layer-3);min-height:22px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:999px;align-items:center;padding:0 8px;font-size:11px;line-height:18px;display:inline-flex}._bdKNq_badge[data-tone=warning]{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-label);box-shadow:none}._bdKNq_contextDetails{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:4px;font-size:12px;line-height:18px;display:flex}._bdKNq_contextDetails p{text-wrap:pretty;margin:0}._bdKNq_contextWarning{color:var(--dsw-alias-state-warn-label,#b45309)}._bdKNq_authDashboard{background:var(--dsw-alias-bg-layer-3);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:12px;padding:14px 16px;display:flex}._bdKNq_facts{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;margin:0;display:grid}._bdKNq_fact{min-width:0}._bdKNq_fact dt{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}._bdKNq_fact dd{color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;font-variant-numeric:tabular-nums;margin:2px 0 0;font-size:13px;font-weight:500;line-height:18px}._bdKNq_quotaContainer{border-top:1px solid var(--dsw-alias-border-l1,#0000000f);flex-direction:column;gap:6px;padding-top:10px;display:flex}._bdKNq_quotaInfo{justify-content:space-between;align-items:center;font-size:12px;line-height:18px;display:flex}._bdKNq_quotaLabel{color:var(--dsw-alias-label-tertiary)}._bdKNq_quotaValue{font-variant-numeric:tabular-nums;font-weight:600;animation:.25s _bdKNq_fadeIn}._bdKNq_quotaValue[data-tone=normal]{color:var(--dsw-alias-state-success-label,#10b981)}._bdKNq_quotaValue[data-tone=warning]{color:var(--dsw-alias-state-warn-label,#f59e0b)}._bdKNq_quotaValue[data-tone=error]{color:var(--dsw-alias-state-error-label,#ef4444)}._bdKNq_progressTrack{background:var(--dsw-alias-bg-layer-1);height:6px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:999px;position:relative;overflow:hidden}@keyframes _bdKNq_fillProgress{0%{opacity:.7;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}._bdKNq_progressFill{transform-origin:0;border-radius:999px;height:100%;transition:width .4s cubic-bezier(.16,1,.3,1),background .4s;animation:.65s cubic-bezier(.16,1,.3,1) forwards _bdKNq_fillProgress}._bdKNq_progressFill[data-tone=normal]{background:linear-gradient(90deg,#f59e0b 0%,#10b981 35%,#059669 100%)}._bdKNq_progressFill[data-tone=warning]{background:linear-gradient(90deg,#ef4444 0%,#f97316 40%,#f59e0b 100%)}._bdKNq_progressFill[data-tone=error]{background:linear-gradient(90deg,#f87171 0%,#ef4444 50%,#dc2626 100%)}._bdKNq_quotaQuerying{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;font-size:12px;line-height:18px;animation:.2s _bdKNq_fadeIn;display:inline-flex}@keyframes _bdKNq_fadeIn{0%{opacity:0}to{opacity:1}}._bdKNq_queryingSpinner{border:1.5px solid var(--dsw-alias-border-l2,#0000001f);border-top-color:var(--dsw-alias-brand-primary,#4f6ef7);border-radius:50%;flex:none;width:10px;height:10px;animation:.8s linear infinite _bdKNq_spin;display:inline-block}@keyframes _bdKNq_shimmerStream{0%{background-position:-200% 0}to{background-position:200% 0}}._bdKNq_shimmerTrack{background:linear-gradient(90deg, transparent 0%, var(--dsw-alias-fill-tertiary,#0000000f) 25%, var(--dsw-alias-fill-secondary,#00000024) 50%, var(--dsw-alias-fill-tertiary,#0000000f) 75%, transparent 100%);background-size:200% 100%;border-radius:999px;width:100%;height:100%;animation:1.6s ease-in-out infinite _bdKNq_shimmerStream;position:absolute;inset:0}._bdKNq_actions{flex-wrap:wrap;align-items:center;gap:10px;display:flex}._bdKNq_actions ._bdKNq_compactButton{border-radius:999px;gap:6px;height:32px;padding:0 14px;font-size:13px;line-height:20px;transition-property:transform,background-color,border-color,opacity;transition-duration:.14s;position:relative}._bdKNq_compactButton:before{content:\"\";border-radius:999px;position:absolute;inset:-4px}._bdKNq_compactButton:active:not(:disabled){transform:scale(.96)}._bdKNq_privacyNotice{color:var(--dsw-alias-label-tertiary);text-wrap:pretty;margin:-2px 0 0;font-size:11px;line-height:17px}._bdKNq_refresh{justify-content:center;min-width:104px;margin-left:auto}._bdKNq_actions ._bdKNq_compactButton._bdKNq_refresh{padding:0 10px}@keyframes _bdKNq_spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}._bdKNq_spinIcon{justify-content:center;align-items:center;animation:.75s cubic-bezier(.4,0,.2,1) infinite _bdKNq_spin;display:inline-flex}._bdKNq_staticIcon{justify-content:center;align-items:center;display:inline-flex}@keyframes _bdKNq_shimmer{0%{background-position:-200% 0}to{background-position:200% 0}}._bdKNq_skeletonLine,._bdKNq_skeletonLabel,._bdKNq_skeletonValue,._bdKNq_skeletonTag,._bdKNq_skeletonRow,._bdKNq_skeletonShimmerTrack,._bdKNq_skeletonInlineValue{background:linear-gradient(90deg, var(--dsw-alias-bg-layer-1) 25%, var(--dsw-alias-fill-tertiary,#00000014) 50%, var(--dsw-alias-bg-layer-1) 75%);background-size:200% 100%;border-radius:6px;animation:1.6s ease-in-out infinite _bdKNq_shimmer}._bdKNq_skeletonFacts{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px;display:grid}._bdKNq_skeletonFactItem{flex-direction:column;gap:6px;display:flex}._bdKNq_skeletonLabel{width:48px;height:14px}._bdKNq_skeletonValue{width:96px;height:18px}._bdKNq_skeletonInlineValue{vertical-align:middle;width:72px;height:16px;display:inline-block}._bdKNq_skeletonTag{border-radius:4px;width:36px;height:14px}._bdKNq_skeletonShimmerTrack{border-radius:999px;width:100%;height:100%}._bdKNq_skeletonFormRows{flex-direction:column;gap:10px;padding:8px 0;display:flex}._bdKNq_skeletonRow{border-radius:8px;width:100%;height:38px}._bdKNq_formRows{flex-direction:column;margin-top:4px;transition:opacity .18s;display:flex}._bdKNq_formRows[data-dimmed=true]{opacity:.5;pointer-events:none}._bdKNq_formRow{border-top:1px solid var(--dsw-alias-border-l1,#0000000d);justify-content:space-between;align-items:center;gap:16px;min-height:44px;padding:6px 0;display:flex}._bdKNq_formLabel{min-width:0;color:var(--dsw-alias-label-secondary);flex:1;font-size:13px;line-height:20px}._bdKNq_formField{flex:none;align-items:center;display:flex}._bdKNq_formField input,._bdKNq_formField select{background:var(--dsw-alias-bg-layer-3);width:100%;min-width:160px;max-width:220px;height:32px;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;font-variant-numeric:tabular-nums;border:0;border-radius:8px;outline:none;padding:0 10px;font-size:13px;transition-property:box-shadow,background-color;transition-duration:.14s}._bdKNq_formField input:focus-visible,._bdKNq_formField select:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4f6ef7)}._bdKNq_formField input:disabled,._bdKNq_formField select:disabled{cursor:not-allowed;opacity:.62}._bdKNq_switchToggle{cursor:pointer;flex:none;width:38px;height:22px;display:inline-block;position:relative}._bdKNq_switchToggle input{opacity:0;width:0;height:0;margin:0;position:absolute}._bdKNq_switchSlider{background:var(--dsw-alias-fill-tertiary,var(--dsw-alias-border-l2));box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);border-radius:999px;transition-property:background-color,box-shadow;transition-duration:.18s;transition-timing-function:cubic-bezier(.2,0,0,1);position:absolute;inset:0}._bdKNq_switchSlider:after{content:\"\";background:#fff;border-radius:50%;width:16px;height:16px;transition-property:transform;transition-duration:.18s;transition-timing-function:cubic-bezier(.2,0,0,1);position:absolute;top:3px;left:3px;transform:translate(0);box-shadow:0 1px 3px #00000038}._bdKNq_switchToggle input:checked+._bdKNq_switchSlider{background:var(--dsw-alias-brand-primary,#4f6ef7)}._bdKNq_switchToggle input:checked+._bdKNq_switchSlider:after{transform:translate(16px)}._bdKNq_switchToggle:has(input:focus-visible) ._bdKNq_switchSlider{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4f6ef7)}._bdKNq_switchToggle:has(input:disabled){cursor:not-allowed;opacity:.55}._bdKNq_loading,._bdKNq_error,._bdKNq_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}._bdKNq_error{color:var(--dsw-alias-state-error-primary)}@media (width<=640px){._bdKNq_bundleHeader,._bdKNq_cardHeader{align-items:flex-start}._bdKNq_facts{grid-template-columns:minmax(0,1fr)}._bdKNq_formField input,._bdKNq_formField select{min-width:120px;max-width:140px}._bdKNq_refresh{margin-left:0}}@media (prefers-reduced-motion:reduce){._bdKNq_card,._bdKNq_compactButton,._bdKNq_disclosureButton,._bdKNq_disclosureIcon,._bdKNq_collapsibleRegion,._bdKNq_switchSlider,._bdKNq_switchSlider:after,._bdKNq_quotaValue,._bdKNq_quotaQuerying,._bdKNq_progressFill,._bdKNq_queryingSpinner,._bdKNq_shimmerTrack,._bdKNq_spinIcon,._bdKNq_skeletonLine,._bdKNq_skeletonLabel,._bdKNq_skeletonValue,._bdKNq_skeletonTag,._bdKNq_skeletonRow,._bdKNq_skeletonShimmerTrack,._bdKNq_skeletonInlineValue,._bdKNq_formField input,._bdKNq_formField select{transition-duration:.01ms;animation:none}}";
		const tagId$2 = "dsh-codex-auth/CodexCapabilitySettings.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-codex-auth";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var CodexCapabilitySettings_module_css_default = {
			"contextDetails": "_bdKNq_contextDetails",
			"refresh": "_bdKNq_refresh",
			"skeletonFormRows": "_bdKNq_skeletonFormRows",
			"skeletonValue": "_bdKNq_skeletonValue",
			"actions": "_bdKNq_actions",
			"spinIcon": "_bdKNq_spinIcon",
			"skeletonShimmerTrack": "_bdKNq_skeletonShimmerTrack",
			"collapsibleInner": "_bdKNq_collapsibleInner",
			"contextWarning": "_bdKNq_contextWarning",
			"privacyNotice": "_bdKNq_privacyNotice",
			"cardIntro": "_bdKNq_cardIntro",
			"fadeIn": "_bdKNq_fadeIn",
			"progressTrack": "_bdKNq_progressTrack",
			"fillProgress": "_bdKNq_fillProgress",
			"shimmer": "_bdKNq_shimmer",
			"staticIcon": "_bdKNq_staticIcon",
			"srOnly": "_bdKNq_srOnly",
			"fact": "_bdKNq_fact",
			"switchSlider": "_bdKNq_switchSlider",
			"titleDot": "_bdKNq_titleDot",
			"bundleIntro": "_bdKNq_bundleIntro",
			"bundleTitle": "_bdKNq_bundleTitle",
			"quotaValue": "_bdKNq_quotaValue",
			"cardIdentity": "_bdKNq_cardIdentity",
			"collapsibleRegion": "_bdKNq_collapsibleRegion",
			"disclosureIcon": "_bdKNq_disclosureIcon",
			"authDashboard": "_bdKNq_authDashboard",
			"bundleHeader": "_bdKNq_bundleHeader",
			"skeletonLabel": "_bdKNq_skeletonLabel",
			"skeletonRow": "_bdKNq_skeletonRow",
			"formLabel": "_bdKNq_formLabel",
			"disclosureButton": "_bdKNq_disclosureButton",
			"skeletonInlineValue": "_bdKNq_skeletonInlineValue",
			"progressFill": "_bdKNq_progressFill",
			"queryingSpinner": "_bdKNq_queryingSpinner",
			"skeletonLine": "_bdKNq_skeletonLine",
			"formRows": "_bdKNq_formRows",
			"error": "_bdKNq_error",
			"quotaContainer": "_bdKNq_quotaContainer",
			"bundleTitleLine": "_bdKNq_bundleTitleLine",
			"cards": "_bdKNq_cards",
			"card": "_bdKNq_card",
			"skeletonTag": "_bdKNq_skeletonTag",
			"shimmerTrack": "_bdKNq_shimmerTrack",
			"cardTitle": "_bdKNq_cardTitle",
			"badge": "_bdKNq_badge",
			"contextCard": "_bdKNq_contextCard",
			"skeletonFactItem": "_bdKNq_skeletonFactItem",
			"spin": "_bdKNq_spin",
			"formRow": "_bdKNq_formRow",
			"formField": "_bdKNq_formField",
			"quotaInfo": "_bdKNq_quotaInfo",
			"cardAction": "_bdKNq_cardAction",
			"switchToggle": "_bdKNq_switchToggle",
			"quotaLabel": "_bdKNq_quotaLabel",
			"bundle": "_bdKNq_bundle",
			"quotaQuerying": "_bdKNq_quotaQuerying",
			"cardHeader": "_bdKNq_cardHeader",
			"skeletonFacts": "_bdKNq_skeletonFacts",
			"hint": "_bdKNq_hint",
			"facts": "_bdKNq_facts",
			"cardTitleLine": "_bdKNq_cardTitleLine",
			"loading": "_bdKNq_loading",
			"compactButton": "_bdKNq_compactButton",
			"shimmerStream": "_bdKNq_shimmerStream"
		};
		//#endregion
		//#region src/client/CodexCapabilitySettings.tsx
		/** Unified four-card settings surface for the Codex Capability Bundle. */
		/** One navigable GPT Auth section containing Auth/LLM, Search, and Image Creation cards. */
		function CodexCapabilitySettings({ rpc, t, subscribe, llmScope, searchScope, imageScope }) {
			const [status, setStatus] = (0, react.useState)(null);
			const [usage, setUsage] = (0, react.useState)(null);
			const [usageBusy, setUsageBusy] = (0, react.useState)(true);
			const [loadState, setLoadState] = (0, react.useState)("loading");
			const [error, setError] = (0, react.useState)(null);
			const [loginBusy, setLoginBusy] = (0, react.useState)(false);
			const [refreshBusy, setRefreshBusy] = (0, react.useState)(false);
			const [tick, setTick] = (0, react.useState)(0);
			const [searchExpanded, setSearchExpanded] = (0, react.useState)(false);
			const [imageExpanded, setImageExpanded] = (0, react.useState)(false);
			const searchRegionId = (0, react.useId)();
			const imageRegionId = (0, react.useId)();
			const llm = useScope(llmScope);
			const search = useScope(searchScope);
			const image = useScope(imageScope);
			(0, react.useEffect)(() => subscribe(() => {
				setTick((value) => value + 1);
			}), [subscribe]);
			const load = (0, react.useCallback)(async () => {
				setRefreshBusy(true);
				setError(null);
				const minDelay = new Promise((resolve) => setTimeout(resolve, 500));
				try {
					const [result] = await Promise.all([rpc.status(), minDelay]);
					if (!result.ok) {
						setLoadState((previous) => previous === "ready" ? previous : "error");
						setError(result.error.message || t("statusFailed"));
						return;
					}
					setStatus(result.value.status);
					setLoadState("ready");
				} catch (cause) {
					setLoadState((previous) => previous === "ready" ? previous : "error");
					setError(messageOf(cause, t("statusFailed")));
				} finally {
					setRefreshBusy(false);
				}
			}, [rpc, t]);
			const loadUsage = (0, react.useCallback)(async () => {
				setUsageBusy(true);
				try {
					const result = await rpc.usage();
					if (result.ok) setUsage(result.value.usage);
				} catch {} finally {
					setUsageBusy(false);
				}
			}, [rpc]);
			(0, react.useEffect)(() => {
				load();
				loadUsage();
			}, [
				load,
				loadUsage,
				tick
			]);
			const startLogin = (0, react.useCallback)(async (mode) => {
				setLoginBusy(true);
				setError(null);
				try {
					const result = await rpc.login(mode);
					if (!result.ok) setError(result.error.message || t("loginFailed"));
				} catch (cause) {
					setError(messageOf(cause, t("loginFailed")));
				} finally {
					setLoginBusy(false);
				}
			}, [rpc, t]);
			const searchUnavailable = status?.configured !== true;
			const imageUnavailable = status?.configured !== true || status.planType?.toLowerCase() === "free";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: CodexCapabilitySettings_module_css_default.bundle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
						className: CodexCapabilitySettings_module_css_default.bundleHeader,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CodexCapabilitySettings_module_css_default.bundleTitleLine,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
								className: CodexCapabilitySettings_module_css_default.bundleTitle,
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, {
								loadState,
								status,
								t
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: CodexCapabilitySettings_module_css_default.bundleIntro,
							children: t("intro")
						})] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodexCapabilitySettings_module_css_default.cards,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: CodexCapabilitySettings_module_css_default.card,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardHeading, {
										title: t("authCardTitle"),
										intro: t("authCardIntro")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AuthBody, {
										status,
										usage,
										usageBusy,
										loadState,
										t
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: CodexCapabilitySettings_module_css_default.actions,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "primary",
												className: CodexCapabilitySettings_module_css_default.compactButton,
												disabled: loginBusy || status?.available !== true,
												onClick: () => {
													startLogin("browser");
												},
												children: loginBusy ? t("startingLogin") : status?.configured === true ? t("relogin") : t("login")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "outline",
												className: CodexCapabilitySettings_module_css_default.compactButton,
												disabled: loginBusy || status?.available !== true,
												onClick: () => {
													startLogin("device");
												},
												children: t("deviceLogin")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												className: `${CodexCapabilitySettings_module_css_default.compactButton} ${CodexCapabilitySettings_module_css_default.refresh}`,
												icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: refreshBusy ? CodexCapabilitySettings_module_css_default.spinIcon : CodexCapabilitySettings_module_css_default.staticIcon,
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 16 })
												}),
												disabled: refreshBusy,
												onClick: () => {
													load();
													loadUsage();
												},
												children: refreshBusy ? t("refreshing") : t("refresh")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: CodexCapabilitySettings_module_css_default.privacyNotice,
										children: t("privacyNotice")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: `${CodexCapabilitySettings_module_css_default.card} ${CodexCapabilitySettings_module_css_default.contextCard}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardHeading, {
									title: t("contextCardTitle"),
									intro: t("contextCardIntro"),
									badge: llm.value === void 0 ? void 0 : llm.value.longContextEnabled ? t("contextLongBadge") : t("contextStandardBadge"),
									action: llm.value === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
										label: t("enableLongContext"),
										checked: llm.value.longContextEnabled,
										disabled: !llm.writable,
										onChange: (next) => {
											writer(llmScope, setError, t)("longContextEnabled", next);
										}
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsState, {
									snapshot: llm,
									t,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: CodexCapabilitySettings_module_css_default.contextDetails,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("contextBehavior") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: CodexCapabilitySettings_module_css_default.contextWarning,
											children: t("contextWarning")
										})]
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: CodexCapabilitySettings_module_css_default.card,
								"data-collapsed": !searchExpanded,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardHeading, {
									title: t("searchCardTitle"),
									intro: t("searchCardIntro"),
									badge: status !== null && !status.configured ? t("availableAfterLogin") : void 0,
									tone: status?.configured === false ? "warning" : "neutral",
									action: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [search.value === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
										label: t("enableSearch"),
										checked: search.value.enabled,
										disabled: !search.writable || searchUnavailable,
										onChange: (next) => {
											writer(searchScope, setError, t)("enabled", next);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisclosureButton, {
										expanded: searchExpanded,
										controls: searchRegionId,
										label: searchExpanded ? t("collapseSearch") : t("expandSearch"),
										onClick: () => {
											setSearchExpanded((value) => !value);
										}
									})] })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapsibleRegion, {
									id: searchRegionId,
									expanded: searchExpanded,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsState, {
										snapshot: search,
										t,
										children: search.value === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchControls, {
											scope: searchScope,
											snapshot: search,
											t,
											unavailable: searchUnavailable,
											onError: setError
										})
									})
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: CodexCapabilitySettings_module_css_default.card,
								"data-collapsed": !imageExpanded,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CardHeading, {
									title: t("imageCardTitle"),
									intro: t("imageCardIntro"),
									badge: status === null ? void 0 : !status.configured ? t("availableAfterLogin") : status.planType?.toLowerCase() === "free" ? t("unavailableFree") : void 0,
									tone: !status?.configured || status.planType?.toLowerCase() === "free" ? "warning" : "neutral",
									action: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [image.value === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
										label: t("enableImage"),
										checked: image.value.enabled,
										disabled: !image.writable || imageUnavailable,
										onChange: (next) => {
											writer(imageScope, setError, t)("enabled", next);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisclosureButton, {
										expanded: imageExpanded,
										controls: imageRegionId,
										label: imageExpanded ? t("collapseImage") : t("expandImage"),
										onClick: () => {
											setImageExpanded((value) => !value);
										}
									})] })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapsibleRegion, {
									id: imageRegionId,
									expanded: imageExpanded,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsState, {
										snapshot: image,
										t,
										children: image.value === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageControls, {
											scope: imageScope,
											snapshot: image,
											t,
											unavailable: imageUnavailable,
											onError: setError
										})
									})
								})]
							})
						]
					}),
					error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodexCapabilitySettings_module_css_default.error,
						role: "alert",
						children: error
					}),
					status?.available === true && !status.configured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodexCapabilitySettings_module_css_default.hint,
						children: t("loginHint")
					}) : null
				]
			});
		}
		function CardHeading({ title, intro, badge, action, tone = "neutral" }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: CodexCapabilitySettings_module_css_default.cardHeader,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodexCapabilitySettings_module_css_default.cardIdentity,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodexCapabilitySettings_module_css_default.cardTitleLine,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: CodexCapabilitySettings_module_css_default.cardTitle,
							children: title
						}), badge === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodexCapabilitySettings_module_css_default.badge,
							"data-tone": tone,
							children: badge
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: CodexCapabilitySettings_module_css_default.cardIntro,
						children: intro
					})]
				}), action !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexCapabilitySettings_module_css_default.cardAction,
					children: action
				}) : null]
			});
		}
		function DisclosureButton({ expanded, controls, label, onClick }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "ghost",
				size: "sm",
				className: CodexCapabilitySettings_module_css_default.disclosureButton,
				"aria-expanded": expanded,
				"aria-controls": controls,
				"aria-label": label,
				title: label,
				onClick,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodexCapabilitySettings_module_css_default.disclosureIcon,
					"data-expanded": expanded,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 14 })
				})
			});
		}
		function CollapsibleRegion({ id, expanded, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				id,
				className: CodexCapabilitySettings_module_css_default.collapsibleRegion,
				"data-expanded": expanded,
				"aria-hidden": !expanded,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexCapabilitySettings_module_css_default.collapsibleInner,
					children
				})
			});
		}
		function StatusDot({ loadState, status, t }) {
			const state = loadState === "loading" ? "ongoing" : loadState === "error" || status === null ? "error" : status.configured ? "done" : status.available ? "warning" : "error";
			const label = loadState === "loading" ? t("refreshing") : status?.configured === true ? t("active") : status?.available === false ? t("notAvailable") : t("loggedOut");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: CodexCapabilitySettings_module_css_default.titleDot,
				title: label,
				"aria-label": label,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodexCapabilitySettings_module_css_default.srOnly,
					children: label
				})]
			});
		}
		function AuthBody({ status, usage, usageBusy, loadState, t }) {
			if (status === null) {
				if (loadState === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodexCapabilitySettings_module_css_default.authDashboard,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: CodexCapabilitySettings_module_css_default.facts,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fact, {
							label: t("plan"),
							value: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: CodexCapabilitySettings_module_css_default.skeletonInlineValue })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fact, {
							label: t("weeklyReset"),
							value: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: CodexCapabilitySettings_module_css_default.skeletonInlineValue })
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodexCapabilitySettings_module_css_default.quotaContainer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: CodexCapabilitySettings_module_css_default.quotaInfo,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CodexCapabilitySettings_module_css_default.quotaLabel,
								children: t("quotaRemaining")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: CodexCapabilitySettings_module_css_default.quotaQuerying,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: CodexCapabilitySettings_module_css_default.queryingSpinner,
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("queryingQuota") })]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodexCapabilitySettings_module_css_default.progressTrack,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: CodexCapabilitySettings_module_css_default.shimmerTrack,
								"aria-hidden": "true"
							})
						})]
					})]
				});
				return null;
			}
			const remainingPercent = usage?.weeklyRemainingPercent;
			const showQuerying = usageBusy && remainingPercent === void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexCapabilitySettings_module_css_default.authDashboard,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
					className: CodexCapabilitySettings_module_css_default.facts,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fact, {
						label: t("plan"),
						value: status.planType === void 0 ? t("unknownPlan") : `${titleCase(status.planType)} plan`
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Fact, {
						label: t("weeklyReset"),
						value: usage?.weeklyResetAt !== void 0 ? localDate(usage.weeklyResetAt) : usageBusy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: CodexCapabilitySettings_module_css_default.skeletonInlineValue }) : "—"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: CodexCapabilitySettings_module_css_default.quotaContainer,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: CodexCapabilitySettings_module_css_default.quotaInfo,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodexCapabilitySettings_module_css_default.quotaLabel,
							children: t("quotaRemaining")
						}), showQuerying ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CodexCapabilitySettings_module_css_default.quotaQuerying,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: CodexCapabilitySettings_module_css_default.queryingSpinner,
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("queryingQuota") })]
						}) : remainingPercent !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: CodexCapabilitySettings_module_css_default.quotaValue,
							"data-tone": quotaTone(remainingPercent),
							children: [remainingPercent, "%"]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: CodexCapabilitySettings_module_css_default.quotaValue,
							children: "—"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodexCapabilitySettings_module_css_default.progressTrack,
						children: showQuerying ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodexCapabilitySettings_module_css_default.shimmerTrack,
							"aria-hidden": "true"
						}) : remainingPercent !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: CodexCapabilitySettings_module_css_default.progressFill,
							"data-tone": quotaTone(remainingPercent),
							style: { width: `${Math.max(0, Math.min(100, remainingPercent))}%` }
						}) : null
					})]
				})]
			});
		}
		function Fact({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexCapabilitySettings_module_css_default.fact,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: value })]
			});
		}
		function SettingsState({ snapshot, t, children }) {
			if (snapshot.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexCapabilitySettings_module_css_default.skeletonFormRows,
				role: "status",
				"aria-live": "polite",
				"aria-busy": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: CodexCapabilitySettings_module_css_default.srOnly,
						children: t("settingsLoading")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodexCapabilitySettings_module_css_default.skeletonRow,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodexCapabilitySettings_module_css_default.skeletonRow,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodexCapabilitySettings_module_css_default.skeletonRow,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodexCapabilitySettings_module_css_default.skeletonRow,
						"aria-hidden": "true"
					})
				]
			});
			if (snapshot.status === "unavailable" || snapshot.value === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: CodexCapabilitySettings_module_css_default.loading,
				children: t("settingsUnavailable")
			});
			return children;
		}
		function SearchControls({ scope, snapshot, t, unavailable, onError }) {
			const value = snapshot.value;
			const disabled = !snapshot.writable || unavailable || !value.enabled;
			const write = writer(scope, onError, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexCapabilitySettings_module_css_default.formRows,
				"data-dimmed": !value.enabled || unavailable,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("searchMode"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("searchMode"),
							value: value.mode,
							disabled,
							onChange: (event) => {
								write("mode", event.target.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "live",
									children: t("live")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "cached",
									children: t("cached")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "indexed",
									children: t("indexed")
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("contextSize"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("contextSize"),
							value: value.contextSize,
							disabled,
							onChange: (event) => {
								write("contextSize", event.target.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "low",
									children: t("low")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "medium",
									children: t("medium")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "high",
									children: t("high")
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("fallbackModel"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": t("fallbackModel"),
							value: value.fallbackModel,
							disabled,
							onChange: (event) => {
								write("fallbackModel", event.target.value);
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("maxOutputTokens"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": t("maxOutputTokens"),
							type: "number",
							min: 1,
							step: 1,
							value: value.maxOutputTokens,
							disabled,
							onChange: (event) => {
								write("maxOutputTokens", Number(event.target.value));
							}
						})
					})
				]
			});
		}
		function ImageControls({ scope, snapshot, t, unavailable, onError }) {
			const value = snapshot.value;
			const disabled = !snapshot.writable || unavailable || !value.enabled;
			const write = writer(scope, onError, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexCapabilitySettings_module_css_default.formRows,
				"data-dimmed": !value.enabled || unavailable,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("imageModel"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": t("imageModel"),
							value: value.model,
							disabled,
							onChange: (event) => {
								write("model", event.target.value);
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("defaultImageCount"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							"aria-label": t("defaultImageCount"),
							value: value.n,
							disabled,
							onChange: (event) => {
								write("n", Number(event.target.value));
							},
							children: Array.from({ length: 10 }, (_, index) => index + 1).map((count) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: count,
								children: count
							}, count))
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("defaultSize"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("defaultSize"),
							value: value.size,
							disabled,
							onChange: (event) => {
								write("size", event.target.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "auto",
									children: t("automatic")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "1024x1024",
									children: "1024 × 1024"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "1536x1024",
									children: "1536 × 1024"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "1024x1536",
									children: "1024 × 1536"
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("defaultQuality"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("defaultQuality"),
							value: value.quality,
							disabled,
							onChange: (event) => {
								write("quality", event.target.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "auto",
									children: t("automatic")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "low",
									children: t("low")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "medium",
									children: t("medium")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "high",
									children: t("high")
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Control, {
						label: t("defaultBackground"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("defaultBackground"),
							value: value.background,
							disabled,
							onChange: (event) => {
								write("background", event.target.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "auto",
									children: t("automatic")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "opaque",
									children: t("opaque")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "transparent",
									children: t("transparent")
								})
							]
						})
					})
				]
			});
		}
		function Switch({ label, checked, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: CodexCapabilitySettings_module_css_default.switchToggle,
				title: label,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					"aria-label": label,
					checked,
					disabled,
					onChange: (event) => {
						onChange(event.target.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: CodexCapabilitySettings_module_css_default.switchSlider })]
			});
		}
		function Control({ label, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexCapabilitySettings_module_css_default.formRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodexCapabilitySettings_module_css_default.formLabel,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: CodexCapabilitySettings_module_css_default.formField,
					children
				})]
			});
		}
		function useScope(scope) {
			const subscribe = (0, react.useCallback)((listener) => scope.subscribe(listener), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope.getSnapshot(), [scope]);
			return (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
		}
		function writer(scope, onError, t) {
			return async (field, value) => {
				onError(null);
				try {
					await scope.set(field, value);
				} catch (error) {
					onError(messageOf(error, t("writeFailed")));
				}
			};
		}
		function localDate(value) {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
		}
		function titleCase(value) {
			return value.length === 0 ? value : value[0]?.toUpperCase() + value.slice(1);
		}
		function messageOf(error, fallback) {
			if (error instanceof Error && error.message.length > 0) return error.message;
			return fallback;
		}
		function quotaTone(percent) {
			if (percent < 30) return "error";
			if (percent <= 60) return "warning";
			return "normal";
		}
		//#endregion
		//#region \0dsh-css:src/client/CodexImageGallery.module.css.mjs
		const css$1 = ".kdwzwG_gallery{flex-wrap:wrap;justify-content:flex-start;align-self:flex-start;gap:10px;max-width:100%;display:flex}.kdwzwG_frame{border:1px solid var(--dsw-alias-border-l2-darkmode-thin);background:var(--dsw-alias-interactive-bg-hover);min-width:44px;min-height:44px;color:var(--dsw-alias-label-tertiary);cursor:zoom-in;border-radius:16px;flex:none;place-items:center;padding:0;display:grid;overflow:hidden}.kdwzwG_frame[data-variant=tile]{width:64px;min-width:64px;height:64px;min-height:64px}.kdwzwG_frame:focus-visible,.kdwzwG_error:focus-visible,.kdwzwG_close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:2px}.kdwzwG_frame img{object-fit:cover;width:100%;height:100%;display:block}.kdwzwG_loading,.kdwzwG_error{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.kdwzwG_loading{padding:8px}.kdwzwG_error{border:1px solid var(--dsw-alias-border-l2-darkmode-thin);background:var(--dsw-alias-interactive-bg-hover-danger);max-width:240px;font:inherit;cursor:pointer;border-radius:10px;padding:10px 12px}.kdwzwG_error[data-variant=tile]{border-radius:16px;width:64px;height:64px;padding:4px;overflow:hidden}.kdwzwG_backdrop{z-index:1000;place-items:center;padding:40px;display:grid;position:fixed;inset:0}.kdwzwG_mask{background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute;inset:0}.kdwzwG_preview{background:var(--dsw-specific-input-major);max-width:min(100%,1600px);max-height:calc(100vh - 80px);box-shadow:var(--dsw-shadow-lv3);object-fit:contain;border-radius:12px;position:relative}.kdwzwG_close{z-index:1;border:1px solid var(--dsw-alias-border-l2-darkmode-thin);background:var(--dsw-specific-input-major);width:36px;height:36px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:999px;place-items:center;padding:0;font-size:24px;line-height:1;display:grid;position:fixed;top:20px;right:20px}";
		const tagId$1 = "dsh-codex-auth/CodexImageGallery.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-codex-auth";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var CodexImageGallery_module_css_default = {
			"loading": "kdwzwG_loading",
			"error": "kdwzwG_error",
			"close": "kdwzwG_close",
			"mask": "kdwzwG_mask",
			"frame": "kdwzwG_frame",
			"preview": "kdwzwG_preview",
			"gallery": "kdwzwG_gallery",
			"backdrop": "kdwzwG_backdrop"
		};
		//#endregion
		//#region src/client/CodexImageGallery.tsx
		/** Self-contained durable-image gallery for Codex tool results. */
		/** Render durable images without depending on another client plugin's private module exports. */
		function CodexImageGallery({ images, load, labels }) {
			if (images.length === 0) return null;
			const variant = images.length === 1 ? "single" : "tile";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: CodexImageGallery_module_css_default.gallery,
				children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexMessageImage, {
					attachment: image.attachment,
					load,
					labels,
					variant
				}, `${String(image.attachment.attachmentId)}:${String(index)}`))
			});
		}
		function CodexMessageImage({ attachment, load, labels, variant }) {
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [open, setOpen] = (0, react.useState)(false);
			const fit = (0, react.useMemo)(() => variant === "single" ? singleFit(attachment) : void 0, [attachment, variant]);
			const retry = (0, react.useCallback)(() => {
				setAttempt((value) => value + 1);
			}, []);
			const close = (0, react.useCallback)(() => {
				setOpen(false);
			}, []);
			(0, react.useEffect)(() => {
				let live = true;
				setState({ kind: "loading" });
				load(attachment).then((src) => {
					if (live) setState({
						kind: "loaded",
						src
					});
				}, () => {
					if (live) setState({ kind: "failed" });
				});
				return () => {
					live = false;
				};
			}, [
				attachment,
				attempt,
				load
			]);
			const label = attachment.name ?? labels.image;
			if (state.kind === "failed") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: CodexImageGallery_module_css_default.error,
				"data-variant": variant,
				type: "button",
				onClick: retry,
				children: labels.loadFailed
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: CodexImageGallery_module_css_default.frame,
				"data-variant": variant,
				type: "button",
				style: fit,
				title: labels.open,
				"aria-label": labels.openNamed(label),
				onClick: () => {
					if (state.kind === "loaded") setOpen(true);
				},
				children: state.kind === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodexImageGallery_module_css_default.loading,
					children: labels.loading
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src: state.src,
					alt: label,
					style: fit === void 0 ? void 0 : { objectPosition: fit.objectPosition }
				})
			}), open && state.kind === "loaded" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageLightbox, {
				src: state.src,
				alt: label,
				labels: labels.lightbox,
				onClose: close
			}) : null] });
		}
		/** Match the stock conversation rule: 240px long edge, bounded aspect ratio, no upscaling. */
		function singleFit(attachment) {
			const width = positiveDimension(attachment.width);
			const height = positiveDimension(attachment.height);
			const natural = width / height;
			const ratio = Math.min(4, Math.max(.25, natural));
			const box = ratio >= 1 ? {
				width: 240,
				height: 240 / ratio
			} : {
				width: 240 * ratio,
				height: 240
			};
			const scale = Math.min(1, width / box.width, height / box.height);
			return {
				width: Math.max(1, Math.round(box.width * scale)),
				height: Math.max(1, Math.round(box.height * scale)),
				objectPosition: natural < .25 ? "center top" : natural > 4 ? "left center" : "center"
			};
		}
		function positiveDimension(value) {
			return Number.isFinite(value) && value > 0 ? value : 1;
		}
		function CodexImageLightbox({ src, alt, labels, onClose }) {
			const closeRef = (0, react.useRef)(null);
			const restoreRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				closeRef.current?.focus();
				const onKeyDown = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
					restoreRef.current?.focus();
				};
			}, [onClose]);
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexImageGallery_module_css_default.backdrop,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": labels.dialog,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: CodexImageGallery_module_css_default.mask,
						"aria-hidden": "true",
						onMouseDown: onClose
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: CodexImageGallery_module_css_default.preview,
						src,
						alt
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						ref: closeRef,
						className: CodexImageGallery_module_css_default.close,
						type: "button",
						"aria-label": labels.close,
						onClick: onClose,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "×"
						})
					})
				]
			}), document.body);
		}
		//#endregion
		//#region src/client/locales.ts
		/** Copy dictionaries for the Codex Capability Bundle settings and tool cards. */
		/** English strings (the key-set source of truth for this pair). */
		const en = {
			nav: "GPT Auth",
			title: "GPT Auth",
			intro: "Sign in with GPT Auth to unlock Codex LLM, image generation, and web search capabilities.",
			authCardTitle: "Login",
			authCardIntro: "Shared ChatGPT login and the openai-codex model route.",
			contextCardTitle: "LLM Context",
			contextCardIntro: "Choose the context budget DSH uses for GPT-5.6 Sol, Terra, and Luna.",
			contextStandardBadge: "272K standard",
			contextLongBadge: "1M enabled",
			enableLongContext: "Enable 1M context",
			contextBehavior: "When enabled, DSH reports a 1,000,000-token context window and delays automatic compaction for supported GPT-5.6 models.",
			contextWarning: "Requests above 272K may consume quota faster, and backend availability remains account-dependent. Existing compacted history is not restored.",
			searchCardTitle: "Web Search",
			searchCardIntro: "Global Codex Search Provider used by the stock web_search tool.",
			imageCardTitle: "Image Creation",
			imageCardIntro: "Durable generate_image and list_images tools for image-capable Codex models.",
			active: "Active",
			loggedIn: "Logged in",
			statusAvailable: "codex login state available",
			loggedOut: "Not logged in",
			notAvailable: "codex CLI not available",
			authFileMissing: "No codex auth file found",
			authMode: "Auth mode",
			accountId: "Account ID",
			plan: "Plan",
			unknownPlan: "Unknown plan",
			tokenExpiresAt: "Token expires",
			lastRefreshAt: "Last refreshed",
			codexVersion: "codex version",
			credentialRef: "Credential source",
			login: "Log in with ChatGPT",
			relogin: "Log in again with ChatGPT",
			deviceLogin: "Device-code login",
			startingLogin: "Starting login…",
			refreshing: "Refreshing…",
			refresh: "Refresh status",
			privacyNotice: "No token value is ever sent to the Web client, settings, logs, events, or tool metadata.",
			loginHint: "Logging in opens the official codex authorization page in your browser; click “Refresh status” when you have finished.",
			loginFailed: "Starting the login flow failed",
			statusFailed: "Reading the login status failed",
			enableSearch: "Enable Web Search",
			expandSearch: "Expand Web Search settings",
			collapseSearch: "Collapse Web Search settings",
			searchMode: "Search mode",
			contextSize: "Context size",
			fallbackModel: "Fallback Codex model",
			maxOutputTokens: "Maximum output tokens",
			live: "Live",
			cached: "Cached",
			indexed: "Indexed",
			low: "Low",
			medium: "Medium",
			high: "High",
			enableImage: "Enable Image Creation",
			expandImage: "Expand Image Creation settings",
			collapseImage: "Collapse Image Creation settings",
			imageModel: "Image model",
			defaultImageCount: "Default image count",
			defaultSize: "Default size",
			defaultQuality: "Default quality",
			defaultBackground: "Default background",
			automatic: "Automatic",
			opaque: "Opaque",
			transparent: "Transparent",
			unavailableFree: "Unavailable on Free plan",
			availableAfterLogin: "Available after login",
			quotaRemaining: "Remaining quota",
			queryingQuota: "Querying quota…",
			weeklyReset: "Weekly limit resets",
			toolCreating: "Creating images…",
			toolFailed: "Image Creation failed",
			toolCancelled: "Cancelled locally. The backend does not expose server-side cancellation.",
			toolGeneratedImage: "Generated image",
			toolOpenImage: "Open original image",
			toolLoadingImage: "Loading image…",
			toolRetryImage: "Retry image",
			toolImageDialog: "Original image preview",
			toolCloseImage: "Close image",
			settingsLoading: "Loading settings…",
			settingsUnavailable: "These settings are unavailable in this browser.",
			writeFailed: "Saving the setting failed"
		};
		/** Chinese strings (key-complete mirror of `en`). */
		const zh = {
			nav: "GPT Auth",
			title: "GPT Auth",
			intro: "使用 GPT Auth 登录接入 Codex 的 LLM、文生图、Websearch 能力。",
			authCardTitle: "登录",
			authCardIntro: "共享 ChatGPT 登录态与 openai-codex 模型路由。",
			contextCardTitle: "LLM 上下文",
			contextCardIntro: "设置 DSH 为 GPT-5.6 Sol、Terra 和 Luna 使用的上下文预算。",
			contextStandardBadge: "标准 272K",
			contextLongBadge: "已启用 1M",
			enableLongContext: "启用 1M 上下文",
			contextBehavior: "启用后，DSH 会为支持的 GPT-5.6 模型报告 1,000,000 Token 上下文，并延后自动压缩。",
			contextWarning: "超过 272K 的请求可能更快消耗配额，且后端可用性仍取决于账户。已经压缩的历史不会恢复。",
			searchCardTitle: "网页搜索",
			searchCardIntro: "供内置 web_search 工具使用的全局 Codex 搜索提供方。",
			imageCardTitle: "图片创作",
			imageCardIntro: "面向支持图片模型的持久化 generate_image 与 list_images 工具。",
			active: "可用",
			loggedIn: "已登录",
			statusAvailable: "codex 登录态可用",
			loggedOut: "未登录",
			notAvailable: "codex CLI 不可用",
			authFileMissing: "未找到 codex 登录文件",
			authMode: "登录方式",
			accountId: "账户 ID",
			plan: "套餐",
			unknownPlan: "套餐未知",
			tokenExpiresAt: "Token 到期",
			lastRefreshAt: "最近刷新",
			codexVersion: "codex 版本",
			credentialRef: "凭证来源",
			login: "登录 ChatGPT",
			relogin: "重新登录 ChatGPT",
			deviceLogin: "设备码登录",
			startingLogin: "正在启动登录…",
			refreshing: "刷新中…",
			refresh: "刷新状态",
			privacyNotice: "任何 token 值都不会发送到 Web 客户端、设置、日志、事件或工具元数据。",
			loginHint: "点击登录会在浏览器打开官方 codex 授权页；完成后点「刷新状态」。",
			loginFailed: "启动登录流程失败",
			statusFailed: "读取登录状态失败",
			enableSearch: "启用网页搜索",
			expandSearch: "展开网页搜索设置",
			collapseSearch: "收起网页搜索设置",
			searchMode: "搜索模式",
			contextSize: "上下文大小",
			fallbackModel: "备用 Codex 模型",
			maxOutputTokens: "最大输出 Token",
			live: "实时",
			cached: "缓存",
			indexed: "索引",
			low: "低",
			medium: "中",
			high: "高",
			enableImage: "启用图片创作",
			expandImage: "展开图片创作设置",
			collapseImage: "收起图片创作设置",
			imageModel: "图片模型",
			defaultImageCount: "默认图片数量",
			defaultSize: "默认尺寸",
			defaultQuality: "默认质量",
			defaultBackground: "默认背景",
			automatic: "自动",
			opaque: "不透明",
			transparent: "透明",
			unavailableFree: "Free 套餐不可用",
			availableAfterLogin: "登录后可用",
			quotaRemaining: "额度剩余",
			queryingQuota: "正在查询额度…",
			weeklyReset: "周限刷新时间",
			toolCreating: "正在创作图片…",
			toolFailed: "图片创作失败",
			toolCancelled: "已在本地取消；后端未提供服务端取消能力。",
			toolGeneratedImage: "生成图片",
			toolOpenImage: "打开原图",
			toolLoadingImage: "正在加载图片…",
			toolRetryImage: "重试图片",
			toolImageDialog: "原图预览",
			toolCloseImage: "关闭图片",
			settingsLoading: "正在加载设置…",
			settingsUnavailable: "当前浏览器无法使用这些设置。",
			writeFailed: "保存设置失败"
		};
		//#endregion
		//#region \0dsh-css:src/client/CodexImageToolView.module.css.mjs
		const css = ".kiOAsW_running,.kiOAsW_failure{color:var(--dsw-alias-label-primary);-webkit-font-smoothing:antialiased}.kiOAsW_running{min-height:40px;color:var(--dsw-alias-label-secondary);align-items:center;gap:9px;font-size:13px;display:flex}.kiOAsW_pulse{background:var(--dsw-alias-brand-primary,#4f6ef7);border-radius:50%;width:8px;height:8px;animation:1.4s ease-in-out infinite kiOAsW_image-pulse}.kiOAsW_failure{background:var(--dsw-alias-state-error-tertiary);color:var(--dsw-alias-state-error-primary);border-radius:12px;flex-direction:column;gap:3px;padding:12px;font-size:12px;line-height:18px;display:flex}@keyframes kiOAsW_image-pulse{0%,to{opacity:.45;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}@media (prefers-reduced-motion:reduce){.kiOAsW_pulse{animation-duration:.01ms;animation-iteration-count:1}}";
		const tagId = "dsh-codex-auth/CodexImageToolView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-codex-auth";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var CodexImageToolView_module_css_default = {
			"running": "kiOAsW_running",
			"pulse": "kiOAsW_pulse",
			"image-pulse": "kiOAsW_image-pulse",
			"failure": "kiOAsW_failure"
		};
		//#endregion
		//#region src/client/CodexImageToolView.tsx
		/** Successful calls render only their durable images; status copy appears only while running or on failure. */
		function CodexImageToolView({ block, loadImage, t = english }) {
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexImageToolView_module_css_default.running,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: CodexImageToolView_module_css_default.pulse,
					"aria-hidden": "true"
				}), t("toolCreating")]
			});
			if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: CodexImageToolView_module_css_default.failure,
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("toolFailed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: block.error?.code === "IMAGE_CANCELLED" ? t("toolCancelled") : block.error?.code ?? t("toolFailed") })]
			});
			const images = block.content.flatMap((content) => content.type === "image" ? [{ attachment: content.attachment }] : []).slice(0, 10);
			if (images.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageGallery, {
				images,
				load: loadImage,
				labels: labels(t)
			});
		}
		function labels(t) {
			return {
				image: t("toolGeneratedImage"),
				open: t("toolOpenImage"),
				openNamed: (label) => `${t("toolOpenImage")}: ${label}`,
				loading: t("toolLoadingImage"),
				loadFailed: t("toolRetryImage"),
				lightbox: {
					dialog: t("toolImageDialog"),
					close: t("toolCloseImage")
				}
			};
		}
		function english(key) {
			return en[key];
		}
		//#endregion
		//#region src/client/SessionImageUrls.ts
		/** Owns only this plugin's image URLs; clearing never evicts conversation-owned URLs. */
		var SessionImageUrls = class {
			sessions;
			maxEntries;
			entries = /* @__PURE__ */ new Map();
			constructor(sessions, maxEntries = 32) {
				this.sessions = sessions;
				this.maxEntries = maxEntries;
				if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError("maxEntries must be a positive integer");
			}
			resolve(sessionId, attachment) {
				const key = JSON.stringify([String(sessionId), String(attachment.attachmentId)]);
				const cached = this.entries.get(key);
				if (cached !== void 0) {
					this.entries.delete(key);
					this.entries.set(key, cached);
					return cached.promise;
				}
				let pending;
				pending = this.read(sessionId, attachment).then((url) => {
					const current = this.entries.get(key);
					if (current?.promise !== pending) {
						URL.revokeObjectURL(url);
						throw new Error("Image URL request became stale");
					}
					current.url = url;
					return url;
				}, (error) => {
					if (this.entries.get(key)?.promise === pending) this.entries.delete(key);
					throw error;
				});
				this.entries.set(key, { promise: pending });
				this.evictOverflow();
				return pending;
			}
			clear() {
				for (const entry of this.entries.values()) if (entry.url !== void 0) URL.revokeObjectURL(entry.url);
				this.entries.clear();
			}
			async read(sessionId, expected) {
				const session = this.sessions.binding(sessionId)?.session;
				if (session === void 0) throw new Error("The image session is no longer available");
				const result = await session.readAttachment(expected.attachmentId);
				if (!result.ok) throw new Error(result.error.message || "The session did not authorize this image");
				if (result.value.attachment.attachmentId !== expected.attachmentId) throw new Error("The authorized image response did not match the requested attachment");
				const bytes = new Uint8Array(result.value.data.byteLength);
				bytes.set(result.value.data);
				return URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }));
			}
			evictOverflow() {
				while (this.entries.size > this.maxEntries) {
					const oldest = this.entries.entries().next().value;
					if (oldest === void 0) return;
					this.entries.delete(oldest[0]);
					if (oldest[1].url !== void 0) URL.revokeObjectURL(oldest[1].url);
				}
			}
		};
		//#endregion
		//#region src/client/index.ts
		/** Browser half of the Codex Capability Bundle. */
		const NS = "settings.codexAuth";
		const LLM_NAMESPACE = "codex-llm";
		const SEARCH_NAMESPACE = "codex-search";
		const IMAGE_NAMESPACE = "codex-image";
		/** Required browser services, including session-authorized attachment reads. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope",
			"sessions"
		];
		/** Register the four-card settings section and keyed image result renderers. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "codex-capabilities: copy dictionaries");
			const rpc = createCodexAuthRpcClient(ctx.get("connection").rpc);
			const t = ctx.locale.bind(NS);
			const llmScope = ctx.settingsScope.bind({
				namespace: LLM_NAMESPACE,
				decode: decodeLlmSettings
			});
			const searchScope = ctx.settingsScope.bind({
				namespace: SEARCH_NAMESPACE,
				decode: decodeSearchSettings
			});
			const imageScope = ctx.settingsScope.bind({
				namespace: IMAGE_NAMESPACE,
				decode: decodeImageSettings
			});
			const listeners = /* @__PURE__ */ new Set();
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const imageUrls = new SessionImageUrls(ctx.sessions);
			ctx.effect(() => () => {
				imageUrls.clear();
			}, "codex-capabilities: image URL cleanup");
			const reset = () => {
				imageUrls.clear();
				for (const listener of listeners) listener();
			};
			ctx.effect(() => ctx.on("connection/reset", reset), "codex-capabilities: connection invalidation");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "codex-auth",
				order: 20,
				label: () => t("nav"),
				inject: () => ({
					rpc,
					t,
					subscribe,
					llmScope,
					searchScope,
					imageScope
				})
			}, CodexCapabilitySettings));
			const ToolView = imageToolView(imageUrls);
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "generate_image",
				locale: NS
			}, ToolView));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "list_images"
			}, ListImagesToolView));
		}
		/** list_images is model-facing catalog state and deliberately has no user-facing card. */
		function ListImagesToolView() {
			return null;
		}
		function imageToolView(imageUrls) {
			return function RegisteredCodexImageToolView(props) {
				const loadImage = (0, react.useCallback)((attachment) => imageUrls.resolve(props.sessionId, attachment), [props.sessionId, imageUrls]);
				return (0, react.createElement)(CodexImageToolView, {
					block: props.block,
					loadImage,
					t: props.t
				});
			};
		}
		function decodeLlmSettings(value) {
			if (!isRecord(value) || typeof value.longContextEnabled !== "boolean") return void 0;
			return { longContextEnabled: value.longContextEnabled };
		}
		function decodeSearchSettings(value) {
			if (!isRecord(value) || typeof value.enabled !== "boolean" || !oneOf(value.mode, [
				"live",
				"cached",
				"indexed"
			]) || !oneOf(value.contextSize, [
				"low",
				"medium",
				"high"
			]) || typeof value.fallbackModel !== "string" || !positiveInteger(value.maxOutputTokens)) return void 0;
			return {
				enabled: value.enabled,
				mode: value.mode,
				contextSize: value.contextSize,
				fallbackModel: value.fallbackModel,
				maxOutputTokens: value.maxOutputTokens
			};
		}
		function decodeImageSettings(value) {
			if (!isRecord(value) || typeof value.enabled !== "boolean" || typeof value.model !== "string" || !positiveInteger(value.n) || value.n > 10 || !oneOf(value.size, [
				"auto",
				"1024x1024",
				"1536x1024",
				"1024x1536"
			]) || !oneOf(value.quality, [
				"auto",
				"low",
				"medium",
				"high"
			]) || !oneOf(value.background, [
				"auto",
				"opaque",
				"transparent"
			])) return void 0;
			return {
				enabled: value.enabled,
				model: value.model,
				n: value.n,
				size: value.size,
				quality: value.quality,
				background: value.background
			};
		}
		function oneOf(value, choices) {
			return typeof value === "string" && choices.includes(value);
		}
		function positiveInteger(value) {
			return Number.isSafeInteger(value) && value > 0;
		}
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		//#endregion
		exports.CodexCapabilitySettings = CodexCapabilitySettings;
		exports.CodexImageToolView = CodexImageToolView;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map