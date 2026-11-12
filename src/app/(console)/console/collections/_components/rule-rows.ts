import type { Rule } from '@/domains/catalogue/collection-rules'
import { parseRupees, priceRefusal, rupeesText } from '@/domains/money/rupees'

// =============================================================================
// FILE: src/app/(console)/console/collections/_components/rule-rows.ts
//
// A collection's rules as the editor's rows and back. Plain functions, NOT in
// the 'use client' editor: the server page builds the rows it hands the editor
// with fromRules(), and a function exported from a client file cannot be
// called on the server ("Attempted to call fromRules() from the server") —
// which broke every existing collection's page until 2026-11-07 (found by the
// ux flow's new page coverage, U·2b).
// =============================================================================

export type Row = { field: Rule['field']; value: string; handle?: string; label?: string }

const isPrice = (f: Row['field']) => f === 'price_below' || f === 'price_at_least'

/** A price row whose box holds something that is not a price, keyed `rule:<row>`: the save waits until it is fixed. */
export function ruleErrors(rows: Row[]): Record<string, string> {
  return Object.fromEntries(rows.flatMap((r, i) => (isPrice(r.field) && r.value.trim() && parseRupees(r.value) === null ? [[`rule:${i}`, priceRefusal(r.value)]] : [])))
}

/** Rows as the server takes them: money as paise, empty rows dropped (a price that doesn't read is ruleErrors'). */
export function toRules(rows: Row[]): Rule[] {
  return rows.flatMap((r): Rule[] => {
    if (r.field === 'in_stock') return [{ field: 'in_stock' }]
    if (isPrice(r.field)) { const p = parseRupees(r.value); return p ? [{ field: r.field, value: p }] : [] }
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
