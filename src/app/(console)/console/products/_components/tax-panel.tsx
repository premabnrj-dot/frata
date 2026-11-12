'use client'

import { useId, useMemo, useState } from 'react'
import type { TaxInput } from '@/domains/catalogue/product-form'
import { hsnEntry, inGap, OWN_RATES, rateOn, ruleOn, ruleWords, searchHsn } from '@/domains/tax/rates'
import { UQCS, UQC_NAMES } from '@/domains/tax/units'
import { InfoTip } from '@/components/ui/info-tip'
import { FieldError, fieldProps } from '@/components/ui/field-error'

// =============================================================================
// A product's tax (plan 2026-11-09-gst-core-and-categories § 2; approved mockup "A product's tax"): its HSN code found by
// words or digits, the rate it gives at this price (the ₹2,500 slab drawn as a bar), the unit it is sold in, where it
// is made. A code the table lacks asks for the merchant's own rate. A price that no slab rate fits (₹2,625.01–₹2,950
// including GST) is said, with a price that fits offered.
// =============================================================================

const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export function TaxPanel({ tax, onChange, price, inclusive, charges, now, errors, onReprice }: {
  tax: TaxInput; onChange: (t: TaxInput) => void
  /** The lowest price set on the product (paise), to show the rate it gives. */
  price: number | null
  inclusive: boolean
  /** Whether the shop charges GST (regular scheme): if not, the HSN still prints, no rate applies. */
  charges: boolean
  now: Date
  errors: Record<string, string>
  /** Set every price in the gap to `to` (paise). */
  onReprice: (to: number) => void
}) {
  const id = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  // What was typed and left without a code: kept in the box and said (PR·0: it went back to the old code unseen).
  const [left, setLeft] = useState<string | null>(null)
  const results = useMemo(() => searchHsn(q || tax.hsn, now), [q, tax.hsn, now])
  const entry = hsnEntry(tax.hsn, now)
  const rule = ruleOn(tax.hsn, now)
  const bps = price !== null ? rateOn(tax.hsn, price, inclusive, now, tax.ownBps ? Number(tax.ownBps) : null) : null
  const gap = price !== null ? inGap(tax.hsn, price, inclusive, now) : null
  const known = !!rule
  const valid = /^\d{4}(\d{2})?(\d{2})?$/.test(tax.hsn)
  const leftError = left === null ? undefined : `${/^\d+$/.test(left.replace(/\s/g, '')) ? `${left.trim()} is not an HSN code: 4, 6 or 8 digits.` : `Pick a code from the list for “${left.trim()}”.`}${tax.hsn ? ` Saving keeps ${tax.hsn}.` : ''}`
  const pick = (code: string) => { onChange({ ...tax, hsn: code, ownBps: '' }); setQ(''); setLeft(null); setOpen(false) }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor={`${id}-hsn`} className="flex items-center text-sm font-medium">HSN code<InfoTip about="the HSN code">The code GST uses for what this is. It sets the rate and goes on every invoice.</InfoTip></label>
        <div className="relative">
          <input id={`${id}-hsn`} value={open ? q : left ?? (tax.hsn ? `${tax.hsn}${entry ? ` · ${entry.name}` : ''}` : '')} placeholder="Search by name or code"
            onFocus={() => { setOpen(true); setQ(left ?? '') }} onBlur={(e) => { const t = e.currentTarget.value, typing = open; setTimeout(() => { setOpen(false); if (typing) setLeft(t.trim() && !/^\d{4}(\d{2})?(\d{2})?$/.test(t.replace(/\s/g, '')) ? t : null) }, 150) }}
            onChange={(e) => { setQ(e.target.value); const d = e.target.value.replace(/\s/g, ''); if (/^\d{4}(\d{2})?(\d{2})?$/.test(d)) onChange({ ...tax, hsn: d }) }}
            {...fieldProps('tax.hsn', errors['tax.hsn'] ?? leftError)}
            className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text md:h-9" role="combobox" aria-expanded={open} aria-controls={`${id}-list`} />
          {open && q.trim().length > 1 && !results.length && <p role="status" className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-lg">No HSN code matches “{q.trim()}”</p>}
          {open && results.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg">
              {results.map((e) => (
                <li key={e.code} role="option" aria-selected={e.code === tax.hsn}>
                  <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e.code)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="w-12 font-mono text-xs">{e.code}</span><span className="min-w-0 flex-1">{e.name}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{e.rule.kind === 'flat' ? `${e.rule.bps / 100}%` : `${e.rule.low / 100}% / ${e.rule.high / 100}%`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <FieldError name="tax.hsn" message={errors['tax.hsn'] ?? leftError} />
        {!leftError && !errors['tax.hsn'] && valid && !entry && !(charges && !known) && <p className="text-xs text-muted-foreground">Frrata doesn’t list {tax.hsn}.</p>}
      </div>

      {charges && valid && known && (
        <div className="flex items-center gap-4 rounded-lg bg-muted p-3">
          <b className="font-mono text-2xl tabular-nums">{bps !== null ? `${bps / 100}%` : '—'}</b>
          <div className="min-w-0 flex-1 space-y-1.5 text-sm">
            <p>{price !== null ? `At ${rs(price)} a piece${inclusive ? ' including GST' : ''}` : ruleWords(rule)}</p>
            {rule.kind === 'slab' && price !== null && (() => {
              const lowTop = inclusive ? Math.floor((rule.limit * (10_000 + rule.low)) / 10_000) : rule.limit
              const at = Math.min(100, Math.max(0, (price / (lowTop * 2)) * 100))
              return (
                <div aria-hidden="true">
                  <div className="relative h-2 rounded-full bg-[linear-gradient(to_right,var(--color-ok-text)_0_50%,var(--color-warn-text)_50%_100%)] opacity-80"><i className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${at}%` }} /></div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{rule.low / 100}% up to {rs(lowTop)}{inclusive ? ' incl.' : ''}</span><span>{rule.high / 100}% above</span></div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
      {charges && gap && (
        <div role="status" className="space-y-2 rounded-lg bg-warn p-3 text-sm text-warn-text">
          <p>At {rs(price!)} including GST no slab rate fits: it is charged 18%.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onReprice(gap.below)} className="min-h-9 rounded-md border border-current px-3 font-medium">Price at {rs(gap.below)} (5%)</button>
            <button type="button" onClick={() => onReprice(gap.above)} className="min-h-9 rounded-md border border-current px-3 font-medium">Price at {rs(gap.above)} (18%)</button>
          </div>
        </div>
      )}
      {charges && valid && !known && (
        <div className="space-y-1">
          <span id={`${id}-own`} className="block text-sm font-medium">GST rate for {tax.hsn}</span>
          <div role="radiogroup" aria-labelledby={`${id}-own`} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
            {OWN_RATES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={tax.ownBps === String(r)} {...fieldProps('tax.ownBps', errors['tax.ownBps'])} onClick={() => onChange({ ...tax, ownBps: String(r) })}
                className={`min-h-9 rounded-md px-3 text-sm font-medium ${tax.ownBps === String(r) ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{r / 100}%</button>
            ))}
          </div>
          {errors['tax.ownBps'] ? <FieldError name="tax.ownBps" message={errors['tax.ownBps']} />
            : <p className="text-xs text-muted-foreground">Frrata doesn’t list this code: use the rate your CA gives.</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-uqc`} className="block text-sm font-medium">Sold by</label>
          <select id={`${id}-uqc`} value={tax.uqc} onChange={(e) => onChange({ ...tax, uqc: e.target.value })} {...fieldProps('tax.uqc', errors['tax.uqc'])} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text md:h-9">
            {UQCS.map((u) => <option key={u} value={u}>{UQC_NAMES[u]} ({u})</option>)}
          </select>
          <FieldError name="tax.uqc" message={errors['tax.uqc']} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-origin`} className="block text-sm font-medium">Made in</label>
          <input id={`${id}-origin`} list={`${id}-countries`} value={tax.origin} maxLength={60} onChange={(e) => onChange({ ...tax, origin: e.target.value })} placeholder="India"
            {...fieldProps('tax.origin', errors['tax.origin'])} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text md:h-9" />
          <datalist id={`${id}-countries`}>{['India', 'Bangladesh', 'China', 'Nepal', 'Sri Lanka', 'Vietnam', 'Thailand', 'Indonesia', 'Turkey', 'Italy'].map((c) => <option key={c} value={c} />)}</datalist>
          <FieldError name="tax.origin" message={errors['tax.origin']} />
        </div>
      </div>
    </div>
  )
}
