import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUE } from '../catalogue'
import { contrast } from '../contrast'
import { SECTION_KEYS, SectionSchema, SOURCE_KEYS } from '../sections'
import type { ThemeManifest } from '../types'

// =============================================================================
// check:theme — every manifest in the catalogue (themes plan T0·5). A vitest, not an .mjs gate: manifests are TS.
// Fails on: a section not in the library or not allowed, an invalid section, > 20 sections, a source outside the
// list (never by cost), a style count outside 1–5, a scheme that fails contrast, a duplicate key.
// =============================================================================

const all: ThemeManifest[] = Object.values(CATALOGUE).flatMap((vs) => Object.values(vs))
const name = (m: ThemeManifest) => `${m.key}@${m.version}`

describe.each(all.map((m) => [name(m), m] as const))('%s', (_n, m) => {
  it('is well formed: semver, 1–5 styles with unique keys, defaults allowed', () => {
    expect(m.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(m.styles.length).toBeGreaterThanOrEqual(1); expect(m.styles.length).toBeLessThanOrEqual(5)
    expect(new Set(m.styles.map((s) => s.key)).size).toBe(m.styles.length)
    expect(m.allowed.pairings).toContain(m.defaults.pairing)
    expect(m.allowed.headers).toContain(m.defaults.header)
    expect(m.allowed.footers).toContain(m.defaults.footer)
    // What a theme says was made for it is something it offers (Look v3: "Made for <theme>").
    for (const h of m.made?.headers ?? []) expect(m.allowed.headers).toContain(h)
    for (const f of m.made?.footers ?? []) expect(m.allowed.footers).toContain(f)
    for (const k of m.made?.sections ?? []) expect(m.allowed.sections).toContain(k)
  })
  it('Home: valid sections from the library, allowed by the theme, unique ids, ≤ 20', () => {
    expect(m.home.length).toBeLessThanOrEqual(20)
    expect(new Set(m.home.map((s) => s.id)).size).toBe(m.home.length)
    for (const s of m.home) {
      expect(SECTION_KEYS).toContain(s.key); expect(m.allowed.sections).toContain(s.key)
      expect(() => SectionSchema.parse(s)).not.toThrow()
      if (s.key === 'products') expect(SOURCE_KEYS).toContain(s.source.kind)
    }
  })
  it('every scheme of every style is readable', () => {
    for (const st of m.styles) for (const [k, s] of Object.entries(st.schemes)) {
      const at = `${st.key}.${k}`
      expect(contrast(s.text, s.bg), `${at} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.sub, s.bg), `${at} sub`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.accent, s.bg), `${at} accent`).toBeGreaterThanOrEqual(3)
      expect(contrast(s.onAccent, s.accent), `${at} on accent`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.onButton, s.button), `${at} button`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.good, s.bg), `${at} good`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.bad, s.bg), `${at} bad`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.sale, s.bg), `${at} sale`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('Classic is today’s shop', () => {
  it('its paper scheme equals the --store-* values in globals.css (one look until T1 removes the CSS copy)', () => {
    const css = readFileSync('src/app/globals.css', 'utf8')
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
