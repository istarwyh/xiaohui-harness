//! Mirror URLs and harness version for first-run provisioning.

/// Default Node LTS aligned with repo engines (`^22.19 || >=24`).
pub const DEFAULT_NODE_VERSION: &str = "22.19.0";

/// Lowest accepted Node 22 minor; matches workspace `engines.node`.
pub const MIN_NODE_MINOR_FOR_22: u64 = 19;

/// Major versions at or above this are accepted without a minor floor.
pub const MIN_UNRESTRICTED_NODE_MAJOR: u64 = 24;

/// pnpm version aligned with root packageManager.
pub const DEFAULT_PNPM_VERSION: &str = "11.7.0";

/// Host port range start for `dsh web`.
pub const DEFAULT_WEB_PORT: u16 = 17_890;

/// Bundled harness resource directory name inside Tauri resources.
pub const BUNDLED_HARNESS_DIR: &str = "harness-source";

/// Fixed first-run toolchain resource bundled beside the Harness source.
pub const BUNDLED_TOOLCHAIN_DIR: &str = "toolchain";

/// Production-only pnpm content-addressable store copied with each Harness tree.
pub const OFFLINE_PNPM_STORE_DIR: &str = ".xiaohui-pnpm-store";

/// Compressed production store shipped in the application resource.
pub const OFFLINE_PNPM_STORE_ARCHIVE: &str = "xiaohui-pnpm-store.tar.gz";

/// Pinned macOS arm64 Node archive and its official SHA-256 digest.
pub const BUNDLED_NODE_ARCHIVE: &str = "node-v22.19.0-darwin-arm64.tar.gz";
pub const BUNDLED_NODE_SHA256: &str =
    "c59006db713c770d6ec63ae16cb3edc11f49ee093b5c415d667bb4f436c6526d";

/// Pinned pnpm package and its registry SHA-512 digest (hex encoded).
pub const BUNDLED_PNPM_ARCHIVE: &str = "pnpm-11.7.0.tgz";
pub const BUNDLED_PNPM_SHA512: &str = "19cc852c120c7125760f2443ee6be0ca5b40f9f50598de1a09a1f177503e010e57c23c77646e01e761de59bf874fb22a3398c33ab9691fc13eb946b6f0f4d620";

/// Parent for bundle-specific writable harness trees under app data.
pub const HARNESS_VERSIONS_DIR: &str = "harness-versions";

/// China-friendly Node mirror (override with `DSH_NODE_MIRROR`).
pub fn node_mirror_base() -> String {
    std::env::var("DSH_NODE_MIRROR").unwrap_or_else(|_| "https://npmmirror.com/mirrors/node".into())
}

/// npm/pnpm registry (override with `DSH_NPM_REGISTRY`).
pub fn npm_registry() -> String {
    std::env::var("DSH_NPM_REGISTRY").unwrap_or_else(|_| "https://registry.npmmirror.com".into())
}

/// When set to `local`, use monorepo checkout instead of bundled tree.
pub fn dev_launch_mode() -> Option<String> {
    std::env::var("DSH_DESKTOP_LAUNCH").ok()
}
