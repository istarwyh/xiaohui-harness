//! Application-wide proxy policy for native requests and the private DSH Host.

use std::collections::HashSet;
use std::process::Command;
use std::time::Duration;

use reqwest::{ClientBuilder, NoProxy, Proxy};
use serde::{Deserialize, Serialize};
use tauri_plugin_updater::UpdaterBuilder;
use url::Url;

use crate::desktop_settings;
use crate::runtime::boot_log;

const PROXY_TEST_URL: &str = "https://chatgpt.com/";
const PROXY_TEST_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_PROXY_URL_LENGTH: usize = 2_048;
const MAX_NO_PROXY_LENGTH: usize = 4_096;
const LOCAL_BYPASS: [&str; 3] = ["localhost", "127.0.0.1", "::1"];
const PROXY_ENV_NAMES: [&str; 9] = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "NODE_USE_ENV_PROXY",
];

/// User-selected source of the application's outbound proxy configuration.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NetworkProxyMode {
    /// Ignore ambient proxy variables and connect directly.
    #[default]
    Direct,
    /// Read fixed HTTP and HTTPS endpoints from macOS System Configuration.
    System,
    /// Use the explicitly persisted HTTP and HTTPS proxy URLs.
    Custom,
}

/// Persisted application-wide network proxy preferences.
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NetworkProxySettings {
    #[serde(default)]
    pub mode: NetworkProxyMode,
    #[serde(default)]
    pub http_proxy: String,
    #[serde(default)]
    pub https_proxy: String,
    #[serde(default)]
    pub no_proxy: String,
}

/// Validated proxy values fixed for one desktop-process lifetime.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedNetworkProxy {
    pub mode: NetworkProxyMode,
    http_proxy: Option<Url>,
    https_proxy: Option<Url>,
    no_proxy: String,
}

/// Browser-safe proxy values with credentials structurally excluded.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveNetworkProxy {
    pub mode: NetworkProxyMode,
    pub http_proxy: String,
    pub https_proxy: String,
    pub no_proxy: String,
}

/// Current macOS fixed proxy detection result.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemNetworkProxy {
    pub supported: bool,
    pub configured: bool,
    pub http_proxy: String,
    pub https_proxy: String,
    pub no_proxy: String,
    pub auto_config_url: String,
    pub error: String,
}

/// Initial state consumed by the General network-proxy settings card.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxySnapshot {
    pub settings: NetworkProxySettings,
    pub system: SystemNetworkProxy,
    pub effective: Option<EffectiveNetworkProxy>,
    pub effective_error: String,
}

/// Result of connecting to the fixed ChatGPT reachability endpoint.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProxyTestResult {
    pub status: u16,
    pub proxied: bool,
}

impl ResolvedNetworkProxy {
    fn direct() -> Self {
        Self {
            mode: NetworkProxyMode::Direct,
            http_proxy: None,
            https_proxy: None,
            no_proxy: normalize_no_proxy("").expect("fixed local bypass list is valid"),
        }
    }

    fn effective(&self) -> EffectiveNetworkProxy {
        EffectiveNetworkProxy {
            mode: self.mode,
            http_proxy: self
                .http_proxy
                .as_ref()
                .map(Url::as_str)
                .unwrap_or_default()
                .to_string(),
            https_proxy: self
                .https_proxy
                .as_ref()
                .map(Url::as_str)
                .unwrap_or_default()
                .to_string(),
            no_proxy: self.no_proxy.clone(),
        }
    }

    /// Whether any outbound protocol is configured to use a proxy.
    pub fn is_proxied(&self) -> bool {
        self.http_proxy.is_some() || self.https_proxy.is_some()
    }
}

/// Resolve and validate one persisted or candidate proxy selection.
pub fn resolve(settings: &NetworkProxySettings) -> Result<ResolvedNetworkProxy, String> {
    validate_inactive_custom_fields(settings)?;
    match settings.mode {
        NetworkProxyMode::Direct => Ok(ResolvedNetworkProxy::direct()),
        NetworkProxyMode::Custom => resolve_custom(settings),
        NetworkProxyMode::System => {
            let detected = detect_system_proxy();
            if !detected.supported {
                return Err(detected.error);
            }
            Ok(ResolvedNetworkProxy {
                mode: NetworkProxyMode::System,
                http_proxy: parse_optional_proxy_url("httpProxy", &detected.http_proxy)?,
                https_proxy: parse_optional_proxy_url("httpsProxy", &detected.https_proxy)?,
                no_proxy: normalize_no_proxy(&detected.no_proxy)?,
            })
        }
    }
}

