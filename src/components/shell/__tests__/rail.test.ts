import { describe, expect, it } from 'vitest'
import { railAttr, railFrom } from '../rail'

describe('the rail cookie', () => {
  it('trusts only 1 and 0', () => {
    expect(railFrom('1')).toBe('rail')
    expect(railFrom('0')).toBe('full')
    for (const v of [undefined, '', 'true', '2', '1; path=/', ' 1']) expect(railFrom(v)).toBeNull()
  })
  it('draws the attribute the CSS reads', () => {
    expect(railAttr('rail')).toBe('1')
    expect(railAttr('full')).toBe('0')
    expect(railAttr(null)).toBeUndefined()
  })
})
