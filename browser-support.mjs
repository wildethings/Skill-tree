import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where Chromium lives. Sandboxes and CI images pre-seed a browser and point
 * PLAYWRIGHT_BROWSERS_PATH at it; a plain checkout has Playwright's own
 * download, which it resolves itself when given no executablePath.
 */
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (root && root !== '0' && existsSync(root)) {
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith('chromium-')) continue
      for (const exe of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const candidate = join(root, dir, exe)
        if (existsSync(candidate)) return candidate
      }
    }
  }
  return undefined
}

export const launchOptions = () => {
  const executablePath = chromiumPath()
  return executablePath ? { executablePath } : {}
}

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173/Skill-tree/'

/** Waits for the dev server rather than assuming the caller sequenced things. */
export async function waitForServer(url = BASE_URL, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`No dev server at ${url} after ${timeoutMs / 1000}s. Run: npm run dev`)
    await new Promise((r) => setTimeout(r, 500))
  }
}
