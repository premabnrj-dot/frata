// Studio's Send and Stop actions (impact review of R6): requireStudio first, then the one input (the text, trimmed and
// capped); nothing else from the form reaches send or stop.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const st = { auth: { ok: true, userId: 'u1', tenantId: 't1' } as Record<string, unknown> }
vi.mock('@/lib/studio/with-studio', () => ({ requireStudio: vi.fn(async () => st.auth) }))
vi.mock('@/lib/studio/sessions', () => ({ send: vi.fn(async () => ({ ok: true, sessionId: 's', turnId: 't' })), stop: vi.fn(async () => ({ ok: true })) }))
const { sendAction, stopAction } = await import('../../../app/(partner)/partner/studio/actions')
const sessions = await import('@/lib/studio/sessions')

describe('the Studio actions', () => {
  beforeEach(() => { st.auth = { ok: true, userId: 'u1', tenantId: 't1' }; vi.mocked(sessions.send).mockClear(); vi.mocked(sessions.stop).mockClear() })
  it('send: the text only, trimmed', async () => {
    expect(await sendAction({ text: '  warmer accent  ' })).toEqual({ ok: true })
    expect(vi.mocked(sessions.send).mock.calls[0]![1]).toBe('warmer accent')
  })
  it('refuses a closed door before reading the input, and any input but one text', async () => {
    st.auth = { ok: false, reason: 'closed', message: 'x' }
    expect(await sendAction({ text: 'hi' })).toEqual({ ok: false, why: 'closed' })
    expect(await stopAction()).toEqual({ ok: false })
    st.auth = { ok: true, userId: 'u1', tenantId: 't1' }
    for (const bad of [{ text: '   ' }, { text: 'x'.repeat(2001) }, { text: 'hi', sessionId: 's2' }, { text: 'hi', tenantId: 't2' }, 'hi', null]) {
      expect(await sendAction(bad)).toEqual({ ok: false, why: 'input' })
    }
    expect(sessions.send).not.toHaveBeenCalled()
    expect(sessions.stop).not.toHaveBeenCalled()
  })
  it('stop: the person’s own session (no input at all)', async () => {
    expect(await stopAction()).toEqual({ ok: true })
    expect(vi.mocked(sessions.stop).mock.calls[0]![0]).toBe(st.auth)
  })
})
