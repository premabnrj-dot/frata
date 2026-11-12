// The import's actions (src/app/(console)/console/products/import/actions.ts, plan 2026-11-12-product-import PI·1 · 6)
// on a real Postgres, driven as the browser drives them: the file read by the pure rules, chunked, sent one by one.
// A chunk that breaks the shop's cap is refused with nothing written; a paused job resumes at its chunk (an earlier
// chunk again is a no-op, a later one refused) and its rows' cells are gone once it ends; products already in the
// shop are left as they are; staff never write a cost; deleting a job's drafts keeps a published or ordered one;
// "Publish the N ready" makes live only what needs nothing more; another shop's job is invisible to every action.
// The sign-in is faked (the member is the test's); the shops are throwaway ones made through ADMIN_URL and removed
// after. Skipped unless INT_DB_HOST is set.
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import Papa from 'papaparse'
import postgres from 'postgres'
import { matchColumns } from '@/domains/catalogue/import/fields'
import { chunkRows } from '@/domains/catalogue/import/plan'
import { readImport } from '@/domains/catalogue/import/read'
import { sheetOf } from '@/domains/catalogue/import/sheet'

const state = vi.hoisted(() => ({ tenantId: '', role: 'owner' as 'owner' | 'staff' }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: '99999999-9999-4999-8999-999999999999', email: 'int@example.com', staffRole: null, all: [],
    membership: { tenantId: state.tenantId, tenantName: 'Int import', role: state.role, supportSessionId: null } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const PROOF_A = '11111111-1111-1111-1111-111111111111'
const NOW = new Date()

/** A CSV as the browser hands it to the actions: its mapping, its chunks, its summary. */
function file(csv: string, opts: { costs?: boolean; chunkBytes?: boolean } = {}) {
  const s = sheetOf(Papa.parse<string[]>(csv, { skipEmptyLines: 'greedy' }).data)
  if (!s.ok) throw new Error(s.error)
  const mapping = matchColumns(s.sheet.headers, { costs: opts.costs ?? true })
  const read = readImport(mapping, s.sheet.rows, { now: NOW, hsnDigits: 4, costs: opts.costs ?? true })
  const chunks = chunkRows(mapping, s.sheet.rows, read.products)
  const fresh = read.products.filter((p) => p.draft)
  return {
    mapping, chunks, start: { fileName: 'kesar.csv', hash: createHash('sha256').update(csv).digest('hex'), mapping, chunks: chunks.length, products: fresh.length, variants: fresh.reduce((n, p) => n + p.draft!.variants.length, 0) },
  }
}
const rowsOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `Kurta ${from + i},S/M,1299,4,IMP-${from + i},600`).join('\n')
const HEAD = 'Name,Sizes,Price,Stock,SKU,Cost\n'

describe.skipIf(!host)('importing a file (actions)', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  let a: typeof import('@/app/(console)/console/products/import/actions')
  let page: typeof import('@/lib/queries/imports')
  const shops: string[] = []
  async function shop(name: string) {
    const [{ id }] = await su!<[{ id: string }]>`insert into tenants (slug, name) values (${'int-imp-' + name + '-' + Date.now()}, ${'Int ' + name}) returning id`
    await su!`create temp table imp_shop as select * from shop_settings where tenant_id = ${PROOF_A}`
    await su!`update imp_shop set tenant_id = ${id}, order_prefix = 'KS', gstin = null`
    await su!`insert into shop_settings select * from imp_shop`
    await su!`drop table imp_shop`
    shops.push(id)
    return id
  }
  /** Start a file and send its chunks from `from` up to (not including) `to`. */
  async function run(f: ReturnType<typeof file>, from = 0, to = f.chunks.length) {
    const s = await a.startImport(f.start)
    if (!s.ok) return s
    let last: Awaited<ReturnType<typeof a.importChunk>> | null = null
    for (let n = from; n < to; n++) { last = await a.importChunk({ jobId: s.jobId, n, rows: f.chunks[n] }); if (!last.ok) return last }
    return { ...s, last }
  }

  beforeAll(async () => {
    if (!su) return
    state.tenantId = await shop('a')
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    a = await import('@/app/(console)/console/products/import/actions')
    page = await import('@/lib/queries/imports')
  })
  afterAll(async () => {
    if (!su) return
    for (const t of shops) {
      for (const table of ['import_rows', 'import_jobs', 'order_lines', 'orders', 'price_history', 'audit_events']) await su`delete from ${su(table)} where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
    }
    await su.end()
  })

  it('writes drafts; a chunk that breaks the cap is refused with nothing written', async () => {
    state.tenantId = await shop('cap'); state.role = 'owner'
    await su!`insert into products (tenant_id, handle, title) select ${state.tenantId}, 'p-' || i, 'P ' || i from generate_series(1, 598) i`
    const two = file(HEAD + rowsOf(2))
    const ok = await run(two)
    expect(ok).toMatchObject({ ok: true, last: { ok: true, done: true, added: 2, leftOut: 0, inShop: 0 } })
    const drafts = await su!`select p.status, p.type_id, count(v.*)::int as sizes, min(v.unit_cost)::int as cost from products p join variants v on v.product_id = p.id
      where p.tenant_id = ${state.tenantId} and p.handle like 'kurta-%' group by p.id order by p.handle`
    expect(drafts.map((d) => [d.status, d.sizes, d.cost, d.type_id !== null])).toEqual([['draft', 2, 60000, true], ['draft', 2, 60000, true]])

    // 600 now: one more is refused at the start (the file's own count) and, sent anyway, at the chunk.
    const one = file(HEAD + rowsOf(1, 50))
    expect(await a.startImport(one.start)).toEqual({ ok: false, error: 'Your shop holds up to 600 products: this adds 1 to your 600. Split the file.' })
    const lying = await a.startImport({ ...one.start, products: 0, variants: 0 })
    if (!lying.ok) throw new Error(lying.error)
    expect(await a.importChunk({ jobId: lying.jobId, n: 0, rows: one.chunks[0] })).toEqual({ ok: false, error: 'Your shop holds up to 600 products: this adds 1 to your 600. Split the file.' })
    expect((await su!`select count(*)::int n from products where tenant_id = ${state.tenantId}`)[0]!.n).toBe(600)
    expect((await su!`select count(*)::int n from import_rows where job_id = ${lying.jobId}`)[0]!.n).toBe(0)
  })

  it('resumes a paused job at its chunk; an earlier chunk again changes nothing; the cells are gone once it ends', async () => {
    state.tenantId = await shop('resume'); state.role = 'owner'
    // Long descriptions make three chunks.
    const csv = 'Name,Sizes,Price,Stock,SKU,Description\n' + Array.from({ length: 220 }, (_, i) => `Saree ${i},Free size,2499,1,SR-${i},${'x'.repeat(4900)}`).join('\n')
    const f = file(csv)
    expect(f.chunks.length).toBeGreaterThan(1)
    const first = await run(f, 0, 1)
    if (!first.ok) throw new Error(first.error)
    // The page closed. Chosen again: the same job, at its next chunk.
    const again = await a.startImport(f.start)
    expect(again).toEqual({ ok: true, jobId: first.jobId, next: 1, chunks: f.chunks.length, resumed: true })
    const added = first.last!.ok ? first.last!.added : -1
    expect(await a.importChunk({ jobId: first.jobId, n: 0, rows: f.chunks[0] })).toMatchObject({ ok: true, next: 1, added })
    expect(await a.importChunk({ jobId: first.jobId, n: 2, rows: f.chunks[2] })).toEqual({ ok: false, error: 'This part of the file came out of order. Choose the file again.' })
    // Another file while this one runs: refused.
    expect(await a.startImport(file(HEAD + rowsOf(1)).start)).toEqual({ ok: false, error: 'Finish or stop the import of kesar.csv first.' })
    expect((await su!`select count(*)::int n from import_rows where job_id = ${first.jobId} and cells is not null`)[0]!.n).toBeGreaterThan(0)
    for (let n = 1; n < f.chunks.length; n++) expect(await a.importChunk({ jobId: first.jobId, n, rows: f.chunks[n] })).toMatchObject({ ok: true, next: n + 1 })
    const [job] = await su!`select added, next_chunk, finished_at from import_jobs where id = ${first.jobId}`
    expect([job!.added, job!.next_chunk, job!.finished_at !== null]).toEqual([220, f.chunks.length, true])
    expect((await su!`select count(*)::int n from import_rows where job_id = ${first.jobId} and cells is not null`)[0]!.n).toBe(0)
    expect((await su!`select count(*)::int n from products where tenant_id = ${state.tenantId}`)[0]!.n).toBe(220)
    // The same file again: refused (imported once).
    expect(await a.startImport(f.start)).toEqual({ ok: false, error: 'You imported this file already. Delete that import’s drafts to import it again.' })
  })

  it('leaves products already in the shop as they are, records what to fix, and staff never write a cost', async () => {
    state.tenantId = await shop('kept'); state.role = 'staff'
    const [p] = await su!`insert into products (tenant_id, handle, title) values (${state.tenantId}, 'old-kurta', 'Old kurta') returning id`
    await su!`insert into variants (tenant_id, product_id, option_values, price, sku) values (${state.tenantId}, ${p!.id}, '{}', 999, 'imp-1-m')`
    const f = file(HEAD + rowsOf(3) + '\nBroken,S,"Rs 1,2,99",1,BRK,1', { costs: false })
    const r = await run(f)
    expect(r).toMatchObject({ ok: true, last: { added: 2, inShop: 1, leftOut: 1 } })
    expect((await su!`select price::int from variants where product_id = ${p!.id}`).map((v) => v.price)).toEqual([999])
    expect((await su!`select count(*)::int n from variants v join products p on p.id = v.product_id where p.tenant_id = ${state.tenantId} and v.unit_cost is not null`)[0]!.n).toBe(0)
    if (!r.ok) throw new Error(r.error)
    const rows = await su!`select n, errors, product_id from import_rows where job_id = ${r.jobId} order by n`
    expect(rows.map((x) => [x.n, x.errors, x.product_id !== null])).toEqual([
      [2, null, true], [3, null, false], [4, null, true], [5, [{ column: 'Price', message: '"Rs 1,2,99" isn\'t a price' }], false],
    ])
  })

  it('deletes a job\'s drafts but keeps a published one and an ordered one; publishes only what is ready', async () => {
    state.tenantId = await shop('drafts'); state.role = 'owner'
    const r = await run(file(HEAD + rowsOf(4)))
    if (!r.ok) throw new Error(r.error)
    const ps = await su!`select id, handle from products where tenant_id = ${state.tenantId} order by handle`
    const [k0, k1, k2] = ps.map((x) => x.id as string) as [string, string, string, string]
    // Kurta 2 is ready (a photo, a size chart for its type); Publish the N ready makes it live, and only it.
    await su!`insert into product_images (tenant_id, product_id, base, widths, width, height) values (${state.tenantId}, ${k2}, ${'https://x.public.blob.vercel-storage.com/tenants/' + state.tenantId + '/products/k2'}, '{400}', 4, 5)`
    const outcome = await page.importPage(state.tenantId, 'owner', new Date())
    expect(outcome.latest?.outcome).toEqual({ drafts: 4, needPhotos: 3, needGst: 0, ready: [k2] })
    expect(await a.publishImportReady(r.jobId)).toEqual({ ok: true, published: 1 })
    expect((await su!`select status, published_at from products where id = ${k2}`)[0]).toMatchObject({ status: 'active', published_at: expect.any(Date) })
    // Publish (the editor's) reads the same readiness: a draft with no photo is refused in the same words.
    const { setStatus } = await import('@/app/(console)/console/products/actions')
    expect(await setStatus(k1!, 'active')).toEqual({ ok: false, error: 'Before shoppers can see it: at least one photo.' })
    // Kurta 0 was published by hand; kurta 1 has an order.
    await su!`update products set status = 'active', published_at = now() where id = ${k0}`
    const [v1] = await su!`select id from variants where product_id = ${k1} limit 1`
    const [o] = await su!`insert into orders (tenant_id, number, payment_method, placed_at) values (${state.tenantId}, ${Math.floor(Math.random() * 900_000) + 1}, 'cod', now()) returning id`
    await su!`insert into order_lines (tenant_id, order_id, variant_id, title, qty, unit_price, taxable_value, kind) values (${state.tenantId}, ${o!.id}, ${v1!.id}, 'K', 1, 129900, 123714, 'in_stock')`
    const del = await a.deleteImportDrafts(r.jobId)
    expect(del).toEqual({ ok: true, deleted: 1, kept: 3 }) // kurta 3 goes; 0 published, 1 ordered, 2 live
    const left = (await su!`select id from products where tenant_id = ${state.tenantId}`).map((x) => x.id)
    expect(left.sort()).toEqual([k0, k1, k2].sort())
    expect((await su!`select file_hash, drafts_deleted_at from import_jobs where id = ${r.jobId}`)[0]).toMatchObject({ file_hash: null })
  })

  it('another shop\'s job is invisible to every action', async () => {
    state.tenantId = await shop('mine'); state.role = 'owner'
    const f = file(HEAD + rowsOf(2))
    const s = await a.startImport(f.start)
    if (!s.ok) throw new Error(s.error)
    state.tenantId = await shop('other')
    expect(await a.importChunk({ jobId: s.jobId, n: 0, rows: f.chunks[0] })).toEqual({ ok: false, error: 'This import is not in your shop.' })
    expect(await a.stopImport(s.jobId)).toEqual({ ok: false, error: 'That import has already ended.' })
    expect(await a.deleteImportDrafts(s.jobId)).toEqual({ ok: false, error: 'That import is not in your shop.' })
    expect(await a.publishImportReady(s.jobId)).toEqual({ ok: true, published: 0 })
    const other = await page.importPage(state.tenantId, 'owner', new Date())
    expect([other.running, other.history]).toEqual([null, []])
    expect((await su!`select finished_at from import_jobs where id = ${s.jobId}`)[0]!.finished_at).toBeNull()
  })

  it('refuses a chunk over 512 kB, and a chunk with a field the call made up', async () => {
    state.tenantId = await shop('size'); state.role = 'owner'
    const f = file(HEAD + rowsOf(1))
    const s = await a.startImport(f.start)
    if (!s.ok) throw new Error(s.error)
    expect(await a.importChunk({ jobId: s.jobId, n: 0, rows: [{ n: 2, cells: ['x'.repeat(19_000)] }], pad: 'y'.repeat(600 * 1024) })).toEqual({ ok: false, error: 'This part of the file is too large. Choose the file again.' })
    expect(await a.importChunk({ jobId: s.jobId, n: 0, rows: f.chunks[0], tenantId: 'x' })).toEqual({ ok: false, error: 'This part of the file did not come through. Choose the file again.' })
    expect(await a.stopImport(s.jobId)).toEqual({ ok: true })
  })
})
