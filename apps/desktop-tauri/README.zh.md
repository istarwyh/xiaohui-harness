# XiaoHui Harness Desktop

[English](README.md) | 中文

这个 Tauri 应用承载现有的 `dsh web` 客户端，并加入 XiaoHui 产品装配层。安装包携带裁剪后的 Harness 源码、Harbor Evolution 及其 Skill、Codex Auth、Better Sidebar、Context Doctor、Plugin Marketplace、Personal Workbench 品牌插件、便携式 CPython 3.12 和 Harbor Adapter。

## 运行时布局

| 资源 | 运行时行为 |
|---|---|
| `harness-source` | 携带已构建源码、冻结 Lockfile 与单个压缩的离线 pnpm Store，并复制到按内容 Hash 隔离的应用数据目录 |
| `toolchain` | 校验和固定的 macOS arm64 Node 22.19.0 与 pnpm 11.7.0 归档；宿主没有兼容 Node 时使用 |
| `xiaohui-runtime` | 直接从签名的应用资源运行，提供 `harbor` 和 `harbor-dsh` |
| `desktop-overlay` | 通过 `dsh web --patch` 注册通知、Codex Auth/Search/Image、Better Sidebar、Context Doctor、Plugin Marketplace、Personal Workbench 与 Harbor Evolution |
| `XiaoHui Harness/dsh-home` | 隔离保存会话、设置、凭据和 Web Profile |
| `XiaoHui Harness/workspace` | 没有标准 Profile 实例时供 Harbor Workbench 使用的回退根目录 |

产品源码位于 `product/harbor-evolution`、`product/harbor-python`、`product/dsh-codex-auth`、`product/dsh-better-sidebar`、`product/context-doctor`、`product/plugin-marketplace` 和 `product/personal-workbench`。`scripts/bundle-harness-source.mjs` 把六个 Cordis Package 与 Harbor Skill 放进裁剪后的 workspace，并加入 CLI 依赖闭包，因此 Host 无需从 Registry 安装插件代码即可解析。Codex Auth、Better Sidebar 与 Plugin Marketplace 固定到经过检查的 npm Tarball。Harbor 的 JavaScript 与 Python 快照来自同一个经过检查的 GitHub Release；Context Doctor 没有 npm Release，因此固定到经过检查的 GitHub `main` Commit。每个由外部来源刷新的快照都在 `XIAOHUI_UPSTREAM.json` 中记录不可变来源、完整性 Hash、已提交 Tree Hash、上游许可证、精确版本的 Peer Metadata 覆盖以及经过评审的功能兼容补丁。`scripts/prepare-xiaohui-runtime.mjs` 把已提交的 Python 快照安装进可迁移资源，也接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 用于临时测试本地 Adapter。

所有面向 Agent 的 Harbor Tool 都以调用方 Session 的绝对工作目录作为根目录。因此用户在 XiaoHui Session 中选择 `/Users/me/project` 后，初始化和后续由 Agent 创建的 Harbor 产物都会留在该项目内。桌面 Overlay 配置的应用数据 `projectRoot` 只作为全局 Web Workbench／非 Agent 场景的回退；Agent Tool 既不会使用它，也不会因为它与 Session 目录不同而拒绝执行。

Harbor 会在 Job 启动前通过 Host 的 `agentDefaultModel` 与 LLM Service 解析并冻结 Candidate 模型。仅绑定 Loopback 的 Host Broker 随后通过随机的 Job 级 URL 与 Bearer Capability，把这条准确的模型路由开放给 Docker 任务。Python Adapter 会先从容器内执行健康检查，再安装和启动 Candidate；它在 `.harbor-runtime` 下生成临时 Cordis Overlay，只把 Candidate ACP 的模型路由替换为 `xiaohui-host/<frozen-model>`。原始 Candidate 保持不可变，Codex OAuth 凭据不会进入 Candidate 文件、配置或容器环境。模型绑定属于 Evaluation Context v2，因此更换 Provider、Model、Reasoning Effort、Transport 或 Protocol 后不能复用旧的比较 Baseline。

