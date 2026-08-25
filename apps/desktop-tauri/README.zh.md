# XiaoHui Harness Desktop

[English](README.md) | 中文

这个 Tauri 应用承载现有的 `dsh web` 客户端，并加入 XiaoHui 产品装配层。安装包携带裁剪后的 Harness 源码、Harbor Evolution 及其 Skill、Codex Auth、Better Sidebar、Personal Workbench 品牌插件、便携式 CPython 3.12 和 Harbor Adapter。

## 运行时布局

| 资源 | 运行时行为 |
|---|---|
| `harness-source` | 携带已构建源码、冻结 Lockfile 与单个压缩的离线 pnpm Store，并复制到按内容 Hash 隔离的应用数据目录 |
| `toolchain` | 校验和固定的 macOS arm64 Node 22.19.0 与 pnpm 11.7.0 归档；宿主没有兼容 Node 时使用 |
| `xiaohui-runtime` | 直接从签名的应用资源运行，提供 `harbor` 和 `harbor-dsh` |
| `desktop-overlay` | 通过 `dsh web --patch` 注册通知、Codex Auth/Search/Image、Better Sidebar、Personal Workbench 与 Harbor Evolution |
| `XiaoHui Harness/dsh-home` | 隔离保存会话、设置、凭据和 Web Profile |
| `XiaoHui Harness/workspace` | 没有标准 Profile 实例时供 Harbor Workbench 使用的回退根目录 |

产品源码位于 `product/harbor-evolution`、`product/harbor-python`、`product/dsh-codex-auth`、`product/dsh-better-sidebar` 和 `product/personal-workbench`。`scripts/bundle-harness-source.mjs` 把四个 Cordis Package 与 Harbor Skill 放进裁剪后的 workspace，并加入 CLI 依赖闭包，因此 Host 无需从 Registry 安装插件代码即可解析。两个社区 Package 都固定到经过检查的 npm Tarball，来源地址与完整性 Hash 记录在各自的 `XIAOHUI_UPSTREAM.json`。两者都记录了一项纯 Metadata 修正，把 `dsh-*` Peer 固定到 XiaoHui 内置的 `0.1.1-rc.1` Runtime，防止 pnpm 再解析出另一套候选版本依赖图。`scripts/prepare-xiaohui-runtime.mjs` 把已提交的 Python 快照安装进可迁移资源，也接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 用于临时测试本地 Adapter。

所有面向 Agent 的 Harbor Tool 都以调用方 Session 的绝对工作目录作为根目录。因此用户在 XiaoHui Session 中选择 `/Users/me/project` 后，初始化和后续由 Agent 创建的 Harbor 产物都会留在该项目内。桌面 Overlay 配置的应用数据 `projectRoot` 只作为全局 Web Workbench／非 Agent 场景的回退；Agent Tool 既不会使用它，也不会因为它与 Session 目录不同而拒绝执行。

Harbor 会在 Job 启动前通过 Host 的 `agentDefaultModel` 与 LLM Service 解析并冻结 Candidate 模型。仅绑定 Loopback 的 Host Broker 随后通过随机的 Job 级 URL 与 Bearer Capability，把这条准确的模型路由开放给 Docker 任务。Python Adapter 会先从容器内执行健康检查，再安装和启动 Candidate；它在 `.harbor-runtime` 下生成临时 Cordis Overlay，只把 Candidate ACP 的模型路由替换为 `xiaohui-host/<frozen-model>`。原始 Candidate 保持不可变，Codex OAuth 凭据不会进入 Candidate 文件、配置或容器环境。模型绑定属于 Evaluation Context v2，因此更换 Provider、Model、Reasoning Effort、Transport 或 Protocol 后不能复用旧的比较 Baseline。

复用宿主 Node 时会同时检查受支持版本与原生 CPU 架构。XiaoHui 不接管全局 pnpm，而是准备固定版本的产品自有 pnpm，避免 Wrapper 或 Native Package 由另一种 Node 架构安装。冷启动会先校验每个归档的摘要，展开依赖 Store，再通过 `pnpm install --prod --frozen-lockfile --offline` 重建 `node_modules`；成功后删除临时展开的 Store 与复制出的归档。发布时把约 35,000 个 Store 小文件压缩成一个应用资源，既减小安装体积，也避免 Tauri 打包时受到平台链接影响。macOS 构建把 App/Updater、DMG、App/Updater 分成三个阶段，避免 Finder 的 DMG 美化失败连带丢失已签名的更新产物。

应用只在 Host 进程树内前置其私有的 `dsh`、Node 与 pnpm Shim。它不会覆盖用户的全局 `dsh` 命令或 Shell Profile；只有开发者显式设置 `XIAOHUI_PERSIST_DSH_CLI=1` 启动时才会持久化。产品插件 Overlay 会按包名复用已经激活的标准 Profile Bundle，只有不存在先前挂载时才启用名称唯一的内置 Fallback，因此用户安装过的 Harbor、Codex Auth、Better Sidebar 或 Personal Workbench Bundle 不会产生重复 Loader ID。升级时，原生启动链路还会只重绑仍指向本应用旧内容寻址 Harness Tree 的 XiaoHui 托管 `link:` 依赖，并执行标准 Profile 安装；Registry 依赖以及 XiaoHui 应用数据目录之外的链接仍归用户所有，且不会被修改。

桌面壳会通过 `dsh web --no-open` 启动私有 Host。Loopback URL 仍然是 Tauri WebView 加载的内部传输地址，但启动过程不会再把这个 URL 交给操作系统默认浏览器。

桌面 Overlay 会给工作台页面注入 Content Security Policy 与 `no-referrer` 策略；Tauri 自有的启动页与 Shell 也配置了 CSP。Cordis 客户端插件需要动态求值，因此工作台保留 `unsafe-eval`，同时禁用 Object 与 Base URL 修改。

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
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

当前目标固定为 `aarch64-apple-darwin`；发布流水线有意不包含 Windows、Intel macOS 或 Linux 矩阵。

macOS arm64 发布门禁会校验 Tag 与所有桌面版本真源的一致性，构建 Harness 和带签名的更新产物，并通过 DSH 参数解析器以及原生、WSL 桌面启动器执行聚焦的 Host 启动参数契约测试。随后，流水线会把便携式 Runtime 移出应用 Bundle，故意破坏原始 Python Home 引用，并要求 `harbor --version` 与 `harbor-dsh --help` 都成功，之后才计算校验和并发布产物。该门禁有意保持小于仓库完整测试矩阵，避免桌面 Patch Release 等待无关平台或 Package。
