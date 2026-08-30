# XiaoHui Harness 0.2.8

## English

- Adds an application-wide **Network proxy** card under General settings. XiaoHui can detect the fixed HTTP/HTTPS proxy configured by macOS, use credential-free custom HTTP/HTTPS endpoints, or force direct connections.
- Adds a ChatGPT connectivity test and saves the selected policy only after validation. Applying a different policy restarts XiaoHui so every application-owned process uses one fixed configuration.
- Applies the selected proxy to the private DSH Host and its Node HTTP clients, signed application updates, managed runtime downloads, profile repair, and plugin/package installation. Ambient proxy variables are removed in Direct mode, while loopback addresses always bypass the proxy.
- Rejects proxy URLs containing credentials and reports unsupported PAC, auto-discovery, or incomplete system proxy configurations instead of silently falling back to a different network path.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 在全局设置的「通用」页面加入「网络代理」。XiaoHui 可以自动读取 macOS 固定的 HTTP／HTTPS 系统代理，也可以使用不含认证信息的自定义 HTTP／HTTPS 地址，或强制直连。
- 新增 ChatGPT 连通性测试；代理配置校验通过后才会保存。切换策略会重启 XiaoHui，使应用拥有的所有进程在一个生命周期内使用同一份固定配置。
- 把所选代理应用到私有 DSH Host 及其 Node HTTP 客户端、签名应用更新、托管 Runtime 下载、Profile 修复和插件／依赖安装。直连模式会移除外部代理环境变量，本地回环地址始终绕过代理。
- 拒绝保存包含认证信息的代理 URL；遇到 PAC、自动发现或不完整的系统代理时会明确报错，不会静默切换到另一条网络路径。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
