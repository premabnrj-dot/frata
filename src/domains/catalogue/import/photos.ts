// =============================================================================
// FILE: src/domains/catalogue/import/photos.ts
//
// PHOTOS BY FILE NAME (plan 2026-11-12-product-import PI·2 · 8; spec Design § 4). Pure: the Photos page matches each
// chosen file to one of the shop's products in the browser; the server only checks that the product is the shop's.
//
// Rules:
// - A file's name without its extension is its stem. A trailing number of one or two digits ("-2", "_2", " 2",
//   " (2)") is the photo's place among that product's photos; the stem without it is tried first, then the whole stem
//   (a SKU or an address may end in a number).
// - In this order, the first rule that names exactly ONE product wins:
//   1. a SKU (any case): the product, and the size's colour when it has one;
//   2. the start of a product's SKUs up to a dash ("KS-ANR" of KS-ANR-S, KS-ANR-M), when no other product's SKU
//      starts so;
//   3. the address (handle), then the name (as `handleFor` writes it: Hindi and other Indian scripts in Latin letters);
//   4. the same after taking out one of the product's colours ("linen-kurta-red" → Linen kurta, its Red photo);
//   5. every word of the stem (its colour taken out) is a word of exactly one product's address or name.
// - A rule that names two or more products asks "Which product?" with them (a SKU's start may still give way to a
//   whole SKU or a name; a name never gives way); no rule at all asks with none.
// - A product holds at most MAX_PHOTOS_PER_PRODUCT photos; past that a photo is left out (`over`).
// =============================================================================

import { handleFor } from '../variants'

export const MAX_PHOTOS_PER_PRODUCT = 10
/** Photos chosen at once on the Photos page (60 products × 4 photos fits, twice over). */
export const MAX_PHOTOS_CHOSEN = 500
/** "Which product?" starts with the products a name fits only when they are this few. */
const SUGGESTED = 3

export type PhotoTarget = { id: string; title: string; handle: string; skus: { sku: string; colour: string | null }[]; colours: string[]; photos: number }
export type PhotoMatch =
  | { productId: string; n: number | null; colour: string | null; by: 'sku' | 'address' | 'name' }
  | { productId: null; n: number | null; colour: null; by: null; candidates: string[] }

type Entry = { t: PhotoTarget; words: Set<string>; colours: { key: string[]; value: string }[] }
export type PhotoIndex = {
  byId: Map<string, PhotoTarget>
  sku: Map<string, { id: string; colour: string | null }>
  stems: Map<string, { ids: Set<string>; colours: Set<string | null> }>
  handles: Map<string, string>
  names: Map<string, Set<string>>
  entries: Entry[]
}

const skuKey = (s: string) => s.trim().toUpperCase()
const add = <K, V>(m: Map<K, Set<V>>, k: K, v: V) => { const s = m.get(k); if (s) s.add(v); else m.set(k, new Set([v])) }

/** The shop's products made ready to match many files against. */
export function photoIndex(targets: readonly PhotoTarget[]): PhotoIndex {
  const idx: PhotoIndex = { byId: new Map(), sku: new Map(), stems: new Map(), handles: new Map(), names: new Map(), entries: [] }
  for (const t of targets) {
    idx.byId.set(t.id, t)
    idx.handles.set(t.handle, t.id)
    const name = handleFor(t.title)
    if (name) add(idx.names, name, t.id)
    for (const { sku, colour } of t.skus) {
      const k = skuKey(sku)
      if (!k) continue
      idx.sku.set(k, { id: t.id, colour })
      const parts = k.split('-')
      for (let i = 1; i < parts.length; i++) {
        const stem = parts.slice(0, i).join('-')
        const s = idx.stems.get(stem) ?? { ids: new Set<string>(), colours: new Set<string | null>() }
        s.ids.add(t.id); s.colours.add(colour); idx.stems.set(stem, s)
      }
    }
    const words = new Set([...t.handle.split('-'), ...name.split('-')].filter(Boolean))
    const colours = t.colours.map((value) => ({ key: handleFor(value).split('-').filter(Boolean), value })).filter((c) => c.key.length)
      .sort((a, b) => b.key.length - a.key.length)
    idx.entries.push({ t, words, colours })
  }
  return idx
}

/** A file's stem and the place its trailing number gives ("Linen Kurta (3).jpeg" → "Linen Kurta", 3). */
export function stemOf(fileName: string): { whole: string; base: string; n: number | null } {
  const whole = fileName.trim().replace(/\.[A-Za-z0-9]{1,5}$/, '').trim()
  const m = /^(.*?\S)[\s_-]*(?:\((\d{1,2})\)|[\s_-](\d{1,2}))$/.exec(whole)
  const n = m ? Number(m[2] ?? m[3]) : null
  return m && n! > 0 ? { whole, base: m[1]!, n } : { whole, base: whole, n: null }
}

/** `words` without the run of `key` in it (null when it isn't there). */
function without(words: string[], key: string[]): string[] | null {
  for (let i = 0; i + key.length <= words.length; i++) {
    if (key.every((k, j) => words[i + j] === k)) return [...words.slice(0, i), ...words.slice(i + key.length)]
  }
  return null
}

type Found = { ids: string[]; colour?: Map<string, string | null>; by: 'sku' | 'address' | 'name' }

