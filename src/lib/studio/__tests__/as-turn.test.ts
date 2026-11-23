// asTurn's answers (ADR-0020 point 4; impact review of R5, H1): off when Studio is switched off; `actor` when the turn's
// person is gone before the call (the work never runs) or between the check and the write (the bind refuses, nothing is
// written); otherwise the work's value, with a write in a transaction the database bound.
import { describe, expect, it, vi } from 'vitest'

const st = { open: 'staff' as 'staff' | 'off', actor: [{ session_id: 's1' }] as unknown[], bind: [{ p: 'partner-1' }] as unknown[], sql: [] as string[] }
vi.mock('@/lib/env', () => ({ get STUDIO_OPEN() { return st.open }, isStudioConfigured: () => true }))
vi.mock('@/lib/db/actor', () => ({ builderActor: vi.fn(() => ({ kind: 'builder', role: 'builder' })) }))
vi.mock('@/lib/db/tenant', () => ({
  withTenant: vi.fn(async (_t: string, work: (tx: unknown) => Promise<unknown>) => work({
    execute: async (q: { queryChunks?: { value?: string[] }[] }) => {
      const text = (q.queryChunks ?? []).flatMap((c) => c.value ?? []).join('')
      st.sql.push(text)
      return text.includes('app_turn_actor') ? st.actor : st.bind
    },
  })),
}))
const { asTurn } = await import('../as-turn')
const turn = { tenantId: 't1', sessionId: 's1', turnId: 'u1' }

describe('asTurn', () => {
  it('runs the work with a bound write', async () => {
    const r = await asTurn(turn, (ctx) => ctx.write(async (_tx, partnerId) => `wrote as ${partnerId}`))
    expect(r).toEqual({ ok: true, value: 'wrote as partner-1' })
    expect(st.sql.some((q) => q.includes('app_studio_bind_turn'))).toBe(true)
  })
  it('switched off: refused, nothing checked or run', async () => {
    st.open = 'off'; st.sql = []
    const work = vi.fn()
    expect(await asTurn(turn, work)).toEqual({ ok: false, why: 'switch' })
    expect(work).not.toHaveBeenCalled()
    expect(st.sql).toEqual([])
    st.open = 'staff'
  })
  it('the person gone (or the turn of another session): refused before the work', async () => {
    const work = vi.fn()
    st.actor = []
    expect(await asTurn(turn, work)).toEqual({ ok: false, why: 'actor' })
    st.actor = [{ session_id: 'another' }]
    expect(await asTurn(turn, work)).toEqual({ ok: false, why: 'actor' })
    expect(work).not.toHaveBeenCalled()
    st.actor = [{ session_id: 's1' }]
  })
  it('the person gone between the check and the write: `actor`, the write never runs', async () => {
    st.bind = [{ p: null }]
    const inner = vi.fn()
    expect(await asTurn(turn, (ctx) => ctx.write(inner))).toEqual({ ok: false, why: 'actor' })
    expect(inner).not.toHaveBeenCalled()
    st.bind = [{ p: 'partner-1' }]
  })
})
