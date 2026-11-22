// =============================================================================
// FILE: src/domains/brand/checkout.ts — WHAT A PARTNER MAY SET ON CHECKOUT, AND NOTHING MORE (one-address plan P2·2;
// spec docs/specs/2026-11-16-one-address-checkout.md § 3; owner decisions 12–14; mockup
// docs/mockups/2026-11-16-p2-checkout.html, owner-approved 2026-11-16). A code-site store's `checkout_design` row:
// the logo left or centred, the "Back to <store>" link on or off, the policy links in one row or two, up to four trust
// blocks from a closed set in the partner's order, and two plain lines (a heading ≤ 24, a thank-you line ≤ 120).
// Trust blocks are never typed: their words are derived here from the store's own settings at render, and a block whose
// fact is missing is not drawn. A saved design that fails a rule made later renders with Frrata's defaults for that
// part (`renderDesign`). Fields, labels, steps, prices, payment, the pay button and the legal block have no setting.
// Pure: no I/O.
// =============================================================================

import { rupeesWords } from '@/domains/money/rupees'
import { lineProblem } from './lines'

export const HEADERS = ['left', 'centre'] as const
export type HeaderAlign = (typeof HEADERS)[number]
export const POLICY_ROWS = [1, 2] as const
export type PolicyRows = (typeof POLICY_ROWS)[number]
/** The closed set, in the order the console lists blocks that are off (mockup screen 8). */
export const TRUST_KEYS = ['delivery', 'returns', 'cod', 'secure', 'gst'] as const
export type TrustKey = (typeof TRUST_KEYS)[number]
export const MAX_TRUST = 4
/** A block's name where the store's settings give it no words (its fact is off): the console lists it, a page never draws it. */
export const TRUST_NAMES: Record<TrustKey, string> = { delivery: 'Delivery days', returns: 'Returns window', cod: 'Pay on delivery limit', secure: 'Secure payment by Razorpay', gst: 'GST invoice on every order' }
export const HEADING_MAX = 24
export const THANKS_MAX = 120

export type CheckoutDesign = {
  header: HeaderAlign
  back: boolean
  rows: PolicyRows
  /** On, in the partner's order (≤ 4, no repeats). */
  trust: TrustKey[]
  /** '' draws "Checkout" (owner call 6). */
  heading: string
  /** '' draws nothing on the order page (owner call 6). */
  thanks: string
}

/** What a store reads before a design is ever saved: House of Ayuda's drawn defaults without its two lines. */
export const DEFAULT_DESIGN: CheckoutDesign = { header: 'left', back: true, rows: 1, trust: ['delivery', 'returns', 'cod', 'secure'], heading: '', thanks: '' }

export const isTrustKey = (v: unknown): v is TrustKey => typeof v === 'string' && (TRUST_KEYS as readonly string[]).includes(v)

export type DesignField = 'header' | 'back' | 'rows' | 'trust' | 'heading' | 'thanks'
export type DesignProblem = { field: DesignField; message: string }

/** Every rule a design must meet: the one function for save, preview and render (spec § 3, "The check"). */
export function designProblems(d: CheckoutDesign): DesignProblem[] {
  const out: DesignProblem[] = []
  if (!(HEADERS as readonly string[]).includes(d.header)) out.push({ field: 'header', message: 'Choose Left or Centred.' })
  if (typeof d.back !== 'boolean') out.push({ field: 'back', message: 'Turn the link on or off.' })
  if (!(POLICY_ROWS as readonly number[]).includes(d.rows)) out.push({ field: 'rows', message: 'Choose one row or two.' })
  if (!Array.isArray(d.trust) || d.trust.length > MAX_TRUST || !d.trust.every(isTrustKey) || new Set(d.trust).size !== d.trust.length) out.push({ field: 'trust', message: `Up to ${MAX_TRUST}.` })
  const h = lineProblem(d.heading, HEADING_MAX); if (h) out.push({ field: 'heading', message: h })
  const t = lineProblem(d.thanks, THANKS_MAX); if (t) out.push({ field: 'thanks', message: t })
  return out
}

/** A line as stored: trimmed and NFC, as `lineProblem` counts it. */
export const cleanLine = (s: string) => s.normalize('NFC').trim()

/**
 * The design a page draws: each part that fails today's rules falls back to Frrata's default for that part (a line
 * saved before a rule tightened draws nothing; a trust list that no longer fits draws the default list).
 */
export function renderDesign(d: CheckoutDesign | null): CheckoutDesign {
  if (!d) return DEFAULT_DESIGN
  const bad = new Set(designProblems(d).map((p) => p.field))
  return {
    header: bad.has('header') ? DEFAULT_DESIGN.header : d.header,
    back: bad.has('back') ? DEFAULT_DESIGN.back : d.back,
    rows: bad.has('rows') ? DEFAULT_DESIGN.rows : d.rows,
    trust: bad.has('trust') ? DEFAULT_DESIGN.trust : d.trust,
    heading: bad.has('heading') ? '' : cleanLine(d.heading),
    thanks: bad.has('thanks') ? '' : cleanLine(d.thanks),
  }
}

