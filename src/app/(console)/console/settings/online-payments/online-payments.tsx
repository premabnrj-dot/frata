'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { connectRazorpay, disconnectRazorpay } from './actions'
import { Section } from '@/components/layout/section'
import { sinceIN } from '@/lib/format-date'

type Status = { keyId: string; mode: 'test' | 'live'; webhookSeenAt: string | null; lastEventAt: string | null; problem: string | null; webhookUrl: string; webhookSecret: string | null } | null


/**
 * Connect (keys checked with Razorpay first), then the one webhook step, written out. `now` is the server's render
 * time: "last event 5 min ago" is worked out from it on the server AND in the browser, so the two always match
 * (reading the browser's own clock here threw React #418 when the minute turned between render and hydration).
 */
export function OnlinePayments({ status, support, available, now }: { status: Status; support: boolean; available: boolean; now: string }) {
  const router = useRouter()
  const [keyId, setKeyId] = useState(status?.keyId ?? '')
  const [secret, setSecret] = useState('')
  const [err, setErr] = useState<{ field?: string; text: string } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  const badge = !status ? <Badge>Not connected</Badge> : status.problem ? <Badge tone="danger">Needs attention</Badge> : !status.webhookSeenAt ? <Badge tone="warn">Needs one step</Badge> : status.mode === 'test' ? <Badge tone="info">Test mode</Badge> : <Badge tone="ok">Live</Badge>

  const connect = () => start(async () => {
    setErr(null); setDone(null)
    const r = await connectRazorpay({ keyId, keySecret: secret })
    if (!r.ok) { setErr({ field: r.field, text: r.error }); return }
    setSecret(''); setDone('Connected. Razorpay accepted the keys.'); router.refresh()
  })
  const disconnect = () => start(async () => {
    const r = await disconnectRazorpay()
    if (!r.ok) { setErr({ text: r.error }); return }
    setConfirm(false); setKeyId(''); setDone('Disconnected. Shoppers can pay on delivery only.'); router.refresh()
  })
  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {})

  return (
    <>
      <Section>
        <div className="flex items-center justify-between gap-3"><h2 className="text-section font-semibold">Razorpay</h2>{badge}</div>
        <p className="text-sm text-muted-foreground">Shoppers pay by UPI, card or netbanking into your own Razorpay account. Razorpay settles to your bank; Frrata never holds your money.</p>
        {status?.problem && <p role="alert" className="rounded-md bg-danger p-3 text-sm text-danger-text">{status.problem}</p>}
      </Section>

      <Section>
        <h2 className="text-section font-semibold">1 · Your keys</h2>
        {support ? <p className="text-sm text-muted-foreground">Only the shop’s owner can connect or change Razorpay keys — not Frrata support.</p> : !available ? <p className="text-sm text-muted-foreground">Online payments are not switched on for Frrata yet.</p> : (
          <>
            <div className="space-y-1"><label htmlFor="key-id" className="block text-sm font-medium">Key ID</label>
              <input id="key-id" value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" spellCheck={false} placeholder="rzp_live_…" aria-invalid={err?.field === 'keyId' || undefined}
                className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 font-mono text-sm aria-invalid:border-danger-text" /></div>
            <div className="space-y-1"><label htmlFor="key-secret" className="block text-sm font-medium">Key secret</label>
              <input id="key-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" placeholder={status ? 'Saved — paste a new one to change it' : ''} aria-invalid={err?.field === 'keySecret' || undefined}
                className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 font-mono text-sm aria-invalid:border-danger-text" /></div>
            <p className="text-xs text-muted-foreground">Razorpay → Account &amp; Settings → API keys. The secret is shown there once: generate a new pair if you do not have it.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={pending || !keyId || !secret} onClick={connect}>{pending ? 'Checking with Razorpay…' : status ? 'Test and save new keys' : 'Test and connect'}</Button>
              {status && <span className="text-sm text-muted-foreground">Connected: <span className="font-mono">{status.keyId}</span></span>}
            </div>
            <p className="text-xs text-muted-foreground">The keys are checked with Razorpay before saving; wrong keys are refused and nothing changes. Saved keys are encrypted and never shown again.</p>
          </>
        )}
        {err && <p role="alert" className="text-sm text-danger-text">{err.text}</p>}
        {done && <p role="status" className="text-sm text-ok-text">{done}</p>}
      </Section>

      {status && (
        <Section>
          <h2 className="text-section font-semibold">2 · Tell Razorpay where to send payments</h2>
          <p className="text-sm text-muted-foreground">Done once, in your Razorpay dashboard: Account &amp; Settings → Webhooks → Add new webhook. If a shopper pays and closes the page, this is how your shop learns the order is paid.</p>
          <ol className="space-y-3 text-sm">
            <li><span className="font-medium">Webhook URL</span>
              <div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted px-2 py-2 text-xs">{status.webhookUrl}</code><Button variant="secondary" onClick={() => copy(status.webhookUrl)}>Copy</Button></div></li>
            <li><span className="font-medium">Secret</span>
              {status.webhookSecret
                ? <div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted px-2 py-2 text-xs">{status.webhookSecret}</code><Button variant="secondary" onClick={() => copy(status.webhookSecret!)}>Copy</Button></div>
                : <p className="mt-1 text-muted-foreground">Already in Razorpay (hidden since the first event arrived).</p>}</li>
            <li><span className="font-medium">Events</span>: tick <code>payment.captured</code>, <code>payment.failed</code> and <code>order.paid</code>. Save.</li>
          </ol>
          <p className="text-sm">{status.webhookSeenAt ? <Badge tone="ok">Working · last event {sinceIN(status.lastEventAt ?? status.webhookSeenAt, new Date(now))}</Badge> : <Badge>Waiting for Razorpay’s first event…</Badge>}</p>
          {status.mode === 'test' && <p className="text-xs text-muted-foreground">Test keys (rzp_test_) let you try Razorpay, but an open shop offers online payment only with live keys and a webhook that has worked.</p>}
        </Section>
      )}

      {status && !support && (
        <Section className="text-sm">
          {confirm
            ? <div className="flex flex-wrap items-center gap-3"><span>Disconnect Razorpay? Shoppers can then pay on delivery only. Past orders are kept.</span><Button variant="secondary" disabled={pending} onClick={disconnect}>Disconnect</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setConfirm(false)}>Keep it</button></div>
            : <button type="button" className="inline-flex min-h-6 items-center text-danger-text underline" onClick={() => setConfirm(true)}>Disconnect Razorpay</button>}
        </Section>
      )}
    </>
  )
}
