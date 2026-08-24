# XiaoHui Harness 0.2.4

## English

- Updates the bundled Harbor integration to `dsh-harbor-evolution@0.7.2` and `harbor-dsh-evolution==0.7.2`.
- Resolves every Agent-facing Harbor Tool workspace from the calling session's absolute working directory. Concurrent sessions stay isolated, while the configured application-data workspace remains the Web Workbench fallback.
- Stops the desktop-managed Harness Host from opening `http://127.0.0.1:17890/` in the default browser. The Harness UI remains embedded in the XiaoHui window.
- Uses the Harness semantic button tokens for Personal Workbench primary actions, so disabled, normal, and hover colors remain readable in light and dark themes.
- Continues to bundle Codex Auth, Better Sidebar, the Personal Workbench plugin, the frozen offline Node dependency store, and the portable Harbor Python runtime in one macOS arm64 package.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 将内置 Harbor 集成升级到 `dsh-harbor-evolution@0.7.2` 与 `harbor-dsh-evolution==0.7.2`。
- 所有面向 Agent 的 Harbor Tool 都从调用会话的绝对工作目录解析工作区；并发会话彼此隔离，配置在应用数据目录中的工作区只保留为 Web Workbench 的回退路径。
- 桌面端托管的 Harness Host 不再额外用默认浏览器打开 `http://127.0.0.1:17890/`，Harness 界面仍然嵌入 XiaoHui 窗口。
- “我的工作台”主要操作按钮改用 Harness 语义化按钮 Token，禁用、正常和悬停状态在浅色与深色主题下都保持可读。
- macOS arm64 安装包继续一并内置 Codex Auth、Better Sidebar、Personal Workbench 插件、冻结的离线 Node 依赖 Store 和便携式 Harbor Python 运行时。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