/** The checkout's heading: the brand's line, else "Checkout". */
export const headingOf = (d: CheckoutDesign) => d.heading || 'Checkout'

/** The store's own facts a trust block is worded from (its settings: delivery, returns, Pay on delivery, GST). */
export type TrustFacts = {
  dispatchDays: number; metroDays: number; restDays: number
  returnKind: 'exchange_or_refund' | 'exchange_only' | 'refund_only' | 'none'; returnDays: number
  codOn: boolean
  /** Paise; 0 means no limit. */
  codMax: number
  /** A regular GSTIN: every order gets a GST invoice. */
  gstInvoice: boolean
}
export type TrustBlock = { key: TrustKey; words: string }

/** A store's settings as the trust blocks read them (the storefront's StoreShop, or the Builder's granted columns). */
export const trustFactsOf = (s: Omit<TrustFacts, 'gstInvoice'> & { gst?: { invoice?: boolean } }): TrustFacts => ({
  dispatchDays: s.dispatchDays, metroDays: s.metroDays, restDays: s.restDays, returnKind: s.returnKind, returnDays: s.returnDays,
  codOn: s.codOn, codMax: s.codMax, gstInvoice: !!s.gst?.invoice,
})

/** A block's words from the store's facts, or null when the fact isn't there (the block is then not drawn). */
export function trustWords(k: TrustKey, f: TrustFacts): string | null {
  switch (k) {
    case 'delivery': {
      if (!f.restDays) return null
      const lo = f.dispatchDays + Math.min(f.metroDays || f.restDays, f.restDays), hi = f.dispatchDays + f.restDays
      return lo === hi ? `Delivered in ${hi} days` : `Delivered in ${lo}–${hi} days`
    }
    case 'returns':
      if (f.returnKind === 'none' || !f.returnDays) return null
      return f.returnKind === 'exchange_or_refund' ? `${f.returnDays}-day exchange or returns` : f.returnKind === 'exchange_only' ? `${f.returnDays}-day exchanges` : `${f.returnDays}-day returns`
    case 'cod':
      if (!f.codOn) return null
      return f.codMax > 0 ? `Pay on delivery up to ${rupeesWords(f.codMax)}` : 'Pay on delivery'
    case 'secure':
      return 'Secure payment by Razorpay'
    case 'gst':
      return f.gstInvoice ? 'GST invoice on every order' : null
  }
}

/** The blocks a page draws, in the partner's order, each worded from the store's facts; a missing fact drops its block. */
export function trustBlocks(keys: readonly TrustKey[], f: TrustFacts): TrustBlock[] {
  return keys.flatMap((key) => { const words = trustWords(key, f); return words ? [{ key, words }] : [] })
}

/** The console's list: the blocks that are on, in order, then the rest in the closed set's order (mockup screen 8). */
export const trustOrder = (on: readonly TrustKey[]): TrustKey[] => [...on, ...TRUST_KEYS.filter((k) => !on.includes(k))]

/** Which parts of a design changed, as the owner's Notices line names them ("The checkout heading."). */
const PART_NAMES: Record<DesignField, string> = { header: 'the logo’s place', back: 'the back link', rows: 'the policy links', trust: 'the trust blocks', heading: 'the checkout heading', thanks: 'the thank-you line' }
export function designChanges(a: CheckoutDesign, b: CheckoutDesign): DesignField[] {
  const out: DesignField[] = []
  if (a.header !== b.header) out.push('header')
  if (a.back !== b.back) out.push('back')
  if (a.rows !== b.rows) out.push('rows')
  if (a.trust.join() !== b.trust.join()) out.push('trust')
  if (a.heading !== b.heading) out.push('heading')
  if (a.thanks !== b.thanks) out.push('thanks')
  return out
}
/** "The checkout heading." · "The checkout heading and the thank-you line." · "The back link, the trust blocks and the checkout heading." */
export function designSummary(fields: readonly DesignField[]): string {
  const names = fields.map((f) => PART_NAMES[f])
  const joined = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return joined ? `${joined[0]!.toUpperCase()}${joined.slice(1)}.` : ''
}
export const DESIGN_FIELD_LABEL = PART_NAMES

/** A stored row or a proposal's record read back as a design, or null when it isn't one. */
export function readDesign(v: unknown): CheckoutDesign | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.header !== 'string' || typeof o.back !== 'boolean' || typeof o.rows !== 'number' || !Array.isArray(o.trust) || typeof o.heading !== 'string' || typeof o.thanks !== 'string') return null
  return { header: o.header as HeaderAlign, back: o.back, rows: o.rows as PolicyRows, trust: o.trust.filter(isTrustKey), heading: o.heading, thanks: o.thanks }
}
