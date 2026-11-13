'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Menu } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { paise } from '@/domains/money/paise'
import type { Status } from '@/domains/catalogue/availability'
import { addToCollection, bulkDelete, bulkStatus, duplicateProduct, restoreStatus, type BulkDelete, type BulkStatus } from '../bulk-actions'
import { LabelBadge } from './status-badge'

/** One row as the server worked it out (page.tsx row()): words and numbers only. */
export type Row = {
  id: string; title: string; href: string; status: string; thumb: string | null; sub: string
  minPrice: number | null; maxPrice: number | null; unpriced: number
  stock: number | 'Pre-order' | 'Made to order' | 'Sold out' | null
  sizes: string; swatches: string[]
}

const VERB: Record<Status, string> = { active: 'Made active', draft: 'Moved to draft', unlisted: 'Made unlisted', archived: 'Archived' }
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
const names = (xs: { title: string }[]) => xs.slice(0, 3).map((x) => x.title).join(', ') + (xs.length > 3 ? ` and ${xs.length - 3} more` : '')

/**
 * The products list's rows with selection (products PR·1, mockup § Products list). Selecting shows the bulk bar:
 * Set status, Add to collection, Duplicate (one), Archive, Delete. Archive, status and Duplicate say what happened with
 * Undo for 8 s; Delete asks first (it can't be undone: a dialog, 5 or more typed). What a bulk action left as it was is
 * named, with why. Selection lives here only: a new filter, search or page is a new list (the page keys it).
 */
