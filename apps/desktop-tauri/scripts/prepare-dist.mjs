/**
 * Prepare Tauri frontend dist and bundled harness source tree.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
mkdirSync(dist, { recursive: true })
cpSync(join(root, 'splash.html'), join(dist, 'splash.html'))
cpSync(join(root, 'shell.html'), join(dist, 'shell.html'))
cpSync(join(root, 'desktop-i18n.js'), join(dist, 'desktop-i18n.js'))
cpSync(join(root, 'app-icon.png'), join(dist, 'app-icon.png'))

const bundleScript = join(root, 'scripts', 'bundle-harness-source.mjs')
const result = spawnSync(process.execPath, [bundleScript], { stdio: 'inherit', cwd: root })
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const offlineStoreScript = join(root, 'scripts', 'prepare-harness-offline-store.mjs')
const offlineStore = spawnSync(process.execPath, [offlineStoreScript], { stdio: 'inherit', cwd: root })
if (offlineStore.status !== 0) {
  process.exit(offlineStore.status ?? 1)
}

const toolchainScript = join(root, 'scripts', 'prepare-managed-toolchain.mjs')
const toolchain = spawnSync(process.execPath, [toolchainScript], { stdio: 'inherit', cwd: root })
if (toolchain.status !== 0) {
  process.exit(toolchain.status ?? 1)
}

const productRuntimeScript = join(root, 'scripts', 'prepare-xiaohui-runtime.mjs')
const productRuntime = spawnSync(process.execPath, [productRuntimeScript], { stdio: 'inherit', cwd: root })
if (productRuntime.status !== 0) {
  process.exit(productRuntime.status ?? 1)
}

if (!existsSync(join(root, 'bundled', 'harness', '.bundle-manifest.json'))) {
  throw new Error('bundled harness manifest missing after bundle-harness-source.mjs')
}
if (!existsSync(join(root, 'bundled', 'xiaohui-runtime', 'manifest.json'))) {
  throw new Error('XiaoHui runtime manifest missing after prepare-xiaohui-runtime.mjs')
}
if (!existsSync(join(root, 'bundled', 'harness', 'xiaohui-pnpm-store.tar.gz'))) {
  throw new Error('offline pnpm store archive missing after prepare-harness-offline-store.mjs')
}
if (!existsSync(join(root, 'bundled', 'toolchain', 'manifest.json'))) {
  throw new Error('managed Node/pnpm toolchain missing after prepare-managed-toolchain.mjs')
}
