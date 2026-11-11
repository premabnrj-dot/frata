import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { contrast } from '../contrast'
import { themeCheck } from '../check'
import { SectionSchema } from '../sections'
import type { ThemeManifest } from '../types'

// =============================================================================
// check:theme — every manifest in the catalogue (themes plan T0·5). A vitest, not an .mjs gate: manifests are TS.
// Fails on: a section not in the library or not allowed, an invalid section, > 20 sections, a source outside the
// list (never by cost), a style count outside 1–5, a scheme that fails contrast, a duplicate key.
// =============================================================================

const all: ThemeManifest[] = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
const name = (m: ThemeManifest) => `${m.key}@${m.version}`

describe.each(all.map((m) => [name(m), m] as const))('%s', (_n, m) => {
  it('passes themeCheck (the one check: styles, defaults, made, home, sources, contrast)', () => {
    expect(themeCheck(m)).toEqual([])
  })
  it('its key and version match where the catalogue lists it', () => {
    expect(CATALOGUE[m.key]?.[m.version]).toBe(m)
  })
})

describe('themeCheck: each rule fires', () => {
  const good = CATALOGUE.signal!['1.2.0']!
  const paper = good.styles[0]!.schemes.paper
  it.each([
    ['a bad version', { ...good, version: '1.2' }, /major\.minor\.patch/],
    ['six styles', { ...good, styles: [...good.styles, ...good.styles, ...good.styles, ...good.styles, ...good.styles, ...good.styles].slice(0, 6) }, /6 styles/],
    ['a default header not allowed', { ...good, defaults: { ...good.defaults, header: 'circles' as const }, allowed: { ...good.allowed, headers: ['float' as const] } }, /default header/],
    ['made-for outside allowed', { ...good, made: { sections: ['logos' as const] }, allowed: { ...good.allowed, sections: ['hero' as const, 'products' as const] } }, /Made-for section logos/],
    ['21 home sections', { ...good, home: Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, key: 'rich_text' as const, text: 'x' })) }, /at most 20/],
    ['a cost source', { ...good, home: [{ id: 'x', key: 'products' as const, heading: 'Top', source: { kind: 'by_margin' }, count: 4 }] }, /Home section x/],
    ['an unknown section', { ...good, home: [{ id: 'x', key: 'lookbook' }] }, /isn't in the library/],
    ['unreadable sub text', { ...good, styles: [{ ...good.styles[0]!, schemes: { ...good.styles[0]!.schemes, paper: { ...paper, sub: '#D9D3CC' as const } } }] }, /sub reads/],
  ])('%s', (_n, m, want) => {
    expect(themeCheck(m as unknown as ThemeManifest).join('\n')).toMatch(want)
  })
})

describe('Classic is today’s shop', () => {
  it('its paper scheme equals the --store-* values in globals.css (one look until T1 removes the CSS copy)', () => {
    const css = readFileSync('src/app/base.css', 'utf8')
    const val = (v: string) => new RegExp(`--store-${v}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)?.[1]?.toUpperCase()
    const s = CATALOGUE.classic!['1.0.0']!.styles.find((x) => x.key === 'oxide')!.schemes.paper
    expect([s.bg, s.text, s.sub, s.line, s.chip, s.good, s.bad, s.accent]).toEqual(['paper', 'ink', 'sub', 'line', 'chip', 'good', 'bad', 'accent'].map(val))
    for (const k of ['indigo', 'moss', 'wine', 'ink']) {
      const want = new RegExp(`data-accent="${k}"\\]\\s*\\{\\s*--store-accent:\\s*(#[0-9A-Fa-f]{6})`).exec(css)?.[1]?.toUpperCase()
      expect(CATALOGUE.classic!['1.0.0']!.styles.find((x) => x.key === k)!.schemes.paper.accent).toBe(want)
    }
  })
})

describe('the gate itself', () => {
  it('a planted bad manifest fails it (unknown section, a cost source, unreadable colours, 6 styles)', () => {
    const good = CATALOGUE.classic!['1.0.0']!
    const bad = { ...good.styles[0]!.schemes.paper, sub: '#D9D3CC' as const }
    expect(contrast(bad.sub, bad.bg)).toBeLessThan(4.5)
    expect(() => SectionSchema.parse({ id: 'x', key: 'products', heading: 'Top', source: { kind: 'by_margin' }, count: 4 })).toThrow()
    expect(() => SectionSchema.parse({ id: 'x', key: 'lookbook' })).toThrow()
    expect([...good.styles, ...good.styles].length).toBeGreaterThan(5)
  })
  it('no section imports a type that can carry a merchant cost (ADR-0003)', () => {
    const src = readFileSync('src/components/storefront/sections/index.tsx', 'utf8') + readFileSync('src/domains/themes/sections.ts', 'utf8')
    expect(src).not.toMatch(/schema-orders|domains\/orders\/profit|costPrice|cogs|freight/i)
  })
})

describe('the brand colour picks (Look v3)', () => {
  it('each reads on every light scheme of every 2.x theme', async () => {
    const { BRAND_COLOUR_PICKS } = await import('../catalogue/kit')
    const { brandColourProblem } = await import('../layer')
    for (const m of all.filter((x) => x.version.startsWith('2.'))) for (const st of m.styles) for (const c of BRAND_COLOUR_PICKS) {
      expect(brandColourProblem(c, [st.schemes.paper, st.schemes.tint ?? st.schemes.paper]), `${m.key}@${m.version} ${st.key} ${c}`).toBeNull()
    }
  })
})
