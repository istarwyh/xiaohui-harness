# Agent Note: XiaoHui 应用全局网络代理

Status: implemented

[English](2026-08-30-xiaohui-global-network-proxy.md) | 中文

## Problem

从 macOS Finder 启动的应用不会继承用户交互式 Shell 中的代理变量。因此，即使 macOS 已经配置可用的系统代理，Codex Auth 等插件创建的 Node HTTP Client 仍可能直接连接。只修复一个插件还会让 Package 安装、Marketplace Metadata、Runtime 预配与应用更新使用不同链路。

## Decision

XiaoHui 原生桌面设置持有一项应用全局的 `direct`、`system` 或 `custom` 代理选择。默认使用直连，并从所有应用自有进程中移除大小写形式的继承代理变量。跟随系统模式执行固定的 `/usr/sbin/scutil --proxy` 命令，接受 macOS 固定的 HTTP 与 HTTPS Endpoint。自定义模式要求分别填写不含凭据的 HTTP 与 HTTPS URL，并接受以逗号分隔的绕过列表。所有模式都会把 `localhost`、`127.0.0.1` 与 `::1` 加入绕过列表，使 Tauri WebView 与私有 Host 保持 Loopback 直连。

原生启动链路会在 Runtime 预配前解析已保存的选择。解析结果用于配置 Rust HTTP Client、签名更新器、原生 Host 与插件子进程、Profile Repair 与 Package 安装、Toolchain 下载以及 WSL 命令。注入环境时会先移除原有代理值，再加入解析结果，并显式启用 Node 的环境代理开关。由于安装包内的 Node 22.19 Runtime 早于该开关，第一方 Personal Workbench Host Entry 还会在存在解析后代理时，把 Undici 的 `EnvHttpProxyAgent` 安装成进程全局 Dispatcher。运行中的应用会保持这份不可变的解析结果；修改已保存的草稿不会拆分仍在运行的 Host 进程树，设置操作会在保存后重启 XiaoHui。

跟随系统模式拒绝 PAC、自动发现以及只有 HTTP 的 macOS 配置。PAC 求值不等同于导出静态 Node 代理变量，而只有 HTTP 的 macOS 配置会使 HTTPS Client 静默选择另一条链路。自定义代理 URL 拒绝嵌入凭据和非 HTTP Scheme，避免 Secret 进入明文桌面设置文件、进程参数或日志。需要认证的代理必须等待后续 Credential Store 集成，不能通过兼容回退实现。

Personal Workbench Client 会在通用设置中加入一张卡片，加载当前原生设置与检测到的 macOS Endpoint，通过 `https://chatgpt.com/` 测试草稿链路，并提供“保存并重启”。测试把低于 500 且不是代理认证状态 407 的 HTTP 响应视为链路可达，不要求也不会发送 ChatGPT 凭据。独立的 `dsh web` 没有受信任的原生所有者，因此只显示禁用的控件。

Loopback Client 使用独立且带版本的消息 Channel，包含 `get`、`test` 与 `save` 三项 Action。Tauri Shell 要求消息来自精确的工作台 iframe Source 与 Host Origin，校验有界字段与已知 Key，把 Action 映射到三个字面量 Command，并只向该 Origin 回复。Rust 会在使用前执行同一套设置校验。浏览器不能提供 Command Name、Executable、Destination URL、系统命令或任意环境变量。

现有的 [XiaoHui 产品化 AI 工作台发行](2026-08-22-xiaohui-product-workbench.zh.md)继续负责产品打包与发布验收；本记录只负责应用全局路由策略。较早的[桌面端主机工具链扫描与主目录匹配](2026-08-14-desktop-host-env-and-home-adoption.zh.md)仍适用于 Host Executable 发现与环境隔离；代理变量现在属于产品显式持有的环境子集，不再继承 Shell 状态。

## Alternatives considered

**只为 Codex 增加代理字段。** 不采用，因为同一 Node 进程树还负责插件发现、安装、Harbor Helper 与其他 Provider。每个插件各自配置代理会产生冲突链路，并重复处理凭据。

**继承 Finder 或 Shell 环境。** 不采用，因为 Finder 不会可靠接收交互式 Shell 变量，环境值无法表达显式的直连选择，继承的凭据还可能泄漏给子进程。

**把 PAC 或自动发现结果转换成单个静态 URL。** 不采用，因为这些机制会按请求选择链路，并可能执行平台策略。只导出一个 URL 却声称支持会产生错误行为。

**持久化带认证信息的代理 URL。** 不采用，因为桌面设置文件、进程环境、诊断信息与子进程都不是 Credential Store。

## Consequences

一项可见设置会在重启后统一路由 Codex Auth、其他 Host 插件、Package 安装、Runtime 下载与签名更新。无需从 Terminal 启动 XiaoHui，也能采用当前机器的固定 macOS 代理；直连仍是明确且确定的状态。使用 PAC、自动发现、只有 HTTP 的代理或代理认证时，用户会收到具体失败并需要提供受支持的固定 Endpoint。WSL 使用的自定义 Endpoint 必须能从 WSL 网络命名空间访问。发布 Smoke 会执行受信任浏览器桥、可见的测试／保存／重启路径与完整 Host Dispatcher 激活；Rust 测试覆盖系统解析、配置校验、本地绕过与移除环境代理变量。
