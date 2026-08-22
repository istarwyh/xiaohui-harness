# XiaoHui Harness

[English](README.md) | 中文

<p align="center">
  <img src="apps/desktop-tauri/app-icon.png" width="120" height="120" alt="XiaoHui Harness" />
</p>

XiaoHui Harness 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和成熟的 [Sakana 桌面发行版](https://github.com/Sakana-yuyu/deepseek-harness-desktop)构建的 macOS AI 工作台。它把 `dsh-harbor-evolution` 插件、`evolve-agent-with-harbor` Skill 和便携式 Harbor Python 运行时封装成一个应用。

首个版本仅支持 Apple Silicon。应用把会话、Profile、工作区和 Job 保存在 `~/Library/Application Support/XiaoHui Harness`，不会读取或修改用户已有的 `~/.dsh` 主目录。

## 安装包包含什么

| 层 | 交付方式 |
|---|---|
| 桌面外壳 | Tauri 2 窗口、托盘、通知、进程监管、启动恢复与签名更新 |
| Harness | 裁剪并完成构建的 DeepSeek Harness 源码；首次启动只复用版本与 CPU 架构都兼容的 Node，准备产品自有 pnpm，再安装生产依赖 |
| 产品插件 | `dsh-harbor-evolution@0.6.0` 的固定源码快照，包含 `evolve-agent-with-harbor` Skill |
| 评测运行时 | 便携式 CPython 3.12、仓库内固定的 `harbor-dsh-evolution==0.6.0` 源码快照与 Harbor |
| 产品数据 | 独立的 `DSH_HOME` 和默认 XiaoHui 工作区 |

运行 Harbor Job 仍然需要本机安装并启动 Docker。DeepSeek API 凭据在工作台内配置，不会提交到本仓库。

<a id="run"></a>

## 运行

从 [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases) 安装 DMG 并打开 XiaoHui Harness。已经完成构建的源码 Checkout 仍可通过 `pnpm dsh web` 启动上游 Web UI。

<a id="run-from-source"></a>

## 从源码运行

前置条件：macOS arm64、Node 24、pnpm、Rust、Xcode Command Line Tools 和 `uv`。

```sh
pnpm install --frozen-lockfile
pnpm run build
cd apps/desktop-tauri
pnpm run prepare:product-runtime
pnpm run build
```

DMG 输出到 `apps/desktop-tauri/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`。

本地完成 Harbor 插件开发后，用下面的命令刷新产品内置快照：

```sh
pnpm --dir apps/desktop-tauri run sync:product-plugin -- /absolute/path/to/harbor-self-evolving/packages/dsh-plugin
```

同步命令也会刷新相邻的 `packages/harbor-plugin` Python 快照。如果希望临时测试另一个 Python Source，而不替换已提交的快照：

```sh
XIAOHUI_HARBOR_PYTHON_SOURCE=/absolute/path/to/harbor-self-evolving/packages/harbor-plugin \
  pnpm --dir apps/desktop-tauri run prepare:product-runtime
```

## 发布

推送 `xiaohui-v*` Tag 会触发 macOS arm64 流水线，并把 DMG 与签名的 Tauri 更新产物发布到 [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases)。macOS 应用签名与公证仍需 Apple Developer 凭据；未配置时，用户可能需要在 Gatekeeper 中手动批准应用。

DeepSeek 与 Sakana 的原始代码继续保留其 MIT 许可证和版权。内置 Harbor 集成的 MIT 许可证位于 `apps/desktop-tauri/product/harbor-evolution/`。
