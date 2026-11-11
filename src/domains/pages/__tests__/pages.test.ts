import { describe, expect, it } from 'vitest'
import { designsCheck } from '@/domains/themes/blocks'
import { boundAnswer } from '@/domains/policies/answers'
import type { PolicyFacts } from '@/domains/policies/render'
import { faqItems, pageDescription, pageIssues, prunePage, resolvePage, type PageNode } from '../page'
import { FAQ_ID, PageDraftSchema, TEMPLATES, handleOf, type PageDraft } from '../templates'
import snapshot from './templates-v1.json'

// Theme Studio TS1a: pages from Frrata's templates, FAQ answers from Settings, never an example on the shop.

const facts: PolicyFacts = {
  shopName: 'Kesar Studio', legalName: 'Kesar Textiles LLP', address: 'B-14, Tilak Marg, Jaipur', supportEmail: 'care@kesar.in', supportPhone: '1414002211',
  grievanceName: 'Riya Mehta', grievanceRole: 'Partner', grievanceEmail: 'g@kesar.in', grievancePhone: '1414002212',
  returnKind: 'exchange_or_refund', returnDays: 7, shippingFlat: 4900, freeShippingAbove: 99900, dispatchDays: 2, metroDays: 4, restDays: 7,
  codOn: true, codMax: 1000000, codCharge: 4900, pricesIncludeGst: true, sells: ['women'],
}
const inr = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`
const ctx = { facts, overrides: {}, inr }
const draft = (over: Partial<PageDraft> = {}): PageDraft => PageDraftSchema.parse({ title: 'Questions', handle: 'faq', fill: {}, ...over })
const flat = (ns: PageNode[]): PageNode[] => ns.flatMap((n) => (n.kind === 'group' || n.kind === 'columns' ? [n, ...flat(n.children as PageNode[])] : [n]))

describe('templates', () => {
  it('only add, against the committed snapshot (no block removed or re-kinded, no new example)', () => {
    const was = snapshot as unknown as typeof TEMPLATES
    // A page holds one template, so the home page's "4 designs share a page" bound doesn't apply here.
    expect(designsCheck(Object.values(TEMPLATES), Object.values(was)).filter((p) => !p.includes('can share a page'))).toEqual([])
    const examples = (d: (typeof TEMPLATES)['about']) => JSON.stringify(d).match(/"example":true/g)?.length ?? 0
    for (const k of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) expect(examples(TEMPLATES[k]), `${k} gained an example: every shop's Publish would block`).toBeLessThanOrEqual(examples(was[k]))
  })
})

