'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { flushSync } from 'react-dom'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError } from '@/components/ui/field-error'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { freshly } from './fresh'
import { loadRazorpay, type Answer } from '@/components/billing/razorpay'
import { settle } from '@/lib/settle'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { CREDIT_PRICE, PACK, SEAT_PLANS, TYPED_MAX, TYPED_MIN, typedCreditsValid, withGst, type SeatPlan } from '@/domains/studio/prices'
import { confirmBuyAction, raiseBudgetAction, seatAction, setAlertsAction, setBudgetAction, setSiteBudgetAction, startBuyAction, type Opened } from './actions'

// The number and invoice-details dialogs load when first opened (they render only once open): the page's first load
// stays under its script budget with room for Studio's panel (orchestrator 2026-11-23: ≤ 148.5 kB locally).
const NumberDialog = dynamic(() => import('./credits-dialogs').then((m) => m.NumberDialog), { ssr: false })
const DetailsDialog = dynamic(() => import('./credits-dialogs').then((m) => m.DetailsDialog), { ssr: false })


// =============================================================================
// FILE: credits/credits-parts.tsx — Credits and billing's controls (C1·4; mockups docs/mockups/2026-11-22-four-screens.html
// § 1 and docs/mockups/2026-11-22-c1-undrawn.html, approved 2026-11-22). Money: Checkout opens on the server's order; its
// answer only asks the server to look (confirmBuyAction), and credits show only once the server saw the payment. Words
// come from the approved pages; a refusal stays in its dialog, a field's mistake at the field (§ Feedback).
// =============================================================================

const inr = (p: number) => formatInr(paise(p), { decimals: true })

/** Two-line choice cards, as drawn (a title and its price; Segmented holds one short word each). A radiogroup with one
 *  tab stop and the arrow keys, as Segmented (src/components/ui/segmented.tsx). */
function RadioCards<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly { v: T; title: string; sub: string }[]; onPick: (v: T) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const step = (by: number) => {
    const at = options.findIndex((o) => o.v === value), next = (at + by + options.length) % options.length
    onPick(options[next]!.v)
    requestAnimationFrame(() => box.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus())
  }
  return <div ref={box} role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2"
    onKeyDown={(e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
    }}>
    {options.map((o) => (
      <button key={o.v} type="button" role="radio" aria-checked={value === o.v} tabIndex={value === o.v ? 0 : -1} onClick={() => onPick(o.v)}
        className={`grid gap-0.5 rounded-lg border p-2.5 text-left outline-none transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring ${value === o.v ? 'border-primary bg-select' : 'border-border'}`}>
        <b className="font-semibold">{o.title}</b><small className="font-num text-small text-muted-foreground">{o.sub}</small>
      </button>))}
  </div>
}
const GST = (taxable: number) => withGst(paise(taxable)) - taxable

type Pay = { state: 'idle' } | { state: 'busy' } | { state: 'waiting'; amount: number } | { state: 'late' } | { state: 'declined' } | { state: 'refunding' }

