import { describe, expect, it } from 'vitest'
import { checkStoryPhotos } from '../extras'

const T = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
const HOST = 'abc123.public.blob.vercel-storage.com'
const photo = (base: string, widths = [400, 800]) => ({ base, widths, width: 800, height: 1000, alt: '', decorative: false })
const story = (image: ReturnType<typeof photo> | null) => ({ image, title: 't', text: '', notes: [] })
const mine = `https://${HOST}/tenants/${T}/products/0c7e6b0e-3c3d-4b7a-9f1e-1b2c3d4e5f60`

describe('checkStoryPhotos', () => {
  it('keeps this shop\'s own product photos and stories without one', () => {
    expect(checkStoryPhotos([story(photo(mine)), story(null)], T, HOST)).toEqual([story(photo(mine)), story(null)])
  })
  it('refuses another shop\'s folder, a size we never make, another folder, and no photo storage', () => {
    expect(checkStoryPhotos([story(photo(mine.replace(T, B)))], T, HOST)).toBeNull()
    expect(checkStoryPhotos([story(photo(mine, [400, 777]))], T, HOST)).toBeNull()
    expect(checkStoryPhotos([story(photo(mine.replace('/products/', '/theme/')))], T, HOST)).toBeNull()
    expect(checkStoryPhotos([story(photo(mine))], T, null)).toBeNull()
  })
})
