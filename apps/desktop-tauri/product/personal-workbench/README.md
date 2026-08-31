# dsh-personal-workbench

English | [中文](README.zh.md)

This first-party XiaoHui Harness product plugin owns three General settings cards. **Settings → General → My Workbench** lets a user replace the sidebar workbench name and Logo, preview the draft, and restore the XiaoHui fallback. **Settings → General → Network proxy** configures one application-wide Direct, macOS system, or custom proxy policy, tests both the desktop draft route and the active Node Host route against ChatGPT, and saves it before restarting XiaoHui. **Settings → General → Application lifecycle** asks the trusted desktop shell to run the signed application updater or restart the complete application after stopping its private Host. A restart loads plugins installed through Plugin Marketplace. Desktop actions remain visible but disabled in standalone `dsh web`; no browser request can choose an arbitrary Tauri command, proxy credentials are not accepted, and the update action never refreshes plugin source on an end-user machine because bundled product plugins advance with the signed application release.

The workbench identity is stored in the current DSH Profile under the `personal-workbench` namespace:

```yaml
personal-workbench:
  enabled: true
  name: My Workbench
  logo: data:image/png;base64,...
```

The browser stores an uploaded image as a data URL in the current Profile. Name and Logo customization does not change the browser title, executable name, application icon, theme, or other UI copy.

The network proxy is stored in XiaoHui's native desktop settings, outside the DSH Profile. Direct mode removes inherited proxy variables from the application process tree. System mode reads fixed macOS HTTP and HTTPS proxy endpoints with `/usr/sbin/scutil`; it rejects PAC, automatic discovery, and HTTP-only configurations because translating those settings to Node subprocesses would not preserve their routing behavior. Custom mode requires separate credential-free HTTP and HTTPS URLs and can add bypass hosts, while XiaoHui always bypasses its own loopback Host. The DSH CLI installs Undici's environment-proxy Dispatcher after loading the launch environment and before importing Profile boot, so the bundled Node 22.19 Host does not depend on a later Node flag or a configured plugin for global `fetch` routing. The Host diagnostic first requires process-local proof of that CLI installation, then uses a fixed same-origin JSON POST and returns only reachability, HTTP status, proxy use, and a bounded transport code such as `UND_ERR_CONNECT_TIMEOUT`; it never returns request errors, proxy URLs, or credentials. The selected policy becomes active only after the requested application restart and then applies to the private Host, plugin subprocesses, profile installs, runtime provisioning, and signed application updates.

## Model Experience

None, as this package changes browser presentation only; it does not add content to model requests.

#### KV Cache effect

None; changing the workbench identity does not assemble or send a provider request.

## Known Limitations and Deferred Work

- **One Profile owns one custom identity** — the plugin does not select different branding per Workspace or Session.
- **Only the declared brand slots change** — browser title, desktop icon, themes, fonts, wallpapers, and global text remain owned by their existing surfaces.
- **Proxy authentication and PAC are not stored or evaluated** — use credential-free fixed endpoints reachable by the application process; WSL targets must also be reachable from the WSL network namespace.
- **Proxy changes are restart-scoped** — Test uses the draft settings, while running Host and updater processes retain the previously activated policy until the application restarts.
- **Application lifecycle actions are desktop-only** — the workbench Client can request only the fixed signed-update and restart flows; the shell accepts them only from the active Host iframe at its exact Origin.
