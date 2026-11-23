'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError } from '@/components/ui/field-error'
import { InfoTip } from '@/components/ui/info-tip'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { freshly } from '@/components/passkeys/fresh'
import { loadRazorpay, type Answer } from '@/components/billing/razorpay'
import { settle } from '@/lib/settle'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { CREDIT_PRICE, PACK, SEAT_PLANS, TYPED_MAX, TYPED_MIN, typedCreditsValid, withGst, type SeatPlan } from '@/domains/studio/prices'
import { STATES } from '@/domains/checkout/states'
import { confirmBuyAction, raiseBudgetAction, seatAction, setAlertsAction, setBudgetAction, setDetailsAction, setSiteBudgetAction, startBuyAction, type Opened } from './actions'

// =============================================================================
// FILE: credits/credits-parts.tsx — Credits and billing's controls (C1·4; mockups docs/mockups/2026-11-22-four-screens.html
// § 1 and docs/mockups/2026-11-22-c1-undrawn.html, approved 2026-11-22). Money: Checkout opens on the server's order; its
// answer only asks the server to look (confirmBuyAction), and credits show only once the server saw the payment. Words
// come from the approved pages; a refusal stays in its dialog, a field's mistake at the field (§ Feedback).
// =============================================================================

const inr = (p: number) => formatInr(paise(p), { decimals: true })
const GST = (taxable: number) => withGst(paise(taxable)) - taxable

type Pay = { state: 'idle' } | { state: 'busy' } | { state: 'waiting'; amount: number } | { state: 'late' } | { state: 'declined' } | { state: 'refunding' }

/** Opens Checkout on a server-made order, then asks the server what the gateway says, for up to 5 minutes. */
function usePay(done: (credits: string) => string) {
  const router = useRouter(), toast = useToast()
  const [pay, setPay] = useState<Pay>({ state: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const run = async (input: object, close: () => void) => {
    setError(null); setPay({ state: 'busy' })
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
        if (r.state === 'declined') { setPay({ state: 'declined' }); return }
        if (r.state === 'refunding') { setPay({ state: 'refunding' }); return }
        const late = Date.now() > until // clock-ok: the same wait, in the handler
        if (late) { setPay({ state: 'late' }); settle(router); return }
        await new Promise((res) => setTimeout(res, 4_000))
      }
    }
    const rz = new window.Razorpay({ key: s.key, order_id: s.order, name: 'Frrata', ...(s.recurring && s.customer ? { customer_id: s.customer, recurring: '1' } : {}),
      handler: (_a: Answer) => { void look() },
      modal: { ondismiss: () => { void look() } } })
    rz.open()
  }
  return { pay, error, run, reset: () => { setPay({ state: 'idle' }); setError(null) } }
}

/** What the dialog shows while it waits, and after. */
function PayState({ pay, amount }: { pay: Pay; amount: number }) {
  if (pay.state === 'waiting') return <div className="grid gap-1"><b className="text-section">Approve {inr(amount)} in your UPI app</b><p className="text-sm text-muted-foreground">Waiting up to 5 minutes.</p></div>
  if (pay.state === 'late') return <div className="grid gap-1"><b className="text-section">Still waiting for your bank</b><p className="text-sm text-muted-foreground">If you paid, the credits arrive here. You’re never charged twice.</p></div>
  return null
}
const payError = (pay: Pay, error: string | null) =>
  pay.state === 'declined' ? 'The payment didn’t go through. Nothing was charged.'
  : pay.state === 'refunding' ? 'That payment couldn’t buy credits. It’s on its way back to you.' : error

// ── Buy credits (22 Nov page; phone: a sheet) ───────────────────────────────────────────────────────────────────────

