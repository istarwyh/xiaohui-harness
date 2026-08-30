# Agent Note: Fast XiaoHui release pipeline

Status: implemented

English | [中文](2026-08-23-fast-xiaohui-release-pipeline.zh.md)

## Problem

The macOS tag workflow repeated the Node, Python, and Rust test suites after the change had already passed focused development and pull-request checks. It also built the App bundle twice and relayed roughly one gigabyte of release assets from the macOS build job through GitHub artifact storage to a separate Ubuntu publish job. These steps delayed ordinary product delivery without increasing confidence in the exact downloadable artifact.

## Decision

An exact `xiaohui-vX.Y.Z` tag remains the only release trigger and builds the macOS arm64 artifact from that tag. A new tag also resolves DeepSeek Harness Releases using the committed `stable-else-rc` policy: the highest official stable version wins, or the highest RC when no stable version exists; alpha, beta, other prereleases, and the `master` branch are ineligible. The workflow requires the committed DSH version, tag, commit, and Git ancestry to match that selection. Manual dispatch can rebuild an existing immutable tag without applying today's freshness policy. The tag workflow keeps the version/tag consistency check, frozen dependency installation, full Harness build, Tauri App and DMG build, Tauri updater signing, a smoke test against the runtime extracted from the updater archive, SHA-256 verification, updater manifest generation, and direct GitHub Release publication.

Node, Python, and Rust unit suites are pre-release responsibilities and do not run again in the tag workflow. Local release preparation resolves the same DSH policy, verifies the selected tag commit, prepares an uncommitted upstream merge in a clean worktree, retargets approved product peer metadata, refreshes external products, and requires the assembled Host and Client compatibility smoke to pass. A later failure aborts the owned DSH merge and restores managed product inputs. The Tauri App is built once; the DMG is bundled from that App and the updater archive is used directly for relocated-runtime verification, removing the third App rebundle. Cargo registry, Git, fingerprints, build scripts, and dependency objects are cached by the Rust lockfile. The checksum-bound compressed offline pnpm Store is cached separately by its frozen product lockfile; its metadata and archive digest are verified before reuse, while a miss still performs the complete fetch and packaging path. Publishing happens in the macOS build job, so the large DMG and updater archive no longer make a round trip through workflow artifact storage. Release upload uses `--clobber`, making a rerun idempotent for an existing tag.

## Alternatives considered

**Keep every test on the tag.** This maximizes duplicated signal but adds several minutes after the same source has already been checked before tagging.

**Keep a separate publish job.** This isolates release permissions and permits publish-only retries, but transfers the large artifact set twice and makes the common successful path slower.

**Promote a previously built artifact without rebuilding.** This is the fastest tag path, but it requires a durable, SHA-addressed prebuild and attestation pipeline that the repository does not yet have.

**Follow the newest prerelease or `master`.** This minimizes delay between upstream development and XiaoHui adoption, but it makes alpha APIs and untagged changes ordinary release inputs. The stable-first, RC-fallback channel keeps a bounded preview path without adopting alpha or branch heads.

**Resolve and merge DSH inside the tag build.** This makes the build use the newest upstream at execution time, but the tag no longer identifies all source inputs and an old release cannot be rebuilt independently of later GitHub state. Release preparation owns mutation; tag CI only verifies a new tag and preserves old-tag rebuilds.

## Consequences

A warm release is expected to complete in roughly six to eight minutes, while a cold build may still take ten to twelve minutes. Correctness depends explicitly on focused checks and the reviewed DSH merge before the tag, while artifact-specific checks remain in the release workflow. A new official stable or RC Release makes a stale new tag fail instead of silently publishing an older DSH; an incompatible upstream candidate blocks preparation rather than falling back. A publication failure reruns the build instead of only a small release job, but uploaded assets can be replaced safely for the same immutable tag. Apple code signing and notarization remain outside this optimization.
