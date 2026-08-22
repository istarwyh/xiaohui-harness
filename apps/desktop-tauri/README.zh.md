# XiaoHui Harness Desktop

[English](README.md) | 中文

这个 Tauri 应用承载现有的 `dsh web` 客户端，并加入 XiaoHui 产品装配层。安装包携带裁剪后的 Harness 源码、Harbor Evolution 插件与 Skill、便携式 CPython 3.12 和 Harbor Adapter。

## 运行时布局

| 资源 | 运行时行为 |
|---|---|
| `harness-source` | 复制到按内容 Hash 隔离的应用数据目录，首次启动安装生产依赖 |
| `xiaohui-runtime` | 直接从签名的应用资源运行，提供 `harbor` 和 `harbor-dsh` |
| `desktop-overlay` | 通过 `dsh web --patch` 注册通知与产品内置的 `harbor-evolution` Cordis 节点 |
| `XiaoHui Harness/dsh-home` | 隔离保存会话、设置、凭据和 Web Profile |
| `XiaoHui Harness/workspace` | 默认项目根目录和 Harbor `jobs/` 目录 |

产品快照位于 `product/harbor-evolution` 和 `product/harbor-python`。`scripts/bundle-harness-source.mjs` 把 Cordis Package 与 Skill 放进裁剪后的 workspace，并加入 CLI 依赖闭包，因此 Host 无需从 Registry 安装即可解析。`scripts/prepare-xiaohui-runtime.mjs` 把已提交的 Python 快照安装进可迁移资源，也接受 `XIAOHUI_HARBOR_PYTHON_SOURCE` 用于临时测试本地 Adapter。

复用宿主 Node 时会同时检查受支持版本与原生 CPU 架构。XiaoHui 不接管全局 pnpm，而是准备固定版本的产品自有 pnpm，避免 Wrapper 或 Native Package 由另一种 Node 架构安装。macOS 构建把 App/Updater、DMG、App/Updater 分成三个阶段，避免 Finder 的 DMG 美化失败连带丢失已签名的更新产物。

## 命令

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm --dir apps/desktop-tauri run test:bundle
pnpm --dir apps/desktop-tauri run test:overlay
pnpm --dir apps/desktop-tauri run test:update-manifest
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

当前目标固定为 `aarch64-apple-darwin`；发布流水线有意不包含 Windows、Intel macOS 或 Linux 矩阵。

已经验证的 macOS arm64 首次启动路径会下载 Node 22.19.0、准备 pnpm 11.7.0、安装裁剪后的生产 workspace、加载 Harbor 客户端插件，并以 HTTP 200 提供工作台。便携运行时报告 Harbor 0.21.0，也能发现 `dsh-evolution` Python 插件。
