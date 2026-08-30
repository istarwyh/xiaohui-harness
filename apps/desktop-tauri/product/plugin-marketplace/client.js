/**
 * dsh-plugin-marketplace — browser half.
 *
 * A marketplace section inside the Web UI settings page: browses
 * github.com/topics/dsh-plugin through the public GitHub search API
 * (CORS-enabled), with keyword search, star/update sorting, paging, and a
 * per-plugin detail panel (README summary + install instructions).
 *
 * Hand-written ModuleLoader bundle — no build step required.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-marketplace",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");
    var h = react.createElement;

    // ── CSS (theme tokens) ────────────────────────────────────────────────
    var CSS = ".__mp_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;padding:0;margin:0;list-style:none}" +
      ".__mp_item{display:flex;flex-direction:column;gap:8px}" +
      ".__mp_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;text-align:left;font:inherit;color:inherit}" +
      ".__mp_card:hover{border-color:var(--dsw-alias-brand-primary)}" +
      ".__mp_cardHead{display:flex;align-items:center;gap:8px;min-width:0}" +
      ".__mp_name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".__mp_star{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}" +
      ".__mp_desc{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
      ".__mp_meta{display:flex;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary)}" +
      ".__mp_toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}" +
      ".__mp_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:32px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:13px;min-width:200px;flex:1}" +
      ".__mp_select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:32px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 8px;font-size:13px}" +
      ".__mp_more{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer;margin-top:12px}" +
      ".__mp_more:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}" +
      ".__mp_more:disabled{opacity:.5;cursor:default}" +
      ".__mp_status{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:8px 0 0}" +
      ".__mp_detail{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;margin-top:10px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box}" +
      ".__mp_detailTitle{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}" +
      ".__mp_readme{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;width:100%;box-sizing:border-box;min-width:0}" +
      ".__mp_code{display:block;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:6px;padding:8px 10px;font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-all;width:100%;box-sizing:border-box;min-width:0}" +
      ".__mp_link{color:var(--dsw-alias-brand-primary);font-size:12px;text-decoration:none}" +
      ".__mp_btnPrimary{border-color:var(--dsw-alias-state-business-primary, #679efe);background:var(--dsw-alias-state-business-primary, #679efe);color:#fff}" +
      ".__mp_error{color:var(--dsw-alias-label-error);font-size:12px;margin:8px 0 0}";
    var tagId = "dsh-plugin-marketplace/main.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-marketplace";
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ── locale ────────────────────────────────────────────────────────────
    var NS = "marketplace";
    var inject = ["slots", "locale", "settingsScope", "connection"];
    var zh = {
      nav: "插件市场",
      search: "搜索插件（关键词或留空浏览全部）…",
      sortStars: "按 Star 排序",
      sortUpdated: "按更新时间排序",
      loadMore: "加载更多",
      loading: "加载中…",
      error: "加载失败，请稍后重试",
      empty: "没有找到插件",
      install: "安装方式",
      installHint: "在 profile 目录执行 pnpm 安装，然后在 cordis.patch.yml 挂载：",
      installHintBundle: "标准 bundle 插件：dsh plugin add 后由 bundle 层自动挂载，无需手动改 cordis.patch.yml：",
      readme: "README 摘要",
      readmeEmpty: "（该仓库没有 README）",
      openRepo: "打开 GitHub 仓库 ↗",
      openNpm: "在 npm 查看相关包 ↗",
      updated: "更新",
      total: "共 {count} 个插件",
      ghError: "GitHub API 请求失败（未认证限流 60 次/小时），请稍后再试",
      installBtn: "一键安装",
      confirmInstall: "确认安装 {pkg}？",
      installing: "安装中…",
      installOk: "已安装：{msg}",
      installErr: "安装失败：{msg}",
      installIdle: "",
      installingHint: "正在后台执行 dsh plugin add，请稍候…",
      npmChecking: "正在核验 npm 包…",
      npmResolved: "可安装 npm 包：{pkg}@{version}",
      npmMissing: "没有找到能关联该仓库并声明 dsh.bundle.patch 的 npm Package；不能一键安装，请按仓库 README 操作。",
      npmCheckFailed: "暂时无法核验该仓库对应的 npm Package，因此不会执行一键安装。请稍后重试。",
      npmAmbiguous: "多个可安装 DSH Bundle Package 声明与该仓库关联，无法安全选择；请按仓库 README 手动安装。",
      npmUnavailable: "无法一键安装",
      aiExplain: "🤖 AI 解释",
      aiExplaining: "AI 解释中，请稍候…",
      aiExplainErr: "AI 解释失败：{msg}",
      notExposed: "当前 DSH 版本没有公开插件市场的设置通道；请升级到 DSH 0.1.0-rc.7 或更高版本并重启 dsh web。"
    };
    var en = {
      nav: "Plugin Marketplace",
      search: "Search plugins (keyword, or empty to browse all)…",
      sortStars: "Sort by stars",
      sortUpdated: "Sort by updated",
      loadMore: "Load more",
      loading: "Loading…",
      error: "Failed to load, try again later",
      empty: "No plugins found",
      install: "Install",
      installHint: "Run pnpm in your profile dir, then mount in cordis.patch.yml:",
      installHintBundle: "Standard bundle plugin: dsh plugin add auto-mounts it via its bundle layer — no manual cordis.patch.yml edit needed:",
      readme: "README summary",
      readmeEmpty: "(no README in this repo)",
      openRepo: "Open GitHub repo ↗",
      openNpm: "Search npm ↗",
      updated: "Updated",
      total: "{count} plugins",
      ghError: "GitHub API rate-limited (60/hr unauthenticated), try again later",
      installBtn: "Install",
      confirmInstall: "Install {pkg}?",
      installing: "Installing…",
      installOk: "Installed: {msg}",
      installErr: "Install failed: {msg}",
      installIdle: "",
      installingHint: "Running dsh plugin add in the background…",
      npmChecking: "Checking the npm package…",
      npmResolved: "Installable npm package: {pkg}@{version}",
      npmMissing: "No npm package both links to this repository and declares dsh.bundle.patch. Follow the repository README instead.",
      npmCheckFailed: "The npm package for this repository could not be verified, so one-click install will not run. Try again later.",
      npmAmbiguous: "Multiple installable DSH bundle packages claim this repository, so none can be selected safely. Follow the repository README instead.",
      npmUnavailable: "One-click unavailable",
      aiExplain: "🤖 AI Explain",
      aiExplaining: "AI is explaining…",
      aiExplainErr: "AI explain failed: {msg}",
      notExposed: "This DSH version does not expose the plugin-marketplace settings channel. Upgrade to DSH 0.1.0-rc.7 or newer and restart dsh web."
    };

    // ── GitHub API ────────────────────────────────────────────────────────
    var BASE = "https://api.github.com/search/repositories";
    var cache = new Map(); // queryKey -> {items, incomplete}
    function queryKey(q, sort, page) { return q + "|" + sort + "|" + page; }
    function fmtTime(iso) {
      try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
    }
    async function fetchPage(q, sort, page) {
      var key = queryKey(q, sort, page);
      var hit = cache.get(key);
      if (hit) return hit;
      var params = new URLSearchParams({
        q: "topic:dsh-plugin" + (q ? " " + q : ""),
        sort: sort,
        order: "desc",
        per_page: "20",
        page: String(page)
      });
      var res = await fetch(BASE + "?" + params.toString(), { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var items = (data.items || []).map(function (r) {
        return {
          fullName: r.full_name,
          desc: r.description || "",
          stars: r.stargazers_count || 0,
          updated: r.updated_at || "",
          lang: r.language || "",
          htmlUrl: r.html_url
        };
      });
      var out = { items: items, total: data.total_count || 0 };
      cache.set(key, out);
      return out;
    }
    async function fetchReadme(fullName) {
      var url = "https://api.github.com/repos/" + fullName + "/readme";
      var res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) {
        var e = new Error("readme http " + res.status);
        e.status = res.status;
        throw e;
      }
      var data = await res.json();
      var bin = atob(data.content.replace(/\s+/g, ""));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    }
    // npm metadata gates one-click install and detects bundle packages; CORS-enabled, cached.
    var npmCache = new Map(); // GitHub owner/repo -> Promise<{status,isBundle,name?,version?}>
    function normalizeGitHubRepository(value) {
      if (value && typeof value === "object") value = value.url;
      if (typeof value !== "string") return "";
      var match = value.replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/$/, "").match(/github\.com[/:]([^/]+)\/([^/#]+)$/i);
      return match ? (match[1] + "/" + match[2]).toLowerCase() : "";
    }
    function referencesRepository(value, target, depth) {
      if (depth > 6 || value === null || value === undefined) return false;
      if (typeof value === "string") return normalizeGitHubRepository(value) === target;
      if (Array.isArray(value)) return value.some(function (entry) { return referencesRepository(entry, target, depth + 1); });
      if (typeof value === "object") return Object.keys(value).some(function (key) { return referencesRepository(value[key], target, depth + 1); });
      return false;
    }
    function isDshBundle(data) {
      return typeof data === "object" && data !== null && typeof data.dsh === "object" && data.dsh !== null && typeof data.dsh.bundle === "object" && data.dsh.bundle !== null && typeof data.dsh.bundle.patch === "string" && data.dsh.bundle.patch.length > 0;
    }
    function npmSearchCandidateRank(entry, fullName) {
      var packageInfo = entry && entry.package;
      if (!packageInfo || typeof packageInfo.name !== "string") return 0;
      var owner = fullName.toLowerCase().split("/")[0];
      var target = fullName.toLowerCase();
      if (normalizeGitHubRepository(packageInfo.links && packageInfo.links.repository) === target) return 2;
      return packageInfo.name.toLowerCase().startsWith("@" + owner + "/") ? 1 : 0;
    }
    function npmMatchRank(data, fullName) {
      if (!isDshBundle(data)) return 0;
      var parts = fullName.toLowerCase().split("/");
      var owner = parts[0], target = parts.join("/");
      if (normalizeGitHubRepository(data && data.repository) === target) return 3;
      if (!referencesRepository(data && data.dsh, target, 0)) return 0;
      return typeof data.name === "string" && data.name.toLowerCase().startsWith("@" + owner + "/") ? 2 : 0;
    }
    async function fetchNpmInfo(fullName) {
      if (npmCache.has(fullName)) return npmCache.get(fullName);
      var repositoryName = fullName.split("/")[1];
      var promise = fetch("https://registry.npmjs.org/-/v1/search?text=" + encodeURIComponent(repositoryName) + "&size=20", {
        headers: { Accept: "application/json" }
      }).then(function (res) {
        if (!res.ok) throw new Error("npm search http " + res.status);
        return res.json();
      }).then(function (result) {
        var names = Array.from(new Set((result.objects || []).filter(function (entry) {
          return npmSearchCandidateRank(entry, fullName) > 0;
        }).map(function (entry) { return entry.package.name; })));
        return Promise.all(names.map(function (name) {
          return fetch("https://registry.npmjs.org/" + encodeURIComponent(name) + "/latest", {
            headers: { Accept: "application/json" }
          }).then(function (res) {
            if (res.status === 404) return null;
            if (!res.ok) throw new Error("npm metadata http " + res.status);
            return res.json();
          }).then(function (data) {
            if (data === null) return { ok: true, data: null, rank: 0 };
            if (!data || data.name !== name || typeof data.version !== "string" || data.version.length === 0) throw new Error("npm metadata identity mismatch");
            return { ok: true, data: data, rank: npmMatchRank(data, fullName) };
          })
            .catch(function () { return { ok: false, data: null, rank: 0 }; });
        }));
      }).then(function (candidates) {
        if (candidates.some(function (candidate) { return !candidate.ok; })) return { status: "error", isBundle: false };
        var matched = candidates.filter(function (candidate) { return candidate.ok && candidate.rank > 0; }).sort(function (a, b) { return b.rank - a.rank; });
        if (matched.length === 0) return { status: "missing", isBundle: false };
        if (matched.length > 1 && matched[0].rank === matched[1].rank) return { status: "ambiguous", isBundle: false };
        var data = matched[0].data;
        return {
          status: "available",
          name: data.name,
          version: data.version,
          isBundle: true
        };
      }).catch(function () {
        return { status: "error", isBundle: false };
      });
      npmCache.set(fullName, promise);
      return promise;
    }

    var marketplaceLinkChannel = "xiaohui.desktop.marketplace-link";
    var marketplaceLinkVersion = 1;
    var marketplaceLinkSequence = 0;
    function openMarketplaceLink(event, url) {
      event.preventDefault();
      if (window.parent !== window) {
        marketplaceLinkSequence += 1;
        window.parent.postMessage({
          channel: marketplaceLinkChannel,
          version: marketplaceLinkVersion,
          type: "open-request",
          requestId: String(Date.now()) + "_" + String(marketplaceLinkSequence),
          url: url
        }, "*");
        return;
      }
      var opened = window.open(url, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
    }

    // ── components ────────────────────────────────────────────────────────
    function PluginCard(props) {
      return h("li", null,
        h("button", { type: "button", className: "__mp_card", onClick: props.onOpen },
          h("div", { className: "__mp_cardHead" },
            h("span", { className: "__mp_name", title: props.plugin.fullName }, props.plugin.fullName),
            h("span", { className: "__mp_star" }, "★ " + props.plugin.stars)
          ),
          props.plugin.desc ? h("div", { className: "__mp_desc" }, props.plugin.desc) : null,
          h("div", { className: "__mp_meta" },
            props.plugin.lang ? h("span", null, props.plugin.lang) : null,
            h("span", null, props.t("updated") + " " + fmtTime(props.plugin.updated))
          )
        )
      );
    }

    function DetailPanel(props) {
      var p = props.plugin;
      var fallbackName = p.fullName.split("/")[1];
      var installName = props.npmInfo && props.npmInfo.name || fallbackName;
      var st = props.installState; // {status, message, pkg} from the settings scope
      var active = st && st.pkg === installName;
      var status = active ? st.status : "idle";
      var npmStatus = props.npmInfo ? props.npmInfo.status : "loading";
      var installAvailable = npmStatus === "available";
      var repositoryUrl = p.htmlUrl;
      var npmUrl = installAvailable ? "https://www.npmjs.com/package/" + installName : "https://www.npmjs.com/search?q=" + encodeURIComponent(fallbackName);
      var explainState = props.explainState; // {status, text, repo} from the settings scope
      // The settings field is namespace-global and persists across sessions,
      // so only show it when it belongs to the plugin currently open.
      var explainMine = !!explainState && explainState.repo === p.fullName;
      var [confirming, setConfirming] = react.useState(false);
      var statusNode = null;
      if (status === "running") {
        statusNode = h("div", { className: "__mp_status" }, props.t("installingHint"));
      } else if (status === "ok") {
        statusNode = h("div", { className: "__mp_status" }, props.t("installOk").replace("{msg}", st.message || ""));
      } else if (status === "error") {
        statusNode = h("div", { className: "__mp_error" }, props.t("installErr").replace("{msg}", st.message || ""));
      }
      var btn;
      if (status === "running") {
        btn = h("button", { type: "button", className: "__mp_more", disabled: true }, props.t("installing"));
      } else if (!installAvailable) {
        btn = h("button", { type: "button", className: "__mp_more", disabled: true }, npmStatus === "loading" ? props.t("npmChecking") : props.t("npmUnavailable"));
      } else if (confirming) {
        btn = h("button", {
          type: "button", className: "__mp_btnPrimary __mp_more",
          onClick: function () { setConfirming(false); props.onInstall(installName); }
        }, props.t("confirmInstall").replace("{pkg}", installName));
      } else {
        btn = h("button", {
          type: "button", className: "__mp_btnPrimary __mp_more",
          onClick: function () { setConfirming(true); }
        }, props.t("installBtn"));
      }
      return h("div", { className: "__mp_detail" },
        h("div", { className: "__mp_detailTitle" }, p.fullName),
        h("div", { className: "__mp_meta" },
          h("span", null, "★ " + p.stars),
          h("span", null, props.t("updated") + " " + fmtTime(p.updated)),
          props.lang ? h("span", null, p.lang) : null
        ),
        h("div", null,
          h("a", { className: "__mp_link", href: repositoryUrl, target: "_blank", rel: "noopener noreferrer", onClick: function (event) { openMarketplaceLink(event, repositoryUrl); } }, props.t("openRepo")),
          "  ·  ",
          h("a", { className: "__mp_link", href: npmUrl, target: "_blank", rel: "noopener noreferrer", onClick: function (event) { openMarketplaceLink(event, npmUrl); } }, props.t("openNpm"))
        ),
        h("div", { className: "__mp_detailTitle" }, props.t("install")),
        h("div", { className: npmStatus === "missing" || npmStatus === "error" || npmStatus === "ambiguous" ? "__mp_error" : "__mp_readme" },
          npmStatus === "loading" ? props.t("npmChecking")
            : npmStatus === "missing" ? props.t("npmMissing")
            : npmStatus === "error" ? props.t("npmCheckFailed")
            : npmStatus === "ambiguous" ? props.t("npmAmbiguous")
            : props.npmInfo.isBundle ? props.t("installHintBundle") : props.t("installHint")
        ),
        installAvailable ? h("div", { className: "__mp_status" }, props.t("npmResolved").replace("{pkg}", installName).replace("{version}", props.npmInfo.version || "?")) : null,
        installAvailable ? h("code", { className: "__mp_code" },
          "dsh plugin --profile web add " + installName + "\n" +
          (props.npmInfo.isBundle
            ? "# standard bundle: auto-mounted via dsh.profile.bundles"
            : "# then in $DSH_HOME/profiles/web/cordis.patch.yml:\n" +
              "- insert:\n    - id: " + installName + "\n      name: '" + installName + "'")
        ) : null,
        btn,
        statusNode,
        h("div", { className: "__mp_detailTitle" }, props.t("readme")),
        h("div", { className: "__mp_readme" },
          props.readmeLoading ? props.t("loading")
            : props.readmeRateLimited ? props.ghError
            : props.readmeError ? props.t("readmeEmpty")
            : (props.readme || "")
        ),
        h("div", { className: "__mp_translateRow" },
          h("button", { type: "button", className: "__mp_translateBtn",
            style: { marginTop: "8px", padding: "4px 10px", fontSize: "12px", cursor: "pointer", background: "var(--dsw-alias-bg-hover, #21262d)", color: "var(--dsw-alias-label-primary, #e6edf3)", border: "1px solid var(--dsw-alias-border, #30363d)", borderRadius: "6px" },
            disabled: explainMine && explainState.status === "running",
            onClick: function () { props.onExplain(p.fullName, p.desc, props.readme || ""); }
          }, props.t("aiExplain")),
          h("div", { id: "__mp_translateOut", style: { fontSize: "12px", lineHeight: "1.6", color: "var(--dsw-alias-label-secondary, #8b949e)", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: "8px", borderTop: "1px solid var(--dsw-alias-border, #21262d)", paddingTop: "8px" } },
            explainMine && props.explainError ? h("span", { style: { color: "var(--dsw-alias-state-danger-text, #f85149)" } }, props.explainError)
              : explainMine && explainState.status === "running" ? props.t("aiExplaining")
              : explainMine && explainState.status === "error" ? props.t("aiExplainErr").replace("{msg}", explainState.text || "unknown")
              : explainMine && explainState.status === "ok" ? explainState.text
              : ""
          )
        )
      );
    }

    function MarketplaceSection(props) {
      var t = props.t;
      var scope = props.scope;
      var api = props.api;
      var state = react.useState({ q: "", sort: "stars", page: 1, items: [], loading: false, error: null, total: 0, open: null, readme: null, readmeLoading: false, readmeError: false, readmeRateLimited: false, npmInfo: null });
      var s = state[0], set = state[1];
      // install-state subscription (stable pattern: useState + subscribe, never
      // depend on getSnapshot() reference identity).
      var [installState, setInstallState] = react.useState(null);
      react.useEffect(function () {
        var alive = true;
        var sync = function () { if (alive) setInstallState(scope.getSnapshot()); };
        sync();
        var un = typeof scope.subscribe === "function" ? scope.subscribe(sync) : null;
        return function () { alive = false; if (un) un(); if (scope.dispose) scope.dispose(); };
      }, [scope]);
      // Older hosts can still return settings-not-exposed. Recommend upgrading
      // instead of mutating the installed DSH package on disk.
      var mutateError = function (detail, fallback) {
        if (detail && detail.code === "settings-not-exposed") return t("notExposed");
        return String(detail && (detail.message || detail.code) || fallback);
      };
      var onInstall = react.useCallback(function (pkg) {
        set(function (prev) { return Object.assign({}, prev, { installError: null }); });
        api.settings.mutate({
          ns: "plugin-marketplace",
          ops: [{ op: "set", path: ["install"], value: { pkg: pkg, ts: Date.now() } }]
        }).then(function (response) {
          if (!response.result.ok) {
            var detail = response.result.error || {};
            set(function (prev) { return Object.assign({}, prev, { installError: mutateError(detail, "unknown") }); });
          }
        }).catch(function (e) {
          set(function (prev) { return Object.assign({}, prev, { installError: String(e && e.message || e) }); });
        });
      }, [api, t]);
      // AI-explain request: the host answers over the same settings channel.
      var onExplain = react.useCallback(function (repo, desc, readme) {
        set(function (prev) { return Object.assign({}, prev, { explainError: null }); });
        api.settings.mutate({
          ns: "plugin-marketplace",
          ops: [{ op: "set", path: ["aiExplain"], value: { repo: repo, desc: desc, readme: readme, ts: Date.now() } }]
        }).then(function (response) {
          if (!response.result.ok) {
            var detail = response.result.error || {};
            set(function (prev) { return Object.assign({}, prev, { explainError: mutateError(detail, "unknown") }); });
          }
        }).catch(function (e) {
          set(function (prev) { return Object.assign({}, prev, { explainError: String(e && e.message || e) }); });
        });
      }, [api, t]);
      var load = react.useCallback(function (q, sort, page, append) {
        set(function (prev) { return Object.assign({}, prev, { loading: true, error: null }); });
        fetchPage(q, sort, page).then(function (out) {
          set(function (prev) {
            var items = append ? prev.items.concat(out.items) : out.items;
            return Object.assign({}, prev, { items: items, total: out.total, loading: false, page: page, q: q, sort: sort });
          });
        }).catch(function () {
          set(function (prev) { return Object.assign({}, prev, { loading: false, error: t("ghError") }); });
        });
      }, [t]);
      react.useEffect(function () {
        load("", "stars", 1, false);
      }, [load]);
      var openDetail = react.useCallback(function (plugin) {
        if (s.open && s.open.fullName === plugin.fullName) { set(function (prev) { return Object.assign({}, prev, { open: null }); }); return; }
        set(function (prev) { return Object.assign({}, prev, { open: plugin, readme: null, readmeError: false, readmeRateLimited: false, readmeLoading: true, npmInfo: { status: "loading", isBundle: false } }); });
        // Detail expands inline under the clicked card; scroll minimally
        // (nearest) only when it would fall outside the viewport.
        setTimeout(function () {
          var el = document.querySelector(".__mp_detail");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
        fetchReadme(plugin.fullName).then(function (text) {
          set(function (prev) {
            if (!prev.open || prev.open.fullName !== plugin.fullName) return prev;
            return Object.assign({}, prev, { readme: text.slice(0, 1200), readmeLoading: false, readmeError: false, readmeRateLimited: false });
          });
        }).catch(function (err) {
          set(function (prev) {
            if (!prev.open || prev.open.fullName !== plugin.fullName) return prev;
            var rateLimited = err && (err.status === 403 || err.status === 429);
            return Object.assign({}, prev, { readmeLoading: false, readmeError: !rateLimited, readmeRateLimited: rateLimited });
          });
        });
        // npm metadata decides whether one-click install is safe to offer and
        // whether the target package declares dsh.bundle.patch.
        fetchNpmInfo(plugin.fullName).then(function (info) {
          set(function (prev) {
            if (!prev.open || prev.open.fullName !== plugin.fullName) return prev;
            return Object.assign({}, prev, { npmInfo: info });
          });
        });
      }, [s.open]);
      var submit = function (e) {
        e.preventDefault();
        load(s.q, s.sort, 1, false);
      };
      var more = function () { load(s.q, s.sort, s.page + 1, true); };
      return h("div", null,
        h("form", { className: "__mp_toolbar", onSubmit: submit },
          h("input", { className: "__mp_input", type: "search", value: s.q, placeholder: t("search"), onChange: function (e) { set(function (prev) { return Object.assign({}, prev, { q: e.target.value }); }); } }),
          h("select", { className: "__mp_select", value: s.sort, onChange: function (e) { load(s.q, e.target.value, 1, false); } },
            h("option", { value: "stars" }, t("sortStars")),
            h("option", { value: "updated" }, t("sortUpdated"))
          )
        ),
        s.total > 0 ? h("p", { className: "__mp_status" }, t("total").replace("{count}", String(s.total))) : null,
        h("ul", { className: "__mp_grid" },
          s.items.map(function (p) {
            // Detail expands INLINE right under the clicked card, so there is
            // no jumping around the page.
            var open = s.open && s.open.fullName === p.fullName;
            return h("div", { key: p.fullName, className: "__mp_item" },
              h(PluginCard, { plugin: p, t: t, onOpen: function () { openDetail(p); } }),
              open ? h(DetailPanel, { plugin: s.open, t: t, readme: s.readme, readmeLoading: s.readmeLoading, readmeError: s.readmeError, readmeRateLimited: s.readmeRateLimited, lang: s.open.lang, installState: installState && installState.status === "ready" ? installState.value.installState : null, onInstall: onInstall, ghError: t("ghError"), explainState: installState && installState.status === "ready" ? installState.value.aiExplainResult : null, explainError: s.explainError, onExplain: onExplain, npmInfo: s.npmInfo }) : null
            );
          })
        ),
        s.loading ? h("p", { className: "__mp_status" }, t("loading")) : null,
        s.error ? h("p", { className: "__mp_error" }, s.error) : null,
        s.items.length === 0 && !s.loading && !s.error ? h("p", { className: "__mp_status" }, t("empty")) : null,
        s.items.length > 0 ? h("button", { type: "button", className: "__mp_more", onClick: more, disabled: s.loading }, t("loadMore")) : null,
        s.installError ? h("p", { className: "__mp_error" }, s.installError) : null
      );
    }

    // ── plugin ────────────────────────────────────────────────────────────
    function apply(ctx) {
      var t = ctx.locale.bind(NS);
      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "dsh-plugin-marketplace: dictionaries");
      var scope = ctx.settingsScope.bind({ namespace: "plugin-marketplace" });
      var api = ctx.connection.api;
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "marketplace",
          order: 20,
          label: function () { return t("nav"); },
          locale: NS
        }, function (props) {
          return h(MarketplaceSection, Object.assign({}, props, { scope: scope, api: api }));
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
