import { describe, expect, it } from 'vitest'
import { pickPinToBlock } from '../pin-suggest'

const store = { outcomes: 100, back: 10 } // 10%

describe('pickPinToBlock', () => {
  it('picks the highest came-back share at least 10 points above the store', () => {
    expect(pickPinToBlock([{ pin: '302012', outcomes: 12, back: 3 }, { pin: '800001', outcomes: 20, back: 8 }], store, [])).toEqual({ pin: '800001', outcomes: 20, back: 8 })
  })
  it('needs 10 outcomes', () => {
    expect(pickPinToBlock([{ pin: '302012', outcomes: 9, back: 9 }], store, [])).toBeNull()
  })
  it('needs 10 points above the store; exactly 10 counts', () => {
    expect(pickPinToBlock([{ pin: '302012', outcomes: 10, back: 1 }], store, [])).toBeNull()
    expect(pickPinToBlock([{ pin: '302012', outcomes: 10, back: 2 }], store, [])?.pin).toBe('302012')
  })
  it('skips a PIN already listed, and a tie goes to more outcomes', () => {
    expect(pickPinToBlock([{ pin: '302012', outcomes: 10, back: 5 }, { pin: '226001', outcomes: 20, back: 10 }], store, ['800001'])?.pin).toBe('226001')
    expect(pickPinToBlock([{ pin: '226001', outcomes: 20, back: 10 }], store, ['226001'])).toBeNull()
  })
  it('a store with no outcomes suggests nothing', () => {
    expect(pickPinToBlock([{ pin: '302012', outcomes: 10, back: 9 }], { outcomes: 0, back: 0 }, [])).toBeNull()
  })
})
