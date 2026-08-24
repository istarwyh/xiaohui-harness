//! Implant the desktop overlay plugin into `$DSH_HOME` without editing packages.

use std::fs;
use std::path::{Path, PathBuf};

use crate::product::ProductRuntime;
use crate::runtime::provision::RuntimePaths;

/// Absolute `--patch` file the Host should load.
pub struct OverlayPatch {
    pub patch_file: PathBuf,
}

/// Build a POSIX `file://` URL for a Linux overlay plugin path under `/home`.
///
/// Returns `Err` when `linux_path` is not absolute, not under `/home`, names a
/// Windows drive path (for example `/C:/plugin.mjs`), or contains `wsl.localhost`.
pub fn linux_plugin_file_url(linux_path: &str) -> Result<String, String> {
    if !linux_path.starts_with('/') {
        return Err(format!("Linux plugin path must be absolute: {linux_path}"));
    }
    if linux_path.contains("wsl.localhost") {
        return Err(format!(
            "Linux plugin path must not use wsl.localhost: {linux_path}"
        ));
    }
    if is_windows_drive_path(linux_path) {
        return Err(format!(
            "Linux plugin path must not be a Windows drive path: {linux_path}"
        ));
    }
    if !linux_path.starts_with("/home/") {
        return Err(format!(
            "Linux plugin path must be under /home: {linux_path}"
        ));
    }
    Ok(format!("file://{linux_path}"))
}

fn is_windows_drive_path(path: &str) -> bool {
    let Some(rest) = path.strip_prefix('/') else {
        return false;
    };
    let mut chars = rest.chars();
    matches!(
        (chars.next(), chars.next()),
        (Some(drive), Some(':')) if drive.is_ascii_alphabetic()
    )
}

/// Render the desktop-notification row used by every supported launch mode.
pub fn notification_overlay_yaml(plugin_url: &str) -> String {
    let plugin_url = serde_json::to_string(plugin_url).unwrap_or_else(|_| "\"\"".into());
    format!("- insert:\n    - id: dsh-desktop-notify\n      name: {plugin_url}\n")
}

/// Render the XiaoHui product and desktop-notification rows loaded after the web profile.
///
/// The configured project root backs the global Web Workbench. Agent Tool
/// calls resolve a separate request-local root from their calling session.
pub fn overlay_yaml(plugin_url: &str, product: &ProductRuntime) -> String {
    let project_root = serde_json::to_string(&product.project_root.display().to_string())
        .unwrap_or_else(|_| "\"\"".into());
    let harbor_bin = serde_json::to_string(&product.harbor_bin.display().to_string())
        .unwrap_or_else(|_| "\"\"".into());
    let harbor_dsh_bin = serde_json::to_string(&product.harbor_dsh_bin.display().to_string())
        .unwrap_or_else(|_| "\"\"".into());
    format!(
        "{}- id: web\n  config:\n    searchProvider: codex\n\n- id: harbor-evolution\n  config:\n    projectRoot: {project_root}\n    jobsDir: \"jobs\"\n    harborBin: {harbor_bin}\n    harborDshBin: {harbor_dsh_bin}\n    pythonPath: \"\"\n\n- insert:\n    - id: xiaohui-llm-codex-auth\n      name: dsh-codex-auth\n      disabled: !!js \"[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-codex-auth' && e.options.id !== 'xiaohui-llm-codex-auth' && !e.disabled)\"\n    - id: xiaohui-codex-search\n      name: dsh-codex-auth/search\n      disabled: !!js \"[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-codex-auth/search' && e.options.id !== 'xiaohui-codex-search' && !e.disabled)\"\n    - id: xiaohui-codex-image\n      name: dsh-codex-auth/image\n      disabled: !!js \"[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-codex-auth/image' && e.options.id !== 'xiaohui-codex-image' && !e.disabled)\"\n    - id: xiaohui-better-sidebar\n      name: dsh-better-sidebar\n      disabled: !!js \"[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-better-sidebar' && e.options.id !== 'xiaohui-better-sidebar' && !e.disabled)\"\n    - id: xiaohui-personal-workbench\n      name: dsh-personal-workbench\n      disabled: !!js \"[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-personal-workbench' && e.options.id !== 'xiaohui-personal-workbench' && !e.disabled)\"\n    - id: xiaohui-harbor-evolution\n      name: dsh-harbor-evolution\n      disabled: !!js \"[...ctx.loader.entries()].some((e) => e.options.name === 'dsh-harbor-evolution' && e.options.id !== 'xiaohui-harbor-evolution' && !e.disabled)\"\n      config:\n        projectRoot: {project_root}\n        jobsDir: \"jobs\"\n        harborBin: {harbor_bin}\n        harborDshBin: {harbor_dsh_bin}\n        pythonPath: \"\"\n",
        notification_overlay_yaml(plugin_url)
    )
}

