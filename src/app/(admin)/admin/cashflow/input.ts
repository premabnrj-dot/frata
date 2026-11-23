import { z } from 'zod'
import { CASH_KINDS, cleanTextLocal, parseBalance, parseCashAmount, type CashKind } from '@/domains/admin/cash'
import type { BalanceInput, EntryInput, EntryPatch } from '@/lib/admin/cash'

// =============================================================================
// FILE: src/app/(admin)/admin/cashflow/input.ts — what a person types in Admin › Cashflow's forms, parsed (plan
// docs/plans/2026-11-23-admin-cashflow.md task 5). Pure: `today` is an argument. A parse gives the typed value or the words for each wrong field.
// Money is exact (signed for a balance); days are real and not after today (a planned entry: up to two years ahead); text is cleaned.
// =============================================================================

export type Parsed<T> = { ok: true; data: T } | { ok: false; fields: Record<string, string> }
export const FIELD_WORDS = {
  accountId: 'Pick an account.', balance: 'Enter the balance. A minus sign means overdrawn.', asOf: 'Pick today or an earlier day.', amount: 'Enter an amount above ₹0.',
  kind: 'Pick what it was.', date: 'Pick a day.', happenedOn: 'Pick today or an earlier day.', expectedOn: 'Pick a day up to two years ahead.', floor: 'Enter the floor in rupees.',
  name: 'Add a name.', other: 'Check this field.',
} as const

const clean = (max: number) => z.string().max(max * 4).transform(cleanTextLocal).pipe(z.string().max(max))
const orNull = (max: number) => clean(max).transform((s) => (s === '' ? null : s)).optional().transform((v) => v ?? null)
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
const plusYears = (day: string, n: number) => `${Number(day.slice(0, 4)) + n}${day.slice(4)}`
const bad = (fields: Record<string, string>): { ok: false; fields: Record<string, string> } => ({ ok: false, fields })
const wordsOf = (issues: readonly { path: PropertyKey[] }[]) => {
  const fields: Record<string, string> = {}
  for (const i of issues) { const k = String(i.path[0] ?? 'other'); fields[k] ??= (FIELD_WORDS as Record<string, string>)[k] ?? FIELD_WORDS.other }
  return fields
}
/** A real "YYYY-MM-DD" between 2020-01-01 and `max`. */
function day(text: string | undefined, max: string): string | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const d = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) return null
  return text >= '2020-01-01' && text <= max ? text : null
}

const BalanceShape = z.object({ accountId: uuid, asOf: z.string(), balance: z.string().max(30), note: orNull(300), floor: z.string().max(30).optional() })

export function parseBalanceForm(raw: Record<string, string>, today: string): Parsed<BalanceInput> {
  const p = BalanceShape.safeParse(raw)
  if (!p.success) return bad(wordsOf(p.error.issues))
  const fields: Record<string, string> = {}
  const asOf = day(p.data.asOf, today)
  const paise = parseBalance(p.data.balance)
  if (!asOf) fields.asOf = FIELD_WORDS.asOf
  if (paise === null) fields.balance = FIELD_WORDS.balance
  // The floor is optional: absent leaves it alone, empty clears it, a figure sets it.
  let floorPaise: number | null | undefined
  if (p.data.floor !== undefined) {
    if (p.data.floor.trim() === '') floorPaise = null
    else { const f = parseCashAmount(p.data.floor, true); if (f === null) fields.floor = FIELD_WORDS.floor; else floorPaise = f }
  }
  if (Object.keys(fields).length || !asOf || paise === null) return bad(fields)
  return { ok: true, data: { accountId: p.data.accountId, asOf, paise, note: p.data.note, ...(floorPaise !== undefined ? { floorPaise } : {}) } }
}

export function parseIds(raw: Record<string, string>): Parsed<{ accountId: string; balanceId: string }> {
  const p = z.object({ accountId: uuid, balanceId: uuid }).safeParse(raw)
  return p.success ? { ok: true, data: p.data } : bad({ other: FIELD_WORDS.other })
}

