# XiaoHui Harness

[English](README.md) | 中文

<p align="center">
  <img src="apps/desktop-tauri/app-icon.png" width="120" height="120" alt="XiaoHui Harness" />
</p>

XiaoHui Harness 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和成熟的 [Sakana 桌面发行版](https://github.com/Sakana-yuyu/deepseek-harness-desktop)构建的 macOS AI 工作台。它把 Harbor Evolution 及其 Skill、[dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth)、[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)、[dsh-context-doctor](https://github.com/Zhenyu98/dsh-context-doctor)、[dsh-plugin-marketplace](https://github.com/Scorp1o117/dsh-plugin-marketplace)、个人工作台品牌插件和便携式 Harbor Python 运行时封装成一个应用。

首个版本仅支持 Apple Silicon。应用把会话、Profile、工作区和 Job 保存在 `~/Library/Application Support/XiaoHui Harness`，不会读取或修改用户已有的 `~/.dsh` 主目录。

## 安装包包含什么

| 层 | 交付方式 |
|---|---|
| 桌面外壳 | Tauri 2 窗口、托盘、通知、进程监管、启动恢复与签名更新 |
| Harness | 裁剪并完成构建的 DeepSeek Harness 源码、冻结的产品 Lockfile、压缩的离线依赖 Store，以及经过校验和固定的 macOS arm64 Node/pnpm 工具链 |
| 产品插件 | Harbor Evolution、Codex Auth、Better Sidebar、Context Doctor、Plugin Marketplace 与第一方 Personal Workbench 的已提交快照；Harbor 插件包含 `evolve-agent-with-harbor` Skill |
| 评测运行时 | 便携式 CPython 3.12、已提交的 Harbor Python Adapter 快照与 Harbor |
| 产品数据 | 独立的 `DSH_HOME` 和默认 XiaoHui 工作区 |

首次启动不会访问 npm 或 Node 镜像：XiaoHui 会校验并展开安装包内的 Node/pnpm 与依赖 Store 归档，再执行冻结的离线安装。运行 Harbor Job 仍然需要本机安装并启动 Docker。Codex Auth 需要官方 `codex` CLI 及其本地 ChatGPT 登录态；插件只在 Host 侧读取 CLI 管理的登录状态，不会把 Token 复制进浏览器设置。Context Doctor 提供只读的上下文注入审计面板和 `context_audit` 工具。Plugin Marketplace 位于设置页，并把 GitHub Topic 结果视为发现信息：只有声明 `dsh.bundle.patch` 的 npm Package 能通过 Repository 字段或与 GitHub Owner 同 Scope 的 DSH 上游元数据关联该仓库时才启用一键安装，Package 对应的 pnpm 失败会持续显示，仓库与 npm 链接则通过受限桌面桥在系统浏览器中打开。安装插件后，可通过**设置 → 通用设置 → 应用生命周期 → 重启 XiaoHui**停止私有 Host 并重启应用，使新 Package 进入扫描。Harbor 会在 Job 启动前冻结 Agent 当前选择的模型，并让隔离的 Candidate 通过 Job 级 Broker 调用同一个 Host 模型，因此默认的 GPT Auth 路径不需要额外的 DeepSeek 凭据。Candidate 只会得到短期有效的 Broker Capability，不会得到可复用的 Codex OAuth Token。显式选择 DeepSeek 模型时仍可在工作台内配置 DeepSeek API 凭据，这些凭据不会提交到本仓库。Peer Metadata 覆盖必须在策略中经过评审且精确到版本；外部快照的每一项功能兼容补丁都必须写入来源记录，并由发布 Smoke 固定。

<a id="run"></a>

## 运行

从 [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases) 安装 DMG 并打开 XiaoHui Harness。**设置 → 通用设置 → 应用生命周期**提供运行带签名应用更新器的**检查并更新**操作，以及用于加载新安装插件的**重启 XiaoHui**操作。内置产品插件会随带签名的 XiaoHui Release 一起升级。已经完成构建的源码 Checkout 仍可通过 `pnpm dsh web` 启动上游 Web UI。

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

发布前，先在本地刷新并验证准备提交的产品输入：

```sh
pnpm --dir apps/desktop-tauri run prepare:release
```

该命令会查询 npm 上 Codex Auth、Better Sidebar 与 Plugin Marketplace 的最新稳定版、Harbor 最新稳定 GitHub Release 中配套的 JavaScript 插件与 Python Adapter，以及 Context Doctor 的 `main` 分支 Head；第一方 Personal Workbench 被明确排除。命令会验证下载归档与来源信息，先在临时目录暂存全部候选，再检查内置 Node 版本、DSH Peer 与 Client 要求，重新生成冻结的产品 Lockfile，拒绝第二份 DSH/Cordis Runtime，执行真实的冻结离线安装，并在临时且已清除凭据的环境中运行两个 Harbor 命令与完整 Host。Headless Chromium 必须在所有 Client 插件激活后成功加载工作台，且没有 Page Error 或 Console Error；Smoke 还会检查 Context Doctor API、六个产品 Client 响应、经过 npm 校验的 Marketplace 安装反馈，以及应用生命周期中的更新与重启控件。任一步骤失败都会还原受管理的产品快照与 Lockfile。默认要求受管理路径保持干净；只有确认需要保留本地修改时，才显式使用 `pnpm --dir apps/desktop-tauri run prepare:release -- --allow-dirty`。

打 Tag 前必须检查并提交生成的快照与 Lockfile。每个 `XIAOHUI_UPSTREAM.json` 记录外部组件的精确 Revision、归档 Hash 与 Tree Hash；生成的 `.bundle-manifest.json` 记录选定的 Package 版本与整个 Bundle 的 Hash。Tag CI 与普通桌面构建不会查询 Latest Channel，只消费已提交快照与冻结 Lockfile，因此发行构建可复现。

推送格式严格为 `xiaohui-vX.Y.Z` 的 Tag 会触发 macOS arm64 流水线。流水线会拒绝版本漂移，构建带 XiaoHui 品牌的客户端，并把 DMG 与带签名的 Tauri 更新产物发布到 [GitHub Releases](https://github.com/istarwyh/xiaohui-harness/releases)。更新签名用于保护更新真实性，但不等同于 Apple Developer 签名。macOS 应用签名与公证暂缓处理；用户可能需要在“隐私与安全性”中选择“仍要打开”。

DeepSeek 与 Sakana 的原始代码继续保留其 MIT 许可证和版权。内置的 Harbor 集成与 Personal Workbench 插件使用 MIT 许可证；Codex Auth、Better Sidebar 和 Plugin Marketplace 保留上游 MIT 许可证，Context Doctor 则在 `apps/desktop-tauri/product/` 下保留 BSD-3-Clause 许可证。每个由外部来源刷新的快照旁都提交了准确的来源地址、不可变版本和完整性 Hash。
