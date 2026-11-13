'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { DataTable, DataTableBody, DataTableHead, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { Money } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { KeySheet } from '@/components/ui/key-sheet'
import { useToast } from '@/components/ui/toast'
import { useShortcuts, useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import type { Paise } from '@/domains/money/paise'
import { MAX_DOCUMENTS } from '@/domains/orders/documents'
import { confirmKey } from '@/domains/ui/shortcuts'
import { cn } from '@/lib/utils'
import { confirmMany, confirmOrder, deliverMany, deliverOrder, holdMany, holdOrder, shipOrder, undoMany, undoOrderAction, undoOutcomeAction, undoOutcomeMany, type BulkResult } from '../actions'
import { pdfHref, printHref, RISK_LABEL, type Tone } from './labels'
import { Icon } from '@/components/icons/icon'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/queue.tsx
//
// THE ORDERS QUEUE'S HANDS (1D·4b): row focus, selection, the keys, bulk
// confirm and Undo. The server page reads and labels the rows; this only
// acts, through the actions in ../actions.ts (roles and risk are checked
// there, never trusted from here). Confirm and Hold are instant: the row says
// so at once, the toast offers Undo for 8 s, and the page refreshes from the
// server (revalidatePath in the action).
// =============================================================================

export type QueueRow = {
  id: string; n: number; number: string; href: string; customer: string; place: string
  payment: { label: string; tone: Tone; icon: 'cod' | 'prepaid' }; state: { label: string; tone: Tone }; doNotCollect: boolean
  risk: 'low' | 'medium' | 'high' | 'unknown'; canConfirm: boolean; canHold: boolean; canPrint: boolean; total: number; placed: string; dimmed: boolean
  /** Ship S·0: the row's one shipping step for THIS member (packed → Mark shipped; on its way → Delivered), or none. */
  shipStep: 'ship' | 'deliver' | null
}

function Rows({ rows, label, slipSize: shopSize }: { rows: QueueRow[]; label: string; slipSize: 'a4' | 'label' }) {
  const router = useRouter()
  const toast = useToast()
  const [enabled, setEnabled] = useShortcutsEnabled()
  const [keys, setKeys] = useState(false)
  // No row has focus until the person moves to one: the first j lands on the FIRST row (found by e2e, 2026-11-07).
  const [at, setAt] = useState(-1)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Record<string, string>>({}) // id → what just happened, until the server's rows arrive
  // Fresh rows from the server say where each order really is: the marks go (else a held row would refuse c).
  useEffect(() => { setDone({}) }, [rows])
  const [busy, setBusy] = useState(false)
  const lastUndo = useRef<(() => Promise<{ ok: boolean; error?: string }>) | null>(null)
  // The table's rows, found inside a wrapper this component owns (DataTableBody takes no ref).
  const wrap = useRef<HTMLDivElement>(null)

  // Which row has focus, from the page itself (state can lag one render behind a click; found by e2e).
  const trs = () => [...(wrap.current?.querySelectorAll<HTMLElement>('tbody tr') ?? [])]
  const focused = () => { const i = trs().indexOf((document.activeElement as HTMLElement | null)?.closest('tr') as HTMLElement); return i >= 0 ? i : at }
  const focusRow = (i: number) => {
    const n = Math.max(0, Math.min(rows.length - 1, i)); setAt(n)
    trs()[n]?.focus()
  }
  const toggle = (id: string) => setPicked((p) => { const s = new Set(p); if (s.has(id)) s.delete(id); else s.add(id); return s })
  const unmark = (ids: string[]) => setDone((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !ids.includes(k))))
  // An undo runs once: from the toast or from z, whichever comes first.
  const undoable = (eventIds: string[], ids: string[], outcome = false) => {
    const undo = async () => {
      if (lastUndo.current === undo) lastUndo.current = null
      // One request for a bulk undo, never one per order (they would queue behind each other). An outcome (Shipped,
      // Delivered) is undone through its own guarded action.
      const r = await (outcome
        ? (eventIds.length === 1 ? undoOutcomeAction(eventIds[0]!) : undoOutcomeMany(eventIds))
        : eventIds.length === 1 ? undoOrderAction(eventIds[0]!) : undoMany(eventIds))
        .catch(() => ({ ok: false as const, error: 'We could not undo that. Open the order to see where it is.' }))
      unmark(ids); router.refresh()
      return r.ok ? { ok: true } : { ok: false, error: r.error }
    }
    return undo
  }
  const saving = () => { toast.error('Still saving the last change…'); return true }

  async function act(row: QueueRow, what: 'confirm' | 'hold') {
    if (busy && saving()) return
    if (done[row.id]) return
    setBusy(true); setDone((d) => ({ ...d, [row.id]: what === 'confirm' ? 'Confirmed' : 'On hold' }))
    let r: Awaited<ReturnType<typeof confirmOrder>>
    try { r = what === 'confirm' ? await confirmOrder(row.id) : await holdOrder(row.id) }
    catch { r = { ok: false, error: 'We could not save that. Check your connection; nothing was changed.' } }
    finally { setBusy(false) }
    if (!r.ok) {
      unmark([row.id])
      const by = (r as { by?: { email: string | null; at: string } }).by
      const who = by ? ` by ${by.email ?? 'someone'} at ${new Date(by.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''
      toast.error(`${row.number}: ${r.error}${who}.`)
      return
    }
    const undo = undoable([r.eventId], [row.id]); lastUndo.current = undo
    toast({ text: `${row.number} ${what === 'confirm' ? 'confirmed' : 'put on hold'}.`, undo })
  }

  async function step(row: QueueRow) {
    if (busy && saving()) return
    if (done[row.id] || !row.shipStep) return
    const word = row.shipStep === 'ship' ? 'Shipped' : 'Delivered'
    setBusy(true); setDone((d) => ({ ...d, [row.id]: word }))
    let r: { ok: true; eventId: string } | { ok: false; error: string }
    try { r = row.shipStep === 'ship' ? await shipOrder(row.id) : await deliverOrder(row.id) }
    catch { r = { ok: false, error: 'We could not save that. Check your connection; nothing was changed.' } }
    finally { setBusy(false) }
    if (!r.ok) { unmark([row.id]); toast.error(`${row.number}: ${r.error}`); return }
    const undo = undoable([r.eventId], [row.id], true); lastUndo.current = undo
    toast({ text: `${row.number} marked ${word.toLowerCase()}.`, undo })
  }

  async function bulkDelivered() {
    if (busy && saving()) return
    const ids = rows.filter((r) => picked.has(r.id) && r.shipStep === 'deliver').map((r) => r.id)
    if (!ids.length) { toast.error('None of the selected orders is on its way.'); return }
    setBusy(true)
    let r: BulkResult
    try { r = await deliverMany(ids) } catch { r = { ok: false, error: 'We could not save that. Check your connection; nothing more was changed.' } } finally { setBusy(false) }
    if (!r.ok) { toast.error(r.error); return }
    setDone((d) => ({ ...d, ...Object.fromEntries(r.done.map((c) => [c.id, 'Delivered'])) }))
    setPicked(new Set())
    const label = (id: string) => rows.find((x) => x.id === id)?.number ?? 'One order'
    const parts = [`Marked ${r.done.length} delivered.`]
    if (r.failed.length) parts.push(`${label(r.failed[0]!.id)}: ${r.failed[0]!.error}${r.failed.length > 1 ? ` (and ${r.failed.length - 1} more)` : ''}`)
    const undo = r.done.length ? undoable(r.done.map((c) => c.eventId), r.done.map((c) => c.id), true) : undefined
    lastUndo.current = undo ?? null
    toast({ text: parts.join(' '), undo })
  }

  async function bulk(what: 'confirm' | 'hold') {
    if (busy && saving()) return
    const ids = rows.filter((r) => picked.has(r.id) && (what === 'confirm' ? r.canConfirm : r.canHold)).map((r) => r.id)
    if (!ids.length) { toast.error(what === 'confirm' ? 'None of the selected orders can be confirmed.' : 'None of the selected orders can be put on hold.'); return }
    setBusy(true)
    let r: BulkResult
    try { r = what === 'confirm' ? await confirmMany(ids) : await holdMany(ids) }
    catch { r = { ok: false, error: 'We could not save that. Check your connection; nothing more was changed.' } }
    finally { setBusy(false) }
    if (!r.ok) { toast.error(r.error); return }
    setDone((d) => ({ ...d, ...Object.fromEntries(r.done.map((c) => [c.id, what === 'confirm' ? 'Confirmed' : 'On hold'])) }))
    setPicked(new Set())
    const parts = [`${what === 'confirm' ? 'Confirmed' : 'Put on hold'} ${r.done.length}.`]
    if (r.skippedHigh) parts.push(`Skipped ${r.skippedHigh} high-risk order${r.skippedHigh === 1 ? '' : 's'} — open ${r.skippedHigh === 1 ? 'it' : 'them'} to decide.`)
    // Each failure in its own words (the first one; the count for the rest), never a generic "changed".
    const label = (id: string) => rows.find((x) => x.id === id)?.number ?? 'One order'
    if (r.failed.length) parts.push(`${label(r.failed[0]!.id)}: ${r.failed[0]!.error}${r.failed.length > 1 ? ` (and ${r.failed.length - 1} more)` : ''}`)
    const undo = r.done.length ? undoable(r.done.map((c) => c.eventId), r.done.map((c) => c.id)) : undefined
    lastUndo.current = undo ?? null
    toast({ text: parts.join(' '), undo })
  }

  const here = () => { const i = focused(); return i >= 0 ? rows[i] : undefined }
  useShortcuts(enabled, {
    next: () => focusRow(focused() + 1), previous: () => focusRow(Math.max(0, focused() - 1)),
    select: () => { const r = here(); if (r) toggle(r.id) },
    open: () => { const r = here(); if (r) router.push(r.href) },
    confirm: () => { const r = here(); if (!r) return; if (confirmKey(r) === 'open') router.push(r.href); else void act(r, 'confirm') },
    hold: () => { const r = here(); if (r?.canHold) void act(r, 'hold') },
    print: () => { const r = here(); if (r?.canPrint) router.push(printHref('slip', [r.n])); else if (r) toast.error(`${r.number} has no packing slip yet.`) },
    undo: () => { const u = lastUndo.current; if (u) void u().then((x) => (x.ok ? toast.ok('Undone.') : toast.error(x.error ?? 'We could not undo that.'))) },
    search: () => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    help: () => setKeys(true),
  })

  const count = picked.size
  const onWay = rows.some((r) => picked.has(r.id) && r.shipStep === 'deliver'), others = rows.some((r) => picked.has(r.id) && (r.canConfirm || r.canHold))
  // At most a print page's worth (a queue page is 50 rows today; the cap says so if that changes).
  const printable = rows.filter((r) => picked.has(r.id) && r.canPrint).map((r) => r.n).slice(0, MAX_DOCUMENTS)
  // A4 or the 4×6 label: the shop's default (Settings › Documents), then this device's last choice (a printer belongs
  // to a desk, not to an account).
  const [slipSize, setSlipSize] = useState<'a4' | 'label'>(shopSize)
  useEffect(() => { try { const v = localStorage.getItem('frrata:slip-size'); if (v === 'label' || v === 'a4') setSlipSize(v) } catch { /* private mode */ } }, [])
  const pickSize = (v: 'a4' | 'label') => { setSlipSize(v); try { localStorage.setItem('frrata:slip-size', v) } catch { /* private mode */ } }
  return (
    <>
      {count > 0 ? (
        <div role="region" aria-label="Selected orders" className="sticky top-[var(--shell-top,0px)] z-10 flex flex-wrap items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm">
          <span className="font-medium">{count} selected</span>
          {/* What the picked rows can take: Delivered for those on their way; Confirm and Hold for the rest (a mixed pick on All). */}
          {onWay ? <Button onClick={() => bulkDelivered()} aria-disabled={busy}>Delivered</Button> : null}
          {others ? <><Button variant={onWay ? 'secondary' : 'primary'} onClick={() => bulk('confirm')} aria-disabled={busy}>Confirm</Button>
            <Button variant="secondary" onClick={() => bulk('hold')} aria-disabled={busy}>Hold</Button></> : null}
          {/* Slips for the selected orders that have one, in the queue's order (the print page takes at most 50). */}
          {printable.length ? <Link prefetch={false} href={printHref('slip', printable)} className={button({ variant: 'secondary' })}>Print {printable.length === 1 ? 'slip' : `${printable.length} slips`}</Link> : null}
          {/* The same slips as one PDF, on A4 or a 4×6 thermal label (Documents D1); the size is remembered on this device. */}
          {printable.length ? <>
            <a href={pdfHref('slip', printable, slipSize)} className={button({ variant: 'secondary' })}>Download {printable.length === 1 ? 'slip' : `${printable.length} slips`} (PDF)</a>
            <label className="sr-only" htmlFor="slip-size">Slip size</label>
            <select id="slip-size" value={slipSize} onChange={(e) => pickSize(e.target.value === 'label' ? 'label' : 'a4')} className="h-11 rounded-md border border-input bg-card px-2 text-sm md:h-9">
              <option value="a4">A4</option><option value="label">4×6 label</option>
            </select>
          </> : null}
          <Button variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>
      ) : null}
      <div ref={wrap}>
      <DataTable label={label}>
        <DataTableHead>
          <th className="w-8"><span className="sr-only">Select</span></th><th>Order</th><th>Customer</th><th>Payment · status · risk</th><th className="text-right">Total</th><th>Placed</th>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r, i) => {
            const now = done[r.id]
            return (
              <tr key={r.id} role="row" tabIndex={i === Math.max(at, 0) ? 0 : -1} onFocus={() => setAt(i)}
                className={cn('border-b border-border last:border-0 hover:bg-muted/40 focus-visible:bg-accent [&>td]:px-3 [&>td]:py-2', (r.dimmed || now) && 'text-muted-foreground', picked.has(r.id) && 'bg-accent')}>
                <Td cell="hide"><input type="checkbox" aria-label={`Select ${r.number}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)}  /></Td>
                {/* No prefetch: 50 row links would be 50 server renders on every visit (found by e2e under the stress data, 2026-11-07). */}
                <Td cell="a"><Link data-row-link prefetch={false} href={r.href} className="inline-flex min-h-6 items-center whitespace-nowrap font-mono font-medium">{r.number}</Link></Td>
                <Td cell="c"><span className="line-clamp-2">{r.customer ? <Name>{r.customer}</Name> : '—'}</span><span className="block text-xs text-muted-foreground">{r.place}</span></Td>
                {/* One cell for the badges (several would overlap on a phone), on a full line of its own there: payment,
                    status and risk do not fit beside the customer at 390 px (seen at phone width, 2026-11-07). */}
                <Td cell="e"><span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.payment.tone}><Icon name={r.payment.icon} className="mr-1 inline size-3.5 align-[-2px]" />{r.payment.label}</Badge>
                  {r.doNotCollect ? <Badge tone="danger">Do not collect cash</Badge> : null}
                  {now ? <Badge tone="info">{now}</Badge> : <Badge tone={r.state.tone}>{r.state.label}</Badge>}
                  {r.risk === 'low' ? null : r.risk === 'unknown' ? <span className="text-xs text-muted-foreground">Risk unavailable</span> : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium"><span aria-hidden className={cn('size-2 rounded-full', r.risk === 'high' ? 'bg-danger-mark' : 'bg-warn-mark')} />{RISK_LABEL[r.risk]} risk</span>
                  )}
                  {r.shipStep && !now ? <Button variant="secondary" onClick={() => void step(r)} aria-disabled={busy}>{r.shipStep === 'ship' ? 'Mark shipped' : 'Delivered'}<span className="sr-only"> {r.number}</span></Button> : null}
                </span></Td>
                <Td cell="b" className="text-right"><Money paise={r.total as Paise} /></Td>
                <Td cell="f" className="whitespace-nowrap text-xs text-muted-foreground md:text-sm">{r.placed}</Td>
              </tr>
            )
          })}
        </DataTableBody>
      </DataTable>
      </div>
      <p className="text-xs text-muted-foreground"><button type="button" onClick={() => setKeys(true)} className="inline-flex min-h-6 items-center underline underline-offset-2">Keyboard shortcuts</button> · press ?</p>
      <KeySheet open={keys} onClose={() => setKeys(false)} enabled={enabled} onEnabled={setEnabled} only={['next', 'previous', 'select', 'open', 'confirm', 'hold', 'undo', 'search', 'help']} />
    </>
  )
}

/** The queue, or `empty` when the tab has no rows. The console layout's Toaster is above both, so a toast's Undo survives the last row leaving. */
export function Queue({ rows, label, empty, slipSize }: { rows: QueueRow[]; label: string; empty: React.ReactNode; slipSize: 'a4' | 'label' }) {
  return rows.length ? <Rows rows={rows} label={label} slipSize={slipSize} /> : empty
}