export function parseId(raw: Record<string, string>): Parsed<{ id: string }> {
  const p = z.object({ id: uuid }).safeParse(raw)
  return p.success ? { ok: true, data: p.data } : bad({ other: FIELD_WORDS.other })
}

const EntryShape = z.object({
  kind: z.enum(CASH_KINDS), amount: z.string().max(30), planned: z.string().optional(), date: z.string(), accountId: z.string().optional(), note: orNull(300),
})

export function parseEntryForm(raw: Record<string, string>, today: string): Parsed<EntryInput> {
  const p = EntryShape.safeParse(raw)
  if (!p.success) return bad(wordsOf(p.error.issues))
  const fields: Record<string, string> = {}
  const amount = parseCashAmount(p.data.amount)
  if (amount === null) fields.amount = FIELD_WORDS.amount
  const planned = p.data.planned === 'on'
  const when = day(p.data.date, planned ? plusYears(today, 2) : today)
  if (!when) fields[planned ? 'expectedOn' : 'happenedOn'] = planned ? FIELD_WORDS.expectedOn : FIELD_WORDS.happenedOn
  const acct = p.data.accountId?.trim() ? uuid.safeParse(p.data.accountId) : null
  if (acct && !acct.success) fields.accountId = FIELD_WORDS.accountId
  if (Object.keys(fields).length || amount === null || !when) return bad(fields)
  return { ok: true, data: { kind: p.data.kind as CashKind, amount, ...(planned ? { expectedOn: when } : { happenedOn: when }), accountId: acct?.success ? acct.data : null, note: p.data.note } }
}

const EditShape = z.object({
  id: uuid, kind: z.enum(CASH_KINDS).optional(), amount: z.string().max(30).optional(), happenedOn: z.string().optional(), expectedOn: z.string().optional(), accountId: z.string().optional(), note: clean(300).optional(),
})

export function parseEntryEdit(raw: Record<string, string>, today: string): Parsed<{ id: string; patch: EntryPatch }> {
  const p = EditShape.safeParse(raw)
  if (!p.success) return bad(wordsOf(p.error.issues))
  const d = p.data
  const fields: Record<string, string> = {}
  const patch: EntryPatch = {}
  if (d.kind) patch.kind = d.kind
  if (d.amount !== undefined) { const v = parseCashAmount(d.amount); if (v === null) fields.amount = FIELD_WORDS.amount; else patch.amount = v }
  if (d.happenedOn !== undefined) { if (d.happenedOn === '') patch.happenedOn = null; else { const v = day(d.happenedOn, today); if (v) patch.happenedOn = v; else fields.happenedOn = FIELD_WORDS.happenedOn } }
  if (d.expectedOn !== undefined) { if (d.expectedOn === '') patch.expectedOn = null; else { const v = day(d.expectedOn, plusYears(today, 2)); if (v) patch.expectedOn = v; else fields.expectedOn = FIELD_WORDS.expectedOn } }
  if (d.accountId !== undefined) { if (d.accountId === '') patch.accountId = null; else if (uuid.safeParse(d.accountId).success) patch.accountId = d.accountId; else fields.accountId = FIELD_WORDS.accountId }
  if (d.note !== undefined) patch.note = d.note === '' ? null : d.note
  return Object.keys(fields).length ? bad(fields) : { ok: true, data: { id: d.id, patch } }
}

export function parseAccountName(raw: Record<string, string>): Parsed<{ name: string }> {
  const p = z.object({ name: clean(60).pipe(z.string().min(1)) }).safeParse(raw)
  return p.success ? { ok: true, data: p.data } : bad({ name: FIELD_WORDS.name })
}

/** The books' read: a typed balance and day, from the open dialog. */
export function parseBooksAsk(raw: Record<string, string>, today: string): Parsed<{ typed: number; asOf: string }> {
  const p = z.object({ balance: z.string().max(30), asOf: z.string() }).safeParse(raw)
  const typed = p.success ? parseBalance(p.data.balance) : null
  const asOf = p.success ? day(p.data.asOf, today) : null
  return typed !== null && asOf ? { ok: true, data: { typed, asOf } } : bad({ other: FIELD_WORDS.other })
}
