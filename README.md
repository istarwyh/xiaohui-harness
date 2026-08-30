# XiaoHui Harness

English | [中文](README.zh.md)

<p align="center">
  <img src="apps/desktop-tauri/app-icon.png" width="120" height="120" alt="XiaoHui Harness" />
</p>

XiaoHui Harness is a macOS AI workbench built from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and the mature [Sakana desktop distribution](https://github.com/Sakana-yuyu/deepseek-harness-desktop). It packages Harbor Evolution and its Skill, [dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth), [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar), [dsh-context-doctor](https://github.com/Zhenyu98/dsh-context-doctor), a personal-workbench branding plugin, and a portable Harbor Python runtime as one application.

The first release targets Apple Silicon only. The application keeps its sessions, profiles, workspace, and jobs under `~/Library/Application Support/XiaoHui Harness`; it does not read or modify the user's existing `~/.dsh` home.

## What the package contains

| Layer | Delivery |
|---|---|
| Desktop shell | Tauri 2 window, tray, notifications, process supervision, startup recovery, and signed updater |
| Harness | A trimmed, built DeepSeek Harness source tree, frozen product lockfile, compressed offline dependency store, and checksum-pinned macOS arm64 Node/pnpm toolchain |
| Product plugins | Committed snapshots of Harbor Evolution, Codex Auth, Better Sidebar, Context Doctor, and the first-party Personal Workbench; Harbor includes the `evolve-agent-with-harbor` Skill |
| Evaluation runtime | Portable CPython 3.12 with the committed Harbor Python adapter snapshot and Harbor |
| Product data | An isolated `DSH_HOME` and a default XiaoHui workspace |

First launch does not contact npm or a Node mirror: XiaoHui verifies and expands its bundled Node/pnpm and dependency-store archives, then performs a frozen offline install. Harbor Jobs still require Docker to be installed and running. Codex Auth requires the official `codex` CLI and its local ChatGPT login; it reads the CLI-owned login state on the Host and never copies tokens into browser settings. Context Doctor provides a read-only context-injection audit panel and the `context_audit` tool. Harbor freezes the current Agent model before a Job and lets the isolated Candidate call that same Host model through a Job-scoped broker, so the default GPT Auth path needs no separate DeepSeek credential. The Candidate receives a short-lived broker capability, not the reusable Codex OAuth token. DeepSeek API credentials remain available for explicitly selected DeepSeek models and are configured inside the workbench, never committed to this repository. An upstream snapshot may receive only a reviewed, exact-version peer-metadata override declared by the product update policy; the provenance record names every applied change.

<a id="run"></a>

## Run

Install the DMG from [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases) and open XiaoHui Harness. **Settings → General → Application updates → Check and update** runs the signed application updater; bundled product plugins advance with that XiaoHui release. In a source checkout that has already been built, the upstream Web UI remains available with `pnpm dsh web`.

<a id="run-from-source"></a>

## Run from source

Prerequisites: macOS arm64, Node 24, pnpm, Rust, Xcode Command Line Tools, and `uv`.

```sh
pnpm install --frozen-lockfile
pnpm run build
cd apps/desktop-tauri
pnpm run prepare:product-runtime
pnpm run build
```

The DMG is written below `apps/desktop-tauri/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`.

To refresh the product plugin from a local Harbor checkout after developing it:

```sh
pnpm --dir apps/desktop-tauri run sync:product-plugin -- /absolute/path/to/harbor-self-evolving/packages/dsh-plugin
```

The sync command also refreshes the sibling `packages/harbor-plugin` Python snapshot. To test another Python source without replacing the committed snapshot:

```sh
XIAOHUI_HARBOR_PYTHON_SOURCE=/absolute/path/to/harbor-self-evolving/packages/harbor-plugin \
  pnpm --dir apps/desktop-tauri run prepare:product-runtime
```

## Release

Before cutting a release, refresh and validate the committed product inputs locally:

```sh
pnpm --dir apps/desktop-tauri run prepare:release
```

The command checks npm's latest stable Codex Auth and Better Sidebar releases, the latest stable Harbor GitHub Release for both the JavaScript plugin and Python adapter, and the Context Doctor `main` head. It deliberately excludes the first-party Personal Workbench. It verifies downloaded archives and provenance, stages every candidate before replacement, validates the bundled Node version plus DSH peer and Client requirements, regenerates the frozen product lockfile, rejects a second DSH/Cordis runtime, performs a real frozen offline install, and runs both Harbor commands plus the assembled Host in a temporary credential-scrubbed environment. Headless Chromium must load the workbench after every Client plugin activates without a page or console error, while the smoke also checks the Context Doctor API, all five product Client responses, and the visible Application updates control. Any failure restores the managed product snapshots and lockfile. Managed paths must be clean by default; `pnpm --dir apps/desktop-tauri run prepare:release -- --allow-dirty` is the explicit escape for intentional local edits.

Review and commit the resulting snapshots and lockfile before tagging. Each `XIAOHUI_UPSTREAM.json` records the exact external revision plus archive and tree hashes; the generated `.bundle-manifest.json` records the selected package versions and whole-bundle hash. Tagged CI and ordinary desktop builds never query latest channels; they consume only the committed snapshots and frozen lockfile so the release remains reproducible.

Pushing an exact `xiaohui-vX.Y.Z` tag runs the macOS arm64 workflow. The workflow refuses version drift, builds the branded client, and publishes a DMG plus signed Tauri updater artifacts to [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases). The updater signature protects update authenticity, but it is not an Apple Developer signature. macOS application signing and notarization remain deferred; Gatekeeper may require the user to choose **Open Anyway** in Privacy & Security.

The original DeepSeek and Sakana work remains under its MIT license and copyright. The bundled Harbor integration and Personal Workbench plugin use the MIT license; Codex Auth and Better Sidebar retain their upstream MIT licenses, while Context Doctor retains its BSD-3-Clause license under `apps/desktop-tauri/product/`. Exact source URLs, immutable versions, and integrity hashes are committed beside every externally refreshed snapshot.
