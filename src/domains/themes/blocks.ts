import { z } from 'zod'
import { accordionItems, blocksOf, fillFor, fillableOf } from './design-tree'
import { AccordionItemSchema, BLOCK_ID, DesignBodySchema, GRID_PIECES, ImageSchema, MAX_PER_PAGE, SectionSchema, SourceSchema, VIDEO_KEYS, blockId, fillText, shopPath, type Fill, type SectionOf, type ThemeImage } from './sections'

// =============================================================================
// FILE: src/domains/themes/blocks.ts — THE BLOCK CATALOGUE (Theme Studio spec § 2; plan docs/plans/2026-11-11-theme-studio-ts0b.md).
// A design is a tree of blocks a theme fixes; the owner fills the blocks the theme marks (`fill`), by block id. Three
// levels, spelt out (no z.lazy): a design's children are Columns, Groups or leaves; Columns hold Groups or leaves;
// Groups hold leaves. Pure: no I/O. TS0b shipped the layout and content kinds; TS1b adds commerce (a product grid, a
// featured product, collection tiles), a video and a drop date (docs/plans/2026-11-11-theme-studio-ts1.md § TS1b).
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
// TS1b. A product grid shows GRID_PIECES from its source (the theme's default; never a collection: themeCheck); a
// featured product, picked tiles, a video and a date are the owner's to fill (themeCheck: each carries `fill`).
const ProductGridBlock = z.object({ id: blockId, kind: z.literal('product_grid'), source: SourceSchema, fill: FillMark.optional() }).strict()
const FeaturedProductBlock = z.object({ id: blockId, kind: z.literal('featured_product'), fill: FillMark.optional() }).strict()
export const TILE_SHAPES = ['portrait', 'square', 'circle'] as const
const CollectionTilesBlock = z.object({ id: blockId, kind: z.literal('collection_tiles'), mode: z.enum(['auto', 'picked']), shape: z.enum(TILE_SHAPES), fill: FillMark.optional() }).strict()
/** The design's one loop (the section's `video`), over its poster: the owner's photo, or the theme's sample (preview). */
const VideoBlock = z.object({ id: blockId, kind: z.literal('video'), ratio: z.enum(IMAGE_RATIOS), poster: ImageSchema.nullable(), fill: FillMark.optional() }).strict()
/** A drop date ("Drops Fri 14 Nov, 7 pm"; never a ticking count): only the owner sets one, so no date here. */
const DateBlock = z.object({ id: blockId, kind: z.literal('date'), fill: FillMark.optional() }).strict()

const LEAVES = [HeadingBlock, TextBlock, ImageBlock, ButtonBlock, AccordionBlock, ProductGridBlock, FeaturedProductBlock, CollectionTilesBlock, VideoBlock, DateBlock] as const
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
/** TS1b: the kinds that draw product cards or collection tiles (≤ 2 such designs a page), and the media kinds. */
export const COMMERCE_KINDS: readonly BlockKind[] = ['product_grid', 'featured_product', 'collection_tiles']
export const MAX_COMMERCE_DESIGNS = 2
/** Loops a Home plays, across Hero, Image with text and designs (owner 2026-11-11: Frrata pays Mux per minute played).
 *  The save refuses a look that grows past it; a look already past it keeps its loops. */
export const MAX_LOOPS = 3
/** A drop date at most this far ahead (the save; words, never a database error). */
export const MAX_DATE_DAYS = 400
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
  /** `eager`: how many of its first cards load ahead (the design opens the page). */
  | { kind: 'product_grid'; id: string; source: z.infer<typeof SourceSchema>; eager?: number }
  /** `handle` null only in the preview: no piece picked yet, the renderer shows the newest, marked. */
  | { kind: 'featured_product'; id: string; handle: string | null; eager?: true }
  /** `handles` null: auto (the shop's collections with products); picked otherwise. */
  | { kind: 'collection_tiles'; id: string; handles: string[] | null; shape: (typeof TILE_SHAPES)[number] }
  | { kind: 'video'; id: string; ratio: (typeof IMAGE_RATIOS)[number]; poster: ThemeImage | null; sample?: true; eager?: true }
  | { kind: 'date'; id: string; at: string }
  | { kind: 'group'; id: string; children: RNode[] }
  | { kind: 'columns'; id: string; phone: 'stack' | 'swipe'; children: RNode[] }

