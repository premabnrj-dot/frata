import { describe, expect, it } from 'vitest'
import { SENTINELS } from '../../../../scripts/cost-sentinels.mjs'
import * as S from '../2026-12/schemas'
import { brandOut, cardOut, collectionPageOut, offersOut, pageOut, productOut, searchOut, shopOut, type BrandIn, type CardIn, type ProductIn } from '../2026-12/map'

const T = '11111111-1111-1111-1111-111111111111'
const M = { tenantId: T, mediaHost: 'abc123.public.blob.vercel-storage.com' }
const now = new Date('2026-11-15T06:00:00Z')
const media = (id: string, tenant = T) => `https://abc123.public.blob.vercel-storage.com/tenants/${tenant}/products/${id}`
// Every cost a row could carry, set to a sentinel value: none may come out (ADR-0003).
const costs = Object.fromEntries(SENTINELS.map((k) => [k, 987654321]))
const v = (id: string, over: Record<string, unknown> = {}) => ({ id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, values: ['M'], price: 249000, compareAt: null, mrp: 299000, stock: 5, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderFull: false, ...costs, ...over })
const card = (n: number, over: Partial<CardIn> = {}): CardIn => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, handle: `kurta-${n}`, title: `Kurta ${n}`, status: 'active', publishAt: null, since: '2026-11-01T00:00:00Z',
  options: ['Size'], images: [{ base: media(`p${n}`), widths: [400, 800], alt: 'Kurta' }], variants: [v(String(n))], colours: [],
  categoryId: null, attributes: {}, tags: ['cotton'], ...costs, ...over,
} as CardIn)

