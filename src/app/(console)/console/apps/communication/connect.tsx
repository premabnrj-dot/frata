'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { connectWhatsAppAction } from './actions'
import { settle } from '@/lib/settle'
import { Journey } from '@/components/brand/journey'

// =============================================================================
// Connect WhatsApp (C1 · mockup Connect). Two paths, then Meta's popup (Embedded Signup v4; the Facebook SDK is
// loaded on this page only, when it opens). The popup's ids are only a hint: the server reads the real ones
// from the token. The code lives 30 s, so it goes to the server at once.
// =============================================================================

type FBLogin = { authResponse?: { code?: string } | null }
declare global {
  interface Window {
    FB?: { init: (o: object) => void; login: (cb: (r: FBLogin) => void, o: object) => void }
    fbAsyncInit?: () => void
  }
}

const SDK = 'https://connect.facebook.net/en_US/sdk.js'
function loadSdk(appId: string, version: string): Promise<boolean> {
  if (window.FB) return Promise.resolve(true)
  return new Promise((res) => {
    window.fbAsyncInit = () => { window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version }); res(true) }
    const s = document.createElement('script')
    s.src = SDK; s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
    s.onerror = () => res(false)
    document.head.appendChild(s)
    setTimeout(() => res(!!window.FB), 15_000) // a blocked or silent script never hangs the page
  })
}

type Path = 'app' | 'new'

export function ConnectChoices({ ready, canManage, appId, configId, graphVersion }: { ready: boolean; canManage: boolean; appId: string; configId: string; graphVersion: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<Path | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hint = useRef<{ wabaId?: string; phoneNumberId?: string }>({})

  // Meta's popup posts the ids it used. Only from facebook.com, only the WhatsApp signup event (Meta's own check).
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/.test(e.origin)) return
      let d: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; error_message?: string } } | null = null
      try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      if (d?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (d.event?.startsWith('FINISH')) hint.current = { wabaId: d.data?.waba_id, phoneNumberId: d.data?.phone_number_id }
      if (d.event === 'CANCEL') { setBusy(null); setError(null) }
      if (d.event === 'ERROR') { setBusy(null); setError('Meta stopped the sign-up. Try again.') }
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])

  const start = async (path: Path) => {
    setError(null); setBusy(path)
    if (!(await loadSdk(appId, graphVersion)) || !window.FB) { setBusy(null); setError('Meta’s window did not load. Check your connection and try again.'); return }
    window.FB.login((r) => {
      const code = r.authResponse?.code
      if (!code) { setBusy(null); return } // closed or cancelled
      // The ids arrive as a message just before this; give them a moment, then send the code (it lives 30 s).
      setTimeout(async () => {
        try {
          const res = await connectWhatsAppAction({ code, hint: hint.current })
          if (!res.ok) { setBusy(null); setError(res.error); return }
          settle(router)
        } catch {
          setBusy(null); setError('We could not reach Frrata. Nothing was saved. Try again.')
        }
      }, 300)
    }, {
      config_id: configId, response_type: 'code', override_default_response_type: true,
      extras: path === 'app' ? { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } : { setup: {}, sessionInfoVersion: '3' },
    })
  }

  const off = !ready || !canManage || busy !== null
  const card = 'flex flex-col gap-3 rounded-lg bg-card p-5 text-left disabled:cursor-not-allowed'
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {!ready ? <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">WhatsApp isn’t switched on for Frrata yet. It’s coming soon.</p> : null}
      {ready && !canManage ? <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">Ask the shop’s owner or an admin to connect WhatsApp.</p> : null}
      <div className="grid gap-4 md:grid-cols-2" data-tinge>
        <button type="button" disabled={off} onClick={() => start('app')} className={`${card} border-2 border-foreground`}>
          <span aria-hidden="true" className="inline-grid size-14 place-items-center rounded-xl bg-muted"><Icon name="prepaid" className="size-8" /></span>
          <span className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">I use the WhatsApp Business app</span><Badge tone="ok">Most brands</Badge></span>
          <span className="text-sm text-muted-foreground">Keep the app on your phone. Last 6 months of chats come across.</span>
          <span className="text-sm font-medium">{busy === 'app' ? 'Connecting…' : 'Connect this number'}</span>
        </button>
        <button type="button" disabled={off} onClick={() => start('new')} className={`${card} border border-input`}>
          <span aria-hidden="true" className="inline-grid size-14 place-items-center rounded-xl bg-muted"><Icon name="messages" className="size-8" /></span>
          <span className="text-base font-semibold">A new number</span>
          <span className="text-sm text-muted-foreground">Not on WhatsApp yet. Verified by OTP.</span>
          <span className="text-sm font-medium">{busy === 'new' ? 'Connecting…' : 'Use a new number'}</span>
        </button>
      </div>
      <p className="flex flex-wrap items-center gap-1 text-sm">
        What changes in the app
        <InfoTip about="what changes in the WhatsApp Business app">Broadcast lists become read-only. Linked computers sign out once. Open the app at least every 2 weeks, or it disconnects.</InfoTip>
      </p>
      <p className="flex flex-wrap items-center gap-1 text-sm">
        Already on Interakt, Wati or another tool?
        <InfoTip about="moving from another tool">A number can’t move between tools any more. In your tool’s WhatsApp settings, share the account with Frrata as a partner, then pick it in Meta’s window here.</InfoTip>
      </p>
      {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      {/* What happens next, drawn as three steps (visual changes, owner-approved 2026-11-08). */}
      <section aria-label="What happens next" className="space-y-3 rounded-md bg-muted px-4 py-4 text-sm">
        <Journey label="Connecting WhatsApp, in three steps" steps={[
          { icon: 'external', title: 'Meta’s window opens' },
          { icon: 'merchants', title: 'Pick your business', next: true },
          { icon: 'messages', title: 'Pick your number', next: true },
        ]} />
        <p className="text-muted-foreground">Takes about 3 minutes.</p>
      </section>
    </div>
  )
}
