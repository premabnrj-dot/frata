import { z } from 'zod'
import { BOUND, BOUND_QUESTION, type Bound } from '@/domains/policies/answers'
import { DesignSchema, type Design, type DesignInput } from '@/domains/themes/blocks'
import { BLOCK_ID, FillSchema, blockId, type Fill } from '@/domains/themes/sections'

// =============================================================================
// FILE: src/domains/pages/templates.ts — A SHOP'S PAGES (Theme Studio TS1a; plan docs/plans/2026-11-11-theme-studio-ts1.md).
// Frrata's page templates, built from TS0b's blocks, styled by every theme's tokens: a page's words never depend on
// the theme, so they carry across every theme change. The FAQ adds one page-only block, `faq`, whose items are the
// owner's own (question and answer) or BOUND to Settings (`bound`: a closed reference, never stored words; the answer
// comes from the policy at render: domains/policies/answers.ts). Bound kinds stay out of the theme catalogue
// (architecture review 8). Contact is not here: it is the Contact policy (/policies/contact), its line in the layer.
// Pure. Templates only ADD (templates.test.ts snapshot): no block removed or re-kinded, no new example block.
// =============================================================================

export const PAGE_TEMPLATES = ['about', 'faq'] as const
export type PageTemplate = (typeof PAGE_TEMPLATES)[number]

const sample = (name: string, alt: string) => ({ base: `/themes/samples/${name}`, widths: [400, 800], width: 800, height: 1000, alt, decorative: false, focus: null })
const step = (n: string, heading: string, words: string, photo: string) => ({
  id: `maker-${n}`, kind: 'group' as const, children: [
    { id: `maker-photo-${n}`, kind: 'image' as const, ratio: '4:5' as const, image: sample(photo, heading), fill: { label: `Card ${n}: photo` } },
    { id: `maker-heading-${n}`, kind: 'heading' as const, size: 's' as const, text: heading, fill: { label: `Card ${n}: title`, example: true as const } },
    { id: `maker-words-${n}`, kind: 'text' as const, body: [[{ text: words }]], fill: { label: `Card ${n}: words`, example: true as const } },
  ],
})

const about: DesignInput = {
  id: 'about', name: 'About', line: 'Your story, makers and materials', tags: ['about', 'story', 'brand', 'makers', 'materials', 'founder'],
  children: [
    { id: 'story', kind: 'text', body: [[{ text: 'Tell shoppers how your brand began, who makes your pieces and where.' }]], fill: { label: 'Your story', example: true } },
    { id: 'photo', kind: 'image', ratio: '4:5', image: sample('ivory-chikan-b', 'A workshop'), fill: { label: 'Photo' } },
    { id: 'makers-heading', kind: 'heading', size: 'm', text: 'How we make it', fill: { label: 'Cards heading' } },
    { id: 'makers', kind: 'columns', phone: 'swipe', children: [
      step('1', 'Handloom', 'Woven on frame looms, a metre a day.', 'haldi-kurta'),
      step('2', 'Natural dyes', 'Indigo, madder and pomegranate rind.', 'mehndi-saree'),
      step('3', 'Hand-finished', 'Hemmed and buttoned by hand.', 'rani-anarkali'),
    ] },
  ],
}

/** The FAQ's own block: questions, some bound to Settings. */
export const FAQ_ID = 'questions'
export const FaqItemSchema = z.union([
  z.object({ q: z.string().max(80), bound: z.enum(BOUND) }).strict(),
  z.object({ q: z.string().max(80), a: z.string().max(600) }).strict(),
])
export type FaqItem = z.infer<typeof FaqItemSchema>
export const MAX_FAQ = 12
const FaqFillSchema = z.object({ kind: z.literal('faq'), items: z.array(FaqItemSchema).max(MAX_FAQ) })
/** The FAQ's own questions, as the template offers them: the three bound ones, then two of the owner's (examples). */
export const FAQ_DEFAULT: { q: string; bound?: Bound; a?: string }[] = [
  ...BOUND.map((b) => ({ q: BOUND_QUESTION[b], bound: b })),
  { q: 'How do I care for it?', a: 'Hand wash cold and dry in the shade. Natural dyes soften with each wash.' },
  { q: 'Do you make to order?', a: 'Some pieces are made when you order them: their page says how long that takes.' },
]
const faq: DesignInput = {
  id: 'faq', name: 'FAQ', line: 'Answers that follow your settings', tags: ['faq', 'questions', 'help', 'returns', 'delivery', 'pay on delivery'],
  children: [
    { id: 'intro', kind: 'text', body: [], fill: { label: 'A line above (optional)' } },
  ],
}

export const TEMPLATES: Record<PageTemplate, Design> = { about: DesignSchema.parse(about), faq: DesignSchema.parse(faq) }
export const TEMPLATE_NAMES: Record<PageTemplate, string> = { about: 'About', faq: 'FAQ' }

// --- A page's draft (and live) ---------------------------------------------------------------------------------------

/** What an owner wrote into a page: a theme block's fill, or the FAQ's questions. */
export const PageFillSchema = z.union([FillSchema, FaqFillSchema])
export type PageFill = Fill | z.infer<typeof FaqFillSchema>

/** Addresses a page can't take (built-in names; the shop's own paths are under /pages/ anyway). */
const RESERVED = new Set(['constructor', 'prototype', '__proto__', 'tostring', 'valueof', 'hasownproperty', 'new', 'edit', 'preview'])
export const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
export const handleOf = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'page'
/** A title: plain words, no markup characters, no control or direction characters (security review L5). */
const title = z.string().trim().min(1).max(60).regex(/^[^<>{}\\\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]*$/)

export const PageDraftSchema = z.object({
  title,
  handle: z.string().regex(HANDLE).refine((h) => !RESERVED.has(h), 'That address is reserved'),
  fill: z.record(blockId, PageFillSchema).refine((f) => Object.keys(f).length <= 40, 'At most 40 fields'),
  hidden: z.boolean().default(false),
  /** Removed at the next Publish (a page never published is deleted at once). */
  removed: z.boolean().optional(),
})
export type PageDraft = z.infer<typeof PageDraftSchema>
export { BLOCK_ID }
