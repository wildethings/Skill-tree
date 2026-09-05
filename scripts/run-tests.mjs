// Bundles each test file with esbuild (already present via vite) and runs it
// under node:test, so tests can use the same extensionless TS imports as src.
import { build } from 'esbuild'
import { readdir, mkdir, rm } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'node_modules/.test-build')
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.ts'))
await build({
  entryPoints: files.map((f) => resolve(root, 'test', f)),
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['node:*'],
  define: { 'import.meta.env': '{}' },
  outExtension: { '.js': '.mjs' },
})

const res = spawnSync(process.execPath, ['--test', ...files.map((f) => resolve(out, f.replace(/\.ts$/, '.mjs')))], {
  stdio: 'inherit',
})
process.exit(res.status ?? 1)
