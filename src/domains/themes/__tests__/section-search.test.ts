import { describe, expect, it } from 'vitest'
import { SECTION_INFO, SECTION_KEYS, SECTION_KINDS, searchSections } from '../sections'

describe('the section library', () => {
  it('every section is in exactly one kind and has words to be found by', () => {
    const inKinds = SECTION_KINDS.flatMap((k) => k.keys)
    expect([...inKinds].sort()).toEqual([...SECTION_KEYS].sort())
    for (const k of SECTION_KEYS) expect(SECTION_INFO[k].tags.length).toBeGreaterThan(0)
  })
  it('search: every word must match; a name match ranks first; nothing found is empty', () => {
    expect(searchSections('', ['hero', 'logos'])).toEqual(['hero', 'logos'])
    expect(searchSections('lookbook', SECTION_KEYS)).toEqual(['shop_the_look'])
    expect(searchSections('photo', SECTION_KEYS)).toEqual(expect.arrayContaining(['hero', 'image_text', 'shop_the_look']))
    expect(searchSections('collections', SECTION_KEYS)[0]).toBe('collection_tiles')
    expect(searchSections('cod', SECTION_KEYS)).toEqual(['promises'])
    expect(searchSections('PRESS logos', SECTION_KEYS)).toEqual(['logos'])
    expect(searchSections('hologram', SECTION_KEYS)).toEqual([])
    expect(searchSections('sale', ['hero'])).toEqual([])
  })
})
