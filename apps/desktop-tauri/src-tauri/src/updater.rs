//! Signed desktop update checks, installation, and version status.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::chrome;
use crate::i18n::{self, Msg};
use crate::notify;
use crate::runtime::boot_log;

const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(15);
static UPDATE_RUNNING: AtomicBool = AtomicBool::new(false);

struct UpdateAttempt;

impl UpdateAttempt {
    fn begin() -> Option<Self> {
        UPDATE_RUNNING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .ok()
            .map(|_| Self)
    }
}

impl Drop for UpdateAttempt {
    fn drop(&mut self) {
        UPDATE_RUNNING.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Eq, PartialEq)]
enum UpdateOutcome {
    Development(String),
    Current(String),
    Busy,
}

impl UpdateOutcome {
    fn message(&self) -> String {
        match self {
            Self::Development(version) => i18n::tf(Msg::UpdaterDevSkip, version),
            Self::Current(version) => i18n::tf(Msg::UpdaterCurrent, version),
            Self::Busy => i18n::t(Msg::UpdaterBusy).into(),
        }
    }
}

/// Return the semantic application version embedded in this desktop build.
pub fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Check the signed stable channel after startup and install a newer version.
///
/// Returns a localized current, development, or busy status when no install
/// starts. A successful install restarts the process and does not return.
pub async fn install_available(app: &AppHandle) -> Result<String, String> {
    check_and_install(app)
        .await
        .map(|outcome| outcome.message())
}

/// Check the signed stable channel from the tray and report the current version.
///
/// Shows the checking status immediately. A failed check leaves the running
/// workbench unchanged and returns the updater error to the tray handler.
pub async fn check_now(app: &AppHandle) -> Result<String, String> {
    let current = current_version(app);
    notify::toast(
        app,
        "XiaoHui Harness",
        &i18n::tf(Msg::UpdaterChecking, &current),
    );
    check_and_install(app)
        .await
        .map(|outcome| outcome.message())
}

async fn check_and_install(app: &AppHandle) -> Result<UpdateOutcome, String> {
    let current = current_version(app);
    if cfg!(debug_assertions) {
        return Ok(UpdateOutcome::Development(current));
    }

    let Some(_attempt) = UpdateAttempt::begin() else {
        return Ok(UpdateOutcome::Busy);
    };

    boot_log::info(&format!("desktop update check current={current}"));
    let Some(update) = app
        .updater_builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
    else {
        boot_log::info(&format!("desktop update current version={current}"));
        return Ok(UpdateOutcome::Current(current));
    };

    let target = update.version.clone();
    boot_log::info(&format!(
        "desktop update available current={current} target={target}"
    ));
    notify::toast(
        app,
        "XiaoHui Harness",
        &i18n::tf2(Msg::UpdaterAvailable, &current, &target),
    );

    let mut downloaded = 0_u64;
    let mut next_logged_percent = 25_u8;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let Some(percent) = download_percent(downloaded, content_length) else {
                    return;
                };
                if percent >= next_logged_percent {
                    boot_log::info(&format!("desktop update download progress={percent}%"));
                    next_logged_percent = next_logged_percent.saturating_add(25);
                }
            },
            || boot_log::info("desktop update download complete"),
        )
        .await
        .map_err(|error| error.to_string())?;

    boot_log::info(&format!("desktop update installed target={target}"));
    notify::toast(
        app,
        "XiaoHui Harness",
        &i18n::tf(Msg::UpdaterRestarting, &target),
    );
    chrome::request_restart(app)
}

fn download_percent(downloaded: u64, content_length: Option<u64>) -> Option<u8> {
    let content_length = content_length.filter(|length| *length > 0)?;
    Some(((downloaded.saturating_mul(100)) / content_length).min(100) as u8)
}

#[cfg(test)]
mod tests {
    use super::{download_percent, UpdateOutcome};

    #[test]
    fn update_outcome_reports_the_application_version() {
        assert_eq!(
            UpdateOutcome::Current("1.2.3".into()).message(),
            "当前已是最新版本（1.2.3）"
        );
        assert_eq!(
            UpdateOutcome::Development("1.2.3".into()).message(),
            "开发构建 1.2.3 不检查桌面更新"
        );
        assert_eq!(UpdateOutcome::Busy.message(), "已有更新检查或安装正在进行");
    }

    #[test]
    fn update_download_percent_handles_unknown_and_bounded_totals() {
        assert_eq!(download_percent(25, Some(100)), Some(25));
        assert_eq!(download_percent(125, Some(100)), Some(100));
        assert_eq!(download_percent(25, Some(0)), None);
        assert_eq!(download_percent(25, None), None);
    }
}
