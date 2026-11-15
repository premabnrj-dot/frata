import { describe, expect, it } from 'vitest'
import { contentOut, faqOut, storePageOut } from '../2026-12/content-map'
import * as S from '../2026-12/schemas'
import { contentOf } from '../../content/kinds'
import { resolvePage, type PageNode } from '../../pages/page'

const T = '11111111-1111-1111-1111-111111111111'
const m = { tenantId: T, mediaHost: 'abc.public.blob.vercel-storage.com' }
const now = new Date('2026-12-10T10:00:00Z')
const row = (kind: string, key: string, value: unknown, at: Partial<Record<'startsAt' | 'endsAt' | 'stoppedAt', string>> = {}, made = '2026-12-01T00:00:00Z') =>
  ({ id: `${kind}-${key}`, kind, key, value, startsAt: at.startsAt ?? null, endsAt: at.endsAt ?? null, stoppedAt: at.stoppedAt ?? null, createdAt: made, updatedAt: made })

describe('content (V1 SA1)', () => {
  const c = contentOf([
    row('announcement', 'a', { text: 'Standing bar', link: '/products', scheme: 'paper' }),
    row('announcement', 'b', { text: 'Sale bar', link: null, scheme: 'ink' }, { startsAt: '2026-12-09T00:00:00Z', endsAt: '2026-12-12T00:00:00Z' }),
    row('announcement', 'c', { text: 'Later bar', link: null, scheme: 'tint' }, { startsAt: '2026-12-20T00:00:00Z' }),
    row('menu', 'main', [{ id: 'x', label: 'Shop', link: '/products', icon: null, children: [{ id: 'y', label: 'Kurtas', link: '/collections/kurtas', icon: null, children: [] }] }]),
    row('contact', 'contact', { line: 'Call 98xxxxxx10, 10 to 6' }),
  ])
  const out = contentOut(c, [{ handle: 'about', title: 'Our story', template: 'about' }], now)
  it('answers live bars in the store’s order, each with its end; a later one never', () => {
    expect(out.announcements.map((a) => a.text)).toEqual(['Sale bar', 'Standing bar'])
    expect(out.announcements[0]!.endsAt).toBe('2026-12-12T00:00:00.000Z')
    expect(out.announcements[1]!.endsAt).toBeNull()
  })
  it('keeps the menus, an unset one null, and the Contact line and pages', () => {
    expect(out.menus.main?.[0]).toEqual({ label: 'Shop', link: '/products', icon: null, children: [{ label: 'Kurtas', link: '/collections/kurtas', icon: null, children: [] }] })
    expect(out.menus.footer).toBeNull()
    expect(out.contact).toBe('Call 98xxxxxx10, 10 to 6')
    expect(out.pages).toEqual([{ handle: 'about', title: 'Our story', kind: 'about' }])
    expect(S.Content.parse(out)).toEqual(out)
  })
  it('empty content is a valid answer', () => {
    expect(S.Content.parse(contentOut(contentOf([]), [], now))).toEqual({ announcements: [], menus: { main: null, footer: null, tabs: null }, contact: null, pages: [] })
  })
})

describe('pages and the FAQ', () => {
  const photo = { base: `https://${m.mediaHost}/tenants/${T}/theme/abc-123`, widths: [400, 800], width: 800, height: 1000, alt: 'Our looms', decorative: false, focus: null }
  const foreign = { ...photo, base: 'https://evil.example/tenants/x/theme/y' }
  const facts = { shopName: 'Rang', codOn: true } as never
  it('a page answers what the store shows a shopper: its own words, no example, photos only from our store', () => {
    const nodes = resolvePage('about', { story: { kind: 'text', body: [[{ text: 'We weave in Indore.', bold: true }]] }, photo: { kind: 'image', image: photo } }, 'shop', { facts, overrides: {}, inr: String })
    const out = storePageOut(m, { handle: 'about', title: 'Our story', template: 'about' }, nodes)
    expect(S.StorePage.parse(out)).toEqual(out)
    expect(JSON.stringify(out)).not.toContain('Natural dyes') // the template's examples
    expect(out.blocks[0]).toEqual({ kind: 'text', paragraphs: [[{ text: 'We weave in Indore.', bold: true, italic: false, link: null }]] })
    expect(out.blocks.some((b) => b.kind === 'image')).toBe(true)
    const off = storePageOut(m, { handle: 'about', title: 'x', template: 'about' }, resolvePage('about', { photo: { kind: 'image', image: foreign } }, 'shop', { facts, overrides: {}, inr: String }))
    expect(JSON.stringify(off)).not.toContain('evil.example')
  })
  it('flattens groups and columns, and drops a link off the store', () => {
    const nodes: PageNode[] = [
      { kind: 'columns', id: 'c', phone: 'swipe', children: [{ kind: 'group', id: 'g', children: [{ kind: 'heading', id: 'h', size: 's', text: 'Handloom', level: 3 }] }] },
      { kind: 'button', id: 'b', label: 'Shop', link: 'https://evil.example' },
      { kind: 'product_grid', id: 'p', source: { kind: 'newest' } as never },
    ]
    const out = storePageOut(m, { handle: 'x', title: 'x', template: 'about' }, nodes)
    expect(out.blocks).toEqual([{ kind: 'columns', phone: 'swipe', blocks: [{ kind: 'group', blocks: [{ kind: 'heading', level: 3, text: 'Handloom' }] }] }])
  })
  it('a page address the owner typed with a double dash still answers (impact review BLOCKER)', () => {
    const out = storePageOut(m, { handle: 'our--story', title: 'Our story', template: 'about' }, [])
    expect(S.StorePage.parse(out).handle).toBe('our--story')
    expect(S.Content.parse(contentOut(contentOf([]), [{ handle: 'our--story', title: 'x', template: 'about' }], now)).pages[0]!.handle).toBe('our--story')
  })
  it('the FAQ: own answers as written, a rewritten policy as a pointer', () => {
    const nodes: PageNode[] = [{ kind: 'faq', id: 'questions', items: [{ q: 'Do you make to order?', a: 'Some pieces.' }, { q: 'Can I return?', a: 'Read our policy', href: '/policies/returns' }] }]
    const out = faqOut({ handle: 'faq', title: 'Questions' }, nodes)
    expect(S.Faq.parse(out)).toEqual(out)
    expect(out.items).toEqual([{ question: 'Do you make to order?', answer: 'Some pieces.', policy: null }, { question: 'Can I return?', answer: null, policy: 'returns' }])
  })
})
