// Studio's Send and Stop actions (impact review of R6): requireStudio first, then the one input (the text, trimmed and
// capped, and the tab's store, compared only); nothing else from the form reaches send or stop. Two stores in two tabs
// (stress list, 2026-11-23): a tab opened for another store than the one now signed in sends nothing and stops nothing.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const T1 = '11111111-1111-4111-8111-111111111111', T2 = '22222222-2222-4222-8222-222222222222'
const st = { auth: { ok: true, userId: 'u1', tenantId: T1 } as Record<string, unknown> }
vi.mock('@/lib/studio/with-studio', () => ({ requireStudio: vi.fn(async () => st.auth) }))
vi.mock('@/lib/studio/sessions', () => ({ send: vi.fn(async () => ({ ok: true, sessionId: 's', turnId: 't' })), stop: vi.fn(async () => ({ ok: true })) }))
const { sendAction, stopAction } = await import('../../../app/(partner)/partner/studio/actions')
const sessions = await import('@/lib/studio/sessions')

describe('the Studio actions', () => {
  beforeEach(() => { st.auth = { ok: true, userId: 'u1', tenantId: T1 }; vi.mocked(sessions.send).mockClear(); vi.mocked(sessions.stop).mockClear() })
  it('send: the text only, trimmed', async () => {
    expect(await sendAction({ text: '  warmer accent  ', store: T1 })).toEqual({ ok: true })
    expect(vi.mocked(sessions.send).mock.calls[0]![1]).toBe('warmer accent')
  })
  it('refuses a closed door before reading the input, and any input but one text', async () => {
    st.auth = { ok: false, reason: 'closed', message: 'x' }
    expect(await sendAction({ text: 'hi', store: T1 })).toEqual({ ok: false, why: 'closed' })
    expect(await stopAction({ store: T1 })).toEqual({ ok: false })
    st.auth = { ok: true, userId: 'u1', tenantId: T1 }
    for (const bad of [{ text: '   ', store: T1 }, { text: 'x'.repeat(2001), store: T1 }, { text: 'hi', store: T1, sessionId: 's2' }, { text: 'hi', store: T1, tenantId: T2 }, { text: 'hi' }, { text: 'hi', store: 't1' }, 'hi', null]) {
      expect(await sendAction(bad)).toEqual({ ok: false, why: 'input' })
    }
    expect(sessions.send).not.toHaveBeenCalled()
    expect(sessions.stop).not.toHaveBeenCalled()
  })
  it('two stores in two tabs: a tab for another store sends nothing and stops nothing; it reloads', async () => {
    expect(await sendAction({ text: 'hi', store: T2 })).toEqual({ ok: false, why: 'moved' })
    expect(await stopAction({ store: T2 })).toEqual({ ok: false, moved: true })
    expect(await stopAction({})).toEqual({ ok: false })
    expect(sessions.send).not.toHaveBeenCalled()
    expect(sessions.stop).not.toHaveBeenCalled()
  })
  it('stop: the person’s own session (only the tab\'s store, compared)', async () => {
    expect(await stopAction({ store: T1 })).toEqual({ ok: true })
    expect(vi.mocked(sessions.stop).mock.calls[0]![0]).toBe(st.auth)
  })
})
