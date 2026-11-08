import { describe, expect, it } from 'vitest'
import { classic_1_0_0 } from '../catalogue/classic/1.0.0'
import { classicFromSettings, resolveStored, resolveTheme, schemeVars, settingAttrs, settingVars } from '../resolve'
import { CATALOGUE, manifestNear } from '../catalogue'
import { carryOver } from '../layer'
import { FEEL_DEFAULTS, PAGE_DEFAULTS } from '../types'

describe('resolveTheme', () => {
  it('a layer picks the style and settings; anything the theme does not allow falls back', () => {
    const t = resolveTheme(classic_1_0_0, { style: 'moss', settings: { pairing: 'cormorant' } })
    expect(t.style).toBe('moss'); expect(t.settings.pairing).toBe('cormorant'); expect(t.home.map((s) => s.id)).toEqual(classic_1_0_0.home.map((s) => s.id))
    const odd = resolveTheme(classic_1_0_0, { style: 'nope', settings: { pairing: 'comic-sans' as never, header: 'mega' as never } })
    expect(odd.style).toBe('oxide'); expect(odd.settings).toEqual({ ...PAGE_DEFAULTS, ...FEEL_DEFAULTS, ...classic_1_0_0.defaults })
  })
  it('a section key the theme does not allow is dropped from Home', () => {
    const t = resolveTheme({ ...classic_1_0_0, allowed: { ...classic_1_0_0.allowed, sections: ['hero'] } }, { style: 'oxide' })
    expect(t.home.map((s) => s.key)).toEqual(['hero'])
  })
  it('a shop that never published: Classic from accent and display font', () => {
    const t = classicFromSettings('wine', 'cormorant')
    expect([t.key, t.version, t.style, t.settings.pairing]).toEqual(['classic', '1.0.0', 'wine', 'cormorant'])
    expect(classicFromSettings('???', '???').settings.pairing).toBe('fraunces')
    expect(schemeVars(t)['--store-accent']).toBe('#7A1F2B')
  })
})

describe('pages beyond Home (T2)', () => {
  it('page settings default to what every shop had; a layer picks them; they reach CSS', () => {
    const t = resolveTheme(classic_1_0_0, { style: 'oxide' })
    expect([t.settings.gallery, t.settings.details, t.settings.card, t.settings.desktopColumns, t.settings.collectionTop]).toEqual(['swipe', 'open', 'standard', 4, 'title'])
    const u = resolveTheme(classic_1_0_0, { style: 'oxide', settings: { gallery: 'thumbs', card: 'framed', desktopColumns: 3, collectionTop: 'banner', details: 'folded' } })
    expect(settingVars(u)['--store-dcols']).toBe('3'); expect(settingAttrs(u)['data-card']).toBe('framed')
    expect(resolveTheme(classic_1_0_0, { style: 'oxide', settings: { card: 'giant' as never } }).settings.card).toBe('standard')
  })
  it('another version of the same theme keeps everything the merchant made', () => {
    const e = CATALOGUE.editorial!['1.0.0']!
    const layer = { style: e.styles.at(-1)!.key, settings: { corners: 'round' as const, header: 'minimal' as const }, home: e.home.slice(0, 1) }
    expect(carryOver({ manifest: e, layer }, { ...e, version: '1.1.0' })).toEqual({ layer, lost: [] })
    // Back a version (a recall): a section the earlier one lacks drops, and says so.
    const e11 = CATALOGUE.editorial!['1.1.0']!
    const withLook = { style: 'haldi', home: [{ id: 'l', key: 'shop_the_look', heading: 'x' }, { id: 'r', key: 'rich_text', body: [] }] }
    const back = carryOver({ manifest: e11, layer: withLook }, e)
    expect(back.layer.home?.map((s) => (s as { id: string }).id)).toEqual(['r']); expect(back.lost).toEqual(['Shop the look isn’t in Editorial 1.0.0'.replace('’', "'")])
  })
  it('a stored version this build lacks renders with the nearest earlier one of the same theme, never Classic', () => {
    expect(manifestNear('editorial', '1.9.0')?.key).toBe('editorial')
    expect(manifestNear('editorial', '0.1.0')?.key).toBe('editorial')
    expect(manifestNear('nope', '1.0.0')).toBeNull()
    expect(resolveStored({ themeKey: 'editorial', themeVersion: '9.0.0', styleKey: 'x', settings: {} }, { accent: 'oxide', displayFont: 'fraunces' }).key).toBe('editorial')
  })
})
