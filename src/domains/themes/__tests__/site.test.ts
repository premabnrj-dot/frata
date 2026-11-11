import { codeSource } from '../source'
import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { carryOver, layerProblems } from '../layer'
import { resolveStored, resolveTheme, settingAttrs, settingVars } from '../resolve'
import { menusOf, menusProblem, menuWarnings, paletteOf, paletteProblem, readMenus, readSite, siteIsDefault, siteProblem, textOf, SITE_DEFAULTS, TEXT_DEFAULTS, type MenuItem } from '../site'

const ed = CATALOGUE.editorial!['2.1.0']!, ba = CATALOGUE.bazaar!['2.1.0']!
const good = { primary: '#1F1A17', accent: '#7A1F2B', background: '#FFFFFF', surface: '#F4F1EC', text: '#1F1A17', muted: '#5E5650' }
const it_ = (id: string, children: MenuItem[] = [], icon: MenuItem['icon'] = null): MenuItem => ({ id, label: id, link: '/products', icon, children })

describe('site settings', () => {
  it('a palette must read: text, muted, surface, accent and button words', () => {
    expect(paletteProblem(good as never)).toBeNull()
    expect(paletteProblem({ ...good, text: '#DDDDDD' } as never)).toMatch(/Text is hard/)
    expect(paletteProblem({ ...good, muted: '#CCCCCC' } as never)).toMatch(/Muted/)
    expect(paletteProblem({ ...good, accent: '#F5F5F5' } as never)).toMatch(/accent/)
    expect(siteProblem({ palette: { ...good, text: '#EEEEEE' } })).toMatch(/hard to read/)
    expect(siteProblem({ palette: { ...good, text: 'red' } })).toMatch(/Site settings/)
    expect(siteProblem(undefined)).toBeNull()
  })
  it("every theme style's paper scheme is a usable palette, with what it keeps from the style", () => {
    for (const vs of Object.values(CATALOGUE)) for (const m of Object.values(vs)) for (const st of m.styles) {
      const light = [st.schemes.paper, st.schemes.tint ?? st.schemes.paper]
      expect(paletteProblem(paletteOf(st.schemes.paper), light), `${m.key} ${m.version}/${st.key}`).toBeNull()
    }
  })
  it('a dark background is refused where the theme’s sale and saving words would not read on it', () => {
    const sch = resolveTheme(ed, { style: ed.styles[0]!.key }).schemes
    const dark = { primary: '#F4F1EC', accent: '#F2C14E', background: '#111111', surface: '#1E1E1E', text: '#F4F1EC', muted: '#BDB5AC' }
    expect(paletteProblem(dark as never, [sch.paper, sch.tint])).toMatch(/Sale and saving/)
    expect(resolveTheme(ed, { style: ed.styles[0]!.key, site: { palette: dark } }).site.palette).toBeNull()
  })
  it('a shop that set nothing gets exactly the custom properties and attributes it had', () => {
    for (const m of [ed, ba, CATALOGUE.classic!['1.0.0']!]) {
      const t = resolveTheme(m, { style: m.styles[0]!.key })
      expect(Object.keys(settingVars(t)).filter((k) => k.startsWith('--t-') || k === '--icon-stroke')).toEqual([])
      expect(Object.keys(settingAttrs(t)).filter((k) => k.startsWith('data-t-'))).toEqual([])
    }
    expect(siteIsDefault(SITE_DEFAULTS)).toBe(true); expect(siteIsDefault({ ...SITE_DEFAULTS, icons: { library: 'solid', stroke: 'regular' } })).toBe(false)
  })
  it('absent = the theme exactly; a palette paints paper and the tint’s buttons', () => {
    const plain = resolveTheme(ed, { style: ed.styles[0]!.key })
    expect(plain.site).toEqual(SITE_DEFAULTS)
    const t = resolveTheme(ed, { style: ed.styles[0]!.key, site: { palette: good } })
    expect(t.schemes.paper.bg).toBe('#FFFFFF'); expect(t.schemes.paper.button).toBe('#1F1A17'); expect(t.schemes.tint.accent).toBe('#7A1F2B')
    expect(t.schemes.ink).toEqual(plain.schemes.ink)
  })
  it('a stored palette that no longer reads is ignored; a bad part drops only itself', () => {
    const s = readSite({ palette: { ...good, text: '#EEEEEE' }, icons: { library: 'duotone', stroke: 'bold' }, text: { h1: { desk: 40 }, body: { weight: 900 } } })
    expect(s.palette).toBeNull(); expect(s.icons).toEqual({ library: 'duotone', stroke: 'bold' })
    expect(s.text).toEqual({ h1: { desk: 40 } })
    expect(readSite({ constructor: 1, icons: { library: 'neon', stroke: 'bold' } }).icons).toEqual(SITE_DEFAULTS.icons)
  })
  it('text styles fall back to the defaults and hold to their range', () => {
    expect(textOf(SITE_DEFAULTS, 'h1')).toEqual(TEXT_DEFAULTS.h1)
    expect(textOf({ ...SITE_DEFAULTS, text: { body: { desk: 40, phone: 11 } } }, 'body')).toMatchObject({ desk: 20, phone: 14 })
  })
  it('stored through resolveStored', () => {
    const r = resolveStored({ themeKey: 'editorial', themeVersion: '2.1.0', styleKey: ed.styles[0]!.key, settings: { site: { icons: { library: 'solid', stroke: 'thin' } }, menus: { tabs: [it_('a', [], 'home')] } } }, { accent: 'x', displayFont: 'fraunces' }, codeSource)
    expect(r.site.icons.library).toBe('solid'); expect(r.menus.tabs?.[0]?.icon).toBe('home')
  })
})

