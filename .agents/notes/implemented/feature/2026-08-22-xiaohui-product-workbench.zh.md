# Agent Note: XiaoHui 产品化 AI 工作台发行

Status: implemented

[English](2026-08-22-xiaohui-product-workbench.md) | 中文

## Problem

在通用 Harness 桌面端安装完成后再安装领域插件，仍然要求用户理解 Profile、Package Registry、Python 环境、Skill 和 Adapter 路径。Harbor 集成本身同时包含 Cordis Bundle 与 Python Runtime，只分发 npm 包会得到一个未完成配置的产品。通用桌面端复用 `~/.dsh` 可以降低迁移成本，但品牌工作台不应修改另一套 Harness 安装的 Profile 与会话。

## Decision

XiaoHui Harness 保留 Sakana Tauri 发行版的上游 Git 历史并作为产品 fork 演进。可复用的桌面进程监管、Harness 首次预配、通知 Overlay 与 Updater 留在 `apps/desktop-tauri`；产品装配也只位于这个子树，不修改 Agent Loop 或 Service Package。

提交到 `apps/desktop-tauri/product/harbor-evolution` 的快照包含 `dsh-harbor-evolution@0.6.0` 和它的 `evolve-agent-with-harbor` Skill；相邻的 `product/harbor-python` 快照包含匹配的 Python Adapter 源码。`bundle-harness-source.mjs` 把 Cordis 快照复制到裁剪后的 workspace，并加入内置 CLI 的依赖闭包。桌面 Overlay 在 Web Profile 之后插入 `harbor-evolution` Cordis 节点，因此首次启动不需要下载或手动安装产品插件。

`prepare-xiaohui-runtime.mjs` 构建包含便携式 CPython 3.12、已提交的 `harbor-dsh-evolution==0.6.0` 源码与 Harbor 的 macOS arm64 资源。生成的虚拟环境只使用相对解释器链接，直接从应用资源运行，并以源码树 Digest 作为失效条件。脚本接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 作为临时覆盖。`sync-product-plugin.mjs` 通过显式白名单从本地 Harbor Checkout 同步两份产品快照。

原生 Host 始终使用平台应用数据目录下的 `XiaoHui Harness/dsh-home`，并创建 `XiaoHui Harness/workspace/jobs`；它不会接管或导入 `DSH_HOME` 与 `~/.dsh`。对 XiaoHui 的原生启动而言，这个产品覆盖取代了[桌面端主机工具链扫描与主目录匹配](2026-08-14-desktop-host-env-and-home-adoption.zh.md)中的主目录接管，同时保留原生架构的宿主 Node 发现，并以产品自有 pnpm 取代全局 pnpm 复用。产品 Overlay 在[桌面外壳 Overlay 插件](../architecture/2026-08-14-desktop-shell-overlay-plugins.zh.md)之上加入必需的 Harbor 节点；缺失产品 Runtime 会导致启动失败，通知投递仍然是可降级能力。

原生 Provisioner 只会复用版本与 `process.platform:process.arch` 都匹配目标平台的 Node。它不会接管全局 pnpm，而是准备产品固定版本，避免由另一种 Node 架构安装的 Wrapper 或 Native Package 进入首次启动依赖图。

发布目标仅为 `aarch64-apple-darwin`。`xiaohui-v*` Tag 先构建并签名 App/Updater，再独立封装 DMG，最后恢复并重新签名 App/Updater，然后发布 arm64 资产集合。这个产品发行集合取代了[跨平台桌面源码预配](2026-08-14-cross-platform-desktop-source-provisioning.zh.md)中的平台矩阵；底层预配代码仍可供未来平台复用。Apple 代码签名与公证凭据和 XiaoHui 专用的 Tauri Updater 签名是两套独立凭据。

## Alternatives considered

**只分发插件。** 不采用，因为用户仍需安装并协调 npm Bundle、Skill、Python Adapter、解释器和路径，而本发行版正是为了消除这些产品负担。

**重新开发桌面外壳。** 不采用，因为 Sakana 外壳已经负责首次预配、进程树回收、启动恢复、托盘、通知和签名更新。重新实现会产生第二套生命周期系统，却不会增加产品价值。

**首次启动时下载 Harbor 组件。** 不采用，因为用户已经下载应用后，产品能力仍会依赖 npm、PyPI、`uv` 和解释器安装。Harness 的生产依赖仍可能需要首次联网，但 XiaoHui 的领域能力是安装包内固定的资源。

**接管用户已有的 Harness 主目录。** 不采用，因为产品应用不应静默向另一套独立管理的 Harness 环境加入 Bundle 或配置。只有建立显式迁移流程后，用户数据才会被导入。

**保留上游完整平台矩阵。** 首个产品版本不采用，因为 Harbor Runtime 资源与平台相关，而且当前交付目标明确为 macOS arm64。新增平台必须提供对应的便携运行时和验收路径。

## Consequences

安装一个 DMG 就能得到命名明确的 AI 工作台，Harbor 插件、Skill 与 Python 命令统一固定在 `0.6.0`。开发者通过显式命令刷新两份产品快照，并能从已提交的插件代码和 Registry 解析的 Python 依赖复现发行包。macOS arm64 验收已经验证受控 Node 22.19.0、受控 pnpm 11.7.0、HTTP 200 启动、Web Boot Manifest 中的 Harbor 客户端模块、Harbor 0.21.0 和 Python 插件发现。代价是安装包因携带 CPython 与 Harbor 而变大，首次启动仍会安装 Harness 的 Node 依赖，Harbor Job 仍依赖 Docker；在配置 Apple 发布凭据前，未签名或未公证的 DMG 需要用户手动通过 Gatekeeper。
