# Agent Note: Harbor Candidate 的 Job 级 Host 模型桥接

Status: implemented

[English](2026-08-23-harbor-host-model-bridge.md) | 中文

## Problem

XiaoHui 的控制 Agent 可以通过 Codex Auth 使用 `openai-codex`，但 Harbor Candidate 会在隔离的任务容器中运行第二个 DeepSeek Harness 进程。该进程拥有自己的 Cordis 上下文，原本会沿用 Candidate 配置的 `deepseek-official` 模型。父级模型选择与仅存在于 Host 的 OAuth 状态不会穿过这条运行时边界，因此已经登录 GPT Auth 的用户仍会在 Candidate 启动时遇到缺少 DeepSeek 凭据的错误。

把可复用的 Codex 凭据复制进 Candidate 虽然能让评测运行，却会把凭据暴露面扩大到 Candidate 文件、NPM 依赖、任务镜像与 Harbor 产物。静默改写 Candidate 的磁盘配置还会破坏不可变的 Candidate 身份，使评测无法复现。

## Decision

Harbor Cordis 插件会在 Doctor、上下文预览或 Job 执行前解析 Candidate 模型绑定。显式成对提供的 `candidateProvider` 与 `candidateModel` 优先；否则继承 Host Agent 当前的模型选择与可选推理强度。解析过程会验证模型提供方与模型是否存在；`openai-codex` 路径还会验证 Host Codex Auth 服务已经登录，使缺少登录态的问题在启动高成本 Harbor 进程前快速失败。

该绑定在 Job 生命周期内保持冻结，并以模型提供方、模型、可选推理强度、传输方式与协议的形式写入 Evaluation Context v2。它参与比较摘要计算；模型路由变化后必须建立新的可比 Baseline，不能复用来自另一条推理路径的测量结果。这份绑定只作用于 Candidate Agent；Evaluation Stack 仍独立拥有 Judge 身份与凭据。

Host 会为每个 Job 在仅限 Loopback 的地址上打开 HTTP 模型网关，使用随机路由与随机的 256 位 Bearer 能力。无论 Candidate 请求什么模型提供方、模型或推理路由，网关都会忽略这些字段，并通过冻结的绑定调用 Host LLM 注册表。它只传输模型事件与非敏感模型元数据，可复用的 OAuth 或 API 凭据始终留在已注册的 Host 适配器内。Job Lease 会限制请求数量与请求体大小，在资源释放时中止活动流，并在 Harbor 子进程完成或失败后关闭。

Python Candidate 适配器通过 Harbor 进程接收短期 Job 能力，把它写入 `/run/secrets` 下仅所有者可读的文件，并在安装 Candidate 依赖前从任务容器内检查模型网关。随后它生成 `.harbor-runtime/cordis.yml`，引入不可变 Candidate 配置，只把 `acp-agent` 的模型路由修正为合成的 `xiaohui-host` 提供方，并从 Python 包中加载零依赖的网关适配器。Candidate 快照与验证会拒绝源码中的 `.harbor-runtime` 目录，避免生成的运行时状态进入 Candidate 摘要。

macOS Docker 路径会把 Loopback 模型网关公布为 `host.docker.internal`，同时让监听 Socket 保持在 `127.0.0.1`。如果部署的任务网络无法解析该地址，就必须配置 `modelBrokerAdvertisedHost`；Host 绑定地址仍是另一项独立的显式配置。

## Alternatives considered

**把 Codex OAuth Token 传入 Harbor。** 不采用，因为 Candidate、它的依赖与任务环境都不需要可复用的模型提供方凭据。范围收窄到单个 Job 的能力可以保留现有 Host 信任边界。

**在每个 Candidate 内安装并登录 Codex Auth。** 不采用，因为这会产生第二套面向用户的认证状态，无法安全复用 Host 适配器，还会让临时评测容器负责持久登录材料。

**继续把 Candidate 配置的 DeepSeek 模型作为隐式默认值。** 不采用，因为控制 Agent 与 Candidate 会在没有显式实验决策的情况下使用不同提供方，既会重现当前故障，也会削弱结果解释性。

**改写 Candidate 目录中的 `cordis.yml`。** 不采用，因为被评测的文件系统将不再匹配快照摘要。生成的 Overlay 必须留在不可变源码身份之外。

## Consequences

GPT Auth 用户无需再配置 DeepSeek Official，就能运行内置 Harbor Candidate。Candidate 及其全部 subagent 工作在 Job 生命周期内共享一条冻结的 Host 模型路由，同时模型提供方密钥留在 Candidate 信任边界之外。上下文产物让这条路由可审计，并阻止跨模型比较 Baseline。

模型桥接让 Candidate 执行增加了一项实时 Host 依赖：Docker 必须在整个 Job 期间持续访问公布的 Host 地址，关闭桌面应用会中断评测。远程 Harbor 环境需要显式配置受保护的网络路径，不能依赖 macOS Docker 默认地址。该网关有意作为单 Host 内部传输，而不是通用远程 LLM API。

聚焦的 JavaScript 测试固定模型继承、显式配对校验、登录预检、授权、路由约束、流代理与 Lease 资源释放。Python 测试固定直接和 Include 形式的 Cordis Overlay、保留运行时目录、模型绑定规范化，以及网关模块进入 wheel 包。发布验收会覆盖 Docker 到 Host 的可达性，以及通过 Host GPT Auth 适配器返回的一次真实 Candidate 响应。
