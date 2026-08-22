# XiaoHui Harness Desktop

English | [中文](README.zh.md)

This Tauri application embeds the existing `dsh web` client and adds the XiaoHui product assembly. The installer carries the trimmed Harness source, the Harbor Evolution plugin and Skill, portable CPython 3.12, and the Harbor adapter.

## Runtime layout

| Resource | Runtime behavior |
|---|---|
| `harness-source` | Copied to a content-hashed application-data directory; production dependencies are installed on first launch |
| `xiaohui-runtime` | Executed from the signed application resources; supplies `harbor` and `harbor-dsh` |
| `desktop-overlay` | Registers notifications and the product-owned `harbor-evolution` Cordis row through `dsh web --patch` |
| `XiaoHui Harness/dsh-home` | Isolated sessions, settings, credentials, and web profile |
| `XiaoHui Harness/workspace` | Default project root and Harbor `jobs/` directory |

The product snapshots live in `product/harbor-evolution` and `product/harbor-python`. `scripts/bundle-harness-source.mjs` places the Cordis package and Skill in the trimmed workspace and adds them to the CLI dependency closure, so the Host resolves them without a registry install. `scripts/prepare-xiaohui-runtime.mjs` installs the committed Python snapshot into a relocatable resource and accepts `XIAOHUI_HARBOR_PYTHON_SOURCE` for temporary local adapter testing.

Host Node reuse requires both the supported version and the native CPU architecture. Global pnpm installations are never adopted; XiaoHui provisions its own pinned pnpm to avoid wrappers and native packages installed by a Node build for another architecture. The macOS build runs App/updater, DMG, and App/updater bundling as separate stages so Finder DMG decoration cannot discard the signed updater artifacts.

## Commands

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm --dir apps/desktop-tauri run test:bundle
pnpm --dir apps/desktop-tauri run test:overlay
pnpm --dir apps/desktop-tauri run test:update-manifest
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

The current target is `aarch64-apple-darwin`; the release workflow intentionally has no Windows, Intel macOS, or Linux matrix rows.

The verified first-launch path on macOS arm64 downloaded Node 22.19.0, provisioned pnpm 11.7.0, installed the trimmed production workspace, loaded the Harbor client plugin, and served the workbench with HTTP 200. The portable runtime reported Harbor 0.21.0 and discovered the `dsh-evolution` Python plugin.
