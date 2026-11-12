// =============================================================================
// FILE: src/domains/catalogue/import/fix-file.ts
//
// "DOWNLOAD ROWS TO FIX" (plan 2026-11-12-product-import PI·1 · 4; spec § Design 2). Pure; made in the browser from the
// file it read, so nothing leaves the shop for it.
//
// - The file's own columns, in its order, then "What to fix": every row of each product left out (a product is left
//   out whole), its problems joined on the row they belong to.
// - A text cell that starts like a formula (= + - @, tab, CR) gets a leading ' so a spreadsheet shows it as text, as
//   GSTR-1's files do (gstr1-files.ts, security review 2026-11-09 H1): a cell from another platform's export is not ours.
// - A byte-order mark first, so Excel reads Hindi as Hindi.
// =============================================================================

import type { SheetRow } from './group'
import type { Problem } from './read'

/** One CSV cell: formula-looking text made inert, quoted where needed. */
export const csvCell = (v: string) => {
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function rowsToFix(headers: readonly string[], rows: readonly SheetRow[], leftOut: readonly { rows: readonly number[] }[], problems: readonly Problem[]): string {
  const wanted = new Set(leftOut.flatMap((p) => p.rows))
  const why = new Map<number, string[]>()
  for (const p of problems) if (wanted.has(p.row)) why.set(p.row, [...(why.get(p.row) ?? []), `${p.column}: ${p.message}`])
  const lines = [[...headers, 'What to fix'], ...rows.filter((r) => wanted.has(r.n)).map((r) => [...headers.map((_, i) => r.cells[i] ?? ''), (why.get(r.n) ?? []).join('; ')])]
  return '\uFEFF' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