/**
 * A design with the owner's words in it. `shop`: only what may reach a shopper (the owner's own words and photos;
 * the theme's plain defaults; never a sample photo or an example). `preview`: the customizer also shows the theme's
 * samples and examples, marked, so the owner sees what to fill. A fill whose block is gone, or whose kind no longer
 * matches, is ignored on its own (part by part). Heading levels are derived: the design's first heading is h2, the
 * rest h3 (heroes keep the page's h1). `lead`: this design opens the page, so what it shows first loads eagerly: ≤ 2
 * images in all (its photo ≤ 1, a featured cover, a poster, a grid's first cards; architecture 3, speed HIGH 1).
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
      case 'product_grid': return { kind: 'product_grid', id: b.id, source: f?.kind === 'product_grid' ? f.source : b.source }
      case 'featured_product': {
        const h = f?.kind === 'featured_product' ? f.handle : null
        return h || preview ? { kind: 'featured_product', id: b.id, handle: h } : null
      }
      case 'collection_tiles': {
        const mode = f?.kind === 'collection_tiles' ? f.mode : b.mode
        if (mode === 'auto') return { kind: 'collection_tiles', id: b.id, handles: null, shape: b.shape }
        const hs = f?.kind === 'collection_tiles' ? f.handles : []
        // Picked, none yet: the preview shows the shop's own (auto) so the owner sees the block; the shop shows nothing.
        return hs.length ? { kind: 'collection_tiles', id: b.id, handles: hs, shape: b.shape } : preview ? { kind: 'collection_tiles', id: b.id, handles: null, shape: b.shape } : null
      }
      case 'video': {
        const mine = f?.kind === 'video' ? f.poster : null
        if (mine) return { kind: 'video', id: b.id, ratio: b.ratio, poster: mine }
        return preview && b.poster ? { kind: 'video', id: b.id, ratio: b.ratio, poster: b.poster, sample: true } : { kind: 'video', id: b.id, ratio: b.ratio, poster: null }
      }
      case 'date': { const at = f?.kind === 'date' ? f.at : null; return at ? { kind: 'date', id: b.id, at } : null }
      default: return b satisfies never
    }
  }
  const node = (b: Block): RNode | null => {
    if (b.kind === 'group') { const c = b.children.flatMap((x) => leaf(x) ?? []); return c.length ? { kind: 'group', id: b.id, children: c } : null }
    if (b.kind === 'columns') { const c = b.children.flatMap((x) => node(x) ?? []); return c.length ? { kind: 'columns', id: b.id, phone: b.phone, children: c } : null }
    return leaf(b)
  }
  const out = d.children.flatMap((b) => node(b) ?? [])
  // Derived, never stored: the first heading is h2; eager images only where this design opens the page (≤ 2 in all,
  // its own photos ≤ 1 as in TS0b).
  let first = true, budget = lead ? 2 : 0, photo = lead
  const visit = (ns: RNode[]) => { for (const n of ns) {
    if (n.kind === 'heading') { if (first) { n.level = 2; first = false } }
    else if (n.kind === 'image' && photo && budget) { n.eager = true; photo = false; budget-- }
    else if ((n.kind === 'featured_product' || (n.kind === 'video' && n.poster)) && budget) { n.eager = true; budget-- }
    else if (n.kind === 'product_grid' && budget) { n.eager = Math.min(budget, GRID_PIECES); budget -= n.eager }
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

/** A design that draws product cards or collection tiles (≤ MAX_COMMERCE_DESIGNS a page). */
export const isCommerce = (d: Design) => blocksOf(d).some((b) => COMMERCE_KINDS.includes(b.kind))
/** A design's photos as the page's limit counts them: its photos and its video's poster. */
const photosOf = (d: Design) => blocksOf(d).filter((b) => b.kind === 'image' || b.kind === 'video').length
/** The design's one video block (a design may hold one: themeCheck), or null. Its loop is the section's `video`. */
export const hasOneVideo = (d: Design) => blocksOf(d).filter((b) => b.kind === 'video').length === 1

