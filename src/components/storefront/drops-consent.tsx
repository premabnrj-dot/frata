'use client'

import { useState } from 'react'
import { useStoreToast } from './store-toast'

/** The "Email me new drops" tap. The link's order and token live in the #fragment (never in a log) and go in a POST body. */
export function DropsConsent({ shopName }: { shopName: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'expired'>('idle')
  const toast = useStoreToast()
  const send = async () => {
    setState('busy')
    const q = new URLSearchParams(window.location.hash.slice(1))
    try {
      const r = await fetch('/api/shop/email-drops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ o: q.get('o'), t: q.get('t') }) })
      if (r.ok) { setState('done'); return }
      const j = await r.json().catch(() => ({}))
      // A link that no longer works is the page's state; any other refusal is a failure after the tap (§ Feedback 1).
      if (r.status === 400 || typeof j.error !== 'string') { setState('expired'); return }
      setState('idle'); toast.error(j.error)
    } catch { setState('idle'); toast.error('No connection. Try again.') }
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
          {/* feedback-ok: the page's state (this link no longer works), not a failure after a button */}
          {state === 'expired' ? <p role="alert" className="mt-4">This link has expired.</p> : null}
        </>
      )}
    </section>
  )
}
