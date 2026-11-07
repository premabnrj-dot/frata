'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LeaveDialog, Message, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import type { Rule } from '@/domains/catalogue/collection-rules'
import { MAX_RULES } from '@/domains/catalogue/collection-rules'
import { parseRupees, rupeesText } from '@/domains/catalogue/product-form'
import { handleFor } from '@/domains/catalogue/variants'
import { CategoryPicker } from '../../products/_components/organise-card'
import { deleteCollection, previewRules, saveCollection } from '../actions'
import { Section } from '@/components/layout/section'
import { BackLink } from '@/components/layout/page-header'

type Row = { field: Rule['field']; value: string; handle?: string; label?: string }
export type EditorCollection = { id: string | null; title: string; handle: string; description: string; kind: 'manual' | 'auto'; matchAll: boolean; rules: Row[]; sort: string; productIds: string[] }
export type ProductPick = { id: string; title: string; status: string }
export type AttrOption = { handle: string; value: string; label: string }

const FIELDS: [Rule['field'], string][] = [['category', 'Category is'], ['attribute', 'Detail is'], ['colour_family', 'Colour family is'], ['price_below', 'Price is below ₹'], ['price_at_least', 'Price is at least ₹'], ['in_stock', 'Can be bought now'], ['tag', 'Tag is']]
const SORTS: [string, string][] = [['newest', 'Newest first'], ['price_low', 'Price, low to high'], ['price_high', 'Price, high to low'], ['title', 'Name, A to Z'], ['manual', 'The order you pick']]

/** Rows as the server takes them: money as paise, empty rows dropped. */
export function toRules(rows: Row[]): Rule[] {
  return rows.flatMap((r): Rule[] => {
    if (r.field === 'in_stock') return [{ field: 'in_stock' }]
    if (r.field === 'price_below' || r.field === 'price_at_least') { const p = parseRupees(r.value); return p ? [{ field: r.field, value: p }] : [] }
    if (!r.value) return []
    if (r.field === 'attribute') return r.handle ? [{ field: 'attribute', handle: r.handle, value: r.value }] : []
    return [{ field: r.field, value: r.value }]
  })
}
export function fromRules(rules: Rule[], names: Record<string, string>): Row[] {
  return rules.map((r) => r.field === 'in_stock' ? { field: r.field, value: '' }
    : r.field === 'price_below' || r.field === 'price_at_least' ? { field: r.field, value: rupeesText(r.value) }
    : r.field === 'attribute' ? { field: r.field, handle: r.handle, value: r.value }
    : { field: r.field, value: String(r.value), label: r.field === 'category' ? names[r.value] : undefined })
}