/** Opens Checkout on a server-made order, then asks the server what the gateway says, for up to 5 minutes. */
function usePay(done: (credits: string) => string) {
  const router = useRouter(), toast = useToast()
  const [pay, setPay] = useState<Pay>({ state: 'idle' })
  const [error, setError] = useState<string | null>(null)
  // Razorpay's Checkout is open: our dialog steps aside. A native modal dialog sits in the top layer and makes the page
  // behind it inert, Checkout's frame included, so it must be closed (never cancelled) while Checkout is up, and comes
  // back with the wait when Checkout closes (owner's bug report, 2026-11-23; the console's autopay does the same).
  const [checkout, setCheckout] = useState(false)
  const live = useRef(false)
  const run = async (input: object, close: () => void) => {
    setError(null); setPay({ state: 'busy' }); live.current = true
    const s: Opened = await freshly(() => startBuyAction(input)) as Opened
    if (!s.ok) { setPay({ state: 'idle' }); setError(s.error); return }
    if (!(await loadRazorpay()) || !window.Razorpay) { setPay({ state: 'idle' }); setError('The payment page couldn’t load. Check your connection.'); return }
    const look = async () => {
      setPay({ state: 'waiting', amount: s.amount })
      const until = Date.now() + 5 * 60_000 // clock-ok: a 5-minute wait for the bank, in a click's handler
      for (;;) {
        const r = await confirmBuyAction(s.purchaseId)
        if (!r.ok) { setPay({ state: 'idle' }); setError(r.error); return }
        if (r.state === 'added') { setPay({ state: 'idle' }); close(); toast.ok(done(''), {}); settle(router); return }
        if (!live.current) { settle(router); return } // the dialog was closed: the page shows the credits once they land
        if (r.state === 'declined') { setPay({ state: 'declined' }); return }
        if (r.state === 'refunding') { setPay({ state: 'refunding' }); return }
        const late = Date.now() > until // clock-ok: the same wait, in the handler
        if (late) { setPay({ state: 'late' }); settle(router); return }
        await new Promise((res) => setTimeout(res, 4_000))
      }
    }
    const back = () => { setCheckout(false); void look() }
    const rz = new window.Razorpay({ key: s.key, order_id: s.order, name: 'Frrata', ...(s.recurring && s.customer ? { customer_id: s.customer, recurring: '1' } : {}),
      handler: (_a: Answer) => back(),
      modal: { ondismiss: back } })
    // Our dialog closes first (its effect runs inside flushSync), so Checkout opens on a page that isn't inert.
    flushSync(() => setCheckout(true))
    rz.open()
  }
  return { pay, error, run, checkout, reset: () => { live.current = false; setCheckout(false); setPay({ state: 'idle' }); setError(null) } }
}

/** While the server waits for the bank, the dialog is titled by the wait and holds one line (as drawn, 22 and 23 Nov):
 *  no buttons while waiting; Close once the wait ran out. */
const waitTitle = (pay: Pay) => pay.state === 'waiting' ? 'Waiting for your bank' : pay.state === 'late' ? 'Still waiting for your bank' : null
function PayState({ pay, amount }: { pay: Pay; amount: number }) {
  if (pay.state === 'waiting') return <p role="status" className="text-sm text-muted-foreground"><span className="font-num">{inr(amount)}</span> · up to 5 minutes.</p>
  if (pay.state === 'late') return <p role="status" className="text-sm text-muted-foreground">If you paid, the credits arrive here. You’re never charged twice.</p>
  return null
}
const payError = (pay: Pay, error: string | null) =>
  pay.state === 'declined' ? 'The payment didn’t go through. Nothing was charged.'
  : pay.state === 'refunding' ? 'That payment couldn’t buy credits. It’s on its way back to you.' : error

// ── Buy credits (22 Nov page; phone: a sheet) ───────────────────────────────────────────────────────────────────────

