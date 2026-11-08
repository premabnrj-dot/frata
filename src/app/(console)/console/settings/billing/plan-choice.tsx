'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cancelPlanChange, changePlan } from './actions'

// Change plan (billing B4): an upgrade starts now and this month's difference is charged by the day on the next bill;
// a downgrade starts on the 1st. Each asks first, with the figure in words. The actions revalidate; no router.refresh() (frata-gotchas).
type Option = { code: string; name: string; price: string; included: string; fee: string; upgrade: boolean; difference: string | null; afterTrial: string | null }

export function PlanChoice({ options, downgradeOn, scheduled }: { options: Option[]; downgradeOn: string; scheduled: { name: string; on: string; byShop: boolean } | null }) {
  const [pick, setPick] = useState<Option | null>(null)
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const go = () => start(async () => {
    if (!pick) return
    const r = await changePlan(pick.code)
    setPick(null)
    setMsg(r.ok ? { ok: true, text: r.upgrade ? (pick.afterTrial ? `You move to ${pick.name} when your trial ends, on ${pick.afterTrial}.` : `You are on ${pick.name} now.`) : `You move to ${pick.name} on ${downgradeOn}.` } : { ok: false, text: r.error })
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
            <span className="text-muted-foreground">{o.price}/mo · {o.included} orders · {o.fee}</span>
            <Button variant="secondary" className="mt-1 self-start" onClick={() => { setMsg(null); setPick(o) }}>{o.upgrade ? (o.afterTrial ? `Upgrade to ${o.name} after the trial` : `Upgrade to ${o.name}`) : `Switch to ${o.name} on ${downgradeOn}`}</Button>
          </li>
        ))}
      </ul>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
      <Dialog open={!!pick} onClose={() => setPick(null)} title={pick ? (pick.upgrade ? (pick.afterTrial ? `Upgrade to ${pick.name} on ${pick.afterTrial}?` : `Upgrade to ${pick.name} now?`) : `Switch to ${pick.name} on ${downgradeOn}?`) : ''}
        description={pick ? (pick.upgrade ? (pick.afterTrial ? `From ${pick.afterTrial}: ${pick.price}/mo + GST.` : `${pick.difference ? `${pick.difference} + GST on your next bill, then ` : ''}${pick.price}/mo + GST.`) : `From ${downgradeOn}: ${pick.price}/mo + GST. No refund.`) : ''}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setPick(null)}>Not now</Button><Button onClick={go} disabled={busy}>{pick?.upgrade ? (pick.afterTrial ? 'Upgrade after the trial' : 'Upgrade now') : 'Switch on the 1st'}</Button></>} />
    </div>
  )
}
