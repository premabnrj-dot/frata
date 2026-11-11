import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const T = '22222222-2222-2222-2222-222222222222', M = '11111111-1111-1111-1111-111111111111'
let eventRow: typeof import('../events').eventRow
beforeEach(async () => { vi.resetModules(); process.env.EMAIL_KEYS = 'e1:test-email-key-0123456789abcdefghijkl'; eventRow = (await import('../events')).eventRow })

const mail = { messageId: 'ses-1', timestamp: '2026-11-11T10:00:00Z', destination: ['asha@gmail.com'], tags: { m: [M], t: [T] } }

describe('SES event → trimmed row', () => {
  it('a delivery', () => {
    const r = eventRow('sns-1', JSON.stringify({ eventType: 'Delivery', mail, delivery: { timestamp: '2026-11-11T10:00:05Z' } }))!
    expect(r).toMatchObject({ snsId: 'sns-1', messageId: M, tenantTag: T, type: 'Delivery', providerId: 'ses-1', bounce: null, hash: null })
  })
  it('a permanent bounce carries this shop\'s hash of the address, never the address', () => {
    const r = eventRow('sns-2', JSON.stringify({ eventType: 'Bounce', mail, bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'asha@gmail.com' }] } }))!
    expect(r.bounce).toBe('permanent')
    expect(r.hash).toMatch(/^e1:[0-9a-f]{64}$/)
    expect(JSON.stringify(r)).not.toContain('asha')
  })
  it('a transient bounce is not suppressed', () => {
    expect(eventRow('s', JSON.stringify({ eventType: 'Bounce', mail, bounce: { bounceType: 'Transient' } }))!.hash).toBeNull()
  })
  it('ignores other types, missing or malformed tags', () => {
    expect(eventRow('s', JSON.stringify({ eventType: 'Open', mail }))).toBeNull()
    expect(eventRow('s', JSON.stringify({ eventType: 'Delivery', mail: { ...mail, tags: { m: ['x'], t: [T] } } }))).toBeNull()
    expect(eventRow('s', 'not json')).toBeNull()
  })
})
