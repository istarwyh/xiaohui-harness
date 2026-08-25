# XiaoHui Harness 0.2.5

## English

- Fixes desktop startup failing with `error: unknown option '--patch'` after the browser-suppression change in 0.2.4.
- Orders desktop Overlay and rescue `--patch` arguments before the Web command-line pass-through boundary, while retaining `--no-open`, loopback binding, notifications, and bundled product configuration.
- Adds a focused release gate that checks the DSH parser contract together with the native and WSL desktop launch vectors.
- Retains the Harbor 0.7.2 session-workspace fix, Codex Auth, Better Sidebar, Personal Workbench, frozen offline Node dependency store, and portable Harbor Python runtime from 0.2.4.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 修复 0.2.4 加入禁止打开外部浏览器后，桌面启动时报 `error: unknown option '--patch'` 的问题。
- 将桌面 Overlay 与 Rescue 的 `--patch` 参数放到 Web 命令行 Pass-through 边界之前，同时保留 `--no-open`、Loopback 绑定、通知与内置产品配置。
- 新增聚焦发布门禁，同时校验 DSH 参数解析契约以及原生、WSL 两条桌面启动参数向量。
- 保留 0.2.4 的 Harbor 0.7.2 会话工作区修复，以及 Codex Auth、Better Sidebar、Personal Workbench、冻结的离线 Node 依赖 Store 与便携式 Harbor Python Runtime。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
