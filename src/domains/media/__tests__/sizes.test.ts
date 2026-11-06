import { describe, expect, it } from 'vitest'
import { PATH_SHAPE, pick, srcSet, widthsFor } from '../sizes'

describe('photo sizes', () => {
  it('never makes a photo larger than it is', () => {
    expect(widthsFor(4000)).toEqual([400, 800, 1200, 1600])
    expect(widthsFor(1000)).toEqual([400, 800])
    expect(widthsFor(300)).toEqual([400])
  })
  it('srcset and pick', () => {
    expect(srcSet('https://x/a', [400, 800])).toBe('https://x/a-400.webp 400w, https://x/a-800.webp 800w')
    expect(pick([400, 800, 1200], 700)).toBe(800)
    expect(pick([400, 800], 2000)).toBe(800)
  })
  it('accepts only paths inside a shop folder', () => {
    const t = '11111111-1111-1111-1111-111111111111', id = '22222222-2222-2222-2222-222222222222'
    expect(PATH_SHAPE.exec(`tenants/${t}/products/${id}-800.webp`)?.[1]).toBe(t)
    expect(PATH_SHAPE.test(`tenants/${t}/../x/${id}-800.webp`)).toBe(false)
    expect(PATH_SHAPE.test(`tenants/${t}/products/${id}-801.webp`)).toBe(false)
  })
})
