import { describe, expect, it } from 'vitest'
import { cleanImages } from '../clean-images'

// The save check (security review S2, 2026-11-09): every photo a section names must be this shop's own, in its theme
// or products folder on our Blob host; the story sections' photos included.
const T = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222'
const HOST = 'abc.public.blob.vercel-storage.com'
const own = { base: `https://${HOST}/tenants/${T}/theme/a1b2c3d4-0000-4000-8000-000000000001`, widths: [400], width: 4, height: 5, alt: 'x', decorative: false, focus: null }
const foreign = { ...own, base: 'https://evil.example/tenants/x/theme/y/z' }
const otherShop = { ...own, base: own.base.replace(T, OTHER) }
const layer = (home: object[]) => ({ home })

describe('cleanImages', () => {
  it('keeps this shop\'s photos in a story fan and a statement', () => {
    const r = cleanImages(layer([{ id: 'f', key: 'story_fan', cards: [{ image: own }, { image: null }] }, { id: 's', key: 'statement', image: own, wordmark: 'w' }]), T, HOST)
    expect(r).not.toBeNull()
  })
  it.each([['a foreign host', foreign], ['another shop', otherShop]])('refuses %s in a story fan card', (_n, img) => {
    expect(cleanImages(layer([{ id: 'f', key: 'story_fan', cards: [{ image: own }, { image: img }] }]), T, HOST)).toBeNull()
  })
  it.each([['a foreign host', foreign], ['another shop', otherShop]])('refuses %s in a statement', (_n, img) => {
    expect(cleanImages(layer([{ id: 's', key: 'statement', image: img }]), T, HOST)).toBeNull()
  })
  it('refuses every photo when there is no Blob host', () => {
    expect(cleanImages(layer([{ id: 's', key: 'statement', image: own }]), T, null)).toBeNull()
  })
})
