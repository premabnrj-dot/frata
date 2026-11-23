'use client'

import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { Menu } from '@/components/ui/menu'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { BAR_SCHEMES, BAR_TEXT_MAX, MAX_BARS } from '@/domains/content/kinds-facts'
import { deleteBarAction, endBarAction, saveBarAction, undoContentAction } from '../actions'
import { LinkSelect, type Target } from './link-select'
import { refused } from './refused'

// =============================================================================
// Content › Announcement (final mockup § Announcement): up to 3 bars with dates; a live offer shows first (read-only
// here, "Open Offers"). Add and Edit in a dialog (a sheet on a phone); End now and Delete under More, each a toast with
// Undo. Chips and dates come worked out from the server.
// =============================================================================

export type BarRow = {
  id: string; version: number; text: string; link: string | null; scheme: (typeof BAR_SCHEMES)[number]; startsAt: string; endsAt: string
  chip: { tone: 'ok' | 'info' | 'neutral'; label: string; short: string }; ends: string | null; endsShort: string | null; undoable: boolean
}
type Draft = { id: string | null; version: number | null; text: string; link: string | null; scheme: BarRow['scheme']; startsAt: string; endsAt: string }
const SCHEME_NAMES = { paper: 'Paper', tint: 'Tint', ink: 'Ink' } as const
/** A datetime-local value (India time) as a moment, or null. */
const iso = (s: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00+05:30` : null)

export function Bars({ bars, offer, canSave, lock, targets }: { bars: BarRow[]; offer: { text: string; ends: string | null } | null; canSave: boolean; lock: string | null; targets: Target[] }) {
  const router = useRouter()
  const toast = useToast()
  const [edit, setEdit] = useState<Draft | null>(null)
  const [error, setError] = useState<{ text: string; field?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const label = (l: string | null) => (l ? targets.find((x) => x.path === l)?.label.replace(/^\w+ · /, '') ?? l : null)

  const save = async () => {
    if (!edit) return
    setBusy(true); setError(null)
    const r = await saveBarAction({ id: edit.id, version: edit.version, text: edit.text, link: edit.link, scheme: edit.scheme, startsAt: iso(edit.startsAt), endsAt: iso(edit.endsAt) })
    setBusy(false)
    if (!r.ok) { setError({ text: r.error, field: r.field }); return }
    setEdit(null)
    toast({ text: 'Bar saved', undo: edit.id ? async () => { const u = await undoContentAction({ id: r.id, version: r.version }); router.refresh(); return u } : async () => { const u = await deleteBarAction({ id: r.id, version: r.version }); router.refresh(); return u } })
    router.refresh()
  }
  const mark = async (b: BarRow, how: 'end' | 'delete') => {
    const r = await (how === 'end' ? endBarAction : deleteBarAction)({ id: b.id, version: b.version })
    if (!r.ok) { refused(toast, router.refresh, r.error, () => void mark(b, how)); return }
    toast({ text: how === 'end' ? 'Bar ended' : 'Bar deleted', undo: async () => { const u = await undoContentAction({ id: b.id, version: r.version }); router.refresh(); return u } })
    router.refresh()
  }
  const full = bars.length >= MAX_BARS
  const fieldErr = (f: string) => (error?.field === f ? error.text : null)

  return (
    <Section ariaLabel="Bars" title={!offer && !bars.length ? 'Bars' : <span className="flex items-center gap-2">Bars <Tag className="font-num">{bars.length} of {MAX_BARS}</Tag></span>}
      action={!offer && !bars.length ? (canSave ? null : lock ? <Badge>{lock}</Badge> : null) : canSave ? <Button size="sm" variant="secondary" disabled={full} onClick={() => setEdit({ id: null, version: null, text: '', link: null, scheme: 'paper', startsAt: '', endsAt: '' })}>Add a bar</Button> : lock ? <Badge>{lock}</Badge> : null}>
      {!offer && !bars.length
        ? <div className="grid justify-items-center gap-2 py-6 text-center"><p className="font-medium">No bars yet</p>{canSave && <Button onClick={() => setEdit({ id: null, version: null, text: '', link: null, scheme: 'paper', startsAt: '', endsAt: '' })}>Add a bar</Button>}</div>
        : <ul data-list className="divide-y divide-line-soft">
          {offer && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{offer.text}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-label text-muted-foreground"><Badge tone="ok">Live now</Badge><span>Offer</span>{offer.ends && <span>{offer.ends}</span>}</p></div>
              <a href="/console/offers" className={button({ variant: 'secondary', size: 'sm' })}>Open Offers</a>
            </li>
          )}
          {bars.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.text}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-label text-muted-foreground"><Badge tone={b.chip.tone}>{b.chip.short === b.chip.label ? b.chip.label : <><span className="max-md:hidden">{b.chip.label}</span><span className="md:hidden">{b.chip.short}</span></>}</Badge>{b.ends && <><span className="max-md:hidden">{b.ends}</span><span className="md:hidden">{b.endsShort}</span></>}{b.link && <span>→ {label(b.link)}</span>}</p></div>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="secondary" aria-label={`Edit ${b.text}`} disabled={!canSave} onClick={() => setEdit({ id: b.id, version: b.version, text: b.text, link: b.link, scheme: b.scheme, startsAt: b.startsAt, endsAt: b.endsAt })}>Edit</Button>
                {canSave && <Menu label={`More for ${b.text}`} size="sm" icon={<MoreHorizontal aria-hidden="true" className="size-4" />} items={[
                  ...(b.chip.label === 'Ended' || b.chip.label === 'Ended early' ? [] : [{ label: 'End now', onSelect: () => void mark(b, 'end') }]),
                  { label: 'Delete', danger: true, onSelect: () => void mark(b, 'delete') },
                ]} />}
              </span>
            </li>
          ))}
        </ul>}
      <Dialog open={!!edit} onClose={() => { setEdit(null); setError(null) }} title={edit?.id ? 'Edit a bar' : 'Add a bar'} error={error && !error.field ? error.text : null}
        actions={<><Button variant="secondary" data-autofocus onClick={() => { setEdit(null); setError(null) }}>{edit?.id ? 'Keep as it is' : 'Don’t add'}</Button><Button busy={busy} onClick={save}>Save</Button></>}>
        {edit && <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Text<span className="font-num font-normal text-muted-foreground">{edit.text.length}/{BAR_TEXT_MAX}</span></span>
            <input name="text" value={edit.text} maxLength={BAR_TEXT_MAX} {...fieldProps('text', fieldErr('text'))} onChange={(e) => setEdit({ ...edit, text: e.target.value })} className={`${FIELD} w-full`} />
            <FieldError name="text" message={fieldErr('text')} /></label>
          <LinkSelect label="Link" value={edit.link} targets={targets} onChange={(link) => setEdit({ ...edit, link })} />
          <div className="grid justify-items-start gap-1.5"><span className="text-label font-medium">Colour</span>
            <Segmented label="Colour" value={edit.scheme} options={BAR_SCHEMES.map((s) => [s, SCHEME_NAMES[s]] as const)} onPick={(scheme) => setEdit({ ...edit, scheme })} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-label font-medium">Starts</span>
              <input type="datetime-local" value={edit.startsAt} onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })} className={`${FIELD} w-full`} /></label>
            <label className="grid gap-1.5"><span className="text-label font-medium">Ends</span>
              <input name="endsAt" type="datetime-local" value={edit.endsAt} {...fieldProps('endsAt', fieldErr('endsAt'))} onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })} className={`${FIELD} w-full`} />
              <FieldError name="endsAt" message={fieldErr('endsAt')} /></label>
          </div>
        </div>}
      </Dialog>
    </Section>
  )
}