export function BuyCredits({ label = 'Buy credits', size = 'sm', variant = 'primary', startOpen = false, detailsFirst = false }: { label?: string; size?: 'sm' | 'default'; variant?: 'primary' | 'secondary'; startOpen?: boolean
  /** No invoice details yet: Buy credits opens "Invoices go to" first, then the purchase (as drawn). */
  detailsFirst?: boolean }) {
  const [needDetails, setNeedDetails] = useState(detailsFirst)
  const [asking, setAsking] = useState(false)
  const [open, setOpen] = useState(startOpen && !detailsFirst)
  const [any, setAny] = useState(false)
  const [typed, setTyped] = useState('250')
  const [field, setField] = useState<string | null>(null)
  const typedRef = useRef<HTMLInputElement>(null)
  const n = any ? Number(typed.replace(/\D/g, '')) || 0 : PACK.credits
  const taxable = any ? n * CREDIT_PRICE : PACK.price
  const total = taxable + GST(taxable)
  const { pay, error, run, reset, checkout } = usePay(() => `${n.toLocaleString('en-IN')} credits added.`)
  const close = () => { setOpen(false); reset(); setField(null) }
  const go = () => {
    if (any && !typedCreditsValid(n)) { setField(`Enter ${TYPED_MIN} to ${TYPED_MAX.toLocaleString('en-IN')} credits.`); typedRef.current?.focus(); return }
    void run(any ? { kind: 'credits', credits: n } : { kind: 'pack' }, close)
  }
  const waiting = pay.state === 'waiting' || pay.state === 'busy'
  return <>
    <Button size={size} variant={variant} onClick={() => (needDetails ? setAsking(true) : setOpen(true))}>{label}</Button>
    {asking && <DetailsDialog open d={NO_DETAILS} onClose={() => setAsking(false)} onSaved={() => { setAsking(false); setNeedDetails(false); setOpen(true) }} />}
    <Dialog open={open && !checkout} onClose={close} title={waitTitle(pay) ?? 'Buy credits'} error={payError(pay, error)}
      actions={pay.state === 'waiting' ? null : pay.state === 'late' ? <Button variant="secondary" onClick={close} data-autofocus>Close</Button>
        : <><Button variant="secondary" onClick={close} data-autofocus className="max-md:hidden">Not now</Button>
          <Button busy={waiting} onClick={go} className="max-md:w-full">{pay.state === 'declined' ? 'Try again' : `Pay ${inr(total)}`}</Button></>}>
      {pay.state === 'waiting' || pay.state === 'late' ? <PayState pay={pay} amount={total} /> : <div className="grid gap-3">
        <RadioCards label="How many credits" value={any ? 'any' : 'pack'} onPick={(x) => setAny(x === 'any')}
          options={[{ v: 'pack', title: `${PACK.credits} credits`, sub: `${inr(PACK.price)} + GST` }, { v: 'any', title: 'Any amount', sub: `${inr(CREDIT_PRICE)} + GST a credit` }]} />
        {any && <label className="grid gap-1"><span className="text-label">Credits</span>
          <input ref={typedRef} className={`${FIELD} font-num`} inputMode="numeric" value={typed} aria-invalid={!!field} onChange={(e) => { setTyped(e.target.value); setField(null) }} />
          <FieldError message={field} /></label>}
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{n.toLocaleString('en-IN')} credits</dt><dd className="font-num text-right">{inr(taxable)}</dd>
          <dt className="text-muted-foreground">GST 18%</dt><dd className="font-num text-right">{inr(GST(taxable))}</dd>
          <dt className="font-semibold">Pay today</dt><dd className="font-num text-right font-semibold">{inr(total)}</dd>
        </dl>
      </div>}
    </Dialog>
  </>
}

// ── Start Studio or Studio Plus (undrawn mockup § Plan) ─────────────────────────────────────────────────────────────

/** Studio → Studio Plus at once (owner 2026-11-23, option B; undrawn mockup § Studio Plus now): the credits left stay;
 *  Studio's renewal for this period is stopped, or the move waits while it is with the bank. */
export type Move = { from: string; carried: number; renewal: { forPeriodEnd: string; total: number; claimed: boolean } | null }

