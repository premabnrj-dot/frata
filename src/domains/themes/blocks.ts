import { z } from 'zod'
import { accordionItems, blocksOf, fillFor, fillableOf } from './design-tree'
import { AccordionItemSchema, BLOCK_ID, DesignBodySchema, ImageSchema, MAX_PER_PAGE, SectionSchema, blockId, fillText, shopPath, type Fill, type SectionOf, type ThemeImage } from './sections'

// =============================================================================
// FILE: src/domains/themes/blocks.ts — THE BLOCK CATALOGUE (Theme Studio spec § 2; plan docs/plans/2026-11-11-theme-studio-ts0b.md).
// A design is a tree of blocks a theme fixes; the owner fills the blocks the theme marks (`fill`), by block id. Three
// levels, spelt out (no z.lazy): a design's children are Columns, Groups or leaves; Columns hold Groups or leaves;
// Groups hold leaves. Pure: no I/O. TS0b ships the layout and content kinds; commerce, video and date come in TS1.
// Rules:
//   - The catalogue changes ADDITIVELY (a new kind or a new optional field); a breaking change is a new kind.
//   - Block and design ids are stable across a theme's versions: an owner's words follow them (carry-over by id).
//   - A theme's own photos are samples: they show in the customizer's preview, never on a shop (architecture 6).
//   - Words a theme marks `example` (a claim: how it's made, a size answer) never reach a shop until the owner writes
//     their own; Publish waits for them (readiness).
// =============================================================================

const word = (max: number) => z.string().min(1).max(max).regex(/^[^<>{}\\]*$/)
/** A block the owner fills: the field's name in the form, and whether the theme's words are only an example. */
const FillMark = z.object({ label: word(40), example: z.literal(true).optional() }).strict()

const HeadingBlock = z.object({ id: blockId, kind: z.literal('heading'), size: z.enum(['s', 'm', 'l']), text: z.string().max(60), fill: FillMark.optional() }).strict()
const TextBlock = z.object({ id: blockId, kind: z.literal('text'), body: DesignBodySchema, fill: FillMark.optional() }).strict()
export const IMAGE_RATIOS = ['4:5', '3:4', '1:1', '16:9'] as const
const ImageBlock = z.object({ id: blockId, kind: z.literal('image'), ratio: z.enum(IMAGE_RATIOS), image: ImageSchema.nullable(), fill: FillMark.optional() }).strict()
const ButtonBlock = z.object({ id: blockId, kind: z.literal('button'), label: z.string().min(1).max(24), link: shopPath, fill: FillMark.optional() }).strict()
const AccordionBlock = z.object({ id: blockId, kind: z.literal('accordion'), items: z.array(AccordionItemSchema).min(1).max(12), fill: FillMark.optional() }).strict()

const LEAVES = [HeadingBlock, TextBlock, ImageBlock, ButtonBlock, AccordionBlock] as const
const LeafSchema = z.discriminatedUnion('kind', [...LEAVES])
const GroupBlock = z.object({ id: blockId, kind: z.literal('group'), children: z.array(LeafSchema).min(1).max(12) }).strict()
const ColumnsBlock = z.object({ id: blockId, kind: z.literal('columns'), phone: z.enum(['stack', 'swipe']), children: z.array(z.discriminatedUnion('kind', [GroupBlock, ...LEAVES])).min(2).max(4) }).strict()

export const DesignSchema = z.object({
  id: blockId,
  name: word(40),
  line: word(80),
  tags: z.array(word(24)).max(8),
  children: z.array(z.discriminatedUnion('kind', [ColumnsBlock, GroupBlock, ...LEAVES])).min(1).max(12),
}).strict()
export type Design = z.infer<typeof DesignSchema>
export type DesignInput = z.input<typeof DesignSchema>
export type LeafBlock = z.infer<typeof LeafSchema>
export type Block = Design['children'][number]
export type BlockKind = Block['kind']
/** The kinds an owner can fill (every leaf). */
export type FillableKind = LeafBlock['kind']

export const MAX_DESIGNS = 30, MAX_DESIGN_BLOCKS = 40
/** Per page, across every design on it (speed review 2026-11-11): blocks, owner words in UTF-8 bytes, photos. */
export const PAGE_LIMITS = { blocks: 100, textBytes: 24_000, photos: 12 } as const

/** A manifest's designs, each parsed on its own (one that doesn't parse is left out, never the rest). The one reader:
 *  resolve, the save, themeCheck and the customizer (impact review). */
export const designsOf = (m: { designs?: unknown[] }): Design[] => (m.designs ?? []).flatMap((d) => { const r = DesignSchema.safeParse(d); return r.success ? [r.data] : [] })

// --- Resolving: the theme's design and the owner's words, merged ---------------------------------------------------

export type RNode =
  | { kind: 'heading'; id: string; size: 's' | 'm' | 'l'; text: string; level: 2 | 3; example?: true }
  | { kind: 'text'; id: string; body: z.infer<typeof DesignBodySchema>; example?: true }
  | { kind: 'image'; id: string; ratio: (typeof IMAGE_RATIOS)[number]; image: ThemeImage; sample?: true; eager?: true }
  | { kind: 'button'; id: string; label: string; link: string }
  | { kind: 'accordion'; id: string; items: { q: string; a: string; example?: true }[] }
  | { kind: 'group'; id: string; children: RNode[] }
  | { kind: 'columns'; id: string; phone: 'stack' | 'swipe'; children: RNode[] }

