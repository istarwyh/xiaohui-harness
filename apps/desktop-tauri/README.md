# XiaoHui Harness Desktop

English | [中文](README.zh.md)

This Tauri application embeds the existing `dsh web` client and adds the XiaoHui product assembly. The installer carries the trimmed Harness source, Harbor Evolution and its Skill, Codex Auth, Better Sidebar, Context Doctor, Personal Workbench branding, portable CPython 3.12, and the Harbor adapter.

## Runtime layout

| Resource | Runtime behavior |
|---|---|
| `harness-source` | Carries the built source, frozen lockfile, and one compressed offline pnpm store; copied to a content-hashed application-data directory |
| `toolchain` | Checksum-pinned macOS arm64 Node 22.19.0 and pnpm 11.7.0 archives used when no compatible Host Node exists |
| `xiaohui-runtime` | Executed from the signed application resources; supplies `harbor` and `harbor-dsh` |
| `desktop-overlay` | Registers notifications, Codex Auth/Search/Image, Better Sidebar, Context Doctor, Personal Workbench, and Harbor Evolution through `dsh web --patch` |
| `XiaoHui Harness/dsh-home` | Isolated sessions, settings, credentials, and web profile |
| `XiaoHui Harness/workspace` | Fallback Harbor Workbench root when no standard profile instance is active |

The product sources live in `product/harbor-evolution`, `product/harbor-python`, `product/dsh-codex-auth`, `product/dsh-better-sidebar`, `product/context-doctor`, and `product/personal-workbench`. `scripts/bundle-harness-source.mjs` places the five Cordis packages and Harbor Skill in the trimmed workspace and adds them to the CLI dependency closure, so the Host resolves the plugin code without a registry install. Codex Auth and Better Sidebar are pinned to reviewed npm tarballs. Harbor's JavaScript and Python snapshots come from one reviewed GitHub Release, while Context Doctor has no npm release and is pinned to a reviewed GitHub `main` commit. Each externally refreshed snapshot records its immutable source, integrity hash, committed tree hash, upstream license, and any reviewed exact-version peer-metadata override in `XIAOHUI_UPSTREAM.json`. `scripts/prepare-xiaohui-runtime.mjs` installs the committed Python snapshot into a relocatable resource and accepts `XIAOHUI_HARBOR_PYTHON_SOURCE` for temporary local adapter testing.

Every Agent-facing Harbor Tool resolves its root from the calling session's absolute working directory. Selecting `/Users/me/project` in a XiaoHui session therefore keeps initialization and later Agent-created Harbor artifacts inside that project. The desktop overlay's configured application-data `projectRoot` remains only the global Web Workbench and non-Agent fallback; Agent Tools neither use it nor reject a session because it differs.

Harbor resolves and freezes the Candidate model through the Host `agentDefaultModel` and LLM services before it starts a Job. A loopback-only Host broker then exposes that exact route to the Docker task through a random Job-scoped URL and bearer capability. The Python adapter performs an in-container health check before installing or starting the Candidate, generates an ephemeral Cordis overlay under `.harbor-runtime`, and replaces only the Candidate ACP model route with `xiaohui-host/<frozen-model>`. The original Candidate remains immutable, and the Codex OAuth credential never enters its files, configuration, or container environment. The model binding is part of Evaluation Context v2, so a different provider, model, reasoning effort, transport, or protocol cannot reuse an old comparison baseline.

Host Node reuse requires both the supported version and the native CPU architecture. Global pnpm installations are never adopted; XiaoHui provisions its own pinned pnpm to avoid wrappers and native packages installed by a Node build for another architecture. On a cold start, every archive digest is checked, the dependency store is expanded, and `pnpm install --prod --frozen-lockfile --offline` reconstructs `node_modules`; the temporary expanded store and copied archive are removed after success. The 35,000-file Store is compressed to one application resource to reduce the installed app and avoid platform-link failures during Tauri packaging. The macOS build runs App/updater, DMG, and App/updater bundling as separate stages so Finder DMG decoration cannot discard the signed updater artifacts.

The application prepends its private `dsh`, Node, and pnpm shims only to the Host process tree. It does not overwrite a user's global `dsh` command or shell profile unless a developer explicitly launches it with `XIAOHUI_PERSIST_DSH_CLI=1`. Product plugin overlays reuse an active standard Profile Bundle by package name and enable a uniquely named in-box fallback only when no prior mount exists, so a user-installed Harbor, Codex Auth, Better Sidebar, Context Doctor, or Personal Workbench bundle does not create a duplicate Loader ID. During an upgrade, the native boot path also rebinds only XiaoHui-managed `link:` dependencies that still point into this application's older content-addressed Harness trees and runs the standard Profile install; registry dependencies and links outside the XiaoHui application-data tree remain user-owned and unchanged.

The desktop shell launches its private Host with `dsh web --no-open`. The loopback URL remains the internal transport loaded by the Tauri WebView, but startup never hands that URL to the operating system's default browser.

