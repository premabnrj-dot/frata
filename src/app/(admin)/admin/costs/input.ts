import { z } from 'zod'
import {
  COST_CADENCES, COST_CATEGORIES, COST_CURRENCIES, COST_SOURCES, cleanText, parseAmount, parseDay, parseRupees,
  type CostCurrency, type CostItemInput, type PaidInput,
} from '@/domains/admin/costs'
import type { CostPatch } from '@/lib/admin/costs'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/input.ts — what a person types in Admin › Costs' forms, parsed (plan
// docs/plans/2026-11-23-admin-costs.md task 5). Pure: `today` is an argument. A parse gives the typed value or the words for
// each wrong field (frata-design-language § Words). Text is cleaned of control and direction characters; money is exact.
// =============================================================================

export type Parsed<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> }
export const FIELD_WORDS = {
  name: 'Add a name.', amount: 'Enter an amount above zero.', anchorOn: 'Pick the next due date.', paidOn: 'Pick today or an earlier day.', endsOn: 'Pick the last day.',
  inr: 'Enter the rupees charged.', gst: 'Enter the GST in rupees.', periodFor: 'Pick the bill this pays.', category: 'Pick a category.',
  cadence: 'Pick how often it repeats.', currency: 'Pick rupees or dollars.', other: 'Check this field.',
} as const

const clean = (max: number) => z.string().max(max * 4).transform(cleanText).pipe(z.string().max(max))
const opt = (max: number) => clean(max).transform((s) => (s === '' ? null : s))
/** An optional text field a form may leave out: absent or empty is null. */
const orNull = (max: number) => opt(max).optional().transform((v) => v ?? null)
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
const money = z.string().max(24)
const plusYears = (day: string, n: number) => `${Number(day.slice(0, 4)) + n}${day.slice(4)}`
const wordsOf = (issues: readonly { path: PropertyKey[] }[]) => {
  const fields: Record<string, string> = {}
  for (const i of issues) {
    const k = String(i.path[0] ?? 'other')
    fields[k] ??= (FIELD_WORDS as Record<string, string>)[k] ?? FIELD_WORDS.other
  }
  return fields
}
const bad = (fields: Record<string, string>): { ok: false; fields: Record<string, string> } => ({ ok: false, fields })

const AddShape = z.object({
  kind: z.enum(['recurring', 'one_time']), name: clean(80).pipe(z.string().min(1)), vendor: orNull(80), category: z.enum(COST_CATEGORIES), currency: z.enum(COST_CURRENCIES),
  cadence: z.enum(COST_CADENCES).optional(), varies: z.string().optional(), amount: money, anchorOn: z.string().optional(), paidOn: z.string().optional(),
  inr: money.optional(), gst: money.optional(), note: orNull(300),
})

export function parseAdd(raw: Record<string, string>, today: string): Parsed<CostItemInput> {
  const p = AddShape.safeParse(raw)
  if (!p.success) return bad(wordsOf(p.error.issues))
  const v = p.data
  const fields: Record<string, string> = {}
  const amount = parseAmount(v.amount, v.currency)
  if (amount === null) fields.amount = FIELD_WORDS.amount
  const common = { name: v.name, vendor: v.vendor, category: v.category, currency: v.currency, amount: amount ?? 0, note: v.note }
  if (v.kind === 'recurring') {
    const anchorOn = parseDay(v.anchorOn ?? '', plusYears(today, 2))
    if (!anchorOn) fields.anchorOn = FIELD_WORDS.anchorOn
    if (!v.cadence) fields.cadence = FIELD_WORDS.cadence
    if (Object.keys(fields).length || !anchorOn || !v.cadence) return bad(fields)
    return { ok: true, data: { kind: 'recurring', ...common, cadence: v.cadence, varies: v.varies === 'on', anchorOn } }
  }
  const paidOn = parseDay(v.paidOn ?? '', today)
  if (!paidOn) fields.paidOn = FIELD_WORDS.paidOn
  const inrPaise = v.currency === 'USD' ? parseAmount(v.inr ?? '', 'INR') : null
  if (v.currency === 'USD' && inrPaise === null) fields.inr = FIELD_WORDS.inr
  const gst = v.gst?.trim() ? parseRupees(v.gst) : null
  if (v.gst?.trim() && gst === null) fields.gst = FIELD_WORDS.gst
  if (Object.keys(fields).length || !paidOn) return bad(fields)
  return { ok: true, data: { kind: 'one_time', ...common, paidOn, inrPaise: inrPaise ?? undefined, gstPaise: gst } }
}

