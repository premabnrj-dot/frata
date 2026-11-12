// =============================================================================
// FILE: src/domains/tax/rates.ts — GST RATES BY HSN AND DATE (plan docs/plans/2026-11-09-gst-core-and-categories.md § 2).
// Pure. The ONE table checkout, invoices, credit notes and the GST app read.
//
// A rule is found by the longest HSN prefix in the table in force on the invoice's date (rates change once a year,
// from 1 April; GST 2.0 took effect 22 Sep 2025). A code the table doesn't know is never guessed: the merchant gives
// its rate (products.gst_bps, "as your CA advises") or the product can't be sold by a registered shop.
//
// Rates here are GST 2.0 (Notification 9/2025-Central Tax (Rate), w.e.f. 22 Sep 2025; text read 2026-11-07) and the
// rate notes in docs/research/2026-11-09-back-office.md. **A CA signs this table before it is relied on**; until
// then every row is marked `ca: false` and the console says so on the product's Tax panel.
//
// The ₹2,500 slab (apparel 61, 62, made-ups 63, footwear 64): 5% when the sale value of a piece, after invoice
// discounts, is up to ₹2,500; 18% above. On a price that includes GST, ₹2,625.01–₹2,950 has no self-consistent rate
// (at 5% the value is over ₹2,500; at 18% under): tested at 5%, which puts it at 18% (`inGap` lets the console warn).
// =============================================================================

export type RateRule = { kind: 'flat'; bps: number } | { kind: 'slab'; low: number; high: number; limit: number }
export type HsnEntry = {
  /** 2 (a chapter rule, not listed in search), 4, 6 or 8 digits. */
  code: string
  name: string
  /** Words a merchant searches by, beyond the name. */
  words: string
  rule: RateRule
  /** The category wave it belongs to (all-categories brief § 1). */
  wave: 'W0' | 'W1'
}

const SLAB: RateRule = { kind: 'slab', low: 500, high: 1800, limit: 250_000 }
const r = (bps: number): RateRule => ({ kind: 'flat', bps })

