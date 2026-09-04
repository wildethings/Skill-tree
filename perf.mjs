import { chromium } from 'playwright'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/')
await page.waitForFunction(() => window.skillTree?.getState().status === 'ready', { timeout: 20000 })

// The spec's design target: roughly 8 roots and 60+ nodes.
const size = await page.evaluate(() => {
  const s = () => window.skillTree.getState()
  const hues = [348, 205, 156, 32, 264, 132, 282, 62]
  const roots = hues.map((h, i) => s().createRoot({ title: `Root ${i + 1}`, icon: 'diamond', baseColor: `oklch(0.32 0.1 ${h})` }))
  for (const root of roots) {
    for (let b = 0; b < 3; b++) {
      let cur = s().addNode(root, 'advance', { title: `Skill ${b + 1}` })
      const depth = 1 + (b % 3)
      for (let d = 0; d < depth; d++) {
        cur = s().addNode(cur, 'advance', { title: `Step ${d + 1}`, state: d === depth - 1 ? 'planned' : 'started' })
      }
    }
  }
  // A few cross-links between roots.
  const live = s().index.live.filter((n) => n.parentIds.length > 0)
  for (let i = 0; i < 4; i++) s().addCrossLink(live[i * 5].id, roots[(i + 3) % roots.length])
  return { nodes: s().index.live.length, roots: s().index.rootIds.length }
})
await page.waitForTimeout(1600)

const edges = await page.evaluate(() => document.querySelectorAll('.edge').length)

// Sweep the cursor across the canvas and record every frame the engine renders.
const frames = await page.evaluate(async () => {
  const canvas = document.querySelector('.canvas')
  const rect = canvas.getBoundingClientRect()
  const times = []
  let last = performance.now()
  let stop = false
  const tick = () => {
    const now = performance.now()
    times.push(now - last)
    last = now
    if (!stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  for (let i = 0; i < 120; i++) {
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: rect.left + 40 + (i * 11) % (rect.width - 80),
        clientY: rect.top + 120 + Math.sin(i / 6) * 200,
        pointerType: 'mouse',
        bubbles: true,
      }),
    )
    await new Promise((r) => requestAnimationFrame(r))
  }
  stop = true
  return times.slice(4)
})

await page.screenshot({ path: '/tmp/claude-0/-home-user-Skill-tree/3a3a880f-ddfd-5bc9-880b-e97dbbf7de31/scratchpad/scale.png' })
await page.evaluate(() => {
  const s = window.skillTree.getState()
  for (const id of s.index.rootIds.slice(3)) s.toggleCollapse(id)
})
await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/claude-0/-home-user-Skill-tree/3a3a880f-ddfd-5bc9-880b-e97dbbf7de31/scratchpad/scale-collapsed.png' })

const sorted = [...frames].sort((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)]
const p95 = sorted[Math.floor(sorted.length * 0.95)]
console.log(`graph: ${size.nodes} nodes across ${size.roots} roots, ${edges} edges`)
console.log(`frames: median ${median.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms over ${frames.length} samples`)
const ok = median < 20
console.log(ok ? 'ok   holds a smooth frame at the design target' : 'FAIL frame time exceeds budget')
await browser.close()
process.exit(ok ? 0 : 1)
