/* dsh-personal-workbench Web client — generated from src/client. */
window.__ModuleLoader__.load({
  id: "dsh-personal-workbench",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  SETTINGS_LOCALE_NAMESPACE: () => SETTINGS_LOCALE_NAMESPACE,
  apply: () => apply,
  inject: () => inject,
  installPersonalBrandOccupants: () => installPersonalBrandOccupants,
  normalizeLogoSource: () => normalizeLogoSource,
  normalizeWorkbenchName: () => normalizeWorkbenchName,
  resolveWorkbenchBrand: () => resolveWorkbenchBrand
});
module.exports = __toCommonJS(index_exports);

// src/constants.ts
var WORKBENCH_SETTINGS_NAMESPACE = "personal-workbench";

// src/client/brand.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function normalizeWorkbenchName(value) {
  if (typeof value !== "string") return void 0;
  const name = value.trim();
  return name.length > 0 ? name : void 0;
}
function normalizeLogoSource(value) {
  if (typeof value !== "string") return void 0;
  const logo = value.trim();
  return logo.length > 0 ? logo : void 0;
}
function resolveWorkbenchBrand(value) {
  if (typeof value !== "object" || value === null || !("enabled" in value) || value.enabled !== true) {
    return {};
  }
  const record = value;
  const name = normalizeWorkbenchName(record.name);
  const logo = normalizeLogoSource(record.logo);
  return {
    ...name === void 0 ? {} : { name },
    ...logo === void 0 ? {} : { logo }
  };
}
function createPersonalBrandMark(logo) {
  return function PersonalBrandMark({ size, className }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "img",
      {
        src: logo,
        alt: "",
        "aria-hidden": "true",
        className,
        width: size,
        height: size,
        style: { display: "block", objectFit: "contain", borderRadius: "24%" }
      }
    );
  };
}
function createPersonalBrandName(name) {
  return function PersonalBrandName() {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: name });
  };
}

// src/client/BrandSettingsRow.tsx
var import_react = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("file-read-failed"));
    };
    reader.onload = () => {
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("file-read-failed"));
    };
    reader.readAsDataURL(file);
  });
}
function BrandSettingsRow({ scope, t }) {
  const snapshot = (0, import_react.useSyncExternalStore)(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
    () => scope.getSnapshot()
  );
  const persisted = snapshot.value;
  const [name, setName] = (0, import_react.useState)("");
  const [logo, setLogo] = (0, import_react.useState)("");
  const [status, setStatus] = (0, import_react.useState)("idle");
  const [errorKey, setErrorKey] = (0, import_react.useState)();
  (0, import_react.useEffect)(() => {
    if (persisted === void 0) return;
    setName(persisted.enabled ? persisted.name : "");
    setLogo(persisted.enabled ? persisted.logo : "");
  }, [persisted]);
  const displayName = normalizeWorkbenchName(name) ?? t("title");
  const displayLogo = normalizeLogoSource(logo);
  const writable = snapshot.writable;
  const busy = status === "saving";
  const chooseLogo = async (file) => {
    if (file === void 0) return;
    try {
      const dataUrl = await readDataUrl(file);
      setLogo(dataUrl);
      setErrorKey(void 0);
      setStatus("idle");
    } catch {
      setErrorKey("error.read");
    }
  };
  const save = async () => {
    const normalizedName = normalizeWorkbenchName(name);
    if (normalizedName === void 0) {
      setErrorKey("error.name");
      return;
    }
    setStatus("saving");
    setErrorKey(void 0);
    try {
      await scope.set("name", normalizedName);
      await scope.set("logo", normalizeLogoSource(logo) ?? "");
      await scope.set("enabled", true);
      setStatus("saved");
    } catch {
      setStatus("error");
      setErrorKey("error.save");
    }
  };
  const reset = async () => {
    setStatus("saving");
    setErrorKey(void 0);
    try {
      await scope.set("enabled", false);
      await scope.unset("name");
      await scope.unset("logo");
      setName("");
      setLogo("");
      setStatus("reset");
    } catch {
      setStatus("error");
      setErrorKey("error.save");
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "dpw-card", "aria-labelledby": "dpw-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { id: "dpw-title", className: "dpw-title", children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dpw-description", children: t("description") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-preview", "aria-label": t("preview"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dpw-preview-mark", "aria-hidden": "true", children: displayLogo === void 0 ? "\u{1F433}" : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: displayLogo, alt: "" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-preview-copy", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dpw-preview-label", children: t("preview") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dpw-preview-name", children: displayName })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-fields", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dpw-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dpw-label", children: t("name.label") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "dpw-input",
            value: name,
            placeholder: t("name.placeholder"),
            disabled: !writable || busy,
            onChange: (event) => {
              setName(event.currentTarget.value);
              setStatus("idle");
              setErrorKey(void 0);
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dpw-label", children: t("logo.label") }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-upload-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "dpw-button", children: [
            logo === "" ? t("logo.choose") : t("logo.replace"),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                className: "dpw-file",
                type: "file",
                accept: "image/*",
                disabled: !writable || busy,
                onChange: (event) => {
                  void chooseLogo(event.currentTarget.files?.[0]);
                }
              }
            )
          ] }),
          logo !== "" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              className: "dpw-button",
              disabled: !writable || busy,
              onClick: () => {
                setLogo("");
                setStatus("idle");
                setErrorKey(void 0);
              },
              children: t("logo.remove")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "dpw-hint", children: t("logo.hint") })
      ] })
    ] }),
    errorKey !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dpw-error", role: "alert", children: t(errorKey) }),
    !writable && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dpw-status", children: t("status.readonly") }),
    (status === "saved" || status === "reset") && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "dpw-status dpw-success", role: "status", children: t(status === "saved" ? "saved" : "reset.done") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "dpw-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "dpw-button dpw-button-primary",
          disabled: !writable || busy,
          onClick: () => {
            void save();
          },
          children: t("save")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "dpw-button",
          disabled: !writable || busy,
          onClick: () => {
            void reset();
          },
          children: t("reset")
        }
      )
    ] })
  ] });
}

// src/client/ApplicationLifecycleRow.tsx
var import_react2 = require("react");

