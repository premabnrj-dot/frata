// =============================================================================
// FILE: src/domains/catalogue/variants.ts
//
// OPTIONS → VARIANTS (Shopify's 2026 model: options first, variants derived).
// A product has up to three options (Size, Colour…); every combination of their
// values is one variant. Pure: the editor draws from it, the save action checks
// with it, and both agree on what a variant is.
// =============================================================================

import { latinOf } from './indic'

export const MAX_OPTIONS = 3
export const MAX_VALUES = 30
export const MAX_VARIANTS = 100

export type Option = { name: string; values: string[] }

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Checks names and values; returns cleaned options or the first problem in words. */
export function cleanOptions(options: Option[]): { ok: true; options: Option[] } | { ok: false; error: string } {
  if (options.length > MAX_OPTIONS) return { ok: false, error: `Up to ${MAX_OPTIONS} options, like Size, Colour and Fabric.` }
  const out: Option[] = []
  const names = new Set<string>()
  for (const o of options) {
    const name = tidy(o.name)
    if (!name) return { ok: false, error: 'Every option needs a name, like Size.' }
    if (name.length > 30) return { ok: false, error: `“${name.slice(0, 30)}…” is too long for an option name.` }
    if (names.has(name.toLowerCase())) return { ok: false, error: `There are two options called ${name}.` }
    names.add(name.toLowerCase())
    const values: string[] = []
    const seen = new Set<string>()
    for (const raw of o.values) {
      const v = tidy(raw)
      if (!v) continue
      if (v.length > 40) return { ok: false, error: `“${v.slice(0, 40)}…” is too long for a ${name.toLowerCase()}.` }
      if (seen.has(v.toLowerCase())) return { ok: false, error: `${name} has ${v} twice.` }
      seen.add(v.toLowerCase()); values.push(v)
    }
    if (!values.length) return { ok: false, error: `Add at least one ${name.toLowerCase()}, or remove the option.` }
    if (values.length > MAX_VALUES) return { ok: false, error: `Up to ${MAX_VALUES} values for ${name}.` }
    out.push({ name, values })
  }
  const count = out.reduce((n, o) => n * o.values.length, 1)
  if (count > MAX_VARIANTS) return { ok: false, error: `That makes ${count} sizes and colours; the most is ${MAX_VARIANTS}. Split it into two products.` }
  return { ok: true, options: out }
}

/** Every combination, in the order shoppers see them (first option varies slowest). No options → one variant with no values. */
export function combinations(options: Option[]): string[][] {
  return options.reduce<string[][]>((acc, o) => acc.flatMap((c) => o.values.map((v) => [...c, v])), [[]])
}

export const keyOf = (values: readonly string[]) => values.join('\u0000')

/** What a save does to the variants: which stay (matched by their values), which are new, which go. */
export function reconcile<T extends { id: string; optionValues: string[] }>(existing: readonly T[], options: Option[]) {
  const wanted = combinations(options)
  const byKey = new Map(existing.map((v) => [keyOf(v.optionValues), v]))
  const keep = wanted.filter((c) => byKey.has(keyOf(c))).map((c) => byKey.get(keyOf(c))!)
  const add = wanted.filter((c) => !byKey.has(keyOf(c)))
  const wantedKeys = new Set(wanted.map(keyOf))
  const remove = existing.filter((v) => !wantedKeys.has(keyOf(v.optionValues)))
  return { wanted, keep, add, remove }
}

/** Which option the grid groups by: a colour if there is one, else the last option. -1 with fewer than two options. */
export function groupOption(options: readonly Option[]): number {
  if (options.length < 2) return -1
  const i = options.findIndex((o) => /^colou?rs?$/i.test(o.name))
  return i >= 0 ? i : options.length - 1
}

/**
 * A product's address in the shop: "Linen Kurta Set" → "linen-kurta-set", "लिनन कुर्ता" → "linan-kurta" (Indian
 * scripts in Latin letters, indic.ts). Up to 100 characters.
 */
export function handleFor(title: string): string {
  return latinOf(title).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/, '')
}

const code = (s: string, n: number) => s.toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]/g, '').slice(0, n)

/**
 * A default SKU, made when the merchant leaves the cell empty: shop prefix,
 * a product code from its handle, then each option value.
 * "KS", "linen-kurta-set", ["M", "Indigo"] → "KS-LINKUR-M-IND". Once saved it
 * stays as it is (a SKU must not change when a colour is renamed); the
 * merchant can overwrite it any time.
 */
export function skuFor(prefix: string, handle: string, values: readonly string[]): string {
  const words = handle.split('-').filter(Boolean)
  const product = (words.length > 1 ? words.slice(0, 2).map((w) => code(w, 3)).join('') : code(words[0] ?? 'ITEM', 6)) || 'ITEM'
  return [code(prefix, 4) || 'SKU', product, ...values.map((v) => code(v, 3) || 'X')].join('-').slice(0, 40)
}

/** Makes a SKU unique against those already taken: "KS-LINKUR-M", then "-2", "-3"… */
export function uniqueSku(sku: string, taken: ReadonlySet<string>): string {
  if (!taken.has(sku.toUpperCase())) return sku
  // Pure: the suffix is the first free number, never the clock (check:clock). A shop has far fewer SKUs than this.
  for (let n = 2; n < 1_000_000; n++) { const s = `${sku.slice(0, 32)}-${n}`; if (!taken.has(s.toUpperCase())) return s }
  throw new Error('no free SKU suffix')
}
