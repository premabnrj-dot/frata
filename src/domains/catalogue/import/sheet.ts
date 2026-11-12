// =============================================================================
// FILE: src/domains/catalogue/import/sheet.ts
//
// A FILE'S GRID → HEADERS AND NUMBERED ROWS (plan 2026-11-12-product-import PI·1 · 4). Pure. The browser's readers
// (read-excel-file for .xlsx, papaparse for .csv) hand over a grid of cells; from here on every cell is text.
//
// - The header is the first row with anything in it; a row's number is its line in the sheet, as Excel shows it.
// - Up to MAX_COLUMNS columns and MAX_ROWS rows; a file with no rows under its header has nothing to import.
// =============================================================================

import { textOf, type Cell } from './cells'
import type { SheetRow } from './group'
import { MAX_COLUMNS, MAX_ROWS } from './limits'

export type Sheet = { headers: string[]; rows: SheetRow[] }

export function sheetOf(grid: readonly (readonly Cell[])[]): { ok: true; sheet: Sheet } | { ok: false; error: string } {
  const head = grid.findIndex((r) => r.some((c) => textOf(c)))
  if (head < 0) return { ok: false, error: 'This file is empty.' }
  const raw = grid[head]!.map(textOf)
  let width = raw.length
  while (width > 0 && !raw[width - 1]) width--
  if (width > MAX_COLUMNS) return { ok: false, error: `Up to ${MAX_COLUMNS} columns.` }
  const rows: SheetRow[] = []
  for (let i = head + 1; i < grid.length; i++) {
    const cells = Array.from({ length: width }, (_, j) => textOf(grid[i]![j]))
    if (cells.every((c) => !c)) continue
    rows.push({ n: i + 1, cells })
  }
  if (!rows.length) return { ok: false, error: 'This file has no rows under its headers.' }
  if (rows.length > MAX_ROWS) return { ok: false, error: `Up to ${MAX_ROWS.toLocaleString('en-IN')} rows. Split the file.` }
  return { ok: true, sheet: { headers: raw.slice(0, width), rows } }
}