// src/client/desktop-lifecycle.ts
var DESKTOP_LIFECYCLE_CHANNEL = "xiaohui.desktop.lifecycle";
var DESKTOP_LIFECYCLE_VERSION = 1;
var REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var DEFAULT_HANDSHAKE_TIMEOUT_MS = 5e3;
function createRequestId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isDesktopLifecycleAvailable(target = typeof window === "undefined" ? void 0 : window) {
  return target !== void 0 && target.parent !== target;
}
function readDesktopLifecycleResponse(value, requestId, action) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  const response = value;
  if (response.channel !== DESKTOP_LIFECYCLE_CHANNEL || response.version !== DESKTOP_LIFECYCLE_VERSION || response.requestId !== requestId) return void 0;
  if (response.type === `${action}-accepted`) {
    return Object.keys(response).sort().join(",") === "channel,requestId,type,version" ? response : void 0;
  }
  if (response.type !== `${action}-response` || typeof response.ok !== "boolean") return void 0;
  const expectedKeys = response.ok ? "channel,message,ok,requestId,type,version" : "channel,error,ok,requestId,type,version";
  if (Object.keys(response).sort().join(",") !== expectedKeys) return void 0;
  if (response.ok) {
    if (typeof response.message !== "string" || response.message.length > 2048) return void 0;
  } else if (typeof response.error !== "string" || response.error.length > 2048) {
    return void 0;
  }
  return response;
}
function requestDesktopLifecycle(action, options = {}) {
  const target = options.target ?? window;
  if (!isDesktopLifecycleAvailable(target)) {
    return Promise.reject(new Error("desktop-shell-unavailable"));
  }
  const requestId = options.requestId ?? createRequestId();
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return Promise.reject(new Error("desktop-lifecycle-request-id-invalid"));
  }
  return new Promise((resolve, reject) => {
    const parent = target.parent;
    let handshakeTimeout;
    const onMessage = (event) => {
      if (event.source !== parent) return;
      const response = readDesktopLifecycleResponse(event.data, requestId, action);
      if (response === void 0) return;
      if (response.type === `${action}-accepted`) {
        if (handshakeTimeout !== void 0) target.clearTimeout(handshakeTimeout);
        handshakeTimeout = void 0;
        return;
      }
      const result = response;
      cleanup();
      if (result.ok) resolve(result.message ?? "");
      else reject(new Error(result.error ?? `desktop-${action}-failed`));
    };
    handshakeTimeout = target.setTimeout(() => {
      cleanup();
      reject(new Error("desktop-shell-unavailable"));
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);
    const cleanup = () => {
      if (handshakeTimeout !== void 0) target.clearTimeout(handshakeTimeout);
      handshakeTimeout = void 0;
      target.removeEventListener("message", onMessage);
    };
    target.addEventListener("message", onMessage);
    parent.postMessage({
      channel: DESKTOP_LIFECYCLE_CHANNEL,
      version: DESKTOP_LIFECYCLE_VERSION,
      type: `${action}-request`,
      requestId
    }, "*");
  });
}
function requestDesktopUpdate(options = {}) {
  return requestDesktopLifecycle("check-update", options);
}
function requestDesktopRestart(options = {}) {
  return requestDesktopLifecycle("restart", options);
}

// src/client/ApplicationLifecycleRow.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function ApplicationLifecycleRow({ t }) {
  const [available] = (0, import_react2.useState)(() => isDesktopLifecycleAvailable());
  const [status, setStatus] = (0, import_react2.useState)("idle");
  const [detail, setDetail] = (0, import_react2.useState)("");
  const check = async () => {
    setStatus("checking");
    setDetail("");
    try {
      setDetail(await requestDesktopUpdate());
      setStatus("update-result");
    } catch (error) {
      setDetail(error instanceof Error ? error.message : String(error));
      setStatus("update-error");
    }
  };
  const restart = async () => {
    setStatus("restarting");
    setDetail("");
    try {
      await requestDesktopRestart();
    } catch (error) {
      setDetail(error instanceof Error ? error.message : String(error));
      setStatus("restart-error");
    }
  };
  const busy = status === "checking" || status === "restarting";
  const shellUnavailable = detail === "desktop-shell-unavailable";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "dpw-card", "aria-labelledby": "dpw-lifecycle-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dpw-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { id: "dpw-lifecycle-title", className: "dpw-title", children: t("lifecycle.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-description", children: t("lifecycle.description") })
    ] }),
    !available && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status", children: t("lifecycle.desktop-only") }),
    status === "checking" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status", role: "status", children: t("lifecycle.update.checking") }),
    status === "restarting" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status", role: "status", children: t("lifecycle.restart.restarting") }),
    status === "update-result" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status dpw-success", role: "status", children: detail }),
    (status === "update-error" || status === "restart-error") && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dpw-error", role: "alert", children: [
      t(shellUnavailable ? "lifecycle.shell-unavailable" : status === "update-error" ? "lifecycle.update.error" : "lifecycle.restart.error"),
      shellUnavailable ? "" : ` ${detail}`
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dpw-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "dpw-button dpw-button-primary",
          disabled: !available || busy,
          onClick: () => {
            void check();
          },
          children: t(status === "checking" ? "lifecycle.update.checking-action" : "lifecycle.update.action")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          className: "dpw-button",
          disabled: !available || busy,
          onClick: () => {
            void restart();
          },
          children: t(status === "restarting" ? "lifecycle.restart.restarting-action" : "lifecycle.restart.action")
        }
      )
    ] })
  ] });
}

// src/client/NetworkProxyRow.tsx
var import_react3 = require("react");

