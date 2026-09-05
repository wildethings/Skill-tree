/**
 * Browser checks for the things that only exist at runtime: the cursor push
 * invariants, the add flow, collapse, and re-parenting by drag.
 * Run with the dev server up:  npm run dev &  node browser-test.mjs
 */
import { chromium } from 'playwright'
import { BASE_URL, launchOptions, waitForServer } from './browser-support.mjs'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

await waitForServer()
const browser = await chromium.launch(launchOptions())
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE_URL)
await page.waitForFunction(() => window.skillTree?.getState().status === 'ready', { timeout: 20000 })

await page.evaluate(() => {
  const s = () => window.skillTree.getState()
  const root = s().createRoot({ title: 'Pâtisserie', icon: 'cookie', baseColor: 'oklch(0.32 0.125 348)' })
  const choux = s().addNode(root, 'advance', { title: 'Choux' })
  const eclair = s().addNode(choux, 'advance', { title: 'Éclairs' })
  s().addNode(eclair, 'advance', { title: 'Croquembouche' })
  s().addNode(root, 'branch', { title: 'Macarons' })
  const lap = s().createRoot({ title: 'Lapidary', icon: 'diamond', baseColor: 'oklch(0.32 0.09 205)' })
  s().addNode(lap, 'advance', { title: 'Faceting' })
})
await page.waitForTimeout(900)

const transformOf = (title) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll('.node')].find((n) => n.textContent.includes(t))
    return el?.style.transform ?? ''
  }, title)

const xyOf = async (title) => {
  const t = await transformOf(title)
  const m = t.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}

/* ---------------------------------------------------------- cursor push -- */

const restAt = await xyOf('Croquembouche')
check('nodes get a laid-out transform', restAt !== null, JSON.stringify(restAt))

// Sweep the cursor across the leaf node fast enough to displace it.
const box = await page.locator('.node', { hasText: 'Croquembouche' }).boundingBox()
await page.mouse.move(box.x - 160, box.y + box.height / 2)
let maxDisplacement = 0
for (let i = 0; i <= 12; i++) {
  await page.mouse.move(box.x - 160 + i * 28, box.y + box.height / 2)
  const at = await xyOf('Croquembouche')
  if (at && restAt) maxDisplacement = Math.max(maxDisplacement, Math.hypot(at.x - restAt.x, at.y - restAt.y))
}
check('the cursor displaces nearby nodes', maxDisplacement > 2, `${maxDisplacement.toFixed(1)}px`)
check('displacement is capped', maxDisplacement <= 26, `${maxDisplacement.toFixed(1)}px <= 24px + spring overshoot`)

// A deep leaf must swing further than a root.
const rootRest = await xyOf('Pâtisserie')
const rootBox = await page.locator('.node', { hasText: 'Pâtisserie' }).boundingBox()
await page.mouse.move(rootBox.x - 160, rootBox.y + rootBox.height / 2)
let rootMax = 0
for (let i = 0; i <= 12; i++) {
  await page.mouse.move(rootBox.x - 160 + i * 28, rootBox.y + rootBox.height / 2)
  const at = await xyOf('Pâtisserie')
  if (at && rootRest) rootMax = Math.max(rootMax, Math.hypot(at.x - rootRest.x, at.y - rootRest.y))
}
check('roots barely move, leaves swing furthest', rootMax < maxDisplacement, `root ${rootMax.toFixed(1)} < leaf ${maxDisplacement.toFixed(1)}`)

// Everything must settle back to exactly the laid-out position.
await page.mouse.move(20, 780)
await page.waitForTimeout(1200)
const settled = await xyOf('Croquembouche')
check(
  'displacement always resolves to zero',
  settled && restAt && Math.hypot(settled.x - restAt.x, settled.y - restAt.y) < 0.05,
  `${JSON.stringify(settled)} vs ${JSON.stringify(restAt)}`,
)

// It must never touch persisted state.
const offsets = await page.evaluate(() =>
  Object.values(window.skillTree.getState().graph.nodes).map((n) => n.offset),
)
check(
  'push is never written to offset',
  offsets.every((o) => o.dx === 0 && o.dy === 0),
  JSON.stringify(offsets),
)

// Losing the pointer mid-spring must settle, not freeze.
await page.mouse.move(box.x - 60, box.y + box.height / 2)
await page.mouse.move(box.x + 60, box.y + box.height / 2)
await page.evaluate(() => window.dispatchEvent(new Event('blur')))
await page.waitForTimeout(1000)
const afterBlur = await xyOf('Croquembouche')
check(
  'losing focus mid-spring settles the graph',
  afterBlur && restAt && Math.hypot(afterBlur.x - restAt.x, afterBlur.y - restAt.y) < 0.05,
)