describe('menus', () => {
  it('three levels at most; footer one level; tabs need icons, five at most', () => {
    expect(menusProblem({ main: [it_('a', [it_('b', [it_('c')])])] })).toBeNull()
    expect(menusProblem({ main: [it_('a', [it_('b', [it_('c', [it_('d')])])])] })).toMatch(/3 levels/)
    expect(menusProblem({ footer: [it_('a', [it_('b')])] })).toMatch(/Footer menu/)
    expect(menusProblem({ tabs: [it_('a')] })).toMatch(/icon/)
    expect(menusProblem({ tabs: ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => it_(x, [], 'home')) })).toMatch(/Phone tabs/)
    expect(menusProblem({ main: [it_('a'), it_('a')] })).toMatch(/share an id/)
  })
  it('a menu nested far too deep is refused, not a stack overflow', () => {
    let x: MenuItem = it_('z'); for (let i = 0; i < 5000; i++) x = { ...it_(`a${i}`), children: [x] }
    expect(menusProblem({ main: [x] })).toMatch(/3 levels/); expect(readMenus({ main: [x] })).toEqual({})
    expect(layerProblems({ settings: {}, menus: { main: [x] } })[0]).toMatch(/3 levels/)
  })
  it('links stay inside the shop', () => {
    expect(menusProblem({ main: [{ ...it_('a'), link: 'https://evil.example' }] })).not.toBeNull()
    expect(menusProblem({ main: [{ ...it_('a'), link: '//evil.example' }] })).not.toBeNull()
  })
  it('default main menu from the collections; soft warnings past 7 and 10', () => {
    const m = menusOf(undefined, [{ handle: 'sarees', title: 'Sarees' }])
    expect(m.main!.map((x) => x.link)).toEqual(['/products', '/collections/sarees']); expect(m.footer).toBeNull()
    expect(menuWarnings(Array.from({ length: 8 }, (_, i) => it_(`x${i}`)))).toHaveLength(1)
    expect(readMenus({ main: 'nope', footer: [it_('f')] })).toEqual({ footer: [it_('f')] })
  })
  it('saved through layerProblems', () => {
    expect(layerProblems({ settings: {}, menus: { tabs: [it_('a')] } })[0]).toMatch(/Phone tabs/)
    expect(layerProblems({ settings: {}, site: { palette: good }, menus: { main: [it_('a')] } })).toEqual([])
  })
})

describe('switching themes', () => {
  const layer = { style: ed.styles[0]!.key, site: { palette: good }, menus: { main: [it_('a')] } }
  it('another theme brings its own site settings; menus come across', () => {
    const c = carryOver({ manifest: ed, layer }, ba)
    expect(c.layer.site).toBeUndefined(); expect(c.layer.menus).toEqual(layer.menus)
    expect(c.lost.join()).toMatch(/site colours/)
  })
  it('another version of the same theme keeps both', () => {
    const c = carryOver({ manifest: CATALOGUE.editorial!['2.0.0']!, layer }, ed)
    expect(c.layer.site).toEqual(layer.site); expect(c.layer.menus).toEqual(layer.menus)
  })
})
