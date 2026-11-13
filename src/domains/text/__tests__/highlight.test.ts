import { describe, expect, it } from 'vitest'
import { highlight } from '../highlight'

describe('highlight', () => {
  it('marks the first match, any case', () => {
    expect(highlight('Sneha Rao', 'sneha')).toEqual([{ text: 'Sneha', hit: true }, { text: ' Rao', hit: false }])
  })
  it('digits across spaces, as drawn', () => {
    expect(highlight('+91 98450 12345', '9845', true)).toEqual([{ text: '+91 ', hit: false }, { text: '9845', hit: true }, { text: '0 12345', hit: false }])
    expect(highlight('98450 12345', '0 1', true).filter((p) => p.hit)[0]!.text).toBe('0 1')
  })
  it('no match, no query: one plain part', () => {
    expect(highlight('Sneha', 'xyz')).toEqual([{ text: 'Sneha', hit: false }])
    expect(highlight('Sneha', '  ')).toEqual([{ text: 'Sneha', hit: false }])
  })
  it('regex characters are text', () => expect(highlight('a.*b', '.*')[1]).toEqual({ text: '.*', hit: true }))
})
