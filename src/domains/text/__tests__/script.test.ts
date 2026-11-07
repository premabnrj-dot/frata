import { describe, expect, it } from 'vitest'
import { scriptOf } from '../script'

describe('scriptOf', () => {
  it('reads the script of a name', () => {
    expect(scriptOf('Venkatanarasimharajuvaripeta Subrahmanyam')).toBe('latin')
    expect(scriptOf('Zoë Fernández · Pune')).toBe('latin')
    expect(scriptOf('प्रियंका शर्मा')).toBe('devanagari')
    expect(scriptOf('முத்துலட்சுமி')).toBe('tamil')
    expect(scriptOf('ਹਰਪ੍ਰੀਤ ਕੌਰ')).toBe('gurmukhi')
    expect(scriptOf('অনন্যা বন্দ্যোপাধ্যায়')).toBe('bengali')
    expect(scriptOf('Priya प्रिया')).toBe('devanagari')
    expect(scriptOf('李华')).toBe('other')
    expect(scriptOf('')).toBe('latin')
  })
})
