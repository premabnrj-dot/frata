'use client'

import { Money } from '@/components/data/numeric'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { paise } from '@/domains/money/paise'
import { changeWords, changesOf, problemWords, type EditPlan, type EditProblem } from '@/domains/orders/edit'
import type { Settle } from '@/domains/orders/refunds'
import { formatInr } from '@/lib/format'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/edit/what-changes.tsx
//
// "WHAT CHANGES", LIVE BESIDE THE LINES (mockup views COD and Paid online): each line's change in words, an offer that
// now gives less or comes off (named), delivery when it moves, and the money: what the courier collects, before and
// after; paid online (OE·2), what was paid and the new total, with the refund (its timing, and that Razorpay keeps its
// fee) or the payment asked for first. A refusal is said here, and Save waits. Save names the order and the money; the
// safe button keeps it as it was. On a phone the two buttons sit fixed above the bottom bar.
// =============================================================================

const inr = (p: number) => formatInr(paise(p))

export function WhatChanges({ number, plan, problem, before, to, notify, onNotify, onKeep, onSave, busy, settle, kept }: {
  number: string
  plan: EditPlan | null
  problem: EditProblem | null
  /** What is collected now. */
  before: number
  /** Whom the email goes to (first name), or null: the order has no email. */
  to: string | null
  notify: boolean; onNotify: (v: boolean) => void
  onKeep: () => void; onSave: () => void
  busy: boolean
  /** Paid online: what the new total does with the money paid (null: paid on delivery). */
  settle: Settle | null
  /** Paid online and refunding: Razorpay's fee on the payments refunded from, which it keeps (unknown or none: null). */
  kept: { kept: number; fee: number } | null
}) {
  const changes = plan ? changesOf(plan) : []
  const said = problem && problem.kind !== 'nothing' ? problemWords(problem, inr) : settle?.kind === 'too_old' ? 'Paid over 6 months ago: Razorpay can\'t refund it.' : null
  const online = settle !== null
  const save = settle?.kind === 'refund' ? `Save and refund ${inr(settle.amount)}` : settle?.kind === 'ask' ? `Save and ask for ${inr(settle.amount)}` : `Save ${number}`
  const mail = settle?.kind === 'refund' ? 'the refund' : settle?.kind === 'ask' ? 'the payment link' : 'the new total'
  const after = plan?.total.after ?? before
  return (
    <Section id="what-changes" title="What changes">
      {changes.length || plan?.offers.length || (plan && plan.shipping.before !== plan.shipping.after) ? (
        <dl className="divide-y divide-border text-sm">
          {changes.map((c, i) => <div key={i} className="flex justify-between gap-3 py-2 first:pt-0"><dt className="min-w-0">{c.title}</dt><dd className="text-right">{changeWords(c)}</dd></div>)}
          {plan?.offers.map((o) => (
            <div key={o.rowId} className="flex justify-between gap-3 py-2"><dt className="min-w-0">{o.title}</dt>
              <dd className="text-right font-mono tabular-nums"><s className="mr-1.5 text-muted-foreground"><Money paise={paise(o.before)} /></s>{o.after ? <Money paise={paise(o.after)} /> : <span className="font-sans">Off</span>}</dd></div>
          ))}
          {plan && plan.shipping.before !== plan.shipping.after ? (
            <div className="flex justify-between gap-3 py-2"><dt>Delivery</dt>
              <dd className="text-right font-mono tabular-nums"><s className="mr-1.5 text-muted-foreground">{plan.shipping.before ? <Money paise={paise(plan.shipping.before)} /> : 'Free'}</s>{plan.shipping.after ? <Money paise={paise(plan.shipping.after)} /> : <span className="font-sans">Free</span>}</dd></div>
          ) : null}
        </dl>
      ) : null}
      {online ? (
        <dl className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-3"><dt>Paid online</dt><dd className="font-mono tabular-nums"><Money paise={paise(before)} /></dd></div>
          <div className="flex justify-between gap-3"><dt>New total</dt><dd className="font-mono tabular-nums"><b className="text-xl font-semibold"><Money paise={paise(after)} /></b></dd></div>
        </dl>
      ) : (
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
          <span>Collect on delivery</span>
          <span className="text-right font-mono tabular-nums">{after !== before ? <s className="mr-2 text-muted-foreground"><Money paise={paise(before)} /></s> : null}<b className="text-xl font-semibold"><Money paise={paise(after)} /></b></span>
        </div>
      )}
      {settle?.kind === 'refund' ? (
        <div className="rounded-md border border-warn bg-warn/40 p-3 text-sm" data-settle="refund"><b className="font-mono tabular-nums">Refund <Money paise={paise(settle.amount)} /></b>
          <span className="block text-muted-foreground">{kept ? <>Back in 5–10 working days · Razorpay keeps its <Money paise={paise(kept.fee)} decimals /> fee</> : 'Razorpay · back in 5–10 working days · its fee isn’t returned'}</span></div>
      ) : settle?.kind === 'ask' ? (
        <div className="rounded-md border border-border bg-muted p-3 text-sm" data-settle="ask"><b className="font-mono tabular-nums">Ask for <Money paise={paise(settle.amount)} /></b>
          <span className="block text-muted-foreground">The shopper pays first · nothing changes until then</span></div>
      ) : null}
      {/* feedback-ok: a limit the edit must meet (the COD maximum, a sold-out size), said live beside the money (§ Feedback 5) */}
      {said ? <p role="alert" className="text-sm text-danger-text">{said}</p> : null}
      {to ? (
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => onNotify(e.target.checked)} className="size-5 accent-primary" />Email {to} {mail}
        </label>
      ) : null}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-wrap justify-end gap-2 border-t border-border bg-card px-4 py-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0 print:hidden">
        <Button variant="secondary" onClick={onKeep}>Keep the order as it was</Button>
        <Button onClick={onSave} aria-disabled={busy || !plan || settle?.kind === 'too_old'} disabled={!plan || settle?.kind === 'too_old'}>{save}</Button>
      </div>
    </Section>
  )
}
