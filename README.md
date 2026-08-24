# XiaoHui Harness

English | [中文](README.zh.md)

<p align="center">
  <img src="apps/desktop-tauri/app-icon.png" width="120" height="120" alt="XiaoHui Harness" />
</p>

XiaoHui Harness is a macOS AI workbench built from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and the mature [Sakana desktop distribution](https://github.com/Sakana-yuyu/deepseek-harness-desktop). It packages Harbor Evolution and its Skill, [dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth), [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar), a personal-workbench branding plugin, and a portable Harbor Python runtime as one application.

The first release targets Apple Silicon only. The application keeps its sessions, profiles, workspace, and jobs under `~/Library/Application Support/XiaoHui Harness`; it does not read or modify the user's existing `~/.dsh` home.

## What the package contains

| Layer | Delivery |
|---|---|
| Desktop shell | Tauri 2 window, tray, notifications, process supervision, startup recovery, and signed updater |
| Harness | A trimmed, built DeepSeek Harness source tree, frozen product lockfile, compressed offline dependency store, and checksum-pinned macOS arm64 Node/pnpm toolchain |
| Product plugins | Committed `dsh-harbor-evolution@0.7.2`, `dsh-codex-auth@0.3.0`, `dsh-better-sidebar@0.15.1`, and `dsh-personal-workbench@0.1.0`; Harbor includes the `evolve-agent-with-harbor` Skill |
| Evaluation runtime | Portable CPython 3.12 with the committed `harbor-dsh-evolution==0.7.2` source snapshot and Harbor |
| Product data | An isolated `DSH_HOME` and a default XiaoHui workspace |

First launch does not contact npm or a Node mirror: XiaoHui verifies and expands its bundled Node/pnpm and dependency-store archives, then performs a frozen offline install. Harbor Jobs still require Docker to be installed and running. Codex Auth requires the official `codex` CLI and its local ChatGPT login; it reads the CLI-owned login state on the Host and never copies tokens into browser settings. Harbor freezes the current Agent model before a Job and lets the isolated Candidate call that same Host model through a Job-scoped broker, so the default GPT Auth path needs no separate DeepSeek credential. The Candidate receives a short-lived broker capability, not the reusable Codex OAuth token. DeepSeek API credentials remain available for explicitly selected DeepSeek models and are configured inside the workbench, never committed to this repository. The Codex Auth and Better Sidebar snapshots carry recorded peer-metadata compatibility patches for Harness `0.1.1-rc.1`; their executable code is unchanged from the published tarballs.

<a id="run"></a>

## Run

Install the DMG from [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases) and open XiaoHui Harness. In a source checkout that has already been built, the upstream Web UI remains available with `pnpm dsh web`.

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

Pushing an exact `xiaohui-vX.Y.Z` tag runs the macOS arm64 workflow. The workflow refuses version drift, builds the branded client, and publishes a DMG plus signed Tauri updater artifacts to [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases). The updater signature protects update authenticity, but it is not an Apple Developer signature. macOS application signing and notarization remain deferred; Gatekeeper may require the user to choose **Open Anyway** in Privacy & Security.

The original DeepSeek and Sakana work remains under its MIT license and copyright. The bundled Harbor integration and Personal Workbench plugin use the MIT license; Codex Auth and Better Sidebar retain their upstream MIT licenses under `apps/desktop-tauri/product/`. Exact npm source URLs and integrity hashes are committed beside the two community snapshots.