复用宿主 Node 时会同时检查受支持版本与原生 CPU 架构。XiaoHui 不接管全局 pnpm，而是准备固定版本的产品自有 pnpm，避免 Wrapper 或 Native Package 由另一种 Node 架构安装。冷启动会先校验每个归档的摘要，展开依赖 Store，再通过 `pnpm install --prod --frozen-lockfile --offline` 重建 `node_modules`；成功后删除临时展开的 Store 与复制出的归档。发布时把约 35,000 个 Store 小文件压缩成一个应用资源，既减小安装体积，也避免 Tauri 打包时受到平台链接影响。macOS 构建把 App/Updater、DMG、App/Updater 分成三个阶段，避免 Finder 的 DMG 美化失败连带丢失已签名的更新产物。

应用只在 Host 进程树内前置其私有的 `dsh`、Node 与 pnpm Shim。它不会覆盖用户的全局 `dsh` 命令或 Shell Profile；只有开发者显式设置 `XIAOHUI_PERSIST_DSH_CLI=1` 启动时才会持久化。产品插件 Overlay 会按包名复用已经激活的标准 Profile Bundle，只有不存在先前挂载时才启用名称唯一的内置 Fallback，因此用户安装过的 Harbor、Codex Auth、Better Sidebar、Context Doctor、Plugin Marketplace 或 Personal Workbench Bundle 不会产生重复 Loader ID。升级时，原生启动链路还会只重绑仍指向本应用旧内容寻址 Harness Tree 的 XiaoHui 托管 `link:` 依赖，并执行标准 Profile 安装；Registry 依赖以及 XiaoHui 应用数据目录之外的链接仍归用户所有，且不会被修改。

Plugin Marketplace 只把公开 GitHub `dsh-plugin` Topic 用于发现仓库。打开结果时会搜索 npm；仅当 Package 声明 `dsh.bundle.patch`，且 Metadata 通过 Repository 字段或与 GitHub Owner 同 Scope 的 DSH 上游元数据关联该仓库时才启用一键确认，因此能从同时发布 SDK、CLI 与其他 npm Package 的仓库中选出 DSH Bundle，也能解析 npm 名称不同于仓库 Basename 的 Scoped Package。Metadata 缺失、歧义或不完整时，一键确认保持禁用。用户确认后，安装流程会针对隔离的 Web Profile 执行 `dsh plugin add`，把进度或可操作的 pnpm 失败持续关联到该 Package，并授予安装代码与手动安装 DSH 插件相同的 Host 权限。仓库与 npm 链接使用固定的 iframe 消息协议；Shell 与 Rust Validator 只允许 HTTPS GitHub 仓库、npm 搜索或 npm Package 页面，再由系统浏览器打开。

桌面壳会通过 `dsh web --no-open` 启动私有 Host。Loopback URL 仍然是 Tauri WebView 加载的内部传输地址，但启动过程不会再把这个 URL 交给操作系统默认浏览器。

助手 Markdown 继续使用共享 Renderer 的 HTTP(S) 白名单。在桌面产品中，Personal Workbench Client 只拦截其中指向外部的 `_blank` Anchor，并请求父级 Shell 使用操作系统默认浏览器打开。悬停会显示目标地址，链接右键菜单可以打开或复制地址。Shell 只接受当前 Host iframe 从其精确 Origin 发出的固定版本请求；Shell 与 Rust Command 都要求有长度上限、不含凭据的 HTTP(S) URL。相对链接、同源路由、下载、文件引用以及 `javascript:`、`file:`、`data:` 等协议不会进入原生 Opener。

Release 构建读取 Tauri 内置的应用语义版本，并在主窗口打开后一次只执行一项带签名的更新检查。稳定的 `xiaohui-updater` manifest 必须声明更高版本，XiaoHui 才会下载内容；检查期限为 15 秒，失败时不改变正在运行的工作台。托盘会显示当前版本，并提供手动检查入口。工作台中的**设置 → 通用设置 → 应用生命周期**提供触发同一条带签名流程的**检查并更新**操作，以及用于加载新安装插件的**重启 XiaoHui**操作。Loopback Client 只能发送固定且带版本的 `check-update` 与 `restart` 请求；Tauri Shell 只接受来自当前工作台 iframe 且 Origin 与 Host 完全一致的请求，并把请求映射为字面量允许命令。存在更新时，XiaoHui 会展示当前版本和目标版本，再交由 Tauri 验证并安装签名产物。手动重启和成功更新都会先停止私有 Host，再重新启动应用。这些用户操作不会执行本地发布准备或下载插件源码；内置产品插件只会随带签名的 XiaoHui Release 一起升级。

