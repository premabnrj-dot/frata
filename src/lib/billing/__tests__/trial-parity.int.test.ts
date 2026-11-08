// Trials TR0 (plan § A1): the SQL twin of the trial-end rule (drizzle/0063 app_ist_day_end_after, used by
// app_trial_recompute) gives the same instant as src/domains/plans/trial.ts for every case, across IST day and month
// ends and a year end. Skipped unless INT_DB_HOST is set (a database migrated by scripts/verify/tenancy.sh).
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { endOfIstDayAfter } from '@/domains/plans/trial'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

describe.skipIf(!host)('the trial end, SQL against TypeScript', () => {
  beforeAll(() => { process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`; vi.resetModules() })
  it('agrees on every case', async () => {
    const { db } = await import('@/lib/db')
    const { sql } = await import('drizzle-orm')
    const froms = ['2026-11-12T16:00:00+05:30', '2026-11-12T00:00:00+05:30', '2026-11-12T23:59:59+05:30', '2026-10-31T18:29:59Z', '2026-12-31T22:00:00+05:30', '2027-02-27T12:00:00+05:30']
    for (const f of froms) for (const days of [0, 7, 15, 30, 45, 90, 105]) {
      const from = new Date(f)
      const [r] = await db().execute<{ e: string }>(sql`select app_ist_day_end_after(${from.toISOString()}::timestamptz, ${days}) as e`)
      expect(new Date(r!.e).getTime(), `${f} + ${days}`).toBe(endOfIstDayAfter(from, days).getTime())
    }
  })
})