export function StartSeat({ plan, renews, label, primary = true, move }: { plan: SeatPlan; renews: string; label?: string; primary?: boolean; move?: Move }) {
  const p = SEAT_PLANS[plan]
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const total = withGst(p.price)
  const { pay, error, run, reset, checkout } = usePay(() => `${p.name} started. ${p.credits} credits added.`)
  const close = () => { setOpen(false); reset() }
  const waiting = pay.state === 'waiting' || pay.state === 'busy'
  return <>
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>{label ?? `${move ? 'Move to' : 'Start'} ${p.name}`}</Button>
    {move?.renewal?.claimed ? <Dialog open={open} onClose={close} title={`${move.from}’s payment is with your bank`}
      actions={<Button variant="secondary" onClick={close} data-autofocus>Close</Button>}>
      <p className="text-sm text-muted-foreground">{move.from}’s <span className="font-num">{inr(move.renewal.total)}</span> is being paid. Try again once it’s paid.</p>
    </Dialog> :
    <Dialog open={open && !checkout} onClose={close} title={waitTitle(pay) ?? `${move ? 'Move to' : 'Start'} ${p.name}`}
      error={pay.state === 'declined' && move ? `${payError(pay, error)} You’re still on ${move.from}.` : payError(pay, error)}
      actions={pay.state === 'waiting' ? null : pay.state === 'late' ? <Button variant="secondary" onClick={close} data-autofocus>Close</Button>
        : <><Button variant="secondary" onClick={close} data-autofocus>Not now</Button>
          <Button busy={waiting} onClick={() => void run({ kind: 'seat', plan, method }, close)}>{pay.state === 'declined' ? 'Try again' : `Pay ${inr(total)}`}</Button></>}>
      {pay.state === 'waiting' || pay.state === 'late' ? <PayState pay={pay} amount={total} /> : <div className="grid gap-3">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{p.name}</dt><dd className="font-num text-right">{inr(p.price)}</dd>
          <dt className="text-muted-foreground">GST 18%</dt><dd className="font-num text-right">{inr(GST(p.price))}</dd>
          <dt className="font-semibold">Pay today</dt><dd className="font-num text-right font-semibold">{inr(total)}</dd>
          <dt className="text-muted-foreground">Credits</dt><dd className="font-num text-right">{p.credits} now, {p.credits} each month</dd>
          <dt className="text-muted-foreground">Renews</dt><dd className="text-right">{renews}</dd>
          {move && <><dt className="text-muted-foreground">{move.from} credits left</dt><dd className="font-num text-right">{move.carried} stay</dd></>}
          {move?.renewal && <><dt className="text-muted-foreground">{move.from}’s {move.renewal.forPeriodEnd} payment</dt><dd className="text-right">Stopped</dd></>}
        </dl>
        <span className="text-label" aria-hidden>Pays by</span>
        <RadioCards label="Pays by" value={method} onPick={setMethod}
          options={(['upi', 'card'] as const).map((m) => ({ v: m, title: m === 'upi' ? 'UPI AutoPay' : 'Card', sub: `Up to ${formatInr(p.mandateMax)} a debit` }))} />
      </div>}
    </Dialog>}
  </>
}

// ── The plan: cancel, keep, change at renewal ───────────────────────────────────────────────────────────────────────

function useSeat() {
  const router = useRouter(), toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (input: object, text: string, after?: () => void) => {
    setBusy(true); setError(null)
    const r = await freshly(() => seatAction(input))
    setBusy(false)
    if (!r.ok) { setError(r.error); return false }
    after?.(); toast.ok(text); settle(router); return true
  }
  return { busy, error, act, clear: () => setError(null) }
}

export function CancelSeat({ plan, ends }: { plan: string; ends: string }) {
  const [open, setOpen] = useState(false)
  const s = useSeat()
  const close = () => { setOpen(false); s.clear() }
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Cancel {plan}</Button>
    <Dialog open={open} onClose={close} title={`Cancel ${plan}?`} error={s.error}
      actions={<><Button variant="secondary" onClick={close} data-autofocus>Keep {plan}</Button>
        <Button variant="secondary" className="text-danger-text" busy={s.busy} onClick={() => void s.act({ action: 'cancel' }, `${plan} ends on ${ends}.`, close)}>Cancel {plan}</Button></>}>
      <p className="text-sm text-muted-foreground">{plan} ends on {ends}. Your credits stay until their use-by dates.</p>
    </Dialog>
  </>
}

export function KeepSeat({ plan }: { plan: string }) {
  const s = useSeat(), toast = useToast()
  return <Button size="sm" variant="secondary" busy={s.busy} onClick={async () => { if (!(await s.act({ action: 'keep' }, `${plan} stays on.`))) toast.error('We couldn’t save that. Nothing was changed.') }}>Keep {plan}</Button>
}