/* ------------------------------------------------------------ edge sync -- */

const leafBox = await page.locator('.node', { hasText: 'Croquembouche' }).boundingBox()
const edgeMovesWithNodes = await page.evaluate(async (box) => {
  // The edge that ends at the leaf must move when the leaf does.
  const paths = [...document.querySelectorAll('.edge')]
  const before = paths.map((p) => p.getAttribute('d'))
  const canvas = document.querySelector('.canvas')
  for (let i = 0; i < 14; i++) {
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: box.x - 140 + i * 26,
        clientY: box.y + box.height / 2,
        pointerType: 'mouse',
        bubbles: true,
      }),
    )
    await new Promise((r) => requestAnimationFrame(r))
  }
  return paths.some((p, i) => p.getAttribute('d') !== before[i])
}, leafBox)
check('edges repaint from displaced positions', edgeMovesWithNodes)

/* ------------------------------------------------------------- add flow -- */

await page.waitForTimeout(900)
await page.locator('.node', { hasText: 'Macarons' }).click({ button: 'right', force: true })
await page.waitForTimeout(300)
await page.getByRole('menuitem', { name: /Advance/ }).click()
await page.getByLabel('Name').fill('Italian meringue')
await page.getByRole('button', { name: 'Create' }).click()
await page.waitForTimeout(600)
const added = await page.evaluate(() => {
  const s = window.skillTree.getState()
  const node = Object.values(s.graph.nodes).find((n) => n.title === 'Italian meringue')
  const parent = node && s.graph.nodes[node.primaryParentId]
  return { depth: node && s.index.depth[node.id], parent: parent?.title, baseColor: node?.baseColor }
})
check('right-click to Advance creates a child', added.parent === 'Macarons' && added.depth === 2, JSON.stringify(added))
check('a new non-root carries no base colour', added.baseColor === null)

/* --------------------------------------------------------- edge draw-in -- */

const drew = await page.evaluate(async () => {
  const s = () => window.skillTree.getState()
  const target = s().index.live.find((n) => n.title === 'Italian meringue')
  s().addNode(target.id, 'advance', { title: 'French meringue' })
  // Sample within the animation window.
  for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
  return document.querySelectorAll('.edge.edge-draw').length
})
check('a new edge draws itself in', drew === 1, `${drew} animating`)
await page.waitForTimeout(600)
check(
  'the draw-in class is cleaned up afterwards',
  (await page.evaluate(() => document.querySelectorAll('.edge.edge-draw').length)) === 0,
)

/* ------------------------------------------------- re-shade on deepening -- */

const reshade = await page.evaluate(() => {
  const s = () => window.skillTree.getState()
  const choux = Object.values(s().graph.nodes).find((n) => n.title === 'Choux')
  const el = () => [...document.querySelectorAll('.node')].find((n) => n.textContent.includes('Choux'))
  const before = getComputedStyle(el().querySelector('.node-tile')).backgroundColor
  const croq = Object.values(s().graph.nodes).find((n) => n.title === 'Croquembouche')
  s().addNode(croq.id, 'advance', { title: 'Pièce montée' })
  return { before, choux: choux.id }
})
await page.waitForTimeout(700)
const after = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.node')].find((n) => n.textContent.includes('Choux'))
  return getComputedStyle(el.querySelector('.node-tile')).backgroundColor
})
check('deepening a chain re-shades its ancestors', after !== reshade.before, `${reshade.before} -> ${after}`)

/* -------------------------------------------------------------- collapse -- */

await page.evaluate(() => {
  const s = window.skillTree.getState()
  s.toggleCollapse(s.index.rootIds[0])
})
await page.waitForTimeout(900)
const collapsed = await page.evaluate(() => ({
  visible: document.querySelectorAll('.node').length,
  badge: document.querySelector('.node-badge')?.textContent,
  crossEdges: document.querySelectorAll('.edge').length,
}))
check('collapsing hides descendants and shows a count', Number(collapsed.badge) > 0, JSON.stringify(collapsed))

await page.evaluate(() => {
  const s = window.skillTree.getState()
  s.toggleCollapse(s.index.rootIds[0])
})
await page.waitForTimeout(900)
const expanded = await page.evaluate(() => document.querySelectorAll('.node').length)
check('expanding brings them back', expanded > collapsed.visible, `${collapsed.visible} -> ${expanded}`)