const PaidShape = z.object({ itemId: uuid, periodFor: z.string(), paidOn: z.string(), currency: z.enum(COST_CURRENCIES), amount: money, inr: money.optional(), gst: money.optional(), note: orNull(300) })

export function parsePaid(raw: Record<string, string>, today: string): Parsed<{ itemId: string; currency: CostCurrency; input: PaidInput }> {
  const p = PaidShape.safeParse(raw)
  if (!p.success) return bad(wordsOf(p.error.issues))
  const v = p.data
  const fields: Record<string, string> = {}
  const periodFor = parseDay(v.periodFor, plusYears(today, 3))
  const paidOn = parseDay(v.paidOn, today)
  const amount = parseAmount(v.amount, v.currency)
  const inr = v.currency === 'USD' ? parseAmount(v.inr ?? '', 'INR') : null
  const gst = v.gst?.trim() ? parseRupees(v.gst) : null
  if (!periodFor) fields.periodFor = FIELD_WORDS.periodFor
  if (!paidOn) fields.paidOn = FIELD_WORDS.paidOn
  if (amount === null) fields.amount = FIELD_WORDS.amount
  if (v.currency === 'USD' && inr === null) fields.inr = FIELD_WORDS.inr
  if (v.gst?.trim() && gst === null) fields.gst = FIELD_WORDS.gst
  if (Object.keys(fields).length || !periodFor || !paidOn || amount === null) return bad(fields)
  return { ok: true, data: { itemId: v.itemId, currency: v.currency, input: { periodFor, paidOn, amount, inrPaise: inr ?? undefined, gstPaise: gst, note: v.note } } }
}

export function parseIds(raw: Record<string, string>): Parsed<{ itemId: string; paymentId: string }> {
  const p = z.object({ itemId: uuid, paymentId: uuid }).safeParse(raw)
  return p.success ? { ok: true, data: p.data } : bad({ other: FIELD_WORDS.other })
}

export function parseEnd(raw: Record<string, string>, today: string): Parsed<{ itemId: string; endsOn: string }> {
  const p = z.object({ itemId: uuid, endsOn: z.string() }).safeParse(raw)
  const endsOn = p.success ? parseDay(p.data.endsOn, plusYears(today, 2)) : null
  return p.success && endsOn ? { ok: true, data: { itemId: p.data.itemId, endsOn } } : bad({ endsOn: FIELD_WORDS.endsOn })
}

const EditShape = z.object({
  itemId: uuid, name: clean(80).optional(), vendor: opt(80).optional(), category: z.enum(COST_CATEGORIES).optional(), note: opt(300).optional(),
  varies: z.enum(['on', 'off']).optional(), source: z.enum(['none', ...COST_SOURCES]).optional(), currency: z.enum(COST_CURRENCIES).optional(), amount: money.optional(), cadence: z.enum(COST_CADENCES).optional(), anchorOn: z.string().optional(),
})

export function parseEdit(raw: Record<string, string>, today: string): Parsed<{ itemId: string; patch: CostPatch }> {
  const p = EditShape.safeParse(raw)
  if (!p.success) return bad(wordsOf(p.error.issues))
  const d = p.data
  const patch: CostPatch = {}
  const fields: Record<string, string> = {}
  if (d.name !== undefined) { if (d.name === '') fields.name = FIELD_WORDS.name; else patch.name = d.name }
  if (d.vendor !== undefined) patch.vendor = d.vendor
  if (d.category) patch.category = d.category
  if (d.note !== undefined) patch.note = d.note
  if (d.varies) patch.varies = d.varies === 'on'
  if (d.source) patch.source = d.source === 'none' ? null : d.source
  if (d.currency) patch.currency = d.currency
  if (d.amount !== undefined) {
    const v = d.currency ? parseAmount(d.amount, d.currency) : null
    if (v === null) fields.amount = d.currency ? FIELD_WORDS.amount : FIELD_WORDS.currency; else patch.amount = v
  }
  if (d.cadence) patch.cadence = d.cadence
  if (d.anchorOn !== undefined) { const v = parseDay(d.anchorOn, plusYears(today, 2)); if (v) patch.anchorOn = v; else fields.anchorOn = FIELD_WORDS.anchorOn }
  return Object.keys(fields).length ? bad(fields) : { ok: true, data: { itemId: d.itemId, patch } }
}