// src/client/desktop-network-proxy.ts
var DESKTOP_NETWORK_PROXY_CHANNEL = "xiaohui.desktop.network-proxy";
var DESKTOP_NETWORK_PROXY_VERSION = 1;
var REQUEST_ID_PATTERN2 = /^[A-Za-z0-9_-]{1,64}$/;
var DEFAULT_HANDSHAKE_TIMEOUT_MS2 = 5e3;
var MAX_PROXY_URL_LENGTH = 2048;
var MAX_NO_PROXY_LENGTH = 4096;
function createRequestId2() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isDesktopNetworkProxyAvailable(target = typeof window === "undefined" ? void 0 : window) {
  return target !== void 0 && target.parent !== target;
}
function hasExactKeys(value, expected) {
  return Object.keys(value).sort().join(",") === expected;
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readNetworkProxySettings(value) {
  if (!isRecord(value) || !hasExactKeys(value, "httpProxy,httpsProxy,mode,noProxy") || !["direct", "system", "custom"].includes(String(value.mode)) || typeof value.httpProxy !== "string" || value.httpProxy.length > MAX_PROXY_URL_LENGTH || typeof value.httpsProxy !== "string" || value.httpsProxy.length > MAX_PROXY_URL_LENGTH || typeof value.noProxy !== "string" || value.noProxy.length > MAX_NO_PROXY_LENGTH) return void 0;
  return value;
}
function readEffectiveProxy(value) {
  return readNetworkProxySettings(value);
}
function readSystemProxy(value) {
  if (!isRecord(value) || !hasExactKeys(
    value,
    "autoConfigUrl,configured,error,httpProxy,httpsProxy,noProxy,supported"
  ) || typeof value.supported !== "boolean" || typeof value.configured !== "boolean" || typeof value.httpProxy !== "string" || value.httpProxy.length > MAX_PROXY_URL_LENGTH || typeof value.httpsProxy !== "string" || value.httpsProxy.length > MAX_PROXY_URL_LENGTH || typeof value.noProxy !== "string" || value.noProxy.length > MAX_NO_PROXY_LENGTH || typeof value.autoConfigUrl !== "string" || value.autoConfigUrl.length > MAX_PROXY_URL_LENGTH || typeof value.error !== "string" || value.error.length > MAX_PROXY_URL_LENGTH) return void 0;
  return value;
}
function readSnapshot(value) {
  if (!isRecord(value)) return void 0;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "effective,effectiveError,settings,system" && keys !== "effectiveError,settings,system") return void 0;
  const settings = readNetworkProxySettings(value.settings);
  const system = readSystemProxy(value.system);
  if (settings === void 0 || system === void 0 || typeof value.effectiveError !== "string" || value.effectiveError.length > MAX_PROXY_URL_LENGTH) return void 0;
  const effective = value.effective === void 0 ? void 0 : readEffectiveProxy(value.effective);
  if (value.effective !== void 0 && effective === void 0) return void 0;
  return {
    settings,
    system,
    ...effective === void 0 ? {} : { effective },
    effectiveError: value.effectiveError
  };
}
function readTestResult(value) {
  if (!isRecord(value) || !hasExactKeys(value, "proxied,status") || typeof value.proxied !== "boolean" || !Number.isSafeInteger(value.status) || Number(value.status) < 100 || Number(value.status) > 599) return void 0;
  return value;
}
function readDesktopNetworkProxyResponse(value, requestId, action) {
  if (!isRecord(value) || value.channel !== DESKTOP_NETWORK_PROXY_CHANNEL || value.version !== DESKTOP_NETWORK_PROXY_VERSION || value.requestId !== requestId) return void 0;
  if (value.type === `${action}-accepted`) {
    return hasExactKeys(value, "channel,requestId,type,version") ? value : void 0;
  }
  if (value.type !== `${action}-response` || typeof value.ok !== "boolean") return void 0;
  if (value.ok) {
    if (!hasExactKeys(value, "channel,ok,requestId,type,value,version")) return void 0;
    const parsed = action === "test" ? readTestResult(value.value) : readSnapshot(value.value);
    if (parsed === void 0) return void 0;
  } else if (!hasExactKeys(value, "channel,error,ok,requestId,type,version") || typeof value.error !== "string" || value.error.length > MAX_PROXY_URL_LENGTH) return void 0;
  return value;
}
function requestDesktopNetworkProxy(action, settings, options) {
  const target = options.target ?? window;
  if (!isDesktopNetworkProxyAvailable(target)) {
    return Promise.reject(new Error("desktop-shell-unavailable"));
  }
  const requestId = options.requestId ?? createRequestId2();
  if (!REQUEST_ID_PATTERN2.test(requestId)) {
    return Promise.reject(new Error("desktop-network-proxy-request-id-invalid"));
  }
  if (action !== "get" && readNetworkProxySettings(settings) === void 0) {
    return Promise.reject(new Error("desktop-network-proxy-settings-invalid"));
  }
  return new Promise((resolve, reject) => {
    const parent = target.parent;
    let handshakeTimeout;
    const cleanup = () => {
      if (handshakeTimeout !== void 0) target.clearTimeout(handshakeTimeout);
      handshakeTimeout = void 0;
      target.removeEventListener("message", onMessage);
    };
    const onMessage = (event) => {
      if (event.source !== parent) return;
      const response = readDesktopNetworkProxyResponse(event.data, requestId, action);
      if (response === void 0) return;
      if (response.type === `${action}-accepted`) {
        if (handshakeTimeout !== void 0) target.clearTimeout(handshakeTimeout);
        handshakeTimeout = void 0;
        return;
      }
      cleanup();
      const result = response;
      if (result.ok && result.value !== void 0) resolve(result.value);
      else reject(new Error(result.error ?? `desktop-network-proxy-${action}-failed`));
    };
    handshakeTimeout = target.setTimeout(() => {
      cleanup();
      reject(new Error("desktop-shell-unavailable"));
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS2);
    target.addEventListener("message", onMessage);
    parent.postMessage({
      channel: DESKTOP_NETWORK_PROXY_CHANNEL,
      version: DESKTOP_NETWORK_PROXY_VERSION,
      type: `${action}-request`,
      requestId,
      ...settings === void 0 ? {} : { settings }
    }, "*");
  });
}
async function requestDesktopNetworkProxySnapshot(options = {}) {
  return await requestDesktopNetworkProxy("get", void 0, options);
}
async function requestDesktopNetworkProxyTest(settings, options = {}) {
  return await requestDesktopNetworkProxy("test", settings, options);
}
async function requestDesktopNetworkProxySave(settings, options = {}) {
  return await requestDesktopNetworkProxy("save", settings, options);
}

// src/client/host-network-proxy.ts
var HOST_NETWORK_PROXY_TEST_PATH = "/api/xiaohui/network-proxy/test";
function hasExactKeys2(value, expected) {
  return Object.keys(value).sort().join(",") === expected;
}
function readResult(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  const result = value;
  if (!hasExactKeys2(result, "errorCode,ok,proxied,status") || typeof result.ok !== "boolean" || typeof result.status !== "number" || !Number.isInteger(result.status) || result.status < 0 || result.status > 599 || typeof result.proxied !== "boolean" || typeof result.errorCode !== "string" || result.errorCode.length > 64) return void 0;
  return result;
}
async function requestHostNetworkProxyTest(fetcher = globalThis.fetch) {
  const response = await fetcher(HOST_NETWORK_PROXY_TEST_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  const result = readResult(await response.json());
  if (result === void 0) throw new Error("host-network-proxy-response-invalid");
  return result;
}

// src/client/NetworkProxyRow.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var EMPTY_SETTINGS = {
  mode: "direct",
  httpProxy: "",
  httpsProxy: "",
  noProxy: ""
};
function NetworkProxyRow({ t }) {
  const [available] = (0, import_react3.useState)(() => isDesktopNetworkProxyAvailable());
  const [snapshot, setSnapshot] = (0, import_react3.useState)(null);
  const [draft, setDraft] = (0, import_react3.useState)(EMPTY_SETTINGS);
  const [status, setStatus] = (0, import_react3.useState)(available ? "loading" : "idle");
  const [detail, setDetail] = (0, import_react3.useState)("");
  (0, import_react3.useEffect)(() => {
    if (!available) return;
    let active = true;
    void requestDesktopNetworkProxySnapshot().then((value) => {
      if (!active) return;
      setSnapshot(value);
      setDraft(value.settings);
      setStatus("idle");
    }).catch((error) => {
      if (!active) return;
      setDetail(errorMessage(error));
      setStatus("error");
    });
    return () => {
      active = false;
    };
  }, [available]);
  const refresh = async () => {
    setStatus("refreshing");
    setDetail("");
    try {
      setSnapshot(await requestDesktopNetworkProxySnapshot());
      setStatus("idle");
    } catch (error) {
      setDetail(errorMessage(error));
      setStatus("error");
    }
  };
  const test = async () => {
    setStatus("testing");
    setDetail("");
    try {
      const native = await requestDesktopNetworkProxyTest(draft);
      const host = await requestHostNetworkProxyTest();
      if (!host.ok) throw new Error(`host-network-proxy-test-failed:${host.errorCode}`);
      const route = host.proxied ? t("proxy.test.route.proxy") : t("proxy.test.route.direct");
      const pending = native.proxied === host.proxied ? "" : ` ${t("proxy.test.pending-restart")}`;
      setDetail(t("proxy.test.success").replace("{nativeStatus}", String(native.status)).replace("{hostStatus}", String(host.status)).replace("{route}", route) + pending);
      setStatus("tested");
    } catch (error) {
      setDetail(errorMessage(error));
      setStatus("error");
    }
  };
  const saveAndRestart = async () => {
    setStatus("saving");
    setDetail("");
    try {
      const saved = await requestDesktopNetworkProxySave(draft);
      setSnapshot(saved);
      setStatus("restarting");
      await requestDesktopRestart();
    } catch (error) {
      setDetail(errorMessage(error));
      setStatus("error");
    }
  };
  const busy = ["loading", "refreshing", "testing", "saving", "restarting"].includes(status);
  const systemBlocked = draft.mode === "system" && snapshot?.system.supported === false;
  const setField = (field) => (event) => {
    setDraft((value) => ({ ...value, [field]: event.target.value }));
    setStatus("idle");
    setDetail("");
  };
  const setMode = (event) => {
    setDraft((value) => ({ ...value, mode: event.target.value }));
    setStatus("idle");
    setDetail("");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "dpw-card", "aria-labelledby": "dpw-network-proxy-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dpw-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { id: "dpw-network-proxy-title", className: "dpw-title", children: t("proxy.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-description", children: t("proxy.description") })
    ] }),
    !available && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-status", children: t("proxy.desktop-only") }),
    available && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dpw-fields", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "dpw-field dpw-field-wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dpw-label", children: t("proxy.mode.label") }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "select",
          {
            className: "dpw-input",
            value: draft.mode,
            disabled: busy,
            "aria-label": t("proxy.mode.label"),
            onChange: setMode,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "system", children: t("proxy.mode.system") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "custom", children: t("proxy.mode.custom") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "direct", children: t("proxy.mode.direct") })
            ]
          }
        )
      ] }),
      draft.mode === "system" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dpw-proxy-panel dpw-field-wide", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-label", children: t("proxy.system.detected") }),
        snapshot?.system.supported === true && snapshot.system.configured && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dpw-code", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            "HTTP_PROXY=",
            snapshot.system.httpProxy || t("proxy.value.direct")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            "HTTPS_PROXY=",
            snapshot.system.httpsProxy || t("proxy.value.direct")
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            "NO_PROXY=",
            snapshot.system.noProxy
          ] })
        ] }),
        snapshot?.system.supported === true && !snapshot.system.configured && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-hint", children: t("proxy.system.none") }),
        snapshot?.system.supported === false && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-error", children: localizedProxyError(snapshot.system.error, t) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "dpw-button", disabled: busy, onClick: () => {
          void refresh();
        }, children: status === "refreshing" ? t("proxy.system.refreshing") : t("proxy.system.refresh") })
      ] }),
      draft.mode === "custom" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "dpw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dpw-label", children: t("proxy.http.label") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: "dpw-input",
              value: draft.httpProxy,
              disabled: busy,
              placeholder: "http://127.0.0.1:7890",
              autoCapitalize: "none",
              autoCorrect: "off",
              spellCheck: false,
              onChange: setField("httpProxy")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "dpw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dpw-label", children: t("proxy.https.label") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: "dpw-input",
              value: draft.httpsProxy,
              disabled: busy,
              placeholder: "http://127.0.0.1:7890",
              autoCapitalize: "none",
              autoCorrect: "off",
              spellCheck: false,
              onChange: setField("httpsProxy")
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "dpw-field dpw-field-wide", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dpw-label", children: t("proxy.no-proxy.label") }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "input",
            {
              className: "dpw-input",
              value: draft.noProxy,
              disabled: busy,
              placeholder: "localhost,127.0.0.1,*.local",
              autoCapitalize: "none",
              autoCorrect: "off",
              spellCheck: false,
              onChange: setField("noProxy")
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "dpw-hint", children: t("proxy.custom.hint") })
        ] })
      ] }),
      draft.mode === "direct" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-hint dpw-field-wide", children: t("proxy.direct.hint") })
    ] }),
    status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-status", role: "status", children: t("proxy.loading") }),
    status === "testing" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-status", role: "status", children: t("proxy.test.testing") }),
    status === "tested" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-status dpw-success", role: "status", children: detail }),
    status === "saving" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-status", role: "status", children: t("proxy.save.saving") }),
    status === "restarting" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-status", role: "status", children: t("proxy.save.restarting") }),
    status === "error" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "dpw-error", role: "alert", children: localizedProxyError(detail, t) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "dpw-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dpw-button",
          disabled: !available || busy || systemBlocked,
          onClick: () => {
            void test();
          },
          children: status === "testing" ? t("proxy.test.testing-action") : t("proxy.test.action")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "dpw-button dpw-button-primary",
          disabled: !available || busy || systemBlocked,
          onClick: () => {
            void saveAndRestart();
          },
          children: status === "saving" || status === "restarting" ? t("proxy.save.restarting-action") : t("proxy.save.action")
        }
      )
    ] })
  ] });
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function localizedProxyError(error, t) {
  if (error === "desktop-shell-unavailable") return t("proxy.shell-unavailable");
  if (error.includes("network-proxy-system-auto-config-unsupported")) return t("proxy.error.pac");
  if (error.includes("network-proxy-system-http-only-unsupported")) return t("proxy.error.http-only");
  if (error.includes("network-proxy-system-unsupported-platform")) return t("proxy.error.platform");
  if (error.includes("network-proxy-custom-http-and-https-required")) return t("proxy.error.required");
  if (error.includes("network-proxy-scheme-unsupported")) return t("proxy.error.scheme");
  if (error.includes("network-proxy-url-invalid")) return t("proxy.error.url");
  if (error.includes("network-proxy-no-proxy-invalid")) return t("proxy.error.no-proxy");
  if (error.includes("host-network-proxy-test-failed:")) {
    return t("proxy.error.host").replace("{code}", error.split(":").at(-1) ?? "UNKNOWN");
  }
  if (error.includes("host-network-proxy-response-invalid")) return t("proxy.error.host-response");
  if (error.includes("network-proxy-test")) return t("proxy.error.test");
  return `${t("proxy.error.generic")} ${error}`;
}

