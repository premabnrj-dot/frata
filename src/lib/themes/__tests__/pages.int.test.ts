// TS1a: a shop's pages publish with the look, Undo brings them back (twice brings them forward again), Discard puts the
// drafts back, and a page edited elsewhere refuses the Publish. Real Postgres, tenant A of the proof, as frata_app.
// Skipped unless INT_DB_HOST is set (CI). Commits; touches only A's look and pages.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const who = { userId: '22222222-2222-2222-2222-222222222222', email: 'riya@example.in' }
const look = { themeKey: 'bazaar', themeVersion: '1.0.0', styleKey: 'genda', settings: { settings: {} } }
const baseline = () => ({ themeKey: 'classic', themeVersion: '1.0.0', styleKey: 'oxide', settings: { settings: { pairing: 'fraunces' } } })

describe.skipIf(!host)('a shop’s pages ride the look’s Publish, Undo and Discard', () => {
  it('holds every rule', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const L = await import('@/lib/themes/look')
    const P = await import('@/lib/themes/pages')
    const { shopPages } = await import('@/lib/db/schema-themes')
    const { eq, and } = await import('drizzle-orm')
    const run = <T,>(f: (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) => Promise<T>) => withTenant(A, f)
    const page = (id: string) => run(async (tx) => (await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, id))))[0]!)
    const publish = async (pages?: Record<string, number>) => {
      const d = await run((tx) => L.newDraft(tx, A, who, look, { reuse: true }))
      return run((tx) => L.publishRevision(tx, A, who, { revisionId: d.id, version: d.version, baseline, pages }))
    }
    await run(async (tx) => { await L.discardDraft(tx, A); await tx.delete(shopPages).where(eq(shopPages.tenantId, A)) })

    // A new page: nothing live until Publish.
    const draft = { title: 'Our story', handle: 'our-story', fill: { story: { kind: 'text', body: [[{ text: 'Two looms in 2019.' }]] } }, hidden: false }
    const [p] = await run((tx) => tx.insert(shopPages).values({ tenantId: A, template: 'about', draft }).returning())
    expect((await page(p!.id)).live).toBeNull()
    // Publish: a version the editor doesn't hold refuses; the right one makes it live under that publish.
    expect(await publish({ [p!.id]: 99 })).toBe('stale')
    expect(await publish({ [p!.id]: 1 })).toBe('ok')
    const live1 = await page(p!.id)
    expect(live1.live).toEqual({ title: 'Our story', handle: 'our-story', fill: draft.fill })
    expect(live1.livePublishId).not.toBeNull()

    // A new title, then Publish; Undo brings the old title back; a second Undo brings the new one forward again.
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, title: 'How we weave' }, version: 2 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    expect(await publish({ [p!.id]: 2 })).toBe('ok')
    expect(((await page(p!.id)).live as { title: string }).title).toBe('How we weave')
    const liveId = async () => (await run((tx) => L.lookFor(tx, A))).live!.revision.id
    expect(await run(async (tx) => L.undoPublish(tx, A, who, await liveId()))).not.toBe('none')
    expect(((await page(p!.id)).live as { title: string }).title).toBe('Our story')
    expect(await run(async (tx) => L.undoPublish(tx, A, who, await liveId()))).not.toBe('none')
    expect(((await page(p!.id)).live as { title: string }).title).toBe('How we weave')

    // An untouched page isn't republished: its live_publish_id stays (jsonb's key order is no change: impact review).
    const before = (await page(p!.id)).livePublishId
    expect(await publish({ [p!.id]: (await page(p!.id)).version })).toBe('ok')
    expect((await page(p!.id)).livePublishId).toBe(before)
    // The draft follows Undo: after an Undo the next Publish doesn't put the undone words back.
    const v1 = (await page(p!.id)).version
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, title: 'Undone title' }, version: v1 + 1 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    expect(await publish({ [p!.id]: v1 + 1 })).toBe('ok')
    expect(await run(async (tx) => L.undoPublish(tx, A, who, await liveId()))).not.toBe('none')
    const afterUndo = await page(p!.id)
    expect((afterUndo.draft as { title: string }).title).toBe('How we weave')
    expect(await publish({ [p!.id]: afterUndo.version })).toBe('ok')
    expect(((await page(p!.id)).live as { title: string }).title).toBe('How we weave')
    // A draft that no longer parses leaves the live page as it is.
    const vv = (await page(p!.id)).version
    await run((tx) => tx.update(shopPages).set({ draft: { handle: 'our-story', title: '<bad>', fill: {} }, version: vv + 1 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    expect(await publish({ [p!.id]: vv + 1 })).toBe('ok')
    expect(((await page(p!.id)).live as { title: string }).title).toBe('How we weave')
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, title: 'How we weave' }, version: vv + 2 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))

    // Discard puts an edited live page's draft back to what is live.
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, title: 'Not kept' }, version: vv + 3 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    await run((tx) => L.newDraft(tx, A, who, look, { reuse: true }))
    await run((tx) => L.discardDraft(tx, A))
    expect(((await page(p!.id)).draft as { title: string }).title).toBe('How we weave')

    // Hidden at Publish: nothing live; the words stay in the draft.
    const vh = (await page(p!.id)).version
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, title: 'How we weave', hidden: true }, version: vh + 1 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    expect(await publish({ [p!.id]: vh + 1 })).toBe('ok')
    expect((await page(p!.id)).live).toBeNull()

    // Discard: a draft edit goes back to live; a page never published goes.
    const [q] = await run((tx) => tx.insert(shopPages).values({ tenantId: A, template: 'faq', draft: { title: 'FAQ', handle: 'faq', fill: {}, hidden: false } }).returning())
    await run((tx) => L.newDraft(tx, A, who, look, { reuse: true }))
    await run((tx) => L.discardDraft(tx, A))
    expect(await run(async (tx) => (await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, q!.id)))).length)).toBe(0)

    // Removed at Publish; the next Publish deletes the row for good.
    const vr = (await page(p!.id)).version
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, hidden: false }, version: vr + 1 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    expect(await publish({ [p!.id]: vr + 1 })).toBe('ok')
    await run((tx) => tx.update(shopPages).set({ draft: { ...draft, removed: true }, version: vr + 2 }).where(and(eq(shopPages.tenantId, A), eq(shopPages.id, p!.id))))
    expect(await publish({ [p!.id]: vr + 2 })).toBe('ok')
    const removed = await page(p!.id)
    expect(removed.live).toBeNull(); expect(removed.removedAt).not.toBeNull()
    expect(await publish({})).toBe('ok')
    expect(await run(async (tx) => (await tx.select().from(shopPages).where(eq(shopPages.tenantId, A))).length)).toBe(0)
    expect(P.MAX_LIVE_BYTES).toBe(64_000)
  })
})