fn resolve_custom(settings: &NetworkProxySettings) -> Result<ResolvedNetworkProxy, String> {
    let http_proxy = parse_optional_proxy_url("httpProxy", &settings.http_proxy)?;
    let https_proxy = parse_optional_proxy_url("httpsProxy", &settings.https_proxy)?;
    if http_proxy.is_none() || https_proxy.is_none() {
        return Err("network-proxy-custom-http-and-https-required".into());
    }
    Ok(ResolvedNetworkProxy {
        mode: NetworkProxyMode::Custom,
        http_proxy,
        https_proxy,
        no_proxy: normalize_no_proxy(&settings.no_proxy)?,
    })
}

fn validate_inactive_custom_fields(settings: &NetworkProxySettings) -> Result<(), String> {
    parse_optional_proxy_url("httpProxy", &settings.http_proxy)?;
    parse_optional_proxy_url("httpsProxy", &settings.https_proxy)?;
    normalize_no_proxy(&settings.no_proxy)?;
    Ok(())
}

fn parse_optional_proxy_url(field: &str, raw: &str) -> Result<Option<Url>, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(None);
    }
    if raw.len() > MAX_PROXY_URL_LENGTH {
        return Err(format!("network-proxy-url-too-long:{field}"));
    }
    let url = Url::parse(raw).map_err(|_| format!("network-proxy-url-invalid:{field}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!("network-proxy-scheme-unsupported:{field}"));
    }
    if url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || !matches!(url.path(), "" | "/")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(format!("network-proxy-url-invalid:{field}"));
    }
    Ok(Some(url))
}

fn normalize_no_proxy(raw: &str) -> Result<String, String> {
    if raw.len() > MAX_NO_PROXY_LENGTH || raw.chars().any(char::is_control) {
        return Err("network-proxy-no-proxy-invalid".into());
    }
    let mut values = Vec::new();
    let mut seen = HashSet::new();
    for value in LOCAL_BYPASS
        .into_iter()
        .chain(raw.split(',').map(str::trim))
    {
        if value.is_empty() || value == "<local>" {
            continue;
        }
        let key = value.to_ascii_lowercase();
        if seen.insert(key) {
            values.push(value.to_string());
        }
    }
    Ok(values.join(","))
}

/// Apply a resolved policy to one child process after removing ambient proxy variables.
pub fn apply_to_command(command: &mut Command, proxy: &ResolvedNetworkProxy) {
    for name in PROXY_ENV_NAMES {
        command.env_remove(name);
    }
    let Some(http_proxy) = proxy.http_proxy.as_ref() else {
        if let Some(https_proxy) = proxy.https_proxy.as_ref() {
            set_proxy_env(command, "HTTPS_PROXY", "https_proxy", https_proxy.as_str());
            set_no_proxy_env(command, &proxy.no_proxy);
            command.env("NODE_USE_ENV_PROXY", "1");
        }
        return;
    };
    set_proxy_env(command, "HTTP_PROXY", "http_proxy", http_proxy.as_str());
    if let Some(https_proxy) = proxy.https_proxy.as_ref() {
        set_proxy_env(command, "HTTPS_PROXY", "https_proxy", https_proxy.as_str());
    }
    set_no_proxy_env(command, &proxy.no_proxy);
    command.env("NODE_USE_ENV_PROXY", "1");
}

/// Arguments that replace ambient proxy variables through WSL `/usr/bin/env`.
pub fn env_arguments(proxy: &ResolvedNetworkProxy) -> Vec<String> {
    let mut assignments = Vec::new();
    for name in PROXY_ENV_NAMES {
        assignments.push("-u".into());
        assignments.push(name.into());
    }
    if let Some(url) = &proxy.http_proxy {
        assignments.push(format!("HTTP_PROXY={}", url.as_str()));
        assignments.push(format!("http_proxy={}", url.as_str()));
    }
    if let Some(url) = &proxy.https_proxy {
        assignments.push(format!("HTTPS_PROXY={}", url.as_str()));
        assignments.push(format!("https_proxy={}", url.as_str()));
    }
    if proxy.is_proxied() {
        assignments.push(format!("NO_PROXY={}", proxy.no_proxy));
        assignments.push(format!("no_proxy={}", proxy.no_proxy));
        assignments.push("NODE_USE_ENV_PROXY=1".into());
    }
    assignments
}

