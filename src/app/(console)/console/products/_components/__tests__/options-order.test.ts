import { describe, expect, it } from 'vitest'
import { addInOrder } from '../options-editor'

describe('addInOrder (PR·0: sizes added later go to their place)', () => {
  it('known sizes slot in order; unknown ones go last; case-blind, within the new ones too', () => {
    expect(addInOrder(['S', 'M', 'L'], ['XS', 'XL', 'XXL'])).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
    expect(addInOrder(['S', 'M'], ['m', 'xl', 'XL'])).toEqual(['S', 'M', 'xl'])
    expect(addInOrder(['Free size'], ['S'])).toEqual(['Free size', 'S'])
    expect(addInOrder(['Indigo', 'Rust'], ['Sage'])).toEqual(['Indigo', 'Rust', 'Sage'])
  })
})
