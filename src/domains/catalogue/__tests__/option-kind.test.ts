import { describe, expect, it } from 'vitest'
import { colourIndex, optionKind } from '../option-kind'

describe('what an option is, by its name (PR·3)', () => {
  it('knows sizes and colours in the words brands use, in any case or Unicode form; Print is not a colour', () => {
    for (const n of ['Size', 'sizes', ' SIZE ', 'साइज़', 'साइज़', 'साइज']) expect(optionKind(n)).toBe('size')
    for (const n of ['Colour', 'color', 'Colours', 'Shade', 'shades', 'रंग']) expect(optionKind(n)).toBe('colour')
    for (const n of ['Print', 'Prints', 'Fabric', 'Length', '']) expect(optionKind(n)).toBe('other')
  })
  it('picks THE colour by precedence, so "Print, Colour" keeps Colour and "Shade, Colour" too', () => {
    expect(colourIndex(['Print', 'Colour'])).toBe(1)
    expect(colourIndex(['Shade', 'Colour'])).toBe(1)
    expect(colourIndex(['Size', 'Shade'])).toBe(1)
    expect(colourIndex(['रंग', 'Shade'])).toBe(1)
    expect(colourIndex(['Size', 'Print'])).toBe(-1)
    expect(colourIndex(['Colour', 'Color'])).toBe(0)
  })
})
