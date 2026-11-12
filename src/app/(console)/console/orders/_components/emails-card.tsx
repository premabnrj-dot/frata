'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { resendOrderEmailAction, setOrderEmailAction } from '../email-actions'

export type CardEmail = { id: string; name: string; kind: string; at: string; state: string; words: string }
const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'info'> = { delivered: 'ok', sent: 'info', bounced: 'danger', complained: 'danger', failed: 'danger', skipped: 'neutral', queued: 'neutral', sending: 'neutral' }

/** The order's emails to the shopper, each in words; fix the address; send the last one again. */
export function EmailsCard({ orderId, email, emails, canAct }: { orderId: string; email: string | null; emails: CardEmail[]; canAct: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(email ?? '')
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const last = emails[0]
  // The result is a toast (design-language § Feedback): ok after the save or the resend, the refusal as an error.
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => start(async () => {
    const r = await fn().catch(() => ({ ok: false, error: 'We could not reach Frrata. Nothing was changed.' }))
    if (!r.ok) { toast.error(r.error ?? 'Something went wrong.'); return }
    toast.ok(done); setEditing(false); router.refresh()
  })
  return (
    <div className="space-y-2 text-sm">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="order-email" className="sr-only">Shopper’s email</label>
          <input id="order-email" type="email" value={value} onChange={(e) => setValue(e.target.value)} maxLength={254} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 font-mono text-sm md:h-9" />
          <Button disabled={pending} onClick={() => run(() => setOrderEmailAction(orderId, value), 'Saved.')}>Save</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-2"><span className="font-mono">{email ?? 'No email'}</span>
          {canAct ? <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-2">{email ? 'Fix the address' : 'Add an email'}</button> : null}</p>
      )}
      {emails.length ? (
        <ul className="divide-y divide-border">
          {emails.map((e) => <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{e.name}<br /><span className="text-xs text-muted-foreground">{e.at}</span></span><Badge tone={TONE[e.state] ?? 'neutral'}>{e.words}</Badge></li>)}
        </ul>
      ) : null}
      {canAct && last && email ? <Button variant="secondary" disabled={pending} onClick={() => run(() => resendOrderEmailAction(orderId, last.kind), 'Sending again.')}>Send “{last.name}” again</Button> : null}
    </div>
  )
}