/** GST 2.0, from 22 Sep 2025. Chapter rules (2 digits) cover every code under them; a longer code wins. */
const GST_2_0: HsnEntry[] = [
  // ── W0: fashion, footwear, accessories, jewellery ──
  { code: '61', name: 'Apparel, knitted or crocheted', words: '', rule: SLAB, wave: 'W0' },
  { code: '62', name: 'Apparel, not knitted', words: '', rule: SLAB, wave: 'W0' },
  { code: '63', name: 'Made-up textile articles', words: '', rule: SLAB, wave: 'W0' },
  { code: '64', name: 'Footwear', words: '', rule: SLAB, wave: 'W0' },
  { code: '6104', name: "Women's suits, dresses, skirts, trousers (knitted)", words: 'knitted kurti dress top leggings jersey', rule: SLAB, wave: 'W0' },
  { code: '6105', name: "Men's shirts (knitted)", words: 'polo shirt men', rule: SLAB, wave: 'W0' },
  { code: '6106', name: "Women's blouses and shirts (knitted)", words: 'blouse top women', rule: SLAB, wave: 'W0' },
  { code: '6109', name: 'T-shirts, vests (knitted)', words: 'tshirt tee vest', rule: SLAB, wave: 'W0' },
  { code: '6110', name: 'Sweaters, sweatshirts, cardigans (knitted)', words: 'hoodie sweatshirt sweater jumper cardigan', rule: SLAB, wave: 'W0' },
  { code: '6111', name: "Babies' garments (knitted)", words: 'baby infant romper onesie kids', rule: SLAB, wave: 'W0' },
  { code: '6203', name: "Men's suits, jackets, trousers (not knitted)", words: 'kurta pyjama sherwani trousers jeans men suit', rule: SLAB, wave: 'W0' },
  { code: '6204', name: "Women's suits, dresses, skirts, trousers (not knitted)", words: 'kurta kurti suit salwar anarkali lehenga dress skirt palazzo co-ord set', rule: SLAB, wave: 'W0' },
  { code: '6205', name: "Men's shirts (not knitted)", words: 'shirt men formal', rule: SLAB, wave: 'W0' },
  { code: '6206', name: "Women's blouses and shirts (not knitted)", words: 'blouse saree blouse shirt women top', rule: SLAB, wave: 'W0' },
  { code: '6209', name: "Babies' garments (not knitted)", words: 'baby infant kids', rule: SLAB, wave: 'W0' },
  { code: '6211', name: 'Track suits and other garments', words: 'garment ethnic lehenga choli other women', rule: SLAB, wave: 'W0' },
  { code: '6214', name: 'Shawls, scarves, dupattas, stoles', words: 'dupatta stole shawl scarf odhni', rule: SLAB, wave: 'W0' },
  { code: '6302', name: 'Bed linen, table linen, towels', words: 'bedsheet towel table cover', rule: SLAB, wave: 'W0' },
  { code: '6403', name: 'Footwear with leather uppers', words: 'shoes juttis kolhapuri leather sandals', rule: SLAB, wave: 'W0' },
  { code: '6404', name: 'Footwear with textile uppers', words: 'sneakers canvas shoes', rule: SLAB, wave: 'W0' },
  { code: '6402', name: 'Footwear of rubber or plastics', words: 'slippers flip flops sandals', rule: SLAB, wave: 'W0' },
  { code: '5007', name: 'Woven silk fabrics (sarees in silk)', words: 'saree sari silk banarasi kanjeevaram fabric', rule: r(500), wave: 'W0' },
  { code: '5208', name: 'Woven cotton fabrics (cotton sarees, fabric)', words: 'saree sari cotton fabric handloom', rule: r(500), wave: 'W0' },
  { code: '5407', name: 'Woven synthetic fabrics (georgette, chiffon)', words: 'saree sari georgette chiffon fabric', rule: r(500), wave: 'W0' },
  { code: '4202', name: 'Handbags, totes, wallets, travel bags', words: 'bag tote clutch purse wallet backpack potli', rule: r(1800), wave: 'W0' },
  { code: '7113', name: 'Jewellery of precious metal', words: 'gold silver jewellery ring necklace earrings', rule: r(300), wave: 'W0' },
  { code: '7117', name: 'Imitation jewellery', words: 'earrings jhumka necklace bangles artificial fashion jewellery oxidised kundan', rule: r(300), wave: 'W0' },
  { code: '9102', name: 'Wrist watches', words: 'watch', rule: r(1800), wave: 'W0' },
  { code: '9004', name: 'Sunglasses and spectacles', words: 'sunglasses goggles', rule: r(1800), wave: 'W0' },
  // ── W1: beauty, personal care, wellness (phase 4) ──
  { code: '3304', name: 'Make-up and skin care', words: 'lipstick kajal foundation serum moisturiser cream face sunscreen nail', rule: r(1800), wave: 'W1' },
  { code: '3303', name: 'Perfumes and toilet waters', words: 'perfume attar fragrance eau de parfum', rule: r(1800), wave: 'W1' },
  { code: '3305', name: 'Hair care (shampoo, hair oil)', words: 'shampoo conditioner hair oil hair mask', rule: r(500), wave: 'W1' },
  { code: '3306', name: 'Oral care (toothpaste)', words: 'toothpaste tooth powder mouthwash', rule: r(500), wave: 'W1' },
  { code: '3307', name: 'Deodorants, bath and shaving preparations', words: 'deodorant bath salt shaving', rule: r(1800), wave: 'W1' },
  { code: '3401', name: 'Soap', words: 'soap bar body wash handmade', rule: r(500), wave: 'W1' },
  { code: '3004', name: 'Ayurvedic and herbal medicaments', words: 'ayurvedic herbal churna medicine', rule: r(500), wave: 'W1' },
]

/** The tables, newest first. A new year's rates are a new entry with its `from` date; old ones stay for old invoices. */
export const RATE_TABLES: { from: string; entries: HsnEntry[]; caSigned: boolean }[] = [
  { from: '2025-09-22', entries: GST_2_0, caSigned: false },
]

const ymd = (d: Date) => d.toISOString().slice(0, 10)
export function tableOn(date: Date) {
  const day = ymd(date)
  return RATE_TABLES.find((t) => t.from <= day) ?? RATE_TABLES[RATE_TABLES.length - 1]!
}
export const HSN_SHAPE = /^\d{4}(\d{2})?(\d{2})?$/
const clean = (hsn: string | null | undefined) => (hsn ?? '').replace(/\D/g, '')

/** The rule for an HSN on a date: the longest prefix the table holds. Null: the table doesn't know this code. */
export function ruleOn(hsn: string | null | undefined, date: Date): RateRule | null {
  const code = clean(hsn)
  if (code.length < 4) return null
  let best: HsnEntry | null = null
  for (const e of tableOn(date).entries) if (code.startsWith(e.code) && (!best || e.code.length > best.code.length)) best = e
  return best?.rule ?? null
}

/**
 * Whether a piece has a GST rate on `date`: the table knows its HSN, or the merchant set a rate of her own. THE ONE TEST
 * for "a registered shop can sell it" (quote()'s 'gone', the publish check, Settings › Taxes' warning): the rate's value
 * depends on the price (a slab), whether there is one does not. Same answer as `rateOn(…) !== null`.
 */
export const hasRate = (hsn: string | null | undefined, date: Date, own?: number | null): boolean => ruleOn(hsn, date) !== null || own != null