/// Copy the overlay plugin into `dest_dir` and write a `--patch` list.
pub fn install_overlay_at(
    dest_dir: &Path,
    overlay_src: &Path,
    plugin_name_in_yaml: &str,
    product: &ProductRuntime,
) -> Result<OverlayPatch, String> {
    let plugin_src = overlay_src.join("index.mjs");
    if !plugin_src.is_file() {
        return Err(format!(
            "desktop overlay plugin missing: {}",
            plugin_src.display()
        ));
    }

    fs::create_dir_all(dest_dir).map_err(|e| format!("无法创建 {}: {e}", dest_dir.display()))?;
    let plugin_dest = dest_dir.join("index.mjs");
    fs::copy(&plugin_src, &plugin_dest).map_err(|e| {
        format!(
            "无法复制 {} -> {}: {e}",
            plugin_src.display(),
            plugin_dest.display()
        )
    })?;

    let patch_file = dest_dir.join("cordis.yml");
    fs::write(&patch_file, overlay_yaml(plugin_name_in_yaml, product))
        .map_err(|e| format!("无法写入 {}: {e}", patch_file.display()))?;

    Ok(OverlayPatch { patch_file })
}

/// Copy the overlay plugin into the selected home and write a `--patch` list.
pub fn install_overlay(
    paths: &RuntimePaths,
    overlay_src: &Path,
    notify_url: &str,
    product: &ProductRuntime,
) -> Result<OverlayPatch, String> {
    let dest_dir = paths.dsh_home.join("desktop-overlay");
    let plugin_src = overlay_src.join("index.mjs");
    if !plugin_src.is_file() {
        return Err(format!(
            "desktop overlay plugin missing: {}",
            plugin_src.display()
        ));
    }

    fs::create_dir_all(&dest_dir).map_err(|e| format!("无法创建 {}: {e}", dest_dir.display()))?;
    let plugin_dest = dest_dir.join("index.mjs");
    fs::copy(&plugin_src, &plugin_dest).map_err(|e| {
        format!(
            "无法复制 {} -> {}: {e}",
            plugin_src.display(),
            plugin_dest.display()
        )
    })?;

    let plugin_path = normalize_plugin_path(&plugin_dest)?;
    let _ = notify_url;
    install_overlay_at(&dest_dir, overlay_src, &plugin_path, product)
}

fn normalize_plugin_path(path: &Path) -> Result<String, String> {
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("无法解析 {}: {e}", path.display()))?;
    url::Url::from_file_path(&canonical)
        .map(|file_url| file_url.as_str().to_string())
        .map_err(|()| {
            format!(
                "plugin path is not a usable file URL: {}",
                canonical.display()
            )
        })
}

