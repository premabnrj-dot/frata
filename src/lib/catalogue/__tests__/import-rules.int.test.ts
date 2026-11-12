// The import's harder edges on a real Postgres (impact and security reviews of PI·1, 2026-11-12):
// - a file read in two chunks writes exactly what its Check said (a name's address and a SKU repeated across chunks);
// - photo files: which bases photosInUse keeps (a look, another product's story, a page — never the deleted draft's own
//   story), and deleting drafts sends Blob only the unused files;
// - refusals: the daily limit, a product in two parts, a part that doesn't match its columns, a product writeProducts
//   refuses (left out with its words, the rest written), a SKU taken in another case between check and write (the
//   save's and the import's words), deleting a running job's drafts (it ends, its cells go);
// - a support visit: the job names the visit, not the staff email, and the audit row is written with it.
// The sign-in is faked; the shops are throwaway ones made through ADMIN_URL and removed after. Skipped unless INT_DB_HOST.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
import { compactMapping } from '@/domains/catalogue/import/limits'
import { dropShops, file, HEAD, LONG_HEAD, longRow, makeShop, rowsOf } from './import-helpers'

const state = vi.hoisted(() => ({ tenantId: '', support: null as string | null }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: '99999999-9999-4999-8999-999999999999', email: state.support ? 'staff@frata.test' : 'int@example.com', staffRole: null, all: [],
    membership: { tenantId: state.tenantId, tenantName: 'Int import', role: 'owner', supportSessionId: state.support } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (f: unknown) => f }))