// src/client/locales.ts
var zh = {
  "title": "\u6211\u7684\u5DE5\u4F5C\u53F0",
  "description": "\u8BBE\u7F6E\u4FA7\u8FB9\u680F\u540D\u79F0\u548C Logo\uFF0C\u6253\u9020\u5C5E\u4E8E\u4F60\u7684 Agent \u5DE5\u4F5C\u53F0\u3002",
  "preview": "\u5B9E\u65F6\u9884\u89C8",
  "name.label": "\u5DE5\u4F5C\u53F0\u540D\u79F0",
  "name.placeholder": "\u4F8B\u5982\uFF1A\u5C0F\u8F89\u7684\u5DE5\u4F5C\u53F0",
  "logo.label": "\u5DE5\u4F5C\u53F0 Logo",
  "logo.choose": "\u9009\u62E9\u56FE\u7247",
  "logo.replace": "\u66F4\u6362\u56FE\u7247",
  "logo.remove": "\u79FB\u9664 Logo",
  "logo.hint": "\u9009\u62E9\u4E00\u5F20\u4F60\u559C\u6B22\u7684\u56FE\u7247\u3002",
  "save": "\u5E94\u7528\u5230\u5DE5\u4F5C\u53F0",
  "reset": "\u6062\u590D XiaoHui \u9ED8\u8BA4",
  "saved": "\u5DF2\u5E94\u7528",
  "reset.done": "\u5DF2\u6062\u590D\u9ED8\u8BA4",
  "status.readonly": "\u5F53\u524D Profile \u7684\u8BBE\u7F6E\u6587\u4EF6\u4E0D\u53EF\u5199\u3002",
  "error.name": "\u8BF7\u8F93\u5165\u5DE5\u4F5C\u53F0\u540D\u79F0\u3002",
  "error.read": "\u56FE\u7247\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "error.save": "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u8BBE\u7F6E\u6587\u4EF6\u540E\u91CD\u8BD5\u3002",
  "proxy.title": "\u7F51\u7EDC\u4EE3\u7406",
  "proxy.description": "\u4E3A XiaoHui Harness\u3001\u79C1\u6709 Host\u3001\u63D2\u4EF6\u548C\u5E94\u7528\u66F4\u65B0\u7EDF\u4E00\u8BBE\u7F6E\u7F51\u7EDC\u4EE3\u7406\u3002\u4FDD\u5B58\u540E\u4F1A\u91CD\u542F\u5E94\u7528\u3002",
  "proxy.desktop-only": "\u8BF7\u5728 XiaoHui Harness \u684C\u9762\u5E94\u7528\u4E2D\u914D\u7F6E\u7F51\u7EDC\u4EE3\u7406\u3002",
  "proxy.shell-unavailable": "\u684C\u9762\u7F51\u7EDC\u4EE3\u7406\u670D\u52A1\u672A\u54CD\u5E94\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00 XiaoHui Harness \u540E\u91CD\u8BD5\u3002",
  "proxy.mode.label": "\u8FDE\u63A5\u65B9\u5F0F",
  "proxy.mode.system": "\u8DDF\u968F macOS \u7CFB\u7EDF\u4EE3\u7406",
  "proxy.mode.custom": "\u81EA\u5B9A\u4E49\u4EE3\u7406",
  "proxy.mode.direct": "\u76F4\u63A5\u8FDE\u63A5",
  "proxy.system.detected": "\u5F53\u524D\u7CFB\u7EDF\u4EE3\u7406",
  "proxy.system.none": "macOS \u5F53\u524D\u672A\u542F\u7528\u56FA\u5B9A HTTP/HTTPS \u4EE3\u7406\u3002",
  "proxy.system.refresh": "\u91CD\u65B0\u8BFB\u53D6\u7CFB\u7EDF\u4EE3\u7406",
  "proxy.system.refreshing": "\u6B63\u5728\u8BFB\u53D6\u2026",
  "proxy.value.direct": "\u76F4\u8FDE",
  "proxy.http.label": "HTTP \u4EE3\u7406",
  "proxy.https.label": "HTTPS \u4EE3\u7406",
  "proxy.no-proxy.label": "\u4E0D\u4F7F\u7528\u4EE3\u7406\u7684\u5730\u5740",
  "proxy.custom.hint": "\u9700\u8981\u540C\u65F6\u586B\u5199 HTTP \u4E0E HTTPS \u4EE3\u7406\u3002\u4EC5\u652F\u6301\u65E0\u8D26\u53F7\u5BC6\u7801\u7684 http:// \u6216 https:// \u5730\u5740\uFF1B\u672C\u673A Host \u5730\u5740\u59CB\u7EC8\u76F4\u8FDE\u3002",
  "proxy.direct.hint": "\u5FFD\u7565\u542F\u52A8\u73AF\u5883\u4E2D\u7684\u4EE3\u7406\u53D8\u91CF\uFF0C\u7531 XiaoHui \u76F4\u63A5\u8FDE\u63A5\u5916\u90E8\u7F51\u7EDC\u3002",
  "proxy.loading": "\u6B63\u5728\u8BFB\u53D6\u7F51\u7EDC\u4EE3\u7406\u8BBE\u7F6E\u2026",
  "proxy.test.action": "\u6D4B\u8BD5 ChatGPT \u8FDE\u63A5",
  "proxy.test.testing-action": "\u6B63\u5728\u6D4B\u8BD5\u2026",
  "proxy.test.testing": "\u6B63\u5728\u5206\u522B\u6D4B\u8BD5\u5F53\u524D\u8349\u7A3F\u7684\u684C\u9762\u94FE\u8DEF\u4E0E\u6B63\u5728\u8FD0\u884C\u7684 Node Host\u2026",
  "proxy.test.success": "\u684C\u9762\u8349\u7A3F HTTP {nativeStatus}\uFF1B\u5F53\u524D Node Host HTTP {hostStatus}\uFF08{route}\uFF09\u3002",
  "proxy.test.route.proxy": "\u73AF\u5883\u4EE3\u7406",
  "proxy.test.route.direct": "\u76F4\u8FDE",
  "proxy.test.pending-restart": "Node Host \u4ECD\u5728\u4F7F\u7528\u4E0A\u6B21\u91CD\u542F\u65F6\u7684\u7B56\u7565\uFF1B\u4FDD\u5B58\u5E76\u91CD\u542F\u540E\u8BF7\u518D\u6B21\u6D4B\u8BD5\u3002",
  "proxy.save.action": "\u4FDD\u5B58\u5E76\u91CD\u542F XiaoHui",
  "proxy.save.saving": "\u6B63\u5728\u4FDD\u5B58\u7F51\u7EDC\u4EE3\u7406\u8BBE\u7F6E\u2026",
  "proxy.save.restarting-action": "\u6B63\u5728\u91CD\u542F\u2026",
  "proxy.save.restarting": "\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u6B63\u5728\u505C\u6B62\u79C1\u6709 Host \u5E76\u91CD\u542F XiaoHui\u2026",
  "proxy.error.pac": "\u68C0\u6D4B\u5230 PAC \u6216\u81EA\u52A8\u4EE3\u7406\u53D1\u73B0\u3002\u5F53\u524D\u7248\u672C\u65E0\u6CD5\u628A\u52A8\u6001\u4EE3\u7406\u89C4\u5219\u8F6C\u6362\u7ED9 Node\uFF0C\u8BF7\u6539\u7528\u81EA\u5B9A\u4E49\u4EE3\u7406\u3002",
  "proxy.error.http-only": "\u7CFB\u7EDF\u53EA\u542F\u7528\u4E86 HTTP \u4EE3\u7406\uFF0C\u65E0\u6CD5\u5FE0\u5B9E\u5E94\u7528\u5230\u6240\u6709 Node \u8BF7\u6C42\uFF1B\u8BF7\u540C\u65F6\u542F\u7528 HTTPS \u4EE3\u7406\u6216\u6539\u7528\u81EA\u5B9A\u4E49\u4EE3\u7406\u3002",
  "proxy.error.platform": "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u81EA\u52A8\u8BFB\u53D6\u7CFB\u7EDF\u4EE3\u7406\uFF0C\u8BF7\u4F7F\u7528\u81EA\u5B9A\u4E49\u4EE3\u7406\u3002",
  "proxy.error.required": "\u81EA\u5B9A\u4E49\u6A21\u5F0F\u9700\u8981\u540C\u65F6\u586B\u5199 HTTP \u4E0E HTTPS \u4EE3\u7406\u3002",
  "proxy.error.scheme": "\u4EE3\u7406\u5730\u5740\u4EC5\u652F\u6301 http:// \u6216 https://\u3002",
  "proxy.error.url": "\u4EE3\u7406\u5730\u5740\u65E0\u6548\uFF0C\u4E14\u4E0D\u80FD\u5305\u542B\u8D26\u53F7\u3001\u5BC6\u7801\u3001\u8DEF\u5F84\u3001\u67E5\u8BE2\u53C2\u6570\u6216\u7247\u6BB5\u3002",
  "proxy.error.no-proxy": "\u4E0D\u4F7F\u7528\u4EE3\u7406\u7684\u5730\u5740\u5217\u8868\u65E0\u6548\u3002",
  "proxy.error.test": "\u65E0\u6CD5\u901A\u8FC7\u5F53\u524D\u8BBE\u7F6E\u8FDE\u63A5 ChatGPT\uFF0C\u8BF7\u786E\u8BA4\u4EE3\u7406\u6B63\u5728\u8FD0\u884C\u3002",
  "proxy.error.host": "\u684C\u9762\u94FE\u8DEF\u53EF\u8FBE\uFF0C\u4F46\u5F53\u524D Node Host \u8FDE\u63A5\u5931\u8D25\uFF08{code}\uFF09\u3002\u4FDD\u5B58\u5E76\u91CD\u542F\u540E\u82E5\u4ECD\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 Host \u4EE3\u7406\u521D\u59CB\u5316\u3002",
  "proxy.error.host-response": "Node Host \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u4EE3\u7406\u8BCA\u65AD\u7ED3\u679C\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00 XiaoHui \u540E\u91CD\u8BD5\u3002",
  "proxy.error.generic": "\u7F51\u7EDC\u4EE3\u7406\u64CD\u4F5C\u5931\u8D25\uFF1A",
  "lifecycle.title": "\u5E94\u7528\u751F\u547D\u5468\u671F",
  "lifecycle.description": "\u7BA1\u7406 XiaoHui Harness \u7684\u66F4\u65B0\u4E0E\u91CD\u542F\u3002\u91CD\u542F\u4F1A\u505C\u6B62\u5F53\u524D\u79C1\u6709 Host\uFF0C\u5E76\u5728\u91CD\u65B0\u6253\u5F00\u65F6\u52A0\u8F7D\u65B0\u5B89\u88C5\u7684\u63D2\u4EF6\u3002",
  "lifecycle.desktop-only": "\u8BF7\u5728 XiaoHui Harness \u684C\u9762\u5E94\u7528\u4E2D\u4F7F\u7528\u8FD9\u4E9B\u529F\u80FD\u3002",
  "lifecycle.shell-unavailable": "\u684C\u9762\u751F\u547D\u5468\u671F\u670D\u52A1\u672A\u54CD\u5E94\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00 XiaoHui Harness \u540E\u91CD\u8BD5\u3002",
  "lifecycle.update.action": "\u68C0\u67E5\u5E76\u66F4\u65B0",
  "lifecycle.update.checking-action": "\u6B63\u5728\u68C0\u67E5\u2026",
  "lifecycle.update.checking": "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\uFF1B\u5982\u6709\u65B0\u7248\u672C\uFF0C\u5C06\u81EA\u52A8\u4E0B\u8F7D\u5E76\u5B89\u88C5\u3002",
  "lifecycle.update.error": "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF1A",
  "lifecycle.restart.action": "\u91CD\u542F XiaoHui",
  "lifecycle.restart.restarting-action": "\u6B63\u5728\u91CD\u542F\u2026",
  "lifecycle.restart.restarting": "\u6B63\u5728\u505C\u6B62\u79C1\u6709 Host \u5E76\u91CD\u542F XiaoHui\u2026",
  "lifecycle.restart.error": "\u91CD\u542F\u5931\u8D25\uFF1A"
};
var en = {
  "title": "My Workbench",
  "description": "Choose a sidebar name and logo for your personal Agent workbench.",
  "preview": "Live preview",
  "name.label": "Workbench name",
  "name.placeholder": "For example: Avery's Workbench",
  "logo.label": "Workbench logo",
  "logo.choose": "Choose image",
  "logo.replace": "Replace image",
  "logo.remove": "Remove logo",
  "logo.hint": "Choose an image you like.",
  "save": "Apply to workbench",
  "reset": "Restore XiaoHui default",
  "saved": "Applied",
  "reset.done": "Default restored",
  "status.readonly": "This Profile settings document is read-only.",
  "error.name": "Enter a workbench name.",
  "error.read": "The image could not be read. Try again.",
  "error.save": "Could not save. Check the settings document and try again.",
  "proxy.title": "Network proxy",
  "proxy.description": "Configure one network proxy for XiaoHui Harness, its private Host, plugins, and application updates. Saving restarts the app.",
  "proxy.desktop-only": "Configure the network proxy in the XiaoHui Harness desktop application.",
  "proxy.shell-unavailable": "The desktop network proxy service did not respond. Reopen XiaoHui Harness and try again.",
  "proxy.mode.label": "Connection mode",
  "proxy.mode.system": "Follow macOS system proxy",
  "proxy.mode.custom": "Custom proxy",
  "proxy.mode.direct": "Direct connection",
  "proxy.system.detected": "Current system proxy",
  "proxy.system.none": "macOS has no fixed HTTP/HTTPS proxy enabled.",
  "proxy.system.refresh": "Read system proxy again",
  "proxy.system.refreshing": "Reading\u2026",
  "proxy.value.direct": "direct",
  "proxy.http.label": "HTTP proxy",
  "proxy.https.label": "HTTPS proxy",
  "proxy.no-proxy.label": "Addresses that bypass the proxy",
  "proxy.custom.hint": "Both HTTP and HTTPS proxies are required. Only credential-free http:// or https:// URLs are accepted; the local Host always connects directly.",
  "proxy.direct.hint": "Ignore proxy variables from the launch environment and connect to external networks directly.",
  "proxy.loading": "Loading network proxy settings\u2026",
  "proxy.test.action": "Test ChatGPT connection",
  "proxy.test.testing-action": "Testing\u2026",
  "proxy.test.testing": "Testing the desktop draft route and the running Node Host separately\u2026",
  "proxy.test.success": "Desktop draft HTTP {nativeStatus}; current Node Host HTTP {hostStatus} ({route}).",
  "proxy.test.route.proxy": "environment proxy",
  "proxy.test.route.direct": "direct",
  "proxy.test.pending-restart": "The Node Host is still using the policy from the last restart. Save, restart, and test again.",
  "proxy.save.action": "Save and restart XiaoHui",
  "proxy.save.saving": "Saving network proxy settings\u2026",
  "proxy.save.restarting-action": "Restarting\u2026",
  "proxy.save.restarting": "Settings saved. Stopping the private Host and restarting XiaoHui\u2026",
  "proxy.error.pac": "A PAC URL or automatic proxy discovery is enabled. This version cannot translate dynamic rules for Node; use a custom proxy.",
  "proxy.error.http-only": "Only the system HTTP proxy is enabled, so it cannot be applied faithfully to every Node request. Enable HTTPS proxy too or use a custom proxy.",
  "proxy.error.platform": "Automatic system proxy detection is unavailable on this platform. Use a custom proxy.",
  "proxy.error.required": "Custom mode requires both HTTP and HTTPS proxy URLs.",
  "proxy.error.scheme": "Proxy URLs support only http:// or https://.",
  "proxy.error.url": "The proxy URL is invalid and cannot contain a username, password, path, query, or fragment.",
  "proxy.error.no-proxy": "The proxy bypass list is invalid.",
  "proxy.error.test": "Could not connect to ChatGPT with these settings. Confirm that the proxy is running.",
  "proxy.error.host": "The desktop route is reachable, but the current Node Host failed ({code}). If this continues after saving and restarting, check Host proxy initialization.",
  "proxy.error.host-response": "The Node Host returned an invalid proxy diagnostic result. Reopen XiaoHui and try again.",
  "proxy.error.generic": "Network proxy operation failed:",
  "lifecycle.title": "Application lifecycle",
  "lifecycle.description": "Manage XiaoHui Harness updates and restarts. Restart stops the private Host and loads newly installed plugins when the app opens again.",
  "lifecycle.desktop-only": "Use these actions in the XiaoHui Harness desktop application.",
  "lifecycle.shell-unavailable": "The desktop lifecycle service did not respond. Reopen XiaoHui Harness and try again.",
  "lifecycle.update.action": "Check and update",
  "lifecycle.update.checking-action": "Checking\u2026",
  "lifecycle.update.checking": "Checking for updates. A new release will download and install automatically.",
  "lifecycle.update.error": "Update check failed:",
  "lifecycle.restart.action": "Restart XiaoHui",
  "lifecycle.restart.restarting-action": "Restarting\u2026",
  "lifecycle.restart.restarting": "Stopping the private Host and restarting XiaoHui\u2026",
  "lifecycle.restart.error": "Restart failed:"
};

