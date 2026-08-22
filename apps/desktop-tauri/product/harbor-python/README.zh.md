# harbor-dsh-evolution

[English](README.md) | 中文

这是 DeepSeek Harness Candidate 演进流程在 Harbor 一侧的集成包。

它提供：

- `DshCandidateAgent`：验证并上传不可变 Candidate，安装锁定的 npm 依赖，再通过 Harbor ACP Runner 执行。
- `EvolutionPlugin`：把每个 Job 绑定到 Candidate、Dataset Manifest、Evaluation Stack Manifest、Context v2、Architecture Doctor、Trial Assessment、Population Report 与 Summary。
- `harbor-dsh`：初始化严格项目，验证或快照 Candidate、Dataset 和 Stack，预览 Context v2，执行架构诊断、Job 汇总和确定性的 Promotion Gate。

它必须与 Harbor 安装在同一个 Python 环境中，Harbor 才能发现该插件 Entry Point：

```bash
uv venv .venv
uv pip install --python .venv/bin/python harbor-dsh-evolution
source .venv/bin/activate
harbor plugins list
harbor-dsh --help
```

从本仓库开发：

```bash
uv sync
uv run harbor plugins list
uv run harbor-dsh --help
uv run harbor-dsh dataset validate ../../examples/deep-research/task --project-root ../..
uv run harbor-dsh stack validate ../../examples/deep-research/.harbor/evaluation-stack.yml --project-root ../..
uv run pytest
uv build
```

Harbor 与该包必须位于同一个 Python 环境中，`harbor plugins list` 才会显示 `dsh-evolution` Entry Point。

`snapshot` 默认从 `package.json` 推导 Candidate id 与版本，也允许显式指定。Context v1 不被接受；晋级要求 Context v2，并输出结构化的不匹配、制品、基础设施、指标与回归原因码。
