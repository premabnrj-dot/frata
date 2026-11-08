// Shop addresses D1·7: Admin's address library against a REAL Postgres (skipped unless INT_DB_HOST is set; see admin.int.test.ts).
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('Admin addresses on a real database', () => {
  let lib: typeof import('../addresses')
  let merchants: typeof import('../merchants')
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000fd', email: 'names@frata.test', role: 'admin' as const }

  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    lib = await import('../addresses')
    merchants = await import('../merchants')
    const { adminDb } = await import('@/lib/db/admin')
    const { platformStaff } = await import('@/lib/db/schema')
    await adminDb().insert(platformStaff).values({ userId: staff.userId, email: staff.email, role: 'admin' }).onConflictDoNothing()
  })

  it('renames without a redirect, holds the old name, then releases it', async () => {
    const slug = `adr-${Date.now().toString(36)}`
    const { id } = await merchants.createMerchant(staff, { name: 'Adr Store', slug, ownerEmail: 'adr@int.test', planCode: 'growth', trialEndsAt: null, now: new Date() })
    expect(await lib.adminRenameShop(staff, id, `${slug}-x`, 'Copies another brand')).toEqual({ ok: true, value: undefined })
    const a = await lib.merchantAddresses(staff, id)
    expect(a?.slug).toBe(`${slug}-x`)
    expect(a?.names.map((n) => [n.name, !!n.retiredAt, n.retiredByFrrata])).toEqual([[`${slug}-x`, false, false], [slug, true, true]])
    expect((await lib.heldNames(staff)).find((h) => h.name === slug)?.tenantId).toBe(id)
    // Its own current name changes nothing; a current name is never released.
    expect(await lib.adminRenameShop(staff, id, `${slug}-x`, 'Again')).toEqual({ ok: true, value: undefined })
    expect(await lib.releaseName(staff, `${slug}-x`, 'Current')).toEqual({ ok: false, error: 'not_retired' })
    expect(await lib.releaseName(staff, slug, 'Owner asked')).toEqual({ ok: true, value: id })
    expect(await merchants.slugTaken(staff, slug)).toBe(false)
  })

  it('freezes and unfreezes with a reason', async () => {
    const { rows } = await merchants.listMerchants(staff, { page: 1, q: 'Adr Store', now: new Date() })
    const id = rows[0]!.id
    expect(await lib.freezeAddress(staff, id, true, 'x')).toEqual({ ok: false, error: 'reason' })
    expect((await lib.freezeAddress(staff, id, true, 'Phishing report')).ok).toBe(true)
    expect((await lib.merchantAddresses(staff, id))?.frozenAt).toBeInstanceOf(Date)
    expect((await lib.freezeAddress(staff, id, false, 'Cleared')).ok).toBe(true)
    expect((await lib.merchantAddresses(staff, id))?.frozenAt).toBeNull()
  })

  it('blocks a name once, refuses it to a rename, and unblocks it', async () => {
    const name = `blk-${Date.now().toString(36)}`
    expect(await lib.blockName(staff, { name, kind: 'protected', reason: 'Trademark' })).toBe(true)
    expect(await lib.blockName(staff, { name, kind: 'protected', reason: 'Trademark' })).toBe(false)
    expect((await lib.listBlocked(staff)).some((b) => b.name === name)).toBe(true)
    const { rows } = await merchants.listMerchants(staff, { page: 1, q: 'Adr Store', now: new Date() })
    expect(await lib.adminRenameShop(staff, rows[0]!.id, name, 'Try a blocked name')).toEqual({ ok: false, error: 'slug_taken' })
    expect(await lib.unblockName(staff, name)).toBe(true)
    expect(await lib.unblockName(staff, name)).toBe(false)
  })
})
