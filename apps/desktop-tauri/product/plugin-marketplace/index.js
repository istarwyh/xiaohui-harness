/**
 * dsh-plugin-marketplace — node half.
 *
 * Host side of the marketplace: owns a `plugin-marketplace` settings
 * namespace used as a message channel between the browser UI and this
 * process. The client writes an `install` request; the settings watch here
 * spawns `dsh plugin --profile <p> add <pkg>` (npm install into the profile)
 * and appends the mount row to the profile's cordis.patch.yml, then reports
 * progress/result back through `installState`.
 *
 * The settings section UI itself lives in the browser half (exports["./client"]).
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import z from "@deepseek-ai/schemastery";
import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";

/** Cordis plugin name. */
const name = "plugin-marketplace";
/** Services this plugin needs injected from the host tree (ctx.get requires inject). */
const inject = ["llm", "agentDefaultModel"];
/** Settings namespace owned by this plugin (Web UI settings section + install channel). */
const NS = settingsNamespace("plugin-marketplace");

/** Runtime schema: the install request + the install state report. */
const Config = z.object({
  install: z.object({
    /** npm package name to install ("" = no pending request). */
    pkg: z.string().default(""),
    /** client-set timestamp; host dedups on it. */
    ts: z.number().default(0),
  }),
  installState: z.object({
    status: z.string().default("idle"), // idle | running | ok | error
    message: z.string().default(""),
    ts: z.number().default(0),
    /** npm package this state belongs to; the Client hides unrelated results. */
    pkg: z.string().default(""),
  }),
  /** AI-explain request (client writes repo/desc/readme, host answers). */
  aiExplain: z.object({
    repo: z.string().default(""),
    desc: z.string().default(""),
    readme: z.string().default(""),
    ts: z.number().default(0),
  }),
  aiExplainResult: z.object({
    status: z.string().default("idle"), // idle | running | ok | error
    text: z.string().default(""),
    /** repo this result belongs to ("owner/name"); client gates display on it. */
    repo: z.string().default(""),
    ts: z.number().default(0),
  }),
});

/** npm package-name shape (scope/name, no spaces, no path chars). */
const PKG_NAME = /^@?[a-z0-9][a-z0-9-._]*(?:\/[a-z0-9][a-z0-9-._]*)?$/;

/** Keep the actionable pnpm diagnostic instead of the CLI's generic footer. */
function installFailureMessage(result) {
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const pnpmError = lines.find((line) => line.includes("ERR_PNPM_"));
  const registryDetail = lines.find((line) => /(?:not in the npm registry|Not Found - 404)/i.test(line));
  if (pnpmError) {
    return [pnpmError, registryDetail]
      .filter((line, index, values) => line && values.indexOf(line) === index)
      .join(" ");
  }
  const details = lines.filter((line) => !line.startsWith("dsh: pnpm failed in profile directory"));
  return details.slice(-3).join(" ") || "unknown error";
}

