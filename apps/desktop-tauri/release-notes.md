# XiaoHui Harness 0.2.11

## English

- Opens assistant Markdown `http://` and `https://` links in the operating system's default browser from the XiaoHui desktop chat.
- Adds a link context menu with **Open link** and **Copy link address**, and shows the normalized destination while hovering.
- Preserves Harness internal navigation and local references. External links pass a protocol and credential whitelist in both the WebView shell and native Tauri command; dangerous schemes such as `javascript:`, `file:`, and `data:` are rejected.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 支持在 XiaoHui 桌面聊天中点击助手回复里的 Markdown `http://` 和 `https://` 链接，并通过操作系统默认浏览器打开。
- 新增链接右键菜单，可选择「打开链接」或「复制链接地址」；鼠标悬停时会显示规范化后的目标地址。
- 保持 Harness 内部导航与本地引用不变。外链会在 WebView Shell 和 Tauri 原生命令两层执行协议与凭据白名单校验，拒绝 `javascript:`、`file:`、`data:` 等危险协议。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
