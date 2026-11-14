'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Panel } from '@/components/ui/panel'
import { Switch } from '@/components/ui/switch'
import { Toaster, useToast } from '@/components/ui/toast'
import type { Paise } from '@/domains/money/paise'
import type { PresetKey } from '@/domains/delivery/presets'
import { formatCount } from '@/lib/format'
import { settle } from '@/lib/settle'
import type { ConsoleZone } from '@/lib/queries/delivery'
import { deleteZoneAction, moveZoneAction, saveZoneAction, startZonesAction } from './actions'
import { FIELD } from '@/components/ui/field'

// =============================================================================
// Delivery Zones › Zones (PD·1, approved mockup "Zones" and "Edit a zone"). No zones yet: one button sets up the four
// starting zones from today's Settings. A table (rows on a phone): name, PIN codes, delivery, free above, days, pay on
// delivery; Edit opens the zone in a dialog; ↑ ↓ reorder; Remove asks first (it loses the zone). Rule 0: labels only.
// =============================================================================

type Row = ConsoleZone & { count: number | null }
type Floor = { charge: number; freeAbove: number | null; codOn: boolean; codCharge: number }

const WHERE: Record<PresetKey, string> = {
  metro: 'Delhi NCR, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad',
  tier2: 'State capitals and the larger cities',
  special: 'North East, J&K, Ladakh, Andaman & Nicobar, Lakshadweep',
  rest: 'Everywhere else',
}
const rs = (p: number) => <Money paise={p as Paise} />
const field = `${FIELD} w-full`

const days = (z: Row) => (z.daysMin === z.daysMax ? String(z.daysMin) : `${z.daysMin}–${z.daysMax}`)

function cod(z: Row) {
  if (!z.codOn) return 'Pay online only'
  const fee = z.codCharge ? `₹${(z.codCharge / 100).toLocaleString('en-IN')}` : 'free'
  return z.codMax ? `Up to ₹${(z.codMax / 100).toLocaleString('en-IN')} · ${fee}` : `On · ${fee}`
}

export function ZonesTab(props: { zones: Row[]; floor: Floor; canEdit: boolean }) {
  return <Toaster><Zones {...props} /></Toaster>
}

