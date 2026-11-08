import { describe, expect, it } from 'vitest'
import { classic_1_0_0 } from '../catalogue/classic/1.0.0'
import { classicFromSettings, resolveTheme, schemeVars } from '../resolve'

describe('resolveTheme', () => {
  it('a layer picks the style and settings; anything the theme does not allow falls back', () => {
    const t = resolveTheme(classic_1_0_0, { style: 'moss', settings: { pairing: 'cormorant' } })
    expect(t.style).toBe('moss'); expect(t.settings.pairing).toBe('cormorant'); expect(t.home).toEqual(classic_1_0_0.home)
    const odd = resolveTheme(classic_1_0_0, { style: 'nope', settings: { pairing: 'comic-sans' as never, header: 'mega' as never } })
    expect(odd.style).toBe('oxide'); expect(odd.settings).toEqual(classic_1_0_0.defaults)
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