/** The loops a Home plays: shown sections that may carry one (where the theme lists them) and name a video. */
export function loopsOf(home: readonly unknown[], videoOk: readonly string[]): number {
  return home.filter((raw) => {
    const s = raw as { key?: unknown; hidden?: unknown; video?: { id?: unknown } } | null
    return !!s && typeof s.key === 'string' && (VIDEO_KEYS as readonly string[]).includes(s.key) && videoOk.includes(s.key) && s.hidden !== true && typeof s.video?.id === 'string'
  }).length
}

/** Why the designs on a page can't be saved (empty: they can). `designs` are the look's theme version's. */
export function designProblems(designs: readonly Design[], home: readonly { key: string }[]): string[] {
  const byId = new Map(designs.map((d) => [d.id, d]))
  const out: string[] = []
  let blocks = 0, text = 0, photos = 0, commerce = 0
  for (const raw of home) {
    if (raw.key !== 'design') continue
    const s = raw as SectionOf<'design'>
    const d = byId.get(s.design)
    if (!d) { out.push('That design isn’t in this theme. Remove it, or undo the last change.'); continue }
    if (s.hidden) continue
    blocks += blocksOf(d).length
    text += Object.values(s.fill).reduce((n, f) => n + fillBytes(f), 0)
    photos += photosOf(d)
    if (isCommerce(d)) commerce++
  }
  if (commerce > MAX_COMMERCE_DESIGNS) out.push(`At most ${MAX_COMMERCE_DESIGNS} designs with pieces or collections on a page. Hide or remove one.`)
  if (blocks > PAGE_LIMITS.blocks) out.push(`Designs on this page hold ${blocks} blocks; at most ${PAGE_LIMITS.blocks}. Hide or remove one.`)
  if (text > PAGE_LIMITS.textBytes) out.push('The words in this page’s designs are too long. Shorten them, or remove a design.')
  if (photos > PAGE_LIMITS.photos) out.push(`Designs on this page hold ${photos} photos; at most ${PAGE_LIMITS.photos}. Hide or remove one.`)
  return out
}

/** A design section's loop dropped unless the design has exactly one video block and the theme offers video in
 *  designs (the save and resolveTheme: one rule; architecture blocker 1). A section without `video` is returned as is. */
export function keepDesignVideo(d: Design, s: SectionOf<'design'>, videoOk: readonly string[]): SectionOf<'design'> {
  if (!s.video || (hasOneVideo(d) && videoOk.includes('design'))) return s
  const { video: _drop, ...rest } = s
  return rest
}

export type SaveCtx = {
  now: Date
  /** The theme's allowed.videoSections. */
  videoOk: readonly string[]
  /** Loops in the draft as stored before this save: a look already past MAX_LOOPS keeps them, never grows. */
  loopsBefore: number
}
/** The save's design step (pure, tested): every fill pruned to its block's id and kind first, a design's loop kept
 *  only where it may play, then the page's limits, the loops and the dates. `home` is the layer's sections as sent;
 *  design sections come back parsed and pruned, the rest as they were. */
