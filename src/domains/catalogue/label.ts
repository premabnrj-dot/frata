// =============================================================================
// FILE: src/domains/catalogue/label.ts — WHAT A PACK MUST SAY, ONLINE (Beauty and wellness W1, plan
// docs/plans/2026-11-09-gst-core-and-categories.md § 4). Legal Metrology (Packaged Commodities) Rules 2011 r.6(10):
// a seller online shows what the pack says — net quantity, who made or packed it, best before, country of origin
// (products.origin_country), consumer care (the shop's contact) — and cosmetics list ingredients (Cosmetics Rules
// 2020 r.34). Stored as products.label (jsonb). Pure; the declarations stay English (legal wording, like the policies).
// =============================================================================

export const NET_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'] as const
export type NetUnit = (typeof NET_UNITS)[number]
export const NET_UNIT_WORDS: Record<NetUnit, string> = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', pcs: 'pieces' }
/** Best before, in months from manufacture (a pack's printed date is per batch: the page says the shelf life). */
export const SHELF_MONTHS = [6, 12, 18, 24, 36] as const

export type Label = { net: string; unit: NetUnit; maker: string; shelfMonths: number | null; ingredients: string; use: string }
export type LabelInput = { net: string; unit: string; maker: string; shelf: string; ingredients: string; use: string }
export const EMPTY_LABEL: Label = { net: '', unit: 'ml', maker: '', shelfMonths: null, ingredients: '', use: '' }

/** The shops asked for it: beauty and personal care, wellness (what sign-up said; Settings › Store details changes it). */
export const labelAsked = (sells: readonly string[]) => sells.some((k) => k === 'beauty' || k === 'wellness')

/** products.label as stored, read leniently: an unknown or missing field is its empty value. */
export function readLabel(raw: unknown): Label {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const s = (k: string, max: number) => (typeof o[k] === 'string' ? (o[k] as string).slice(0, max) : '')
  const unit = (NET_UNITS as readonly string[]).includes(o.unit as string) ? (o.unit as NetUnit) : EMPTY_LABEL.unit
  const shelf = typeof o.shelfMonths === 'number' && Number.isInteger(o.shelfMonths) && o.shelfMonths > 0 && o.shelfMonths <= 120 ? o.shelfMonths : null
  return { net: s('net', 12), unit, maker: s('maker', 300), shelfMonths: shelf, ingredients: s('ingredients', 3000), use: s('use', 1000) }
}

export function labelInput(l: Label): LabelInput {
  return { net: l.net, unit: l.unit, maker: l.maker, shelf: l.shelfMonths === null ? '' : String(l.shelfMonths), ingredients: l.ingredients, use: l.use }
}

/** What the editor sends, checked. Errors keyed net, unit, maker, shelf, ingredients, use. */
export function cleanLabel(t: LabelInput): { ok: true; label: Label } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const one = (s: string) => s.trim().replace(/[ \t]+/g, ' ')
  const net = t.net.trim().replace(',', '.')
  if (net && !/^\d{1,6}(\.\d{1,3})?$/.test(net)) errors.net = 'A number, like 50 or 1.5.'
  else if (net && Number(net) <= 0) errors.net = 'More than zero.'
  if (!(NET_UNITS as readonly string[]).includes(t.unit)) errors.unit = 'Choose a unit.'
  const maker = one(t.maker)
  if (maker.length > 300) errors.maker = 'Up to 300 characters.'
  const shelf = t.shelf.trim() ? Number(t.shelf) : null
  if (shelf !== null && (!Number.isInteger(shelf) || shelf < 1 || shelf > 120)) errors.shelf = 'Months, 1 to 120.'
  const ingredients = t.ingredients.trim()
  if (ingredients.length > 3000) errors.ingredients = 'Up to 3,000 characters.'
  const use = t.use.trim()
  if (use.length > 1000) errors.use = 'Up to 1,000 characters.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, label: { net, unit: t.unit as NetUnit, maker, shelfMonths: shelf, ingredients, use } }
}

/** What a shop that is asked must fill before the product goes live (r.6(10) items not already elsewhere). */
export function labelMissing(l: Label): string[] {
  return [...(l.net ? [] : ['net quantity']), ...(l.maker ? [] : ['who made or packed it']), ...(l.shelfMonths ? [] : ['best before'])]
}

/** The product page's declarations, in a pack's order. `origin`: products.origin_country. Empty fields are left out. */
export function labelRows(l: Label, origin: string | null): { name: string; value: string }[] {
  return [
    ...(l.net ? [{ name: 'Net quantity', value: `${l.net} ${NET_UNIT_WORDS[l.unit]}` }] : []),
    ...(l.shelfMonths ? [{ name: 'Best before', value: `${l.shelfMonths} months from manufacture` }] : []),
    ...(l.maker ? [{ name: 'Made or packed by', value: l.maker }] : []),
    ...(origin ? [{ name: 'Country of origin', value: origin }] : []),
    ...(l.ingredients ? [{ name: 'Ingredients', value: l.ingredients }] : []),
    ...(l.use ? [{ name: 'How to use', value: l.use }] : []),
  ]
}