export function ProductTable({ rows, collections }: { rows: Row[]; collections: { id: string; title: string }[] }) {
  const router = useRouter()
  const toast = useToast()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const [asking, setAsking] = useState<null | { step: 'confirm' } | { step: 'kept'; out: BulkDelete }>(null)
  const [typed, setTyped] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)
  const ids = rows.filter((r) => picked.has(r.id)).map((r) => r.id)
  const all = ids.length === rows.length
  const toggle = (id: string) => setPicked((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x })
  const after = () => { setPicked(new Set()); router.refresh() }

  const undoOf = (out: BulkStatus) => out.before.length ? async () => {
    const r = await restoreStatus(out.before)
    if (r.ok) router.refresh()
    if (!r.ok) return { ok: false, error: r.error }
    return r.refused.length ? { ok: false, error: `${n(r.refused.length, 'product')} couldn’t go back: ${r.refused.slice(0, 3).map((x) => `${x.title} (${x.needs.join(', ')})`).join('; ')}.` } : { ok: true }
  } : undefined

  const setStatus = (status: Status, which = ids) => start(async () => {
    const r = await bulkStatus(which, status)
    if (!r.ok) return toast.error(r.error)
    after()
    const left = r.refused.length ? `${n(r.refused.length, 'wasn’t', 'weren’t')} changed: ${r.refused.slice(0, 3).map((x) => `${x.title} (${x.needs.join(', ')})`).join('; ')}${r.refused.length > 3 ? '…' : ''}` : undefined
    if (!r.changed) return toast.error(`Nothing was changed. ${left ?? ''}`.trim())
    toast.ok(`${VERB[status]}: ${n(r.changed, 'product')}.`, { undo: undoOf(r), sub: left })
  })

  const duplicate = () => start(async () => {
    const r = await duplicateProduct(ids[0])
    if (!r.ok) return toast.error(r.error)
    after()
    toast.ok('Duplicated as a draft.', { undo: async () => { const d = await bulkDelete([r.id]); if (d.ok) router.refresh(); return d.ok && d.deleted ? { ok: true } : { ok: false, error: d.ok ? 'The copy has changed: delete it from the list.' : d.error } } })
  })

  const collect = (c: { id: string; title: string }) => start(async () => {
    const r = await addToCollection(ids, c.id)
    if (!r.ok) return toast.error(r.error)
    after()
    toast.ok(r.added ? `Added ${n(r.added, 'product')} to ${r.name}.` : `Already in ${r.name}.`)
  })

  const remove = () => start(async () => {
    setDialogError(null)
    const r = await bulkDelete(ids)
    if (!r.ok) return setDialogError(r.error)
    if (r.kept.length) { setAsking({ step: 'kept', out: r }); if (r.deleted) router.refresh(); return }
    setAsking(null); setTyped(''); after()
    toast.ok(`Deleted ${n(r.deleted, 'product')}.`)
  })

  const close = () => { setAsking(null); setTyped(''); setDialogError(null) }
  const mustType = ids.length >= 5
  const kept = asking?.step === 'kept' ? asking.out.kept : []
  const toArchive = kept.filter((k) => k.why !== 'archived')

  return (
    <>
      {ids.length > 0 && (
        // The bulk bar, above the table. Bulk is a desktop tool (design language § Work queues 7): on a phone a row is
        // one target, so its checkbox cell is hidden and the bar never shows.
        <div role="region" aria-label="Selected products" className="mb-3 hidden flex-wrap items-center gap-2 rounded-lg border border-border bg-muted p-2 md:flex">
          <b className="px-1 text-sm">{n(ids.length, 'selected', 'selected')}</b>
          <button type="button" className="min-h-6 text-sm text-muted-foreground underline" onClick={() => setPicked(new Set())}>Clear</button>
          <span className="flex-1" />
          {!pending && <Menu label="Set status" align="end" items={(['active', 'draft', 'unlisted'] as const).map((s) => ({ label: { active: 'Active', draft: 'Draft', unlisted: 'Unlisted' }[s], onSelect: () => setStatus(s) }))} />}
          {!pending && collections.length > 0 && <Menu label="Add to collection" align="end" items={collections.map((c) => ({ label: c.title, onSelect: () => collect(c) }))} />}
          {ids.length === 1 && <Button variant="secondary" disabled={pending} onClick={duplicate}>Duplicate</Button>}
          <Button variant="secondary" disabled={pending} onClick={() => setStatus('archived')}>Archive</Button>
          <Button variant="destructive" disabled={pending} onClick={() => setAsking({ step: 'confirm' })}>Delete</Button>
        </div>
      )}
      <DataTable label="Products">
        <DataTableHead>
          <th className="w-10"><input type="checkbox" aria-label="Select all on this page" checked={all} ref={(el) => { if (el) el.indeterminate = ids.length > 0 && !all }}
            onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))}  /></th>
          <th className="w-14"><span className="sr-only">Photo</span></th><th>Product</th><th>Status</th><th className="text-right">Price</th><th className="text-right">Stock</th><th>Sizes and colours</th>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <Td cell="hide"><input type="checkbox" aria-label={`Select ${r.title}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)}  /></Td>
              <Td cell="hide">{r.thumb
                ? <img src={r.thumb} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 rounded-sm object-cover" />
                : <span className="block h-[50px] w-10 rounded-sm bg-muted" aria-hidden="true" />}</Td>
              <Td cell="a">
                <Link href={r.href} data-row-link prefetch={false} className="line-clamp-2 min-h-6 py-0.5 font-medium [overflow-wrap:anywhere] hover:underline"><Name>{r.title}</Name></Link>
                <span className="block text-xs text-muted-foreground">{r.sub}</span>
              </Td>
              <Td cell="d"><LabelBadge label={r.status} /></Td>
              <Td cell="b" className="whitespace-nowrap text-right">{r.minPrice === null ? <span className="text-muted-foreground">No price</span>
                : <>{r.minPrice === r.maxPrice ? <Money paise={paise(r.minPrice)} /> : <><Money paise={paise(r.minPrice)} />–<Money paise={paise(r.maxPrice!)} /></>}
                  {r.unpriced > 0 && <span className="block text-xs text-muted-foreground">{r.unpriced} without a price</span>}</>}</Td>
              <Td cell="e" className="text-xs md:text-right md:text-sm">{typeof r.stock === 'number' ? <><Numeric>{r.stock}</Numeric><span className="md:hidden"> in stock</span></>
                : r.stock === null ? <span className="text-muted-foreground">—</span>
                : <Badge tone={r.stock === 'Sold out' ? 'warn' : r.stock === 'Pre-order' ? 'info' : 'neutral'}>{r.stock}</Badge>}</Td>
              <Td cell="c" className="text-xs text-muted-foreground md:text-sm">
                <span className="inline-flex items-center gap-1.5">{r.sizes}{r.swatches.length > 0 && <span aria-hidden="true" className="inline-flex gap-0.5">{r.swatches.map((h, i) => <i key={i} className="size-3 rounded-full border border-border" style={{ background: h }} />)}</span>}</span>
              </Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      <Dialog open={asking?.step === 'confirm'} onClose={close} error={dialogError}
        title={`Delete ${n(ids.length, 'product')}?`}
        description={<>Only drafts that were never live or ordered can be deleted. The rest stay, and can be archived instead.</>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={close}>Keep them</Button>
          <Button variant="destructive" disabled={pending || (mustType && typed.trim() !== String(ids.length))} onClick={remove}>{pending ? 'Deleting…' : `Delete ${n(ids.length, 'product')}`}</Button>
        </>}>
        {mustType && <label className="block space-y-1 text-sm">Type {ids.length} to delete them
          <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} className="h-11 w-24 rounded-md border border-input bg-card px-2 font-num md:h-9" /></label>}
      </Dialog>

      <Dialog open={asking?.step === 'kept'} onClose={() => { close(); after() }} error={dialogError}
        title={asking?.step === 'kept' && asking.out.deleted ? `Deleted ${n(asking.out.deleted, 'product')}. ${n(kept.length, 'wasn’t', 'weren’t')} deleted` : `${n(kept.length, 'product')} can’t be deleted`}
        description={toArchive.length ? <>{names(toArchive)} {toArchive.length === 1 ? 'has' : 'have'} been live, ordered or filmed. Archive keeps {toArchive.length === 1 ? 'its' : 'their'} orders as they are and takes {toArchive.length === 1 ? 'it' : 'them'} out of the shop.</>
          : <>{names(kept)} {kept.length === 1 ? 'is' : 'are'} archived already: out of the shop, with {kept.length === 1 ? 'its' : 'their'} orders kept.</>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => { close(); after() }}>{toArchive.length ? 'Cancel' : 'Close'}</Button>
          {toArchive.length > 0 && <Button disabled={pending} onClick={() => { const which = toArchive.map((k) => k.id); close(); setStatus('archived', which) }}>{`Archive ${n(toArchive.length, 'product')}`}</Button>}
        </>} />
    </>
  )
}
