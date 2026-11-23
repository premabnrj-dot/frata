import { describe, expect, it } from 'vitest'
import { previewed } from '../compare'

describe('Live | Waiting (four-screens § 4)', () => {
  it('draws the live or the waiting version as the switch says', () => {
    expect(previewed({ live: 'L', draft: 'L', waiting: 'W', dirty: false, compare: 'live' })).toBe('L')
    expect(previewed({ live: 'L', draft: 'L', waiting: 'W', dirty: false, compare: 'waiting' })).toBe('W')
  })
  it('the form’s unsaved edits win; with nothing waiting, the draft', () => {
    expect(previewed({ live: 'L', draft: 'D', waiting: 'W', dirty: true, compare: 'waiting' })).toBe('D')
    expect(previewed({ live: 'L', draft: 'D', waiting: null, dirty: false, compare: 'live' })).toBe('D')
  })
})