/**
 * A design with the owner's words in it. `shop`: only what may reach a shopper (the owner's own words and photos;
 * the theme's plain defaults; never a sample photo or an example). `preview`: the customizer also shows the theme's
 * samples and examples, marked, so the owner sees what to fill. A fill whose block is gone, or whose kind no longer
 * matches, is ignored on its own (part by part). Heading levels are derived: the design's first heading is h2, the
 * rest h3 (heroes keep the page's h1). `lead`: this design opens the page, so its first photo loads eagerly (≤ 1).
 */
export function resolveDesign(d: Design, fill: Record<string, Fill>, mode: 'shop' | 'preview', lead = false): RNode[] {
  const preview = mode === 'preview'
  const leaf = (b: LeafBlock): RNode | null => {
    const f = fillFor(fill, b)
    const example = b.fill?.example === true
    switch (b.kind) {
      case 'heading': {
        // The owner's own heading, or none if they cleared a plain one (an example cleared is still an example).
        if (f?.kind === 'heading' && !f.text.trim() && !example) return null
        const mine = f?.kind === 'heading' && f.text.trim() ? f.text : null
        if (mine) return { kind: 'heading', id: b.id, size: b.size, text: mine, level: 3 }
        if (!b.text.trim() || (example && !preview)) return null
        return { kind: 'heading', id: b.id, size: b.size, text: b.text, level: 3, ...(example ? { example: true as const } : {}) }
      }
      case 'text': {
        const mine = f?.kind === 'text' && f.body.length ? f.body : null
        if (mine) return { kind: 'text', id: b.id, body: mine }
        if (!b.body.length || (example && !preview)) return null
        return { kind: 'text', id: b.id, body: b.body, ...(example ? { example: true as const } : {}) }
      }
      case 'image': {
        const mine = f?.kind === 'image' ? f.image : null
        if (mine) return { kind: 'image', id: b.id, ratio: b.ratio, image: mine }
        return preview && b.image ? { kind: 'image', id: b.id, ratio: b.ratio, image: b.image, sample: true } : null
      }
      case 'button': {
        if (f?.kind === 'button' && !f.label.trim()) return null
        const mine = f?.kind === 'button' ? f : null
        return { kind: 'button', id: b.id, label: mine ? mine.label : b.label, link: mine ? mine.link : b.link }
      }
      case 'accordion': {
        const items = accordionItems(b, f).flatMap((i, n): { q: string; a: string; example?: true }[] => {
          if (!i.q.trim()) return []
          if (i.a.trim()) return [{ q: i.q, a: i.a }]
          const ex = b.items[n]?.a
          return example && preview && ex ? [{ q: i.q, a: ex, example: true }] : []
        })
        return items.length ? { kind: 'accordion', id: b.id, items } : null
      }
      default: return b satisfies never
    }
  }
  const node = (b: Block): RNode | null => {
    if (b.kind === 'group') { const c = b.children.flatMap((x) => leaf(x) ?? []); return c.length ? { kind: 'group', id: b.id, children: c } : null }
    if (b.kind === 'columns') { const c = b.children.flatMap((x) => node(x) ?? []); return c.length ? { kind: 'columns', id: b.id, phone: b.phone, children: c } : null }
    return leaf(b)
  }
  const out = d.children.flatMap((b) => node(b) ?? [])
  // Derived, never stored: the first heading is h2; ≤ 1 eager photo, only where this design opens the page.
  let first = true, eager = lead
  const visit = (ns: RNode[]) => { for (const n of ns) {
    if (n.kind === 'heading') { if (first) { n.level = 2; first = false } }
    else if (n.kind === 'image' && eager) { n.eager = true; eager = false }
    else if (n.kind === 'group' || n.kind === 'columns') visit(n.children)
  } }
  visit(out)
  return out
}

// --- Saving: the owner's words kept only where the theme has a block of their kind ---------------------------------

/** The section with every fill that names no fillable block of its own kind dropped (the save prunes; resolve ignores). */
export function pruneFill(d: Design, s: SectionOf<'design'>): SectionOf<'design'> {
  const keep = new Map(fillableOf(d).map((b) => [b.id, b.kind]))
  const fill = Object.fromEntries(Object.entries(s.fill).filter(([k, f]) => keep.get(k) === f.kind))
  return { ...s, fill }
}

const bytes = (t: string) => new TextEncoder().encode(t).length
/** The owner's words in a fill, as bytes (Devanagari is 3 a character: the 64 kB revision check counts bytes). */
const fillBytes = (f: Fill) => fillText(f).reduce((n, t) => n + bytes(t), 0)

