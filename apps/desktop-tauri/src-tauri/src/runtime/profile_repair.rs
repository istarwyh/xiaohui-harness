//! Reinstall broken or missing profile dependencies before the Host starts.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::boot_log;
use super::process::hide_console;
use super::provision::{pnpm_js_entry, RuntimePaths};
use super::user_home::{profile_dependencies_unresolved, profiles_needing_install};
use super::ProvisionEvent;
use crate::i18n::{self, Msg};

/// How long one `dsh plugin --profile <name> install` may run before it is killed.
const INSTALL_TIMEOUT: Duration = Duration::from_secs(600);

const MANAGED_PRODUCT_LINKS: &[(&str, &str)] = &[
    ("dsh-harbor-evolution", "packages/product/harbor-evolution"),
    ("dsh-codex-auth", "packages/product/dsh-codex-auth"),
    ("dsh-better-sidebar", "packages/product/dsh-better-sidebar"),
    ("dsh-context-doctor", "packages/product/context-doctor"),
    (
        "dsh-personal-workbench",
        "packages/product/personal-workbench",
    ),
];

/// The profile `dsh web` boots; a profile whose install cannot be repaired is
/// a boot error only for this one, other profiles defer to a later `dsh plugin`.
pub const HOST_PROFILE: &str = "web";

/// Ensure every profile under `DSH_HOME` can resolve its declared dependencies
/// before the Host starts: profiles needing install run `node …/pnpm.cjs
/// install` in the profile directory when that entry exists, otherwise
/// `dsh plugin --profile <name> install` on the bridged PATH, and are
/// re-verified afterwards. A failed repair of a non-Host profile is logged
/// and deferred; a failed repair of {@link HOST_PROFILE} fails boot with the
/// manual command to run.
pub async fn ensure_profile_installs(
    paths: &RuntimePaths,
    host_path: &str,
    progress: &Arc<dyn Fn(ProvisionEvent) + Send + Sync>,
) -> Result<(), String> {
    let mut pending = rebind_managed_product_links(paths)?;
    for name in profiles_needing_install(&paths.dsh_home) {
        if !pending.contains(&name) {
            pending.push(name);
        }
    }
    pending.sort();
    if pending.is_empty() {
        return Ok(());
    }
    boot_log::info(&format!("profile installs pending: {}", pending.join(", ")));
    for name in pending {
        progress(ProvisionEvent::Status(i18n::tf(
            Msg::ProfileInstalling,
            &name,
        )));
        let paths = paths.clone();
        let host_path = host_path.to_string();
        let name_for_task = name.clone();
        let result = tokio::task::spawn_blocking(move || {
            run_profile_install(&paths, &host_path, &name_for_task)
        })
        .await
        .map_err(|e| format!("profile {name} 安装任务失败: {e}"))?;
        match result {
            Ok(()) => {
                progress(ProvisionEvent::Status(i18n::tf(Msg::ProfileReady, &name)));
                boot_log::info(&format!("profile {name} dependencies installed"));
            }
            Err(error) => {
                boot_log::error(&format!("profile {name} install failed: {error}"));
                if name == HOST_PROFILE {
                    return Err(i18n::tf2(Msg::ProfileInstallFailed, &name, &error));
                }
            }
        }
    }
    Ok(())
}

