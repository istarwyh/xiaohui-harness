# Agent Note: XiaoHui 快速发布流水线

Status: implemented

[English](2026-08-23-fast-xiaohui-release-pipeline.md) | 中文

## Problem

macOS 标签流水线会在变更已经通过针对性开发检查和 Pull Request 检查后，再次运行 Node、Python 与 Rust 测试套件。它还会构建两次 App Bundle，并把约一 GB 的发布资产从 macOS 构建 Job 经由 GitHub Artifact Storage 中转到独立的 Ubuntu 发布 Job。这些步骤延迟了日常产品交付，却没有增加对最终可下载产物的验证强度。

## Decision

格式严格为 `xiaohui-vX.Y.Z` 的 Tag 仍是唯一发布入口，流水线从该 Tag 构建 macOS arm64 产物。标签流水线保留版本与 Tag 一致性校验、冻结依赖安装、完整 Harness 构建、Tauri App 与 DMG 构建、Tauri Updater 签名、针对从更新归档解压出的 Runtime 的冒烟测试、SHA-256 校验、Updater Manifest 生成，以及向 GitHub Release 直接发布。

Node、Python 与 Rust 单元测试套件属于发布前职责，不再在标签流水线重复运行。Tauri App 只构建一次；DMG 基于该 App 封装，Updater 归档直接用于迁移后 Runtime 验证，因此删除第三次 App 重打包。Cargo Registry、Git、Fingerprint、Build Script 与依赖对象按 Rust Lockfile 缓存。绑定校验和的压缩离线 pnpm Store 则按冻结的产品 Lockfile 独立缓存；复用前会验证 Metadata 与归档 Digest，未命中时仍执行完整抓取和打包路径。发布直接在 macOS 构建 Job 中完成，大型 DMG 与 Updater 归档不再经过 Workflow Artifact Storage 往返传输。Release 上传使用 `--clobber`，因此同一 Tag 的重新运行具备幂等性。

## Alternatives considered

**在 Tag 上保留全部测试。** 这会提供最多的重复信号，但同一份源码已经在打 Tag 前完成检查，仍会额外增加数分钟。

**保留独立发布 Job。** 这样可以隔离发布权限并只重试发布阶段，但大型资产需要传输两次，常见的成功路径会更慢。

**直接提升此前构建的产物，不再重新构建。** 这是最快的 Tag 路径，但需要仓库目前还没有的、以提交 SHA 寻址且带证明的持久预构建流水线。

## Consequences

缓存命中时预计可在约六到八分钟完成发布，冷构建仍可能需要十到十二分钟。正确性会更明确地依赖打 Tag 前的针对性检查，而发布物专属校验仍保留在标签流水线。发布失败时需要重新运行构建，而不能只重试小型发布 Job；但同一不可变 Tag 的上传资产可以安全替换。Apple 代码签名与公证仍不属于本次优化范围。
