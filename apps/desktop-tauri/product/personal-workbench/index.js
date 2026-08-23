// src/index.ts
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

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
}
export {
  WORKBENCH_SETTINGS_NAMESPACE,
  WorkbenchSettingsSchema,
  apply,
  name
};
