# Agent Note: XiaoHui 产品化 AI 工作台发行

Status: implemented

[English](2026-08-22-xiaohui-product-workbench.md) | 中文

## Problem

在通用 Harness 桌面端安装完成后再安装领域插件，仍然要求用户理解 Profile、Package Registry、Python 环境、Skill 和 Adapter 路径。Harbor 集成本身同时包含 Cordis Bundle 与 Python Runtime，只分发 npm 包会得到一个未完成配置的产品。通用桌面端复用 `~/.dsh` 可以降低迁移成本，但品牌工作台不应修改另一套 Harness 安装的 Profile 与会话。

## Decision

XiaoHui Harness 保留 Sakana Tauri 发行版的上游 Git 历史并作为产品 fork 演进。可复用的桌面进程监管、Harness 首次预配、通知 Overlay 与 Updater 留在 `apps/desktop-tauri`；产品装配也只位于这个子树，不修改 Agent Loop 或 Service Package。

提交到 `apps/desktop-tauri/product/harbor-evolution` 的快照包含 `dsh-harbor-evolution@0.7.3` 和它的 `evolve-agent-with-harbor` Skill；相邻的 `product/harbor-python` 快照包含匹配的 `harbor-dsh-evolution==0.7.3` Python Adapter 源码。`product/dsh-codex-auth` 保存经过检查的 `dsh-codex-auth@0.3.0` npm 产物，`product/dsh-better-sidebar` 保存 `dsh-better-sidebar@0.15.1`，`product/personal-workbench` 保存第一方的 `dsh-personal-workbench@0.1.0`。两个社区快照都保留上游许可证，并在 `XIAOHUI_UPSTREAM.json` 中记录准确的 Registry Tarball 和 Integrity 值。它们还记录了纯 Metadata 修正，把 DSH Peer 固定到 XiaoHui 内置的 `0.1.1-rc.1` Runtime，并同时记录修正前后的目录 Hash；插件可执行代码与发布产物逐字节一致。

`bundle-harness-source.mjs` 把四个 Cordis Package 复制到裁剪后的 workspace，并加入内置 CLI 的依赖闭包。桌面 Overlay 会选择 Codex Search Provider，在已有 Harbor Bundle 配置项存在时直接配置它，并为 Codex Auth、Search、Image、Better Sidebar、Personal Workbench 与 Harbor Evolution 插入名称唯一的 Fallback 配置项。只要另一个已启用配置项挂载了相同 Package Entry，对应 Fallback 就会停用，因此安装在 XiaoHui 隔离 Profile 中的标准 Profile Bundle 不会与产品 Overlay 冲突。升级时，原生 Profile Repair 只会重绑仍指向旧内容寻址 Harness Tree 的 XiaoHui 托管 `link:` 依赖，再执行标准 Profile 安装，让 Lockfile 和 Symlink 跟随当前 Tree；Registry 包以及应用 `harness-versions` 目录以外的本地链接保持不变。首次启动解析的是已提交的插件代码，而不是安装持续变化的 `latest` Package。提交的产品 Lockfile 固定其余生产依赖图；发布构建把依赖抓取进绑定校验和的压缩 Store，产品自有 pnpm 再以冻结、离线语义重建 `node_modules`。

`prepare-xiaohui-runtime.mjs` 构建包含便携式 CPython 3.12、已提交的 `harbor-dsh-evolution==0.7.3` 源码与 Harbor 的 macOS arm64 资源。生成的虚拟环境只使用相对解释器链接，直接从应用资源运行，并以源码树 Digest 作为失效条件。脚本接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 作为临时覆盖。`sync-product-plugin.mjs` 通过显式白名单从解压后的 Harbor Release 或源码 Checkout 同步两份产品快照，其中包括 Harbor 导出的结果 Schema。

原生 Host 始终使用平台应用数据目录下的 `XiaoHui Harness/dsh-home`，并创建 `XiaoHui Harness/workspace/jobs`；它不会接管或导入 `DSH_HOME` 与 `~/.dsh`。对 XiaoHui 的原生启动而言，这个产品覆盖取代了[桌面端主机工具链扫描与主目录匹配](2026-08-14-desktop-host-env-and-home-adoption.zh.md)中的主目录接管，同时保留原生架构的宿主 Node 发现，并以产品自有 pnpm 取代全局 pnpm 复用。产品 Overlay 在[桌面外壳 Overlay 插件](../architecture/2026-08-14-desktop-shell-overlay-plugins.zh.md)之上加入必需的产品节点；缺失 Harbor Runtime 会导致启动失败，通知投递仍然是可降级能力。Codex Auth 只在 Host 侧读取官方 Codex CLI 的登录状态，不会把 Token 移入浏览器设置。[Job 级 Host 模型桥接](../architecture/2026-08-23-harbor-host-model-bridge.zh.md)会为 Harbor Candidate 冻结当前 Agent 模型，并且只向任务环境传入短期能力，因此 GPT Auth 仍是默认 Candidate 模型路径，同时无需导出它的 OAuth 凭据。Better Sidebar 经过检查的 `node-pty` 构建由现有 workspace 的 `allowBuilds` 策略覆盖。

