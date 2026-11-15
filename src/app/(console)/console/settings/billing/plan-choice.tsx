'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Facts } from '@/components/data/facts'
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

export function PlanButton({ option: o, current, downgradeOn, fromFeatured = false, scheduled }: { option: PlanOption; current: string; downgradeOn: string; fromFeatured?: boolean; scheduled: boolean }) {
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const [refused, setRefused] = useState<string | null>(null)
  const toast = useToast()
  const close = () => { setOpen(false); setRefused(null) }
  const go = () => start(async () => {
    const r = await changePlan(o.code, fromFeatured ? 'featured' : undefined)
    if (!r.ok) { setRefused(r.error); return }
    close()
    toast.ok(r.upgrade ? (o.afterTrial ? `You move to ${o.name} on ${o.afterTrial}, when your trial ends.` : `You are on ${o.name} now.`) : `You move to ${o.name} on ${downgradeOn}.`)
  })
  if (!o.upgrade && scheduled) return <Button variant="secondary" disabled>Moving on {downgradeOn}</Button>
  const on = o.upgrade ? o.afterTrial : downgradeOn
  const title = on ? `Move to ${o.name} on ${on}?` : `Move to ${o.name} now?`
  const rows: [string, string][] = o.upgrade
    ? [...(o.difference && !o.afterTrial ? [['Rest of this month', `${o.difference} + GST on the next bill`] as [string, string]] : []), [o.afterTrial ? `From ${o.afterTrial}` : 'From today', `${o.price} a month + ${o.fee}`], ...(o.gains.length ? [['You add', o.gains.join(', ')] as [string, string]] : [])]
    : [[`From ${downgradeOn}`, `${o.price} a month + ${o.fee}`]]
  return (
    <>
      <Button variant="secondary" onClick={() => { setRefused(null); setOpen(true) }}>Move to {o.name}</Button>
      <Dialog open={open} onClose={close} error={refused} title={title}
        description={!o.upgrade ? `${o.loses.length ? `On ${downgradeOn} you lose ${o.loses.join(', ')}. ` : ''}This month’s charge stays.` : undefined}
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Keep {current}</Button><Button onClick={go} busy={busy}>{on ? `Move to ${o.name} on ${on}` : `Move to ${o.name}`}</Button></>}>
        <Facts rows={rows} />
      </Dialog>
    </>
  )
}

export function KeepPlan() {
  const [busy, start] = useTransition()
  const toast = useToast()
  return <Button variant="secondary" size="sm" busy={busy} onClick={() => start(async () => { const r = await cancelPlanChange(); if (r.ok) toast.ok('You keep your plan.'); else toast.error(r.error) })}>Keep my plan</Button>
}
