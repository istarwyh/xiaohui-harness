# XiaoHui Harness 0.2.1

## English

- macOS Apple Silicon desktop workbench based on DeepSeek Harness and the Sakana Tauri shell.
- Fixes the bundled Harbor Python entry points so they remain executable after the app is moved from the build directory into `/Applications`; the release pipeline now tests this relocated layout explicitly.
- Bundles `dsh-harbor-evolution@0.6.0`, its `evolve-agent-with-harbor` Skill, portable CPython 3.12.14, and `harbor-dsh-evolution==0.6.0`.
- Bundles `dsh-codex-auth@0.3.0` for the local Codex login, LLM, Search, and Image capabilities.
- Bundles `dsh-better-sidebar@0.15.1` for files, editing, terminal, Git, background tasks, and extensible workbench panels.
- Uses a frozen product lockfile, checksum-verified compressed offline pnpm store, and pinned macOS arm64 Node/pnpm toolchain; first launch needs no npm or Node-mirror access.
- Brands the Web workbench as XiaoHui Harness and validates the release Tag against every desktop version source.
- Adds CSP and no-referrer protection to the desktop shell and served workbench.
- Uses an isolated XiaoHui home and workspace instead of adopting `~/.dsh`.
- Publishes a DMG and signed Tauri updater artifacts through GitHub Actions.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 基于 DeepSeek Harness 与 Sakana Tauri 桌面壳构建 macOS Apple Silicon AI 工作台。
- 修复内置 Harbor Python 入口在应用从构建目录移动到 `/Applications` 后失效的问题；发布流水线现在会明确测试迁移后的目录布局。
- 内置 `dsh-harbor-evolution@0.6.0`、`evolve-agent-with-harbor` Skill、便携式 CPython 3.12.14 和 `harbor-dsh-evolution==0.6.0`。
- 内置 `dsh-codex-auth@0.3.0`，提供本机 Codex 登录、LLM、搜索与图像能力。
- 内置 `dsh-better-sidebar@0.15.1`，提供文件、编辑、终端、Git、后台任务与可扩展工作台面板。
- 使用冻结的产品 Lockfile、经过校验和验证的压缩离线 pnpm Store，以及固定的 macOS arm64 Node/pnpm 工具链；首次启动无需访问 npm 或 Node 镜像。
- Web 工作台统一使用 XiaoHui Harness 品牌，并在发布前校验 Tag 与全部桌面版本来源一致。
- 为桌面 Shell 与工作台页面增加 CSP 和 `no-referrer` 保护。
- 使用独立的 XiaoHui 主目录与工作区，不接管 `~/.dsh`。
- 通过 GitHub Actions 发布 DMG 和带签名的 Tauri 更新产物。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
