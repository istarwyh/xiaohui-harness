# XiaoHui Harness Desktop

English | [中文](README.zh.md)

This Tauri application embeds the existing `dsh web` client and adds the XiaoHui product assembly. The installer carries the trimmed Harness source, Harbor Evolution and its Skill, Codex Auth, Better Sidebar, portable CPython 3.12, and the Harbor adapter.

## Runtime layout

| Resource | Runtime behavior |
|---|---|
| `harness-source` | Carries the built source, frozen lockfile, and one compressed offline pnpm store; copied to a content-hashed application-data directory |
| `toolchain` | Checksum-pinned macOS arm64 Node 22.19.0 and pnpm 11.7.0 archives used when no compatible Host Node exists |
| `xiaohui-runtime` | Executed from the signed application resources; supplies `harbor` and `harbor-dsh` |
| `desktop-overlay` | Registers notifications, Codex Auth/Search/Image, Better Sidebar, and Harbor Evolution through `dsh web --patch` |
| `XiaoHui Harness/dsh-home` | Isolated sessions, settings, credentials, and web profile |
| `XiaoHui Harness/workspace` | Default project root and Harbor `jobs/` directory |

The product snapshots live in `product/harbor-evolution`, `product/harbor-python`, `product/dsh-codex-auth`, and `product/dsh-better-sidebar`. `scripts/bundle-harness-source.mjs` places the three Cordis packages and Harbor Skill in the trimmed workspace and adds them to the CLI dependency closure, so the Host resolves the plugin code without a registry install. The two community packages are pinned to their reviewed npm tarballs with source URLs and integrity hashes in `XIAOHUI_UPSTREAM.json`. Both record metadata-only patches that pin their `dsh-*` peers to XiaoHui's bundled `0.1.1-rc.1` runtime and prevent pnpm from resolving a second release-candidate graph. `scripts/prepare-xiaohui-runtime.mjs` installs the committed Python snapshot into a relocatable resource and accepts `XIAOHUI_HARBOR_PYTHON_SOURCE` for temporary local adapter testing.

Host Node reuse requires both the supported version and the native CPU architecture. Global pnpm installations are never adopted; XiaoHui provisions its own pinned pnpm to avoid wrappers and native packages installed by a Node build for another architecture. On a cold start, every archive digest is checked, the dependency store is expanded, and `pnpm install --prod --frozen-lockfile --offline` reconstructs `node_modules`; the temporary expanded store and copied archive are removed after success. The 35,000-file Store is compressed to one application resource to reduce the installed app and avoid platform-link failures during Tauri packaging. The macOS build runs App/updater, DMG, and App/updater bundling as separate stages so Finder DMG decoration cannot discard the signed updater artifacts.

The application prepends its private `dsh`, Node, and pnpm shims only to the Host process tree. It does not overwrite a user's global `dsh` command or shell profile unless a developer explicitly launches it with `XIAOHUI_PERSIST_DSH_CLI=1`.

The desktop overlay injects a Content Security Policy and no-referrer policy into the served workbench. The Tauri-owned splash and shell also have a CSP; the workbench keeps `unsafe-eval` because Cordis client plugins are evaluated dynamically, while objects and base-URL mutation remain disabled.

## Commands

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm --dir apps/desktop-tauri run test:bundle
pnpm --dir apps/desktop-tauri run test:offline
pnpm --dir apps/desktop-tauri run test:overlay
pnpm --dir apps/desktop-tauri run test:update-manifest
pnpm --dir apps/desktop-tauri run test:release-version
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

The current target is `aarch64-apple-darwin`; the release workflow intentionally has no Windows, Intel macOS, or Linux matrix rows.

The macOS arm64 release gate starts with an isolated, empty `XIAOHUI_APP_DATA_DIR` and deliberately unreachable Node/npm mirrors. It must provision bundled Node 22.19.0 and pnpm 11.7.0, complete the frozen offline install, and serve the workbench with HTTP 200. Acceptance checks require the XiaoHui product title, the Harbor, Codex Auth, and Better Sidebar client bundles in the Web boot manifest, and all product rows in Host configuration. The portable runtime reports Harbor 0.21.0 and discovers the `dsh-evolution` Python plugin.