// src/client/styles.ts
var STYLE_ID = "dsh-personal-workbench/settings";
var PERSONAL_WORKBENCH_CSS = `
.dpw-card{display:grid;gap:16px;padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1)}
.dpw-heading{display:grid;gap:4px}.dpw-title{font-size:16px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dpw-description,.dpw-hint,.dpw-status{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.dpw-preview{display:flex;align-items:center;gap:12px;min-height:72px;padding:14px;border-radius:14px;background:var(--dsw-alias-bg-layer-2)}
.dpw-preview-mark{display:grid;place-items:center;width:44px;height:44px;overflow:hidden;border-radius:12px;background:var(--dsw-alias-bg-base);font-size:25px}
.dpw-preview-mark img{width:100%;height:100%;object-fit:contain}.dpw-preview-copy{display:grid;gap:2px;min-width:0}
.dpw-preview-label{font-size:12px;color:var(--dsw-alias-label-secondary)}.dpw-preview-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;font-weight:650;color:var(--dsw-alias-label-primary)}
.dpw-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.dpw-field{display:grid;align-content:start;gap:8px}
.dpw-field-wide{grid-column:1/-1}.dpw-proxy-panel{display:grid;gap:10px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.dpw-code{display:grid;gap:4px;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:var(--dsw-alias-label-secondary)}
.dpw-label{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}.dpw-input{box-sizing:border-box;width:100%;height:38px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.dpw-upload-row,.dpw-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dpw-file{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.dpw-button{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.dpw-button-primary{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.dpw-button-primary:hover:not(:disabled){border-color:var(--dsw-alias-button-primary-hover);background:var(--dsw-alias-button-primary-hover)}.dpw-button:disabled{cursor:not-allowed;opacity:.5}
.dpw-error{font-size:13px;color:var(--dsw-alias-state-error-primary)}.dpw-success{color:var(--dsw-alias-state-success-primary)}
@media (max-width:720px){.dpw-fields{grid-template-columns:1fr}}
`;
function installPersonalWorkbenchStyles(ctx) {
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {
    };
    const existing = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
    if (existing !== null) return () => {
    };
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-personal-workbench";
    style.dataset.pluginCss = STYLE_ID;
    style.textContent = PERSONAL_WORKBENCH_CSS;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, "personal-workbench: settings styles");
}