fn set_proxy_env(command: &mut Command, upper: &str, lower: &str, value: &str) {
    command.env(upper, value).env(lower, value);
}

fn set_no_proxy_env(command: &mut Command, value: &str) {
    command.env("NO_PROXY", value).env("no_proxy", value);
}

/// Apply a resolved policy to an application-owned reqwest client.
pub fn apply_to_client(
    mut builder: ClientBuilder,
    proxy: &ResolvedNetworkProxy,
) -> Result<ClientBuilder, String> {
    builder = builder.no_proxy();
    let no_proxy = NoProxy::from_string(&proxy.no_proxy);
    if let Some(url) = &proxy.http_proxy {
        let configured = Proxy::http(url.as_str())
            .map_err(|error| error.to_string())?
            .no_proxy(no_proxy.clone());
        builder = builder.proxy(configured);
    }
    if let Some(url) = &proxy.https_proxy {
        let configured = Proxy::https(url.as_str())
            .map_err(|error| error.to_string())?
            .no_proxy(no_proxy);
        builder = builder.proxy(configured);
    }
    Ok(builder)
}

/// Apply the HTTPS proxy, or explicit no-proxy mode, to the signed updater.
pub fn apply_to_updater(
    mut builder: UpdaterBuilder,
    proxy: &ResolvedNetworkProxy,
) -> UpdaterBuilder {
    if let Some(url) = proxy.https_proxy.clone() {
        builder = builder.proxy(url);
    } else {
        builder = builder.no_proxy();
    }
    builder
}

/// Load the current preferences and detect macOS fixed proxy endpoints.
#[tauri::command]
pub fn get_network_proxy_settings() -> NetworkProxySnapshot {
    snapshot(desktop_settings::load().network_proxy)
}

/// Validate and persist one selection; the running process keeps its old policy until restart.
#[tauri::command]
pub fn save_network_proxy_settings(
    settings: NetworkProxySettings,
) -> Result<NetworkProxySnapshot, String> {
    resolve(&settings)?;
    let mut desktop = desktop_settings::load();
    desktop.network_proxy = settings.clone();
    desktop_settings::save(&desktop)?;
    Ok(snapshot(settings))
}

/// Connect to ChatGPT with one candidate selection without mutating the active policy.
#[tauri::command]
pub async fn test_network_proxy_settings(
    settings: NetworkProxySettings,
) -> Result<NetworkProxyTestResult, String> {
    let proxy = resolve(&settings)?;
    let client = apply_to_client(
        reqwest::Client::builder()
            .user_agent("XiaoHui-Harness/proxy-test")
            .timeout(PROXY_TEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(3)),
        &proxy,
    )?
    .build()
    .map_err(|error| format!("network-proxy-test-client:{error}"))?;
    let response = client
        .get(PROXY_TEST_URL)
        .send()
        .await
        .map_err(|error| format!("network-proxy-test-failed:{error}"))?;
    let status = response.status();
    if status.as_u16() == 407 || status.is_server_error() {
        return Err(format!("network-proxy-test-http:{}", status.as_u16()));
    }
    Ok(NetworkProxyTestResult {
        status: status.as_u16(),
        proxied: proxy.is_proxied(),
    })
}

fn snapshot(settings: NetworkProxySettings) -> NetworkProxySnapshot {
    let system = detect_system_proxy();
    match resolve(&settings) {
        Ok(resolved) => NetworkProxySnapshot {
            settings,
            system,
            effective: Some(resolved.effective()),
            effective_error: String::new(),
        },
        Err(error) => NetworkProxySnapshot {
            settings,
            system,
            effective: None,
            effective_error: error,
        },
    }
}

