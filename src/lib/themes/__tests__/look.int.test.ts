// The look's state changes (src/lib/themes/look.ts) on a real Postgres, tenant A of the proof, as frata_app.
// Skipped unless INT_DB_HOST is set (CI). It commits (withTenant is its own transaction); it only adds revisions and
// publishes to A's look, which no other test reads. Impact review 2026-11-08: every refusal, the lazy baseline,
// Undo keeping the draft, Customize sharing a draft, Discard, and "at most one unpublished revision".
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const who = { userId: '22222222-2222-2222-2222-222222222222', email: 'riya@example.in' }
const look = (style: string) => ({ themeKey: 'bazaar', themeVersion: '1.0.0', styleKey: style, settings: { settings: {} } })
const baseline = () => ({ themeKey: 'classic', themeVersion: '1.0.0', styleKey: 'oxide', settings: { settings: { pairing: 'fraunces' } } })

describe.skipIf(!host)('a shop’s look: drafts, saves, publishes, undo, discard', () => {
  it('holds every rule', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const L = await import('@/lib/themes/look')
    const { shopThemeRevisions, shopThemePublishes } = await import('@/lib/db/schema-themes')
    const { eq, notExists, and, sql } = await import('drizzle-orm')
    const run = <T,>(f: (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) => Promise<T>) => withTenant(A, f)
    const unpublished = () => run(async (tx) => (await tx.select({ id: shopThemeRevisions.id }).from(shopThemeRevisions).where(and(eq(shopThemeRevisions.tenantId, A),
      notExists(tx.select({ x: sql`1` }).from(shopThemePublishes).where(and(eq(shopThemePublishes.tenantId, A), eq(shopThemePublishes.revisionId, shopThemeRevisions.id))))))).length)

    // Start clean: no open draft.
    await run((tx) => L.discardDraft(tx, A))
    const before = await run((tx) => L.lookFor(tx, A))

    // A new draft; a second one replaces it (the first is gone): never two unpublished revisions.
    const d1 = await run((tx) => L.newDraft(tx, A, who, look('genda')))
    const d2 = await run((tx) => L.newDraft(tx, A, who, look('neel')))
    expect(await unpublished()).toBe(1)
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d1.id, version: 1, styleKey: 'genda', settings: {} }))).toEqual({ ok: false, why: 'gone' })
    // Customize (reuse) keeps the open draft.
    expect((await run((tx) => L.newDraft(tx, A, who, look('genda'), { reuse: true }))).id).toBe(d2.id)

    // Saves only from the version held.
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d2.id, version: 1, styleKey: 'neel', settings: { settings: { corners: 'round' } } }))).toEqual({ ok: true, version: 2 })
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d2.id, version: 1, styleKey: 'neel', settings: {} }))).toEqual({ ok: false, why: 'stale' })

    // TS0b (architecture review 5): a layer at the save's ceiling, in Hindi, fits the database's 64 kB check.
    const { MAX_LAYER_BYTES, layerBytes, layerTooLong } = await import('@/domains/themes/layer')
    const hindi = (n: number) => 'क'.repeat(n)
    const base = { home: [{ id: 'd', key: 'design', design: 'size-help', fill: { intro: { kind: 'text', body: [[{ text: hindi(600) }]] } } }], pad: '' }
    const big = { ...base, pad: hindi(Math.floor((MAX_LAYER_BYTES - layerBytes(base)) / 3)) }
    expect(layerTooLong(big)).toBe(false)
    expect(layerBytes(big)).toBeGreaterThan(MAX_LAYER_BYTES - 3)
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d2.id, version: 2, styleKey: 'neel', settings: big }))).toEqual({ ok: true, version: 3 })
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d2.id, version: 3, styleKey: 'neel', settings: { settings: { corners: 'round' } } }))).toEqual({ ok: true, version: 4 })

    // Publish only what the dialog listed; the first publish records the look before it (lazy baseline).
    expect(await run((tx) => L.publishRevision(tx, A, who, { revisionId: d2.id, version: 1, baseline }))).toBe('stale')
    expect(await run((tx) => L.publishRevision(tx, A, who, { revisionId: d2.id, version: 4, baseline }))).toBe('ok')
    const after = await run((tx) => L.lookFor(tx, A))
    expect(after.live?.revision.id).toBe(d2.id)
    expect(after.draft).toBeNull()
    expect(after.history.length).toBe(before.history.length + (before.live ? 1 : 2))
    expect(after.previous).not.toBeNull()
    expect(after.live?.publishedBy).toBe(who.userId)

    // A published look is frozen: a save says so.
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d2.id, version: 4, styleKey: 'neel', settings: {} }))).toEqual({ ok: false, why: 'published' })

    // Undo, only from the live look seen; it keeps the open draft.
    const d3 = await run((tx) => L.newDraft(tx, A, who, look('genda')))
    expect(await run((tx) => L.undoPublish(tx, A, who, d3.id))).toBe('moved')
    const back = await run((tx) => L.undoPublish(tx, A, who, d2.id))
    expect(typeof back === 'object' && back.id).toBe(after.previous!.id)
    const undone = await run((tx) => L.lookFor(tx, A))
    expect(undone.live?.revision.id).toBe(after.previous!.id)
    expect(undone.draft?.id).toBe(d3.id)
    expect(await unpublished()).toBe(1)

    // The live look the shop reads is the same one.
    expect((await run((tx) => L.liveRevision(tx, A)))?.id).toBe(after.previous!.id)

    // Discard deletes the open draft only; a second Discard has nothing to do.
    expect(await run((tx) => L.discardDraft(tx, A))).toBe(true)
    expect(await run((tx) => L.discardDraft(tx, A))).toBe(false)
    expect(await unpublished()).toBe(0)
    // Another shop's id, or a non-uuid, reads as missing.
    expect(await run((tx) => L.revisionOf(tx, A, '-'.repeat(36)))).toBeNull()
  })
})
