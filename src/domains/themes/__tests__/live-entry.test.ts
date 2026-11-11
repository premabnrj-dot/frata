import { describe, expect, it } from 'vitest'
import { liveFromEntry } from '../release'

// Theme Studio TS0a: which look the shop shows from its cached entry (impact review: covered here, not only in e2e).
const A = { revisionId: 'a', themeKey: 'signal', themeVersion: '1.2.0' }
const B = { revisionId: 'b', themeKey: 'signal', themeVersion: '1.3.0' }
const body = (id: string) => ({ revisionId: id, settings: {} })

describe('liveFromEntry', () => {
  it('the newest candidate, from the entry', () => {
    expect(liveFromEntry({ candidates: [B, A], first: body('b') }, new Set())).toEqual({ body: body('b') })
  })
  it('the newest is withdrawn: the previous one, read by id', () => {
    expect(liveFromEntry({ candidates: [B, A], first: body('b') }, new Set(['signal@1.3.0']))).toEqual({ fetch: 'a' })
  })
  it('every candidate withdrawn, or never published: none (the shop shows its Classic baseline)', () => {
    expect(liveFromEntry({ candidates: [B], first: body('b') }, new Set(['signal@1.3.0']))).toBeNull()
    expect(liveFromEntry({ candidates: [], first: null }, new Set())).toBeNull()
  })
})
