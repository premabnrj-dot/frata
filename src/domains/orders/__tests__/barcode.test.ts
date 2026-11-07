import { describe, expect, it } from 'vitest'
import { bars, code128, encodable, PATTERN_COUNT, patternFor, symbols } from '../barcode'

describe('Code 128 B', () => {
  it('has the standard 106 patterns: 11 modules, 3 bars and 3 spaces, all distinct', () => {
    expect(PATTERN_COUNT).toBe(106)
    const all = Array.from({ length: 106 }, (_, i) => patternFor(i)!)
    for (const p of all) {
      expect(p).toMatch(/^1[01]{9}0$/)
      expect(p.match(/1+/g)!.length).toBe(3)
    }
    expect(new Set(all).size).toBe(106)
    expect(patternFor(0)).toBe('11011001100')   // value 0 (space in set B)
    expect(patternFor(104)).toBe('11010010000') // Start B
  })
  it('checksum: start + each value × its position, mod 103', () => {
    expect(symbols('A')).toEqual([104, 33, (104 + 33) % 103])
    expect(symbols('KS-1001')).toEqual([104, 43, 51, 13, 17, 16, 16, 17, (104 + 43 * 1 + 51 * 2 + 13 * 3 + 17 * 4 + 16 * 5 + 16 * 6 + 17 * 7) % 103])
  })
  it('modules: start, each character, checksum, a 13-module stop', () => {
    const m = code128('KS-1001')
    expect(m.length).toBe(11 * (1 + 7 + 1) + 13)
    expect(m.startsWith('11010010000')).toBe(true)
    expect(m.endsWith('1100011101011')).toBe(true)
    // Bars cover exactly the 1s.
    expect(bars(m).reduce((a, [, w]) => a + w, 0)).toBe([...m].filter((c) => c === '1').length)
  })
  it('refuses what it cannot carry', () => {
    expect(encodable('KS-1001')).toBe(true)
    expect(encodable('क')).toBe(false)
    expect(() => code128('')).toThrow()
  })
})
