# XiaoHui Harness 0.2.2

## English

- macOS Apple Silicon desktop workbench based on DeepSeek Harness and the Sakana Tauri shell.
- Fixes Harbor Candidate execution so it freezes the current XiaoHui Agent model before each Job and routes Candidate inference back through the Host LLM registry. A GPT Auth user no longer falls through to the Candidate's `DeepSeek Official` default or needs a second DeepSeek credential.
- Keeps the Codex OAuth credential in the XiaoHui Host. Each Harbor Job receives only a random, short-lived broker capability; neither the Candidate directory nor the Docker task environment receives the reusable OAuth token.
- Adds a Host-side sign-in check and an in-container broker connectivity preflight before the expensive Candidate run. Evaluation Context v2 records the exact Candidate provider, model, reasoning effort, transport, and protocol, so changing the model requires a fresh comparable baseline.
- Reuses product plugins already mounted through standard Profile Bundles and enables uniquely named in-box fallbacks only when no existing mount is active, preventing duplicate Loader IDs during upgrades.
- Rebinds only XiaoHui-managed `link:` dependencies that still point at an older content-addressed Harness tree, then refreshes that Profile through the normal pnpm install path. Registry packages and user-owned local links remain untouched.
- Bundles `dsh-harbor-evolution@0.6.0`, its `evolve-agent-with-harbor` Skill, portable CPython 3.12.14, and `harbor-dsh-evolution==0.6.0`.
- Bundles `dsh-codex-auth@0.3.0` for the local Codex login, LLM, Search, and Image capabilities.
- Bundles `dsh-better-sidebar@0.15.1` for files, editing, terminal, Git, background tasks, and extensible workbench panels.
- Bundles `dsh-personal-workbench@0.1.0` so each Profile can set its own workbench name and Logo from General settings.
- Uses a frozen product lockfile, checksum-verified compressed offline pnpm store, and pinned macOS arm64 Node/pnpm toolchain; first launch needs no npm or Node-mirror access.
- Brands the Web workbench as XiaoHui Harness and validates the release Tag against every desktop version source.
- Adds CSP and no-referrer protection to the desktop shell and served workbench.
- Uses an isolated XiaoHui home and workspace instead of adopting `~/.dsh`.
- Publishes a DMG and signed Tauri updater artifacts through GitHub Actions.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 基于 DeepSeek Harness 与 Sakana Tauri 桌面壳构建 macOS Apple Silicon AI 工作台。
- 修复 Harbor Candidate 的模型执行链路：每个 Job 启动前都会冻结 XiaoHui Agent 当前选择的模型，并把 Candidate 推理路由回 Host LLM Registry。使用 GPT Auth 时不再回落到 Candidate 默认的 `DeepSeek Official`，也不需要再配置一份 DeepSeek 凭据。
- Codex OAuth 凭据始终留在 XiaoHui Host；每个 Harbor Job 只获得随机且短期有效的 Broker Capability，Candidate 目录与 Docker 任务环境都不会收到可复用的 OAuth Token。
- 在昂贵的 Candidate 执行前增加 Host 登录状态检查与容器内 Broker 连通性预检。Evaluation Context v2 会记录准确的 Candidate Provider、Model、Reasoning Effort、Transport 与 Protocol，因此更换模型后必须建立新的可比 Baseline。
- 已通过标准 Profile Bundle 挂载的产品插件会被直接复用；只有不存在现有挂载时才启用名称唯一的内置 Fallback，避免升级时出现重复 Loader ID。
- 只会把仍指向旧版内容寻址 Harness Tree 的 XiaoHui 托管 `link:` 依赖重绑到当前版本，再通过标准 pnpm 安装路径刷新该 Profile；Registry 包与用户自己的本地链接保持不变。
- 内置 `dsh-harbor-evolution@0.6.0`、`evolve-agent-with-harbor` Skill、便携式 CPython 3.12.14 和 `harbor-dsh-evolution==0.6.0`。
- 内置 `dsh-codex-auth@0.3.0`，提供本机 Codex 登录、LLM、搜索与图像能力。
- 内置 `dsh-better-sidebar@0.15.1`，提供文件、编辑、终端、Git、后台任务与可扩展工作台面板。
- 内置 `dsh-personal-workbench@0.1.0`，允许每个 Profile 在通用设置中修改自己的工作台名称和 Logo。
- 使用冻结的产品 Lockfile、经过校验和验证的压缩离线 pnpm Store，以及固定的 macOS arm64 Node/pnpm 工具链；首次启动无需访问 npm 或 Node 镜像。
- Web 工作台统一使用 XiaoHui Harness 品牌，并在发布前校验 Tag 与全部桌面版本来源一致。
- 为桌面 Shell 与工作台页面增加 CSP 和 `no-referrer` 保护。
- 使用独立的 XiaoHui 主目录与工作区，不接管 `~/.dsh`。
- 通过 GitHub Actions 发布 DMG 和带签名的 Tauri 更新产物。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