/** A plan change waits for the next renewal (owner 2026-11-22, d). The new AutoPay limit is the owner's open call. */
export function ChangePlan({ to, from, credits, label, variant = 'primary' }: { to: SeatPlan; from: string; credits: number; label: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const [open, setOpen] = useState(false)
  const s = useSeat()
  const p = SEAT_PLANS[to]
  const close = () => { setOpen(false); s.clear() }
  if (variant === 'ghost') return <Button size="sm" variant="ghost" busy={s.busy} onClick={() => void s.act({ action: 'plan', plan: to }, `${p.name} stays on.`)}>{label}</Button>
  return <>
    <Button size="sm" variant={variant} onClick={() => setOpen(true)}>{label}</Button>
    <Dialog open={open} onClose={close} title={label} error={s.error}
      actions={<><Button variant="secondary" onClick={close} data-autofocus>Not now</Button><Button busy={s.busy} onClick={() => void s.act({ action: 'plan', plan: to }, `Your plan changes on ${from}.`, close)}>{label}</Button></>}>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">From {from}</dt><dd className="font-num text-right">{inr(p.price)} + GST a month</dd>
        <dt className="text-muted-foreground">Credits</dt><dd className="font-num text-right">{credits} a month</dd>
      </dl>
    </Dialog>
  </>
}

// ── Client budgets ──────────────────────────────────────────────────────────────────────────────────────────────────

export function RaiseBudget({ linkId, client }: { linkId: string; client?: string }) {
  const router = useRouter(), toast = useToast()
  const [busy, setBusy] = useState(false)
  return <Button size="sm" busy={busy} onClick={async () => {
    setBusy(true); const r = await freshly(() => raiseBudgetAction({ linkId })); setBusy(false)
    if (!r.ok) { toast.error(r.error); return } toast.ok(r.text); settle(router)
  }} aria-label={client ? `Raise by 50 for ${client}` : undefined}>Raise by 50</Button>
}


export function SetBudget({ linkId, client, kind, budget, used }: { linkId: string; client: string; kind: string; budget: number | null; used?: number }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-label={`Set budget for ${client}`}>Set budget</Button>
    {open && <NumberDialog open onClose={() => setOpen(false)} title={`${client}’s budget`} label={kind} start={budget} saveLabel="Save budget" undo
      used={used === undefined ? undefined : { client, n: used }}
      save={(credits) => setBudgetAction({ linkId, credits, client })} />}
  </>
}

export function SiteBudget({ credits }: { credits: number }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Change</Button>
    {open && <NumberDialog open onClose={() => setOpen(false)} title="New websites start at" label="Credits" start={credits} saveLabel="Save start" save={(n) => setSiteBudgetAction(n)} />}
  </>
}

// ── Alerts ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export function Alerts({ low, budget }: { low: boolean; budget: boolean }) {
  const router = useRouter(), toast = useToast()
  const [v, setV] = useState({ low, budget })
  const saving = useRef(false)
  const save = async (next: { low: boolean; budget: boolean }) => {
    if (saving.current) return
    saving.current = true
    const before = v; setV(next)
    const r = await setAlertsAction(next)
    saving.current = false
    if (!r.ok) { setV(before); toast.error(r.error); return }
    settle(router)
  }
  return <div className="grid gap-1">
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm"><span aria-hidden className="text-muted-foreground">Email me below 50 credits</span>
      <Switch on={v.low} label="Email me below 50 credits" onChange={(on) => void save({ ...v, low: on })} /></div>
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm"><span aria-hidden className="text-muted-foreground">Email me when a client reaches 80%</span>
      <Switch on={v.budget} label="Email me when a client reaches 80%" onChange={(on) => void save({ ...v, budget: on })} /></div>
  </div>
}

// ── Invoices go to ──────────────────────────────────────────────────────────────────────────────────────────────────

export type DetailsIn = { legalName: string | null; gstin: string | null; stateName: string | null; address: string | null }
const NO_DETAILS: DetailsIn = { legalName: null, gstin: null, stateName: null, address: null }

export function EditDetails({ d, startOpen = false, label = 'Edit details' }: { d: DetailsIn; startOpen?: boolean; label?: string }) {
  const [open, setOpen] = useState(startOpen)
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{label}</Button>
    {open && <DetailsDialog open d={d} onClose={() => setOpen(false)} />}
  </>
}

