# Skill tree

A record of what you are learning, as a graph you author yourself. You create a
root, name it, and grow it — **Advance** for the same skill going further,
**Branch** for a new skill beside it. Depth encodes advancement, so there are no
levels, no XP and no points, and nothing decays or nags. Many skills go a year
between entries; silence is not failure.

<!-- Screenshots live in docs/ once you have a graph worth showing. -->

## Running it

```sh
npm install
npm run dev
```

That is enough. With no backend configured the app runs in **local mode** — the
same features, with the graph in IndexedDB on that one device and no account.

To sync across devices, point it at a Supabase project:

```sh
cp .env.example .env      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

`supabase/migrations/0001_init.sql` sets up everything: tables, invite-only
registration, row-level security and the photo bucket. See
[`supabase/README.md`](supabase/README.md) for seeding the first invite code.

```sh
npm run build         # typecheck + production build
npm test              # 56 unit tests: graph rules, tint ramp, layout, store, merge
npm run test:browser  # 15 runtime checks (needs `npm run dev` running)
```

## How it fits together

```
src/
  types.ts              the whole data model
  lib/
    graph/graph.ts      derived index: depth, root, D per root, cycle validation
    graph/layout.ts     dagre orchard — one subgraph per root, edge geometry
    color/tint.ts       the depth ramp, dark-mode inversion, cross-link gradients
    color/palette.ts    the curated root colours
    icons/search.ts     ranked search over the local Phosphor catalog
    motion/spring.ts    the spring integrator
  canvas/
    engine.ts           one rAF loop: node transforms and edge repaints
    viewport.ts         pan, zoom, fit
    Canvas.tsx          gestures, focus mode, collapse, edges
  data/
    adapter.ts          the Backend interface
    local.ts            IndexedDB backend (local mode)
    supabase.ts         Supabase backend
    sync.ts             local cache and a durable outbox
    merge.ts            last-write-wins, matching the server
    store.ts            every mutation and the structural rules
  stats/
    registry.ts         auto-discovers ./defs
    defs/*.tsx          one file per stat
```

### Things worth knowing before changing it

**Tints are never persisted.** A node stores `baseColor` only if it is a root;
every other node derives its colour from its depth and its root's total depth,
recomputed on every render. Adding a node re-shades its ancestors — that is the
branch visibly deepening, not a bug.

**Layout position and render transform are separate layers.** Dagre plus the
node's manual `offset` gives the laid-out position. The cursor push writes a
transform on top of it and always springs back to zero; it must never reach
`offset` or any persisted field. `browser-test.mjs` asserts this.

**One rAF loop owns every per-frame write.** Layout springs, node birth, the
cursor push and edge repainting all live in `CanvasEngine`, because they all
write the same properties and would otherwise fight. Nothing per-frame goes
through React state.

**Overlays on the canvas need `canvas-overlay`.** React propagates events
through the React tree rather than the DOM tree, so anything layered over the
canvas — even in a portal — reaches the canvas gesture handler and gets its
click swallowed by pointer capture unless it carries that class.

**Adding a stat is adding one file.** Drop a module into `src/stats/defs/`
exporting `stat: StatModule` and the grid picks it up. Do not edit a layout.

**Isolation is enforced in the database.** Every row carries `user_id`, every
policy checks it against `auth.uid()`, and every policy also requires a profile
row — so an account that authenticated but never redeemed an invite can read
and write nothing.

Design and interaction calls, including the decisions the spec left open, are
in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Your data

One button exports the whole graph as JSON, deleted rows included, so it can
restore rather than only inform. Account deletion removes every node, entry and
photo. Photos are downscaled in the browser before they are sent; full
resolution originals are never stored.
