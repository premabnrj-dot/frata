// =============================================================================
// FILE: src/domains/delivery/lists.ts — what the brand types or uploads into Delivery Zones, read strictly (plan
// docs/plans/2026-11-12-delivery-zones.md; security review M3): a zone's PIN codes and prefixes, and the PIN code rules
// CSV (fixed columns pincode, rule, cod_max, note; ≤ 5,000 rows; a byte cap before reading). Errors name the line. The
// export writes through the one CSV helper (src/domains/tax/gstr1-files.ts csv: formula-safe cells). Pure.
// =============================================================================

import { csv } from '@/domains/tax/gstr1-files'

export const MAX_PINS = 5000
export const MAX_RULES = 5000
export const MAX_ZONES = 50
export const MAX_HOLIDAYS = 60
export const MAX_CSV_BYTES = 256 * 1024
/** Settings fields Delivery Zones sets while it is usable (one editor: the plan's Sec M2). The shop-wide pay-on-delivery
 *  switch and its no-COD list stay in Settings: they still apply inside every zone. */
export const HELD_BY_ZONES = ['shippingFlat', 'freeShippingAbove', 'dispatchDays', 'metroDays', 'restDays', 'codMin', 'codMax', 'codCharge'] as const
export const RULES = ['no_delivery', 'prepaid_only', 'cod_max'] as const
export type RuleKind = (typeof RULES)[number]
export const RULE_WORDS: Record<RuleKind, string> = { no_delivery: "Don't deliver", prepaid_only: 'Pay online only', cod_max: 'Pay on delivery up to' }

const PIN6 = /^[1-9][0-9]{5}$/
const PREFIX3 = /^[1-9][0-9]{2}$/

/** A zone's own PIN codes: 6-digit codes or 3-digit prefixes, separated by commas, spaces or new lines. */
export function readPins(text: string): { pins: string[]; bad: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean)
  const pins = [...new Set(parts.filter((p) => PIN6.test(p) || PREFIX3.test(p)))]
  const bad = parts.filter((p) => !PIN6.test(p) && !PREFIX3.test(p)).slice(0, 5)
  return { pins, bad }
}

export type RuleRow = { pincode: string; rule: RuleKind; codMax: number | null; note: string | null }

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()

/** One CSV line into cells (quotes, doubled quotes, commas inside quotes). */
function cells(line: string): string[] {
  const out: string[] = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.replace(/^'(?=[=+\-@])/, '').trim())
}

/** The rules CSV: header pincode,rule,cod_max,note; rule is no_delivery, prepaid_only or cod_max (rupees in cod_max). */
export function readRulesCsv(text: string): { rows: RuleRow[]; errors: string[] } {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) return { rows: [], errors: ['The file is over 256 KB. Split it into smaller files.'] }
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { rows: [], errors: ['The file is empty.'] }
  const head = cells(lines[0]!).map((h) => h.toLowerCase())
  if (head[0] !== 'pincode' || head[1] !== 'rule') return { rows: [], errors: ['The first line must be: pincode,rule,cod_max,note'] }
  const errors: string[] = [], seen = new Map<string, RuleRow>()
  for (const [i, line] of lines.slice(1).entries()) {
    if (seen.size >= MAX_RULES) { errors.push(`More than ${MAX_RULES.toLocaleString('en-IN')} rules: the rest were left out.`); break }
    const [pin = '', rule = '', max = '', note = ''] = cells(line)
    const n = i + 2
    if (!PIN6.test(pin)) { errors.push(`Line ${n}: "${clean(pin).slice(0, 12)}" is not a 6-digit PIN code.`); continue }
    if (!(RULES as readonly string[]).includes(rule)) { errors.push(`Line ${n}: the rule must be no_delivery, prepaid_only or cod_max.`); continue }
    const rupees = Number(max.replace(/[₹,\s]/g, ''))
    if (rule === 'cod_max' && !(rupees > 0 && rupees <= 1_00_000)) { errors.push(`Line ${n}: cod_max needs an amount in rupees.`); continue }
    seen.set(pin, { pincode: pin, rule: rule as RuleKind, codMax: rule === 'cod_max' ? Math.round(rupees * 100) : null, note: clean(note).slice(0, 120) || null })
  }
  return { rows: [...seen.values()], errors: errors.slice(0, 20) }
}

/** The rules as a CSV the import reads back (formula-safe cells). */
export function rulesCsv(rows: readonly RuleRow[]): string {
  return csv(['pincode', 'rule', 'cod_max', 'note'], rows.map((r) => [r.pincode, r.rule, r.codMax === null ? '' : r.codMax / 100, r.note ?? '']))
}
