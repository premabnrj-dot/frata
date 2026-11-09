// =============================================================================
// FILE: src/domains/catalogue/size-charts.ts
//
// STARTING SIZE CHARTS by what a shop sells (asked at sign-up). Body
// measurements in cm, typical of Indian D2C labels — a STARTING POINT the
// merchant edits, never presented as their own (Baymard: a chart per product
// type, in cm and inches, with how to measure). Inches are derived, not stored.
// =============================================================================

import type { SELL_KEYS } from './sell-keys'

export type Chart = { columns: string[]; rows: { size: string; values: (number | null)[] }[]; howToMeasure: string }
export type Preset = { name: string; chart: Chart }

const rows = (sizes: string[], cols: number[][]) => sizes.map((size, i) => ({ size, values: cols.map((c) => c[i] ?? null) }))

const HOW_TOP = 'Bust or chest: around the fullest part, tape level. Waist: around the narrowest part. Hip: around the fullest part. Measure over light clothing.'

export const PRESETS: Record<string, Preset> = {
  womens_kurta: { name: 'Kurta set · Women', chart: { columns: ['Bust', 'Waist', 'Hip'], howToMeasure: HOW_TOP,
    rows: rows(['XS', 'S', 'M', 'L', 'XL', 'XXL'], [[81, 86, 91, 97, 102, 107], [66, 71, 76, 81, 86, 91], [89, 94, 99, 104, 109, 114]]) } },
  mens_shirt: { name: 'Shirt · Men', chart: { columns: ['Chest', 'Waist', 'Shoulder'], howToMeasure: `${HOW_TOP} Shoulder: across the back, from one shoulder seam to the other.`,
    rows: rows(['S', 'M', 'L', 'XL', 'XXL'], [[97, 102, 107, 112, 117], [81, 86, 91, 97, 102], [43, 44.5, 46, 47.5, 49]]) } },
  kids: { name: 'Kids', chart: { columns: ['Height', 'Chest'], howToMeasure: 'Height: standing straight, without shoes. Chest: around the fullest part, under the arms.',
    rows: rows(['2–3 Y', '3–4 Y', '4–5 Y', '5–6 Y', '6–7 Y', '7–8 Y'], [[95, 101, 107, 113, 119, 125], [53, 55, 57, 59, 61, 63]]) } },
  footwear: { name: 'Footwear', chart: { columns: ['Foot length'], howToMeasure: 'Stand on paper, mark the heel and the longest toe, measure between the marks. Between two sizes, take the larger.',
    rows: rows(['UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10'], [[22.8, 23.5, 24.4, 25.2, 26.0, 26.8, 27.6]]) } },
  one_size: { name: 'One size', chart: { columns: [], rows: [], howToMeasure: '' } },
}

/** Which starting charts a shop gets, from what it said it sells (or all of the common ones if it skipped). */
export function presetsFor(sells: readonly (typeof SELL_KEYS)[number][]): Preset[] {
  const keys = new Set<string>()
  for (const s of sells) {
    if (s === 'women' || s === 'ethnic') keys.add('womens_kurta')
    if (s === 'men') keys.add('mens_shirt')
    if (s === 'kids') keys.add('kids')
    if (s === 'footwear') keys.add('footwear')
    if (s === 'accessories' || s === 'jewellery' || s === 'beauty' || s === 'wellness') keys.add('one_size')
  }
  // Skipped the question: the common ones. A shop of jewellery or beauty only gets no garment charts.
  if (!sells.length) ['womens_kurta', 'mens_shirt', 'one_size'].forEach((k) => keys.add(k))
  keys.add('one_size')
  return [...keys].map((k) => PRESETS[k]!)
}

/** 86 cm → "33.9"; for showing a chart in inches. */
export const inches = (cm: number) => (Math.round((cm / 2.54) * 10) / 10).toFixed(1)

/** Checks a chart a merchant edited: sizes unique, numbers sane, columns named. */
export function cleanChart(c: Chart): { ok: true; chart: Chart } | { ok: false; error: string } {
  const columns = c.columns.map((x) => x.trim()).filter(Boolean)
  if (columns.length !== c.columns.length) return { ok: false, error: 'Every column needs a name, like Bust.' }
  if (columns.length > 6) return { ok: false, error: 'Up to 6 measurements.' }
  const seen = new Set<string>()
  const out: Chart['rows'] = []
  for (const r of c.rows) {
    const size = r.size.trim()
    if (!size) return { ok: false, error: 'Every row needs a size, like M.' }
    if (seen.has(size.toLowerCase())) return { ok: false, error: `Size ${size} is in the chart twice.` }
    seen.add(size.toLowerCase())
    const values = columns.map((_, i) => r.values[i] ?? null)
    if (values.some((v) => v !== null && (!Number.isFinite(v) || v <= 0 || v > 300))) return { ok: false, error: `Size ${size}: measurements are in cm, between 1 and 300.` }
    out.push({ size, values })
  }
  if (out.length > 20) return { ok: false, error: 'Up to 20 sizes.' }
  return { ok: true, chart: { columns, rows: out, howToMeasure: c.howToMeasure.trim().slice(0, 600) } }
}
