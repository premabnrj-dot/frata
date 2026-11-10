import { describe, expect, it } from 'vitest'
import { codeScreen, flowState, type CodeFacts, type FlowFacts } from '../flow'
import { armFor, HOLDOUT_EVERY } from '../holdout'
import { breakerTripped, DEFAULT_LIMITS, powBits, shopDayCap, withinBounds } from '../limits'
import { shareItems } from '../notice'
import { EK } from '../brand'

const t0 = new Date('2026-11-10T10:00:00Z')
const at = (ms: number) => new Date(t0.getTime() + ms)
const code = (p: Partial<CodeFacts> = {}): CodeFacts => ({ sentAt: t0, deliveredAt: null, failedCode: null, verifiedAt: null, expiresAt: at(600_000), tries: 0, ...p })
const flow = (p: Partial<FlowFacts> = {}): FlowFacts => ({ startedAt: t0, numberInAt: null, accountCreatedAt: null, code: null, continuedAt: null, ...p })

describe('flowState', () => {
  it('walks from started to continued', () => {
    expect(flowState(flow(), at(1000))).toBe('started')
    expect(flowState(flow({ code: code({ sentAt: null }) }), at(1000))).toBe('code_pending')
    expect(flowState(flow({ code: code() }), at(1000))).toBe('code_sent')
    expect(flowState(flow({ code: code({ deliveredAt: at(900) }) }), at(1000))).toBe('code_delivered')
    expect(flowState(flow({ code: code({ verifiedAt: at(5000) }) }), at(6000))).toBe('verified')
    expect(flowState(flow({ accountCreatedAt: at(9000), code: code({ verifiedAt: at(5000) }) }), at(10_000))).toBe('account_created')
    expect(flowState(flow({ continuedAt: at(11_000) }), at(12_000))).toBe('continued')
  })
  it('locks at the tries limit, expires at ten minutes, abandons at fifteen', () => {
    expect(flowState(flow({ code: code({ tries: 5 }) }), at(1000))).toBe('locked')
    expect(flowState(flow({ code: code() }), at(600_000))).toBe('code_expired')
    expect(flowState(flow({ code: code() }), at(15 * 60_000 + 1))).toBe('abandoned')
  })
  it('a failed send is failed, not delivered', () => {
    expect(flowState(flow({ code: code({ failedCode: 131026 }) }), at(1000))).toBe('code_failed')
  })
})

describe('codeScreen', () => {
  it('counts down to resend, offers a guest checkout after 20 s without delivery', () => {
    expect(codeScreen(code(), at(5_000))).toEqual({ canResend: false, offerGuest: false, resendInMs: 25_000 })
    expect(codeScreen(code(), at(20_000)).offerGuest).toBe(true)
    expect(codeScreen(code({ deliveredAt: at(3000) }), at(25_000)).offerGuest).toBe(false)
    expect(codeScreen(code(), at(30_000)).canResend).toBe(true)
  })
  it('a failure or an unknown send brings both offers forward, never naming why', () => {
    expect(codeScreen(code({ failedCode: 131026 }), at(1000))).toEqual({ canResend: true, offerGuest: true, resendInMs: 0 })
    expect(codeScreen(code({ sentAt: null }), at(1000))).toEqual({ canResend: true, offerGuest: true, resendInMs: 0 })
  })
})

describe('limits', () => {
  it('proof of work from the 2nd code, rising, capped at 24 bits', () => {
    expect(powBits(1)).toBe(0)
    expect(powBits(2)).toBe(16)
    expect(powBits(4)).toBe(20)
    expect(powBits(10)).toBe(24)
    expect(powBits(2, 4)).toBe(20)
  })
  it('the breaker needs enough codes and too few right', () => {
    expect(breakerTripped(199, 0)).toBe(false)
    expect(breakerTripped(200, 79)).toBe(true)
    expect(breakerTripped(200, 80)).toBe(false)
  })
  it('a raised cap only raises', () => {
    expect(shopDayCap('launch', null)).toBe(100)
    expect(shopDayCap('growth', 1500)).toBe(1500)
    expect(shopDayCap('scale', 50)).toBe(2000)
  })
  it('defaults sit inside their bounds; a switched-off limit does not', () => {
    expect(withinBounds(DEFAULT_LIMITS)).toBe(true)
    expect(withinBounds({ ...DEFAULT_LIMITS, triesPerCode: 100 })).toBe(false)
    expect(withinBounds({ ...DEFAULT_LIMITS, perShopDay: { ...DEFAULT_LIMITS.perShopDay, launch: 0 } })).toBe(false)
  })
})

describe('holdout', () => {
  it('is stable per visitor and holds out about one in ten', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => `v${String(i).padStart(21, '0')}`)
    expect(armFor(ids[7])).toBe(armFor(ids[7]))
    const held = ids.filter((id) => armFor(id) === 'held').length
    expect(held / ids.length).toBeGreaterThan(1 / HOLDOUT_EVERY - 0.02)
    expect(held / ids.length).toBeLessThan(1 / HOLDOUT_EVERY + 0.02)
  })
  it('no id, a bad id, or the comparison off: shown', () => {
    expect(armFor(null)).toBe('shown')
    expect(armFor('short')).toBe('shown')
    const held = Array.from({ length: 200 }, (_, i) => `v${String(i).padStart(21, '0')}`).find((id) => armFor(id) === 'held')!
    expect(armFor(held, false)).toBe('shown')
  })
})

describe('notice and words', () => {
  it('shares an address only when one is chosen', () => {
    expect(shareItems(false)).toEqual(['name', 'phone'])
    expect(shareItems(true)).toEqual(['name', 'phone', 'address'])
  })
  it('counts tries in words', () => {
    expect(EK.code.wrong(1)).toBe("Code doesn't match · 1 try left")
    expect(EK.code.resendIn(5)).toBe('Resend in 0:05')
  })
})

describe('leadingZeroBits', async () => {
  const { leadingZeroBits } = await import('../limits')
  it('counts zero bits from the left', () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0x0f, 0xff]))).toBe(20)
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0)
    expect(leadingZeroBits(new Uint8Array([0, 0]))).toBe(16)
  })
})
