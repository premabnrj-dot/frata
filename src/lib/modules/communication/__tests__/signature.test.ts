import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyMetaSignature } from '../signature'

const sig = (raw: string, secret: string) => 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex')

describe('verifyMetaSignature', () => {
  const raw = '{"object":"whatsapp_business_account","entry":[]}'
  it('accepts the raw body signed with the app secret', () => expect(verifyMetaSignature(raw, sig(raw, 'sek'), 'sek')).toBe(true))
  it('refuses another secret, a changed body, a re-serialised body, no prefix, nothing', () => {
    expect(verifyMetaSignature(raw, sig(raw, 'other'), 'sek')).toBe(false)
    expect(verifyMetaSignature(raw + ' ', sig(raw, 'sek'), 'sek')).toBe(false)
    expect(verifyMetaSignature(JSON.stringify(JSON.parse(raw), null, 1), sig(raw, 'sek'), 'sek')).toBe(false)
    expect(verifyMetaSignature(raw, sig(raw, 'sek').slice(7), 'sek')).toBe(false)
    expect(verifyMetaSignature(raw, null, 'sek')).toBe(false)
    expect(verifyMetaSignature(raw, sig(raw, ''), '')).toBe(false)
  })
})
