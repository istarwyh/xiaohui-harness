# dsh-personal-workbench

[English](README.md) | 中文

这个第一方 XiaoHui Harness 产品插件负责三个通用设置卡片。用户可以在**设置 → 通用设置 → 我的工作台**中替换侧边栏工作台名称和 Logo、预览草稿并恢复 XiaoHui 默认值。**设置 → 通用设置 → 网络代理**用于配置应用全局的直连、跟随 macOS 系统代理或自定义代理策略，通过 ChatGPT 测试所选链路，并在保存后重启 XiaoHui。**设置 → 通用设置 → 应用生命周期**会请求受信任的桌面 Shell 运行带签名的应用更新器，或在停止私有 Host 后重启整个应用。重启会加载通过 Plugin Marketplace 安装的插件。桌面操作在独立的 `dsh web` 中保持可见但不可用；浏览器请求不能选择任意 Tauri Command，代理配置不接受凭据，更新操作也不会在最终用户机器上刷新插件源码，因为内置产品插件会随带签名的应用 Release 一起升级。

工作台身份保存在当前 DSH Profile 的 `personal-workbench` 命名空间：

```yaml
personal-workbench:
  enabled: true
  name: My Workbench
  logo: data:image/png;base64,...
```

浏览器会把上传图片保存为当前 Profile 中的 data URL。修改名称与 Logo 不会改变浏览器标题、可执行文件名、应用图标、主题或其他 UI 文案。

网络代理保存在 XiaoHui 原生桌面设置中，不属于 DSH Profile。直连模式会从应用进程树中移除继承的代理变量。跟随系统模式通过 `/usr/sbin/scutil` 读取 macOS 固定的 HTTP 与 HTTPS 代理 Endpoint；PAC、自动发现与只有 HTTP 的配置会被拒绝，因为把这些设置转换给 Node 子进程后无法保持相同的路由语义。自定义模式要求分别填写不含凭据的 HTTP 与 HTTPS URL，并可补充绕过主机；XiaoHui 始终绕过自己的 Loopback Host。第一方 Host Entry 会在所选链路使用代理时安装 Undici 环境代理 Dispatcher，使内置 Node 22.19 Host 的全局 `fetch` 路由不依赖后续 Node Flag 或外部插件。所选策略会在用户确认的应用重启后生效，统一覆盖私有 Host、插件子进程、Profile 安装、Runtime 预配与签名应用更新。

## 模型体验

无，因为本包只改变浏览器呈现，不会向模型请求添加内容。

#### KV Cache 影响

无；修改工作台身份不会组装或发送 provider 请求。

## 已知限制与暂缓事项

- **一个 Profile 只有一个自定义身份** —— 插件不会按 Workspace 或 Session 选择不同品牌。
- **只修改已声明的品牌 slot** —— 浏览器标题、桌面图标、主题、字体、壁纸和全局文案仍由原有界面负责。
- **不存储代理认证信息，也不执行 PAC** —— 请使用应用进程可以访问且不含凭据的固定 Endpoint；WSL 目标还必须能从 WSL 网络命名空间访问。
- **代理变更以重启为生效点** —— “测试连接”使用当前草稿，已经运行的 Host 与更新器仍保留上次激活的策略，直到应用完成重启。
- **应用生命周期操作仅限桌面端** —— 工作台 Client 只能请求固定的签名更新与重启流程；Shell 只接受当前 Host iframe 从其精确 Origin 发出的请求。
