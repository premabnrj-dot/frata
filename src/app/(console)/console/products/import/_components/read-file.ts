// =============================================================================
// FILE: read-file.ts — a picked file → its sheet and its hash, in the browser (plan 2026-11-12-product-import PI·1 ·
// 6). The readers load only now, on pick (import()): read-excel-file's universal build for .xlsx (no worker, so the
// console's script policy needs nothing new) and papaparse for .csv. Nothing is sent: the file never leaves the
// browser; only its rows go, chunk by chunk, once she imports.
// =============================================================================

import { MAX_FILE_BYTES } from '@/domains/catalogue/import/limits'
import { sheetOf, type Sheet } from '@/domains/catalogue/import/sheet'

export type Picked = { ok: true; name: string; sheet: Sheet; hash: string } | { ok: false; error: string }

const UNREADABLE = 'We can’t read this file. Save it as .xlsx or .csv.'

export async function readFile(file: File, onRows: (n: number) => void): Promise<Picked> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'Up to 15 MB. Split the file.' }
  const kind = /\.xlsx$/i.test(file.name) ? 'xlsx' : /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv' ? 'csv' : null
  if (!kind) return { ok: false, error: UNREADABLE }
  try {
    const [grid, digest] = await Promise.all([
      kind === 'xlsx' ? import('read-excel-file/universal').then(({ readSheet }) => readSheet(file)) : readCsv(file, onRows),
      file.arrayBuffer().then((b) => crypto.subtle.digest('SHA-256', b)),
    ])
    const s = sheetOf(grid)
    if (!s.ok) return s
    onRows(s.sheet.rows.length)
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return { ok: true, name: file.name.slice(0, 200), sheet: s.sheet, hash }
  } catch (err) {
    console.error('[import] read', err instanceof Error ? err.name : 'error')
    return { ok: false, error: UNREADABLE }
  }
}

async function readCsv(file: File, onRows: (n: number) => void): Promise<string[][]> {
  const Papa = (await import('papaparse')).default
  return new Promise((resolve, reject) => {
    const rows: string[][] = []
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      step: (r) => { rows.push(r.data); if (rows.length % 200 === 0) onRows(rows.length) },
      complete: () => resolve(rows),
      error: (e) => reject(e),
    })
  })
}
