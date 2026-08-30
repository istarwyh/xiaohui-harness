import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const lib = path.join(root, 'lib')
const temporaryClient = path.join(lib, '_client.cjs')

await rm(lib, { recursive: true, force: true })
await mkdir(lib, { recursive: true })

await build({
  entryPoints: [path.join(root, 'src', 'index.ts')],
  outfile: path.join(root, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node22'],
  external: ['@deepseek-ai/*', 'undici'],
})

await build({
  entryPoints: [path.join(root, 'src', 'client', 'index.tsx')],
  outfile: temporaryClient,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  jsxImportSource: 'react',
  target: ['es2022'],
  external: ['react', 'react/*', '@deepseek-ai/*'],
  logOverride: { 'commonjs-variable-in-esm': 'silent' },
})

const clientSource = await readFile(temporaryClient, 'utf8')
await rm(temporaryClient)
const clientBundle = [
  '/* dsh-personal-workbench Web client — generated from src/client. */',
  'window.__ModuleLoader__.load({',
  `  id: ${JSON.stringify(manifest.name)},`,
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  clientSource.trimEnd(),
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')

new Function(clientBundle)
await writeFile(path.join(lib, 'client.js'), clientBundle)