/// Move only XiaoHui-owned product `link:` dependencies from an older
/// content-addressed Harness tree to the active one. Registry packages and
/// links outside this application's `harness-versions` directory remain
/// user-owned and untouched.
fn rebind_managed_product_links(paths: &RuntimePaths) -> Result<Vec<String>, String> {
    let profiles_root = paths.dsh_home.join("profiles");
    let versions_root = paths
        .dsh_home
        .parent()
        .ok_or_else(|| {
            format!(
                "DSH home has no application-data parent: {}",
                paths.dsh_home.display()
            )
        })?
        .join("harness-versions");
    let Ok(entries) = fs::read_dir(&profiles_root) else {
        return Ok(Vec::new());
    };
    let mut rebound = Vec::new();
    for entry in entries.flatten() {
        let profile = entry.path();
        if !profile.is_dir() || profile.is_symlink() {
            continue;
        }
        let manifest_path = profile.join("package.json");
        let Ok(raw) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(mut manifest) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        let Some(dependencies) = manifest
            .get_mut("dependencies")
            .and_then(serde_json::Value::as_object_mut)
        else {
            continue;
        };
        let mut changed = false;
        for (package, relative) in MANAGED_PRODUCT_LINKS {
            let Some(spec) = dependencies.get_mut(*package) else {
                continue;
            };
            let Some(link) = spec.as_str().and_then(|value| value.strip_prefix("link:")) else {
                continue;
            };
            let linked = if Path::new(link).is_absolute() {
                PathBuf::from(link)
            } else {
                profile.join(link)
            };
            if !linked.starts_with(&versions_root) || !linked.ends_with(relative) {
                continue;
            }
            let current = paths.harness_root.join(relative);
            if linked == current {
                continue;
            }
            if !current.join("package.json").is_file() {
                return Err(format!(
                    "XiaoHui product dependency is missing from the active Harness tree: {}",
                    current.display()
                ));
            }
            *spec = serde_json::Value::String(format!("link:{}", current.display()));
            changed = true;
        }
        if !changed {
            continue;
        }
        let content = serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("无法序列化 {}: {error}", manifest_path.display()))?;
        fs::write(&manifest_path, format!("{content}\n"))
            .map_err(|error| format!("无法更新 {}: {error}", manifest_path.display()))?;
        let Some(name) = entry.file_name().into_string().ok() else {
            continue;
        };
        boot_log::info(&format!("rebound XiaoHui product links in profile {name}"));
        rebound.push(name);
    }
    Ok(rebound)
}

/// Run one install and re-verify the profile can resolve its dependencies.
fn run_profile_install(paths: &RuntimePaths, host_path: &str, name: &str) -> Result<(), String> {
    let profile_dir = profile_dir(&paths.dsh_home, name);
    let mut cmd = Command::new(&paths.node_binary);
    if let Some(entry) = pnpm_js_entry(&paths.pnpm_binary) {
        cmd.arg(entry).arg("install").current_dir(&profile_dir);
    } else {
        cmd.arg(&paths.cli_entry)
            .arg("plugin")
            .arg("--profile")
            .arg(name)
            .arg("install")
            .current_dir(&paths.harness_root);
    }
    cmd.env("DSH_HOME", &paths.dsh_home)
        .env("PATH", host_path)
        .env("NODE_ENV", "production")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut cmd);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("无法启动 dsh plugin: {e}"))?;

    let output_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    if let Some(stdout) = child.stdout.take() {
        let tail = Arc::clone(&output_tail);
        std::thread::spawn(move || drain_lines(stdout, tail));
    }
    if let Some(stderr) = child.stderr.take() {
        let tail = Arc::clone(&output_tail);
        std::thread::spawn(move || drain_lines(stderr, tail));
    }

    let deadline = Instant::now() + INSTALL_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "安装超时（超过 {} 秒）{}",
                        INSTALL_TIMEOUT.as_secs(),
                        format_output_tail(&output_tail)
                    ));
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            Err(error) => return Err(format!("等待安装进程失败: {error}")),
        }
    };

    if !status.success() {
        return Err(format!(
            "pnpm 退出码 {}{}",
            status.code().unwrap_or(-1),
            format_output_tail(&output_tail)
        ));
    }
    if profile_dependencies_unresolved(&profile_dir) {
        return Err(format!(
            "安装完成但依赖仍无法解析{}",
            format_output_tail(&output_tail)
        ));
    }
    Ok(())
}

fn profile_dir(dsh_home: &std::path::Path, name: &str) -> PathBuf {
    dsh_home.join("profiles").join(name)
}

fn drain_lines<R: std::io::Read>(reader: R, sink: Arc<Mutex<Vec<String>>>) {
    let reader = BufReader::new(reader);
    for line in reader.lines().flatten() {
        if let Ok(mut guard) = sink.lock() {
            guard.push(line);
            if guard.len() > 20 {
                let drop = guard.len() - 20;
                guard.drain(0..drop);
            }
        }
    }
}

