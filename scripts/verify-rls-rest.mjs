/**
 * Row-level security, verified at the REST layer against a live project.
 *
 * This is deliberately not a UI check: the app filters by user_id itself, so it
 * would look correct even with RLS wide open. Here we talk to PostgREST
 * directly with raw tokens.
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/verify-rls-rest.mjs
 *
 * The anonymous probe runs with nothing but those two values and catches the
 * catastrophic case — RLS off, or a `using (true)` policy — because an
 * unauthenticated request would then return rows.
 *
 * The cross-account leg needs two real member accounts. Supply either:
 *   TEST_A_EMAIL/TEST_A_PASSWORD + TEST_B_EMAIL/TEST_B_PASSWORD  (password auth)
 *   TEST_A_TOKEN / TEST_B_TOKEN                                  (access tokens)
 * plus TEST_A_INVITE / TEST_B_INVITE if the accounts are not members yet.
 */
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
  process.exit(2)
}

const TABLES = ['nodes', 'milestones', 'log_entries', 'photos', 'preferences', 'profiles', 'invite_codes']
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Raw PostgREST call, so nothing in the client library can mask the result. */
async function rest(path, token) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}` },
  })
  const body = await res.text()
  let rows = null
  try {
    const parsed = JSON.parse(body)
    if (Array.isArray(parsed)) rows = parsed
  } catch {
    /* an error object, not rows */
  }
  return { status: res.status, rows, body: body.slice(0, 200) }
}

/* ------------------------------------------ 1. anonymous sees nothing ---- */

for (const table of TABLES) {
  const { status, rows, body } = await rest(`${table}?select=*&limit=5`)
  const leaked = Array.isArray(rows) && rows.length > 0
  check(
    `anonymous cannot read ${table}`,
    !leaked,
    leaked ? `LEAK: ${rows.length} rows returned` : `HTTP ${status}, ${rows ? '0 rows' : body.slice(0, 60)}`,
  )
}

/* ------------------------------------------ 2. cross-account isolation --- */

async function session(label) {
  const token = process.env[`TEST_${label}_TOKEN`]
  if (token) return { token, id: null }

  const email = process.env[`TEST_${label}_EMAIL`]
  const password = process.env[`TEST_${label}_PASSWORD`]
  if (!email || !password) return null

  const client = createClient(URL_, ANON, { auth: { persistSession: false } })
  let { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    ;({ data, error } = await client.auth.signUp({ email, password }))
    if (error) throw new Error(`${label}: ${error.message}`)
  }
  if (!data.session) throw new Error(`${label}: no session (is email confirmation on?)`)

  const invite = process.env[`TEST_${label}_INVITE`]
  if (invite) {
    await client.rpc('redeem_invite', { invite_code: invite, display_name: label })
  }
  return { token: data.session.access_token, id: data.user.id, client }
}

let a = null
let b = null
try {
  a = await session('A')
  b = await session('B')
} catch (e) {
  console.error(`\ncould not establish test sessions: ${e.message}`)
}

if (!a || !b) {
  console.log('\nSKIPPED the cross-account leg: no credentials for two accounts.')
  console.log('Set TEST_A_EMAIL/TEST_A_PASSWORD and TEST_B_EMAIL/TEST_B_PASSWORD')
  console.log('(plus TEST_A_INVITE/TEST_B_INVITE if they are not members yet), or')
  console.log('TEST_A_TOKEN/TEST_B_TOKEN with two access tokens.')
} else {
  // Give B something to steal.
  const bClient = b.client
  if (bClient) {
    await bClient.from('nodes').insert({
      id: crypto.randomUUID(),
      user_id: b.id,
      title: 'B private node',
      icon: 'diamond',
      parent_ids: [],
      primary_parent_id: null,
      state: 'started',
      updated_at: new Date().toISOString(),
    })
  }

  for (const table of TABLES) {
    const filter = b.id && table !== 'invite_codes' && table !== 'profiles' ? `user_id=eq.${b.id}&` : ''
    const { status, rows, body } = await rest(`${table}?${filter}select=*&limit=5`, a.token)
    const leaked = Array.isArray(rows) && rows.length > 0
    check(
      `A cannot read B's rows in ${table}`,
      !leaked,
      leaked ? `LEAK: ${rows.length} rows` : `HTTP ${status}, ${rows ? '0 rows' : body.slice(0, 60)}`,
    )
  }

  // Storage: A must not list or fetch objects under B's prefix by writing there.
  const put = await fetch(`${URL_}/storage/v1/object/photos/${b.id ?? 'unknown'}/stolen.txt`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${a.token}`, 'Content-Type': 'text/plain' },
    body: 'x',
  })
  check("A cannot upload into B's storage folder", put.status >= 400, `HTTP ${put.status}`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
