//! Build `wsl.exe` argv for `dsh web` without executing Windows `node.exe`.

use crate::i18n::{self, Msg};
use crate::network_proxy::{env_arguments, ResolvedNetworkProxy};

fn err_windows_node() -> &'static str {
    i18n::t(Msg::WslNoWindowsNode)
}

pub(crate) fn reject_windows_node(linux_node: &str) -> Result<(), String> {
    if linux_node.contains('\\') || linux_node.to_ascii_lowercase().ends_with("node.exe") {
        return Err(err_windows_node().into());
    }
    Ok(())
}

/// Inputs for one WSL Host `dsh web` launch.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WslLaunchSpec {
    pub distro: String,
    pub linux_node: String,
    pub linux_cli: String,
    pub linux_harness_root: String,
    pub linux_dsh_home: String,
    pub linux_path: String,
    pub linux_patch: Option<String>,
    pub notify_url: Option<String>,
    pub port: u16,
    pub host: String,
}

/// Resolved `wsl.exe` program and argument vector.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WslCommand {
    pub program: String,
    pub args: Vec<String>,
}

/// Build `wsl.exe` argv for `dsh web` inside the selected distro.
pub fn build_wsl_web_command(
    spec: &WslLaunchSpec,
    network_proxy: &ResolvedNetworkProxy,
) -> Result<WslCommand, String> {
    reject_windows_node(&spec.linux_node)?;

    let mut args = vec![
        "-d".into(),
        spec.distro.clone(),
        "--cd".into(),
        spec.linux_harness_root.clone(),
        "--exec".into(),
        "/usr/bin/env".into(),
    ];
    args.extend(env_arguments(network_proxy));
    args.extend([
        format!("PATH={}", spec.linux_path),
        format!("DSH_HOME={}", spec.linux_dsh_home),
        "NODE_ENV=production".into(),
    ]);

    if let Some(url) = &spec.notify_url {
        args.push(format!("DSH_DESKTOP_NOTIFY_URL={url}"));
    }

    // Echo the Linux shell pid on stderr, then exec node so stop can signal it.
    args.push("/bin/sh".into());
    args.push("-c".into());
    args.push(r#"echo $$ >&2; exec "$@""#.into());
    args.push("sh".into());
    args.push(spec.linux_node.clone());
    args.push(spec.linux_cli.clone());
    args.push("web".into());

    if let Some(patch) = &spec.linux_patch {
        args.push("--patch".into());
        args.push(patch.clone());
    }

    args.push("--no-open".into());
    args.push("--host".into());
    args.push("127.0.0.1".into());
    args.push("--port".into());
    args.push(spec.port.to_string());

    Ok(WslCommand {
        program: "wsl.exe".into(),
        args,
    })
}

#[cfg(test)]
mod tests {
    use super::{build_wsl_web_command, WslLaunchSpec};
    use crate::network_proxy::{resolve, NetworkProxySettings};

    fn spec() -> WslLaunchSpec {
        WslLaunchSpec {
            distro: "Ubuntu".into(),
            linux_node: "/home/u/.local/share/dsh-desktop/runtime/node/bin/node".into(),
            linux_cli: "/home/u/.local/share/dsh-desktop/harness-versions/abc/apps/cli/lib/bin.js"
                .into(),
            linux_harness_root: "/home/u/.local/share/dsh-desktop/harness-versions/abc".into(),
            linux_dsh_home: "/home/u/.dsh".into(),
            linux_path: "/home/u/.local/share/dsh-desktop/runtime/node/bin:/usr/bin".into(),
            linux_patch: Some("/home/u/.dsh/desktop-overlay/cordis.yml".into()),
            notify_url: Some("http://127.0.0.1:17991/".into()),
            port: 17890,
            host: "127.0.0.1".into(),
        }
    }

    #[test]
    fn wsl_desktop_host_orders_launcher_patches_before_web_arguments() {
        let s = spec();
        let proxy = resolve(&NetworkProxySettings::default()).unwrap();
        let cmd = build_wsl_web_command(&s, &proxy).unwrap();
        assert_eq!(cmd.program, "wsl.exe");
        let expected: Vec<String> = vec![
            "-d".to_string(),
            "Ubuntu".to_string(),
            "--cd".to_string(),
            "/home/u/.local/share/dsh-desktop/harness-versions/abc".to_string(),
            "--exec".to_string(),
            "/usr/bin/env".to_string(),
            "-u".to_string(),
            "HTTP_PROXY".to_string(),
            "-u".to_string(),
            "HTTPS_PROXY".to_string(),
            "-u".to_string(),
            "ALL_PROXY".to_string(),
            "-u".to_string(),
            "NO_PROXY".to_string(),
            "-u".to_string(),
            "http_proxy".to_string(),
            "-u".to_string(),
            "https_proxy".to_string(),
            "-u".to_string(),
            "all_proxy".to_string(),
            "-u".to_string(),
            "no_proxy".to_string(),
            "-u".to_string(),
            "NODE_USE_ENV_PROXY".to_string(),
            "-u".to_string(),
            "NODE_OPTIONS".to_string(),
            "NODE_OPTIONS=--use-system-ca".to_string(),
            "PATH=/home/u/.local/share/dsh-desktop/runtime/node/bin:/usr/bin".to_string(),
            "DSH_HOME=/home/u/.dsh".to_string(),
            "NODE_ENV=production".to_string(),
            "DSH_DESKTOP_NOTIFY_URL=http://127.0.0.1:17991/".to_string(),
            "/bin/sh".to_string(),
            "-c".to_string(),
            r#"echo $$ >&2; exec "$@""#.to_string(),
            "sh".to_string(),
            "/home/u/.local/share/dsh-desktop/runtime/node/bin/node".to_string(),
            "/home/u/.local/share/dsh-desktop/harness-versions/abc/apps/cli/lib/bin.js".to_string(),
            "web".to_string(),
            "--patch".to_string(),
            "/home/u/.dsh/desktop-overlay/cordis.yml".to_string(),
            "--no-open".to_string(),
            "--host".to_string(),
            "127.0.0.1".to_string(),
            "--port".to_string(),
            "17890".to_string(),
        ];
        assert_eq!(cmd.args, expected);
        assert!(cmd.args.iter().any(|a| a == "--exec"));
        assert!(!cmd.args.iter().any(|a| a == "bash" || a == "-lc"));
    }

    #[test]
    fn rejects_linux_node_with_backslash() {
        let mut s = spec();
        s.linux_node = "/home/u\\runtime/node/bin/node".into();
        let proxy = resolve(&NetworkProxySettings::default()).unwrap();
        let err = build_wsl_web_command(&s, &proxy).unwrap_err();
        assert_eq!(err, "禁止在 WSL 中执行 Windows node.exe");
    }

    #[test]
    fn rejects_lowercase_node_exe_suffix() {
        let mut s = spec();
        s.linux_node = "/mnt/c/Program Files/nodejs/node.exe".into();
        let proxy = resolve(&NetworkProxySettings::default()).unwrap();
        let err = build_wsl_web_command(&s, &proxy).unwrap_err();
        assert_eq!(err, "禁止在 WSL 中执行 Windows node.exe");
    }

    #[test]
    fn rejects_uppercase_node_exe_suffix() {
        let mut s = spec();
        s.linux_node = "/mnt/c/Program Files/nodejs/NODE.EXE".into();
        let proxy = resolve(&NetworkProxySettings::default()).unwrap();
        let err = build_wsl_web_command(&s, &proxy).unwrap_err();
        assert_eq!(err, "禁止在 WSL 中执行 Windows node.exe");
    }

    #[test]
    fn rejects_windows_node_exe_path() {
        let mut s = spec();
        s.linux_node = r"C:\Program Files\nodejs\node.exe".into();
        let proxy = resolve(&NetworkProxySettings::default()).unwrap();
        let err = build_wsl_web_command(&s, &proxy).unwrap_err();
        assert_eq!(err, "禁止在 WSL 中执行 Windows node.exe");
    }
}