原生 Provisioner 只会复用版本与 `process.platform:process.arch` 都匹配目标平台的 Node。它不会接管全局 pnpm，而是准备产品固定版本，避免由另一种 Node 架构安装的 Wrapper 或 Native Package 进入首次启动依赖图。macOS arm64 Node 与 pnpm 归档在源码中通过 Digest 固定。生成的 Bundle Manifest 记录 Store 归档 Digest；展开前必须验证，安装成功后则从可写 Harness 树中删除归档与展开后的 Store。约 35,000 个 Store 文件会压缩为单个资源，避免 Tauri 打包一棵看似可变的大目录或跟随平台专用链接。

私有 `dsh`、Node 与 pnpm Shim 只会前置到 Host 进程树。产品默认不持久化全局 `dsh` 命令，也不编辑 Shell Profile；`XIAOHUI_PERSIST_DSH_CLI=1` 是仅供开发者显式开启的选项。

桌面 Overlay 还通过 `webserver/index-inject` 提供工作台 Content Security Policy 与 `no-referrer` 策略；Tauri 自有启动页和 Shell 使用单独的 CSP。Cordis 客户端执行需要 `unsafe-eval`，但 Object 嵌入和 Base URL 修改均被禁用。

发布目标仅为 `aarch64-apple-darwin`。`xiaohui-v*` Tag 只构建并签名一次 App/Updater，再基于该 App 封装 DMG，验证解压后的 Updater Runtime，并从 macOS 构建 Job 直接发布 arm64 资产集合。这个产品发行集合取代了[跨平台桌面源码预配](2026-08-14-cross-platform-desktop-source-provisioning.zh.md)中的平台矩阵；底层预配代码仍可供未来平台复用。Apple 代码签名与公证凭据和 XiaoHui 专用的 Tauri Updater 签名是两套独立凭据。

## Alternatives considered

**只分发插件。** 不采用，因为用户仍需安装并协调 npm Bundle、Skill、Python Adapter、解释器和路径，而本发行版正是为了消除这些产品负担。

**重新开发桌面外壳。** 不采用，因为 Sakana 外壳已经负责首次预配、进程树回收、启动恢复、托盘、通知和签名更新。重新实现会产生第二套生命周期系统，却不会增加产品价值。

**首次启动时下载组件或生产依赖。** 不采用，因为用户已经下载应用后，产品能力仍会依赖 npm、PyPI、Node 镜像、`uv` 和解释器安装。XiaoHui 把领域能力和其余生产依赖图都作为安装包内的固定资源交付。

**接管用户已有的 Harness 主目录。** 不采用，因为产品应用不应静默向另一套独立管理的 Harness 环境加入 Bundle 或配置。只有建立显式迁移流程后，用户数据才会被导入。

**保留上游完整平台矩阵。** 首个产品版本不采用，因为 Harbor Runtime 资源与平台相关，而且当前交付目标明确为 macOS arm64。新增平台必须提供对应的便携运行时和验收路径。

## Consequences

安装一个 DMG 就能得到命名明确的 AI 工作台，Harbor 插件、Skill 与 Python 命令统一固定在 `0.7.3`，Codex Auth `0.3.0`、Better Sidebar `0.15.1` 和 Personal Workbench `0.1.0` 也已经挂载。开发者通过显式命令刷新产品快照，并能从已提交的插件代码、冻结 Lockfile 与经过 Digest 验证的构建输入复现发行包。macOS arm64 发布门禁会校验桌面版本真源，构建 Harness、App、DMG 和更新归档，检查 DSH 参数解析器以及原生、WSL Host 启动向量，把便携式 Runtime 移出构建路径，并在计算校验和与发布前运行两个 Harbor 入口。代价是安装包因携带 CPython、Harbor、Codex Auth、Better Sidebar 和压缩的 Node 依赖图而变大；Harbor Job 仍依赖 Docker，Codex Auth 仍是非官方的本机单用户集成，模型桥接依赖 Docker 到 Host 的实时可达性；在配置 Apple 发布凭据前，临时签名且未公证的 DMG 需要用户手动通过 Gatekeeper。