/// Resolve the overlay source shipped beside the desktop shell.
pub fn resolve_overlay_source(resource_dir: Option<&Path>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let bundled = dir.join("desktop-overlay");
        if bundled.join("index.mjs").is_file() {
            return bundled;
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("overlay")
        .join("desktop-notify")
}

#[cfg(test)]
mod tests {
    use super::{
        install_overlay, install_overlay_at, linux_plugin_file_url, normalize_plugin_path,
        overlay_yaml,
    };
    use crate::product::ProductRuntime;
    use crate::runtime::provision::RuntimePaths;
    use std::fs;

    fn product(root: &std::path::Path) -> ProductRuntime {
        ProductRuntime {
            project_root: root.join("workspace"),
            harbor_bin: root.join("runtime").join("harbor"),
            harbor_dsh_bin: root.join("runtime").join("harbor-dsh"),
            integration_version: "0.7.2".into(),
        }
    }

    #[test]
    fn linux_file_url_is_posix() {
        assert_eq!(
            linux_plugin_file_url("/home/u/.dsh/desktop-overlay/index.mjs").unwrap(),
            "file:///home/u/.dsh/desktop-overlay/index.mjs"
        );
    }

    #[test]
    fn linux_file_url_rejects_windows_drive_path() {
        assert!(linux_plugin_file_url("/C:/plugin.mjs").is_err());
    }

    #[test]
    fn linux_file_url_rejects_wsl_localhost() {
        assert!(linux_plugin_file_url("//wsl.localhost/Ubuntu/home/u/plugin.mjs").is_err());
    }

    #[test]
    fn install_overlay_at_writes_yaml_with_given_url() {
        let root =
            std::env::temp_dir().join(format!("dsh desktop overlay at {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src").join("index.mjs"),
            "export function apply() {}\n",
        )
        .unwrap();

        let dest_dir = root.join("desktop-overlay");
        let plugin_url = "file:///home/u/.dsh/desktop-overlay/index.mjs";
        let product = product(&root);
        let overlay =
            install_overlay_at(&dest_dir, &root.join("src"), plugin_url, &product).unwrap();
        let yaml = fs::read_to_string(&overlay.patch_file).unwrap();

        assert!(dest_dir.join("index.mjs").is_file());
        assert!(yaml.contains(plugin_url));
        assert!(!yaml.contains("file:///C:"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn overlay_yaml_names_linux_url() {
        let root = std::path::PathBuf::from("/tmp/xiaohui");
        let yaml = overlay_yaml(
            "file:///home/u/.dsh/desktop-overlay/index.mjs",
            &product(&root),
        );
        assert!(yaml.contains("file:///home/u/.dsh/desktop-overlay/index.mjs"));
        assert!(!yaml.contains("file:///C:"));
        assert!(yaml.contains("searchProvider: codex"));
        assert!(yaml.contains("id: xiaohui-llm-codex-auth"));
        assert!(yaml.contains("name: dsh-codex-auth/search"));
        assert!(yaml.contains("name: dsh-codex-auth/image"));
        assert!(yaml.contains("id: xiaohui-better-sidebar"));
        assert!(yaml.contains("name: dsh-better-sidebar"));
        assert!(yaml.contains("id: xiaohui-personal-workbench"));
        assert!(yaml.contains("name: dsh-personal-workbench"));
        assert!(yaml.contains("id: harbor-evolution"));
        assert!(yaml.contains("id: xiaohui-harbor-evolution"));
        assert!(yaml.contains("name: dsh-harbor-evolution"));
        assert!(yaml.contains("ctx.loader.entries()"));
        assert!(yaml.contains("projectRoot: \"/tmp/xiaohui/workspace\""));
    }

    #[test]
    fn writes_a_file_url_patch_row_that_node_esm_can_import() {
        let root = std::env::temp_dir().join(format!("dsh desktop overlay {}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(
            root.join("src").join("index.mjs"),
            "export function apply() {}\n",
        )
        .unwrap();

        let dsh_home = root.join("home");
        let paths = RuntimePaths {
            node_binary: root.join("node"),
            pnpm_binary: root.join("pnpm"),
            cli_entry: root.join("bin.js"),
            harness_root: root.clone(),
            runtime_root: root.join("runtime"),
            dsh_home: dsh_home.clone(),
        };

        let product = product(&root);
        let overlay = install_overlay(
            &paths,
            &root.join("src"),
            "http://127.0.0.1:9/notify",
            &product,
        )
        .unwrap();
        let yaml = fs::read_to_string(&overlay.patch_file).unwrap();
        let plugin = dsh_home.join("desktop-overlay").join("index.mjs");
        let plugin_url = normalize_plugin_path(&plugin).unwrap();
        assert!(plugin.is_file());
        assert!(plugin_url.starts_with("file://"), "{plugin_url}");
        assert!(plugin_url.contains("%20"), "{plugin_url}");
        assert!(!plugin_url.contains('\\'), "{plugin_url}");
        assert!(yaml.contains("id: dsh-desktop-notify"));
        assert!(yaml.contains("id: xiaohui-llm-codex-auth"));
        assert!(yaml.contains("id: xiaohui-codex-search"));
        assert!(yaml.contains("id: xiaohui-codex-image"));
        assert!(yaml.contains("id: xiaohui-better-sidebar"));
        assert!(yaml.contains("id: xiaohui-personal-workbench"));
        assert!(yaml.contains("id: harbor-evolution"));
        assert!(yaml.contains("id: xiaohui-harbor-evolution"));
        assert!(yaml.contains(&format!("name: \"{plugin_url}\"")), "{yaml}");
        let _ = fs::remove_dir_all(&root);
    }
}
