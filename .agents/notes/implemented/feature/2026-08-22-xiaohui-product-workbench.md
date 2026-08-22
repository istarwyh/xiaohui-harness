# Agent Note: XiaoHui product workbench distribution

Status: implemented

English | [中文](2026-08-22-xiaohui-product-workbench.zh.md)

## Problem

Installing a domain plugin after installing a generic Harness desktop still asks the user to understand profiles, package registries, Python environments, Skills, and adapter paths. The Harbor integration also spans a Cordis bundle and a Python runtime, so distributing only its npm package leaves a partially configured product. Reusing `~/.dsh` lowers migration cost for the generic desktop but lets a branded workbench modify another Harness installation's profiles and sessions.

## Decision

XiaoHui Harness is a product fork of the Sakana Tauri distribution with the upstream Git history retained. The reusable desktop supervision, first-run Harness provisioning, notification overlay, and updater remain in `apps/desktop-tauri`; product assembly stays in that subtree and does not change the Agent Loop or Service packages.

The committed `apps/desktop-tauri/product/harbor-evolution` snapshot contains `dsh-harbor-evolution@0.6.0` and its `evolve-agent-with-harbor` Skill. The sibling `product/harbor-python` snapshot contains the matching Python adapter source. `bundle-harness-source.mjs` copies the Cordis snapshot into the trimmed workspace and adds it to the bundled CLI dependency closure. The desktop overlay inserts the `harbor-evolution` Cordis row after the Web profile, so first launch never downloads or manually installs the product plugin.

`prepare-xiaohui-runtime.mjs` builds a macOS arm64 resource with portable CPython 3.12, the committed `harbor-dsh-evolution==0.6.0` source, and Harbor. The generated virtual environment uses only relative interpreter links, runs directly from application resources, and is invalidated by a source-tree digest. The script accepts `XIAOHUI_HARBOR_PYTHON_SOURCE` as a temporary override. `sync-product-plugin.mjs` refreshes both committed snapshots from a local Harbor checkout through explicit allowlists.

The native Host always uses `XiaoHui Harness/dsh-home` under platform application data and creates `XiaoHui Harness/workspace/jobs`; it does not adopt or import `DSH_HOME` or `~/.dsh`. This product override supersedes home adoption in [desktop host environment and home adoption](2026-08-14-desktop-host-env-and-home-adoption.md) for XiaoHui's native launch while retaining native host Node discovery and replacing global pnpm reuse with a product-managed copy. The product overlay extends [desktop shell overlay plugins](../architecture/2026-08-14-desktop-shell-overlay-plugins.md) with the required Harbor row; a missing product runtime is a boot failure, while notification delivery remains optional.

The native provisioner reuses Node only when its version and `process.platform:process.arch` match the product target. It never adopts a global pnpm; it provisions the pinned product copy so wrappers and native packages installed by another Node architecture cannot enter the first-launch dependency graph.

The release target is `aarch64-apple-darwin` only. An `xiaohui-v*` tag builds and signs the App/updater, bundles the DMG independently, then restores and re-signs the App/updater before publishing the arm64 asset set. This product-specific release set supersedes the platform matrix in [cross-platform desktop source provisioning](2026-08-14-cross-platform-desktop-source-provisioning.md); the underlying provisioning code remains available for future targets. Apple code signing and notarization remain separate credentials from the XiaoHui-specific Tauri updater signature.

## Alternatives considered

**Distribute only the plugin.** Rejected because users would still install and reconcile the npm bundle, Skill, Python Adapter, interpreter, and paths, which is the product burden this distribution removes.

**Build a new desktop shell.** Rejected because the Sakana shell already owns first-run provisioning, process-tree teardown, startup recovery, tray behavior, notifications, and signed updates. Reimplementation would create a second lifecycle system without adding product value.

**Download Harbor components on first launch.** Rejected because it makes product availability depend on npm, PyPI, `uv`, and interpreter installation after the user has already downloaded the application. Harness production dependencies may still require first-run network access, but XiaoHui's domain capability is a fixed installer resource.

**Adopt the user's existing Harness home.** Rejected because a product application must not silently add its bundle or configuration to a separately managed Harness environment. Users can export data explicitly when a migration workflow exists.

**Keep the full upstream platform matrix.** Rejected for the first product release because the Harbor runtime resource is platform-specific and the requested delivery target is macOS arm64. Additional targets require their own portable runtime and acceptance path.

## Consequences

Installing one DMG yields a named AI workbench whose Harbor plugin, Skill, and Python commands are already aligned at version `0.6.0`. Developers refresh the product snapshots explicitly and can reproduce a release from committed plugin code plus registry-resolved Python dependencies. Acceptance on macOS arm64 verified managed Node 22.19.0, managed pnpm 11.7.0, HTTP 200 startup, the Harbor client module in the Web boot manifest, Harbor 0.21.0, and Python plugin discovery. The installer is larger because it carries CPython and Harbor, first launch still installs Harness Node dependencies, Harbor Jobs still require Docker, and an unsigned or unnotarized DMG requires manual Gatekeeper approval until Apple release credentials are configured.
