import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const fetchMock = vi.fn()
vi.mock('@/lib/http/timeout', () => ({ fetchWithTimeout: (...a: unknown[]) => fetchMock(...a) }))
import { sendAuthCode } from '../graph'

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

describe('sendAuthCode', () => {
  beforeEach(() => fetchMock.mockReset())
  it('returns the wamid and asks Meta to drop it undelivered after the TTL', async () => {
    fetchMock.mockResolvedValue(json(200, { messages: [{ id: 'wamid.ABC' }] }))
    expect(await sendAuthCode('t', '123456789012345', '919845012345', 'ekcode_signin_code', 'en', '482913', 600)).toEqual({ ok: true, wamid: 'wamid.ABC' })
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.message_send_ttl_seconds).toBe(600)
    expect(body.to).toBe('919845012345')
  })
  it("returns Meta's error code (131026 not on WhatsApp) and null for no answer", async () => {
    fetchMock.mockResolvedValue(json(400, { error: { code: 131026 } }))
    expect(await sendAuthCode('t', '123456789012345', '919845012345', 'x', 'en', '482913')).toEqual({ ok: false, error: 131026 })
    fetchMock.mockRejectedValue(new Error('timeout'))
    expect(await sendAuthCode('t', '123456789012345', '919845012345', 'x', 'en', '482913')).toEqual({ ok: false, error: null })
  })
  it('refuses a malformed number or code before any call', async () => {
    expect(await sendAuthCode('t', '123456789012345', '+91 98450', 'x', 'en', '482913')).toEqual({ ok: false, error: null })
    expect(await sendAuthCode('t', 'not-an-id', '919845012345', 'x', 'en', '482913')).toEqual({ ok: false, error: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