function byName(idx: PhotoIndex, stem: string): Found | null {
  const key = handleFor(stem)
  if (!key) return null
  const h = idx.handles.get(key)
  const named = idx.names.get(key)
  // Two products of the same name: the address of one of them is no answer.
  if (named && named.size > 1) return { ids: [...named], by: 'name' }
  if (h) return { ids: [h], by: 'address' }
  if (named) return { ids: [...named], by: 'name' }
  const words = key.split('-')
  // 4. A product's own colour taken out leaves its address or name exactly.
  const exact = new Map<string, string | null>()
  // 5. Every word left is one of the product's words.
  const loose = new Map<string, string | null>()
  for (const e of idx.entries) {
    let rest = words, colour: string | null = null
    for (const c of e.colours) { const r = without(words, c.key); if (r) { rest = r; colour = c.value; break } }
    if (!rest.length) continue
    const joined = rest.join('-')
    if (colour && (joined === e.t.handle || joined === handleFor(e.t.title))) exact.set(e.t.id, colour)
    else if (rest.some((w) => w.length >= 3 && !/^\d+$/.test(w)) && rest.every((w) => e.words.has(w))) loose.set(e.t.id, colour)
  }
  if (exact.size) return { ids: [...exact.keys()], colour: exact, by: 'name' }
  if (loose.size) return { ids: [...loose.keys()], colour: loose, by: 'name' }
  return null
}

function bySku(idx: PhotoIndex, stem: string): Found | null {
  const k = skuKey(stem)
  const one = idx.sku.get(k)
  if (one) return { ids: [one.id], colour: new Map([[one.id, one.colour]]), by: 'sku' }
  const s = idx.stems.get(k)
  if (!s) return null
  const ids = [...s.ids]
  return { ids, colour: ids.length === 1 && s.colours.size === 1 ? new Map([[ids[0]!, [...s.colours][0]!]]) : undefined, by: 'sku' }
}

/** Which product a photo's file name names (see the header's rules). */
export function matchPhoto(fileName: string, idx: PhotoIndex): PhotoMatch {
  const { whole, base, n } = stemOf(fileName)
  const tries: [string, number | null][] = n === null ? [[whole, null]] : [[base, n], [whole, null]]
  let asked: string[] = []
  for (const rule of [bySku, byName]) {
    for (const [stem, place] of tries) {
      const f = rule(idx, stem)
      if (!f) continue
      if (f.ids.length === 1) return { productId: f.ids[0]!, n: place, colour: f.colour?.get(f.ids[0]!) ?? null, by: f.by }
      // A name that fits two products asks, even if the whole stem is another's address ("ajrakh-stole-2").
      if (rule === byName) return { productId: null, n, colour: null, by: null, candidates: f.ids.length <= SUGGESTED ? f.ids : asked }
      // Too many to choose between is no suggestion at all (a shop's SKU prefix names every product).
      if (!asked.length && f.ids.length <= SUGGESTED) asked = f.ids
    }
  }
  return { productId: null, n, colour: null, by: null, candidates: asked }
}

export type Placed = { i: number; of: number; over: boolean }

/**
 * Each photo's place among its product's chosen photos: by its number, then by file name (in the order a person
 * reads them: "2" before "10"). `over`: the product would hold more than MAX_PHOTOS_PER_PRODUCT with it.
 */
export function placePhotos(items: readonly { key: string; productId: string | null; n: number | null; name: string }[], have: (id: string) => number): Map<string, Placed> {
  const groups = new Map<string, typeof items[number][]>()
  for (const it of items) if (it.productId) groups.set(it.productId, [...(groups.get(it.productId) ?? []), it])
  const out = new Map<string, Placed>()
  for (const [id, list] of groups) {
    const sorted = [...list].sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.name.localeCompare(b.name, 'en', { numeric: true }))
    const room = Math.max(0, MAX_PHOTOS_PER_PRODUCT - have(id))
    sorted.forEach((it, i) => out.set(it.key, { i: i + 1, of: sorted.length, over: i >= room }))
  }
  return out
}

/** "Which product?": the shop's products whose words start with every word typed, or whose SKU starts so. */
export function findProducts(q: string, idx: PhotoIndex, limit = 6): PhotoTarget[] {
  const words = handleFor(q).split('-').filter(Boolean)
  const sku = skuKey(q)
  if (!words.length && !sku) return []
  const hits: { t: PhotoTarget; rank: number }[] = []
  for (const e of idx.entries) {
    const title = handleFor(e.t.title)
    const byWords = words.length > 0 && words.every((w) => [...e.words].some((x) => x.startsWith(w)))
    const bySku = sku.length >= 2 && e.t.skus.some((s) => skuKey(s.sku).startsWith(sku))
    if (byWords || bySku) hits.push({ t: e.t, rank: title.startsWith(words.join('-')) ? 0 : byWords ? 1 : 2 })
  }
  return hits.sort((a, b) => a.rank - b.rank || a.t.title.localeCompare(b.t.title)).slice(0, limit).map((h) => h.t)
}

/** The two example names the page shows, from a product that needs photos (its SKUs' start, then its address). */
export function exampleNames(t: PhotoTarget | undefined): string[] {
  if (!t) return ['KS-ANR-1.jpg', 'anarkali-kurta-set-2.jpg']
  const parts = t.skus.map((s) => skuKey(s.sku).split('-')).filter((p) => p.length > 1)
  let stem = parts[0] ?? []
  for (const p of parts) { let i = 0; while (i < stem.length && i < p.length && stem[i] === p[i]) i++; stem = stem.slice(0, i) }
  const sku = stem.length ? stem.join('-') : t.skus[0]?.sku
  return [...(sku ? [`${sku}-1.jpg`] : []), `${t.handle}-2.jpg`]
}
