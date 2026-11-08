'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Menu, type MenuItem } from '@/components/ui/menu'
import { Toaster, useToast } from '@/components/ui/toast'
import { CANCEL_LABEL, CANCEL_REASONS, type CancelReason } from '@/domains/orders/work'
import { cancelOrder, confirmOrder, holdOrder, packOrder, undoOrderAction, unholdOrder } from '../actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/order-actions.tsx
//
// THE ORDER PAGE'S ACTIONS (1D·4c): ONE primary action for the order's state
// (primaryAction(), src/domains/orders/work.ts) and the rest under More. The
// server decides what this person may do (`may`, passed in) and checks it
// again in every action. Confirm and Hold are instant with Undo; Cancel loses
// work and money, so it asks — with a reason, "Put stock back", and what to
// refund. On a phone the primary action sits fixed above the bottom bar.
// =============================================================================

export type OrderActionsProps = {
  orderId: string; number: string
  primary: 'confirm' | 'pack' | 'print_slip' | 'cancel' | null
  /** The print pages this order has now: a slip once it is placed, an invoice once packed. */
  print: { slip: string | null; invoice: string | null }
  /** The same documents as PDF downloads (Documents D1). */
  pdf?: { slip: string | null; invoice: string | null }
  /** Which More items this person may use on this order now. */
  may: { hold: boolean; unhold: boolean; cancel: boolean; pack: boolean; confirm: boolean }
  /** High or unreadable risk: confirming is still allowed here (a person is looking), but it asks first. */
  riskWarning: string | null
  /** A held order already paid online: Confirm releases it (it needs no confirming). */
  heldPaid: boolean
  /** Paise to refund in Razorpay if cancelled (paid online), else 0. */
  refund: number
  refundLabel: string
  /** Whether any line's stock was taken (so "Put stock back" means something). */
  stockTaken: boolean
}

