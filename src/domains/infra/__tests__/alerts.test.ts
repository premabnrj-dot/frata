import { describe, expect, it } from 'vitest'
import { countFor, supabaseAlerts, type DbHealth } from '../alerts'

const calm: DbHealth = {
  dbBytes: 19 * 1024 * 1024, maxConnections: 60, cacheHit: 99.99,
  connections: [{ role: 'frata_app', open: 9, busy: 1 }, { role: 'other', open: 6, busy: 0 }],
  outboxWaiting: 3, outboxOldestS: 40, outboxDeadToday: 0, webhooksWaiting: 0, tables: [], queries: [{ shape: 'select ?', calls: 10, meanMs: 3, totalMs: 30 }],
}

describe('supabaseAlerts', () => {
  it('a calm database on Pro needs nothing', () => {
    expect(supabaseAlerts(calm, 'pro')).toEqual([])
  })
  it('on Free, the plan itself is a soon', () => {
    const a = supabaseAlerts(calm, 'free')
    expect(a.map((x) => x.key)).toEqual(['db.free_plan'])
    expect(a[0]!.level).toBe('soon')
  })
  it('connections over 80% are now', () => {
    const a = supabaseAlerts({ ...calm, connections: [{ role: 'frata_app', open: 49, busy: 30 }] }, 'pro')
    expect(a).toEqual([expect.objectContaining({ key: 'db.connections', level: 'now', title: 'Connections at 49 of 60' })])
  })
  it('disk: soon over 80%, now over 95% of the plan', () => {
    expect(supabaseAlerts({ ...calm, dbBytes: 410 * 1024 * 1024 }, 'free').find((x) => x.key === 'db.disk')).toMatchObject({ level: 'soon', title: 'Database at 410 MB of 500 MB' })
    expect(supabaseAlerts({ ...calm, dbBytes: 480 * 1024 * 1024 }, 'free').find((x) => x.key === 'db.disk')?.level).toBe('now')
    expect(supabaseAlerts({ ...calm, dbBytes: 410 * 1024 * 1024 }, 'pro').find((x) => x.key === 'db.disk')).toBeUndefined()
  })
  it('the outbox: waiting over 10 minutes is now; a call that gave up today is soon', () => {
    const a = supabaseAlerts({ ...calm, outboxOldestS: 900, outboxWaiting: 12, outboxDeadToday: 1 }, 'pro')
    expect(a.find((x) => x.key === 'db.outbox')).toMatchObject({ level: 'now', title: 'Outbox waiting 15 minutes', why: '12 messages, payments or courier calls behind' })
    expect(a.find((x) => x.key === 'db.outbox_dead')?.title).toBe('1 outbox call gave up today')
  })
  it('a query over 1 s on average, and a webhook backlog', () => {
    const a = supabaseAlerts({ ...calm, queries: [{ shape: 'select * from orders', calls: 4, meanMs: 1500, totalMs: 6000 }], webhooksWaiting: 51 }, 'pro')
    expect(a.find((x) => x.key === 'db.slow_query')?.title).toBe('A query takes 1.5 s on average')
    expect(a.find((x) => x.key === 'db.webhooks')?.level).toBe('soon')
    expect(countFor(a, 'supabase')).toBe(2)
    expect(countFor(a, 'vercel')).toBe(0)
  })
})
