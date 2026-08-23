# dsh-personal-workbench

[English](README.md) | 中文

这个 XiaoHui Harness 产品插件允许用户在**设置 → 通用设置 → 我的工作台**中替换侧边栏工作台名称和 Logo。设置卡片会在应用前预览草稿。点击**恢复 XiaoHui 默认**会停用自定义 slot occupant，让宿主 shell 重新呈现自己的默认品牌。

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
