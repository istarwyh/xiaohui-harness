# Agent Note: Desktop Host 不打开默认浏览器

Status: implemented

[English](2026-08-24-desktop-host-does-not-open-default-browser.md) | 中文

## Problem

XiaoHui 桌面壳会启动一个私有 `dsh web` Host，并在 Tauri WebView 内加载它的 Loopback URL。启动器传入了绑定地址与端口，却保留了 CLI 本地启动时用操作系统浏览器打开同一 URL 的默认行为。因此每次启动桌面应用都会额外创建一个无关浏览器标签页，尽管应用本身已经拥有可见界面。

Loopback Server 并非多余组件：嵌入式 WebView 依靠它获取 Host API 与 Web 资源。多余的只有浏览器交接动作。

## Decision

所有由桌面端持有的 Host 启动都会传入 `--no-open`。原生 macOS／Windows 命令构造器和 WSL 命令构造器都会把启动器拥有的全部 `--patch` 参数放在 `--no-open` 和其他 Web 应用参数之前，因为 DSH CLI 从第一个应用参数开始会把余下 Token 全部交给 Web 命令行 Provider。Host 启动、健康检查、Loopback 绑定、Tauri WebView 导航、通知 Overlay 与 Rescue Patch 均保持不变。

## Testing

原生命令参数测试固定完整启动向量，包括位于 `--no-open` 前的两层 Patch、Loopback Host 与端口。WSL 参数测试固定 Linux CLI 入口之后的对应命令。DSH 参数解析器测试会执行完整桌面参数后缀，并约束这项顺序所依赖的 Pass-through 规则。macOS 发布流水线会在编译 Release 应用后运行这些聚焦解析器与桌面参数向量测试，而不会恢复无关的完整测试矩阵。`cargo fmt --check` 验证修改后的 Rust 源码。

## Alternatives considered

**移除 Loopback Host。** 放弃，因为 Tauri WebView 依赖该 Server 提供应用 UI 与 Host API；移除它会删掉整个工作台，而非只去掉多余浏览器标签页。

**在桌面 Overlay 中配置 `openBrowser: false`。** 放弃，因为后置的条目级 `config` Patch 会整体替换 Web Runtime 配置，可能丢失 Trusted Host 等注入的启动值。文档化的 CLI Flag 只影响本次调用，并能保持现有组合。

**浏览器打开后再关闭标签页。** 放弃，因为此时已经打扰用户浏览器，桌面端也无法可靠识别新标签页，而且这会赋予桌面壳不必要的浏览器控制能力。

## Consequences

启动 XiaoHui 时仍会绑定一个私有 `127.0.0.1` URL，并在桌面窗口内显示它，但不再额外打开浏览器标签页。开发者在桌面应用之外主动运行 `dsh web` 时仍保留现有的默认浏览器行为，除非自行传入 `--no-open`。
