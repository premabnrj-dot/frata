// Shop addresses D1·7: Admin's address library against a REAL Postgres (skipped unless INT_DB_HOST is set; see admin.int.test.ts).
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('Admin addresses on a real database', () => {
  let lib: typeof import('../addresses')
  let merchants: typeof import('../merchants')
  const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000fd', email: 'names@frata.test', role: 'admin' as const, sessionId: '00000000-0000-4000-8000-000000000000', confirmedAt: new Date() }
  const support = { ...staff, userId: 'aaaaaaaa-0000-0000-0000-0000000000fc', email: 'help@frata.test', role: 'support' as const }
  let n = 0
  const shop = async () => {
    const slug = `adr-${Date.now().toString(36)}-${++n}`
    const { id } = await merchants.createMerchant(staff, { name: 'Adr Store', slug, ownerEmail: `adr${n}@int.test`, planCode: 'growth', trialEndsAt: null, now: new Date() })
    return { id, slug }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    lib = await import('../addresses')
    merchants = await import('../merchants')
    const { adminDb } = await import('@/lib/db/admin')
    const { platformStaff } = await import('@/lib/db/schema')
    await adminDb().insert(platformStaff).values([{ userId: staff.userId, email: staff.email, role: 'admin' }, { userId: support.userId, email: support.email, role: 'support' }]).onConflictDoNothing()
  })

  it('renames without a redirect, holds the old name, then releases it', async () => {
    const { id, slug } = await shop()
    expect(await lib.adminRenameShop(staff, id, `${slug}-x`, 'Copies another brand')).toEqual({ ok: true, value: undefined })
    const a = await lib.merchantAddresses(staff, id)
    expect(a?.slug).toBe(`${slug}-x`)
    expect(a?.names.map((m) => [m.name, !!m.retiredAt, m.retiredByFrrata])).toEqual([[`${slug}-x`, false, false], [slug, true, true]])
    expect((await lib.heldNames(staff)).find((h) => h.name === slug)?.tenantId).toBe(id)
    expect(await lib.releaseName(staff, `${slug}-x`, 'Current')).toEqual({ ok: false, error: 'not_retired' })
    expect(await lib.releaseName(support, slug, 'Support tried')).toEqual({ ok: false, error: 'not_staff' })
    expect(await lib.releaseName(staff, slug, 'Owner asked')).toEqual({ ok: true, value: id })
    expect(await merchants.slugTaken(staff, slug)).toBe(false)
  })

  it('freezes and unfreezes with a reason', async () => {
    const { id } = await shop()
    expect(await lib.freezeAddress(staff, id, true, 'x')).toEqual({ ok: false, error: 'reason' })
    expect(await lib.freezeAddress(support, id, true, 'Support tried')).toEqual({ ok: false, error: 'not_staff' })
    expect((await lib.freezeAddress(staff, id, true, 'Phishing report')).ok).toBe(true)
    expect((await lib.merchantAddresses(staff, id))?.frozenAt).toBeInstanceOf(Date)
    expect((await lib.freezeAddress(staff, id, false, 'Cleared')).ok).toBe(true)
    expect((await lib.merchantAddresses(staff, id))?.frozenAt).toBeNull()
  })

  it('blocks a name once, refuses it to a rename, and unblocks it, each with a reason; support is refused', async () => {
    const { id } = await shop()
    const name = `blk-${Date.now().toString(36)}`
    expect(await lib.blockName(support, { name, kind: 'protected', reason: 'Trademark' })).toEqual({ ok: false, error: 'not_staff' })
    expect(await lib.blockName(staff, { name: 'Bad--Name', kind: 'protected', reason: 'Trademark' })).toEqual({ ok: false, error: 'bad_slug' })
    expect(await lib.blockName(staff, { name, kind: 'protected', reason: 'Trademark' })).toEqual({ ok: true, value: true })
    expect(await lib.blockName(staff, { name, kind: 'protected', reason: 'Trademark' })).toEqual({ ok: true, value: false })
    expect((await lib.listBlocked(staff)).find((b) => b.name === name)?.kind).toBe('protected')
    expect(await lib.adminRenameShop(staff, id, name, 'Try a blocked name')).toEqual({ ok: false, error: 'slug_taken' })
    expect(await lib.unblockName(staff, name, 'x')).toEqual({ ok: false, error: 'reason' })
    expect(await lib.unblockName(staff, name, 'Licence granted')).toEqual({ ok: true, value: true })
    expect(await lib.unblockName(staff, name, 'Licence granted')).toEqual({ ok: true, value: false })
    expect(await lib.blockName(staff, { name: 'kesar-fake.in', kind: 'domain', reason: 'Lookalike' })).toEqual({ ok: true, value: true })
  })
})