Release builds read the semantic application version embedded by Tauri and run one signed update check at a time after the main window opens. The stable `xiaohui-updater` manifest must advertise a higher version before XiaoHui downloads anything; the check has a 15-second deadline, while a failure leaves the running workbench unchanged. The tray shows the current version and supports a manual check. **Settings → General → Application updates → Check and update** exposes the same signed flow in the workbench. The loopback Client can send only a fixed versioned request; the Tauri shell accepts it only from the active workbench iframe at the exact Host origin. When an update is available, XiaoHui announces the current and target versions, lets Tauri verify and install the signed artifact, stops the private Host, and restarts the application. This user action never runs local release preparation or downloads plugin source: bundled product plugins advance only as part of the signed XiaoHui release.

The desktop overlay injects a Content Security Policy and no-referrer policy into the served workbench. The Tauri-owned splash and shell also have a CSP; the workbench keeps `unsafe-eval` because Cordis client plugins are evaluated dynamically, while objects and base-URL mutation remain disabled.

## Local release preparation

Run the networked product refresh explicitly before reviewing and committing a release input:

```sh
pnpm --dir apps/desktop-tauri run prepare:release
```

The refresh policy queries npm's latest stable versions for Codex Auth and Better Sidebar, the latest stable Harbor GitHub Release for the paired Cordis plugin and Python adapter, and the Context Doctor `main` head. Personal Workbench is first-party and is not refreshed. GitHub API reads prefer `GITHUB_TOKEN` or `GH_TOKEN`, then reuse an existing `gh auth` login when available; the credential is never written to provenance. The command does not search backward for an older compatible release: an incompatible latest candidate fails so its policy or code can be reviewed. A peer-metadata override is accepted only when `product/plugin-update-policy.json` names the exact upstream version.

The policy is validated before any managed path is copied or removed: destinations must remain under `product/`, source paths must remain under the downloaded checkout, and managed paths must be unique and non-overlapping. All archives use HTTPS, compressed and expanded byte limits, entry-count limits, and safe extraction; npm artifacts must match the registry SRI, and every archive receives digest-bound provenance. Candidates remain in staging until the complete set passes package identity, managed Node, DSH peer, bundle patch, Host entry, Client entry and injection, license, and tree checks. The command then replaces the managed snapshots as one operation, rebuilds Harness with the same explicit Client environment as tagged CI, regenerates `product/harness-pnpm-lock.yaml`, and proves every product DSH/Cordis peer in both the lockfile and installed tree points to the bundled workspace instead of a second runtime. It prepares the digest-bound offline Store and performs the real `--prod --frozen-lockfile --offline` install. The Harbor commands and assembled Host run with a credential-scrubbed environment plus temporary home, DSH, and temporary directories. Headless Chromium must receive all five product Client bundles, activate every Client Loader entry without page or console errors, mount the workbench, and expose the Application updates control; the same smoke requests the Context Doctor API and requires the Host to shut down normally. A failure at any later stage restores every managed snapshot and the product lockfile.

Managed product paths must be clean by default. `pnpm --dir apps/desktop-tauri run prepare:release -- --allow-dirty` is an explicit escape when the developer has already reviewed the local edits that the transaction will preserve or replace. A successful run leaves the refreshed snapshots and lockfile for human review and commit; each `XIAOHUI_UPSTREAM.json` records the exact external revision plus archive and tree hashes, while the generated `.bundle-manifest.json` records the selected package versions and whole-bundle hash.

Tagged CI and ordinary `prepare:dist` or `build` commands do not refresh upstream channels. They consume only the committed product snapshots and frozen lockfile, so a tag rebuild is independent of later npm or GitHub changes.

## Commands

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm --dir apps/desktop-tauri run test:bundle
pnpm --dir apps/desktop-tauri run test:offline
pnpm --dir apps/desktop-tauri run test:overlay
pnpm --dir apps/desktop-tauri run test:update-manifest
pnpm --dir apps/desktop-tauri run test:release-version
pnpm --dir apps/desktop-tauri run prepare:release
pnpm --dir apps/desktop-tauri run prepare:product-runtime
pnpm --dir apps/desktop-tauri run build
```

The current target is `aarch64-apple-darwin`; the release workflow intentionally has no Windows, Intel macOS, or Linux matrix rows.

The macOS arm64 release gate verifies the tag against every desktop version source, builds the committed Harness and signed-update artifacts without querying plugin update channels, and runs a focused Host startup-argument contract across the DSH parser plus native and WSL desktop launchers. It then relocates the portable runtime out of the application bundle, breaks the original Python-home reference deliberately, and requires both `harbor --version` and `harbor-dsh --help` to succeed before checksumming and publishing the artifacts. The gate stays intentionally narrower than the repository's full test matrix so a desktop patch release does not wait on unrelated platforms or packages.