// src/client/index.tsx
var SETTINGS_LOCALE_NAMESPACE = "settings.personal-workbench";
var inject = ["slots", "locale", "connection", "remote", "settingsScope"];
function installBrandSlot(ctx, scope, slot, pick) {
  ctx.slots.inject(slot, () => {
    let dispose;
    let selected;
    const sync = () => {
      const next = pick(scope.getSnapshot().value);
      if (next === selected) return;
      dispose?.();
      selected = next;
      dispose = next === void 0 ? void 0 : ctx.slots.register({ name: slot, priority: -10 }, next);
    };
    const unsubscribe = scope.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      dispose?.();
    };
  });
}
function installPersonalBrandOccupants(ctx, scope) {
  let markLogo;
  let mark;
  const pickMark = (value) => {
    const logo = resolveWorkbenchBrand(value).logo;
    if (logo === void 0) {
      markLogo = void 0;
      mark = void 0;
      return void 0;
    }
    if (logo !== markLogo) {
      markLogo = logo;
      mark = createPersonalBrandMark(logo);
    }
    return mark;
  };
  let selectedName;
  let nameComponent;
  const pickName = (value) => {
    const name = resolveWorkbenchBrand(value).name;
    if (name === void 0) {
      selectedName = void 0;
      nameComponent = void 0;
      return void 0;
    }
    if (name !== selectedName) {
      selectedName = name;
      nameComponent = createPersonalBrandName(name);
    }
    return nameComponent;
  };
  installBrandSlot(ctx, scope, "sidebar.brand.mark", pickMark);
  installBrandSlot(ctx, scope, "conversation.hero.brand.mark", pickMark);
  installBrandSlot(ctx, scope, "sidebar.brand.name", pickName);
}
function apply(ctx) {
  installPersonalWorkbenchStyles(ctx);
  const scope = ctx.settingsScope.bind({
    namespace: WORKBENCH_SETTINGS_NAMESPACE
  });
  ctx.effect(
    () => ctx.locale.register(SETTINGS_LOCALE_NAMESPACE, { zh, en }),
    "personal-workbench: settings dictionaries"
  );
  installPersonalBrandOccupants(ctx, scope);
  ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "personal-workbench",
    order: 20,
    locale: SETTINGS_LOCALE_NAMESPACE,
    inject: () => ({ scope })
  }, BrandSettingsRow));
  ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "network-proxy",
    order: 30,
    locale: SETTINGS_LOCALE_NAMESPACE
  }, NetworkProxyRow));
  ctx.slots.inject("settings.general.item", () => ctx.slots.register({
    name: "settings.general.item",
    id: "application-lifecycle",
    order: 40,
    locale: SETTINGS_LOCALE_NAMESPACE
  }, ApplicationLifecycleRow));
}
    return module.exports;
  },
});