describe('version 2026-12 mappers (spec § 3, ADR-0003)', () => {
  it('a card parses, and no cost ever comes out', () => {
    const out = S.Card.parse(cardOut(M, card(1), now))
    const json = JSON.stringify(out)
    for (const k of SENTINELS) expect(json).not.toContain(k)
    expect(json).not.toContain('987654321')
    expect(out.price).toEqual({ min: 249000, max: 249000, priorPrice: null })
    expect(out.image).toEqual({ sizes: [{ width: 400, url: media('p1') + '-400.webp' }, { width: 800, url: media('p1') + '-800.webp' }], width: 800, height: 1000, alt: 'Kurta', colour: null })
    expect(out.availability).toEqual({ kind: 'in_stock', left: null, shipsBy: null, leadDays: null })
  })
  it('a count only at 3 or fewer', () => {
    expect(cardOut(M, card(1, { variants: [v('1', { stock: 2 })] }), now).availability).toMatchObject({ kind: 'low_stock', left: 2 })
    expect(cardOut(M, card(1, { variants: [v('1', { stock: 9 })] }), now).availability).toMatchObject({ kind: 'in_stock', left: null })
  })
  it('photos only from Frrata’s store, in this shop’s folder', () => {
    expect(cardOut(M, card(1, { images: [{ base: 'javascript:alert(1)', widths: [400], alt: '' }] }), now).image).toBeNull()
    expect(cardOut(M, card(1, { images: [{ base: 'https://evil.in/x', widths: [400], alt: '' }] }), now).image).toBeNull()
    expect(cardOut(M, card(1, { images: [{ base: media('x', '22222222-2222-2222-2222-222222222222'), widths: [400], alt: '' }] }), now).image).toBeNull()
    // Another Vercel Blob store, even with this shop's folder in its path (security review LOW-2).
    expect(cardOut(M, card(1, { images: [{ base: `https://other9.public.blob.vercel-storage.com/tenants/${T}/products/x`, widths: [400], alt: '' }] }), now).image).toBeNull()
    expect(cardOut({ tenantId: T, mediaHost: null }, card(1), now).image).toBeNull()
  })
  it('text is passed as text, without control characters (a site renders it as text)', () => {
    expect(cardOut(M, card(1, { title: 'Chest < 40\u0007 & > 36' }), now).title).toBe('Chest < 40 & > 36')
  })
  it('a scheduled product is not listed, and M.R.P. only at or above the price', () => {
    expect(pageOut(M, [card(1, { publishAt: '2026-12-01T00:00:00Z' })], 1, now)!.products).toEqual([])
    const p: ProductIn = { ...card(7, { variants: [v('7', { mrp: 100000 })] }), description: '', stories: [], pairs: [], sizeChart: null }
    expect(productOut(M, p, now).variants[0]!.mrp).toBeNull()
  })
  it('lists only what the shop lists: no drafts, unlisted or scheduled, in pages and pairs', () => {
    const all = [card(1), card(2, { status: 'draft' }), card(3, { status: 'unlisted' }), card(4, { publishAt: '2026-12-01T00:00:00Z' }), card(5, { status: 'archived' })]
    const page = S.Page.parse(pageOut(M, all, 1, now))
    expect(page.products.map((p) => p.handle)).toEqual(['kurta-1'])
    expect(page.total).toBe(1)
    const p: ProductIn = { ...card(6), description: 'Hand block print', stories: [], pairs: [card(2, { status: 'draft' }), card(1)], sizeChart: null }
    expect(S.Product.parse(productOut(M, p, now)).pairs.map((x) => x.handle)).toEqual(['kurta-1'])
  })
  it('pages of 48, a page past the end is null, and the cap says so', () => {
    const many = Array.from({ length: 650 }, (_, i) => card(i + 1))
    const first = pageOut(M, many, 1, now)!
    expect(first.products).toHaveLength(48)
    expect(first).toMatchObject({ total: 600, pages: 13, truncated: true })
    expect(pageOut(M, many, 14, now)).toBeNull()
    expect(pageOut(M, [], 1, now)).toMatchObject({ products: [], pages: 1, total: 0 })
  })
  it('a collection holds only its listed members', () => {
    const c = { id: 'c', handle: 'sarees', title: 'Sarees', description: '', kind: 'manual' as const, matchAll: true, rules: [], sort: 'manual', productIds: [card(2).id, card(1).id] }
    const out = S.CollectionPage.parse(collectionPageOut(M, c, [card(1), card(2, { status: 'draft' })], 1, now))
    expect(out.products.map((p) => p.handle)).toEqual(['kurta-1'])
  })
  it('search matches every word in the title or tags, listed only', () => {
    const out = searchOut(M, [card(1, { title: 'Indigo kurta' }), card(2, { title: 'Indigo saree' }), card(3, { title: 'Indigo kurta', status: 'draft' })], 'indigo KURTA', now)
    expect(out.products.map((p) => p.handle)).toEqual(['kurta-1'])
  })
  it('the bar only while its offer is live', () => {
    const a = { title: 'Diwali', style: 'percent_off', percentBps: 1500, amountOff: null, minSubtotal: 0, code: null, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T18:00:00Z', startedAt: '2026-11-01T00:00:00Z', pausedAt: null, endedAt: null, stoppedAt: null }
    expect(S.Offers.parse(offersOut(a, now)).bar?.endsAt).toBe('2026-11-30T18:00:00Z')
    expect(offersOut({ ...a, pausedAt: '2026-11-10T00:00:00Z' }, now)).toEqual({ bar: null })
    expect(offersOut(null, now)).toEqual({ bar: null })
  })
  it('the shop: the legal block, closed links, no cost', () => {
    const s = { publishedAt: '2026-11-01T00:00:00Z', pause: null, tagline: 'Hand block print', seoTitle: '', seoDescription: '', codMin: 0, zones: null, shopName: 'Kesar Studio', shopLanguage: 'en' as const, logoUrl: 'https://evil.in/logo.png', pricesIncludeGst: true, codOn: true, codMax: 300000, codCharge: 4900, shippingFlat: 8500, freeShippingAbove: 199900,
      dispatchDays: 2, metroDays: 3, restDays: 6, returnKind: 'exchange_or_refund' as const, returnDays: 7, legalName: 'Kesar Studio LLP', address: 'Jaipur', supportEmail: 'care@kesar.in', supportPhone: '+91 98450 12345',
      grievanceName: 'Meera', grievanceRole: 'Owner', grievanceEmail: 'g@kesar.in', grievancePhone: '+91 98450 12345', instagram: 'javascript:alert(1)', whatsapp: '+91 98450 12345', ...costs }
    const out = S.Shop.parse(shopOut(M, s, { site: 'https://kesarstudio.in', checkout: 'https://checkout.kesarstudio.in' }, now))
    expect(out.logo).toBeNull()
    expect(out.social).toEqual({ instagram: null, whatsapp: '919845012345' })
    expect(shopOut(M, { ...s, instagram: '@kesar.studio' }, { site: null, checkout: 'https://x.in' }, now).social.instagram).toBe('kesar.studio')
    expect(out.status).toBe('open')
    expect(out.policies.map((p) => p.url)).toContain('https://checkout.kesarstudio.in/policies/returns')
    expect(shopOut(M, { ...s, publishedAt: null }, { site: null, checkout: 'https://x.in' }, now).status).toBe('opening_soon')
    expect(shopOut(M, { ...s, pause: { from: '2026-11-10T00:00:00Z', to: null } }, { site: null, checkout: 'https://x.in' }, now).status).toBe('paused')
    const zoned = S.Shop.parse(shopOut(M, { ...s, zones: [{ name: 'Metro', charge: 5000, freeAbove: null, daysMin: 2, daysMax: 3, codOn: true, codCharge: 4900, codMax: 300000 }] }, { site: null, checkout: 'https://x.in' }, now))
    expect(zoned.delivery.zones).toEqual([{ name: 'Metro', charge: 5000, freeAbove: null, days: [2, 3], payOnDelivery: { on: true, charge: 4900, max: 300000 } }])
    expect(out.legal.grievanceOfficer.name).toBe('Meera')
    for (const k of SENTINELS) expect(JSON.stringify(out)).not.toContain(k)
  })
  it('shop.brand (one-address P1·6): its keys pinned, files from this shop’s folder only, a live season applied, never a future one', () => {
    const own = `https://${M.mediaHost}/tenants/${T}/brand`
    const b: BrandIn = {
      record: { logos: { main: `${own}/${'a'.repeat(64)}.svg`, mark: 'https://evil.in/m.svg', stacked: null, reversed: `${own}/${'b'.repeat(64)}.svg` },
        palette: { bg: '#FBF7F1', panel: '#F2EADF', text: '#221A14', muted: '#665A4E', accent: '#8C1D2C', on: '#FBF7F1', edge: '#9A8B7A', line: '#DDD0BE', good: '#2F6B3B', warn: '#8A5300', bad: '#A3261B' },
        display: 'tiro', body: 'mukta', radius: 4, density: 'standard' },
      seasons: [{ id: 's1', name: 'Diwali', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z', accent: '#7A1F2B', on: '#FFFFFF' },
        { id: 's2', name: 'Wedding', startsAt: '2027-01-01T00:00:00Z', endsAt: null, accent: '#2E3A63', on: '#FFFFFF' }],
    }
    const out = S.Brand.parse(brandOut(M, b, now))
    // M6: the answer's whole shape, so a field can only ever be added on purpose.
    expect(Object.keys(out).sort()).toEqual(['colours', 'density', 'fonts', 'logos', 'radius', 'season'])
    expect(Object.keys(out.logos).sort()).toEqual(['main', 'mark', 'reversed', 'stacked'])
    expect(Object.keys(out.colours)).toHaveLength(11)
    expect(out.logos).toEqual({ main: b.record.logos.main, mark: null, stacked: null, reversed: b.record.logos.reversed })
    expect(out.fonts).toEqual({ headings: 'Tiro Devanagari Hindi', body: 'Mukta' })
    const season = now.getTime() >= Date.parse('2026-11-01T00:00:00Z') && now.getTime() < Date.parse('2026-11-30T00:00:00Z')
    expect(out.season).toEqual(season ? { name: 'Diwali', until: '2026-11-30T00:00:00Z' } : null)
    expect(out.colours.accent).toBe(season ? '#7A1F2B' : '#8C1D2C')
    expect(brandOut(M, { ...b, seasons: [b.seasons[1]!] }, now)?.season).toBeNull()
    expect(brandOut(M, null, now)).toBeNull()
    for (const k of SENTINELS) expect(JSON.stringify(out)).not.toContain(k)
  })
  it('every schema refuses an extra field (closed)', () => {
    expect(() => S.Card.parse({ ...cardOut(M, card(1), now), cogs: 1 })).toThrow()
    expect(() => S.Shop.parse({})).toThrow()
  })
})
