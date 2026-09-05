/**
 * Asserts that what is being published — or what is already live — is the built
 * app and not the source index.html.
 *
 * The source page carries `src="/src/main.tsx"`, which the browser cannot
 * execute, so the site loads blank. That is exactly what shipped when GitHub's
 * built-in branch builder served the repository root instead of this workflow's
 * artifact, and nothing in the pipeline noticed.
 *
 *   node scripts/verify-deploy.mjs dist/index.html --base /Skill-tree/
 *   node scripts/verify-deploy.mjs https://user.github.io/Skill-tree/
 */
import { readFile } from 'node:fs/promises'

const [target, ...rest] = process.argv.slice(2)
if (!target) {
  console.error('usage: verify-deploy.mjs <url|path> [--base /Skill-tree/]')
  process.exit(2)
}

const baseFlag = rest.indexOf('--base')
const isUrl = /^https?:\/\//.test(target)
const base = baseFlag !== -1 ? rest[baseFlag + 1] : isUrl ? new URL(target).pathname : '/'

const REQUEST_TIMEOUT_MS = 10_000
const TOTAL_BUDGET_MS = 120_000

/**
 * Pages lags a moment behind a deploy, so a live check retries — but every
 * attempt is bounded and so is the whole thing. Without a per-request timeout
 * `fetch` waits on the OS connect timeout, and a URL that never answers eats
 * the job's whole allowance and gets it cancelled, which reports as neither
 * pass nor fail.
 */
async function fetchWithRetry(url) {
  const deadline = Date.now() + TOTAL_BUDGET_MS
  let last = 'no attempt made'
  let attempt = 0
  while (Date.now() < deadline) {
    attempt += 1
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (res.ok) return await res.text()
      last = `HTTP ${res.status}`
    } catch (e) {
      last = e.name === 'TimeoutError' ? `no response within ${REQUEST_TIMEOUT_MS / 1000}s` : e.message
    }
    console.log(`     attempt ${attempt}: ${last}`)
    if (Date.now() + 5000 >= deadline) break
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error(
    `could not fetch ${url} after ${attempt} attempts (${last}).\n` +
      '  If this is a fresh Pages site, check Settings -> Pages -> Source is "GitHub Actions".',
  )
}

const html = isUrl ? await fetchWithRetry(target) : await readFile(target, 'utf8')

const problems = []

// 1. The unbuilt entry point must not be there at all.
if (html.includes('/src/main.tsx')) {
  problems.push('index.html still references /src/main.tsx — this is the source page, not the build')
}

// 2. There must be a module script pointing at a hashed asset under the base.
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
const expected = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}assets/.+\\.js$`)
const entry = scripts.find((s) => expected.test(s))
if (!entry) {
  problems.push(`no module script matching ${base}assets/*.js — found: ${scripts.length ? scripts.join(', ') : '(none)'}`)
}

// 3. For a live check, the asset it points at must actually resolve.
if (isUrl && entry) {
  const assetUrl = new URL(entry, target).href
  const res = await fetch(assetUrl, { method: 'GET' }).catch((e) => ({ ok: false, status: e.message }))
  if (!res.ok) problems.push(`entry script ${assetUrl} did not load (${res.status})`)
}

if (problems.length) {
  console.error(`FAIL ${target}`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

console.log(`ok   ${target}`)
console.log(`     entry: ${entry}`)
console.log(`     base:  ${base}`)
