# Agent Note: Fast XiaoHui release pipeline

Status: implemented

English | [中文](2026-08-23-fast-xiaohui-release-pipeline.zh.md)

## Problem

The macOS tag workflow repeated the Node, Python, and Rust test suites after the change had already passed focused development and pull-request checks. It also built the App bundle twice and relayed roughly one gigabyte of release assets from the macOS build job through GitHub artifact storage to a separate Ubuntu publish job. These steps delayed ordinary product delivery without increasing confidence in the exact downloadable artifact.

## Decision

An exact `xiaohui-vX.Y.Z` tag remains the only release trigger and builds the macOS arm64 artifact from that tag. The tag workflow keeps the version/tag consistency check, frozen dependency installation, full Harness build, Tauri App and DMG build, Tauri updater signing, a smoke test against the runtime extracted from the updater archive, SHA-256 verification, updater manifest generation, and direct GitHub Release publication.

Node, Python, and Rust unit suites are pre-release responsibilities and do not run again in the tag workflow. The Tauri App is built once; the DMG is bundled from that App and the updater archive is used directly for relocated-runtime verification, removing the third App rebundle. Cargo registry, Git, fingerprints, build scripts, and dependency objects are cached by the Rust lockfile. The checksum-bound compressed offline pnpm Store is cached separately by its frozen product lockfile; its metadata and archive digest are verified before reuse, while a miss still performs the complete fetch and packaging path. Publishing happens in the macOS build job, so the large DMG and updater archive no longer make a round trip through workflow artifact storage. Release upload uses `--clobber`, making a rerun idempotent for an existing tag.

## Alternatives considered

**Keep every test on the tag.** This maximizes duplicated signal but adds several minutes after the same source has already been checked before tagging.

**Keep a separate publish job.** This isolates release permissions and permits publish-only retries, but transfers the large artifact set twice and makes the common successful path slower.

**Promote a previously built artifact without rebuilding.** This is the fastest tag path, but it requires a durable, SHA-addressed prebuild and attestation pipeline that the repository does not yet have.

## Consequences

A warm release is expected to complete in roughly six to eight minutes, while a cold build may still take ten to twelve minutes. Correctness now depends more explicitly on focused checks before the tag, while artifact-specific checks remain in the release workflow. A publication failure reruns the build instead of only a small release job, but uploaded assets can be replaced safely for the same immutable tag. Apple code signing and notarization remain outside this optimization.
