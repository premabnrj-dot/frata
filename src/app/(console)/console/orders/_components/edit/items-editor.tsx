'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Section } from '@/components/layout/section'
import { useToast } from '@/components/ui/toast'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { paise } from '@/domains/money/paise'
import { inOrder, planEdit, type Choice, type EditReason, type Want } from '@/domains/orders/edit'
import { dueOf, feeKept, settleOf } from '@/domains/orders/refunds'
import { formatInr } from '@/lib/format'
import type { AddResult, EditorData } from '@/lib/queries/order-edit'
import { loadItemsEditor, saveItemsEdit, undoItemsEdit } from '../../edit-actions'
import { AddItem } from './add-item'
import { EditLine, type RowView } from './edit-line'
import { WhatChanges } from './what-changes'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/edit/items-editor.tsx
//
// THE ITEMS EDITOR (OE·1; mockup view COD), loaded with its pricing only when "Edit items" opens: one action reads the
// facts (loadItemsEditor), and each tap is priced here by the same planner the save runs (domains/orders/edit.ts), so
// "What changes" is what Save writes — the server plans it again and refuses a total that moved, which reloads the facts.
// After Save: a toast with Undo, and the page shows the order as it is now.
// =============================================================================

type Row = { key: string; line: string | null; variantId: string | null; qty: number; removed: EditReason | null; added?: AddResult }

const rowsOf = (d: EditorData): Row[] => d.lines.map((l) => ({ key: l.id, line: l.id, variantId: l.variantId, qty: l.qty, removed: null }))

export default function ItemsEditor({ orderId, number, onClose }: { orderId: string; number: string; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const [data, setData] = useState<EditorData | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [extra, setExtra] = useState<{ choices: Choice[]; room: Record<string, number> }>({ choices: [], room: {} })
  const [asking, setAsking] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async (keep: boolean) => {
    const r = await loadItemsEditor(orderId).catch(() => ({ ok: false as const, error: 'We could not load its items. Try again.' }))
    if (!r.ok) { setFailed(r.error); return }
    setData(r.data)
    setRows((now) => (keep && now.every((x) => x.line === null || r.data.lines.some((l) => l.id === x.line)) ? now : rowsOf(r.data)))
  }
  useEffect(() => { void load(false) }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const facts = useMemo(() => (data ? { ...data.facts, choices: [...data.facts.choices, ...extra.choices], room: { ...extra.room, ...data.facts.room } } : null), [data, extra])
  const result = useMemo(() => {
    if (!facts || !data) return null
    const want: Want[] = rows.filter((r) => !r.removed).map((r) => ({ line: r.line, variantId: r.variantId, qty: r.qty }))
    const reasons = Object.fromEntries(rows.filter((r) => r.removed && r.line).map((r) => [r.line!, r.removed!]))
    return { want, reasons, r: planEdit(facts, inOrder(data.lines, want), reasons) }
  }, [facts, data, rows])

  if (failed) return <Section id="items" title="Edit items"><Panel title={failed} action={<Button variant="secondary" onClick={() => { setFailed(null); void load(false) }}>Try again</Button>} /></Section>
  if (!data || !facts || !result) return <Section id="items" title="Edit items"><p role="status" className="text-sm text-muted-foreground">Loading its items…</p></Section>

  const set = (key: string, change: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r))) }
  const view = (r: Row): RowView => {
    const sold = r.line ? data.lines.find((l) => l.id === r.line)! : null
    const product = sold?.productId ?? r.added?.productId ?? null
    const choices = product ? facts.choices.filter((c) => c.productId === product && !(c.variantId !== r.variantId && rows.some((o) => o !== r && !o.removed && o.variantId === c.variantId))) : []
    const now = facts.choices.find((c) => c.variantId === r.variantId)
    return { key: r.key, title: sold?.title ?? r.added?.title ?? '', image: sold?.image ?? r.added?.image ?? null, soldVariant: sold?.variantId ?? null, added: !sold, variantId: r.variantId, qty: r.qty,
      unitPrice: sold && r.variantId === sold.variantId ? sold.unitPrice : now?.price ?? sold?.unitPrice ?? 0, choices: sold && sold.variantId === null ? [] : choices, room: facts.room,
      options: product ? data.options[product] ?? r.added?.options ?? [] : [], removed: r.removed }
  }
  const plan = result.r.ok ? result.r.plan : null
  const problem = result.r.ok ? null : result.r.problem
  // Paid online (OE·2): a refund of the difference, or a payment asked for first — as the save will work it out.
  const settle = plan && data.facts.paid ? settleOf(plan.total.after, data.facts.paid, data.facts.paid.now) : null

  async function save() {
    if (!plan || busy) return
    setBusy(true)
    try {
      const r = await saveItemsEdit(orderId, { want: result!.want, reasons: result!.reasons, notify: !!data!.to && notify, expectedTotal: plan.total.after, ...(settle ? { expectedDue: dueOf(settle) } : {}) })
      if (!r.ok) {
        toast.error(r.error)
        // The facts moved under the panel (stock, an offer, a price): read them again, keeping the merchant's choices.
        if (r.total !== undefined) await load(true)
        return
      }
      const eventId = r.eventId
      // A change asking the shopper to pay changed nothing yet: no Undo (its way out is "Ship without the change").
      if (r.asked) { toast({ text: `${number}: waiting for ${formatInr(paise(r.asked))} from the shopper` }); onClose(); router.refresh(); return }
      const said = r.refund ? `refund ${formatInr(paise(r.refund))} in 10 minutes` : data!.facts.order.way === 'prepaid' ? `new total ${formatInr(paise(r.total))}` : `collect ${formatInr(paise(r.total))}`
      toast({ text: `${number} saved · ${said}`, undo: async () => { const u = await undoItemsEdit(eventId); router.refresh(); return u.ok ? { ok: true } : { ok: false, error: u.error } } })
      onClose()
      router.refresh()
    } catch {
      toast.error('We could not save that. Check your connection; nothing was changed.')
    } finally { setBusy(false) }
  }

  const taken = new Set(rows.filter((r) => !r.removed && r.variantId).map((r) => r.variantId!))
  return (
    <div className="grid gap-6 pb-28 md:pb-0 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
      <Section id="items" title="Edit items" action={<span className="text-xs text-muted-foreground">Until packed</span>}>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <EditLine key={r.key} row={view(r)} asking={asking === r.key} onAsk={(open) => setAsking(open ? r.key : null)}
              onPick={(variantId) => set(r.key, { variantId })}
              onQty={(qty) => set(r.key, { qty })}
              onRemove={(reason) => { setAsking(null); if (r.line) set(r.key, { removed: reason }); else setRows((rs) => rs.filter((x) => x.key !== r.key)) }}
              onBack={() => set(r.key, { removed: null })} />
          ))}
        </ul>
        <AddItem orderId={orderId} taken={taken} onAdd={(found, variantId) => {
          setExtra((x) => ({ choices: [...x.choices.filter((c) => c.productId !== found.productId), ...found.choices], room: { ...x.room, ...found.room } }))
          setRows((rs) => [...rs, { key: `add-${variantId}-${rs.length}`, line: null, variantId, qty: 1, removed: null, added: found }])
        }} />
      </Section>
      <WhatChanges number={number} plan={plan} problem={problem} before={data.facts.order.total} to={data.to} notify={notify} onNotify={setNotify} settle={settle}
        kept={settle?.kind === 'refund' && data.facts.paid ? feeKept(settle.parts, data.facts.paid.payments) : null}
        onKeep={onClose} onSave={() => void save()} busy={busy} />
    </div>
  )
}
