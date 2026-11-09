import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: () => ({}) }))
const { fromRaw } = await import('../index')

describe('fromRaw', () => {
  it('a claimed row reaches the sender as the table names it in code (tenantId, not tenant_id)', () => {
    const r = fromRaw({ id: 'o1', tenant_id: 't1', kind: 'mux.asset.delete', dedupe_key: 'k', payload: { videoId: 'v' }, attempts: 1,
      next_attempt_at: '2026-11-09T10:00:00Z', sent_at: null, dead_at: null, last_error: null, created_at: '2026-11-09T09:00:00Z' })
    expect(r).toMatchObject({ id: 'o1', tenantId: 't1', dedupeKey: 'k', payload: { videoId: 'v' }, attempts: 1, sentAt: null, deadAt: null })
    expect(r.nextAttemptAt).toBeInstanceOf(Date)
  })
})
