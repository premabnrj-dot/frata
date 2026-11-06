import { describe, expect, it } from 'vitest'
import { clampCrop, swatchBackground } from '../swatch'

describe('swatch from a photo', () => {
  it('centres the crop in the circle', () => {
    // A 1000×1250 photo, circle at the centre with radius a tenth of the width, in a 40px swatch.
    const b = swatchBackground({ x: 0.5, y: 0.5, r: 0.1 }, 1000, 1250, 40)
    expect(b.size).toBe('200px 250px')
    expect(b.position).toBe('-80px -105px')
  })
  it('keeps the circle inside the photo', () => {
    const c = clampCrop({ x: 0, y: 1, r: 0.2 }, 1000, 1250)
    expect(c.x).toBe(0.2)
    expect(c.y).toBeCloseTo(1 - 0.16)
    expect(clampCrop({ x: 0.5, y: 0.5, r: 0.9 }, 1000, 1250).r).toBe(0.5)
  })
})
