// What the import's int tests share: a CSV as the browser hands it to the actions (mapping, chunks, summary), the
// throwaway shops they make through ADMIN_URL, and removing them.
import { createHash } from 'node:crypto'
import Papa from 'papaparse'
import type postgres from 'postgres'
import { matchColumns } from '@/domains/catalogue/import/fields'
import { fileChunks } from '@/domains/catalogue/import/plan'
import { readImport } from '@/domains/catalogue/import/read'
import { sheetOf } from '@/domains/catalogue/import/sheet'

export const PROOF_A = '11111111-1111-1111-1111-111111111111'
export const HEAD = 'Name,Sizes,Price,Stock,SKU,Cost\n'
export const rowsOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `Kurta ${from + i},S/M,1299,4,IMP-${from + i},600`).join('\n')
/** A row long enough that 120 of them make two chunks. */
export const longRow = (name: string, sku: string) => `${name},Free size,2499,1,${sku},,${'x'.repeat(4900)}`
export const LONG_HEAD = 'Name,Sizes,Price,Stock,SKU,Cost,Description\n'

export function file(csv: string, opts: { costs?: boolean } = {}) {
  const s = sheetOf(Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' }).data)
  if (!s.ok) throw new Error(s.error)
  const mapping = matchColumns(s.sheet.headers, { costs: opts.costs ?? true })
  const read = readImport(mapping, s.sheet.rows, { now: new Date(), hsnDigits: 4, costs: opts.costs ?? true })
  const chunks = fileChunks(mapping, s.sheet.rows)
  const fresh = read.products.filter((p) => p.draft)
  return {
    mapping, chunks, sheet: s.sheet,
    start: { fileName: 'kesar.csv', hash: createHash('sha256').update(csv).digest('hex'), mapping, chunks: chunks.length, products: fresh.length, variants: fresh.reduce((n, p) => n + p.draft!.variants.length, 0) },
  }
}

/** A throwaway shop with PROOF_A's settings (prefix KS, no GSTIN). */
export async function makeShop(su: postgres.Sql, shops: string[], name: string) {
  const [{ id }] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-imp-' + name + '-' + Date.now()}, ${'Int ' + name}) returning id`
  await su.begin(async (x) => {
    await x`create temp table imp_shop on commit drop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await x`update imp_shop set tenant_id = ${id}, order_prefix = 'KS', gstin = null`
    await x`insert into shop_settings select * from imp_shop`
  })
  shops.push(id)
  return id
}

export async function dropShops(su: postgres.Sql, shops: string[]) {
  for (const t of shops) {
    for (const table of ['import_rows', 'import_jobs', 'order_lines', 'orders', 'price_history', 'audit_events', 'shop_pages', 'shop_theme_revisions']) await su`delete from ${su(table)} where tenant_id = ${t}`
    await su`delete from support_sessions where tenant_id = ${t}`
    await su`delete from tenants where id = ${t}`
  }
}
