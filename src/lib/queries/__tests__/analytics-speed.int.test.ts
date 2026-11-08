// Analytics at 10× (plan A1·5, frata-architecture § Speed): the page's read for 7, 30 and 90 days and a source page,
// against scripts/verify/seed-10x.sql in a throwaway frata_speed database. Skipped unless SPEED is set. Budget: the
// page under 1 s; measured 2026-11-08 after the A1·7 reviews (one snapshot transaction per page; a source page reuses the
// grouped rows, skips pincodes and fences its list read) at 267–320 / 453–490 / 708 ms, and 606–729 ms for a source page.
import { expect, it } from 'vitest'
it.skipIf(!process.env.SPEED)('analytics at 10×', { timeout: 60_000 }, async () => {
  process.env.DATABASE_URL = `postgresql://frata_app:x@${process.env.INT_DB_HOST}/frata_speed`
  const q = await import('@/lib/queries/analytics')
  const T = 'aaaaaaaa-0000-0000-0000-000000000001'
  for (const p of [7, 30, 90] as const) {
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now()
      const { a } = await q.analyticsPage(T, 'owner', p)
      const ms = Math.round(performance.now() - t0)
      if (i === 2) { console.log(`period ${p}: ${ms} ms · ${a.cur.orders} orders · ${a.sources.length} sources · ${a.pincodes.length} pincodes`); expect(ms).toBeLessThan(1000) }
    }
  }
  const { a: s } = await q.analyticsPage(T, 'owner', 30)
  // The biggest source, and a creator (the review saw a creator's page the slowest).
  for (const slug of [s.sources[0]!.slug, s.sources.find((x) => x.channel === 'creator')?.slug].filter((x): x is string => !!x)) {
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now(); const sp = await q.sourcePage(T, 'owner', 30, slug)
      const ms = Math.round(performance.now() - t0)
      if (i === 2) { console.log(`source page ${slug}: ${ms} ms · ${sp?.orders.length} orders`); expect(ms).toBeLessThan(1000) }
    }
  }
})
