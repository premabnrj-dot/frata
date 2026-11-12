'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Money } from '@/components/data/numeric'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { paise } from '@/domains/money/paise'
import { retryOrderRefund, shipWithoutChange } from '../../edit-actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/edit/paid-online.tsx
//
// A PAID-ONLINE ORDER'S EDIT ON THE ORDER PAGE (order edit OE·2). Inside the Items card:
// - a change waiting for the shopper's payment: each change, what it asks, "Copy payment link" (for WhatsApp: the order's
//   own page, where the shopper pays) and "Ship without the change" (drops it; the order packs as it was);
// - each refund as its latest attempt: when it sends, with Razorpay, processed, or "Refund ₹X not sent" with the cause
//   and Try again (the edit stands either way).
// A failure after a button is an error toast (design-language § Feedback 1).
// =============================================================================

export function WaitingChange({ orderId, asked, total, changes, link, canAct }: { orderId: string; asked: number; total: number; changes: string[]; link: string; canAct: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const copy = () => { void navigator.clipboard?.writeText(link).then(() => toast({ text: 'Payment link copied.' }), () => toast.error('Could not copy. Open the order page and copy its address.')) }
  const drop = async () => {
    if (busy) return
    setBusy(true)
    try {
      const r = await shipWithoutChange(orderId)
      if (r.ok) toast({ text: 'The change is dropped. Pack it as it was.' }); else toast.error(r.error)
      router.refresh()
    } catch { toast.error('We could not do that. Check your connection; nothing was changed.') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 rounded-md border border-warn bg-warn/40 p-3 text-sm" data-waiting-change>
      <div className="flex items-baseline justify-between gap-3">
        <b>Waiting for <Money paise={paise(asked)} /> from the shopper</b>
        <span className="font-mono tabular-nums text-muted-foreground">New total <Money paise={paise(total)} /></span>
      </div>
      {changes.length ? <ul className="space-y-1">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copy}>Copy payment link</Button>
        {canAct ? <Button variant="ghost" aria-disabled={busy} onClick={() => void drop()}>Ship without the change</Button> : null}
      </div>
    </div>
  )
}

export type RefundView = { id: string; amount: number; words: string; failed: string | null }

export function RefundRows({ rows, canAct }: { rows: RefundView[]; canAct: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const again = async (id: string) => {
    if (busy) return
    setBusy(id)
    try {
      const r = await retryOrderRefund(id)
      if (r.ok) toast({ text: 'Refund sent to Razorpay again.' }); else toast.error(r.error)
      router.refresh()
    } catch { toast.error('We could not send that. Check your connection; nothing was changed.') } finally { setBusy(null) }
  }
  if (!rows.length) return null
  return (
    <ul className="space-y-2 border-t border-border pt-3 text-sm" data-refunds>
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className={r.failed ? 'font-medium' : undefined}>{r.failed ? 'Refund ' : ''}<Money paise={paise(r.amount)} /> {r.words}</span>
            {r.failed ? <span className="block text-muted-foreground">{r.failed}</span> : null}
          </span>
          {r.failed && canAct ? <Button variant="secondary" aria-disabled={busy === r.id} onClick={() => void again(r.id)}>Try again</Button> : null}
        </li>
      ))}
    </ul>
  )
}