function Actions(p: OrderActionsProps) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [riskOpen, setRiskOpen] = useState(false)
  const [reason, setReason] = useState<CancelReason | ''>('')
  const [note, setNote] = useState('')
  const [restock, setRestock] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; eventId?: string; by?: { email: string | null; at: string } }>, undo = false) {
    if (busy) { toast({ text: 'Still saving the last change…' }); return null }
    setBusy(true)
    let r: Awaited<ReturnType<typeof fn>>
    try { r = await fn() } catch { r = { ok: false, error: 'We could not save that. Check your connection; nothing was changed.' } } finally { setBusy(false) }
    if (!r.ok) {
      const by = r.by ? ` by ${r.by.email ?? 'someone'} at ${new Date(r.by.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''
      toast({ text: `${r.error}${by}.` }); router.refresh(); return null
    }
    const eventId = r.eventId
    toast({ text: `${p.number} ${label}.`, undo: undo && eventId ? async () => { const u = await undoOrderAction(eventId); router.refresh(); return u.ok ? { ok: true } : { ok: false, error: u.error } } : undefined })
    router.refresh()
    return r
  }

  const confirm = () => run(p.heldPaid ? 'released from hold' : 'confirmed', () => confirmOrder(p.orderId), true)
  // The primary button only when this person may do it (the action checks again): the role table can change.
  const primary = p.primary === 'confirm' && p.may.confirm ? { label: p.heldPaid ? 'Release from hold' : 'Confirm', go: () => (p.riskWarning ? setRiskOpen(true) : void confirm()) }
    : p.primary === 'pack' && p.may.pack ? { label: 'Mark packed', go: () => void run('packed', async () => { const r = await packOrder(p.orderId); return r.ok ? { ...r, ok: true } : r }) }
    : p.primary === 'cancel' && p.may.cancel ? { label: 'Cancel and refund…', go: () => setCancelOpen(true) } : null
  // Packed: the next thing is the slip in the parcel — a link (a page to print), not an action.
  const printPrimary = p.primary === 'print_slip' && p.print.slip ? p.print.slip : null

  const items: MenuItem[] = [
    ...(p.may.hold ? [{ label: 'Put on hold', onSelect: () => void run('put on hold', () => holdOrder(p.orderId), true) }] : []),
    ...(p.may.unhold ? [{ label: 'Take off hold', onSelect: () => void run('taken off hold', () => unholdOrder(p.orderId)) }] : []),
    ...(p.print.slip && !printPrimary ? [{ label: 'Print packing slip', href: p.print.slip }] : []),
    ...(p.print.invoice ? [{ label: 'Print invoice', href: p.print.invoice }] : []),
    ...(p.pdf?.slip ? [{ label: 'Download packing slip (PDF)', href: p.pdf.slip }] : []),
    ...(p.pdf?.invoice ? [{ label: 'Download invoice (PDF)', href: p.pdf.invoice }] : []),
    { label: 'Copy link', onSelect: () => { void navigator.clipboard?.writeText(window.location.href).then(() => toast({ text: 'Link copied.' }), () => toast({ text: 'Copy the address from the address bar.' })) } },
    ...(p.may.cancel && p.primary !== 'cancel' ? [{ label: 'Cancel order…', onSelect: () => setCancelOpen(true), danger: true }] : []),
  ]

  async function doCancel() {
    if (!reason) { setError('Pick a reason.'); return }
    if (reason === 'other' && !note.trim()) { setError('Say why in a few words.'); return }
    setError(null)
    const r = await run('cancelled', () => cancelOrder(p.orderId, { reason, note: note.trim() || undefined, restock }))
    if (r) setCancelOpen(false)
  }

  const primaryButton = primary ? <Button onClick={primary.go} aria-disabled={busy}>{primary.label}</Button>
    : printPrimary ? <Link prefetch={false} href={printPrimary} className={button()}>Print packing slip</Link> : null
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden md:contents">{primaryButton}</span>
        <Menu items={items} />
      </div>
      {/* On a phone the one primary action is fixed above the bottom bar (spec 1D·2), the page padded for it. */}
      {primaryButton ? (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-background px-4 py-3 md:hidden print:hidden [&>*]:w-full">
          {primaryButton}
        </div>
      ) : null}

      <Dialog open={riskOpen} onClose={() => setRiskOpen(false)} title={`Confirm ${p.number}?`} description={p.riskWarning}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setRiskOpen(false)}>Not yet</Button><Button onClick={() => { setRiskOpen(false); void confirm() }}>Confirm anyway</Button></>} />

      <Dialog open={cancelOpen} onClose={() => { setCancelOpen(false); setError(null) }} title={`Cancel ${p.number}?`}
        description={p.refund ? <>It was paid online: refund <strong>{p.refundLabel}</strong> in your Razorpay dashboard after cancelling (Frrata does not move the money). Frrata does not tell the customer: tell them on WhatsApp or by phone.</> : 'Frrata does not tell the customer: tell them on WhatsApp or by phone.'}
        actions={<><Button variant="secondary" data-autofocus onClick={() => { setCancelOpen(false); setError(null) }}>Keep the order</Button><Button variant="destructive" onClick={doCancel} aria-disabled={busy}>Cancel order</Button></>}>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Why?</legend>
          {CANCEL_REASONS.map((r) => (
            <label key={r} className="flex min-h-10 items-center gap-3 text-sm md:min-h-9">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-5 accent-primary" />{CANCEL_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1 text-sm">
          <span>Note {reason === 'other' ? '' : <span className="text-muted-foreground">(optional)</span>}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="rounded-md border border-input bg-card px-3 py-2" />
        </label>
        {p.stockTaken ? (
          <label className="flex min-h-10 items-center gap-3 text-sm">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="size-5 accent-primary" />Put the stock back
          </label>
        ) : null}
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </Dialog>
    </>
  )
}

export function OrderActions(p: OrderActionsProps) {
  return <Toaster><Actions {...p} /></Toaster>
}
