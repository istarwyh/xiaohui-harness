# Agent Note: XiaoHui 桌面外链

Status: implemented

[English](2026-09-02-xiaohui-desktop-external-links.md) | 中文

## 问题

共享 Markdown Renderer 会创建带新浏览上下文的安全 HTTP(S) Anchor，在普通浏览器中可以正常工作。XiaoHui 把同一个 Client 嵌入跨 Origin 的 Tauri iframe；此时新的 WebView 窗口不是用户的系统浏览器，也可能完全无法打开。如果把 iframe 中的所有导航都当作外链，还会破坏 Host 路由与本地文件交互。

## 决策

第一方 Personal Workbench Client 负责桌面外链呈现。它只识别带 `target="_blank"` 与 `rel="noopener"` 标记的 Anchor，并要求目标是绝对、不含凭据的 HTTP 或 HTTPS URL，且与当前 Host 不同源。主键点击会通过专用的版本化父级消息通道发送规范化后的 URL。悬停会把 URL 加入 Anchor Title，自定义右键菜单提供“打开链接”和“复制链接地址”。独立 `dsh web` 不启用这项行为。

Tauri Shell 只接受当前 Host iframe 从其精确 Origin 发出的完整固定请求字段。它会独立检查请求 ID、URL 长度上限、HTTP(S) 协议、Host 以及不存在凭据，再调用字面量 `open_external_url` Command。Rust 会重复 URL 检查，并委托给 Tauri 的跨平台 Opener。Client 不能选择 Command 或可执行文件；`javascript:`、`file:`、`data:`、`mailto:`、相对、同源、下载以及含凭据的链接都不会进入原生 Command。

现有 Marketplace 通道保持独立且更加严格，因为它只接受 GitHub 仓库与 npm 目标。通用助手链接不会扩大与安装相关的协议权限。

## 考虑过的替代方案

**依赖 WebView 的 `_blank` 行为。** 未采用，因为内嵌 Tauri WebView 不会可靠地把新浏览上下文交给系统浏览器，而这正是本决策需要修复的缺陷。

**直接向 Host iframe 暴露 Tauri JavaScript Opener。** 未采用，因为跨 Origin 应用 Client 不应获得通用原生能力。父级 Shell 与 Rust Command 会把 Command 选择和 URL 验证留在 Host Document 之外。

**把每个 HTTP(S) Anchor 都当作外链。** 未采用，因为同源应用路由以及不带共享 Renderer 安全新上下文标记的 Anchor 必须保留既有导航行为。

## 结果

安全的助手 Markdown 链接会通过 Tauri 支持的 Opener，在 macOS、Windows 与 Linux 上使用操作系统默认浏览器打开。用户可以通过右键菜单打开或复制目标地址，悬停可查看规范化后的 URL。内部路由与本地链接保留既有行为。浏览器桥接测试与 Rust 测试覆盖关联消息和被拒绝的协议；完整产品 Smoke 会通过真实跨 Origin Shell 验收悬停、右键复制与字面量原生打开 Command。