/// Read fixed proxy endpoints from macOS without importing the launch environment.
pub fn detect_system_proxy() -> SystemNetworkProxy {
    #[cfg(target_os = "macos")]
    {
        let output = match Command::new("/usr/sbin/scutil").arg("--proxy").output() {
            Ok(output) if output.status.success() => output,
            Ok(output) => {
                return unsupported_system_proxy(format!(
                    "network-proxy-system-command-exit:{}",
                    output.status.code().unwrap_or(-1)
                ));
            }
            Err(error) => {
                return unsupported_system_proxy(format!(
                    "network-proxy-system-command-failed:{error}"
                ));
            }
        };
        return parse_scutil_proxy(&String::from_utf8_lossy(&output.stdout));
    }
    #[cfg(not(target_os = "macos"))]
    {
        unsupported_system_proxy("network-proxy-system-unsupported-platform".into())
    }
}

fn unsupported_system_proxy(error: String) -> SystemNetworkProxy {
    SystemNetworkProxy {
        supported: false,
        configured: false,
        http_proxy: String::new(),
        https_proxy: String::new(),
        no_proxy: normalize_no_proxy("").expect("fixed local bypass list is valid"),
        auto_config_url: String::new(),
        error,
    }
}

fn parse_scutil_proxy(raw: &str) -> SystemNetworkProxy {
    let mut values = std::collections::HashMap::<String, String>::new();
    let mut exceptions = Vec::new();
    let mut reading_exceptions = false;
    for raw_line in raw.lines() {
        let line = raw_line.trim();
        if reading_exceptions {
            if line == "}" {
                reading_exceptions = false;
                continue;
            }
            if let Some((_, value)) = line.split_once(" : ") {
                exceptions.push(value.trim().to_string());
            }
            continue;
        }
        if line.starts_with("ExceptionsList :") {
            reading_exceptions = true;
            continue;
        }
        if let Some((key, value)) = line.split_once(" : ") {
            values.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    let auto_config_url = values
        .get("ProxyAutoConfigURLString")
        .cloned()
        .unwrap_or_default();
    let uses_auto_config =
        enabled(&values, "ProxyAutoConfigEnable") || enabled(&values, "ProxyAutoDiscoveryEnable");
    let no_proxy = match normalize_no_proxy(&exceptions.join(",")) {
        Ok(value) => value,
        Err(error) => return unsupported_system_proxy(error),
    };
    let http_proxy = match system_endpoint(&values, "HTTP") {
        Ok(value) => value,
        Err(error) => return unsupported_system_proxy(error),
    };
    let https_proxy = match system_endpoint(&values, "HTTPS") {
        Ok(value) => value,
        Err(error) => return unsupported_system_proxy(error),
    };

    if uses_auto_config {
        return SystemNetworkProxy {
            supported: false,
            configured: true,
            http_proxy,
            https_proxy,
            no_proxy,
            auto_config_url,
            error: "network-proxy-system-auto-config-unsupported".into(),
        };
    }
    if !http_proxy.is_empty() && https_proxy.is_empty() {
        return SystemNetworkProxy {
            supported: false,
            configured: true,
            http_proxy,
            https_proxy,
            no_proxy,
            auto_config_url,
            error: "network-proxy-system-http-only-unsupported".into(),
        };
    }
    SystemNetworkProxy {
        supported: true,
        configured: !http_proxy.is_empty() || !https_proxy.is_empty(),
        http_proxy,
        https_proxy,
        no_proxy,
        auto_config_url,
        error: String::new(),
    }
}

fn enabled(values: &std::collections::HashMap<String, String>, key: &str) -> bool {
    values.get(key).is_some_and(|value| value == "1")
}

fn system_endpoint(
    values: &std::collections::HashMap<String, String>,
    prefix: &str,
) -> Result<String, String> {
    if !enabled(values, &format!("{prefix}Enable")) {
        return Ok(String::new());
    }
    let host = values
        .get(&format!("{prefix}Proxy"))
        .map(String::as_str)
        .unwrap_or_default()
        .trim();
    let port = values
        .get(&format!("{prefix}Port"))
        .and_then(|value| value.parse::<u16>().ok());
    if host.is_empty() || port.is_none() || host.chars().any(char::is_whitespace) {
        return Err(format!("network-proxy-system-{prefix}-invalid"));
    }
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let value = format!("http://{host}:{}", port.expect("port checked above"));
    parse_optional_proxy_url(prefix, &value)?;
    Ok(value)
}

/// Log only mode and endpoint presence; proxy addresses can contain private hostnames.
pub fn log_active(proxy: &ResolvedNetworkProxy) {
    boot_log::info(&format!(
        "network proxy active mode={:?} http={} https={}",
        proxy.mode,
        proxy.http_proxy.is_some(),
        proxy.https_proxy.is_some()
    ));
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::{
        apply_to_command, parse_scutil_proxy, resolve, NetworkProxyMode, NetworkProxySettings,
    };

    fn custom() -> NetworkProxySettings {
        NetworkProxySettings {
            mode: NetworkProxyMode::Custom,
            http_proxy: "http://127.0.0.1:7890".into(),
            https_proxy: "http://127.0.0.1:7890".into(),
            no_proxy: "*.local,10.0.0.0/8".into(),
        }
    }

    #[test]
    fn parses_fixed_macos_proxy_and_required_bypass_hosts() {
        let detected = parse_scutil_proxy(
            r#"<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : *.local
    2 : <local>
  }
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7891
  HTTPSProxy : proxy.example
  ProxyAutoConfigEnable : 0
}"#,
        );
        assert!(detected.supported);
        assert!(detected.configured);
        assert_eq!(detected.http_proxy, "http://127.0.0.1:7890");
        assert_eq!(detected.https_proxy, "http://proxy.example:7891");
        assert_eq!(detected.no_proxy, "localhost,127.0.0.1,::1,*.local");
    }

    #[test]
    fn reports_pac_and_http_only_system_modes_as_unsupported() {
        let pac = parse_scutil_proxy(
            r#"<dictionary> {
  ProxyAutoConfigEnable : 1
  ProxyAutoConfigURLString : https://proxy.example/config.pac
}"#,
        );
        assert!(!pac.supported);
        assert_eq!(pac.error, "network-proxy-system-auto-config-unsupported");
        assert_eq!(pac.auto_config_url, "https://proxy.example/config.pac");

        let http_only = parse_scutil_proxy(
            r#"<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
}"#,
        );
        assert!(!http_only.supported);
        assert_eq!(
            http_only.error,
            "network-proxy-system-http-only-unsupported"
        );
    }

    #[test]
    fn validates_custom_urls_without_persisting_credentials() {
        let resolved = resolve(&custom()).unwrap();
        assert!(resolved.is_proxied());
        for settings in [
            NetworkProxySettings {
                http_proxy: "socks5://127.0.0.1:7890".into(),
                ..custom()
            },
            NetworkProxySettings {
                https_proxy: "http://user:secret@127.0.0.1:7890".into(),
                ..custom()
            },
            NetworkProxySettings {
                https_proxy: String::new(),
                ..custom()
            },
        ] {
            assert!(resolve(&settings).is_err());
        }
    }

    #[test]
    fn command_policy_replaces_ambient_proxy_variables_in_both_cases() {
        let mut direct_command = Command::new("node");
        direct_command.env("HTTP_PROXY", "http://ambient.invalid:1");
        direct_command.env("ALL_PROXY", "socks5://ambient.invalid:2");
        apply_to_command(
            &mut direct_command,
            &resolve(&NetworkProxySettings::default()).unwrap(),
        );
        let direct_env: Vec<_> = direct_command.get_envs().collect();
        assert!(direct_env
            .iter()
            .any(|(name, value)| *name == "HTTP_PROXY" && value.is_none()));
        assert!(direct_env
            .iter()
            .any(|(name, value)| *name == "ALL_PROXY" && value.is_none()));

        let mut proxied_command = Command::new("node");
        apply_to_command(&mut proxied_command, &resolve(&custom()).unwrap());
        let proxied_env: Vec<_> = proxied_command.get_envs().collect();
        assert!(proxied_env.iter().any(|(name, value)| {
            *name == "HTTPS_PROXY" && value.is_some_and(|value| value == "http://127.0.0.1:7890/")
        }));
        assert!(proxied_env.iter().any(|(name, value)| {
            *name == "NO_PROXY"
                && value.is_some_and(|value| value.to_string_lossy().contains("localhost"))
        }));
    }
}