fn format_output_tail(tail: &Arc<Mutex<Vec<String>>>) -> String {
    let lines = tail
        .lock()
        .map(|lines| lines.join("\n"))
        .unwrap_or_default();
    if lines.is_empty() {
        String::new()
    } else {
        format!("\n{lines}")
    }
}

#[cfg(test)]
mod tests {
    use super::super::user_home::profiles_needing_install;
    use super::rebind_managed_product_links;
    use crate::runtime::provision::RuntimePaths;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    fn temp_root() -> PathBuf {
        let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!(
            "dsh-desktop-repair-{}-{}-{}",
            std::process::id(),
            nanos,
            id
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn lists_profiles_with_unresolved_dependencies_only() {
        let root = temp_root();
        let home = root.join("home");
        let broken = home.join("profiles").join("web");
        let intact = home.join("profiles").join("cli");
        let plain = home.join("profiles").join("plain");
        for dir in [&broken, &intact, &plain] {
            fs::create_dir_all(dir).unwrap();
        }
        fs::write(
            broken.join("package.json"),
            r#"{"dependencies":{"dsh-plugins-catalog":"github:x/y"}}"#,
        )
        .unwrap();
        fs::write(
            intact.join("package.json"),
            r#"{"dependencies":{"kept":"1.0.0"}}"#,
        )
        .unwrap();
        fs::create_dir_all(intact.join("node_modules").join("kept")).unwrap();
        fs::write(
            intact
                .join("node_modules")
                .join("kept")
                .join("package.json"),
            r#"{"name":"kept"}"#,
        )
        .unwrap();
        fs::write(plain.join("package.json"), r#"{"dependencies":{}}"#).unwrap();

        assert_eq!(profiles_needing_install(&home), vec!["web".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn empty_home_needs_no_installs() {
        let root = temp_root();
        assert!(profiles_needing_install(&root.join("home")).is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rebinds_only_product_links_owned_by_an_old_xiaohui_tree() {
        let root = temp_root();
        let dsh_home = root.join("dsh-home");
        let profile = dsh_home.join("profiles").join("web");
        let current = root.join("harness-versions").join("current");
        let current_plugin = current.join("packages/product/harbor-evolution");
        let current_context_doctor = current.join("packages/product/context-doctor");
        let old_plugin = root
            .join("harness-versions")
            .join("old")
            .join("packages/product/harbor-evolution");
        let old_context_doctor = root
            .join("harness-versions")
            .join("old")
            .join("packages/product/context-doctor");
        fs::create_dir_all(&profile).unwrap();
        fs::create_dir_all(&current_plugin).unwrap();
        fs::create_dir_all(&current_context_doctor).unwrap();
        fs::write(
            current_plugin.join("package.json"),
            r#"{"name":"dsh-harbor-evolution"}"#,
        )
        .unwrap();
        fs::write(
            current_context_doctor.join("package.json"),
            r#"{"name":"dsh-context-doctor"}"#,
        )
        .unwrap();
        fs::write(
            profile.join("package.json"),
            format!(
                "{{\"dependencies\":{{\"dsh-harbor-evolution\":\"link:{}\",\"dsh-context-doctor\":\"link:{}\",\"third-party\":\"link:/tmp/third-party\"}}}}",
                old_plugin.display(),
                old_context_doctor.display()
            ),
        )
        .unwrap();
        let paths = RuntimePaths {
            node_binary: root.join("node"),
            pnpm_binary: root.join("pnpm"),
            cli_entry: current.join("apps/cli/lib/bin.js"),
            harness_root: current.clone(),
            runtime_root: root.join("runtime"),
            dsh_home,
        };

        assert_eq!(
            rebind_managed_product_links(&paths).unwrap(),
            vec!["web".to_string()]
        );
        let value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(profile.join("package.json")).unwrap())
                .unwrap();
        assert_eq!(
            value["dependencies"]["dsh-harbor-evolution"],
            format!("link:{}", current_plugin.display())
        );
        assert_eq!(
            value["dependencies"]["dsh-context-doctor"],
            format!("link:{}", current_context_doctor.display())
        );
        assert_eq!(
            value["dependencies"]["third-party"],
            "link:/tmp/third-party"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
