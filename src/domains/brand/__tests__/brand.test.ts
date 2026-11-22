import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE } from '../defaults'
import { COLOUR_ROLES, emptyRecord, FONTS, fontStack, normalHex, type BrandRecord, type Palette } from '../record'
import { brandProblems, logoFileProblem, pairChecks, pairProblem, renderRecord, sniffLogo } from '../check'
import { LINE_WORDS, lineProblem } from '../lines'
import { liveSeason, seasonProblem, withSeason, type Season } from '../seasons'
import { accentOf } from '../accent'
import { hasCodeSite } from '../code-site'
import { changeSummary, changesOf } from '../diff'
import { PAIRINGS } from '@/domains/themes/types'
import { PLAIN_WORDS } from '@/domains/content/plain-text'

// House of Ayuda's eleven colours (its design system v1, 2026-11-16; the mockup's AYUDA).
const AYUDA: Palette = { bg: '#FBF7F1', panel: '#F2EADF', text: '#221A14', muted: '#665A4E', accent: '#8C1D2C', on: '#FBF7F1', edge: '#9A8B7A', line: '#DDD0BE', good: '#2F6B3B', warn: '#8A5300', bad: '#A3261B' }
const ayuda = (o: Partial<BrandRecord> = {}): BrandRecord => ({ ...emptyRecord(AYUDA), display: 'tiro', body: 'mukta', radius: 4, ...o })

describe('the record', () => {
  it('names eleven roles', () => { expect(COLOUR_ROLES).toHaveLength(11) })
  it('keeps every theme face and adds Mukta and Tiro Devanagari Hindi (owner call 2)', () => {
    expect([...FONTS].sort()).toEqual([...PAIRINGS, 'mukta', 'tiro'].sort())
  })
  it('stacks a serif on Georgia and a sans on the system face', () => {
    expect(fontStack('tiro')).toBe("'Tiro Devanagari Hindi', Georgia, serif")
    expect(fontStack('mukta')).toBe("'Mukta', system-ui, sans-serif")
  })
  it('normalises a typed hex', () => { expect(normalHex(' #fbf7f1 ')).toBe('#FBF7F1'); expect(normalHex('#fff')).toBeNull(); expect(normalHex('red')).toBeNull() })
})

describe('brandProblems', () => {
  it('passes Frrata’s defaults and House of Ayuda', () => {
    expect(brandProblems(emptyRecord(DEFAULT_PALETTE))).toEqual([])
    expect(brandProblems(ayuda())).toEqual([])
  })
  it('names a light accent at the Accent field in the mockup’s words', () => {
    const b = ayuda({ palette: { ...AYUDA, accent: '#D9822B' } })
    const p = brandProblems(b)
    expect(p.find((x) => x.field === 'accent')?.message).toMatch(/^Text on this accent is 2\.\d\d:1\. Use a darker one, 4\.5:1 or more\.$/)
  })
  it('asks for a lighter accent when its text is dark', () => {
    const p = brandProblems(ayuda({ palette: { ...AYUDA, on: '#221A14', accent: '#3A2A20' } }))
    expect(p.find((x) => x.field === 'accent')?.message).toMatch(/Use a lighter one/)
  })
  it('holds a control edge to 3:1, text to 4.5:1', () => {
    const checks = pairChecks(AYUDA)
    expect(checks.find((c) => c.role === 'edge')!.need).toBe(3)
    expect(checks.find((c) => c.role === 'text')!.need).toBe(4.5)
    expect(brandProblems(ayuda({ palette: { ...AYUDA, edge: '#DDD0BE' } })).map((x) => x.field)).toEqual(['edge'])
  })
  it('refuses a bad hex, a font off the list, a corner off the steps, an odd spacing', () => {
    const bad = { ...ayuda(), palette: { ...AYUDA, text: 'red' as `#${string}` }, display: 'comic' as never, radius: 2 as never, density: 'airy' as never }
    expect(brandProblems(bad).map((x) => x.field).sort()).toEqual(['density', 'display', 'radius', 'text'])
  })
  it('names a failing pair other than the accent’s text in words', () => {
    const p: Palette = { ...AYUDA, muted: '#B8AC9E' }
    const c = pairChecks(p).find((x) => x.role === 'muted' && !x.ok)!
    expect(pairProblem(p, c).message).toMatch(/^Secondary text on Background is \d\.\d\d:1\. Pick one with more contrast, 4\.5:1 or more\.$/)
  })
  it('leaves out a pair with a half-typed colour instead of throwing', () => {
    const p = { ...AYUDA, accent: '#8C1' as `#${string}` }
    expect(() => pairChecks(p)).not.toThrow()
    expect(pairChecks(p).some((c) => c.role === 'accent' || c.against === 'accent')).toBe(false)
    expect(brandProblems(ayuda({ palette: p })).map((x) => x.field)).toEqual(['accent'])
  })
  it('needs a main logo before the others', () => {
    expect(brandProblems(ayuda({ logos: { main: null, mark: 'm', stacked: null, reversed: null } })).map((x) => x.field)).toEqual(['main'])
  })
})

