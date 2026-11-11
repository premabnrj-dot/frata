// TS1b (impact review): a design's one loop on a real Postgres, tenant A of the proof, as frata_app. Skipped unless
// INT_DB_HOST is set (CI). The save keeps a design section's video only when it is this shop's (cleanVideos); the
// draft holds it, so the release at publish or discard leaves it; once the design drops it, the release frees it.
// It commits (withTenant is its own transaction) and leaves A's look with no open draft.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'
const B_VIDEO = 'dededede-0000-0000-0000-00000000000c'
const who = { userId: '22222222-2222-2222-2222-222222222222', email: 'riya@example.in' }

describe.skipIf(!host)('a design\'s loop: kept, held and freed', () => {
  it('holds every rule', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { withTenant } = await import('@/lib/db/tenant')
    const L = await import('@/lib/themes/look')
    const V = await import('@/lib/queries/videos')
    const { videos } = await import('@/lib/db/schema-themes')
    const { and, eq, sql } = await import('drizzle-orm')
    const run = <T,>(f: (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) => Promise<T>) => withTenant(A, f)
    await run((tx) => L.discardDraft(tx, A))
    const [row] = await run((tx) => tx.execute<{ id: string }>(sql`insert into videos (tenant_id, mux_env, created_by) values (${A}, 'prod1', ${who.userId}) returning id`)) as unknown as { id: string }[]
    const id = row!.id
    const bench = (video?: string) => ({ id: 'bench', key: 'design', design: 'behind-the-bench', ...(video ? { video: { id: video } } : {}) })
    const removed = async () => (await run((tx) => tx.select({ r: videos.removedAt }).from(videos).where(and(eq(videos.tenantId, A), eq(videos.id, id)))))[0]?.r ?? null
    // Past the 2-hour window a fresh upload is left alone in.
    const later = new Date(Date.now() + 3 * 3_600_000)

    // The save's check: this shop's video stays on the design; another shop's is dropped.
    const kept = await run((tx) => V.cleanVideos(tx, A, { home: [bench(id), { ...bench(B_VIDEO), id: 'other' }] }))
    expect((kept.home as { video?: { id: string } }[]).map((s) => s.video?.id ?? null)).toEqual([id, null])

    // In the open draft: the release leaves it.
    const d = await run((tx) => L.newDraft(tx, A, who, { themeKey: 'signal', themeVersion: '1.5.0', styleKey: 'cobalt', settings: { home: kept.home } }))
    await run((tx) => V.releaseUnusedVideos(tx, A, later))
    expect(await removed()).toBeNull()

    // The design drops it (the owner removed the video): the next release frees it.
    expect(await run((tx) => L.saveDraft(tx, A, who, { revisionId: d.id, version: 1, styleKey: 'cobalt', settings: { home: [bench()] } }))).toEqual({ ok: true, version: 2 })
    await run((tx) => V.releaseUnusedVideos(tx, A, later))
    expect(await removed()).not.toBeNull()
    await run((tx) => L.discardDraft(tx, A))
  })
})
