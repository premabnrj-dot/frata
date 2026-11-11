import { answerText, boundAnswer, type Bound } from '@/domains/policies/answers'
import type { PolicyFacts, PolicyPage } from '@/domains/policies/render'
import { pruneFill, resolveDesign, type RNode } from '@/domains/themes/blocks'
import { fillableOf } from '@/domains/themes/design-tree'
import type { Fill, SectionOf } from '@/domains/themes/sections'
import { FAQ_DEFAULT, FAQ_ID, TEMPLATES, TEMPLATE_NAMES, type FaqItem, type PageDraft, type PageFill, type PageTemplate } from './templates'

// =============================================================================
// FILE: src/domains/pages/page.ts — a page's words merged with its template (Theme Studio TS1a). Pure. The theme
// blocks go through TS0b's resolveDesign (never a sample or an example on the shop); the FAQ's questions are the
// owner's own, or bound to Settings and answered by the policy's own paragraph (or a link to a rewritten policy).
// =============================================================================

export type FaqNode = { kind: 'faq'; id: string; items: { q: string; a: string; href?: string; example?: true }[] }
export type PageNode = RNode | FaqNode
export type AnswerCtx = { facts: PolicyFacts; overrides: Partial<Record<PolicyPage, string | null>>; inr: (paise: number) => string }

/** The theme-block part of a page's fill (the FAQ block is the page's own). */
const themeFill = (fill: Record<string, PageFill>): Record<string, Fill> =>
  Object.fromEntries(Object.entries(fill).filter((e): e is [string, Fill] => e[1].kind !== 'faq'))

/** The FAQ's questions as the owner has them: their own list, or the template's (own answers left to write). */
export function faqItems(fill: Record<string, PageFill>): FaqItem[] {
  const f = Object.hasOwn(fill, FAQ_ID) ? fill[FAQ_ID] : undefined
  if (f?.kind === 'faq') return f.items
  return FAQ_DEFAULT.map((i) => (i.bound ? { q: i.q, bound: i.bound } : { q: i.q, a: '' }))
}

/** What a page shows. `shop`: only the owner's words and Settings' answers; `preview`: examples too, marked. */
export function resolvePage(template: PageTemplate, fill: Record<string, PageFill>, mode: 'shop' | 'preview', ctx: AnswerCtx, lead = false): PageNode[] {
  const nodes: PageNode[] = resolveDesign(TEMPLATES[template], themeFill(fill), mode, lead)
  if (template !== 'faq') return nodes
  const items = faqItems(fill).flatMap((i, n): FaqNode['items'] => {
    if (!i.q.trim()) return []
    if ('bound' in i) {
      const a = boundAnswer(i.bound, ctx.facts, ctx.overrides, ctx.inr)
      if (!a) return []
      return 'policy' in a ? [{ q: i.q, a: 'Read our policy', href: `/policies/${a.policy}` }] : [{ q: i.q, a: answerText(a.pieces) }]
    }
    if (i.a.trim()) return [{ q: i.q, a: i.a }]
    const ex = FAQ_DEFAULT[n]?.a
    return mode === 'preview' && ex ? [{ q: i.q, a: ex, example: true }] : []
  })
  return items.length ? [...nodes, { kind: 'faq', id: FAQ_ID, items }] : nodes
}

/** A page's words kept only where its template has a block of their kind (the save prunes; resolve ignores). */
export function prunePage(template: PageTemplate, d: PageDraft): PageDraft {
  const asSection = { id: 'p', key: 'design', hidden: false, scheme: 'paper', label: '', design: template, fill: themeFill(d.fill) } as SectionOf<'design'>
  const kept = pruneFill(TEMPLATES[template], asSection).fill as Record<string, PageFill>
  const fill: Record<string, PageFill> = { ...kept }
  if (template === 'faq' && Object.hasOwn(d.fill, FAQ_ID) && d.fill[FAQ_ID]!.kind === 'faq') fill[FAQ_ID] = d.fill[FAQ_ID]!
  return { ...d, fill }
}

export type PageIssue = { blocks: boolean; text: string }
/** What a page needs before Publish (an example not replaced blocks; a photo not added leaves its block out). */
export function pageIssues(template: PageTemplate, d: PageDraft, ctx: AnswerCtx): PageIssue[] {
  if (d.hidden || d.removed) return []
  const name = d.title || TEMPLATE_NAMES[template]
  const out: PageIssue[] = []
  for (const b of fillableOf(TEMPLATES[template])) {
    const f = Object.hasOwn(d.fill, b.id) && d.fill[b.id]!.kind === b.kind ? (d.fill[b.id] as Fill) : null
    const ex = b.fill?.example === true, label = b.fill!.label
    if (b.kind === 'text' && ex && !(f?.kind === 'text' && f.body.length)) out.push({ blocks: true, text: `${name}: write your own words for “${label}”` })
    if (b.kind === 'heading' && ex && !(f?.kind === 'heading' && f.text.trim())) out.push({ blocks: true, text: `${name}: write your own “${label}”` })
    if (b.kind === 'image') {
      const img = f?.kind === 'image' ? f.image : null
      if (!img) out.push({ blocks: false, text: `${name}: add a photo for “${label}”, or it’s left out` })
      else if (!img.decorative && !img.alt.trim()) out.push({ blocks: true, text: `${name}: describe “${label}” for people who can’t see it` })
    }
  }
  if (template === 'faq') for (const i of faqItems(d.fill)) {
    if (!i.q.trim()) continue
    if ('bound' in i) { if (!boundAnswer(i.bound as Bound, ctx.facts, ctx.overrides, ctx.inr)) out.push({ blocks: false, text: `${name}: “${i.q}” shows once Settings has what it answers` }) }
    else if (!i.a.trim()) out.push({ blocks: true, text: `${name}: write your own answer for “${i.q}”` })
  }
  return out
}

/** The page's description for search and sharing: the first words the owner wrote, never an example. */
export function pageDescription(nodes: PageNode[]): string {
  const walk = (ns: PageNode[]): string => {
    for (const n of ns) {
      if (n.kind === 'text' && !n.example) return n.body.flat().map((r) => r.text).join('').trim()
      if ((n.kind === 'group' || n.kind === 'columns') && walk(n.children)) return walk(n.children)
    }
    return ''
  }
  return walk(nodes).slice(0, 160)
}