const blob = vi.hoisted(() => ({ deleted: [] as string[] }))
vi.mock('@vercel/blob', () => ({ del: async (urls: string[]) => { blob.deleted.push(...urls) } }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const EAN = '4006381333931'
const STORE = 'inttest.public.blob.vercel-storage.com'

describe.skipIf(!host)('importing a file: the harder edges', () => {
  const su = host ? postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} }) : null
  let a: typeof import('@/app/(console)/console/products/import/actions')
  const shops: string[] = []
  const shop = (name: string) => makeShop(su!, shops, name)
  const checkAll = async (f: ReturnType<typeof file>) => {
    const out = { states: [] as string[], problems: [] as string[] }
    let seen = { skus: [] as [string, number][], gtins: [] as [string, number][] }
    for (const rows of f.chunks) {
      const r = await a.checkImport({ mapping: compactMapping(f.mapping), rows, seen })
      if (!r.ok) throw new Error(r.error)
      out.states.push(...r.products.map((p) => p.state)); out.problems.push(...r.problems.map((p) => `${p.row} ${p.message}`)); seen = r.seen
    }
    return out
  }
  const run = async (f: ReturnType<typeof file>) => {
    const s = await a.startImport(f.start)
    if (!s.ok) throw new Error(s.error)
    let last = null
    for (let n = 0; n < f.chunks.length; n++) { last = await a.importChunk({ jobId: s.jobId, n, rows: f.chunks[n] }); if (!last.ok) throw new Error(last.error) }
    return { jobId: s.jobId, last: last! }
  }

  beforeAll(async () => {
    if (!su) return
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_int_test'
    process.env.BLOB_STORE_ID = 'store_inttest'
    a = await import('@/app/(console)/console/products/import/actions')
  })
  afterAll(async () => {
    if (!su) return
    await dropShops(su, shops)
    await su.end()
  })

  it('writes what the Check said when an address and a SKU repeat across two chunks', async () => {
    state.tenantId = await shop('agree'); state.support = null
    const rows = Array.from({ length: 120 }, (_, i) => longRow(`Saree ${i}`, `SR-${i}`))
    rows[1] = longRow('Silk saree', 'DUP-1')
    rows[118] = longRow('Silk  Saree!', 'SR-118') // a different product, the same address
    rows[119] = longRow('Cotton saree', 'dup-1') // the first chunk's SKU, in another case
    const f = file(LONG_HEAD + rows.join('\n'))
    expect(f.chunks.length).toBe(2)
    const check = await checkAll(f)
    expect(check.problems).toEqual(['121 dup-1 is also on row 3'])
    const counts = { new: check.states.filter((x) => x === 'new').length, left: check.states.filter((x) => x === 'left_out').length, shop: check.states.filter((x) => x === 'in_shop').length }
    expect(counts).toEqual({ new: 119, left: 1, shop: 0 })
    const done = await run(f)
    expect(done.last).toMatchObject({ added: counts.new, leftOut: counts.left, inShop: counts.shop })
    expect((await su!`select handle from products where tenant_id = ${state.tenantId} and title like 'Silk%' order by handle`).map((r) => r.handle)).toEqual(['silk-saree', 'silk-saree-2'])
    expect((await su!`select errors from import_rows where job_id = ${done.jobId} and n = 121`)[0]!.errors).toEqual([{ column: 'SKU', message: 'dup-1 is also on row 3' }])
  })

  it('keeps the files a look, another product\'s story or a page still shows; Blob deletes only the rest', async () => {
    const t = state.tenantId = await shop('photos'); state.support = null
    const { jobId } = await run(file(HEAD + rowsOf(1)))
    const [draft] = await su!`select id from products where tenant_id = ${t}`
    const base = (k: number) => `https://${STORE}/tenants/${t}/products/${'0000000' + k}-0000-4000-8000-000000000000`
    const [inLook, inStory, inPage, ownStory, unused] = [1, 2, 3, 4, 5].map(base) as [string, string, string, string, string]
    await su!`insert into product_images (tenant_id, product_id, base, widths, width, height)
      select ${t}, ${draft!.id}, b, '{400,800}', 4, 5 from unnest(${[inLook, inStory, inPage, ownStory, unused]}::text[]) b`
    await su!`update products set stories = ${su!.json([{ title: 'Own', image: ownStory }])} where id = ${draft!.id}`
    await su!`insert into products (tenant_id, handle, title, stories) values (${t}, 'other-piece', 'Other', ${su!.json([{ title: 'Story', image: inStory }])})`
    await su!`insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by)
      values (${t}, 'classic', '1.0.0', 'classic', ${su!.json({ hero: { image: inLook } })}, ${t}, ${t})`
    await su!.begin(async (x) => {
      await x`select set_config('app.tenant_id', ${t}, true)`
      await x`insert into shop_pages (tenant_id, template, draft) values (${t}, 'about', ${x.json({ handle: 'our-story', title: 'Our story', fill: { photo: inPage } })})`
    })
    const { withTenant } = await import('@/lib/db/tenant')
    const { photosInUse } = await import('@/lib/catalogue/photos-in-use')
    const all = [inLook, inStory, inPage, ownStory, unused]
    expect([...await withTenant(t, (tx) => photosInUse(tx, t, all, [draft!.id]))].sort()).toEqual([inLook, inStory, inPage].sort())
    expect([...await withTenant(t, (tx) => photosInUse(tx, t, all))].sort()).toEqual([inLook, inStory, inPage, ownStory].sort())
    blob.deleted = []
    expect(await a.deleteImportDrafts(jobId)).toEqual({ ok: true, deleted: 1, kept: 0 })
    expect(blob.deleted.sort()).toEqual([`${ownStory}-400.webp`, `${ownStory}-800.webp`, `${unused}-400.webp`, `${unused}-800.webp`].sort())
  })

  it('refuses past the daily limit, a product in two parts, and a part that doesn\'t match its columns', async () => {
    const t = state.tenantId = await shop('refusals'); state.support = null
    await su!`insert into import_jobs (tenant_id, file_name, file_hash, source, mapping, chunks, next_chunk, planned, started_by, finished_at)
      select ${t}, 'f' || i || '.csv', md5(i::text) || md5(i::text), 'sheet', '{}', 1, 1, 0, ${t}, now() from generate_series(1, 10) i`
    expect(await a.startImport(file(HEAD + rowsOf(1)).start)).toEqual({ ok: false, error: 'Up to 10 imports a day. Try again tomorrow.' })
    await su!`update import_jobs set created_at = now() - interval '2 days' where tenant_id = ${t}`
    const f = file(LONG_HEAD + Array.from({ length: 120 }, (_, i) => longRow(`Saree ${i}`, `SR-${i}`)).join('\n'))
    const s = await a.startImport(f.start)
    if (!s.ok) throw new Error(s.error)
    expect(await a.importChunk({ jobId: s.jobId, n: 0, rows: f.chunks[0] })).toMatchObject({ ok: true, next: 1 })
    const wrong = f.chunks[1]!.map((r) => ({ ...r, cells: [...r.cells, 'extra'] }))
    expect(await a.importChunk({ jobId: s.jobId, n: 1, rows: wrong })).toEqual({ ok: false, error: 'This part of the file doesn’t match its columns. Choose the file again.' })
    const again = [...f.chunks[1]!, { n: 500, cells: [...f.chunks[0]![0]!.cells] }]
    expect(await a.importChunk({ jobId: s.jobId, n: 1, rows: again })).toEqual({ ok: false, error: 'Row 2\'s product came in two parts. Choose the file again.' })
    // Deleting a running job's drafts ends it and forgets its cells.
    expect(await a.deleteImportDrafts(s.jobId)).toMatchObject({ ok: true, kept: 0 })
    const [job] = await su!`select finished_at, drafts_deleted_at, file_hash from import_jobs where id = ${s.jobId}`
    expect([job!.finished_at !== null, job!.drafts_deleted_at !== null, job!.file_hash]).toEqual([true, true, null])
    expect((await su!`select count(*)::int n from import_rows where job_id = ${s.jobId} and cells is not null`)[0]!.n).toBe(0)
    expect((await su!`select count(*)::int n from products where tenant_id = ${t}`)[0]!.n).toBe(0)
  })

  it('leaves out a product writeProducts refuses, in its words, and writes the rest', async () => {
    const t = state.tenantId = await shop('writer'); state.support = null
    const [p] = await su!`insert into products (tenant_id, handle, title) values (${t}, 'old-stole', 'Old stole') returning id`
    await su!`insert into variants (tenant_id, product_id, option_values, price, sku, gtin) values (${t}, ${p!.id}, '{}', 999, 'OLD-1', ${EAN})`
    const f = file('Name,Price,Stock,SKU,Barcode\nNew stole,1299,2,NEW-1,' + EAN + '\nNew shawl,1499,2,NEW-2,')
    const { jobId, last } = await run(f)
    expect(last).toMatchObject({ added: 1, leftOut: 1, inShop: 0 })
    expect((await su!`select n, errors, product_id is not null as made from import_rows where job_id = ${jobId} order by n`).map((r) => [r.n, r.errors, r.made]))
      .toEqual([[2, [{ column: '', message: `Barcode ${EAN} is already on another product in your shop.` }], false], [3, null, true]])
  })

  it('a SKU taken in another case between the check and the write is told in words, by the import and by the editor', async () => {
    const t = state.tenantId = await shop('race'); state.support = null
    const [other] = await su!`insert into products (tenant_id, handle, title) values (${t}, 'other', 'Other') returning id`
    const [mine] = await su!`insert into products (tenant_id, handle, title, options, option_values) values (${t}, 'mine', 'Int mine', '{Size}', '[["M"]]') returning id`
    await su!`insert into variants (tenant_id, product_id, option_values, price) values (${t}, ${mine!.id}, '{M}', 0)`
    // Another save lands first: a trigger writes "race-1" on another product just before the insert of "RACE-1".
    await su!.unsafe(`create or replace function int_race_${t.replace(/-/g, '')}() returns trigger language plpgsql as $$ begin
      if new.sku = 'RACE-1' and new.tenant_id = '${t}' then
        insert into variants (tenant_id, product_id, option_values, price, sku) values (new.tenant_id, '${other!.id}', '{X}', 1, 'race-1');
      end if; return new; end $$`)
    await su!.unsafe(`create trigger int_race_${t.replace(/-/g, '')} before insert on variants for each row execute function int_race_${t.replace(/-/g, '')}()`)
    try {
      expect((await run(file('Name,Price,Stock,SKU\nRacer,1299,2,RACE-1')).catch((e: Error) => e.message))).toBe('A SKU in this part was just taken by another product. Choose the file again.')
      const { saveProduct } = await import('@/app/(console)/console/products/actions')
      const cell = (values: string[], sku = '') => ({ values, price: '1299', compareAt: '', cost: '', stock: '1', sku, gtin: '' })
      expect(await saveProduct(mine!.id, 1, { title: 'Int mine', description: '', typeId: null, modelHeight: '', modelSize: '', handle: 'mine',
        options: [{ name: 'Size', values: ['M', 'L'] }], variants: [cell(['M']), cell(['L'], 'RACE-1')] })).toEqual({ ok: false, error: 'A SKU is already used by another product in your shop.' })
    } finally {
      await su!.unsafe(`drop trigger int_race_${t.replace(/-/g, '')} on variants`)
      await su!.unsafe(`drop function int_race_${t.replace(/-/g, '')}()`)
    }
  })

  it('a support visit: the job names the visit, history no staff email, and the audit row is written with the start', async () => {
    const t = state.tenantId = await shop('support')
    const [visit] = await su!`insert into support_sessions (tenant_id, staff_user_id, staff_email, reason, expires_at) values (${t}, ${t}, 'staff@frata.test', 'setup_help', now() + interval '1 hour') returning id`
    state.support = visit!.id
    try {
      const { jobId } = await run(file(HEAD + rowsOf(1)))
      expect((await su!`select support_session_id, started_by_email from import_jobs where id = ${jobId}`)[0]).toEqual({ support_session_id: visit!.id, started_by_email: null })
      const audit = await su!`select action, actor_kind, target, support_session_id from audit_events where tenant_id = ${t} order by at`
      expect(audit.map((x) => [x.action, x.actor_kind, x.support_session_id])).toEqual([
        ['product.import.start', 'support', visit!.id], ['product.import.chunk', 'support', visit!.id]])
      expect(audit[1]!.target).toBe(jobId)
    } finally {
      state.support = null
    }
  })
})
