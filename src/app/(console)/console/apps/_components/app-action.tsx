'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { OfferAction } from '@/domains/modules/offer'
import type { ModuleKey } from '@/domains/modules/registry'
import { OFF } from '@/domains/modules/showcase'
import { endAddonTrialAction, setInterestAction, setModuleAction, startAddonTrialAction } from '../actions'
import { dayMonthLongIN } from '@/lib/format-date'
import { formatInr } from '@/lib/format'
import { applyBps, paise } from '@/domains/money/paise'
import { GST_BPS } from '@/domains/billing/gst-rate'
import { settle } from '@/lib/settle'

/**
 * An app's ONE button, matching its state (Apps gallery; offerFor decides which): Turn on / Turn off (with a confirm),
 * Turn on <the app it needs> first, Ask Frrata to add, See Growth, Tell me when it's ready. No button that fails:
 * who may not act sees why instead. Plain pending state and a refresh after the write (frata-gotchas). A refusal is an
 * error toast; inside a confirm it is the Dialog's own error line (frata-design-language § Feedback 1, 4).
 */
export function AppAction({ k, name, action, canManage, askHref, block = false, paid = false }: {
  k: ModuleKey; name: string; action: OfferAction; canManage: boolean; askHref: string; block?: boolean
  /** A paid add-on: turning it off also stops its billing at the month's end. */
  paid?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  /** The open confirm's refusal (its Dialog's error slot). */
  const [error, setError] = useState<string | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [confirmTrial, setConfirmTrial] = useState(false)
  const wide = block ? 'w-full' : ''
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, inDialog = false) => {
    setBusy(true); setError(null)
    const r = await fn().catch(() => ({ ok: false, error: undefined }))
    setBusy(false)
    if (!r.ok) {
      if (inDialog) setError(r.error ?? 'We could not change it. Nothing was changed.')
      else if (r.error) toast.error(r.error)
      else toast.error('We could not change it.', { sub: 'Nothing was changed.' })
      return false
    }
    setConfirmOff(false); setConfirmTrial(false); settle(router); return true
  }
  const owner = <p className="text-sm text-muted-foreground">Ask the shop’s owner to change this.</p>

  if (action.kind === 'interest') {
    return (
      <div>
        <Button variant={action.asked ? 'secondary' : 'primary'} className={wide} aria-pressed={action.asked} disabled={busy}
          onClick={() => run(() => setInterestAction({ module: k, on: !action.asked }))}>
          {action.asked ? 'We’ll tell you when it’s ready' : 'Tell me when it’s ready'}
        </Button>
      </div>
    )
  }
  if (action.kind === 'needs') {
    return <Link href={`/console/apps/${action.module}`} prefetch={false} className={`${button()} ${wide}`}>Turn on {action.name} first</Link>
  }
  if (action.kind === 'trial') {
    if (!canManage) return owner
    // The confirm (A3; CCPA 2023 drip pricing and subscription trap): the GST-inclusive monthly total, when the first
    // charge comes and on which invoice, and how to end it. No retention screen anywhere.
    const day = dayMonthLongIN(action.ends)
    const ist = new Date(action.ends.getTime() + 330 * 60_000)
    const firstInvoice = dayMonthLongIN(new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1, 6)))
    const withGst = action.monthly + applyBps(paise(action.monthly), GST_BPS) // billing's own GST (bill.ts)
    return (
      <div>
        <Button className={wide} disabled={busy} onClick={() => { setError(null); setConfirmTrial(true) }}>Start free trial</Button>
        <Dialog open={confirmTrial} onClose={() => setConfirmTrial(false)} title={`Try ${name} free for 14 days?`} error={error}
          description={<ul className="list-disc space-y-1 pl-5">
            <li>Free until {day}.</li>
            <li>Then {formatInr(paise(action.monthly))}/month + 18% GST ({formatInr(paise(withGst), { decimals: true })}). The rest of that month is billed by days on your {firstInvoice} invoice.</li>
            <li>End the trial before {day} and nothing is charged.</li>
          </ul>}
          actions={<><Button variant="secondary" data-autofocus onClick={() => setConfirmTrial(false)}>Not now</Button>
            <Button disabled={busy} onClick={() => run(() => startAddonTrialAction({ module: k, priceId: action.priceId }), true)}>Start free trial</Button></>} />
      </div>
    )
  }
  if (action.kind === 'ask') {
    return canManage ? <a href={askHref} target="_blank" rel="noopener" className={`${button()} ${wide}`}>{action.label}</a> : owner
  }
  if (action.kind === 'plans') {
    return canManage ? <Link href="/console/settings/billing" prefetch={false} className={`${button()} ${wide}`}>{action.label}</Link> : owner
  }
  if (!canManage) return <p className="text-sm text-muted-foreground">{action.on ? 'On' : 'Off'} · ask the shop’s owner to change it.</p>
  if (!action.on) {
    return <div><Button className={wide} disabled={busy} onClick={() => run(() => setModuleAction({ module: k, on: true }))}>Turn on {name}</Button></div>
  }
  return (
    <div>
      <Button variant="secondary" className={`${wide} after:hidden`} disabled={busy} onClick={() => { setError(null); setConfirmOff(true) }}>Turn off {name}</Button>
      <Dialog open={confirmOff} onClose={() => setConfirmOff(false)} title={`Turn off ${name}?`} error={error}
        description={<ul className="list-disc space-y-1 pl-5">{OFF[k].map((l) => <li key={l}>{l}</li>)}{paid ? <li>Billing stops: it works to the end of this month and isn’t billed again.</li> : <li>Turn it back on any time.</li>}</ul>}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setConfirmOff(false)}>Keep {name}</Button><Button variant="destructive" disabled={busy} onClick={() => run(() => setModuleAction({ module: k, on: false }), true)}>Turn off {name}</Button></>} />
    </div>
  )
}

/** In a trial the shop started (A3): End trial in place of Turn off — one click and one confirm, no retention screen. */
export function EndTrial({ k, name, paidFrom }: { k: ModuleKey; name: string; paidFrom: Date }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = async () => {
    setBusy(true); setError(null)
    const r = await endAddonTrialAction({ module: k }).catch(() => ({ ok: false as const, error: 'We could not end the trial. Nothing was changed.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setOpen(false); settle(router)
  }
  return (
    <div>
      <Button variant="secondary" className="after:hidden" onClick={() => { setError(null); setOpen(true) }}>End trial</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`End the ${name} trial?`} error={error}
        description={<ul className="list-disc space-y-1 pl-5">{OFF[k].map((l) => <li key={l}>{l}</li>)}<li>Nothing is charged. Billing would have started {dayMonthLongIN(paidFrom)}.</li></ul>}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep the trial</Button><Button variant="destructive" disabled={busy} onClick={end}>End trial</Button></>} />
    </div>
  )
}