/** Why the designs on a page can't be saved (empty: they can). `designs` are the look's theme version's. */
export function designProblems(designs: readonly Design[], home: readonly { key: string }[]): string[] {
  const byId = new Map(designs.map((d) => [d.id, d]))
  const out: string[] = []
  let blocks = 0, text = 0, photos = 0
  for (const raw of home) {
    if (raw.key !== 'design') continue
    const s = raw as SectionOf<'design'>
    const d = byId.get(s.design)
    if (!d) { out.push('That design isn’t in this theme. Remove it, or undo the last change.'); continue }
    if (s.hidden) continue
    blocks += blocksOf(d).length
    text += Object.values(s.fill).reduce((n, f) => n + fillBytes(f), 0)
    photos += blocksOf(d).filter((b) => b.kind === 'image').length
  }
  if (blocks > PAGE_LIMITS.blocks) out.push(`Designs on this page hold ${blocks} blocks; at most ${PAGE_LIMITS.blocks}. Hide or remove one.`)
  if (text > PAGE_LIMITS.textBytes) out.push('The words in this page’s designs are too long. Shorten them, or remove a design.')
  if (photos > PAGE_LIMITS.photos) out.push(`Designs on this page hold ${photos} photos; at most ${PAGE_LIMITS.photos}. Hide or remove one.`)
  return out
}

/** The save's design step (pure, tested): every fill pruned to its block's id and kind first, then the page's limits.
 *  `home` is the layer's sections as sent; design sections come back parsed and pruned, the rest as they were. */
export function designsForSave(designs: readonly Design[], home: readonly unknown[]): { error: string } | { home: unknown[] } {
  const byId = new Map(designs.map((d) => [d.id, d]))
  const out = home.map((x) => { const r = SectionSchema.safeParse(x); return r.success && r.data.key === 'design' && byId.has(r.data.design) ? pruneFill(byId.get(r.data.design)!, r.data) : x })
  const parsed = out.flatMap((x) => { const r = SectionSchema.safeParse(x); return r.success ? [r.data] : [] })
  const problems = designProblems(designs, parsed)
  return problems.length ? { error: problems[0]! } : { home: out }
}

// --- Checking a theme's designs (themeCheck) -----------------------------------------------------------------------

/** What is wrong with a theme's designs, in words (empty: nothing). `previous`: the version before, for "a minor
 *  only adds" (no design or block id removed or re-kinded). */
export function designsCheck(designs: readonly Design[], previous?: readonly Design[]): string[] {
  const out: string[] = []
  if (designs.length > MAX_DESIGNS) out.push(`${designs.length} designs; at most ${MAX_DESIGNS}`)
  if (new Set(designs.map((d) => d.id)).size !== designs.length) out.push('Two designs share an id')
  for (const d of designs) {
    const all = blocksOf(d)
    // Any mix of designs on a page stays within the page's limits (impact review: a minor that grew a design could
    // otherwise refuse every save of a look already at the limit): each design × the most a page holds.
    const n = MAX_PER_PAGE.design, photos = all.filter((b) => b.kind === 'image').length
    if (all.length * n > PAGE_LIMITS.blocks) out.push(`Design ${d.id}: ${all.length} blocks; at most ${Math.floor(PAGE_LIMITS.blocks / n)} (${n} can share a page)`)
    if (photos * n > PAGE_LIMITS.photos) out.push(`Design ${d.id}: ${photos} photos; at most ${Math.floor(PAGE_LIMITS.photos / n)} (${n} can share a page)`)
    if (all.length > MAX_DESIGN_BLOCKS) out.push(`Design ${d.id}: ${all.length} blocks; at most ${MAX_DESIGN_BLOCKS}`)
    if (new Set(all.map((b) => b.id)).size !== all.length) out.push(`Design ${d.id}: two blocks share an id`)
    if (!BLOCK_ID.test(d.id)) out.push(`Design ${d.id}: its id isn't a-z, 0-9 and -`)
    for (const b of all) {
      if (b.kind === 'image' && b.image && !b.image.decorative && !b.image.alt.trim()) out.push(`Design ${d.id}: photo ${b.id} has no description`)
      if ((b.kind === 'button' || b.kind === 'image') && b.fill?.example) out.push(`Design ${d.id}: ${b.id} can't be an example (only headings, words and answers are)`)
    }
  }
  if (previous) {
    const now = new Map(designs.map((d) => [d.id, new Map(blocksOf(d).map((b) => [b.id, b.kind]))]))
    const fillMarked = new Set(designs.flatMap((d) => fillableOf(d).map((b) => `${d.id}/${b.id}`)))
    for (const p of previous) {
      const n = now.get(p.id)
      if (!n) { out.push(`Design ${p.id} was removed; a minor version only adds`); continue }
      for (const b of blocksOf(p)) {
        const k = n.get(b.id)
        if (!k) out.push(`Design ${p.id}: block ${b.id} was removed; a minor version only adds`)
        else if (k !== b.kind) out.push(`Design ${p.id}: block ${b.id} changed from ${b.kind} to ${k}`)
        else if ('fill' in b && b.fill && !fillMarked.has(`${p.id}/${b.id}`)) out.push(`Design ${p.id}: block ${b.id} is no longer filled by the owner; a minor version only adds`)
      }
    }
  }
  return out
}

export { blocksOf, fillableOf, thumbOf } from './design-tree'
