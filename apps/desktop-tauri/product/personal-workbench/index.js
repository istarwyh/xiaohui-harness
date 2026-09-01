// src/index.ts
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

// src/host-network-proxy.ts
var HOST_NETWORK_PROXY_TEST_PATH = "/api/xiaohui/network-proxy/test";
var CHATGPT_REACHABILITY_URL = "https://chatgpt.com/";
var HOST_PROXY_TEST_TIMEOUT_MS = 15e3;
var ENVIRONMENT_PROXY_DISPATCHER_MARK = /* @__PURE__ */ Symbol.for(
  "@deepseek-ai/dsh.environment-proxy-dispatcher"
);
function hasProxyEnvironment(environment) {
  return [
    environment.https_proxy,
    environment.HTTPS_PROXY,
    environment.http_proxy,
    environment.HTTP_PROXY
  ].some((value) => value !== void 0 && value.length > 0);
}
function hasEnvironmentProxyDispatcher() {
  return Reflect.get(globalThis, ENVIRONMENT_PROXY_DISPATCHER_MARK) === true;
}
function safeErrorCode(error) {
  let current = error;
  for (let depth = 0; depth < 5 && current !== void 0; depth += 1) {
    if (current !== null && typeof current === "object") {
      const value = current;
      if (typeof value.code === "string" && /^[A-Z0-9_]{1,64}$/.test(value.code)) {
        return value.code;
      }
      if (typeof value.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value.name)) {
        if (value.name !== "Error" && value.name !== "TypeError") return value.name;
      }
      current = value.cause;
      continue;
    }
    break;
  }
  return "UNKNOWN";
}
async function testHostNetworkProxy(fetcher = globalThis.fetch, environment = process.env, dispatcherInstalled = hasEnvironmentProxyDispatcher()) {
  const proxyConfigured = hasProxyEnvironment(environment);
  const proxied = proxyConfigured && dispatcherInstalled;
  if (proxyConfigured && !dispatcherInstalled) {
    return { ok: false, status: 0, proxied, errorCode: "ENV_PROXY_DISPATCHER_MISSING" };
  }
  try {
    const response = await fetcher(CHATGPT_REACHABILITY_URL, {
      signal: AbortSignal.timeout(HOST_PROXY_TEST_TIMEOUT_MS)
    });
    if (response.status === 407 || response.status >= 500) {
      return { ok: false, status: response.status, proxied, errorCode: `HTTP_${response.status}` };
    }
    return { ok: true, status: response.status, proxied, errorCode: "" };
  } catch (error) {
    return { ok: false, status: 0, proxied, errorCode: safeErrorCode(error) };
  }
}
function writeJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}
function createHostNetworkProxyRoute(fetcher = globalThis.fetch, environment = process.env, dispatcherInstalled = hasEnvironmentProxyDispatcher()) {
  return {
    kind: "exact",
    path: HOST_NETWORK_PROXY_TEST_PATH,
    handler: async (request, response) => {
      if (request.method !== "POST") {
        writeJson(response, 405, { ok: false, error: "method-not-allowed" });
        return;
      }
      const mediaType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
      if (mediaType !== "application/json") {
        writeJson(response, 415, { ok: false, error: "application-json-required" });
        return;
      }
      const result = await testHostNetworkProxy(fetcher, environment, dispatcherInstalled);
      writeJson(response, 200, result);
    }
  };
}

// src/settings.ts
import Schema from "@deepseek-ai/schemastery";

// src/constants.ts
var WORKBENCH_SETTINGS_NAMESPACE = "personal-workbench";

// src/settings.ts
var WorkbenchSettingsSchema = Schema.object({
  enabled: Schema.boolean().default(false),
  name: Schema.string().default(""),
  logo: Schema.string().default("")
});

// src/index.ts
var name = "personal-workbench";
function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(WORKBENCH_SETTINGS_NAMESPACE),
      WorkbenchSettingsSchema
    );
  });
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register(createHostNetworkProxyRoute()),
      "personal-workbench: Host network proxy diagnostic"
    );
  });
}
export {
  WORKBENCH_SETTINGS_NAMESPACE,
  WorkbenchSettingsSchema,
  apply,
  name
};
