'use client'

import { useState } from 'react'

/** The "Email me new drops" tap. The link's order and token are read in the browser and sent in a POST body. */
export function DropsConsent({ shopName }: { shopName: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const send = async () => {
    setState('busy')
    const q = new URLSearchParams(window.location.search)
    try {
      const r = await fetch('/api/shop/email-drops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ o: q.get('o'), t: q.get('t') }) })
      if (r.ok) { setState('done'); return }
      const j = await r.json().catch(() => ({}))
      setError(typeof j.error === 'string' && r.status !== 400 ? j.error : 'This link has expired.'); setState('error')
    } catch { setError('No connection. Try again.'); setState('error') }
  }
  return (
    <section className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>New drops from {shopName}</h1>
      {state === 'done' ? (
        <p role="status" className="mt-4">Done. You’ll get an email when something new arrives.</p>
      ) : (
        <>
          <p className="mt-4 text-store-sub">An email when something new arrives. Each one has a link to stop.</p>
          <button type="button" onClick={send} disabled={state === 'busy'} className="mt-6 grid h-12 w-full place-items-center rounded-sm bg-store-ink text-store-paper disabled:opacity-60">Email me new drops</button>
          {state === 'error' ? <p role="alert" className="mt-4">{error}</p> : null}
        </>
      )}
    </section>
  )
}
