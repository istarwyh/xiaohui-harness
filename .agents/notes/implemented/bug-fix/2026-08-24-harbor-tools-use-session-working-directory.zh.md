# Agent Note: Harbor Agent 工具使用调用 Session 的工作区

Status: implemented

[English](2026-08-24-harbor-tools-use-session-working-directory.md) | 中文

## Problem

XiaoHui 的所有 Web Session 共享同一个 Harbor Plugin 实例。它配置的 `projectRoot` 指向应用数据 workspace，让全局 Harbor Workbench 拥有稳定目录；但内置 Skill 把这个进程级值当成每个 Agent Session 的写入根目录。会话在用户选择的工作区打开后，只要两个路径不同就会被要求停止；即使模型继续执行，注册的 Tool 也会以应用数据目录解析相对路径。

每当当前会话变化就修改唯一的 Plugin 配置，会使并发 Session 相互重定向。Tool 调用本身已经携带所属 Agent Session 及其不可变 Header 工作目录，因此请求具备比共享 Plugin 实例更精确的工作区身份来源。

## Decision

所有面向 Agent 的 Harbor Tool 都接收 DSH Tool 执行上下文，并要求 `exec.agent.session.header.cwd` 是绝对路径。Tool Adapter 为本次调用创建不可变的 `EvolutionService`，以 Session 工作目录作为 `projectRoot`，且不修改共享 Plugin 配置。现有路径约束随后会把 Candidate、Dataset、Job、Policy、Evaluator 与生成路径全部限制在调用方 Session 工作区内。

进程级 Service 和配置的应用数据 `projectRoot` 只留给全局 Web Workbench 与非 Agent 调用方。内置 Skill 会在当前 Session 工作区下建议 `./harbor-evolution/`，不再因为回退配置不同而阻止初始化。XiaoHui 把对应的 JavaScript Plugin 与 Python Adapter 作为集成版本 `0.7.2` 一起携带。

## Testing

Harbor Plugin 测试会在两个不同 Session 工作目录中并发运行 Snapshot Tool，同时设置第三个故意不同的配置根目录。测试确认每份 Manifest 只写入所属 Session、配置根目录保持不变、目录穿越仍被拒绝，并且缺少绝对 Session 目录时会在文件访问前失败。Skill 注册测试会拒绝已经移除的路径不一致指令。完整 Plugin 测试 48 项通过，Python Adapter 测试 53 项通过；XiaoHui 的 Bundle、离线 Runtime、Overlay 与聚焦 Rust 测试也会验证同步后的产品装配。

## Alternatives considered

**当前会话变化时更新共享 Plugin 配置。** 放弃，因为一个 Host 会服务多个 Session；修改共享可变状态会让最近聚焦的 Session 重定向另一个 Session 正在执行的工作。

**从桌面 Overlay 删除 `projectRoot`，依赖 Profile Patch 合并。** 组合配置验证表明 Cordis 会整体替换后置条目的 `config` 对象，而不是按字段合并；省略该字段会删除早先的值，而且仍无法表示多个并发 Session 根目录，因此放弃。

**要求模型在每个 Tool 参数中传入绝对工作区路径。** 放弃，因为这会复制权威 Session 状态、增加 Prompt 负担，并让模型生成的值成为信任根，从而削弱路径约束。

## Consequences

集成版本 `0.7.2` 运行后，用户可以直接在 XiaoHui Session 选择的任意工作区内初始化和操作 Harbor，包括 `/Users/mac/Documents/Harness`，不必修改桌面配置。并发 Session 由结构保证隔离。没有 Agent Session 的直接 Tool 调用现在会明确失败；非 Agent 集成继续使用配置 `projectRoot` 的 Service 或 Web 路由。全局 Workbench 在获得明确的 Session 选择器之前，仍展示配置的回退 workspace。
