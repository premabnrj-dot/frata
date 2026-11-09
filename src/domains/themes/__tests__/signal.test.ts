import { describe, expect, it } from 'vitest'
import { CATALOGUE, manifestOf } from '../catalogue'
import { onColour } from '../layer'
import { resolveTheme, schemeVars } from '../resolve'

// Theme Signal (plan 2026-11-09-theme-signal, impact review): every value it adds stays off for the older themes, and
// its band is drawn from the shop's FINAL accent.
const SIGNAL_ONLY = { pairing: 'schibsted', header: 'float', footer: 'photo', card: 'tile', labels: 'pill', railCounter: true }
const home = [
  { id: 'p', key: 'products', heading: 'Picks', source: { kind: 'newest' }, count: 8, layout: 'tabs', tabs: ['a'] },
  { id: 'b', key: 'image_text', scheme: 'signal', heading: 'Band' },
]

describe('older themes never render a Signal value', () => {
  it.each([['editorial', '2.1.0'], ['minimal', '1.0.0'], ['bazaar', '2.1.0'], ['classic', '1.0.0']] as const)('%s@%s', (key, version) => {
    const m = manifestOf(key, version)!
    const style = m.styles[0]!.key
    const t = resolveTheme(m, { style, settings: SIGNAL_ONLY as never, home })
    const base = resolveTheme(m, { style, home })
    for (const k of Object.keys(SIGNAL_ONLY) as (keyof typeof SIGNAL_ONLY)[]) expect(t.settings[k], `${key} ${k}`).toEqual(base.settings[k])
    const p = t.home.find((s) => s.key === 'products'), b = t.home.find((s) => s.key === 'image_text')
    expect(p && p.key === 'products' && p.layout).toBe('grid')
    expect(b?.scheme).toBe('paper')
  })
})

describe('the signal band', () => {
  const m = manifestOf('signal', '1.0.0')!
  it('is the final accent with its readable colour, after the brand colour', () => {
    const t = resolveTheme(m, { style: 'cobalt', settings: { brandColour: '#1E5C4A' } })
    const v = schemeVars(t, 'signal')
    expect(v['--store-paper']).toBe('#1E5C4A')
    expect(v['--store-ink']).toBe(onColour('#1E5C4A'))
    expect(v['--store-button']).toBe(onColour('#1E5C4A'))
  })
  it('without a brand colour, the style’s own accent', () => {
    const t = resolveTheme(m, { style: 'chilli' })
    expect(schemeVars(t, 'signal')['--store-paper']).toBe(t.schemes.paper.accent)
  })
  it('Signal keeps its own values', () => {
    const t = resolveTheme(m, { style: 'cobalt', home })
    expect(t.settings).toMatchObject({ header: 'float', footer: 'photo', card: 'tile', labels: 'pill', railCounter: true, pairing: 'schibsted' })
    expect(t.home.find((s) => s.key === 'products')).toMatchObject({ layout: 'tabs' })
    expect(t.home.find((s) => s.key === 'image_text')).toMatchObject({ scheme: 'signal' })
  })
})

describe('the theme keys the database accepts are the catalogue’s', () => {
  it('THEME_KEYS = the catalogue', async () => {
    const { THEME_KEYS } = await import('@/lib/db/schema-themes')
    expect([...THEME_KEYS].sort()).toEqual(Object.keys(CATALOGUE).sort())
  })
})