function Zones({ zones, canEdit }: { zones: Row[]; floor: Floor; canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [removing, setRemoving] = useState<Row | null>(null)

  const act = async (id: string, run: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => {
    setBusy(id)
    const r = await run().catch(() => ({ ok: false, error: 'We could not save that. Nothing was changed.' }))
    setBusy(null)
    if (!r.ok) { toast({ text: r.error ?? 'We could not save that. Nothing was changed.' }); return false }
    if (ok) toast({ text: ok })
    settle(router)
    return true
  }

  if (!zones.length) {
    return (
      <Panel title="Start with four zones"
        action={canEdit ? <Button disabled={busy === 'start'} onClick={() => act('start', startZonesAction, 'Zones set up')}>{busy === 'start' ? 'Setting up…' : 'Set up zones'}</Button> : undefined}>
        Metro, Tier 2, Special and Rest of India, each with your Settings’ charges and days.
      </Panel>
    )
  }

  return (
    <div className="space-y-3">
      {canEdit && <div className="flex justify-end"><Button onClick={() => setEditing('new')}>Add a zone</Button></div>}
      <DataTable label="Zones">
        <DataTableHead>
          <th>Zone</th><th className="text-right">PIN codes</th><th className="text-right">Delivery</th><th className="text-right">Free above</th>
          <th className="text-right">Days</th><th>Pay on delivery</th>{canEdit && <th><span className="sr-only">Actions</span></th>}
        </DataTableHead>
        <DataTableBody>
          {zones.map((z, i) => (
            <DataTableRow key={z.id}>
              <Td cell="a">
                <b className="block">{z.name}</b>
                <span className="text-xs text-muted-foreground">{z.preset ? WHERE[z.preset] : `Yours: ${z.pins.slice(0, 4).map((p) => (p.length === 3 ? `${p}…` : p)).join(', ')}${z.pins.length > 4 ? '…' : ''}`}</span>
              </Td>
              <Td cell="hide" className="text-right"><Numeric>{z.count === null ? '—' : formatCount(z.count)}</Numeric></Td>
              <Td cell="b" className="text-right">{z.charge ? rs(z.charge) : 'Free'}</Td>
              <Td cell="hide" className="text-right">{z.freeAbove ? rs(z.freeAbove) : '—'}</Td>
              <Td cell="hide" className="text-right"><Numeric>{days(z)}</Numeric></Td>
              {/* A phone's line 2: the days beside pay on delivery (the days column is desktop-only). */}
              <Td cell="d"><span className="md:hidden">{days(z)} days · </span>{cod(z)}</Td>
              {canEdit && (
                <Td cell="e" className="whitespace-nowrap text-right">
                  <Button variant="ghost" aria-label={`Move ${z.name} up`} disabled={i === 0 || !!busy} onClick={() => act(z.id, () => moveZoneAction({ id: z.id, up: true }))}>↑</Button>
                  <Button variant="ghost" aria-label={`Move ${z.name} down`} disabled={i === zones.length - 1 || !!busy} onClick={() => act(z.id, () => moveZoneAction({ id: z.id, up: false }))}>↓</Button>
                  <Button variant="secondary" onClick={() => setEditing(z)}>Edit</Button>
                  {z.preset !== 'rest' && <Button variant="ghost" onClick={() => setRemoving(z)}>Remove</Button>}
                </Td>
              )}
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {editing && <ZoneDialog key={editing === 'new' ? 'new' : editing.id} zone={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)} onSave={async (v) => { if (await act('save', () => saveZoneAction(v), 'Zone saved')) setEditing(null) }} busy={busy === 'save'} />}

      <Dialog open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? 'this zone'}?`}
        description="Its PIN codes go to the next zone that takes them."
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setRemoving(null)}>Keep the zone</Button>
          <Button variant="destructive" disabled={!!busy} onClick={async () => { const z = removing!; setRemoving(null); await act(z.id, () => deleteZoneAction(z.id), 'Zone removed') }}>Remove zone</Button>
        </>} />
    </div>
  )
}

function L({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label htmlFor={id} className="text-sm font-medium">{label}</label>{children}</div>
}

type Draft = { name: string; charge: string; freeAbove: string; daysMin: string; daysMax: string; codOn: boolean; codCharge: string; codMin: string; codMax: string; pins: string }
const r$ = (p: number | null) => (p ? String(p / 100) : '')

function ZoneDialog({ zone, onClose, onSave, busy }: { zone: Row | null; onClose: () => void; onSave: (v: object) => void; busy: boolean }) {
  const [d, setD] = useState<Draft>(() => zone
    ? { name: zone.name, charge: r$(zone.charge) || '0', freeAbove: r$(zone.freeAbove), daysMin: String(zone.daysMin), daysMax: String(zone.daysMax), codOn: zone.codOn,
        codCharge: r$(zone.codCharge) || '0', codMin: r$(zone.codMin), codMax: r$(zone.codMax), pins: zone.pins.join(', ') }
    : { name: '', charge: '0', freeAbove: '', daysMin: '1', daysMax: '2', codOn: true, codCharge: '0', codMin: '', codMax: '', pins: '' })
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }))
  const own = !zone || zone.preset === null
  const num = (s: string) => Number(s.replace(/[₹,\s]/g, '') || 0)
  const save = () => onSave({
    ...(zone ? { id: zone.id } : {}), name: d.name, charge: num(d.charge), freeAbove: d.freeAbove ? num(d.freeAbove) : null,
    daysMin: Math.round(num(d.daysMin)), daysMax: Math.round(num(d.daysMax)), codOn: d.codOn, codCharge: num(d.codCharge), codMin: num(d.codMin), codMax: d.codMax ? num(d.codMax) : null,
    ...(own ? { pins: d.pins } : {}),
  })
  return (
    <Dialog open onClose={onClose} title={zone ? zone.name : 'Add a zone'}
      actions={<><Button variant="secondary" data-autofocus onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save zone'}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="sm:col-span-2"><L id="z-name" label="Name"><input id="z-name" className={field} maxLength={40} value={d.name} onChange={set('name')} /></L></div>
        {own && (
          <div className="sm:col-span-2"><L id="z-pins" label="PIN codes or 3-digit prefixes">
            <textarea id="z-pins" rows={3} className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm" value={d.pins} onChange={set('pins')} placeholder="302001, 302012, 303" />
          </L></div>
        )}
        <L id="z-charge" label="Delivery charge, ₹"><input id="z-charge" inputMode="decimal" className={field} value={d.charge} onChange={set('charge')} /></L>
        <L id="z-free" label="Free delivery above, ₹"><input id="z-free" inputMode="decimal" className={field} value={d.freeAbove} onChange={set('freeAbove')} placeholder="Never" /></L>
        <L id="z-dmin" label="Delivery days, from"><input id="z-dmin" inputMode="numeric" className={field} value={d.daysMin} onChange={set('daysMin')} /></L>
        <L id="z-dmax" label="Delivery days, to"><input id="z-dmax" inputMode="numeric" className={field} value={d.daysMax} onChange={set('daysMax')} /></L>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <label htmlFor="z-cod" className="text-sm font-medium">Pay on delivery</label>
          <Switch id="z-cod" on={d.codOn} onChange={(v) => setD((x) => ({ ...x, codOn: v }))} />
        </div>
        {d.codOn && <>
          <L id="z-fee" label="Pay on delivery fee, ₹"><input id="z-fee" inputMode="decimal" className={field} value={d.codCharge} onChange={set('codCharge')} /></L>
          <L id="z-max" label="Only up to, ₹"><input id="z-max" inputMode="decimal" className={field} value={d.codMax} onChange={set('codMax')} placeholder="No limit" /></L>
        </>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

export type { Row as ZoneRow }
