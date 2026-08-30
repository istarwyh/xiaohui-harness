# XiaoHui Harness Desktop

[English](README.md) | 中文

这个 Tauri 应用承载现有的 `dsh web` 客户端，并加入 XiaoHui 产品装配层。安装包携带裁剪后的 Harness 源码、Harbor Evolution 及其 Skill、Codex Auth、Better Sidebar、Context Doctor、Personal Workbench 品牌插件、便携式 CPython 3.12 和 Harbor Adapter。

## 运行时布局

| 资源 | 运行时行为 |
|---|---|
| `harness-source` | 携带已构建源码、冻结 Lockfile 与单个压缩的离线 pnpm Store，并复制到按内容 Hash 隔离的应用数据目录 |
| `toolchain` | 校验和固定的 macOS arm64 Node 22.19.0 与 pnpm 11.7.0 归档；宿主没有兼容 Node 时使用 |
| `xiaohui-runtime` | 直接从签名的应用资源运行，提供 `harbor` 和 `harbor-dsh` |
| `desktop-overlay` | 通过 `dsh web --patch` 注册通知、Codex Auth/Search/Image、Better Sidebar、Context Doctor、Personal Workbench 与 Harbor Evolution |
| `XiaoHui Harness/dsh-home` | 隔离保存会话、设置、凭据和 Web Profile |
| `XiaoHui Harness/workspace` | 没有标准 Profile 实例时供 Harbor Workbench 使用的回退根目录 |

产品源码位于 `product/harbor-evolution`、`product/harbor-python`、`product/dsh-codex-auth`、`product/dsh-better-sidebar`、`product/context-doctor` 和 `product/personal-workbench`。`scripts/bundle-harness-source.mjs` 把五个 Cordis Package 与 Harbor Skill 放进裁剪后的 workspace，并加入 CLI 依赖闭包，因此 Host 无需从 Registry 安装插件代码即可解析。Codex Auth 与 Better Sidebar 固定到经过检查的 npm Tarball。Harbor 的 JavaScript 与 Python 快照来自同一个经过检查的 GitHub Release；Context Doctor 没有 npm Release，因此固定到经过检查的 GitHub `main` Commit。每个由外部来源刷新的快照都在 `XIAOHUI_UPSTREAM.json` 中记录不可变来源、完整性 Hash、已提交 Tree Hash、上游许可证，以及经过评审且精确到版本的 Peer Metadata 覆盖。`scripts/prepare-xiaohui-runtime.mjs` 把已提交的 Python 快照安装进可迁移资源，也接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 用于临时测试本地 Adapter。

所有面向 Agent 的 Harbor Tool 都以调用方 Session 的绝对工作目录作为根目录。因此用户在 XiaoHui Session 中选择 `/Users/me/project` 后，初始化和后续由 Agent 创建的 Harbor 产物都会留在该项目内。桌面 Overlay 配置的应用数据 `projectRoot` 只作为全局 Web Workbench／非 Agent 场景的回退；Agent Tool 既不会使用它，也不会因为它与 Session 目录不同而拒绝执行。

Harbor 会在 Job 启动前通过 Host 的 `agentDefaultModel` 与 LLM Service 解析并冻结 Candidate 模型。仅绑定 Loopback 的 Host Broker 随后通过随机的 Job 级 URL 与 Bearer Capability，把这条准确的模型路由开放给 Docker 任务。Python Adapter 会先从容器内执行健康检查，再安装和启动 Candidate；它在 `.harbor-runtime` 下生成临时 Cordis Overlay，只把 Candidate ACP 的模型路由替换为 `xiaohui-host/<frozen-model>`。原始 Candidate 保持不可变，Codex OAuth 凭据不会进入 Candidate 文件、配置或容器环境。模型绑定属于 Evaluation Context v2，因此更换 Provider、Model、Reasoning Effort、Transport 或 Protocol 后不能复用旧的比较 Baseline。

复用宿主 Node 时会同时检查受支持版本与原生 CPU 架构。XiaoHui 不接管全局 pnpm，而是准备固定版本的产品自有 pnpm，避免 Wrapper 或 Native Package 由另一种 Node 架构安装。冷启动会先校验每个归档的摘要，展开依赖 Store，再通过 `pnpm install --prod --frozen-lockfile --offline` 重建 `node_modules`；成功后删除临时展开的 Store 与复制出的归档。发布时把约 35,000 个 Store 小文件压缩成一个应用资源，既减小安装体积，也避免 Tauri 打包时受到平台链接影响。macOS 构建把 App/Updater、DMG、App/Updater 分成三个阶段，避免 Finder 的 DMG 美化失败连带丢失已签名的更新产物。

应用只在 Host 进程树内前置其私有的 `dsh`、Node 与 pnpm Shim。它不会覆盖用户的全局 `dsh` 命令或 Shell Profile；只有开发者显式设置 `XIAOHUI_PERSIST_DSH_CLI=1` 启动时才会持久化。产品插件 Overlay 会按包名复用已经激活的标准 Profile Bundle，只有不存在先前挂载时才启用名称唯一的内置 Fallback，因此用户安装过的 Harbor、Codex Auth、Better Sidebar、Context Doctor 或 Personal Workbench Bundle 不会产生重复 Loader ID。升级时，原生启动链路还会只重绑仍指向本应用旧内容寻址 Harness Tree 的 XiaoHui 托管 `link:` 依赖，并执行标准 Profile 安装；Registry 依赖以及 XiaoHui 应用数据目录之外的链接仍归用户所有，且不会被修改。

桌面壳会通过 `dsh web --no-open` 启动私有 Host。Loopback URL 仍然是 Tauri WebView 加载的内部传输地址，但启动过程不会再把这个 URL 交给操作系统默认浏览器。

