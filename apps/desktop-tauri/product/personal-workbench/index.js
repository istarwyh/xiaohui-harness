// src/index.ts
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

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
var proxyDispatcherInstalled = false;
function installApplicationProxyDispatcher() {
  if (proxyDispatcherInstalled) return;
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy;
  if (proxy === void 0 || proxy.length === 0) return;
  setGlobalDispatcher(new EnvHttpProxyAgent());
  proxyDispatcherInstalled = true;
}
function apply(ctx) {
  installApplicationProxyDispatcher();
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(WORKBENCH_SETTINGS_NAMESPACE),
      WorkbenchSettingsSchema
    );
  });
}
export {
  WORKBENCH_SETTINGS_NAMESPACE,
  WorkbenchSettingsSchema,
  apply,
  name
};
