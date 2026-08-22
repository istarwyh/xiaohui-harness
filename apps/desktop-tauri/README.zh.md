# XiaoHui Harness Desktop

[English](README.md) | 中文

这个 Tauri 应用承载现有的 `dsh web` 客户端，并加入 XiaoHui 产品装配层。安装包携带裁剪后的 Harness 源码、Harbor Evolution 及其 Skill、Codex Auth、Better Sidebar、便携式 CPython 3.12 和 Harbor Adapter。

## 运行时布局

| 资源 | 运行时行为 |
|---|---|
| `harness-source` | 携带已构建源码、冻结 Lockfile 与单个压缩的离线 pnpm Store，并复制到按内容 Hash 隔离的应用数据目录 |
| `toolchain` | 校验和固定的 macOS arm64 Node 22.19.0 与 pnpm 11.7.0 归档；宿主没有兼容 Node 时使用 |
| `xiaohui-runtime` | 直接从签名的应用资源运行，提供 `harbor` 和 `harbor-dsh` |
| `desktop-overlay` | 通过 `dsh web --patch` 注册通知、Codex Auth/Search/Image、Better Sidebar 与 Harbor Evolution |
| `XiaoHui Harness/dsh-home` | 隔离保存会话、设置、凭据和 Web Profile |
| `XiaoHui Harness/workspace` | 默认项目根目录和 Harbor `jobs/` 目录 |

产品快照位于 `product/harbor-evolution`、`product/harbor-python`、`product/dsh-codex-auth` 和 `product/dsh-better-sidebar`。`scripts/bundle-harness-source.mjs` 把三个 Cordis Package 与 Harbor Skill 放进裁剪后的 workspace，并加入 CLI 依赖闭包，因此 Host 无需从 Registry 安装插件代码即可解析。两个社区 Package 都固定到经过检查的 npm Tarball，来源地址与完整性 Hash 记录在各自的 `XIAOHUI_UPSTREAM.json`。两者都记录了一项纯 Metadata 修正，把 `dsh-*` Peer 固定到 XiaoHui 内置的 `0.1.1-rc.1` Runtime，防止 pnpm 再解析出另一套候选版本依赖图。`scripts/prepare-xiaohui-runtime.mjs` 把已提交的 Python 快照安装进可迁移资源，也接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 用于临时测试本地 Adapter。

复用宿主 Node 时会同时检查受支持版本与原生 CPU 架构。XiaoHui 不接管全局 pnpm，而是准备固定版本的产品自有 pnpm，避免 Wrapper 或 Native Package 由另一种 Node 架构安装。冷启动会先校验每个归档的摘要，展开依赖 Store，再通过 `pnpm install --prod --frozen-lockfile --offline` 重建 `node_modules`；成功后删除临时展开的 Store 与复制出的归档。发布时把约 35,000 个 Store 小文件压缩成一个应用资源，既减小安装体积，也避免 Tauri 打包时受到平台链接影响。macOS 构建把 App/Updater、DMG、App/Updater 分成三个阶段，避免 Finder 的 DMG 美化失败连带丢失已签名的更新产物。

应用只在 Host 进程树内前置其私有的 `dsh`、Node 与 pnpm Shim。它不会覆盖用户的全局 `dsh` 命令或 Shell Profile；只有开发者显式设置 `XIAOHUI_PERSIST_DSH_CLI=1` 启动时才会持久化。

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

macOS arm64 发布门禁会使用隔离且为空的 `XIAOHUI_APP_DATA_DIR`，并把 Node/npm 镜像故意设为不可访问。应用必须使用内置 Node 22.19.0 与 pnpm 11.7.0、完成冻结的离线安装，并以 HTTP 200 提供工作台。验收还要求页面显示 XiaoHui 产品名，Web Boot Manifest 包含 Harbor、Codex Auth 与 Better Sidebar 客户端 Bundle，Host 配置包含全部产品节点。便携运行时报告 Harbor 0.21.0，也能发现 `dsh-evolution` Python 插件。