describe('a logo file', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
  it('sniffs the bytes, never the name', () => {
    expect(sniffLogo(png)).toBe('png'); expect(sniffLogo(webp)).toBe('webp')
    expect(sniffLogo(new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg')
    expect(sniffLogo(new TextEncoder().encode('<html><svg/></html>'))).toBeNull()
    expect(sniffLogo(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
    expect(sniffLogo(new TextEncoder().encode('\uFEFF<!-- made in Figma --><svg viewBox="0 0 1 1"/>'))).toBe('svg')
    expect(sniffLogo(png.subarray(0, 4))).toBeNull()
  })
  it('holds the limit line: PNG and WebP at least 120 px wide', () => {
    expect(logoFileProblem({ kind: 'png', bytes: 1000, width: 119 })).toBe('This logo is 119 px wide. Upload one at least 120 px wide.')
    expect(logoFileProblem({ kind: 'webp', bytes: 1000, width: 400 })).toBeNull()
    expect(logoFileProblem({ kind: 'svg', bytes: 1000 })).toBeNull()
    expect(logoFileProblem({ kind: 'svg', bytes: 300 * 1024 })).toMatch(/over 200 kB/)
    expect(logoFileProblem({ kind: null, bytes: 10 })).toBe('Upload an SVG, PNG or WebP file.')
    expect(logoFileProblem({ kind: 'png', bytes: 3 * 1024 * 1024, width: 800 })).toBe('This file is over 2 MB. Upload a smaller one.')
  })
})

describe('renderRecord (spec § 3: a record that fails a later rule draws the defaults)', () => {
  it('keeps a passing record and falls back, logos kept, when a season’s accent fails on its background', () => {
    const ok = ayuda({ logos: { main: 'x.webp', mark: null, stacked: null, reversed: null } })
    expect(renderRecord(ok, AYUDA)).toBe(ok)
    const bad = { ...ok, palette: { ...ok.palette, accent: '#FBF7F0' as const } }
    const r = renderRecord(bad, AYUDA)
    expect(r.palette.accent).toBe(AYUDA.accent); expect(r.logos.main).toBe('x.webp'); expect(r.display).toBe('inter')
  })
})

describe('lineProblem', () => {
  it('keeps plain words in Hindi and English', () => { expect(lineProblem('धन्यवाद, see you soon', 60)).toBeNull() })
  it.each([['pay me at ayuda@okhdfc'], ['write to riya@kesar.in'], ['call +91 98450 12345'], ['9845012345'], ['account 1234 5678'], ['कॉल ९८४५०१२३४५'],
    ['call ９８４５０１２３４５'], ['www.ayuda.in'], ['https://x.co'], ['visit ayuda.shop'], ['visit ayuda.online'], ['ayuda.site'], ['ａｙｕｄａ．ｓｈｏｐ']])('refuses %j', (s) => {
    expect(lineProblem(s, 80)).not.toBeNull()
  })
  // The P2 mockup's words, screen 9 (owner-approved 2026-11-16).
  it.each([
    ['Thank you. For exchanges, pay the fee to ayuda@okicici.', LINE_WORDS.upi],
    ['Call 98000 00000', LINE_WORDS.phone], ['कॉल ९८४५०१२३४५', LINE_WORDS.phone], ['call +91 98450 12345', LINE_WORDS.phone], ['call ０９８４５０１２３４５', LINE_WORDS.phone],
    ['Thank you. See our new edit at houseofayuda.com', LINE_WORDS.link],
    ['Thank you. Your loyalty code is 4471 9021.', LINE_WORDS.number], ['account 1234 5678', LINE_WORDS.number],
  ])('names what to take out: %j', (s, words) => { expect(lineProblem(s, 120)).toBe(words) })
  // Security review 2026-11-22 (MED-1): no separator splits a number past the rule, and a UPI ID may carry spaces.
  it.each([
    ['Call (98450)12345', LINE_WORDS.phone], ['Call 98450,12345', LINE_WORDS.phone], ['Call 98450_12345', LINE_WORDS.phone],
    ['Call 98450—12345', LINE_WORDS.phone], ['Call 98450 or 12345', LINE_WORDS.phone], ['Pay shop @ ybl', LINE_WORDS.upi],
    ['example。com', LINE_WORDS.link], ['code 12, 34, 56', LINE_WORDS.number],
  ])('refuses the spelling %j', (s, words) => { expect(lineProblem(s, 120)).toBe(words) })
  it('refuses a date in figures (write it in words)', () => { expect(lineProblem('sale till 10-11-2026', 80)).toBe(LINE_WORDS.number) })
  it('keeps M.R.P. and a price', () => { expect(lineProblem('M.R.P. ₹2,790 inclusive of all taxes', 80)).toBeNull() })
  it('allows a short number (a size, a year)', () => { expect(lineProblem('Ships in 2 days, since 2019', 80)).toBeNull() })
  it('holds its length and the plain-text rule', () => {
    expect(lineProblem('Almost yours, beautiful one', 24)).toBe('Up to 24 characters.')
    expect(lineProblem('<b>hi</b>', 60)).toBe(PLAIN_WORDS)
  })
  it('names the money rule before the length', () => { expect(lineProblem('Almost yours, pay ayuda@okicici', 24)).toBe(LINE_WORDS.upi) })
})

describe('seasons', () => {
  const s = (id: string, startsAt: string, endsAt: string | null): Season => ({ id, name: 'Diwali', startsAt, endsAt, accent: '#7A1F2B', on: '#FFFFFF' })
  const seasons = [s('a', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'), s('b', '2026-11-05T00:00:00Z', null), s('c', '2026-12-01T00:00:00Z', null)]
  it('never answers a future season; the later start wins', () => {
    expect(liveSeason(seasons, new Date('2026-10-31T00:00:00Z'))).toBeNull()
    expect(liveSeason(seasons, new Date('2026-11-02T00:00:00Z'))?.id).toBe('a')
    expect(liveSeason(seasons, new Date('2026-11-06T00:00:00Z'))?.id).toBe('b')
    expect(liveSeason(seasons, new Date('2026-12-02T00:00:00Z'))?.id).toBe('c')
  })
  it('stops at its end time', () => { expect(liveSeason([seasons[0]!], new Date('2026-11-10T00:00:00Z'))).toBeNull() })
  it('paints the accent only', () => {
    const b = withSeason(ayuda(), seasons[0]!)
    expect(b.palette.accent).toBe('#7A1F2B'); expect(b.palette.bg).toBe(AYUDA.bg)
  })
  it('checks name, dates and contrast', () => {
    expect(seasonProblem({ ...seasons[0]! }, AYUDA.bg)).toBeNull()
    expect(seasonProblem({ ...seasons[0]!, endsAt: '2026-10-01T00:00:00Z' }, AYUDA.bg)).toMatch(/after it starts/)
    expect(seasonProblem({ ...seasons[0]!, accent: '#F2C14E' }, AYUDA.bg)).toMatch(/4\.5:1/)
    expect(seasonProblem({ ...seasons[0]!, name: ' ' }, AYUDA.bg)).toMatch(/40 characters/)
    expect(seasonProblem({ ...seasons[0]!, name: 'x'.repeat(41) }, AYUDA.bg)).toMatch(/40 characters/)
    expect(seasonProblem({ ...seasons[0]!, accent: '#7a1f2b' as `#${string}` }, AYUDA.bg)).toMatch(/Type colours/)
    expect(seasonProblem({ ...seasons[0]!, startsAt: 'soon' }, AYUDA.bg)).toMatch(/after it starts/)
  })
})

describe('accentOf and hasCodeSite', () => {
  const now = new Date('2026-11-06T00:00:00Z')
  const diwali: Season = { id: 'd', name: 'Diwali', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-10T00:00:00Z', accent: '#7A1F2B', on: '#FFFFFF' }
  it('a record’s accent and its text, a live season’s, else the theme’s on white', () => {
    expect(accentOf(ayuda(), [], now, '#8A3B1F')).toEqual({ accent: '#8C1D2C', on: '#FBF7F1' })
    expect(accentOf(ayuda(), [diwali], now, '#8A3B1F')).toEqual({ accent: '#7A1F2B', on: '#FFFFFF' })
    expect(accentOf(ayuda(), [diwali], new Date('2026-11-11T00:00:00Z'), '#8A3B1F').accent).toBe('#8C1D2C')
    expect(accentOf(null, [diwali], now, '#8A3B1F')).toEqual({ accent: '#8A3B1F', on: '#FFFFFF' })
  })
  it('a code site: its own Website, or a live key while it is built', () => {
    expect(hasCodeSite({ siteOrigin: null, liveKeys: 0 })).toBe(false)
    expect(hasCodeSite({ siteOrigin: null, liveKeys: 1 })).toBe(true)
    expect(hasCodeSite({ siteOrigin: 'https://ayuda.in', liveKeys: 0 })).toBe(true)
  })
})

describe('changes', () => {
  it('counts and words a partner’s change as the Notices row does', () => {
    const before = emptyRecord(AYUDA)
    const after = ayuda({ logos: { main: 'a', mark: 'b', stacked: 'c', reversed: 'd' }, radius: 8 })
    const cs = changesOf(before, after)
    expect(cs.filter((c) => c.kind === 'logo')).toHaveLength(4)
    expect(changeSummary(changesOf(before, { ...after, radius: 8 }))).toBe('4 logo files and 2 fonts.')
    expect(changeSummary([cs.find((c) => c.kind === 'font')!])).toBe('1 font.')
    expect(changeSummary([])).toBe('No changes.')
    const more = changesOf(before, { ...after, palette: { ...AYUDA, accent: '#7A1F2B', bg: '#FFFFFF' }, radius: 0, density: 'roomy' })
    expect(changeSummary(more)).toBe('4 logo files, 2 colours, 2 fonts, 1 corner setting and 1 spacing setting.')
  })
  it('names a font change from and to', () => {
    expect(changesOf(emptyRecord(AYUDA), ayuda()).find((c) => c.label === 'Headings font')).toMatchObject({ from: 'Inter', to: 'Tiro Devanagari Hindi' })
  })
})
