// A chat card's state (V3b K1): its own timestamps first, then the store's waiting change's decision once sent.
import { describe, expect, it } from 'vitest'
import { cardState } from '../proposals'

const at = new Date('2026-11-24T05:00:00Z')
const none = { appliedAt: null, dismissedAt: null, refusedAt: null, sent: false, decision: null }

describe('cardState', () => {
  it('open, refused, applied, set aside', () => {
    expect(cardState(none)).toBe('open')
    expect(cardState({ ...none, refusedAt: at })).toBe('refused')
    expect(cardState({ ...none, appliedAt: at, refusedAt: at })).toBe('applied')
    expect(cardState({ ...none, dismissedAt: at })).toBe('dismissed')
  })
  it('sent: the waiting change’s decision, and nothing else, says what came of it', () => {
    expect(cardState({ ...none, sent: true })).toBe('sent')
    expect(cardState({ ...none, sent: true, refusedAt: at })).toBe('sent') // an earlier refusal is past
    expect(cardState({ ...none, sent: true, decision: 'approved' })).toBe('approved')
    expect(cardState({ ...none, sent: true, decision: 'declined' })).toBe('declined')
    expect(cardState({ ...none, sent: true, decision: 'replaced' })).toBe('replaced')
    expect(cardState({ ...none, sent: true, decision: 'something new' })).toBe('sent')
  })
})
