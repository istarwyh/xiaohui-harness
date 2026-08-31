# XiaoHui Harness 0.2.9

## English

- Fixes the Node Host proxy path used by GPT OAuth Agent requests. The DSH CLI now installs Undici's environment-proxy Dispatcher before loading the Profile, Host, or configured plugins, including with the bundled Node 22.19 runtime.
- Extends **Test ChatGPT connection** to check the desktop draft and the running Node Host independently. The Host test fails explicitly when the CLI Dispatcher is missing and reports only bounded HTTP or transport status without proxy URLs, credentials, or OAuth data.
- Adds real CLI regressions for HTTP proxy routing, HTTPS `CONNECT`, and `NO_PROXY`, and keeps the signed updater, runtime provisioning, profile repair, and package installation on the existing application-wide proxy policy.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 修复 GPT OAuth Agent 请求使用的 Node Host 代理链路。DSH CLI 现在会在加载 Profile、Host 或已配置插件前安装 Undici 环境代理 Dispatcher，该行为也覆盖内置 Node 22.19 Runtime。
- 扩展「测试 ChatGPT 连接」，分别检查桌面草稿链路与正在运行的 Node Host。CLI Dispatcher 缺失时，Host 测试会明确失败；诊断只返回有界的 HTTP 或 Transport 状态，不包含代理 URL、认证信息或 OAuth 数据。
- 新增真实 CLI 回归，覆盖 HTTP 代理路由、HTTPS `CONNECT` 与 `NO_PROXY`；签名更新、Runtime 预配、Profile 修复和依赖安装继续使用既有的应用全局代理策略。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
