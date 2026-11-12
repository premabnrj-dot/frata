// =============================================================================
// FILE: src/domains/catalogue/kind.ts
//
// WHAT A NEW PRODUCT IS, FROM ITS NAME (products rework PR·0, 2026-11-13). A new product took the shop's first
// type by name, so a kids' kurta went live with a women's XS–XXL bust chart. Now the name picks the kind (kids,
// footwear, one size, or sized clothing) and the type whose name shares a word with it; no match, no type — the
// readiness list then asks for one, which is honest where a wrong chart is not. PR·2 replaces the guess with a
// "What are you selling?" step; this stays as its default.
// =============================================================================

export type Kind = 'kids' | 'footwear' | 'one_size' | 'sized'

const KIDS = ['kid', 'kids', 'girl', 'girls', 'boy', 'boys', 'baby', 'babies', 'toddler', 'infant', 'children', 'child']
const FOOTWEAR = ['shoe', 'shoes', 'sandal', 'sandals', 'jutti', 'juttis', 'mojari', 'mojaris', 'heel', 'heels', 'slipper', 'slippers',
  'chappal', 'chappals', 'kolhapuri', 'kolhapuris', 'sneaker', 'sneakers', 'flats', 'footwear', 'loafer', 'loafers', 'boots']
const ONE_SIZE = ['saree', 'sarees', 'sari', 'saris', 'dupatta', 'dupattas', 'stole', 'stoles', 'scarf', 'scarves', 'shawl', 'shawls',
  'earring', 'earrings', 'jhumka', 'jhumkas', 'necklace', 'necklaces', 'bangle', 'bangles', 'ring', 'rings', 'anklet', 'anklets',
  'bracelet', 'bracelets', 'pendant', 'jewellery', 'jewelry', 'bag', 'bags', 'clutch', 'clutches', 'potli', 'tote', 'wallet',
  'belt', 'cap', 'fabric', 'unstitched', 'serum', 'cream', 'oil', 'soap', 'lipstick', 'candle', 'perfume', 'attar']

/** Lower-case words of a name, Latin letters and digits only (an Indian-script name gives none: no guess). */
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const has = (w: string[], list: readonly string[]) => w.some((x) => list.includes(x))

/** Kids before one size before footwear: "Kids' jutti" is kids; "Saree with blouse" is one size. */
export function kindOf(title: string): Kind {
  const w = words(title)
  if (has(w, KIDS)) return 'kids'
  if (has(w, ONE_SIZE)) return 'one_size'
  if (has(w, FOOTWEAR)) return 'footwear'
  return 'sized'
}

/** The sizes a new product of this kind starts with (the starting charts' own, size-charts.ts). */
export const startSizes: Record<Kind, string[]> = { kids: ['2–3 Y', '3–4 Y', '4–5 Y'], footwear: ['UK 6', 'UK 7', 'UK 8'], one_size: [], sized: ['S', 'M', 'L'] }

/** Words that say nothing about the type ("Kurta set · Women": "set" and "women" match too much). */
const WEAK = new Set(['set', 'sets', 'women', 'woman', 'womens', 'men', 'mens', 'man', 'the', 'and', 'with', 'for', 'of', 'size', 'one'])
const KIND_WORD: Record<Kind, string | null> = { kids: 'kids', footwear: 'footwear', one_size: null, sized: null }

/** The type whose name shares the most telling words with the title (singular or plural); the kind's own type
 *  ("Kids", "Footwear") when the title names the kind; else null. Ties go to the first type by name. */
export function typeFor(title: string, types: readonly { id: string; name: string }[]): string | null {
  const kind = kindOf(title)
  if (kind === 'one_size') return types.find((t) => words(t.name).includes('one') && words(t.name).includes('size'))?.id ?? null
  const stem = (x: string) => x.replace(/(es|s)$/, '')
  const tw = new Set(words(title).filter((x) => !WEAK.has(x)).map(stem))
  const kw = KIND_WORD[kind]
  let best: { id: string; score: number } | null = null
  for (const t of [...types].sort((a, b) => a.name.localeCompare(b.name))) {
    const nw = words(t.name).filter((x) => !WEAK.has(x)).map(stem)
    if (kw && nw.includes(stem(kw))) return t.id
    if (kind !== 'sized') continue
    const score = nw.filter((x) => tw.has(x)).length
    if (score > (best?.score ?? 0)) best = { id: t.id, score }
  }
  return best?.id ?? null
}