/** Live products a registered shop can't sell for want of a rate: how many, and the first few by name (Settings › Taxes). */
export type Unrated = { count: number; products: { title: string; handle: string }[] }

/** The pieces of `rows` a registered shop can't sell on `date` for want of a rate (hasRate). */
export const withoutRate = <T extends { hsn: string | null; gstBps: number | null }>(rows: readonly T[], date: Date): T[] => rows.filter((r) => !hasRate(r.hsn, date, r.gstBps))

/** Taxable value of one piece: the price as shown, without GST at `bps` when prices include GST. */
const taxableAt = (unitPrice: number, bps: number, inclusive: boolean) => (inclusive ? (unitPrice * 10_000) / (10_000 + bps) : unitPrice)

/**
 * The rate for one piece (bps), or null when neither the table nor the merchant gives one. `unitPrice` is the piece's
 * price after its discounts, as shown (with or without GST). `own`: the merchant's rate for a code the table lacks.
 */
export function rateOn(hsn: string | null | undefined, unitPrice: number, inclusive: boolean, date: Date, own?: number | null): number | null {
  const rule = ruleOn(hsn, date)
  if (!rule) return own ?? null
  if (rule.kind === 'flat') return rule.bps
  return taxableAt(unitPrice, rule.low, inclusive) <= rule.limit ? rule.low : rule.high
}

/** A price including GST that no slab rate fits (₹2,625.01–₹2,950 for the ₹2,500 slab): the console suggests a price outside it. */
export function inGap(hsn: string | null | undefined, unitPrice: number, inclusive: boolean, date: Date): { below: number; above: number } | null {
  const rule = ruleOn(hsn, date)
  if (!rule || rule.kind !== 'slab' || !inclusive) return null
  const below = Math.floor((rule.limit * (10_000 + rule.low)) / 10_000) // the most at the low rate
  const above = Math.floor((rule.limit * (10_000 + rule.high)) / 10_000) // from here the high rate is consistent
  return unitPrice > below && unitPrice <= above ? { below, above: above + 100 } : null
}

/** In words, for the Tax panel: "5% up to ₹2,500 a piece, 18% above" or "18%". */
export function ruleWords(rule: RateRule): string {
  return rule.kind === 'flat' ? `${rule.bps / 100}%` : `${rule.low / 100}% up to ₹${(rule.limit / 100).toLocaleString('en-IN')} a piece, ${rule.high / 100}% above`
}

/** Search the HSN list by code or words (4+ digit entries only), best first. */
export function searchHsn(q: string, date: Date, waves: readonly ('W0' | 'W1')[] = ['W0', 'W1'], limit = 8): HsnEntry[] {
  const s = q.trim().toLowerCase()
  const list = tableOn(date).entries.filter((e) => e.code.length >= 4 && waves.includes(e.wave))
  if (!s) return list.slice(0, limit)
  const digits = s.replace(/\D/g, '')
  const scored = list.map((e) => {
    const hay = `${e.name} ${e.words}`.toLowerCase()
    let score = 0
    if (digits && (e.code.startsWith(digits) || digits.startsWith(e.code))) score += 10
    for (const w of s.split(/\s+/)) if (w && hay.includes(w)) score += hay.split(/\s+/).includes(w) ? 3 : 1
    return { e, score }
  }).filter((x) => x.score > 0)
  return scored.sort((a, b) => b.score - a.score || a.e.code.localeCompare(b.e.code)).slice(0, limit).map((x) => x.e)
}
export const hsnEntry = (code: string | null | undefined, date: Date) => tableOn(date).entries.find((e) => e.code === clean(code)) ?? null

/** Turnover band → the fewest HSN digits an invoice must carry (Notification 78/2020: 4 under ₹5 cr on B2B, 6 above). */
export const TURNOVER_BANDS = ['under_5cr', '5_to_10cr', 'over_10cr'] as const
export type TurnoverBand = (typeof TURNOVER_BANDS)[number]
export const hsnDigitsFor = (band: TurnoverBand) => (band === 'under_5cr' ? 4 : 6)
/** E-invoicing (IRN) applies to B2B at ₹5 cr and above (Notification 10/2023): B2B invoices wait until it ships (plan § 5b, 12). */
export const b2bAllowed = (band: TurnoverBand) => band === 'under_5cr'

/** The merchant's own rates for a code the table lacks (GST 2.0 slabs). */
export const OWN_RATES = [0, 300, 500, 1800, 4000] as const
/** The same list in words: "0, 3, 5, 18 or 40%". A function, so a page that never says it doesn't carry it. */
export const ownRatesText = () => `${OWN_RATES.slice(0, -1).map((b) => b / 100).join(', ')} or ${OWN_RATES[OWN_RATES.length - 1]! / 100}%`
