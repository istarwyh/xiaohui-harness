# XiaoHui Harness

English | [中文](README.zh.md)

<p align="center">
  <img src="apps/desktop-tauri/app-icon.png" width="120" height="120" alt="XiaoHui Harness" />
</p>

XiaoHui Harness is a macOS AI workbench built from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) and the mature [Sakana desktop distribution](https://github.com/Sakana-yuyu/deepseek-harness-desktop). It packages the `dsh-harbor-evolution` plugin, its `evolve-agent-with-harbor` Skill, and a portable Harbor Python runtime as one application.

The first release targets Apple Silicon only. The application keeps its sessions, profiles, workspace, and jobs under `~/Library/Application Support/XiaoHui Harness`; it does not read or modify the user's existing `~/.dsh` home.

## What the package contains

| Layer | Delivery |
|---|---|
| Desktop shell | Tauri 2 window, tray, notifications, process supervision, startup recovery, and signed updater |
| Harness | A trimmed, built DeepSeek Harness source tree; first launch reuses only a version-and-architecture-compatible Node, provisions product-owned pnpm, then installs production dependencies |
| Product plugin | A committed snapshot of `dsh-harbor-evolution@0.6.0`, including the `evolve-agent-with-harbor` Skill |
| Evaluation runtime | Portable CPython 3.12 with the committed `harbor-dsh-evolution==0.6.0` source snapshot and Harbor |
| Product data | An isolated `DSH_HOME` and a default XiaoHui workspace |

Harbor Jobs still require Docker to be installed and running. DeepSeek API credentials are configured inside the workbench and are never committed to this repository.

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

Pushing an `xiaohui-v*` tag runs the macOS arm64 workflow and publishes a DMG plus signed Tauri updater artifacts to [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases). macOS application signing and notarization require Apple Developer credentials; without them, Gatekeeper may require the user to approve the application manually.

The original DeepSeek and Sakana work remains under its MIT license and copyright. The bundled Harbor integration retains its own MIT license inside `apps/desktop-tauri/product/harbor-evolution/`.