export function BuyCredits({ label = 'Buy credits', size = 'sm', variant = 'primary', startOpen = false }: { label?: string; size?: 'sm' | 'default'; variant?: 'primary' | 'secondary'; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [any, setAny] = useState(false)
  const [typed, setTyped] = useState('250')
  const [field, setField] = useState<string | null>(null)
  const n = any ? Number(typed.replace(/\D/g, '')) || 0 : PACK.credits
  const taxable = any ? n * CREDIT_PRICE : PACK.price
  const total = taxable + GST(taxable)
  const { pay, error, run, reset } = usePay(() => `${n.toLocaleString('en-IN')} credits added.`)
  const close = () => { setOpen(false); reset(); setField(null) }
  const go = () => {
    if (any && !typedCreditsValid(n)) { setField(`Enter ${TYPED_MIN} to ${TYPED_MAX.toLocaleString('en-IN')} credits.`); return }
    void run(any ? { kind: 'credits', credits: n } : { kind: 'pack' }, close)
  }
  const waiting = pay.state === 'waiting' || pay.state === 'busy'
  return <>
    <Button size={size} variant={variant} onClick={() => setOpen(true)}>{label}</Button>
    <Dialog open={open} onClose={close} title="Buy credits" error={payError(pay, error)}
      actions={pay.state === 'late' ? <Button variant="secondary" onClick={close} data-autofocus>Close</Button>
        : <><Button variant="secondary" onClick={close} data-autofocus>Not now</Button>
          <Button busy={waiting} onClick={go}>{pay.state === 'declined' ? 'Try again' : `Pay ${inr(total)}`}</Button></>}>
      {pay.state === 'waiting' || pay.state === 'late' ? <PayState pay={pay} amount={total} /> : <div className="grid gap-3">
        <div role="radiogroup" aria-label="How many credits" className="grid grid-cols-2 gap-2">
          {[{ on: !any, set: false, b: `${PACK.credits} credits`, s: `${inr(PACK.price)} + GST` }, { on: any, set: true, b: 'Any amount', s: `${inr(CREDIT_PRICE)} + GST a credit` }].map((o) => (
            <button key={o.b} type="button" role="radio" aria-checked={o.on} onClick={() => setAny(o.set)}
              className={`grid gap-0.5 rounded-lg border p-2.5 text-left ${o.on ? 'border-primary bg-select' : 'border-border'}`}>
              <b className="font-semibold">{o.b}</b><small className="font-num text-small text-muted-foreground">{o.s}</small>
            </button>))}
        </div>
        {any && <label className="grid gap-1"><span className="text-label">Credits</span>
          <input className={FIELD} inputMode="numeric" value={typed} aria-invalid={!!field} onChange={(e) => { setTyped(e.target.value); setField(null) }} />
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

export function StartSeat({ plan, renews, label, primary = true }: { plan: SeatPlan; renews: string; label?: string; primary?: boolean }) {
  const p = SEAT_PLANS[plan]
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<'upi' | 'card'>('upi')
  const total = withGst(p.price)
  const { pay, error, run, reset } = usePay(() => `${p.name} started. ${p.credits} credits added.`)
  const close = () => { setOpen(false); reset() }
  const waiting = pay.state === 'waiting' || pay.state === 'busy'
  return <>
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>{label ?? `Start ${p.name}`}</Button>
    <Dialog open={open} onClose={close} title={`Start ${p.name}`} error={payError(pay, error)}
      actions={pay.state === 'late' ? <Button variant="secondary" onClick={close} data-autofocus>Close</Button>
        : <><Button variant="secondary" onClick={close} data-autofocus>Not now</Button>
          <Button busy={waiting} onClick={() => void run({ kind: 'seat', plan, method }, close)}>{pay.state === 'declined' ? 'Try again' : `Pay ${inr(total)}`}</Button></>}>
      {pay.state === 'waiting' || pay.state === 'late' ? <PayState pay={pay} amount={total} /> : <div className="grid gap-3">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{p.name}</dt><dd className="font-num text-right">{inr(p.price)}</dd>
          <dt className="text-muted-foreground">GST 18%</dt><dd className="font-num text-right">{inr(GST(p.price))}</dd>
          <dt className="font-semibold">Pay today</dt><dd className="font-num text-right font-semibold">{inr(total)}</dd>
          <dt className="text-muted-foreground">Credits</dt><dd className="font-num text-right">{p.credits} now, {p.credits} each month</dd>
          <dt className="text-muted-foreground">Renews</dt><dd className="text-right">{renews}</dd>
        </dl>
        <span className="text-label">Pays by</span>
        <div role="radiogroup" aria-label="Pays by" className="grid grid-cols-2 gap-2">
          {(['upi', 'card'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
              className={`grid gap-0.5 rounded-lg border p-2.5 text-left ${method === m ? 'border-primary bg-select' : 'border-border'}`}>
              <b className="font-semibold">{m === 'upi' ? 'UPI AutoPay' : 'Card'}</b><small className="font-num text-small text-muted-foreground">Up to {inr(p.mandateMax)} a debit</small>
            </button>))}
        </div>
      </div>}
    </Dialog>
  </>
}

// ── The plan: cancel, keep, change at renewal ───────────────────────────────────────────────────────────────────────

function useSeat() {
  const router = useRouter(), toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const act = async (input: object, after?: () => void) => {
    setBusy(true); setError(null)
    const r = await freshly(() => seatAction(input))
    setBusy(false)
    if (!r.ok) { setError(r.error); return false }
    after?.(); toast.ok(r.text); settle(router); return true
  }
  return { busy, error, act, clear: () => setError(null) }
}

export function CancelSeat({ plan, ends }: { plan: string; ends: string }) {
  const [open, setOpen] = useState(false)
  const s = useSeat()
  const close = () => { setOpen(false); s.clear() }
  return <>
    <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => setOpen(true)}>Cancel {plan}</Button>
    <Dialog open={open} onClose={close} title={`Cancel ${plan}?`} error={s.error}
      actions={<><Button variant="secondary" onClick={close} data-autofocus>Keep {plan}</Button>
        <Button variant="destructive" busy={s.busy} onClick={() => void s.act({ action: 'cancel' }, close)}>Cancel {plan}</Button></>}>
      <p className="text-sm text-muted-foreground">{plan} ends on {ends}. Your credits stay until their use-by dates.</p>
    </Dialog>
  </>
}

export function KeepSeat({ plan }: { plan: string }) {
  const s = useSeat(), toast = useToast()
  return <Button size="sm" variant="secondary" busy={s.busy} onClick={async () => { if (!(await s.act({ action: 'keep' }))) toast.error('We couldn’t save that. Nothing was changed.') }}>Keep {plan}</Button>
}

/** A plan change waits for the next renewal (owner 2026-11-22, d). The new AutoPay limit is the owner's open call. */
export function ChangePlan({ to, from, credits, label, variant = 'primary' }: { to: SeatPlan; from: string; credits: number; label: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const [open, setOpen] = useState(false)
  const s = useSeat()
  const p = SEAT_PLANS[to]
  const close = () => { setOpen(false); s.clear() }
  if (variant === 'ghost') return <Button size="sm" variant="ghost" busy={s.busy} onClick={() => void s.act({ action: 'plan', plan: to })}>{label}</Button>
  return <>
    <Button size="sm" variant={variant} onClick={() => setOpen(true)}>{label}</Button>
    <Dialog open={open} onClose={close} title={label} error={s.error}
      actions={<><Button variant="secondary" onClick={close} data-autofocus>Not now</Button><Button busy={s.busy} onClick={() => void s.act({ action: 'plan', plan: to }, close)}>{label}</Button></>}>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">From {from}</dt><dd className="font-num text-right">{inr(p.price)} + GST a month</dd>
        <dt className="text-muted-foreground">Credits</dt><dd className="font-num text-right">{credits} a month</dd>
      </dl>
    </Dialog>
  </>
}

// ── Client budgets ──────────────────────────────────────────────────────────────────────────────────────────────────

export function RaiseBudget({ linkId }: { linkId: string }) {
  const router = useRouter(), toast = useToast()
  const [busy, setBusy] = useState(false)
  return <Button size="sm" busy={busy} onClick={async () => {
    setBusy(true); const r = await freshly(() => raiseBudgetAction({ linkId })); setBusy(false)
    if (!r.ok) { toast.error(r.error); return } toast.ok(r.text); settle(router)
  }}>Raise by 50</Button>
}

function NumberDialog({ open, onClose, title, label, start, save, saveLabel }: { open: boolean; onClose: () => void; title: string; label: string; start: number | null
  save: (n: number) => Promise<{ ok: true; text: string } | { ok: false; error: string; fields?: Record<string, string> }>; saveLabel: string }) {
  const router = useRouter(), toast = useToast()
  const [v, setV] = useState(start === null ? '' : String(start))
  const [field, setField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const go = async () => {
    const n = Number(v.replace(/\D/g, ''))
    if (!n) { setField('Enter a number of credits.'); ref.current?.focus(); return }
    setBusy(true); const r = await freshly(() => save(n)); setBusy(false)
    if (!r.ok) { const f = (r as { fields?: Record<string, string> }).fields?.credits; if (f) { setField(f); ref.current?.focus() } else setError(r.error); return }
    onClose(); toast.ok(r.text); settle(router)
  }
  return <Dialog open={open} onClose={onClose} title={title} error={error}
    actions={<><Button variant="secondary" onClick={onClose} data-autofocus>Cancel</Button><Button busy={busy} onClick={go}>{saveLabel}</Button></>}>
    <label className="grid gap-1"><span className="text-label">{label}</span>
      <input ref={ref} className={`${FIELD} font-num`} inputMode="numeric" value={v} aria-invalid={!!field} onChange={(e) => { setV(e.target.value); setField(null) }} />
      <FieldError message={field} /></label>
  </Dialog>
}

export function SetBudget({ linkId, client, kind, budget }: { linkId: string; client: string; kind: string; budget: number | null }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Set budget</Button>
    {open && <NumberDialog open onClose={() => setOpen(false)} title={`${client}’s budget`} label={kind} start={budget} saveLabel="Save budget"
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
  const save = async (next: { low: boolean; budget: boolean }) => {
    const before = v; setV(next)
    const r = await setAlertsAction(next)
    if (!r.ok) { setV(before); toast.error(r.error); return }
    settle(router)
  }
  return <div className="grid gap-1">
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm"><span id="al-low" className="text-muted-foreground">Email me below 50 credits</span>
      <Switch on={v.low} label="Email me below 50 credits" onChange={(on) => void save({ ...v, low: on })} /></div>
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Email me when a client reaches 80%</span>
      <Switch on={v.budget} label="Email me when a client reaches 80%" onChange={(on) => void save({ ...v, budget: on })} /></div>
  </div>
}

// ── Invoices go to ──────────────────────────────────────────────────────────────────────────────────────────────────

export function EditDetails({ d, startOpen = false, label = 'Edit details' }: { d: { legalName: string | null; gstin: string | null; stateName: string | null; address: string | null }; startOpen?: boolean; label?: string }) {
  const router = useRouter(), toast = useToast()
  const [open, setOpen] = useState(startOpen)
  const [v, setV] = useState({ legalName: d.legalName ?? '', gstin: d.gstin ?? '', state: d.stateName ?? '', address: d.address ?? '' })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); setFields({ ...fields, [k]: '' }) }
  const close = () => { setOpen(false); setError(null); setFields({}) }
  const go = async () => {
    setBusy(true); const r = await freshly(() => setDetailsAction({ ...v, email: '' })); setBusy(false)
    if (!r.ok) { const f = (r as { fields?: Record<string, string> }).fields; if (f) setFields(f); else setError(r.error); return }
    close(); toast.ok(r.text); settle(router)
  }
  return <>
    <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>{label}</Button>
    <Dialog open={open} onClose={close} title="Invoices go to" error={error}
      actions={<><Button variant="secondary" onClick={close} data-autofocus>Cancel</Button><Button busy={busy} onClick={go}>Save details</Button></>}>
      <div className="grid gap-3">
        <label className="grid gap-1"><span className="text-label">Legal name</span><input className={FIELD} value={v.legalName} onChange={set('legalName')} aria-invalid={!!fields.legalName} maxLength={120} /><FieldError message={fields.legalName} /></label>
        <label className="grid gap-1"><span className="flex items-center gap-1 text-label">GSTIN (optional)<InfoTip about="GSTIN">Your 15-character GST number.</InfoTip></span>
          <input className={`${FIELD} font-mono uppercase`} value={v.gstin} onChange={set('gstin')} aria-invalid={!!fields.gstin} maxLength={15} /><FieldError message={fields.gstin} /></label>
        {!v.gstin.trim() && <label className="grid gap-1"><span className="text-label">State</span>
          <select className={FIELD} value={v.state} onChange={set('state')} aria-invalid={!!fields.state}><option value="">Pick the state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>
          <FieldError message={fields.state} /></label>}
        <label className="grid gap-1"><span className="text-label">Address</span><input className={FIELD} value={v.address} onChange={set('address')} aria-invalid={!!fields.address} maxLength={300} /><FieldError message={fields.address} /></label>
        <p className="text-sm text-muted-foreground">Invoices already issued don’t change.</p>
      </div>
    </Dialog>
  </>
}
