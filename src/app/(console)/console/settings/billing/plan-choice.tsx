'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { cancelPlanChange, changePlan } from './actions'

// Change plan (billing B4; rework R1 mockup § Plans): an upgrade starts now and this month's difference goes on the next
// bill by the day; a downgrade starts on the 1st and names what it loses. Each asks first, with the money and the date.
export type PlanOption = {
  code: string; name: string; price: string; fee: string; upgrade: boolean
  difference: string | null; afterTrial: string | null
  /** What the move adds (an upgrade) or loses (a downgrade), by app name. */
  gains: string[]; loses: string[]
}

export function PlanButton({ option: o, downgradeOn, fromFeatured = false, scheduled }: { option: PlanOption; downgradeOn: string; fromFeatured?: boolean; scheduled: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const [refused, setRefused] = useState<string | null>(null)
  const toast = useToast()
  const close = () => { setOpen(false); setRefused(null) }
  const go = () => start(async () => {
    const r = await changePlan(o.code, fromFeatured ? 'featured' : undefined)
    if (!r.ok) { setRefused(r.error); return }
    close()
    toast.ok(r.upgrade ? (o.afterTrial ? `You move to ${o.name} when your trial ends, on ${o.afterTrial}.` : `You are on ${o.name} now.`) : `You move to ${o.name} on ${downgradeOn}.`)
  })
  if (!o.upgrade && scheduled) return <Button variant="secondary" disabled>Moving on {downgradeOn}</Button>
  const title = o.upgrade ? (o.afterTrial ? `Move to ${o.name} on ${o.afterTrial}?` : `Move to ${o.name} now?`) : `Switch to ${o.name} on ${downgradeOn}?`
  const rows: [string, string][] = o.upgrade
    ? [...(o.difference && !o.afterTrial ? [['Rest of this month', `${o.difference} + GST on the next bill`] as [string, string]] : []), [o.afterTrial ? `From ${o.afterTrial}` : 'Then', `${o.price} a month + ${o.fee}`], ...(o.gains.length ? [['You add', o.gains.join(', ')] as [string, string]] : [])]
    : [[`From ${downgradeOn}`, `${o.price} a month + ${o.fee}`]]
  return (
    <>
      <Button variant="secondary" onClick={() => { setRefused(null); setOpen(true) }}>{o.upgrade ? `Move to ${o.name}` : `Switch to ${o.name}`}</Button>
      <Dialog open={open} onClose={close} error={refused} title={title}
        description={!o.upgrade ? `${o.loses.length ? `On ${downgradeOn} you lose ${o.loses.join(', ')}. ` : ''}No refund.` : undefined}
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Keep my plan</Button><Button onClick={go} busy={busy}>{o.upgrade ? (o.afterTrial ? 'Move after the trial' : `Move to ${o.name}`) : `Switch on ${downgradeOn}`}</Button></>}>
        <table className="w-full text-sm"><tbody>
          {rows.map(([k, v]) => <tr key={k} className="border-t border-line-soft"><td className="py-2.5 text-muted-foreground">{k}</td><td className="py-2.5 text-right font-medium">{v}</td></tr>)}
        </tbody></table>
      </Dialog>
    </>
  )
}

export function KeepPlan() {
  const [busy, start] = useTransition()
  const toast = useToast()
  return <Button variant="secondary" size="sm" busy={busy} onClick={() => start(async () => { const r = await cancelPlanChange(); if (r.ok) toast.ok('You keep your plan.'); else toast.error(r.error) })}>Keep my plan</Button>
}
