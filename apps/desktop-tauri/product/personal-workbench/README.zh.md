# dsh-personal-workbench

[English](README.md) | 中文

这个第一方 XiaoHui Harness 产品插件负责两个通用设置卡片。用户可以在**设置 → 通用设置 → 我的工作台**中替换侧边栏工作台名称和 Logo、预览草稿并恢复 XiaoHui 默认值。点击**设置 → 通用设置 → 应用更新 → 检查并更新**会请求受信任的桌面 Shell 运行带签名的应用更新器。更新操作在独立的 `dsh web` 中保持可见但不可用，也不会在最终用户机器上刷新插件源码，因为内置产品插件会随带签名的应用 Release 一起升级。

设置保存在当前 DSH Profile 的 `personal-workbench` 命名空间：

```yaml
personal-workbench:
  enabled: true
  name: My Workbench
  logo: data:image/png;base64,...
```

浏览器会把上传图片保存为当前 Profile 中的 data URL。修改名称与 Logo 不会改变浏览器标题、可执行文件名、应用图标、主题或其他 UI 文案。

## 模型体验

无，因为本包只改变浏览器呈现，不会向模型请求添加内容。

#### KV Cache 影响

无；修改工作台身份不会组装或发送 provider 请求。

## 已知限制与暂缓事项

- **一个 Profile 只有一个自定义身份** —— 插件不会按 Workspace 或 Session 选择不同品牌。
- **只修改已声明的品牌 slot** —— 浏览器标题、桌面图标、主题、字体、壁纸和全局文案仍由原有界面负责。
- **应用更新仅限桌面端** —— 工作台 Client 可以请求固定的签名更新流程，但不能选择更新 URL、版本或 Tauri Command。
