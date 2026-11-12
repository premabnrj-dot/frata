// =============================================================================
// FILE: src/domains/catalogue/import/plan.ts
//
// WHAT AN IMPORT WILL DO, BEFORE IT DOES IT (plan 2026-11-12-product-import PI·1 · 4, 6). Pure.
//
// - A product is already in the shop when one of its SKUs (any case) or its address is: it is left as it is (an
//   update is PI·3). Else it is new when it reads clean, and left out until fixed when it doesn't.
// - The shop's caps count what it holds now plus what is new (limits.ts): over either, nothing is imported.
// - Chunks: products in the file's order, whole, packed up to CHUNK_BYTES (every product, the ones in the shop and
//   the ones left out too: the server reads them all again and records each row). The same file and mapping always
//   make the same chunks, so a paused import resumes at its chunk. Chunking needs only the grouping (group.ts), so
//   the browser makes them without the rules.
// - What the Check step shows (checkedOf) is the server's reading of a chunk, product by product: never a cost,
//   never a cell, so the rules that read costs stay on the server (ADR-0003, check:client-bundle).
// =============================================================================

import type { Mapping } from './fields'
import { groupRows, type SheetRow } from './group'
import { CHUNK_BYTES, CHUNK_ROOM, compactRow, MAX_PRODUCTS, MAX_VARIANTS, rowBytes } from './limits'
import type { ImportProduct, Problem, Read } from './read'

export type Existing = { handles: ReadonlySet<string>; skus: ReadonlySet<string> }
export type Planned = { fresh: ImportProduct[]; inShop: ImportProduct[]; leftOut: ImportProduct[]; variants: number }

export const inShop = (p: Pick<ImportProduct, 'handle' | 'skus'>, e: Existing) => e.handles.has(p.handle) || p.skus.some((s) => e.skus.has(s))

export function planImport(products: readonly ImportProduct[], existing: Existing): Planned {
  const fresh: ImportProduct[] = [], kept: ImportProduct[] = [], leftOut: ImportProduct[] = []
  for (const p of products) (inShop(p, existing) ? kept : p.draft ? fresh : leftOut).push(p)
  return { fresh, inShop: kept, leftOut, variants: fresh.reduce((n, p) => n + p.draft!.variants.length, 0) }
}

/** Why nothing can be imported: the shop's caps (null when it fits). */
export function capRefusal(adds: { products: number; variants: number }, shop: { products: number; variants: number }): string | null {
  if (shop.products + adds.products > MAX_PRODUCTS) return `Your shop holds up to ${MAX_PRODUCTS} products: this adds ${adds.products} to your ${shop.products}. Split the file.`
  if (shop.variants + adds.variants > MAX_VARIANTS) return `Your shop holds up to ${MAX_VARIANTS.toLocaleString('en-IN')} sizes and colours: this adds ${adds.variants} to your ${shop.variants}. Split the file.`
  return null
}

/** The rows each chunk carries (mapped cells only), whole products each, in the file's order. */
export function chunkRows(m: Mapping, rows: readonly SheetRow[], products: readonly { rows: readonly number[] }[]): SheetRow[][] {
  const byN = new Map(rows.map((r) => [r.n, r]))
  const chunks: SheetRow[][] = []
  let cur: SheetRow[] = [], size = 2
  for (const p of products) {
    const mine = p.rows.map((n) => byN.get(n)!)
    const bytes = mine.reduce((s, r) => s + rowBytes(m, r), 0)
    if (cur.length && size + bytes > CHUNK_BYTES - CHUNK_ROOM) { chunks.push(cur); cur = []; size = 2 }
    cur.push(...mine.map((r) => compactRow(m, r)))
    size += bytes
  }
  if (cur.length) chunks.push(cur)
  return chunks
}

/** A whole file's chunks, from its grouping alone (the browser's: no rules needed). */
export const fileChunks = (m: Mapping, rows: readonly SheetRow[]) => chunkRows(m, rows, groupRows(m, rows).map((g) => ({ rows: g.rows.map((r) => r.n) })))

export type Checked = {
  products: { key: string; rows: number[]; title: string; handle: string; state: 'new' | 'in_shop' | 'left_out'; variants: number; values: string; price: number | null; stock: number }[]
  /** What to fix, for products left out only. */
  problems: Problem[]
}

/** The Check step's reading of some rows: each product's state and preview line, and what to fix. */
export function checkedOf(read: Read, existing: Existing): Checked {
  const plan = planImport(read.products, existing)
  const state = (p: ImportProduct) => (plan.inShop.includes(p) ? 'in_shop' as const : p.draft ? 'new' as const : 'left_out' as const)
  const out = new Set(plan.leftOut.flatMap((p) => p.rows))
  return {
    products: read.products.map((p) => ({
      key: p.key, rows: p.rows, title: p.title, handle: p.handle, state: state(p), variants: p.draft?.variants.length ?? 0,
      values: p.draft?.options.map((o) => o.values.join(', ')).join(' · ') ?? '',
      price: p.draft ? Math.min(...p.draft.variants.map((v) => v.price)) : null, stock: p.draft?.variants.reduce((n, v) => n + v.stock, 0) ?? 0,
    })),
    problems: read.problems.filter((x) => out.has(x.row)),
  }
}
