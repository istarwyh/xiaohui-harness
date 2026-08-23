# dsh-harbor-evolution

[English](README.md) | 中文

这是一个可安装的 DeepSeek Harness 插件与 Skill，用于执行稳定的 Harbor 评测和受控的 Agent 演进，并在 DSH Web 中提供原生工作台。

它为 DSH 提供十二个严格的 Harbor 工具、专用 Tool Card、九阶段 Evaluation Workbench、安装 Doctor，以及可由用户和模型调用的 `evolve-agent-with-harbor` Skill。Skill 从四个面向用户的概念开始——Dataset（测什么）、Generator（谁来回答）、Evaluator 及评测标准（什么算好）和 Optimizer（谁来改进）——再把已确认的选择编译为严格的 Evaluation Stack。它会验证 Dataset 身份、检查 Trial Lifecycle 与 Score Validity、管理独立的 Ground Truth 元评测、诊断证据来源，把每轮演进限制为一个受控 Candidate 变更，并且只在明确操作中调用 Promotion Gate。

## 安装

要求 Docker、Node.js 22+、pnpm 和 [uv](https://docs.astral.sh/uv/)。在业务 Agent 工作区执行：

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

Setup 命令会安装两个必需的运行时：

- 在托管的 Python 环境中安装 `harbor-dsh-evolution==0.7.1`。
- 在所选 DSH Profile 中安装 `dsh-harbor-evolution@0.7.1`。

随后，它会把 Harbor 可执行文件的绝对路径与 `projectRoot` 写入 Profile 的 `harbor-evolution` 配置块，并验证集成。无关的 Profile 条目会被保留；重复执行只会更新同一个配置块。

默认 Profile 是 `web`。只有实际运行该 Profile 时才使用 `--profile headless`。查看全部选项：

```bash
npx --yes dsh-harbor-evolution@latest setup --help
```

停止旧的 DSH 进程，并执行 Setup 输出的精确重启命令。然后调用：

```text
/evolve-agent-with-harbor
Inspect this workspace and help me clarify and initialize a stable Harbor self-evolution loop.
```

用户可以提供一条 Query 或 Dataset 路径、Generator curl 或本地 Agent 路径、Evaluator curl／路径或自然语言评测标准，以及 Codex 或 Claude Code 等可选 Optimizer。Skill 会先检查工作区，默认使用当前 Agent 作为 Optimizer，并在写入文件前展示一张确认卡。Evaluation Stack 角色、id、版本、Judge 配置、Contract 和 Policy 保留在高级配置中，除非它们会实质影响决策。

插件注册：

- `harbor_candidate_snapshot`
- `harbor_evolution_init`
- `harbor_evolution_doctor`
- `harbor_dataset_validate`
- `harbor_context_preview`
- `harbor_eval_run`
- `harbor_eval_result`
- `harbor_candidate_compare`

在 `web` Profile 中，同一个包还会注册：

- 本地化的九阶段 Workbench，直接展示固定的实验身份、Agent 可见的 Dataset 查询与指令、安全的业务产物预览、Ground Truth 元评测、分页的逐 Trial 证据与建议、Population 有效性与覆盖率、受控优化假设，以及 Baseline/Gate 差异；原始 JSON 保留在审计抽屉中；
- 对 `script` 与 `llm-as-judge` 实现的 Evaluator/Rubric 源码进行 Descriptor 授权编辑，带乐观并发控制并强制使用新身份；
- 由确定性脚本与 LLM-as-Judge 实现共享的 `harbor-dsh-evaluator/v1` 接口；
- 所有 Harbor Tool 调用的紧凑结果卡片；
- `Harbor Evolution` 设置区，用于检查配置的项目、Evaluation Stack、Jobs 目录和 CLI 路径。

Web UI 有意保持只读。启动评测和决定晋级始终属于 Agent + Skill 的显式流程，因此页面刷新不会启动昂贵 Job。

直接评测需要 `candidatePath`、`datasetPath`、`stackPath` 和显式 `mode`；`promotion-eligible` 还需要 `policyPath`。应优先使用 Skill，因为在关键身份与评测契约尚未澄清时，它不会运行或比较 Job。

## Candidate 模型绑定

每个 Job 启动前，插件会快照 DSH Agent 当前选择的 Provider、Model 和 Reasoning Effort，然后启动 Job 级本地 Model Broker。Candidate 通过 `dsh-host-broker` / `dsh-host-model-gateway/v1` 使用临时 `dsh-host` 适配器；它只会收到一个短期有效的 Job Capability 文件，不会收到 GPT Auth、Codex OAuth 或上游 API Key。

`harbor_eval_run`、`harbor_context_preview` 和 `harbor_evolution_doctor` 默认继承这项选择。高级调用方只能成对覆盖 `candidateProvider` 和 `candidateModel`，并可选提供 `candidateReasoningEffort`。`openai-codex` 会在 Harbor 启动前检查 GPT Auth 登录状态。生成的模型绑定属于 Context v2 的比较身份，因此 Provider、Model 或 Reasoning 的任何变化都需要新的 Baseline。

`harbor_eval_result` 默认返回稳定的 Summary。可以使用 `view=job`、`view=dataset`、`view=progress`、`view=trial` 加返回的 `trialId`，或 `view=governance` 检查经过清理的指令、生成结果、证据与 Evaluator 源码，而不让 Agent 耦合产物文件路径。

## Setup 写入什么

所选 Profile 会收到一个按 id 定位的覆盖项：

```yaml
- id: harbor-evolution
  config:
    projectRoot: /workspace/my-agent
    jobsDir: jobs
    harborBin: /managed/runtime/.venv/bin/harbor
    harborDshBin: /managed/runtime/.venv/bin/harbor-dsh
    pythonPath: ""
```

发布版 Python 包应保持 `pythonPath` 为空。`candidatePath`、`datasetPath`、`jobPath` 和 `policyPath` 都被限制在 `projectRoot` 内。

从仓库进行源码开发：

```bash
./hse dsh-install-source web
```

不要在全新 Checkout 中直接执行 `dsh plugin add ./packages/dsh-plugin`。pnpm 会记录 `link:` 依赖，而 Node 会从真实 Checkout 路径解析 Import。源码安装器会先按 Lockfile 执行 `npm ci`，构建带内嵌海洋图案的可移植 Web Client，再链接插件并安装本地 Python Adapter。普通用户始终应使用基于 Registry 的 Setup 命令。

UI 验证、首次评测、Candidate 比较和故障排查请参阅[完整的 DSH Web 快速开始](https://github.com/istarwyh/harbor-self-evolving/blob/main/docs/dsh-web-quickstart.md)。

插件不会部署 Candidate，也不会修改当前 Champion。现有 CI/CD 仍负责构建、部署和推广经过评测的精确制品。
