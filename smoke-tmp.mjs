import { chromium } from 'playwright'
import { launchOptions, waitForServer } from './browser-support.mjs'

const URL = 'http://localhost:4173/Skill-tree/'
await waitForServer(URL)
const browser = await chromium.launch(launchOptions())
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })

const failed = []
const external = []
const errors = []
// Only same-origin failures indicate a base-path bug. Third-party hosts (the
// font CDN) are blocked in this sandbox and are not what this checks.
const bucket = (url) => (url.startsWith(URL.replace(/\/Skill-tree\/$/, '')) ? failed : external)
page.on('requestfailed', (r) => bucket(r.url()).push(`${r.failure()?.errorText} ${r.url()}`))
page.on('response', (r) => r.status() >= 400 && bucket(r.url()).push(`HTTP ${r.status()} ${r.url()}`))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

const state = await page.evaluate(() => ({
  title: document.title,
  // The empty state is the local-mode boot signal: no account, no backend.
  invitation: document.querySelector('.empty-canvas h2')?.textContent ?? null,
  cta: document.querySelector('.empty-canvas .btn')?.textContent ?? null,
  // Icons only render if the sprite fetch resolved against the subpath.
  spriteSymbols: document.querySelectorAll('symbol[id^="ph-"]').length,
  iconUses: [...document.querySelectorAll('svg use')].map((u) => u.getAttribute('href')).slice(0, 3),
  devHandle: typeof window.skillTree,
}))

console.log(JSON.stringify(state, null, 1))
console.log('same-origin failures:', failed.length ? failed : 'none')
console.log('third-party (blocked in this sandbox, fine in the browser):', external.length ? external : 'none')
console.log('page errors:', errors.length ? errors : 'none')
await page.screenshot({ path: '/tmp/claude-0/-home-user-Skill-tree/3a3a880f-ddfd-5bc9-880b-e97dbbf7de31/scratchpad/pages-build.png' })
await browser.close()

const ok = state.spriteSymbols > 1000 && state.invitation && failed.length === 0 && errors.length === 0
console.log(ok ? '\nok   production build works at the subpath' : '\nFAIL')
process.exit(ok ? 0 : 1)