/* ------------------------------------------------------------ drag/drop -- */

// The view is only fitted on load, and the graph has grown since; reload so
// every node is back on screen before driving the mouse at one.
await page.reload()
await page.waitForFunction(() => window.skillTree?.getState().status === 'ready', { timeout: 20000 })
await page.waitForTimeout(1200)

// Drag a node onto another to re-parent it, and drag one to empty space to
// record an offset.
const dragNodeOnto = async (from, to) => {
  const a = await page.locator('.node', { hasText: from }).boundingBox()
  const b = await page.locator('.node', { hasText: to }).boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + 24)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 30, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + 24, { steps: 12 })
  await page.waitForTimeout(120)
  const highlighted = await page.evaluate(() => !!document.querySelector('.node[data-drop]'))
  await page.mouse.up()
  await page.waitForTimeout(700)
  return highlighted
}

const highlighted = await dragNodeOnto('Italian meringue', 'Faceting')
check('the drop target highlights during a drag', highlighted)
const reparented = await page.evaluate(() => {
  const s = window.skillTree.getState()
  const n = s.index.live.find((n) => n.title === 'Italian meringue')
  return { parent: s.graph.nodes[n.primaryParentId]?.title, offset: n.offset, root: s.graph.nodes[s.index.rootIdOf[n.id]]?.title }
})
check('dropping onto a node re-parents it', reparented.parent === 'Faceting', JSON.stringify(reparented))
check('re-parenting clears the manual offset', reparented.offset.dx === 0 && reparented.offset.dy === 0)