describe('the FAQ', () => {
  it('bound answers come from Settings, in the policy\'s own words', () => {
    const items = (flat(resolvePage('faq', {}, 'shop', ctx)).find((n) => n.kind === 'faq') as { items: { q: string; a: string }[] }).items
    expect(items.map((i) => i.q)).toEqual(['Can I pay on delivery?', 'How fast do you ship?', 'Can I return or exchange?'])
    expect(items[0]!.a).toMatch(/^Pay on delivery is available on orders up to ₹10,000/)
    expect(items[2]!.a).toMatch(/^You can ask for an exchange or a refund within 7 days/)
  })
  it('a rewritten policy: the answer points to it, never a second version', () => {
    expect(boundAnswer('returns', facts, { returns: 'Our own words.' }, inr)).toEqual({ policy: 'returns' })
    const n = flat(resolvePage('faq', {}, 'shop', { ...ctx, overrides: { shipping: 'Ours.' } })).find((x) => x.kind === 'faq') as { items: { q: string; href?: string }[] }
    expect(n.items.find((i) => i.q === 'How fast do you ship?')?.href).toBe('/policies/shipping')
  })
  it('no pay on delivery: says so; a fact missing: the question waits, and the console says why', () => {
    expect(boundAnswer('cod', { ...facts, codOn: false }, {}, inr)).toEqual({ pieces: [{ text: 'No. Every order is paid online when you place it.' }] })
    expect(boundAnswer('returns', { ...facts, returnKind: 'none', supportEmail: '' }, {}, inr)).toBeNull()
    expect(pageIssues('faq', draft(), { ...ctx, facts: { ...facts, returnKind: 'none', supportEmail: '' } }).some((i) => !i.blocks && i.text.includes('Can I return or exchange?'))).toBe(true)
  })
  it('the owner\'s own answers start as examples: shown marked in the preview, left out on the shop, blocking Publish', () => {
    const shop = flat(resolvePage('faq', {}, 'shop', ctx)).find((n) => n.kind === 'faq') as { items: { q: string }[] }
    expect(shop.items.some((i) => i.q === 'How do I care for it?')).toBe(false)
    const pv = flat(resolvePage('faq', {}, 'preview', ctx)).find((n) => n.kind === 'faq') as { items: { q: string; example?: true }[] }
    expect(pv.items.find((i) => i.q === 'How do I care for it?')?.example).toBe(true)
    expect(pageIssues('faq', draft(), ctx).filter((i) => i.blocks).map((i) => i.text)).toEqual([
      'Questions: write your own answer for “How do I care for it?”', 'Questions: write your own answer for “Do you make to order?”'])
  })
  it('the owner reorders, rewords and adds questions; a bound one keeps its answer', () => {
    const fill = { [FAQ_ID]: { kind: 'faq', items: [{ q: 'Returns?', bound: 'returns' }, { q: 'Gift wrap?', a: 'Yes, free.' }] } }
    const d = draft({ fill } as never)
    expect(faqItems(d.fill)).toHaveLength(2)
    const items = (flat(resolvePage('faq', d.fill, 'shop', ctx)).find((n) => n.kind === 'faq') as { items: { q: string; a: string }[] }).items
    expect(items.map((i) => i.q)).toEqual(['Returns?', 'Gift wrap?'])
    expect(pageIssues('faq', d, ctx)).toEqual([])
  })
  it('an answer can\'t claim to come from Settings with words of its own', () => {
    expect(PageDraftSchema.safeParse({ title: 'F', handle: 'f', fill: { [FAQ_ID]: { kind: 'faq', items: [{ q: 'x', bound: 'returns', a: 'Free returns forever' }] } } }).success).toBe(false)
  })
})

describe('About', () => {
  it('examples and samples never reach the shop; the description is the owner\'s first words', () => {
    expect(JSON.stringify(resolvePage('about', {}, 'shop', ctx))).not.toMatch(/\/themes\/samples\/|Tell shoppers/)
    const fill = { story: { kind: 'text', body: [[{ text: 'Kesar began with two looms in 2019.' }]] } }
    const d = draft({ title: 'Our story', handle: 'our-story', fill } as never)
    expect(pageDescription(resolvePage('about', d.fill, 'shop', ctx))).toBe('Kesar began with two looms in 2019.')
    expect(pageIssues('about', d, ctx).filter((i) => i.blocks).length).toBe(6)
  })
  it('a fill for a block the template lacks, or of another kind, is pruned', () => {
    const d = draft({ title: 'O', handle: 'o', fill: { gone: { kind: 'heading', text: 'x' }, story: { kind: 'heading', text: 'y' }, [FAQ_ID]: { kind: 'faq', items: [] } } } as never)
    expect(prunePage('about', d).fill).toEqual({})
  })
})

describe('addresses and titles', () => {
  it('a handle from the title; reserved words and bad shapes refused', () => {
    expect(handleOf('Our Story — 2019!')).toBe('our-story-2019')
    expect(handleOf('॥')).toBe('page')
    for (const handle of ['constructor', 'Our-Story', '-x', 'x-', 'a'.repeat(61)]) expect(PageDraftSchema.safeParse({ title: 'T', handle, fill: {} }).success).toBe(false)
  })
  it('a title can\'t carry markup or direction characters', () => {
    for (const title of ['<b>x</b>', 'a‮b', 'x{y}', '']) expect(PageDraftSchema.safeParse({ title, handle: 'x', fill: {} }).success).toBe(false)
  })
})
