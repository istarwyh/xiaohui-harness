# XiaoHui Harness Desktop

English | [中文](README.zh.md)

This Tauri application embeds the existing `dsh web` client and adds the XiaoHui product assembly. The installer carries the trimmed Harness source, Harbor Evolution and its Skill, Codex Auth, Better Sidebar, Personal Workbench branding, portable CPython 3.12, and the Harbor adapter.

## Runtime layout

| Resource | Runtime behavior |
|---|---|
| `harness-source` | Carries the built source, frozen lockfile, and one compressed offline pnpm store; copied to a content-hashed application-data directory |
| `toolchain` | Checksum-pinned macOS arm64 Node 22.19.0 and pnpm 11.7.0 archives used when no compatible Host Node exists |
| `xiaohui-runtime` | Executed from the signed application resources; supplies `harbor` and `harbor-dsh` |
| `desktop-overlay` | Registers notifications, Codex Auth/Search/Image, Better Sidebar, Personal Workbench, and Harbor Evolution through `dsh web --patch` |
| `XiaoHui Harness/dsh-home` | Isolated sessions, settings, credentials, and web profile |
| `XiaoHui Harness/workspace` | Fallback Harbor Workbench root when no standard profile instance is active |

The product sources live in `product/harbor-evolution`, `product/harbor-python`, `product/dsh-codex-auth`, `product/dsh-better-sidebar`, and `product/personal-workbench`. `scripts/bundle-harness-source.mjs` places the four Cordis packages and Harbor Skill in the trimmed workspace and adds them to the CLI dependency closure, so the Host resolves the plugin code without a registry install. The two community packages are pinned to their reviewed npm tarballs with source URLs and integrity hashes in `XIAOHUI_UPSTREAM.json`. Both record metadata-only patches that pin their `dsh-*` peers to XiaoHui's bundled `0.1.1-rc.1` runtime and prevent pnpm from resolving a second release-candidate graph. `scripts/prepare-xiaohui-runtime.mjs` installs the committed Python snapshot into a relocatable resource and accepts `XIAOHUI_HARBOR_PYTHON_SOURCE` for temporary local adapter testing.

Every Agent-facing Harbor Tool resolves its root from the calling session's absolute working directory. Selecting `/Users/me/project` in a XiaoHui session therefore keeps initialization and later Agent-created Harbor artifacts inside that project. The desktop overlay's configured application-data `projectRoot` remains only the global Web Workbench and non-Agent fallback; Agent Tools neither use it nor reject a session because it differs.

Harbor resolves and freezes the Candidate model through the Host `agentDefaultModel` and LLM services before it starts a Job. A loopback-only Host broker then exposes that exact route to the Docker task through a random Job-scoped URL and bearer capability. The Python adapter performs an in-container health check before installing or starting the Candidate, generates an ephemeral Cordis overlay under `.harbor-runtime`, and replaces only the Candidate ACP model route with `xiaohui-host/<frozen-model>`. The original Candidate remains immutable, and the Codex OAuth credential never enters its files, configuration, or container environment. The model binding is part of Evaluation Context v2, so a different provider, model, reasoning effort, transport, or protocol cannot reuse an old comparison baseline.

Host Node reuse requires both the supported version and the native CPU architecture. Global pnpm installations are never adopted; XiaoHui provisions its own pinned pnpm to avoid wrappers and native packages installed by a Node build for another architecture. On a cold start, every archive digest is checked, the dependency store is expanded, and `pnpm install --prod --frozen-lockfile --offline` reconstructs `node_modules`; the temporary expanded store and copied archive are removed after success. The 35,000-file Store is compressed to one application resource to reduce the installed app and avoid platform-link failures during Tauri packaging. The macOS build runs App/updater, DMG, and App/updater bundling as separate stages so Finder DMG decoration cannot discard the signed updater artifacts.

The application prepends its private `dsh`, Node, and pnpm shims only to the Host process tree. It does not overwrite a user's global `dsh` command or shell profile unless a developer explicitly launches it with `XIAOHUI_PERSIST_DSH_CLI=1`. Product plugin overlays reuse an active standard Profile Bundle by package name and enable a uniquely named in-box fallback only when no prior mount exists, so a user-installed Harbor, Codex Auth, Better Sidebar, or Personal Workbench bundle does not create a duplicate Loader ID. During an upgrade, the native boot path also rebinds only XiaoHui-managed `link:` dependencies that still point into this application's older content-addressed Harness trees and runs the standard Profile install; registry dependencies and links outside the XiaoHui application-data tree remain user-owned and unchanged.

The desktop shell launches its private Host with `dsh web --no-open`. The loopback URL remains the internal transport loaded by the Tauri WebView, but startup never hands that URL to the operating system's default browser.

Release builds read the semantic application version embedded by Tauri and run one signed update check at a time after the main window opens. The stable `xiaohui-updater` manifest must advertise a higher version before XiaoHui downloads anything; the check has a 15-second deadline, while a failure leaves the running workbench unchanged. The tray shows the current version and supports a manual check. When an update is available, XiaoHui announces the current and target versions, lets Tauri verify and install the signed artifact, stops the private Host, and restarts the application.

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

The macOS arm64 release gate verifies the tag against every desktop version source, builds the Harness and signed-update artifacts, and runs a focused Host startup-argument contract across the DSH parser plus native and WSL desktop launchers. It then relocates the portable runtime out of the application bundle, breaks the original Python-home reference deliberately, and requires both `harbor --version` and `harbor-dsh --help` to succeed before checksumming and publishing the artifacts. The gate stays intentionally narrower than the repository's full test matrix so a desktop patch release does not wait on unrelated platforms or packages.
