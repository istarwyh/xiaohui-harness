# XiaoHui Harness

[English](README.md) | 中文

<p align="center">
  <img src="apps/desktop-tauri/app-icon.png" width="120" height="120" alt="XiaoHui Harness" />
</p>

XiaoHui Harness 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和成熟的 [Sakana 桌面发行版](https://github.com/Sakana-yuyu/deepseek-harness-desktop)构建的 macOS AI 工作台。它把 Harbor Evolution 及其 Skill、[dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth)、[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)、个人工作台品牌插件和便携式 Harbor Python 运行时封装成一个应用。

首个版本仅支持 Apple Silicon。应用把会话、Profile、工作区和 Job 保存在 `~/Library/Application Support/XiaoHui Harness`，不会读取或修改用户已有的 `~/.dsh` 主目录。

## 安装包包含什么

| 层 | 交付方式 |
|---|---|
| 桌面外壳 | Tauri 2 窗口、托盘、通知、进程监管、启动恢复与签名更新 |
| Harness | 裁剪并完成构建的 DeepSeek Harness 源码、冻结的产品 Lockfile、压缩的离线依赖 Store，以及经过校验和固定的 macOS arm64 Node/pnpm 工具链 |
| 产品插件 | 固定的 `dsh-harbor-evolution@0.7.1`、`dsh-codex-auth@0.3.0`、`dsh-better-sidebar@0.15.1` 和 `dsh-personal-workbench@0.1.0`；Harbor 插件包含 `evolve-agent-with-harbor` Skill |
| 评测运行时 | 便携式 CPython 3.12、仓库内固定的 `harbor-dsh-evolution==0.7.1` 源码快照与 Harbor |
| 产品数据 | 独立的 `DSH_HOME` 和默认 XiaoHui 工作区 |

首次启动不会访问 npm 或 Node 镜像：XiaoHui 会校验并展开安装包内的 Node/pnpm 与依赖 Store 归档，再执行冻结的离线安装。运行 Harbor Job 仍然需要本机安装并启动 Docker。Codex Auth 需要官方 `codex` CLI 及其本地 ChatGPT 登录态；插件只在 Host 侧读取 CLI 管理的登录状态，不会把 Token 复制进浏览器设置。Harbor 会在 Job 启动前冻结 Agent 当前选择的模型，并让隔离的 Candidate 通过 Job 级 Broker 调用同一个 Host 模型，因此默认的 GPT Auth 路径不需要额外的 DeepSeek 凭据。Candidate 只会得到短期有效的 Broker Capability，不会得到可复用的 Codex OAuth Token。显式选择 DeepSeek 模型时仍可在工作台内配置 DeepSeek API 凭据，这些凭据不会提交到本仓库。Codex Auth 与 Better Sidebar 快照都包含面向 Harness `0.1.1-rc.1` 且已记录的 Peer Metadata 兼容修正；插件执行代码与已发布 Tarball 保持一致。

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

推送格式严格为 `xiaohui-vX.Y.Z` 的 Tag 会触发 macOS arm64 流水线。流水线会拒绝版本漂移，构建带 XiaoHui 品牌的客户端，并把 DMG 与带签名的 Tauri 更新产物发布到 [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases)。更新签名用于保护更新真实性，但不等同于 Apple Developer 签名。macOS 应用签名与公证暂缓处理；用户可能需要在“隐私与安全性”中选择“仍要打开”。

DeepSeek 与 Sakana 的原始代码继续保留其 MIT 许可证和版权。内置的 Harbor 集成与 Personal Workbench 插件使用 MIT 许可证；Codex Auth 和 Better Sidebar 在 `apps/desktop-tauri/product/` 下保留各自的上游 MIT 许可证。两个社区快照旁也提交了准确的 npm 来源地址和完整性 Hash。
