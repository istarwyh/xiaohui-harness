# Agent Note: XiaoHui 应用全局网络代理

Status: implemented

[English](2026-08-30-xiaohui-global-network-proxy.md) | 中文

## Problem

从 macOS Finder 启动的应用不会继承用户交互式 Shell 中的代理变量。因此，即使 macOS 已经配置可用的系统代理，Codex Auth 等插件创建的 Node HTTP Client 仍可能直接连接。只修复一个插件还会让 Package 安装、Marketplace Metadata、Runtime 预配与应用更新使用不同链路。

## Decision

XiaoHui 原生桌面设置持有一项应用全局的 `direct`、`system` 或 `custom` 代理选择。默认使用直连，并从所有应用自有进程中移除大小写形式的继承代理变量。跟随系统模式执行固定的 `/usr/sbin/scutil --proxy` 命令，接受 macOS 固定的 HTTP 与 HTTPS Endpoint。自定义模式要求分别填写不含凭据的 HTTP 与 HTTPS URL，并接受以逗号分隔的绕过列表。所有模式都会把 `localhost`、`127.0.0.1` 与 `::1` 加入绕过列表，使 Tauri WebView 与私有 Host 保持 Loopback 直连。

原生启动链路会在 Runtime 预配前解析已保存的选择。解析结果用于配置 Rust HTTP Client、签名更新器、原生 Host 与插件子进程、Profile Repair 与 Package 安装、Toolchain 下载以及 WSL 命令。所有通过这项策略创建的原生 reqwest Client 都会让 rustls 使用平台证书验证器，使 macOS Keychain 的信任关系适用于企业代理拦截的 HTTPS。注入环境时会先移除原有代理值，再加入解析结果，显式启用 Node 的环境代理开关，并通过 `NODE_OPTIONS` 向所有应用自有 Node 进程加入 `--use-system-ca`。由于安装包内的 Node 22.19 Runtime 早于环境代理开关，DSH CLI 还会先物化分层环境并把 Undici 的 `EnvHttpProxyAgent` 安装成进程全局 Dispatcher，然后才导入 Profile Boot 与已配置插件。Dispatcher 由 CLI 进程入口持有，而不是由产品插件持有，因此 Provider 初始化顺序不会让 Host 全局 `fetch` 保留默认直连 Dispatcher。运行中的应用会保持这份不可变的解析结果；修改已保存的草稿不会拆分仍在运行的 Host 进程树，设置操作会在保存后重启 XiaoHui。

跟随系统模式拒绝 PAC、自动发现以及只有 HTTP 的 macOS 配置。PAC 求值不等同于导出静态 Node 代理变量，而只有 HTTP 的 macOS 配置会使 HTTPS Client 静默选择另一条链路。自定义代理 URL 拒绝嵌入凭据和非 HTTP Scheme，避免 Secret 进入明文桌面设置文件、进程参数或日志。需要认证的代理必须等待后续 Credential Store 集成，不能通过兼容回退实现。

Personal Workbench Client 会在通用设置中加入一张卡片，加载当前原生设置与检测到的 macOS Endpoint，然后通过 `https://chatgpt.com/` 分别测试桌面草稿链路与正在运行的 Node Host。Node Host 测试会先要求当前进程提供 CLI 已安装 Dispatcher 的证明，再使用固定的同源 JSON POST 与全局 `fetch`。两项探测都只返回是否成功、HTTP 状态、代理链路是否生效以及有界的 Transport 或证书错误码；设置卡会分别标注两个结果，包括 `UNKNOWN_ISSUER`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 等错误码，不会把任一失败替换成笼统的代理进程诊断。两项测试都不要求或传输 ChatGPT 凭据，也不会向浏览器返回代理 URL 或原始请求错误。证书失败会提示用户在 macOS Keychain 中信任企业根证书，并明确 XiaoHui 会保持证书校验开启。草稿与当前 Host 的代理状态不同时，结果会要求保存、重启并再次测试。独立的 `dsh web` 没有受信任的原生所有者，因此只显示禁用的控件。

Loopback Client 使用独立且带版本的消息 Channel，包含 `get`、`test` 与 `save` 三项 Action。Tauri Shell 要求消息来自精确的工作台 iframe Source 与 Host Origin，校验有界字段与已知 Key，把 Action 映射到三个字面量 Command，并只向该 Origin 回复。Rust 会在使用前执行同一套设置校验。浏览器不能提供 Command Name、Executable、Destination URL、系统命令或任意环境变量。

现有的 [XiaoHui 产品化 AI 工作台发行](2026-08-22-xiaohui-product-workbench.zh.md)继续负责产品打包与发布验收；本记录只负责应用全局路由策略。较早的[桌面端主机工具链扫描与主目录匹配](2026-08-14-desktop-host-env-and-home-adoption.zh.md)仍适用于 Host Executable 发现与环境隔离；代理变量现在属于产品显式持有的环境子集，不再继承 Shell 状态。

## Alternatives considered

**只为 Codex 增加代理字段。** 不采用，因为同一 Node 进程树还负责插件发现、安装、Harbor Helper 与其他 Provider。每个插件各自配置代理会产生冲突链路，并重复处理凭据。

**继承 Finder 或 Shell 环境。** 不采用，因为 Finder 不会可靠接收交互式 Shell 变量，环境值无法表达显式的直连选择，继承的凭据还可能泄漏给子进程。

**把 PAC 或自动发现结果转换成单个静态 URL。** 不采用，因为这些机制会按请求选择链路，并可能执行平台策略。只导出一个 URL 却声称支持会产生错误行为。

**持久化带认证信息的代理 URL。** 不采用，因为桌面设置文件、进程环境、诊断信息与子进程都不是 Credential Store。

**关闭 TLS 证书校验。** 不采用，因为这会使应用自有的所有 HTTPS 请求都可被任意拦截。企业 HTTPS 拦截必须由 macOS 已信任的根证书授权，或者通过 Node 标准的 `NODE_EXTRA_CA_CERTS` 机制显式提供证书。

## Consequences

一项可见设置会在重启后统一路由 Codex Auth、其他 Host 插件、Package 安装、Runtime 下载与签名更新。无需从 Terminal 启动 XiaoHui，也能采用当前机器的固定 macOS 代理与 Keychain 已信任的企业根证书；直连仍是明确且确定的状态。使用 PAC、自动发现、只有 HTTP 的代理、代理认证或不受信任的拦截证书时，用户会收到具体失败并需要修正对应的代理或信任设置。WSL 使用的自定义 Endpoint 必须能从 WSL 网络命名空间访问，而且 WSL 使用自己的系统信任，不会读取 macOS Keychain。真实 CLI Profile 回归要求全局 HTTP `fetch` 经过本地代理、观察 HTTPS `CONNECT`，并证明 `NO_PROXY` 绕过；发布 Smoke 会执行受信任浏览器桥、分别展示桌面与 Host 结果、证书指引、保存与重启路径。Rust 测试覆盖系统解析、配置校验、本地绕过、移除环境代理变量、平台验证器构造、Node 系统 CA 注入与有界证书错误码。