const macBefore = await xyOf('Macarons')
const macBox = await page.locator('.node', { hasText: 'Macarons' }).boundingBox()
await page.mouse.move(macBox.x + macBox.width / 2, macBox.y + 24)
await page.mouse.down()
await page.mouse.move(macBox.x + macBox.width / 2 + 70, macBox.y + 70, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(700)
const nudged = await page.evaluate(() => {
  const s = window.skillTree.getState()
  return s.index.live.find((n) => n.title === 'Macarons').offset
})
check('dropping on empty canvas records an offset', nudged.dx !== 0 || nudged.dy !== 0, JSON.stringify(nudged))
const macAfter = await xyOf('Macarons')
check('the offset moves the node', macBefore && macAfter && Math.hypot(macAfter.x - macBefore.x, macAfter.y - macBefore.y) > 10)

/* ------------------------------------------------------------- keyboard -- */

const viaKeyboard = await page.evaluate(async () => {
  const el = [...document.querySelectorAll('.node')].find((n) => n.textContent.includes('Choux'))
  el.focus()
  const focused = document.activeElement === el
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await new Promise((r) => setTimeout(r, 200))
  return { focused, selected: window.skillTreeUI.getState().selectedId }
})
check('nodes are keyboard reachable and openable', viaKeyboard.focused && viaKeyboard.selected !== null, JSON.stringify(viaKeyboard))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

/* -------------------------------------------------------------- persist -- */

await page.waitForTimeout(600)
await page.reload()
await page.waitForFunction(() => window.skillTree?.getState().status === 'ready', { timeout: 20000 })
await page.waitForTimeout(500)
const persisted = await page.evaluate(() => {
  const s = window.skillTree.getState()
  return {
    nodes: s.index.live.length,
    hasMeringue: s.index.live.some((n) => n.title === 'Italian meringue'),
  }
})
check('the graph survives a reload', persisted.hasMeringue && persisted.nodes > 5, JSON.stringify(persisted))

/* ------------------------------------------------------------- export -- */

// Resolved against BASE_URL: the app is served from a subpath on Pages, so a
// root-absolute module specifier would not exist.
const exported = await page.evaluate(async (moduleUrl) => {
  const { buildExport } = await import(moduleUrl)
  const s = window.skillTree.getState()
  const file = buildExport(s.graph, s.user)
  const round = JSON.parse(JSON.stringify(file))
  return {
    format: round.format,
    nodes: round.nodes.length,
    // A soft-deleted node must be in the export, or it cannot restore.
    includesDeleted: round.nodes.some((n) => n.deletedAt !== null) || Object.values(s.graph.nodes).every((n) => !n.deletedAt),
    hasPrefs: Boolean(round.preferences),
    hasEntries: Array.isArray(round.entries),
  }
}, new URL('src/data/export.ts', BASE_URL).href)
check(
  'export is complete and round-trips as JSON',
  exported.format === 'skill-tree/v1' && exported.nodes > 0 && exported.hasPrefs && exported.hasEntries && exported.includesDeleted,
  JSON.stringify(exported),
)

/* --------------------------------------------------------- dark mode -- */

await page.evaluate(() => window.skillTree.getState().setPrefs({ theme: 'dark' }))
await page.waitForTimeout(500)

// Computed styles come back as literal oklch() strings, so read L directly.
const lightnessProbe = () =>
  page.evaluate(() => {
    const L = (css) => {
      const m = /oklch\(\s*([\d.]+)/.exec(css)
      return m ? Number(m[1]) : null
    }
    const s = window.skillTree.getState()
    const lightnessOf = (id) => {
      const el = document.querySelector(`.node[data-id="${id}"] .node-tile`)
      return el ? L(getComputedStyle(el).backgroundColor) : null
    }
    // Compare a root against the deepest node under it, which is where the
    // ramp's direction actually shows.
    const rootId = s.index.rootIds.find((r) => s.index.maxDepthOfRoot[r] > 0)
    const deepest = s.index.live
      .filter((n) => s.index.rootIdOf[n.id] === rootId && n.state !== 'planned')
      .sort((a, b) => s.index.depth[b.id] - s.index.depth[a.id])[0]
    const tiles = [...document.querySelectorAll('.node:not([data-planned]) .node-tile')]
      .map((t) => L(getComputedStyle(t).backgroundColor))
      .filter((l) => l !== null)
    return {
      theme: document.documentElement.dataset.theme,
      canvas: L(getComputedStyle(document.querySelector('.canvas')).backgroundColor),
      root: lightnessOf(rootId),
      leaf: deepest ? lightnessOf(deepest.id) : null,
      min: Math.min(...tiles),
      max: Math.max(...tiles),
      count: tiles.length,
    }
  })

const dark = await lightnessProbe()
check(
  'dark mode lifts the whole ramp clear of the canvas',
  dark.theme === 'dark' && dark.count > 1 && dark.min > dark.canvas + 0.2,
  JSON.stringify(dark),
)
check('dark mode runs light root -> darker leaf', dark.root > dark.leaf, `root ${dark.root} > leaf ${dark.leaf}`)

await page.evaluate(() => window.skillTree.getState().setPrefs({ theme: 'light' }))
await page.waitForTimeout(500)
const light = await lightnessProbe()
check(
  'light mode keeps every node darker than the canvas',
  light.theme === 'light' && light.max < light.canvas,
  JSON.stringify(light),
)
check('light mode runs dark root -> lighter leaf', light.root < light.leaf, `root ${light.root} < leaf ${light.leaf}`)
check(
  'the ramp is inverted between themes, not shifted',
  light.root < light.leaf && dark.root > dark.leaf,
  `light ${light.root}->${light.leaf}, dark ${dark.root}->${dark.leaf}`,
)

/* --------------------------------------------------- reduced motion -- */

const reduced = await browser.newPage({ viewport: { width: 1280, height: 820 }, reducedMotion: 'reduce' })
await reduced.goto(BASE_URL)
await reduced.waitForFunction(() => window.skillTree?.getState().status === 'ready', { timeout: 20000 })
await reduced.evaluate(() => {
  const s = () => window.skillTree.getState()
  const r = s().createRoot({ title: 'Root', icon: 'diamond' })
  s().addNode(r, 'advance', { title: 'Child' })
})
await reduced.waitForTimeout(700)
const rmState = await reduced.evaluate(async () => {
  const el = () => [...document.querySelectorAll('.node')].find((n) => n.textContent.includes('Child'))
  const before = el().style.transform
  const box = el().getBoundingClientRect()
  const canvas = document.querySelector('.canvas')
  for (let i = 0; i < 10; i++) {
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: box.x - 120 + i * 26, clientY: box.y + 20, pointerType: 'mouse', bubbles: true }),
    )
    await new Promise((r) => requestAnimationFrame(r))
  }
  const during = el().style.transform
  return { before, during, scaled: /scale\(1(\.0+)?\)/.test(before), laidOut: before !== '' }
})
check('reduced motion lays nodes out instantly, at full scale', rmState.laidOut && rmState.scaled, JSON.stringify(rmState))
check('reduced motion disables the cursor push', rmState.before === rmState.during, `${rmState.before} vs ${rmState.during}`)
await reduced.close()

check('no uncaught errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
