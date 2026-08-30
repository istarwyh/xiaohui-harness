# dsh-personal-workbench

English | [中文](README.zh.md)

This first-party XiaoHui Harness product plugin owns two General settings cards. **Settings → General → My Workbench** lets a user replace the sidebar workbench name and Logo, preview the draft, and restore the XiaoHui fallback. **Settings → General → Application lifecycle** asks the trusted desktop shell to run the signed application updater or restart the complete application after stopping its private Host. A restart loads plugins installed through Plugin Marketplace. Both actions are visible but disabled in standalone `dsh web`; neither can choose an arbitrary Tauri command, and the update action never refreshes plugin source on an end-user machine because bundled product plugins advance with the signed application release.

The settings are stored in the current DSH Profile under the `personal-workbench` namespace:

```yaml
personal-workbench:
  enabled: true
  name: My Workbench
  logo: data:image/png;base64,...
```

The browser stores an uploaded image as a data URL in the current Profile. Name and Logo customization does not change the browser title, executable name, application icon, theme, or other UI copy.

## Model Experience

None, as this package changes browser presentation only; it does not add content to model requests.

#### KV Cache effect

None; changing the workbench identity does not assemble or send a provider request.

## Known Limitations and Deferred Work

- **One Profile owns one custom identity** — the plugin does not select different branding per Workspace or Session.
- **Only the declared brand slots change** — browser title, desktop icon, themes, fonts, wallpapers, and global text remain owned by their existing surfaces.
- **Application lifecycle actions are desktop-only** — the workbench Client can request only the fixed signed-update and restart flows; the shell accepts them only from the active Host iframe at its exact Origin.