export function designsForSave(designs: readonly Design[], home: readonly unknown[], ctx: SaveCtx): { error: string } | { home: unknown[] } {
  const byId = new Map(designs.map((d) => [d.id, d]))
  const out = home.map((x) => {
    const r = SectionSchema.safeParse(x)
    if (!r.success || r.data.key !== 'design' || !byId.has(r.data.design)) return x
    const d = byId.get(r.data.design)!
    return keepDesignVideo(d, pruneFill(d, r.data), ctx.videoOk)
  })
  const parsed = out.flatMap((x) => { const r = SectionSchema.safeParse(x); return r.success ? [r.data] : [] })
  const problems = designProblems(designs, parsed)
  if (problems.length) return { error: problems[0]! }
  const loops = loopsOf(out, ctx.videoOk)
  if (loops > MAX_LOOPS && loops > ctx.loopsBefore) return { error: `A Home plays at most ${MAX_LOOPS} videos. Remove one first.` }
  const latest = ctx.now.getTime() + MAX_DATE_DAYS * 86_400_000
  for (const s of parsed) {
    if (s.key !== 'design') continue
    if (Object.values(s.fill).some((f) => f.kind === 'date' && f.at && Date.parse(f.at) > latest)) return { error: `A drop date can be at most ${MAX_DATE_DAYS} days away. Pick a nearer one.` }
  }
  return { home: out }
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
    const n = MAX_PER_PAGE.design, photos = photosOf(d)
    if (all.length * n > PAGE_LIMITS.blocks) out.push(`Design ${d.id}: ${all.length} blocks; at most ${Math.floor(PAGE_LIMITS.blocks / n)} (${n} can share a page)`)
    if (photos * n > PAGE_LIMITS.photos) out.push(`Design ${d.id}: ${photos} photos; at most ${Math.floor(PAGE_LIMITS.photos / n)} (${n} can share a page)`)
    if (all.length > MAX_DESIGN_BLOCKS) out.push(`Design ${d.id}: ${all.length} blocks; at most ${MAX_DESIGN_BLOCKS}`)
    if (new Set(all.map((b) => b.id)).size !== all.length) out.push(`Design ${d.id}: two blocks share an id`)
    if (!BLOCK_ID.test(d.id)) out.push(`Design ${d.id}: its id isn't a-z, 0-9 and -`)
    for (const b of all) {
      if (b.kind === 'image' && b.image && !b.image.decorative && !b.image.alt.trim()) out.push(`Design ${d.id}: photo ${b.id} has no description`)
      if (b.kind !== 'heading' && b.kind !== 'text' && b.kind !== 'accordion' && 'fill' in b && b.fill?.example) out.push(`Design ${d.id}: ${b.id} can't be an example (only headings, words and answers are)`)
      // TS1b (architecture 10): what only the owner can choose is theirs to fill; a grid's default isn't a collection
      // (the theme can't know the shop's collections).
      if ((b.kind === 'featured_product' || b.kind === 'date' || b.kind === 'video' || (b.kind === 'collection_tiles' && b.mode === 'picked')) && !b.fill) out.push(`Design ${d.id}: ${b.id} must be filled by the owner`)
      if (b.kind === 'product_grid' && b.source.kind === 'collection') out.push(`Design ${d.id}: ${b.id} can't default to a collection`)
      if (b.kind === 'video' && b.poster && !b.poster.decorative && !b.poster.alt.trim()) out.push(`Design ${d.id}: poster ${b.id} has no description`)
    }
    if (all.filter((b) => b.kind === 'video').length > 1) out.push(`Design ${d.id}: at most one video`)
  }
  if (previous) {
    const now = new Map(designs.map((d) => [d.id, new Map(blocksOf(d).map((b) => [b.id, b.kind]))]))
    const fillMarked = new Set(designs.flatMap((d) => fillableOf(d).map((b) => `${d.id}/${b.id}`)))
    for (const p of previous) {
      const n = now.get(p.id)
      if (!n) { out.push(`Design ${p.id} was removed; a minor version only adds`); continue }
      // A design already on shops can't start drawing cards or playing a loop in a minor (it would grow every page
      // holding it past the limits its owner saved under).
      const had = new Set(blocksOf(p).map((b) => b.id))
      for (const [id, k] of n) if (!had.has(id) && (COMMERCE_KINDS.includes(k) || k === 'video')) out.push(`Design ${p.id}: block ${id} adds ${k}; a minor can't add pieces, collections or a video to a design`)
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