**设置 → 通用设置 → 网络代理**提供应用全局策略，而不是 Codex 专用的 Transport 开关。直连模式会移除环境中原有的代理变量；跟随系统模式通过 `/usr/sbin/scutil` 读取 macOS 固定的 HTTP 与 HTTPS Endpoint；自定义模式要求分别填写不含凭据的 HTTP 与 HTTPS URL，并可补充绕过主机。PAC、自动代理发现与只有 HTTP 的 macOS 配置会返回可操作的错误，因为它们无法被完整 Node 进程树准确复现。原生 reqwest Client 会让 rustls 使用 macOS 平台验证器，所有应用自有 Node 进程都会收到 `--use-system-ca`；因此企业 HTTPS 拦截只有在 Keychain 已信任其根证书时才能成功，而且不会关闭证书校验。测试会分别检查桌面草稿链路与正在运行的 Node Host 全局 `fetch`，并独立标注两侧的 HTTP 状态或有界的证书与 Transport 错误码，避免一条链路成功掩盖另一条链路失败；草稿与 Host 当前策略不同时，结果会要求保存、重启并再次测试。保存操作只会调用固定的网络设置 Command，再调用固定的应用重启 Command；重启后，私有 Host、插件、Package 安装、Runtime 预配与签名更新器都会使用同一份解析结果。Loopback 地址始终绕过代理，已经运行的进程则保留上次激活的策略，直到应用重启。

桌面 Overlay 会给工作台页面注入 Content Security Policy 与 `no-referrer` 策略；Tauri 自有的启动页与 Shell 也配置了 CSP。Cordis 客户端插件需要动态求值，因此工作台保留 `unsafe-eval`，同时禁用 Object 与 Base URL 修改。

## 本地发布准备

检查并提交发行输入前，显式执行需要联网的产品刷新：

```sh
pnpm --dir apps/desktop-tauri run prepare:release
```

DSH 策略选择最高的官方正式 Release；仅在没有正式 Release 时回退到最高 RC，并排除 Alpha、Beta、其他预发布版本和 `master`。选中的 Tag 更新时，发布准备要求 Worktree 干净，抓取并验证该 Tag 的精确 Commit，留下未提交的上游 Merge 供评审，把来源写入 `product/DSH_UPSTREAM.json`，并在兼容性检查前重新绑定经过批准的产品 Peer Metadata。其余刷新策略会查询 npm 上 Codex Auth、Better Sidebar 与 Plugin Marketplace 的最新稳定版、Harbor 最新稳定 GitHub Release 中配套的 Cordis 插件与 Python Adapter，以及 Context Doctor 的 `main` 分支 Head。Personal Workbench 是第一方插件，只同步选中的 DSH Peer 版本。GitHub API 读取会优先使用 `GITHUB_TOKEN` 或 `GH_TOKEN`，其次复用已有的 `gh auth` 登录；凭据不会写入来源记录。命令不会向后搜索较旧的兼容 Release；如果选中的候选不兼容，流程会失败，以便评审并调整策略或代码。只有 `product/plugin-update-policy.json` 明确列出上游精确版本时，流程才接受 Peer Metadata 覆盖；功能兼容补丁必须明确写入来源记录，并持续通过完整发布 Smoke。

