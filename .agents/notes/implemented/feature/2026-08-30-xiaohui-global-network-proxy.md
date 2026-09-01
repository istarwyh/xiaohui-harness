# Agent Note: XiaoHui application-wide network proxy

Status: implemented

English | [中文](2026-08-30-xiaohui-global-network-proxy.zh.md)

## Problem

Applications launched from macOS Finder do not inherit proxy variables from a user's interactive shell. A plugin such as Codex Auth can therefore create a Node HTTP client that connects directly even when macOS has a working system proxy. Solving only one plugin leaves package installation, marketplace metadata, runtime provisioning, and application updates on different routes.

## Decision

XiaoHui's native desktop settings own one application-wide `direct`, `system`, or `custom` proxy selection. Direct is the default and removes inherited upper- and lower-case proxy variables from every application-owned process. System mode runs the fixed `/usr/sbin/scutil --proxy` command and accepts fixed macOS HTTP and HTTPS endpoints. Custom mode requires separate credential-free HTTP and HTTPS URLs and accepts a comma-separated bypass list. Every mode adds `localhost`, `127.0.0.1`, and `::1` to the bypass list so the Tauri WebView and private Host remain on loopback.

The native boot path resolves the persisted selection before runtime provisioning. The resolved policy configures Rust HTTP clients, the signed updater, native Host and plugin subprocesses, Profile repair and package installation, toolchain downloads, and WSL commands. Every native reqwest client built through this policy uses rustls with the platform certificate verifier, so macOS Keychain trust applies to HTTPS intercepted by an enterprise proxy. Environment injection removes ambient proxy values before applying the resolved values, sets Node's environment-proxy switch explicitly, and adds `--use-system-ca` through `NODE_OPTIONS` to every application-owned Node process. Because the bundled Node 22.19 runtime predates the environment-proxy switch, the DSH CLI also materializes its layered environment, installs Undici's `EnvHttpProxyAgent` as the process-global dispatcher, and only then imports Profile boot and configured plugins. Dispatcher ownership stays at the CLI process entry rather than a product plugin, so provider initialization order cannot leave Host global `fetch` on the default direct dispatcher. The running application keeps this immutable resolved value; changing the persisted draft cannot split a live Host process tree, and the settings action restarts XiaoHui after saving.

System mode rejects PAC, automatic discovery, and HTTP-only macOS configurations. PAC evaluation is not equivalent to exporting static Node proxy variables, and an HTTP-only macOS setting would let HTTPS clients silently choose another route. Custom proxy URLs reject embedded credentials and non-HTTP schemes so secrets do not enter the plaintext desktop settings file, process arguments, or logs. Authenticated proxies require a future credential-store integration instead of a compatibility fallback.

The Personal Workbench Client contributes a General settings card that loads the current native setting and detected macOS endpoints, then tests the desktop draft and the running Node Host separately against `https://chatgpt.com/`. The Node Host test requires process-local proof that the CLI installed its Dispatcher before it uses a fixed same-origin JSON POST and global `fetch`. Both probes return only success, HTTP status, whether the proxy route is active, and a bounded transport or certificate code; the card labels each result separately, including codes such as `UNKNOWN_ISSUER` and `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, instead of replacing either failure with a generic proxy-process diagnosis. Neither test requires or transmits a ChatGPT credential, and neither returns a proxy URL or raw request error to the browser. Certificate failures direct the user to trust the enterprise root in macOS Keychain and state that XiaoHui keeps certificate verification enabled. A draft whose proxy state differs from the active Host reports that a save, restart, and second test are required. Standalone `dsh web` renders the controls disabled because it has no trusted native owner.

The loopback Client uses a dedicated versioned message channel with `get`, `test`, and `save` actions. The Tauri shell requires the exact workbench iframe source and Host origin, validates bounded fields and known keys, maps actions to three literal commands, and sends responses only to that origin. Rust performs the same settings validation before use. The browser cannot provide a command name, executable, destination URL, system command, or arbitrary environment value.

The existing [XiaoHui product workbench distribution](2026-08-22-xiaohui-product-workbench.md) remains the owner of product packaging and release acceptance. This note owns only the application-wide routing policy. The older [desktop host environment and home adoption](2026-08-14-desktop-host-env-and-home-adoption.md) remains applicable to Host executable discovery and environment isolation; proxy variables are now an explicit product-owned subset rather than inherited shell state.

## Alternatives considered

**Add a Codex-only proxy field.** Rejected because the same Node process tree also owns plugin discovery, installation, Harbor helpers, and other providers. Per-plugin proxy settings would create conflicting routes and duplicate secret-handling decisions.

**Inherit the Finder or shell environment.** Rejected because Finder does not reliably receive interactive-shell variables, ambient values cannot express an explicit Direct choice, and inherited credentials could leak into child processes.

**Translate PAC or auto-discovery output to one static URL.** Rejected because those mechanisms select routes per request and may execute platform policy. Claiming support through one exported URL would be incorrect.

**Persist authenticated proxy URLs.** Rejected because the desktop settings file, process environment, diagnostics, and child processes are not a credential store.

**Disable TLS certificate verification.** Rejected because it would make every application-owned HTTPS request vulnerable to interception. Enterprise interception must be authorized by a root certificate trusted by macOS or supplied explicitly through Node's standard `NODE_EXTRA_CA_CERTS` mechanism.

## Consequences

One visible setting routes Codex Auth, other Host plugins, package installation, runtime downloads, and signed updates consistently after restart. The current machine's fixed macOS proxy and Keychain-trusted enterprise roots can be adopted without launching XiaoHui from a terminal, while Direct remains an explicit deterministic state. A user of PAC, automatic discovery, an HTTP-only proxy, proxy authentication, or an untrusted interception certificate receives a specific failure and must correct the applicable proxy or trust setting. Custom endpoints used with WSL must be reachable from the WSL network namespace, and WSL uses its own system trust rather than the macOS Keychain. A real CLI Profile regression requires global HTTP fetch to traverse a local proxy, observes HTTPS `CONNECT`, and proves `NO_PROXY` bypass; the release smoke exercises the trusted browser bridge, separate desktop and Host outcomes, certificate guidance, save, and restart journey. Rust tests cover system parsing, validation, local bypass, removal of ambient proxy variables, platform-verifier construction, Node system-CA injection, and bounded certificate codes.
