'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cancelPlanChange, changePlan } from './actions'

// Change plan (billing B4): an upgrade starts now and this month's difference is charged by the day on the next bill;
// a downgrade starts on the 1st. Each asks first, with the figure in words. The actions revalidate; no router.refresh() (frata-gotchas).
type Option = { code: string; name: string; price: string; included: string; fee: string; upgrade: boolean; difference: string }

export function PlanChoice({ options, firstOfNext, scheduled }: { options: Option[]; firstOfNext: string; scheduled: { name: string; on: string; byShop: boolean } | null }) {
  const [pick, setPick] = useState<Option | null>(null)
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const go = () => start(async () => {
    if (!pick) return
    const r = await changePlan(pick.code)
    setPick(null)
    setMsg(r.ok ? { ok: true, text: r.upgrade ? `You are on ${pick.name} now.` : `You move to ${pick.name} on ${firstOfNext}.` } : { ok: false, text: r.error })
  })
  return (
    <div className="space-y-2">
      {scheduled && (
        <p className="text-sm">Moving to <strong>{scheduled.name}</strong> on {scheduled.on}.{' '}
          {scheduled.byShop && <button type="button" className="underline" disabled={busy} onClick={() => start(async () => { const r = await cancelPlanChange(); setMsg(r.ok ? { ok: true, text: 'The change is cancelled.' } : { ok: false, text: r.error }) })}>Keep my plan</button>}</p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.code} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
            <strong>{o.name}</strong>
            <span className="text-muted-foreground">{o.price} a month · {o.included} orders · {o.fee} of delivered value</span>
            <Button variant="secondary" className="mt-1 self-start" onClick={() => { setMsg(null); setPick(o) }}>{o.upgrade ? `Upgrade to ${o.name}` : `Switch to ${o.name} on ${firstOfNext}`}</Button>
          </li>
        ))}
      </ul>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
      <Dialog open={!!pick} onClose={() => setPick(null)} title={pick ? (pick.upgrade ? `Upgrade to ${pick.name} now?` : `Switch to ${pick.name} on ${firstOfNext}?`) : ''}
        description={pick ? (pick.upgrade ? `It starts now. This month's difference, about ${pick.difference} before GST, is added to your next bill; from next month you pay ${pick.price} a month.` : `You stay on your plan until ${firstOfNext}, then pay ${pick.price} a month. Nothing is refunded for this month.`) : ''}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setPick(null)}>Not now</Button><Button onClick={go} aria-disabled={busy}>{pick?.upgrade ? 'Upgrade now' : 'Switch on the 1st'}</Button></>} />
    </div>
  )
}
