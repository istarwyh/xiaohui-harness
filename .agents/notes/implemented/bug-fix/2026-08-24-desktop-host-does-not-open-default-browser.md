# Agent Note: Desktop Host does not open the default browser

Status: implemented

English | [中文](2026-08-24-desktop-host-does-not-open-default-browser.zh.md)

## Problem

The XiaoHui desktop shell starts a private `dsh web` Host and loads its loopback URL inside the Tauri WebView. The launcher passed the bind address and port but retained the CLI's local-launch default of opening the same URL in the operating system browser. Every desktop start therefore created an unrelated browser tab even though the application already owned the visible surface.

The loopback server is not redundant: it carries the Host API and Web assets used by the embedded WebView. Only the browser handoff is redundant.

## Decision

Every desktop-owned Host launch passes `--no-open` immediately after `dsh web`. The native macOS/Windows command builder and the WSL command builder apply the same rule. Host startup, health probing, loopback binding, Tauri WebView navigation, notification Overlay, and rescue patches remain unchanged.

## Testing

The native argument test pins the complete launch vector, including both Patch layers, `--no-open`, loopback host, and port. The WSL argument test pins the equivalent command after the Linux CLI entry. Focused Rust tests exercise both paths, and `cargo fmt --check` verifies the edited Rust source.

## Alternatives considered

**Remove the loopback Host.** Rejected because the Tauri WebView uses that server for the application UI and Host APIs; removing it would remove the workbench rather than the redundant browser tab.

**Set `openBrowser: false` in the desktop Overlay.** Rejected because a later entry-level `config` Patch replaces the complete Web Runtime config and risks discarding injected startup values such as trusted hosts. The documented CLI flag is invocation-scoped and preserves composition.

**Close the browser tab after it opens.** Rejected because the handoff has already disturbed the user's browser, cannot reliably identify the resulting tab, and grants the desktop shell unnecessary browser control.

## Consequences

Starting XiaoHui still binds a private `127.0.0.1` URL and displays it inside the desktop window, but no longer opens a separate browser tab. Developers who intentionally run `dsh web` outside the desktop retain its existing default-browser behavior unless they pass `--no-open` themselves.
