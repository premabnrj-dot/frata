'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { Toaster, useToast } from '@/components/ui/toast'
import { arrival } from '@/domains/delivery/dates'
import { istDayKey } from '@/domains/time/day'
import { weekdayShortIN } from '@/lib/format-date'
import { settle } from '@/lib/settle'
import { addHolidayAction, removeHolidayAction, saveDispatchAction } from './actions'
import { FIELD } from '@/components/ui/field'

// =============================================================================
// Delivery Zones › Delivery dates (PD·1, approved mockup "Delivery dates"): dispatch (working days, the daily cutoff,
// the days the shop ships), holidays, and what a shopper sees for an order placed now — the LATEST day of each zone's
// range, by THE date rule (src/domains/delivery/dates.ts arrival), recomputed as the brand edits. `nowIso` comes from
// the server render (never the browser's clock at render).
// =============================================================================

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const field = `${FIELD} w-full`
const IN_STOCK = [{ kind: 'in_stock' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null }]
const day = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

type Props = {
  nowIso: string; canEdit: boolean
  dispatch: { days: number; cutoff: string | null; shipDays: number }
  holidays: { day: string; name: string }[]
  zones: { id: string; name: string; daysMin: number; daysMax: number }[]
}

export function DatesTab(props: Props) {
  return <Toaster><Dates {...props} /></Toaster>
}

function Dates({ nowIso, canEdit, dispatch, holidays, zones }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [days, setDays] = useState(String(dispatch.days))
  const [cutoff, setCutoff] = useState(dispatch.cutoff ?? '')
  const [ship, setShip] = useState(dispatch.shipDays)
  const [hDay, setHDay] = useState('')
  const [hName, setHName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const dirty = String(dispatch.days) !== days || (dispatch.cutoff ?? '') !== cutoff || dispatch.shipDays !== ship

  const act = async (id: string, run: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(id)
    const r = await run().catch(() => ({ ok: false, error: 'We could not save that. Nothing was changed.' }))
    setBusy(null)
    if (!r.ok) { toast({ text: r.error ?? 'We could not save that. Nothing was changed.' }); return false }
    toast({ text: ok }); settle(router); return true
  }

  const now = useMemo(() => new Date(nowIso), [nowIso])
  const today = istDayKey(now)
  const rule = { days: Math.max(0, Math.min(30, Number(days) || 0)), cutoff: cutoff || null, shipDays: ship, holidays: holidays.map((h) => h.day) }
  const shown = zones.map((z) => ({ ...z, by: arrival(IN_STOCK, [z.daysMin, z.daysMax], rule, now)?.to ?? null })).sort((a, b) => (a.by ?? '').localeCompare(b.by ?? ''))

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Section title="Dispatch">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><label htmlFor="d-days" className="text-sm font-medium">Ships within, working days</label>
              <input id="d-days" inputMode="numeric" disabled={!canEdit} className={field} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} /></div>
            <div className="space-y-1"><label htmlFor="d-cut" className="text-sm font-medium">Orders by</label>
              <input id="d-cut" type="time" disabled={!canEdit} className={field} value={cutoff} onChange={(e) => setCutoff(e.target.value)} /></div>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Ship on</legend>
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, i) => {
                const on = ((ship >> i) & 1) === 1
                return <button key={d} type="button" aria-pressed={on} disabled={!canEdit} onClick={() => setShip((s) => s ^ (1 << i))}
                  className="min-h-11 min-w-12 rounded-md border border-input px-3 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground md:min-h-9">{d}</button>
              })}
            </div>
          </fieldset>
          {canEdit && dirty && (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setDays(String(dispatch.days)); setCutoff(dispatch.cutoff ?? ''); setShip(dispatch.shipDays) }}>Discard</Button>
              <Button disabled={!!busy || !ship} onClick={() => act('dispatch', () => saveDispatchAction({ dispatchDays: rule.days, cutoff: rule.cutoff, shipDays: ship }), 'Dispatch saved')}>Save</Button>
            </div>
          )}
        </Section>

        <Section title="Holidays">
          {holidays.length > 0 && (
            <ul className="divide-y divide-border">
              {holidays.map((h) => (
                <li key={h.day} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">{h.name}</span>
                  <span className="font-num text-muted-foreground">{day(h.day)}</span>
                  {canEdit && <Button variant="ghost" disabled={busy === h.day} onClick={() => act(h.day, () => removeHolidayAction(h.day), 'Holiday removed')}>Remove</Button>}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act('holiday', () => addHolidayAction({ day: hDay, name: hName }), 'Holiday added')) { setHDay(''); setHName('') } }}>
              <div className="space-y-1"><label htmlFor="h-day" className="text-sm font-medium">Day</label>
                <input id="h-day" type="date" min={today} className={field} value={hDay} onChange={(e) => setHDay(e.target.value)} /></div>
              <div className="min-w-40 flex-1 space-y-1"><label htmlFor="h-name" className="text-sm font-medium">Name</label>
                <input id="h-name" maxLength={60} className={field} value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Diwali" /></div>
              <Button type="submit" variant="secondary" disabled={busy === 'holiday' || !hDay || !hName.trim()}>Add a holiday</Button>
            </form>
          )}
        </Section>
      </div>

      <Section title={`Ordered now · ${weekdayShortIN(today)}`}>
        {shown.length ? (
          <ul className="divide-y divide-border text-sm">
            {shown.map((z) => <li key={z.id} className="flex justify-between gap-3 py-2"><span>{z.name}</span><b className="font-num">{z.by ? day(z.by) : '—'}</b></li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Set up zones first.</p>}
      </Section>
    </div>
  )
}
