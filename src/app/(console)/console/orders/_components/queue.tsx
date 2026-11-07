'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { DataTable, DataTableBody, DataTableHead, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { Money } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KeySheet } from '@/components/ui/key-sheet'
import { Toaster, useToast } from '@/components/ui/toast'
import { useShortcuts, useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import type { Paise } from '@/domains/money/paise'
import { confirmKey } from '@/domains/ui/shortcuts'
import { cn } from '@/lib/utils'
import { confirmMany, confirmOrder, holdOrder, undoOrderAction } from '../actions'
import { RISK_LABEL, type Tone } from './labels'

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
  id: string; number: string; href: string; customer: string; place: string
  payment: { label: string; tone: Tone }; state: { label: string; tone: Tone }; doNotCollect: boolean
  risk: 'low' | 'medium' | 'high'; canConfirm: boolean; canHold: boolean; total: number; placed: string; dimmed: boolean
}

function Rows({ rows, label }: { rows: QueueRow[]; label: string }) {
  const router = useRouter()
  const toast = useToast()
  const [enabled, setEnabled] = useShortcutsEnabled()
  const [keys, setKeys] = useState(false)
  // No row has focus until the person moves to one: the first j lands on the FIRST row (found by e2e, 2026-11-07).
  const [at, setAt] = useState(-1)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Record<string, string>>({}) // id → what just happened, until the page refreshes
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
  const undoable = (eventIds: string[]) => async () => {
    const results = await Promise.all(eventIds.map((e) => undoOrderAction(e)))
    const bad = results.find((r) => !r.ok)
    setDone({}); router.refresh()
    return bad && !bad.ok ? { ok: false, error: bad.error } : { ok: true }
  }

  async function act(row: QueueRow, what: 'confirm' | 'hold') {
    if (busy || done[row.id]) return
    setBusy(true); setDone((d) => ({ ...d, [row.id]: what === 'confirm' ? 'Confirmed' : 'On hold' }))
    const r = what === 'confirm' ? await confirmOrder(row.id) : await holdOrder(row.id)
    setBusy(false)
    if (!r.ok) {
      setDone((d) => { const { [row.id]: _gone, ...rest } = d; return rest })
      const by = (r as { by?: { email: string | null; at: string } }).by
      const who = by ? ` by ${by.email ?? 'someone'} at ${new Date(by.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''
      toast({ text: `${row.number}: ${r.error}${who}.` })
      return
    }
    const undo = undoable([r.eventId]); lastUndo.current = undo
    toast({ text: `${row.number} ${what === 'confirm' ? 'confirmed' : 'put on hold'}.`, undo })
  }

  async function bulkConfirm() {
    const ids = rows.filter((r) => picked.has(r.id) && r.canConfirm).map((r) => r.id)
    if (!ids.length || busy) return
    setBusy(true)
    const r = await confirmMany(ids)
    setBusy(false)
    if (!r.ok) { toast({ text: r.error }); return }
    setDone((d) => ({ ...d, ...Object.fromEntries(r.confirmed.map((c) => [c.id, 'Confirmed'])) }))
    setPicked(new Set())
    const parts = [`Confirmed ${r.confirmed.length}.`]
    if (r.skippedHigh) parts.push(`Skipped ${r.skippedHigh} high-risk order${r.skippedHigh === 1 ? '' : 's'} — open ${r.skippedHigh === 1 ? 'it' : 'them'} to decide.`)
    if (r.failed) parts.push(`${r.failed} could not be confirmed: they changed since.`)
    const undo = r.confirmed.length ? undoable(r.confirmed.map((c) => c.eventId)) : undefined
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
    undo: () => { if (lastUndo.current) { const u = lastUndo.current; lastUndo.current = null; void u().then((x) => toast({ text: x.ok ? 'Undone.' : x.error ?? 'We could not undo that.' })) } },
    search: () => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    help: () => setKeys(true),
  })

  const count = picked.size
  return (
    <>
      {count > 0 ? (
        <div role="region" aria-label="Selected orders" className="sticky top-[var(--shell-top,0px)] z-10 flex flex-wrap items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm">
          <span className="font-medium">{count} selected</span>
          <Button onClick={bulkConfirm} aria-disabled={busy}>Confirm</Button>
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
              <tr key={r.id} role="row" tabIndex={i === Math.max(at, 0) ? 0 : -1} aria-selected={picked.has(r.id)} onFocus={() => setAt(i)}
                className={cn('border-b border-border last:border-0 hover:bg-muted/40 focus-visible:bg-accent [&>td]:px-3 [&>td]:py-2', (r.dimmed || now) && 'text-muted-foreground', picked.has(r.id) && 'bg-accent')}>
                <Td cell="hide"><input type="checkbox" aria-label={`Select ${r.number}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="size-6 accent-primary" /></Td>
                {/* No prefetch: 50 row links would be 50 server renders on every visit (found by e2e under the stress data, 2026-11-07). */}
                <Td cell="a"><Link data-row-link prefetch={false} href={r.href} className="inline-flex min-h-6 items-center whitespace-nowrap font-mono font-medium">{r.number}</Link></Td>
                <Td cell="c"><span className="line-clamp-2">{r.customer ? <Name>{r.customer}</Name> : '—'}</span><span className="block text-xs text-muted-foreground">{r.place}</span></Td>
                {/* One cell for the badges (several would overlap on a phone), on a full line of its own there: payment,
                    status and risk do not fit beside the customer at 390 px (seen at phone width, 2026-11-07). */}
                <Td cell="e"><span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={r.payment.tone}>{r.payment.label}</Badge>
                  {r.doNotCollect ? <Badge tone="danger">Do not collect cash</Badge> : null}
                  {now ? <Badge tone="info">{now}</Badge> : <Badge tone={r.state.tone}>{r.state.label}</Badge>}
                  {r.risk === 'low' ? null : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium"><span aria-hidden className={cn('size-2 rounded-full', r.risk === 'high' ? 'bg-danger-mark' : 'bg-warn-mark')} />{RISK_LABEL[r.risk]} risk</span>
                  )}
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

export function Queue({ rows, label }: { rows: QueueRow[]; label: string }) {
  return <Toaster><Rows rows={rows} label={label} /></Toaster>
}
