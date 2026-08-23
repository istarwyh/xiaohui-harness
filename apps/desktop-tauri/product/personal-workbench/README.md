# dsh-personal-workbench

English | [中文](README.zh.md)

This XiaoHui Harness product plugin lets a user replace the sidebar workbench name and Logo from **Settings → General → My Workbench**. The card previews the draft before applying it. **Restore XiaoHui default** disables the custom slot occupants, so the host shell renders its own fallback again.

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
