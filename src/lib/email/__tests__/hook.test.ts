import { describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
vi.mock('server-only', () => ({}))
import { hookSigned } from '../hook'

const raw = Buffer.from('a-test-secret-of-some-length-0123456789').toString('base64')
const secret = `v1,whsec_${raw}`
const sign = (id: string, ts: string, body: string) => `v1,${createHmac('sha256', Buffer.from(raw, 'base64')).update(`${id}.${ts}.${body}`).digest('base64')}`
const now = new Date('2026-11-11T10:00:00Z'), ts = String(now.getTime() / 1000)

describe('Send Email Hook signature', () => {
  it('accepts a good one among several', () => expect(hookSigned('{}', 'msg_1', ts, `v1,AAAA ${sign('msg_1', ts, '{}')}`, now, secret)).toBe(true))
  it('refuses a changed body, an old timestamp, a missing secret', () => {
    expect(hookSigned('{"x":1}', 'msg_1', ts, sign('msg_1', ts, '{}'), now, secret)).toBe(false)
    const old = String(now.getTime() / 1000 - 600)
    expect(hookSigned('{}', 'msg_1', old, sign('msg_1', old, '{}'), now, secret)).toBe(false)
    expect(hookSigned('{}', 'msg_1', ts, sign('msg_1', ts, '{}'), now, '')).toBe(false)
  })
})
