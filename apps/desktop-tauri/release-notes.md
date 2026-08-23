# XiaoHui Harness 0.2.3

## English

- Updates the bundled Harbor integration to `dsh-harbor-evolution@0.7.1` and `harbor-dsh-evolution==0.7.1`.
- Adds progressive onboarding around four user-facing concepts: Dataset, Generator, Evaluator plus criteria, and Optimizer. Accepted choices compile into the strict Evaluation Stack behind the workbench.
- Expands Harbor to twelve strict tools and a nine-stage Evaluation Workbench, including independent Ground Truth meta-evaluation and schema-backed result artifacts.
- Keeps Candidate inference on the Agent's current Host model through the generic `dsh-host` Broker protocol. GPT Auth users do not need a separate DeepSeek credential, and reusable OAuth tokens never enter the Candidate or Docker task environment.
- Records the provider, model, reasoning effort, transport, and protocol in Evaluation Context v2 so a model change requires a new comparable baseline.
- Bundles `dsh-codex-auth@0.3.0` for the local Codex login, LLM, Search, and Image capabilities.
- Bundles `dsh-better-sidebar@0.15.1` for files, editing, terminal, Git, background tasks, and extensible workbench panels.
- Bundles `dsh-personal-workbench@0.1.0` so each Profile can set its own workbench name and Logo from General settings.
- Shortens tag publishing by caching the checksum-verified offline pnpm Store by its frozen Lockfile and removing duplicate unit-test stages, a redundant App rebundle, and the roughly 1 GB artifact relay between jobs. Version validation, frozen installation, the full Harness and Tauri build, extracted updater runtime smoke, updater signature, checksums, and release manifest remain mandatory.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 将内置 Harbor 集成升级到 `dsh-harbor-evolution@0.7.1` 与 `harbor-dsh-evolution==0.7.1`。
- 围绕四个用户概念提供渐进式引导：Dataset、Generator、Evaluator 及 Criteria、Optimizer；确认后的选择会在工作台背后编译成严格的 Evaluation Stack。
- Harbor 扩展到十二个严格 Tool 与九阶段 Evaluation Workbench，并加入独立的 Ground Truth 元评测和由 Schema 约束的结果产物。
- Candidate 继续通过通用 `dsh-host` Broker 协议调用 Agent 当前选择的 Host 模型。GPT Auth 用户不需要额外的 DeepSeek 凭据，可复用 OAuth Token 也不会进入 Candidate 或 Docker 任务环境。
- Evaluation Context v2 会记录 Provider、Model、Reasoning Effort、Transport 与 Protocol，因此更换模型后必须建立新的可比 Baseline。
- 内置 `dsh-codex-auth@0.3.0`，提供本机 Codex 登录、LLM、搜索与图像能力。
- 内置 `dsh-better-sidebar@0.15.1`，提供文件、编辑、终端、Git、后台任务与可扩展工作台面板。
- 内置 `dsh-personal-workbench@0.1.0`，允许每个 Profile 在通用设置中修改自己的工作台名称和 Logo。
- 标签发布会按冻结 Lockfile 缓存经过校验和验证的离线 pnpm Store，不再重复运行单元测试、不再进行多余的 App 重打包，也不再在 Job 间中转约 1 GB 的构建产物。版本校验、冻结安装、完整 Harness 与 Tauri 构建、解压后的更新包运行时冒烟、Updater 签名、校验和与发布 Manifest 仍是强制步骤。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
