import { describe, expect, it } from 'vitest'
import { reorderPhotos } from '../photo-order'

describe('photo order', () => {
  const ids = ['a', 'b', 'c', 'd']
  it('to the cover, to the last, past the end, a step', () => {
    expect(reorderPhotos(ids, 'c', { to: 0 })).toEqual(['c', 'a', 'b', 'd'])
    expect(reorderPhotos(ids, 'a', { to: 3 })).toEqual(['b', 'c', 'd', 'a'])
    expect(reorderPhotos(ids, 'b', { to: 49 })).toEqual(['a', 'c', 'd', 'b'])
    expect(reorderPhotos(ids, 'b', 1)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('nothing moves: same place, off either end, an unknown id', () => {
    expect(reorderPhotos(ids, 'b', { to: 1 })).toBeNull()
    expect(reorderPhotos(ids, 'a', -1)).toBeNull()
    expect(reorderPhotos(ids, 'd', 1)).toBeNull()
    expect(reorderPhotos(ids, 'z', { to: 0 })).toBeNull()
  })
})
