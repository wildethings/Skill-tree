import { useState } from 'react'
import { useData } from '../data/store'
import { Icon } from './Icon'

/** Magic link only — no passwords — and an invite code before any data exists. */
export function Auth() {
  const status = useData((s) => s.status)
  const pendingEmail = useData((s) => s.pendingEmail)
  const signIn = useData((s) => s.signIn)
  const redeemInvite = useData((s) => s.redeemInvite)
  const signOut = useData((s) => s.signOut)

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <span className="auth-mark">
          <Icon name="tree" size={30} />
        </span>

        {status === 'needs-invite' ? (
          <>
            <h1>One more thing</h1>
            <p className="hint">
              Signed in as {pendingEmail}. This is invite-only, so it needs a code before anything is created.
            </p>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              aria-label="Display name"
            />
            <input
              className="field"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Invite code"
              aria-label="Invite code"
              autoCapitalize="characters"
            />
            <button
              className="btn btn-primary btn-block"
              disabled={busy || !code.trim()}
              onClick={() => run(() => redeemInvite(code.trim(), name.trim()))}
            >
              Join
            </button>
            <button className="linkish auth-alt" onClick={signOut}>
              Use a different address
            </button>
          </>
        ) : (
          <>
            <h1>Skill tree</h1>
            <p className="hint">A record of what you are learning, and how far each thing has come.</p>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && run(async () => setMessage(await signIn(email.trim())))}
              placeholder="you@example.com"
              aria-label="Email address"
            />
            <button
              className="btn btn-primary btn-block"
              disabled={busy || !email.includes('@')}
              onClick={() => run(async () => setMessage(await signIn(email.trim())))}
            >
              {busy ? 'Sending…' : 'Send me a link'}
            </button>
            {message ? <p className="auth-message">{message}</p> : null}
          </>
        )}

        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    </div>
  )
}
