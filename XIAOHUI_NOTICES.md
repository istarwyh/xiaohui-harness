# XiaoHui product notices

XiaoHui Harness is a product fork of DeepSeek Harness and the Sakana desktop distribution. Their source remains covered by the repository's MIT license and original DeepSeek copyright notice.

The bundled `dsh-harbor-evolution` plugin and `harbor-dsh-evolution` adapter are distributed under the MIT license by istarwyh. Their licenses are included in `apps/desktop-tauri/product/harbor-evolution` and `apps/desktop-tauri/product/harbor-python`; Python package metadata and licenses are also preserved inside the bundled environment.

The bundled `dsh-codex-auth@0.3.0` snapshot is distributed under the MIT license by its upstream contributors at [suntianc/dsh-codex-auth](https://github.com/suntianc/dsh-codex-auth). The bundled `dsh-better-sidebar@0.15.1` snapshot is distributed under the MIT license by its upstream contributors at [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar). Each committed snapshot retains the published package license and records its exact npm tarball and integrity value in `XIAOHUI_UPSTREAM.json`; both records also declare XiaoHui's metadata-only DSH peer-range compatibility patch and the pre-patch and post-patch tree hashes.

Tauri, Rust crates, Node packages, Python packages, and their transitive dependencies retain their respective licenses. [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) remains the generated notice inventory for the Harness package closure.
