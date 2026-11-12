// =============================================================================
// FILE: src/domains/catalogue/import/cells.ts
//
// ONE CELL AS A PERSON MEANT IT (plan 2026-11-12-product-import PI·1 · 4; spec § Parsing rules). Pure.
//
// - A cell is text from here on: a number as written (no float noise), a date as yyyy-mm-dd, true/false as words.
//   A formula cell arrives as its value (the browser's reader gives values); its text is never evaluated.
// - Every cell is capped (CELL_MAX characters) before anything reads it.
// - Several values in one cell: "S/M/L", "S, M, L", "S | M", and "S-M-L" when every piece is a size (a colour such
//   as "Off-white" never splits on a dash). "Free size" stays one value.
// - Stock: one number for each size and colour, or per value ("S:4, M:6, L:2"); empty is 0.
// - A GST rate: "5%", "5", "0.05", "GST 18%" → basis points.
// - A description written as HTML (Shopify's Body) becomes its text, paragraphs kept as lines.
// =============================================================================

export const CELL_MAX = 20_000

/** What a reader hands over: text, a number, true/false, a date, or nothing (typed loosely: read-excel-file types a date as `typeof Date`). */
export type Cell = unknown

/** A cell as text: trimmed, capped, never "1299.0000001". */
export function textOf(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (typeof c === 'number') return Number.isFinite(c) ? String(Math.round(c * 1e6) / 1e6) : ''
  if (typeof c === 'boolean') return c ? 'TRUE' : 'FALSE'
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? '' : c.toISOString().slice(0, 10)
  return String(c).replace(/^\uFEFF/, '').trim().slice(0, CELL_MAX)
}

const SIZE_PIECE = /^(?:[0-9]{0,2}X{0,4}[SML]|X{1,4}L|XS|[0-9]{1,3}|FREE|OS)$/i
/** Pieces of a cell split on one character class, each trimmed: one pass, no backtracking. */
const pieces = (t: string, on: RegExp) => t.split(on).map((x) => x.trim()).filter(Boolean)

/** The values one cell holds, in its order, each once. */
export function splitValues(cell: string, kind: 'size' | 'other' = 'other'): string[] {
  const t = cell.trim()
  if (!t) return []
  let parts = pieces(t, /[/,|;]/)
  if (kind === 'size' && parts.length === 1 && t.includes('-')) {
    const dashed = pieces(t, /-/)
    if (dashed.length > 1 && dashed.every((p) => SIZE_PIECE.test(p))) parts = dashed
  }
  const seen = new Set<string>(), out: string[] = []
  for (const p of parts.map((x) => x.replace(/\s+/g, ' '))) {
    if (seen.has(p.toLowerCase())) continue
    seen.add(p.toLowerCase()); out.push(p)
  }
  return out
}

const isDigit = (c: string) => c >= '0' && c <= '9'

/** Stock: one count for every value, or a count per value ("S:4, M:6", "S=4", "S 4"). null: not a stock. */
export function parseStock(cell: string): { each: string } | { per: Map<string, string> } | null {
  const t = cell.trim()
  if (!t) return { each: '0' }
  if (/^\d+(?:\.0+)?$/.test(t)) return { each: String(Number(t)) }
  const per = new Map<string, string>()
  for (const part of pieces(t, /[,;|/]/)) {
    // The count is the digits at the end; what is before it, less a ":" or "=", names the value.
    let i = part.length
    while (i > 0 && isDigit(part[i - 1]!)) i--
    if (i === part.length || i === 0) return null
    const before = part.slice(0, i), name = before.replace(/[:=]\s*$/, '').trim()
    if (!name || name === before) { if (!/\s$/.test(before)) return null }
    per.set(name.toLowerCase(), part.slice(i))
  }
  return per.size ? { per } : null
}

/** "5%", "5", "0.05", "GST 18 %" → basis points; null when it is not a rate. */
export function parseGst(cell: string): number | null {
  const m = /^(?:gst|igst)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?$/i.exec(cell.trim())
  if (!m) return null
  const n = Number(m[1])
  const pct = n > 0 && n < 1 && !/%/.test(cell) ? n * 100 : n
  return Math.round(pct * 100)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const entity = (all: string, e: string) => {
  const k = e.toLowerCase()
  if (Object.hasOwn(ENTITIES, k)) return ENTITIES[k]!
  if (!e.startsWith('#')) return all
  const n = Number(e.slice(1))
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' '
}

/** A description's text: HTML tags off (a paragraph or line break kept as a new line), entities read, spaces tidied. */
export function htmlText(cell: string): string {
  if (!/<[a-z!/]/i.test(cell)) return cell.trim()
  return cell
    .replace(/<\s*(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<\s*li\b[^<>]*>/gi, '• ')
    .replace(/<[^<>]*>/g, '')
    .replace(/&(#\d{1,7}|[a-z]{1,8});/gi, entity)
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
}
