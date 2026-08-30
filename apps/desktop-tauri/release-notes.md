# XiaoHui Harness 0.2.7

## English

- Adds the Plugin Marketplace to Settings with repository-linked npm verification, explicit install confirmation, package-specific failure details, and restricted GitHub/npm links that open in the system browser.
- Adds a global **Application lifecycle** section with signed update checks and a one-click XiaoHui restart so newly installed plugins can be loaded without using the terminal.
- Bundles Context Doctor for read-only context-injection audits and upgrades DSH to `0.1.1-rc.2`, including reusable DeepSeek Files API image uploads plus model-aware image resizing and format conversion.
- Upgrades the bundled JavaScript Plugin and Python Adapter to Harbor Evolution `0.8.1`, adding the preview-confirm-run Historical Session evaluation workflow while preserving the existing Candidate evolution path.
- Adds reproducible local release preparation that refreshes reviewed DSH and product sources, regenerates the frozen offline lock and Store, rejects duplicate runtimes, and runs the assembled Host, Marketplace, Context Doctor, Harbor, and desktop lifecycle smoke before a tag can be published.

The application is not yet signed or notarized with an Apple Developer identity.

## 中文

- 在设置中加入插件市场：通过关联仓库校验 npm 包，安装前明确确认，保留单包失败详情，并通过受限桌面桥在系统浏览器打开 GitHub／npm 链接。
- 在全局设置加入「应用生命周期」，支持检查签名更新和一键重启 XiaoHui，让新安装插件无需终端命令即可加载。
- 预置 Context Doctor 进行只读上下文注入审计，并把 DSH 升级到 `0.1.1-rc.2`，支持复用 DeepSeek Files API 图像上传，以及按模型要求自动缩放和转换图像格式。
- 把内置 JavaScript Plugin 和 Python Adapter 升级到 Harbor Evolution `0.8.1`，新增先预览、再确认、后运行的历史 Session 评测流程，同时保留既有 Candidate 演进路径。
- 新增可复现的本地发布准备：刷新经审核的 DSH 与产品来源，重建冻结离线锁和 Store，拒绝重复 Runtime，并在发布 Tag 前验收 assembled Host、Marketplace、Context Doctor、Harbor 与桌面生命周期流程。

当前应用尚未使用 Apple Developer 身份完成代码签名与公证。