Release 构建读取 Tauri 内置的应用语义版本，并在主窗口打开后一次只执行一项带签名的更新检查。稳定的 `xiaohui-updater` manifest 必须声明更高版本，XiaoHui 才会下载内容；检查期限为 15 秒，失败时不改变正在运行的工作台。托盘会显示当前版本，并提供手动检查入口。工作台中的**设置 → 通用设置 → 应用更新 → 检查并更新**会触发同一条带签名的流程。Loopback Client 只能发送固定的版本化请求，Tauri Shell 只接受来自当前工作台 iframe 且 Origin 与 Host 完全一致的请求。存在更新时，XiaoHui 会展示当前版本和目标版本，交由 Tauri 验证并安装签名产物，再停止私有 Host 并重启应用。这个用户操作不会执行本地发布准备或下载插件源码；内置产品插件只会随带签名的 XiaoHui Release 一起升级。

桌面 Overlay 会给工作台页面注入 Content Security Policy 与 `no-referrer` 策略；Tauri 自有的启动页与 Shell 也配置了 CSP。Cordis 客户端插件需要动态求值，因此工作台保留 `unsafe-eval`，同时禁用 Object 与 Base URL 修改。

## 本地发布准备

检查并提交发行输入前，显式执行需要联网的产品刷新：

```sh
pnpm --dir apps/desktop-tauri run prepare:release
```

刷新策略会查询 npm 上 Codex Auth 与 Better Sidebar 的最新稳定版、Harbor 最新稳定 GitHub Release 中配套的 Cordis 插件与 Python Adapter，以及 Context Doctor 的 `main` 分支 Head。Personal Workbench 是第一方插件，不参与刷新。GitHub API 读取会优先使用 `GITHUB_TOKEN` 或 `GH_TOKEN`，其次复用已有的 `gh auth` 登录；凭据不会写入来源记录。命令不会向后搜索较旧的兼容 Release；如果 Latest 候选不兼容，流程会失败，以便评审并调整策略或代码。只有 `product/plugin-update-policy.json` 明确列出上游精确版本时，流程才接受 Peer Metadata 覆盖。

任何受管理路径被复制或删除前，流程都会先验证策略：Destination 必须位于 `product/` 内，Source Path 必须位于下载的 Checkout 内，受管理路径必须唯一且互不重叠。所有归档都必须使用 HTTPS，并通过压缩与展开字节上限、Entry 数量上限和安全解压；npm 产物必须匹配 Registry SRI，每个归档都会记录绑定 Digest 的来源信息。整组候选会留在临时目录中，直到全部通过 Package Identity、受管理 Node 版本、DSH Peer、Bundle Patch、Host Entry、Client Entry 与 Injection、许可证和 Tree 检查。然后命令才会以一次操作替换受管理快照、使用与 Tag CI 相同的显式 Client 环境重新构建 Harness、重新生成 `product/harness-pnpm-lock.yaml`，并证明 Lockfile 与已安装 Tree 中每个产品 DSH/Cordis Peer 都指向内置 workspace，而不是第二份 Runtime。随后流程会准备绑定 Digest 的离线 Store，并执行真实的 `--prod --frozen-lockfile --offline` 安装。Harbor 命令与完整 Host 会在已清除凭据的环境以及临时 Home、DSH 与临时目录中运行。Headless Chromium 必须收到五个产品 Client Bundle，让每个 Client Loader Entry 在没有 Page Error 或 Console Error 的情况下激活并挂载工作台，并显示应用更新控件；同一 Smoke 还会请求 Context Doctor API，并要求 Host 正常关闭。后续任何步骤失败都会还原所有受管理快照与产品 Lockfile。

默认要求受管理的产品路径保持干净。只有开发者已经检查准备由事务保留或替换的本地修改时，才显式使用 `pnpm --dir apps/desktop-tauri run prepare:release -- --allow-dirty`。成功后，刷新的快照与 Lockfile 会留给人工检查并提交；每个 `XIAOHUI_UPSTREAM.json` 记录外部组件的精确 Revision、归档 Hash 与 Tree Hash，生成的 `.bundle-manifest.json` 则记录选定的 Package 版本与整个 Bundle 的 Hash。

Tag CI、普通 `prepare:dist` 与 `build` 命令都不会刷新上游 Channel。它们只消费已提交的产品快照与冻结 Lockfile，因此同一 Tag 的重新构建不会受 npm 或 GitHub 后续变化影响。

## 命令

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm --dir apps/desktop-tauri run test:bundle
pnpm --dir apps/desktop-tauri run test:offline
pnpm --dir apps/desktop-tauri run test:overlay
pnpm --dir apps/desktop-tauri run test:update-manifest
pnpm --dir apps/desktop-tauri run test:release-version
pnpm --dir apps/desktop-tauri run prepare:release
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

当前目标固定为 `aarch64-apple-darwin`；发布流水线有意不包含 Windows、Intel macOS 或 Linux 矩阵。

macOS arm64 发布门禁会校验 Tag 与所有桌面版本真源的一致性，在不查询插件更新 Channel 的前提下构建已提交的 Harness 和带签名的更新产物，并通过 DSH 参数解析器以及原生、WSL 桌面启动器执行聚焦的 Host 启动参数契约测试。随后，流水线会把便携式 Runtime 移出应用 Bundle，故意破坏原始 Python Home 引用，并要求 `harbor --version` 与 `harbor-dsh --help` 都成功，之后才计算校验和并发布产物。该门禁有意保持小于仓库完整测试矩阵，避免桌面 Patch Release 等待无关平台或 Package。
