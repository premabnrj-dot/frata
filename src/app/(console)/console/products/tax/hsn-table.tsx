'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useNow } from '@/components/time/now'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { inGap, OWN_RATES, rateOn, ruleOn, searchHsn } from '@/domains/tax/rates'
import { UQCS, UQC_NAMES } from '@/domains/tax/units'
import { setProductsTax } from './actions'

type Row = { id: string; title: string; handle: string; status: string; hsn: string | null; uqc: string; gstBps: number | null; typeName: string | null; minPrice: number | null }
const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

/** Every product with its HSN and the rate it gives; pick rows, set one code, unit or own rate for all of them. */
export function HsnTable({ rows, charges, inclusive }: { rows: Row[]; charges: boolean; inclusive: boolean }) {
  const now = useNow()
  const router = useRouter()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'missing' | 'gap'>(() => (rows.some((r) => !r.hsn) ? 'missing' : 'all'))
  const [sheet, setSheet] = useState(false)
  const [q, setQ] = useState('')
  const [hsn, setHsn] = useState('')
  const [uqc, setUqc] = useState('NOS')
  const [own, setOwn] = useState('')
  const toast = useToast()
  const [pending, start] = useTransition()
  const rateOf = (r: Row) => (r.minPrice !== null ? rateOn(r.hsn, r.minPrice, inclusive, now, r.gstBps) : null)
  const missing = rows.filter((r) => !r.hsn || (charges && rateOf(r) === null))
  const gaps = rows.filter((r) => charges && r.minPrice !== null && inGap(r.hsn, r.minPrice, inclusive, now))
  const shown = filter === 'missing' ? missing : filter === 'gap' ? gaps : rows
  const results = useMemo(() => searchHsn(q, now, ['W0', 'W1'], 6), [q, now])
  const known = /^\d{4}(\d{2})?(\d{2})?$/.test(hsn) && ruleOn(hsn, now) !== null
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const all = shown.length > 0 && shown.every((r) => picked.has(r.id))

  function apply() {
    start(async () => {
      const r = await setProductsTax([...picked], { hsn, uqc, ownBps: known ? '' : own })
      // The result is a toast (§ Feedback 1, 2); a refusal keeps the sheet open with what was picked.
      if (!r.ok) { toast.error(r.error); return }
      toast.ok(`HSN ${hsn} on ${r.changed} product${r.changed === 1 ? '' : 's'}.`)
      setSheet(false); setPicked(new Set()); router.refresh()
    })
  }

  const chip = (k: typeof filter, label: string, n: number, warn = false) => (
    <button type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setPicked(new Set()) }}
      className={`min-h-9 rounded-full border px-3 text-sm ${filter === k ? 'border-foreground font-semibold' : 'border-border'} ${warn && n ? 'text-warn-text' : ''}`}>{label} · {n}</button>
  )
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {chip('missing', 'Needs HSN', missing.length, true)}{charges ? chip('gap', 'Price in the 5% / 18% gap', gaps.length, true) : null}{chip('all', 'All', rows.length)}
      </div>
      {picked.size > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-3 rounded-lg bg-foreground px-3 py-2 text-background">
          <span className="text-sm">{picked.size} selected</span><span className="flex-1" />
          <button type="button" onClick={() => setSheet(true)} className="min-h-9 rounded-md bg-background px-3 text-sm font-medium text-foreground">Set HSN</button>
        </div>
      )}
      {sheet && (
        <div role="dialog" aria-label={`Set HSN on ${picked.size} products`} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <b>Set HSN on {picked.size} product{picked.size === 1 ? '' : 's'}</b>
          <input value={q} onChange={(e) => { setQ(e.target.value); const d = e.target.value.replace(/\s/g, ''); if (/^\d{4}(\d{2})?(\d{2})?$/.test(d)) setHsn(d) }} placeholder="Search by name or code" aria-label="Search HSN codes"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" />
          <div role="listbox" aria-label="HSN codes" className="divide-y divide-border rounded-md border border-border">
            {results.map((e) => (
              <button key={e.code} type="button" role="option" aria-selected={hsn === e.code} onClick={() => setHsn(e.code)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${hsn === e.code ? 'bg-muted' : ''}`}>
                <span className="w-12 font-mono text-xs">{e.code}</span><span className="min-w-0 flex-1">{e.name}</span>
                <span className="text-xs text-muted-foreground">{e.rule.kind === 'flat' ? `${e.rule.bps / 100}%` : `${e.rule.low / 100}% / ${e.rule.high / 100}%`}</span>
              </button>
            ))}
          </div>
          {hsn && !known && charges && (
            <div role="radiogroup" aria-label="GST rate" className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
              {OWN_RATES.map((r) => <button key={r} type="button" role="radio" aria-checked={own === String(r)} onClick={() => setOwn(String(r))} className={`min-h-9 rounded-md px-3 text-sm font-medium ${own === String(r) ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{r / 100}%</button>)}
            </div>
          )}
          <label className="block text-sm font-medium" htmlFor="bulk-uqc">Sold by</label>
          <select id="bulk-uqc" value={uqc} onChange={(e) => setUqc(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">{UQCS.map((u) => <option key={u} value={u}>{UQC_NAMES[u]} ({u})</option>)}</select>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setSheet(false)}>Not now</Button><Button onClick={apply} disabled={pending || !hsn || (!known && charges && !own)}>{pending ? 'Saving…' : `Set HSN ${hsn}`}</Button></div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground"><tr>
            <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all shown" checked={all} onChange={() => setPicked(all ? new Set() : new Set(shown.map((r) => r.id)))} /></th>
            <th className="px-3 py-2">Product</th><th className="px-3 py-2">HSN</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Price</th>{charges && <th className="px-3 py-2 text-right">GST</th>}
          </tr></thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => {
              const bps = rateOf(r), gap = charges && r.minPrice !== null && inGap(r.hsn, r.minPrice, inclusive, now)
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.title}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="px-3 py-2"><Link href={`/console/products/${r.handle}`} className="font-medium hover:underline">{r.title}</Link>{r.typeName && <span className="block text-xs text-muted-foreground">{r.typeName}</span>}</td>
                  <td className="px-3 py-2">{r.hsn ? <span className="font-mono">{r.hsn}</span> : <span className="rounded-full bg-warn px-2 py-0.5 text-xs text-warn-text">Needs HSN</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.uqc}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.minPrice ? rs(r.minPrice) : '—'}</td>
                  {charges && <td className="px-3 py-2 text-right tabular-nums">{bps === null ? '—' : `${bps / 100}%`}{gap ? <span className="ml-1.5 rounded-full bg-warn px-1.5 py-0.5 text-xs text-warn-text">gap</span> : null}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!shown.length && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{filter === 'missing' ? 'Every product has its HSN code.' : 'Nothing here.'}</p>}
      </div>
    </div>
  )
}
