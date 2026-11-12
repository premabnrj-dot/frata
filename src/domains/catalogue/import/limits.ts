// =============================================================================
// FILE: src/domains/catalogue/import/limits.ts
//
// HOW MUCH ONE IMPORT MAY CARRY (plan 2026-11-12-product-import § Changes to the spec, PI·1 · 6). The browser checks
// them before anything is sent; the server checks them again on every call.
//
// - A shop holds up to 600 products and 1,800 sizes and colours: the shop's cached catalogue entry stays under 1 MB
//   (880 kB at 600, frata-architecture § Speed); SQL-paged lists come first if a shop needs more.
// - A chunk is at most 512 kB of JSON, and a product's rows are never split between two.
// - A file: 15 MB, 10,000 rows, 100 columns. A shop starts at most 10 imports a day.
// =============================================================================

import type { Mapping } from './fields'
import type { SheetRow } from './group'

export const MAX_PRODUCTS = 600
export const MAX_VARIANTS = 1800
export const CHUNK_BYTES = 512 * 1024
/** Room in a chunk's call for its job id and number, beside the rows. */
export const CHUNK_ROOM = 2 * 1024
export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_ROWS = 10_000
export const MAX_COLUMNS = 100
export const IMPORTS_PER_DAY = 10

const encoder = new TextEncoder()
/** A row as a chunk carries it: the cells of the mapped columns only. */
export const compactRow = (m: Pick<Mapping, 'fields'>, r: SheetRow): SheetRow => ({ n: r.n, cells: r.cells.filter((_, i) => m.fields[i] != null) })
/** The mapping a chunk's rows are read with: the mapped columns only, in the file's order. */
export const compactMapping = (m: Mapping): Mapping => ({ source: m.source, headers: m.headers.filter((_, i) => m.fields[i] != null), fields: m.fields.filter((f) => f != null) })
/** A row's size in a chunk, in bytes of JSON (the same on both sides: only mapped cells count). */
export const rowBytes = (m: Pick<Mapping, 'fields'>, r: SheetRow) => encoder.encode(JSON.stringify(compactRow(m, r))).length + 1