任何受管理路径被复制或删除前，流程都会先验证策略：Destination 必须位于 `product/` 内，Source Path 必须位于下载的 Checkout 内，受管理路径必须唯一且互不重叠。所有归档都必须使用 HTTPS，并通过压缩与展开字节上限、Entry 数量上限和安全解压；npm 产物必须匹配 Registry SRI，每个归档都会记录绑定 Digest 的来源信息。整组候选会留在临时目录中，直到全部通过 Package Identity、受管理 Node 版本、DSH Peer、Bundle Patch、Host Entry、Client Entry 与 Injection、许可证和 Tree 检查。然后命令才会以一次操作替换受管理快照、使用与 Tag CI 相同的显式 Client 环境重新构建 Harness、重新生成 `product/harness-pnpm-lock.yaml`，并证明 Lockfile 与已安装 Tree 中每个产品 DSH/Cordis Peer 都指向内置 workspace，而不是第二份 Runtime。随后流程会准备绑定 Digest 的离线 Store，并执行真实的 `--prod --frozen-lockfile --offline` 安装。由于产品已经独立固定 pnpm 归档并校验 Store 与 Bundle Digest，发布验收和原生首次启动会禁止 pnpm 自动切换版本，并信任已提交的 Lockfile。Harbor 命令与完整 Host 会在已清除凭据的环境以及临时 Home、DSH 与临时目录中运行。Headless Chromium 必须收到六个产品 Client Bundle，让每个 Client Loader Entry 在没有 Page Error 或 Console Error 的情况下激活并挂载工作台，显示 Plugin Marketplace 导航项，通过悬停、右键复制与系统浏览器命令验收安全助手链接的 DOM 约定，执行网络代理草稿测试与保存重启控件，显示应用生命周期中的更新与重启控件，在仓库只有非 DSH npm Package 时拒绝启用一键安装，在忽略同仓库 SDK Package 的同时选出名称不同的 Scoped DSH Bundle，只调用受限的通用与 Marketplace 外链、网络设置、签名更新与应用重启命令、启用安装确认，并渲染与 Package 关联的持久化失败；同一 Smoke 还会请求 Context Doctor API，并要求 Host 正常关闭。后续任何步骤失败都会还原所有受管理快照与产品 Lockfile。

默认要求受管理的产品路径保持干净。只有开发者已经检查准备由事务保留或替换的本地产品修改时，才显式使用 `pnpm --dir apps/desktop-tauri run prepare:release -- --allow-dirty`；它绝不会允许在脏 Worktree 中合并上游 DSH。成功后，DSH Merge、刷新的快照与 Lockfile 会留给人工检查并提交；`DSH_UPSTREAM.json` 记录官方 DSH Tag 与 Commit，每个 `XIAOHUI_UPSTREAM.json` 记录外部组件的精确 Revision、归档 Hash 与 Tree Hash，生成的 `.bundle-manifest.json` 则记录这些输入与整个 Bundle 的 Hash。后续任何准备步骤失败都会中止由该流程创建的 DSH Merge，并还原受管理的产品输入。

Tag CI、普通 `prepare:dist` 与 `build` 命令都不会修改上游输入。新推送的 Tag 会解析 DSH 策略；已提交的源码、来源记录或祖先关系过期时拒绝发布。针对已有 Tag 的手工 Workflow Dispatch 会跳过这项实时新鲜度检查，只消费该 Tag 已提交的快照与冻结 Lockfile，因此后续 npm 或 GitHub 变化不会破坏旧 Release 的可复现构建。

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
pnpm --dir apps/desktop-tauri run sync:dsh -- --dry-run
pnpm --dir apps/desktop-tauri run prepare:release
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

当前目标固定为 `aarch64-apple-darwin`；发布流水线有意不包含 Windows、Intel macOS 或 Linux 矩阵。

macOS arm64 发布门禁会校验 Tag 与所有桌面版本真源的一致性，并在新 Tag 上要求已提交内容使用策略选中的 DSH Release。它不会刷新产品插件 Channel，而是直接构建已提交的 Harness 和带签名的更新产物，并通过 DSH 参数解析器以及原生、WSL 桌面启动器执行聚焦的 Host 启动参数契约测试。随后，流水线会把便携式 Runtime 移出应用 Bundle，故意破坏原始 Python Home 引用，并要求 `harbor --version` 与 `harbor-dsh --help` 都成功，之后才计算校验和并发布产物。该门禁有意保持小于仓库完整测试矩阵，避免桌面 Patch Release 等待无关平台或 Package。
