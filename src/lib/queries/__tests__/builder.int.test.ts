// T1c (ADR-0015) on a REAL Postgres migrated by scripts/verify/tenancy.sh: a Builder's reads run as frata_builder with
// the shop and role set, read the owner list's own SQL, and a cost column is refused. Skipped unless INT_DB_HOST is set.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({ after: () => {} }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('a Builder on a real database', () => {
  let actorLib: typeof import('@/lib/db/actor')
  let builder: typeof import('../builder')
  let tenantId: string
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.DATABASE_URL_BUILDER = `postgresql://frata_builder:${pass}@${host}/${dbName}`
    actorLib = await import('@/lib/db/actor')
    builder = await import('../builder')
    const { db } = await import('@/lib/db')
    const rows = await db().execute<{ id: string }>(sql`select id from app_shop_for_name('proof-nook-1')`)
    tenantId = rows[0]?.id ?? ''
  })

  it('runs as frata_builder with the shop and the role set, read-only', async () => {
    const a = actorLib.builderActor(tenantId)
    const r = await actorLib.withActor(a, 'catalogue.read', async (tx) => (await tx.execute<{ u: string; t: string; m: string; ro: string }>(
      sql`select current_user as u, current_setting('app.tenant_id') as t, current_setting('app.member_role') as m, current_setting('transaction_read_only') as ro`))[0])
    expect(r).toEqual({ u: 'frata_builder', t: tenantId, m: 'builder', ro: 'on' })
  })

  it('reads the products list as the owner list does, and never a cost', async () => {
    const a = actorLib.builderActor(tenantId)
    const list = await builder.builderProducts(a, { filter: 'all', q: '', sort: 'edited', page: 1 })
    expect(list.rows.map((x) => x.title)).toEqual(['Nook kurta'])
    expect(list.rows[0]).not.toHaveProperty('unitCost')
    await expect(actorLib.withActor(a, 'catalogue.read', (tx) => tx.execute(sql`select unit_cost from variants`))).rejects.toThrow()
    await expect(actorLib.withActor(a, 'catalogue.read', (tx) => tx.execute(sql`select 1 from orders`))).rejects.toThrow()
    // A hand-picked collection and a rule-based one: the counts read collection_products and productFactsIn's columns.
    const cols = await builder.builderCollections(a)
    expect(cols.map((c) => [c.title, c.kind, c.count])).toEqual([['Nook all', 'auto', 1], ['Nook picks', 'manual', 1]])
  })
})
