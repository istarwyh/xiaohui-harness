//! Resolve the product-owned Harbor runtime and workspace bundled with XiaoHui.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::runtime::app_data_root;

/// Tauri resource directory containing portable CPython and Harbor.
pub const PRODUCT_RUNTIME_RESOURCE: &str = "xiaohui-runtime";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProductManifest {
    platform: String,
    arch: String,
    integration_version: String,
    harbor_bin: String,
    harbor_dsh_bin: String,
}

/// Absolute paths injected into the product's Harbor Cordis plugin row.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProductRuntime {
    pub project_root: PathBuf,
    pub harbor_bin: PathBuf,
    pub harbor_dsh_bin: PathBuf,
    pub integration_version: String,
}

/// Resolve the bundled macOS arm64 runtime and create XiaoHui's workspace.
pub fn resolve(resource_dir: Option<&Path>) -> Result<ProductRuntime, String> {
    let root = resolve_source(resource_dir);
    let manifest_path = root.join("manifest.json");
    let raw = fs::read_to_string(&manifest_path).map_err(|e| {
        format!(
            "XiaoHui runtime manifest missing at {}: {e}",
            manifest_path.display()
        )
    })?;
    let manifest: ProductManifest = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "XiaoHui runtime manifest invalid at {}: {e}",
            manifest_path.display()
        )
    })?;

    if manifest.platform != "darwin" || manifest.arch != "arm64" {
        return Err(format!(
            "XiaoHui runtime targets darwin-arm64, found {}-{}",
            manifest.platform, manifest.arch
        ));
    }

    let harbor_bin = root.join(&manifest.harbor_bin);
    let harbor_dsh_bin = root.join(&manifest.harbor_dsh_bin);
    for executable in [&harbor_bin, &harbor_dsh_bin] {
        if !executable.is_file() {
            return Err(format!(
                "XiaoHui bundled executable missing: {}",
                executable.display()
            ));
        }
    }

    let project_root = app_data_root()?.join("workspace");
    fs::create_dir_all(project_root.join("jobs")).map_err(|e| {
        format!(
            "cannot create XiaoHui workspace {}: {e}",
            project_root.display()
        )
    })?;

    Ok(ProductRuntime {
        project_root,
        harbor_bin,
        harbor_dsh_bin,
        integration_version: manifest.integration_version,
    })
}

fn resolve_source(resource_dir: Option<&Path>) -> PathBuf {
    if let Some(dir) = resource_dir {
        let bundled = dir.join(PRODUCT_RUNTIME_RESOURCE);
        if bundled.join("manifest.json").is_file() {
            return bundled;
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("bundled")
        .join(PRODUCT_RUNTIME_RESOURCE)
}

#[cfg(test)]
mod tests {
    use super::resolve;
    use std::fs;

    #[test]
    fn rejects_a_runtime_for_another_platform() {
        let root =
            std::env::temp_dir().join(format!("xiaohui-product-runtime-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let runtime = root.join("xiaohui-runtime");
        fs::create_dir_all(&runtime).unwrap();
        fs::write(
            runtime.join("manifest.json"),
            r#"{"platform":"linux","arch":"x64","integrationVersion":"0.7.1","harborBin":"venv/bin/harbor","harborDshBin":"venv/bin/harbor-dsh"}"#,
        )
        .unwrap();

        assert!(resolve(Some(&root)).unwrap_err().contains("darwin-arm64"));
        let _ = fs::remove_dir_all(&root);
    }
}
