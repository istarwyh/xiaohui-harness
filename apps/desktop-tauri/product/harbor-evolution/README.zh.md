# dsh-harbor-evolution

[English](README.md) | 中文

这是一个可安装的 DeepSeek Harness 插件与 Skill，用于执行稳定的 Harbor 评测和受控的 Agent 演进，并在 DSH Web 中提供原生工作台。

它为 DSH 提供八个严格的 Harbor 工具、专用 Tool Card、八阶段 Evaluation Workbench，以及可由用户和模型调用的 `evolve-agent-with-harbor` Skill。Skill 会澄清并初始化 Evaluation Stack、验证 Dataset 身份、检查 Trial Lifecycle 与 Score Validity、诊断证据来源，把每轮演进限制为一个受控 Candidate 变更，并且只在用户明确要求时调用 Promotion Gate。

## 安装

要求 Docker、Node.js 22+、pnpm 和 [uv](https://docs.astral.sh/uv/)。在业务 Agent 工作区执行：

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

Setup 命令会安装两个必需的运行时：

- 在托管的 Python 环境中安装 `harbor-dsh-evolution==0.6.0`。
- 在所选 DSH Profile 中安装 `dsh-harbor-evolution@0.6.0`。

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

- 本地化的八阶段 Workbench，直接展示固定的实验身份、Agent 可见的 Dataset 查询与指令、安全的业务制品预览、逐 Trial 证据、Population 有效性与覆盖率、受控优化假设，以及 Baseline/Gate 差异；原始 JSON 保留在审计抽屉中；
- 对 `script` 与 `llm-as-judge` 实现的 Evaluator/Rubric 源码进行 Descriptor 授权编辑，带乐观并发控制并强制使用新身份；
- 由确定性脚本与 LLM-as-Judge 实现共享的 `harbor-dsh-evaluator/v1` 接口；
- 所有 Harbor Tool 调用的紧凑结果卡片；
- `Harbor Evolution` 设置区，用于检查配置的项目、Evaluation Stack、Jobs 目录和 CLI 路径。

Web UI 有意保持只读。启动评测和决定晋级始终属于 Agent + Skill 的显式流程，因此页面刷新不会启动昂贵 Job。

直接评测需要 `candidatePath`、`datasetPath`、`stackPath` 和显式 `mode`；`promotion-eligible` 还需要 `policyPath`。应优先使用 Skill，因为在关键身份与评测契约尚未澄清时，它不会运行或比较 Job。

`harbor_eval_result` 默认返回稳定的 Summary。可以使用 `view=job`、`view=dataset`、`view=progress`、`view=trial` 加返回的 `trialId`，或 `view=governance` 检查经过清理的指令、生成结果、证据与 Evaluator 源码，而不让 Agent 耦合制品文件路径。

## Candidate 模型绑定

`harbor_evolution_doctor`、`harbor_context_preview` 与 `harbor_eval_run` 会在 Harbor 启动前解析 Candidate 模型。默认情况下，它们冻结 Agent 当前选择的 Provider、Model 与 Reasoning Effort；调用方也可以同时提供 `candidateProvider` 与 `candidateModel`，并可选提供 `candidateReasoningEffort`。选定的路由会写入 Evaluation Context v2，因此也属于 Baseline 可比性的一部分。

Job 执行期间，Candidate 通过仅绑定 Loopback 的 Host Broker 调用冻结的模型。Docker 任务只会得到随机的 Job 级 Bearer Capability 与非敏感模型 Metadata，可复用的 Provider 凭据始终留在 Harness Host。Python Adapter 会先从任务容器内检查 Broker 可达性，再生成临时 `.harbor-runtime` Cordis Overlay；它不会修改已经快照化的 Candidate。XiaoHui 默认向容器公布 `host.docker.internal`；采用其他 Host 到容器网络的部署必须显式设置 `modelBrokerAdvertisedHost`。

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
    candidateProvider: ""
    candidateModel: ""
    candidateReasoningEffort: ""
    modelBrokerBindHost: 127.0.0.1
    modelBrokerAdvertisedHost: host.docker.internal
```

发布版 Python 包应保持 `pythonPath` 为空。`candidatePath`、`datasetPath`、`jobPath` 和 `policyPath` 都被限制在 `projectRoot` 内。

从仓库进行源码开发：

```bash
./hse dsh-install-source web
```

不要在全新 Checkout 中直接执行 `dsh plugin add ./packages/dsh-plugin`。pnpm 会记录 `link:` 依赖，而 Node 会从真实 Checkout 路径解析 Import。源码安装器会先按 Lockfile 执行 `npm ci`，构建带内嵌海洋图案的可移植 Web Client，再链接插件并安装本地 Python Adapter。普通用户始终应使用基于 Registry 的 Setup 命令。

UI 验证、首次评测、Candidate 比较和故障排查请参阅[完整的 DSH Web 快速开始](https://github.com/istarwyh/harbor-self-evolving/blob/main/docs/dsh-web-quickstart.md)。

插件不会部署 Candidate，也不会修改当前 Champion。现有 CI/CD 仍负责构建、部署和推广经过评测的精确制品。