/** A collection: name and address, then hand-picked products or rules with a live count. */
export function CollectionEditor({ initial, products, families, attrOptions }: { initial: EditorCollection; products: ProductPick[]; families: { id: string; name: string }[]; attrOptions: AttrOption[] }) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [d, setD] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null)
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const guard = useLeaveGuard(dirty && !!initial.id)
  const set = (patch: Partial<EditorCollection>) => { setD((x) => ({ ...x, ...patch })); setMsg(null) }
  const setRow = (i: number, patch: Partial<Row>) => set({ rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) })

  // Live count for rules (debounced; the newest answer wins).
  const seq = useRef(0)
  const ruleKey = JSON.stringify([toRules(d.rules), d.matchAll])
  useEffect(() => {
    if (d.kind !== 'auto') return
    const n = ++seq.current
    const t = setTimeout(async () => { const r = await previewRules(toRules(d.rules), d.matchAll); if (n === seq.current) setPreview(r) }, 250)
    return () => clearTimeout(t)
  }, [ruleKey, d.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => start(async () => {
    const r = await saveCollection(d.id, { ...d, rules: toRules(d.rules) })
    if (!r.ok) { setErrors(r.errors ?? {}); setMsg({ tone: 'error', text: r.error }); return }
    setSaved(d); setErrors({}); setMsg({ tone: 'ok', text: 'Saved.' })
    if (!d.id || r.handle !== initial.handle) router.replace(`/console/collections/${r.handle}`)
    else router.refresh()
  })
  const remove = () => start(async () => {
    const r = await deleteCollection(d.id!)
    if (!r.ok) return setMsg({ tone: 'error', text: r.error })
    setSaved(d); router.replace('/console/collections')
  })

  const picked = d.productIds.map((id) => products.find((p) => p.id === id)).filter((p): p is ProductPick => !!p)
  const found = q.trim() ? products.filter((p) => !d.productIds.includes(p.id) && p.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []
  const field = 'h-9 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text'

  return (
    <div className="max-w-3xl">
      {dirty && initial.id && <SaveBar pending={pending} onSave={save} onDiscard={() => { setD(saved); setErrors({}) }} />}
      <BackLink href="/console/collections" label="Collections" />
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{initial.id ? saved.title : 'New collection'}</h1>
      <Message m={msg} />
      <div className="mt-4 space-y-4">
        <Section>
          <div className="space-y-1"><label htmlFor="c-title" className="block text-sm font-medium">Name</label>
            <input id="c-title" value={d.title} maxLength={80} placeholder="Festive edit" aria-invalid={!!errors.title || undefined} onChange={(e) => set({ title: e.target.value })} className={field} />
            {errors.title && <p className="text-xs text-danger-text">{errors.title}</p>}</div>
          <div className="space-y-1"><label htmlFor="c-handle" className="block text-sm font-medium">Address</label>
            <div className="flex items-center rounded-md border border-input bg-card text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"><span className="pl-3 font-mono text-xs text-muted-foreground">…/collections/</span>
              <input id="c-handle" value={d.handle} maxLength={80} placeholder={handleFor(d.title) || 'festive-edit'} onChange={(e) => set({ handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="h-10 md:h-9 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none" /></div>
            {errors.handle && <p className="text-xs text-danger-text">{errors.handle}</p>}</div>
          <div className="space-y-1"><label htmlFor="c-desc" className="block text-sm font-medium">Description <span className="font-normal text-muted-foreground">(optional, shown at the top of its page)</span></label>
            <textarea id="c-desc" rows={2} maxLength={2000} value={d.description} onChange={(e) => set({ description: e.target.value })} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" /></div>
        </Section>

        <Section>
          <fieldset className="space-y-1.5"><legend className="text-sm font-medium">How products get in</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([['manual', 'You pick them', 'Add products one by one, in the order you want.'], ['auto', 'Rules fill it', 'Products that match join and leave by themselves.']] as const).map(([k, l, s]) => (
                <label key={k} className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm ${d.kind === k ? 'border-ring bg-accent' : 'border-border'}`}>
                  <input type="radio" name="kind" checked={d.kind === k} onChange={() => set({ kind: k, sort: k === 'auto' && d.sort === 'manual' ? 'newest' : d.sort })} className="mt-0.5" />
                  <span><span className="font-medium">{l}</span><span className="block text-xs text-muted-foreground">{s}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          {d.kind === 'manual' ? (
            <div className="space-y-2">
              <label htmlFor="c-find" className="block text-sm font-medium">Add products</label>
              <input id="c-find" value={q} placeholder="Search your products" onChange={(e) => setQ(e.target.value)} className={field} />
              {found.length > 0 && <ul className="divide-y divide-border rounded-md border border-border">{found.map((p) => <li key={p.id}><button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { set({ productIds: [...d.productIds, p.id] }); setQ('') }}>+ {p.title}</button></li>)}</ul>}
              {picked.length === 0 ? <p className="text-sm text-muted-foreground">No products yet.</p> : (
                <ol className="divide-y divide-border rounded-md border border-border">
                  {picked.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}</span><span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <button type="button" aria-label={`Move ${p.title} up`} disabled={i === 0} className="px-1 disabled:opacity-30" onClick={() => { const a = [...d.productIds]; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; set({ productIds: a }) }}>↑</button>
                      <button type="button" aria-label={`Move ${p.title} down`} disabled={i === picked.length - 1} className="px-1 disabled:opacity-30" onClick={() => { const a = [...d.productIds]; [a[i + 1], a[i]] = [a[i]!, a[i + 1]!]; set({ productIds: a }) }}>↓</button>
                      <button type="button" className="inline-flex min-h-6 items-center text-xs text-muted-foreground underline" onClick={() => set({ productIds: d.productIds.filter((x) => x !== p.id) })}>Remove</button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">Products must match
                <label className="sr-only" htmlFor="c-match">Match all or any</label>
                <select id="c-match" value={d.matchAll ? 'all' : 'any'} onChange={(e) => set({ matchAll: e.target.value === 'all' })} className="h-8 rounded-md border border-input bg-card px-1.5 text-sm"><option value="all">every rule</option><option value="any">any rule</option></select></div>
              <ul className="space-y-2">
                {d.rules.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2 rounded-md bg-muted/50 p-2">
                    <label className="sr-only" htmlFor={`r-f-${i}`}>Rule {i + 1}</label>
                    <select id={`r-f-${i}`} value={r.field} onChange={(e) => setRow(i, { field: e.target.value as Rule['field'], value: '', handle: undefined, label: undefined })} className="h-10 md:h-9 rounded-md border border-input bg-card px-1.5 text-sm">
                      {FIELDS.map(([f, l]) => <option key={f} value={f}>{l}</option>)}
                    </select>
                    <div className="min-w-48 flex-1">
                      {r.field === 'category' && <CategoryPicker bare label={`Category for rule ${i + 1}`} value={r.value ? { id: r.value, name: r.label ?? r.value, path: '', attributes: [] } : null} onChange={(c) => setRow(i, { value: c?.id ?? '', label: c?.name })} />}
                      {r.field === 'attribute' && (attrOptions.length ? (
                        <select aria-label={`Detail for rule ${i + 1}`} value={r.handle ? `${r.handle}|${r.value}` : ''} onChange={(e) => { const [h, v] = e.target.value.split('|'); setRow(i, { handle: h, value: v ?? '' }) }} className={field}>
                          <option value="">Choose…</option>{attrOptions.map((o) => <option key={`${o.handle}|${o.value}`} value={`${o.handle}|${o.value}`}>{o.label}</option>)}
                        </select>) : <p className="py-2 text-xs text-muted-foreground">Add details (fabric, occasion…) to products first.</p>)}
                      {r.field === 'colour_family' && <select aria-label={`Colour family for rule ${i + 1}`} value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} className={field}><option value="">Choose…</option>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                      {(r.field === 'price_below' || r.field === 'price_at_least') && <input aria-label={`Price for rule ${i + 1}`} inputMode="decimal" value={r.value} placeholder="2000" onChange={(e) => setRow(i, { value: e.target.value })} className={`${field} font-mono`} />}
                      {r.field === 'tag' && <input aria-label={`Tag for rule ${i + 1}`} value={r.value} maxLength={40} placeholder="Diwali 2026" onChange={(e) => setRow(i, { value: e.target.value })} className={field} />}
                      {r.field === 'in_stock' && <p className="py-2 text-xs text-muted-foreground">In stock, or taking pre-orders or made to order.</p>}
                    </div>
                    <button type="button" aria-label={`Remove rule ${i + 1}`} className="h-9 px-2 text-muted-foreground hover:text-foreground" onClick={() => set({ rules: d.rules.filter((_, j) => j !== i) })}>×</button>
                  </li>
                ))}
              </ul>
              {d.rules.length < MAX_RULES && <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => set({ rules: [...d.rules, { field: 'category', value: '' }] })}>+ Add a rule</button>}
              {errors.rules && <p className="text-xs text-danger-text">{errors.rules}</p>}
              <p role="status" className="rounded-md bg-accent px-3 py-2 text-sm">{preview ? <><span className="font-mono font-semibold">{preview.count}</span> product{preview.count === 1 ? '' : 's'} match now{preview.sample.length ? `: ${preview.sample.join(', ')}${preview.count > preview.sample.length ? '…' : ''}` : ''}</> : 'Counting…'}</p>
            </div>
          )}
          <div className="space-y-1"><label htmlFor="c-sort" className="block text-sm font-medium">Order on your shop</label>
            <select id="c-sort" value={d.sort} onChange={(e) => set({ sort: e.target.value })} className={field}>{SORTS.filter(([k]) => d.kind === 'manual' || k !== 'manual').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </Section>
        {!initial.id && <Button disabled={pending} onClick={save}>Create collection</Button>}
        {initial.id && (
          <section className="rounded-md border border-border p-4 text-sm">
            {confirmDelete
              ? <div className="flex flex-wrap items-center gap-3"><span>Delete {saved.title}? Products stay; only the group goes.</span><Button variant="secondary" disabled={pending} onClick={remove}>Delete</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setConfirmDelete(false)}>Keep it</button></div>
              : <button type="button" className="inline-flex min-h-6 items-center text-danger-text underline" onClick={() => setConfirmDelete(true)}>Delete this collection</button>}
          </section>
        )}
      </div>
      {guard.leaveTo && <LeaveDialog what={saved.title || 'this collection'} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(d))} />}
    </div>
  )
}
