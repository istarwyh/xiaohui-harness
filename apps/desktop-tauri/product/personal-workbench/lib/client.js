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

// src/client/ApplicationUpdateRow.tsx
var import_react2 = require("react");

// src/client/desktop-update.ts
var DESKTOP_UPDATE_CHANNEL = "xiaohui.desktop.update";
var DESKTOP_UPDATE_VERSION = 1;
var REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var DEFAULT_HANDSHAKE_TIMEOUT_MS = 5e3;
function createRequestId() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isDesktopUpdateAvailable(target = typeof window === "undefined" ? void 0 : window) {
  return target !== void 0 && target.parent !== target;
}
function readDesktopUpdateResponse(value, requestId) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
  const response = value;
  if (response.channel !== DESKTOP_UPDATE_CHANNEL || response.version !== DESKTOP_UPDATE_VERSION || response.requestId !== requestId) return void 0;
  if (response.type === "check-accepted") {
    return Object.keys(response).sort().join(",") === "channel,requestId,type,version" ? response : void 0;
  }
  if (response.type !== "check-response" || typeof response.ok !== "boolean") return void 0;
  const expectedKeys = response.ok ? "channel,message,ok,requestId,type,version" : "channel,error,ok,requestId,type,version";
  if (Object.keys(response).sort().join(",") !== expectedKeys) return void 0;
  if (response.ok) {
    if (typeof response.message !== "string" || response.message.length > 2048) return void 0;
  } else if (typeof response.error !== "string" || response.error.length > 2048) {
    return void 0;
  }
  return response;
}
function requestDesktopUpdate(options = {}) {
  const target = options.target ?? window;
  if (!isDesktopUpdateAvailable(target)) {
    return Promise.reject(new Error("desktop-shell-unavailable"));
  }
  const requestId = options.requestId ?? createRequestId();
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return Promise.reject(new Error("desktop-update-request-id-invalid"));
  }
  return new Promise((resolve, reject) => {
    const parent = target.parent;
    let handshakeTimeout;
    const onMessage = (event) => {
      if (event.source !== parent) return;
      const response = readDesktopUpdateResponse(event.data, requestId);
      if (response === void 0) return;
      if (response.type === "check-accepted") {
        if (handshakeTimeout !== void 0) target.clearTimeout(handshakeTimeout);
        handshakeTimeout = void 0;
        return;
      }
      cleanup();
      if (response.ok) resolve(response.message ?? "");
      else reject(new Error(response.error ?? "desktop-update-failed"));
    };
    handshakeTimeout = target.setTimeout(() => {
      cleanup();
      reject(new Error("desktop-update-shell-unavailable"));
    }, options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);
    const cleanup = () => {
      if (handshakeTimeout !== void 0) target.clearTimeout(handshakeTimeout);
      handshakeTimeout = void 0;
      target.removeEventListener("message", onMessage);
    };
    target.addEventListener("message", onMessage);
    parent.postMessage({
      channel: DESKTOP_UPDATE_CHANNEL,
      version: DESKTOP_UPDATE_VERSION,
      type: "check-request",
      requestId
    }, "*");
  });
}

// src/client/ApplicationUpdateRow.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function ApplicationUpdateRow({ t }) {
  const [available] = (0, import_react2.useState)(() => isDesktopUpdateAvailable());
  const [status, setStatus] = (0, import_react2.useState)("idle");
  const [detail, setDetail] = (0, import_react2.useState)("");
  const check = async () => {
    setStatus("checking");
    setDetail("");
    try {
      setDetail(await requestDesktopUpdate());
      setStatus("result");
    } catch (error) {
      setDetail(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  };
  const busy = status === "checking";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { className: "dpw-card", "aria-labelledby": "dpw-update-title", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dpw-heading", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { id: "dpw-update-title", className: "dpw-title", children: t("update.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-description", children: t("update.description") })
    ] }),
    !available && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status", children: t("update.desktop-only") }),
    busy && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status", role: "status", children: t("update.checking") }),
    status === "result" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-status dpw-success", role: "status", children: detail }),
    status === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "dpw-error", role: "alert", children: [
      t(detail === "desktop-update-shell-unavailable" ? "update.shell-unavailable" : "update.error"),
      detail === "desktop-update-shell-unavailable" ? "" : ` ${detail}`
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "dpw-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "button",
      {
        type: "button",
        className: "dpw-button dpw-button-primary",
        disabled: !available || busy,
        onClick: () => {
          void check();
        },
        children: t(busy ? "update.checking-action" : "update.action")
      }
    ) })
  ] });
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
  "update.title": "\u5E94\u7528\u66F4\u65B0",
  "update.description": "\u68C0\u67E5\u3001\u4E0B\u8F7D\u5E76\u5B89\u88C5\u7B7E\u540D\u7684 XiaoHui Harness \u6700\u65B0\u7248\u672C\u3002\u4EA7\u54C1\u63D2\u4EF6\u4F1A\u968F\u5E94\u7528\u4E00\u8D77\u66F4\u65B0\uFF0C\u5B89\u88C5\u5B8C\u6210\u540E\u5E94\u7528\u5C06\u81EA\u52A8\u91CD\u542F\u3002",
  "update.desktop-only": "\u8BF7\u5728 XiaoHui Harness \u684C\u9762\u5E94\u7528\u4E2D\u4F7F\u7528\u6B64\u529F\u80FD\u3002",
  "update.action": "\u68C0\u67E5\u5E76\u66F4\u65B0",
  "update.checking-action": "\u6B63\u5728\u68C0\u67E5\u2026",
  "update.checking": "\u6B63\u5728\u68C0\u67E5\u66F4\u65B0\uFF1B\u5982\u6709\u65B0\u7248\u672C\uFF0C\u5C06\u81EA\u52A8\u4E0B\u8F7D\u5E76\u5B89\u88C5\u3002",
  "update.shell-unavailable": "\u684C\u9762\u66F4\u65B0\u670D\u52A1\u672A\u54CD\u5E94\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00 XiaoHui Harness \u540E\u91CD\u8BD5\u3002",
  "update.error": "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF1A"
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
  "update.title": "Application updates",
  "update.description": "Check, download, and install the latest signed XiaoHui Harness release. Product plugins update with the app, which restarts after installation.",
  "update.desktop-only": "Use this action in the XiaoHui Harness desktop application.",
  "update.action": "Check and update",
  "update.checking-action": "Checking\u2026",
  "update.checking": "Checking for updates. A new release will download and install automatically.",
  "update.shell-unavailable": "The desktop update service did not respond. Reopen XiaoHui Harness and try again.",
  "update.error": "Update check failed:"
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
    id: "application-update",
    order: 30,
    locale: SETTINGS_LOCALE_NAMESPACE
  }, ApplicationUpdateRow));
}
    return module.exports;
  },
});
