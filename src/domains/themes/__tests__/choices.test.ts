import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { BASE_CHOICES, choicesFor } from '../choices'
import { readSettings, resolveTheme } from '../resolve'
import { FEEL_DEFAULTS, PAGE_DEFAULTS, type ThemeManifest } from '../types'

// The 2.0 choices (plan 2026-11-09-themes-three, architecture review findings 2 and 7).
const all: ThemeManifest[] = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
// The older generation: a 1.x theme with no choices of its own (Signal is a new theme at 1.0.0 that lists its choices).
const v1 = all.filter((m) => m.version.startsWith('1.') && !m.allowed.choices)
// Every value added with the 2.0 themes, as a layer.
const NEW = { buttons: 'underline', gallery: 'stack', header: 'split', footer: 'statement', buttonShape: 'pill', buttonMotion: 'fill', cardHover: 'zoom', entrance: 'rise', reveal: true, buyBoxSticky: true, buyBar: true, footerScheme: 'ink', checkout: 'focused' } as const

describe('a 1.x theme never renders a 2.0 value', () => {
  it.each(v1.map((m) => [`${m.key}@${m.version}`, m] as const))('%s', (_k, m) => {
    const style = m.styles[0]!.key
    expect(resolveTheme(m, { style, settings: NEW as never })).toEqual(resolveTheme(m, { style, settings: {} }))
    expect(resolveTheme(m, { style, settings: { gallery: 'rail' } })).toEqual(resolveTheme(m, { style }))
  })
  it('and resolves the new choices to today’s look', () => {
    for (const m of v1) {
      const s = resolveTheme(m, { style: m.styles[0]!.key }).settings
      for (const k of Object.keys(FEEL_DEFAULTS) as (keyof typeof FEEL_DEFAULTS)[]) expect(s[k], `${m.key} ${k}`).toBe(FEEL_DEFAULTS[k])
    }
  })
})

describe('choicesFor', () => {
  it('a key a manifest leaves out keeps what every 1.x theme had; an old key stays open', () => {
    const m = { allowed: { pairings: [], headers: [], footers: [], sections: [] } } as unknown as ThemeManifest
    expect(choicesFor(m, 'buttonMotion')).toEqual(['press'])
    expect(choicesFor(m, 'gallery')).toEqual(['swipe', 'thumbs'])
    expect(choicesFor(m, 'corners')).toBeNull()
    expect(choicesFor({ allowed: { ...m.allowed, choices: { buttonMotion: ['lift', 'fill'] } } } as ThemeManifest, 'buttonMotion')).toEqual(['lift', 'fill'])
  })
  it('every default of every manifest is one of its own choices', () => {
    for (const m of all) for (const k of Object.keys(BASE_CHOICES) as (keyof typeof BASE_CHOICES)[]) {
      const d = { ...FEEL_DEFAULTS, ...PAGE_DEFAULTS, ...m.defaults } as Record<string, unknown>
      const list = choicesFor(m, k)
      if (list) expect(list, `${m.key}@${m.version} ${k}`).toContain(d[k])
    }
  })
})

describe('readSettings: a value this build can’t read drops only itself', () => {
  it('keeps the brand colour and the rest when one value is unknown (a reverted deploy)', () => {
    expect(readSettings({ brandColour: '#7a1f2b', corners: 'round', header: 'hologram', gallery: 'carousel' })).toEqual({ brandColour: '#7A1F2B', corners: 'round' })
    expect(readSettings(null)).toEqual({})
    expect(readSettings({ nope: 1 })).toEqual({})
    expect(readSettings(JSON.parse('{"constructor":1,"toString":2,"__proto__":{"corners":"round"},"corners":"soft"}'))).toEqual({ corners: 'soft' })
  })
})
