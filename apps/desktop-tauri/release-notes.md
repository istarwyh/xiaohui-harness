# XiaoHui Harness 0.2.10

## English

- Makes enterprise HTTPS interception work with trusted macOS certificates. Native reqwest clients use the macOS platform verifier, and every XiaoHui-managed Node process enables the system CA store through `--use-system-ca`.
- Reports the desktop-native and running Node Host connection outcomes separately, including bounded certificate codes such as `UNKNOWN_ISSUER` and `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, so one successful route cannot hide the other route's failure.
- Keeps certificate verification enabled and directs certificate failures to the enterprise root trust in macOS Keychain. The application-wide proxy continues to cover GPT OAuth providers, plugins, package installation, runtime provisioning, and signed updates after restart.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 支持使用 macOS 已信任证书的企业 HTTPS 拦截。原生 reqwest Client 使用 macOS 平台验证器，所有由 XiaoHui 管理的 Node 进程都会通过 `--use-system-ca` 启用系统 CA Store。
- 分别展示桌面原生链路与运行中 Node Host 的连接结果，包括 `UNKNOWN_ISSUER`、`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 等有界证书错误码，避免一条链路成功掩盖另一条链路失败。
- 保持证书校验开启，并在证书失败时提示检查 macOS Keychain 中的企业根证书信任。应用全局代理在重启后继续统一覆盖 GPT OAuth Provider、插件、Package 安装、Runtime 预配和签名更新。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
