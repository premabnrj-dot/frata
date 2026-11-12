// Admin › Themes against a real Postgres with the real roles (themes T3). Skipped unless INT_DB_HOST is set (CI).
// Works on Minimal 1.0.0 (no other test uses it) for shop B of the proof. It commits.
import { beforeAll, describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '22222222-2222-2222-2222-222222222222' // shop B of the proof: the look int test works on A in parallel
const who = { userId: '22222222-2222-2222-2222-222222222222', email: 'riya@example.in' }
const staff = { ok: true as const, userId: 'aaaaaaaa-0000-0000-0000-0000000000ff', email: 'int@frata.test', role: 'admin' as const, sessionId: '00000000-0000-4000-8000-000000000000', confirmedAt: new Date() }
const baseline = () => ({ themeKey: 'classic', themeVersion: '1.0.0', styleKey: 'oxide', settings: { settings: {} } })

describe.skipIf(!host)('Admin › Themes and what shops see', () => {
  let themes: typeof import('../themes')
  let L: typeof import('@/lib/themes/look')
  let withTenant: typeof import('@/lib/db/tenant')['withTenant']
  beforeAll(async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.ADMIN_DATABASE_URL = `postgresql://frata_admin:${pass}@${host}/${dbName}`
    themes = await import('../themes')
    L = await import('@/lib/themes/look')
    ;({ withTenant } = await import('@/lib/db/tenant'))
  })

  it('recall stops new looks; withdraw moves live shops back; decisions are final; the baseline stays', async () => {
    const run = <T,>(f: Parameters<typeof withTenant<T>>[1]) => withTenant(A, f)
    const look = (style: string) => ({ themeKey: 'minimal', themeVersion: '1.0.0', styleKey: style, settings: { settings: {} } })
    await run((tx) => L.discardDraft(tx, A))
    const before = (await run((tx) => L.liveRevision(tx, A)))?.id ?? null
    // Minimal 1.0.0 is released (every version in the build was): a shop publishes it.
    const d1 = await run((tx) => L.newDraft(tx, A, who, look('ink')))
    expect(await run((tx) => L.publishRevision(tx, A, who, { revisionId: d1.id, version: 1, baseline }))).toBe('ok')
    expect((await run((tx) => L.liveRevision(tx, A)))?.id).toBe(d1.id)
    const listed = (await themes.themeVersionsForAdmin(staff)).find((v) => v.key === 'minimal' && v.version === '1.0.0')!
    expect(listed.state).toBe('released'); expect(listed.live).toBeGreaterThanOrEqual(1)

    // Recall: a new draft on it can't be published; the live look stays (and is offered back).
    const d2 = await run((tx) => L.newDraft(tx, A, who, look('ink')))
    expect(await themes.pullVersion(staff, 'minimal', '1.0.0', 'recall', 'A contrast bug on the ink scheme')).toEqual({ ok: true })
    expect(await run((tx) => L.publishRevision(tx, A, who, { revisionId: d2.id, version: 1, baseline }))).toBe('unavailable')
    expect((await run((tx) => L.liveRevision(tx, A)))?.id).toBe(d1.id)
    expect((await run((tx) => L.lookFor(tx, A))).may('minimal', '1.0.0')).toBe(false)

    // Many publishes of the same version (more than any page of history): the fallback still finds the one before.
    const { shopThemePublishes } = await import('@/lib/db/schema-themes')
    await run(async (tx) => { for (let i = 0; i < 12; i++) await tx.insert(shopThemePublishes).values({ tenantId: A, revisionId: d1.id, publishedBy: who.userId, publishedAt: new Date(Date.now() + i) }) })
    // Withdraw: the shop's live look is its previous one at once (liveOf skips the withdrawn version).
    expect(await themes.pullVersion(staff, 'minimal', '1.0.0', 'withdraw', 'A broken layout on phones')).toEqual({ ok: true })
    const now = (await run((tx) => L.liveRevision(tx, A)))?.id ?? null
    expect(now).not.toBe(d1.id)
    if (before) expect(now).toBe(before)
    // Publishing again doesn't add a second baseline (rows exist even when every version is withdrawn).
    const bases = await run(async (tx) => (await L.lookFor(tx, A)).history.filter((h) => h.revision.createdBy === L.SYSTEM).length)
    expect(bases).toBeLessThanOrEqual(1)

    // Final, and the baseline can't be pulled.
    expect((await themes.pullVersion(staff, 'minimal', '1.0.0', 'withdraw', 'again')).ok).toBe(false)
    expect((await themes.pullVersion(staff, 'classic', '1.0.0', 'recall', 'no')).ok).toBe(false)
    expect((await themes.releaseVersion(staff, 'minimal', '1.0.0')).ok).toBe(false)
    await run((tx) => L.discardDraft(tx, A))
  })

  it('stage a pilot shop, then unstage; a version not in the build is refused', async () => {
    expect(await themes.stageVersion(staff, 'editorial', '1.1.0', A)).toBe('staged')
    expect((await themes.themeVersionsForAdmin(staff)).find((v) => v.key === 'editorial' && v.version === '1.1.0')!.staged.map((s) => s.tenantId)).toContain(A)
    expect(await themes.unstageVersion(staff, 'editorial', '1.1.0', A)).toBe(true)
    expect(await themes.stageVersion(staff, 'editorial', '9.0.0', A)).toBe('not_in_code')
  })
})
