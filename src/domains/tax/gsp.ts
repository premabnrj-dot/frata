// =============================================================================
// FILE: src/domains/tax/gsp.ts — FILING GSTR-1 FROM FRRATA, THE PURE PART (GST app G2, plan
// docs/plans/2026-11-09-gst-core-and-categories.md § 3 phase 5; spec docs/specs/2026-11-09-gst-module.md § Filing).
// The steps a period walks (connect → push → check → file → filed), the liability a return declares (tables 4, 5, 7
// less 9B), the same read back from the JSON we push (a fake GSP's "portal summary", and our own self-check), and
// the comparison the merchant sees before filing. Paise. A filed return can't be changed: only amended next period.
// =============================================================================

import type { Gstr1, Heads, RateRow } from './gstr1'

export type Liability = Heads & { documents: number }
const HEADS = ['taxable', 'igst', 'cgst', 'sgst'] as const
const sum = (rows: Heads[]) => rows.reduce<Heads>((a, r) => ({ taxable: a.taxable + r.taxable, igst: a.igst + r.igst, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 })
const rates = (rows: { rates: RateRow[] }[]) => rows.flatMap((r) => r.rates)

/** What the return declares: B2B + B2CL + B2CS (already net of B2C notes) − CDNR − CDNUR; documents as Table 13 counts them. */
export function liabilityOf(g: Gstr1): Liability {
  const plus = sum([...rates(g.b2b), ...rates(g.b2cl), ...g.b2cs]), minus = sum([...rates(g.cdnr), ...rates(g.cdnur)])
  return { taxable: plus.taxable - minus.taxable, igst: plus.igst - minus.igst, cgst: plus.cgst - minus.cgst, sgst: plus.sgst - minus.sgst, documents: g.docs.reduce((a, d) => a + d.total - d.cancelled, 0) }
}

type Itm = { itm_det?: { txval?: number; iamt?: number; camt?: number; samt?: number } }
type Json = {
  b2b?: { inv: { itms: Itm[] }[] }[]; b2cl?: { inv: { itms: Itm[] }[] }[]; b2cs?: { txval?: number; iamt?: number; camt?: number; samt?: number }[]
  cdnr?: { nt: { itms: Itm[] }[] }[]; cdnur?: { itms: Itm[] }[]; doc_issue?: { doc_det?: { docs?: { net_issue?: number }[] }[] }
}
const p = (r: number | undefined) => Math.round((r ?? 0) * 100)
const ofItms = (itms: Itm[]): Heads => sum(itms.map((i) => ({ taxable: p(i.itm_det?.txval), igst: p(i.itm_det?.iamt), cgst: p(i.itm_det?.camt), sgst: p(i.itm_det?.samt) })))

/** The liability read back from a GSTR-1 JSON (gstr1-files.ts gstr1Json): what the portal will hold once it's saved. */
export function liabilityOfJson(raw: unknown): Liability {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Json
  const plus = sum([
    ...(j.b2b ?? []).flatMap((c) => c.inv.map((i) => ofItms(i.itms))),
    ...(j.b2cl ?? []).flatMap((c) => c.inv.map((i) => ofItms(i.itms))),
    ...(j.b2cs ?? []).map((r) => ({ taxable: p(r.txval), igst: p(r.iamt), cgst: p(r.camt), sgst: p(r.samt) })),
  ])
  const minus = sum([...(j.cdnr ?? []).flatMap((c) => c.nt.map((n) => ofItms(n.itms))), ...(j.cdnur ?? []).map((n) => ofItms(n.itms))])
  const documents = (j.doc_issue?.doc_det ?? []).flatMap((d) => d.docs ?? []).reduce((a, d) => a + (d.net_issue ?? 0), 0)
  return { taxable: plus.taxable - minus.taxable, igst: plus.igst - minus.igst, cgst: plus.cgst - minus.cgst, sgst: plus.sgst - minus.sgst, documents }
}

export type Difference = { head: keyof Liability; ours: number; portal: number }
/** Where the portal's summary differs from ours. A rupee either way per head is the portal's rounding; documents exact. */
export function compareLiability(ours: Liability, portal: Liability): Difference[] {
  return [...HEADS, 'documents' as const].filter((h) => (h === 'documents' ? ours[h] !== portal[h] : Math.abs(ours[h] - portal[h]) > 100)).map((h) => ({ head: h, ours: ours[h], portal: portal[h] }))
}

export type FilingStep = 'connect' | 'push' | 'check' | 'file' | 'filed'
/**
 * Where a period stands. `connected`: a live session. `pushed`: what we pushed, or null. `changed`: the period's
 * documents differ from the push (a note issued since): push again. `differences`: the portal's summary against ours.
 */
export function stepOf(s: { connected: boolean; filed: boolean; pushed: Liability | null; now: Liability; portal: Liability | null }): FilingStep {
  if (s.filed) return 'filed'
  if (!s.connected) return 'connect'
  if (!s.pushed || (['taxable', 'igst', 'cgst', 'sgst', 'documents'] as const).some((h) => s.now[h] !== s.pushed![h])) return 'push'
  if (!s.portal || compareLiability(s.pushed, s.portal).length) return 'check'
  return 'file'
}

/** A GST portal username: 1–60 letters, digits, . _ - (the portal's rule is stricter; this keeps junk out). */
export const USERNAME_SHAPE = /^[A-Za-z0-9._-]{1,60}$/
/** The portal's OTPs are six digits. */
export const OTP_SHAPE = /^\d{6}$/