function apply(ctx, config) {
  let sourceGetter = null;
  let lastTs = 0;
  let lastExplainTs = 0;

  // ── settings-backed configuration ─────────────────────────────────────────
  // The browser half edits this namespace; `onChange` fires on every write,
  // which is what turns an `install` request into a real install.
  installSettingsSection(ctx, NS, Config, config, {
    setSource: (getter) => {
      sourceGetter = getter;
    },
    onChange: () => {
      void maybeRunInstall();
      void maybeRunExplain();
    },
  });

  // DSH 0.1.0-rc.7+ exposes registered settings namespaces natively, allowing
  // the browser client to write install requests without modifying host files.
  /** Resolved current config (settings layer over the entry). */
  function current() {
    return sourceGetter ? sourceGetter() : config;
  }

  /** Write the install-state report (and clear the consumed request). */
  async function report(status, message, pkg) {
    const settings = ctx.get("settings");
    if (!settings) return;
    const ts = Date.now();
    await settings.update(NS, {
      installState: { status, message, ts, pkg: pkg || "" },
      install: { pkg: "", ts: 0 },
    }).catch((error) => {
      ctx.logger.warn(`[plugin-marketplace] state write failed: ${String(error)}`);
    });
  }

  /** Find the active profile name from the process args ("web" default). */
  function profileName() {
    const argv = process.argv;
    const i = argv.indexOf("--profile");
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    return "web";
  }

  /** The dsh CLI entry used to boot this process (its own bin.js). */
  function dshBin() {
    return process.argv[1];
  }

  /** Read the profile manifest (its `dsh.profile.bundles` list), or null. */
  function profileManifest(profile) {
    try {
      const dshHome = process.env.DSH_HOME || join(os.homedir(), ".dsh");
      return JSON.parse(readFileSync(join(dshHome, "profiles", profile, "package.json"), "utf8"));
    } catch {
      return null;
    }
  }

  /** Whether the installed package declares dsh.bundle.patch (auto-mounted via its bundle layer). */
  function isBundlePackage(pkg, profile) {
    try {
      const dshHome = process.env.DSH_HOME || join(os.homedir(), ".dsh");
      const manifest = JSON.parse(readFileSync(join(dshHome, "profiles", profile, "node_modules", pkg, "package.json"), "utf8"));
      return typeof manifest?.dsh?.bundle?.patch === "string" && manifest.dsh.bundle.patch.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Append a mount row for `pkg` to cordis.patch.yml (idempotent).
   * Bundle plugins (already in `dsh.profile.bundles`, or whose installed
   * package declares `dsh.bundle.patch`) are mounted by their own bundle
   * layer — adding a manual row would create a duplicate loader entry and
   * abort boot. A STALE manual row left by an earlier non-bundle version is
   * removed instead, so reinstalling a bundle plugin never breaks boot.
   */
  function ensureMounted(pkg, profile) {
    const dshHome = process.env.DSH_HOME || join(os.homedir(), ".dsh");
    const patchPath = join(dshHome, "profiles", profile, "cordis.patch.yml");
    if (!existsSync(patchPath)) return " (patch file not found; mount manually)";
    const bundles = profileManifest(profile)?.dsh?.profile?.bundles ?? [];
    if (bundles.includes(pkg) || isBundlePackage(pkg, profile)) {
      // Bundle layer auto-mounts; remove any stale manual row (pre-bundle).
      const src = readFileSync(patchPath, "utf8");
      const cleaned = src.replace(new RegExp(`[ \\t]*- id: [^\\n]*\\n[ \\t]*name: ['"]${pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\n?`, "g"), "");
      if (cleaned !== src) {
        writeFileSync(patchPath, cleaned, "utf8");
        return " (removed stale manual mount row; bundle layer auto-mounts)";
      }
      return bundles.includes(pkg) ? " (already mounted via dsh.profile.bundles)" : " (bundle plugin: auto-mounted via its own dsh.bundle layer)";
    }
    const id = pkg.replace(/^@[^/]+\//, "").replace(/[^a-z0-9-]/g, "-") || pkg;
    let src = readFileSync(patchPath, "utf8");
    if (src.includes(`name: '${pkg}'`) || src.includes(`name: "${pkg}"`)) return " (already mounted)";
    const row = `\n    - id: ${id}\n      name: '${pkg}'`;
    // A flow-style empty array (`[]`, optionally after comment lines) is a
    // valid empty patch: replace it with the block-style insert list.
    // Appending after `[]` would produce two top-level documents in one
    // stream and crash boot with a YAML parse error.
    const emptyArray = /^(\s*(?:#[^\n]*\n?)*)\[\s*\]\s*$/.exec(src);
    if (emptyArray) {
      writeFileSync(patchPath, `${emptyArray[1]}- insert:${row}\n`, "utf8");
      return " (mounted in cordis.patch.yml)";
    }
    // Insert under the first `- insert:` list; match its indentation (4
    // spaces is the convention used by dsh profiles).
    const insertAt = src.search(/^- insert:\s*$/m);
    if (insertAt >= 0) {
      src = src.slice(0, insertAt + "- insert:".length) + row + src.slice(insertAt + "- insert:".length);
    } else {
      // A non-empty flow-style array cannot be safely extended with string
      // surgery — refuse rather than corrupt the file.
      if (/^\s*\[/.test(src)) return " (patch file uses a flow-style array; mount manually)";
      src += `\n- insert:${row}\n`;
    }
    writeFileSync(patchPath, src, "utf8");
    return " (mounted in cordis.patch.yml)";
  }

  /** Run the install; resolve {code, stdout, stderr}. */
  function runInstall(pkg, profile) {
    const bin = dshBin();
    const node = process.execPath;
    return new Promise((resolve) => {
      execFile(node, [bin, "plugin", "--profile", profile, "add", pkg], {
        timeout: 5 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      }, (error, stdout, stderr) => {
        resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr });
      });
    });
  }

  async function maybeRunInstall() {
    let pkg = "";
    try {
      const cfg = current();
      const req = cfg?.install;
      if (!req || !req.pkg || req.ts === lastTs || req.ts === 0) return;
      lastTs = req.ts;
      pkg = String(req.pkg).trim();
      if (!PKG_NAME.test(pkg)) {
        await report("error", `invalid package name: ${pkg}`, pkg);
        return;
      }
      const profile = profileName();
      ctx.logger.info(`[plugin-marketplace] installing ${pkg} (profile=${profile})…`);
      await report("running", `installing ${pkg}…`, pkg);
      const result = await runInstall(pkg, profile);
      if (result.code !== 0) {
        const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
        const tail = output.includes("ERR_PNPM_IGNORED_BUILDS")
          ? "dependency build scripts were blocked by pnpm; the plugin author must make native build dependencies opt-in"
          : installFailureMessage(result);
        ctx.logger.warn(`[plugin-marketplace] install failed (${result.code}): ${tail}`);
        await report("error", `install failed: ${tail || "unknown error"}`, pkg);
        return;
      }
      const mountNote = ensureMounted(pkg, profile);
      ctx.logger.info(`[plugin-marketplace] ${pkg} installed${mountNote}`);
      await report("ok", `${pkg} installed${mountNote}. Restart dsh web to load it.`, pkg);
    } catch (error) {
      ctx.logger.warn(`[plugin-marketplace] install flow failed: ${String(error)}`);
      await report("error", String(error instanceof Error ? error.message : error), pkg);
    }
  }

  /** Write the AI-explain result report (and clear the consumed request). */
  async function reportExplain(status, text, repo) {
    const settings = ctx.get("settings");
    if (!settings) return;
    const ts = Date.now();
    await settings.update(NS, {
      aiExplainResult: { status, text, repo: repo || "", ts },
      aiExplain: { repo: "", desc: "", readme: "", ts: 0 },
    }).catch((error) => {
      ctx.logger.warn(`[plugin-marketplace] explain state write failed: ${String(error)}`);
    });
  }

  /**
   * Answer an aiExplain request with the deployment's default model: tell the
   * user in plain Chinese what this plugin roughly does. Uses the same
   * settings-backed message channel as the install flow.
   */
  async function maybeRunExplain() {
    let repo = "";
    try {
      const cfg = current();
      const req = cfg?.aiExplain;
      if (!req || !req.repo || req.ts === lastExplainTs || req.ts === 0) return;
      lastExplainTs = req.ts;
      repo = String(req.repo);
      const llm = ctx.llm;
      if (!llm) {
        await reportExplain("error", "LLM service unavailable; configure a model in Settings → Models.", repo);
        return;
      }
      // Route through the deployment's default model when one is configured.
      let route = null;
      try {
        const defaults = ctx.agentDefaultModel?.currentSelection?.();
        if (defaults?.provider && defaults?.model) route = defaults;
      } catch { /* no default model service; fall back to the adapter default */ }
      const desc = String(req.desc || "").trim();
      const readme = String(req.readme || "").trim().slice(0, 1500);
      const prompt =
        `插件仓库：${repo}\n` +
        (desc ? `简介：${desc}\n` : "") +
        (readme ? `README 摘要：\n${readme}\n` : "") +
        `\n请用简体中文、3~5 句话直接告诉我这个插件大概是干嘛的（核心用途、解决什么问题、适合谁）。不要复述仓库名，不要罗列安装步骤。`;
      await reportExplain("running", "", repo);
      ctx.logger.info(`[plugin-marketplace] explaining ${repo} (model=${route ? `${route.provider}/${route.model}` : "default"})…`);
      const messages = [createUserMessage({
        content: [{ type: "text", text: prompt }],
        source: { kind: "plugin", plugin: "dsh-plugin-marketplace" },
      })];
      const options = {
        messages,
        maxTokens: 400,
        purpose: "plugin-marketplace-explain",
      };
      if (route) {
        options.provider = route.provider;
        options.model = route.model;
      }
      const assembler = new BlockAssembler();
      for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk);
      const blocks = assembler.blocks();
      const text = blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();
      if (!text) throw new Error("model produced no text");
      await reportExplain("ok", text, repo);
    } catch (error) {
      ctx.logger.warn(`[plugin-marketplace] explain flow failed: ${String(error)}`);
      await reportExplain("error", String(error instanceof Error ? error.message : error), repo);
    }
  }
}

export { Config, apply, inject, installFailureMessage, name };
