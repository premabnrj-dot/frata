import type { Block, Design, LeafBlock } from './blocks'
import type { Fill } from './sections'

// =============================================================================
// FILE: src/domains/themes/design-tree.ts — walking a design's blocks (Theme Studio TS0b). No schemas here, so the
// customizer's browser bundle (over its budget: speed review 4) takes the walk without the block catalogue's Zod.
// =============================================================================

/** Every block of a design, in page order (containers before their children). */
export function blocksOf(d: Pick<Design, 'children'>): Block[] {
  const out: Block[] = []
  const walk = (bs: readonly Block[]) => { for (const b of bs) { out.push(b); if (b.kind === 'group' || b.kind === 'columns') walk(b.children as Block[]) } }
  walk(d.children)
  return out
}
/** The leaves an owner fills, in page order (the form's fields). */
export const fillableOf = (d: Pick<Design, 'children'>): LeafBlock[] =>
  blocksOf(d).filter((b): b is LeafBlock => b.kind !== 'group' && b.kind !== 'columns' && !!b.fill)

/** The owner's fill for a block: only a block the theme marks, by its own id (never a built-in) and its own kind. The
 *  one rule: resolveDesign, readiness and the form read it here (impact review). */
export const fillFor = (fill: Record<string, Fill>, b: LeafBlock): Fill | null =>
  b.fill && Object.hasOwn(fill, b.id) && fill[b.id]!.kind === b.kind ? fill[b.id]! : null

/** An accordion's questions as the owner has them: their own, or the theme's questions with answers left to write
 *  where the theme's answers are only examples. */
export function accordionItems(b: Extract<LeafBlock, { kind: 'accordion' }>, f: Fill | null): { q: string; a: string }[] {
  if (f?.kind === 'accordion') return f.items
  const example = b.fill?.example === true
  return b.items.map((i) => ({ q: i.q, a: example ? '' : i.a }))
}


// --- The library's picture of a design (drawn from its tree; no image files to keep in step) -----------------------

export type ThumbMark = { x: number; y: number; w: number; h: number; kind: 'heading' | 'text' | 'photo' | 'button' | 'row' }
/** Marks on a 160 × 100 card: the design's blocks laid out as the shop lays them (columns side by side). Pure. */
export function thumbOf(d: Pick<Design, 'children'>): ThumbMark[] {
  const out: ThumbMark[] = []
  // A photo, a featured piece and a video take the height left over; a row of cards or tiles is a fixed strip.
  const tall = (b: LeafBlock) => b.kind === 'image' || b.kind === 'featured_product' || b.kind === 'video'
  const leafH = (b: LeafBlock) => (tall(b) ? 0 : b.kind === 'heading' ? 10 : b.kind === 'text' ? 14 : b.kind === 'button' ? 13 : b.kind === 'date' ? 8
    : b.kind === 'product_grid' || b.kind === 'collection_tiles' ? 26 : 8 + 7 * Math.min(b.items.length, 4))
  const draw = (b: LeafBlock, x: number, y: number, w: number, h: number): number => {
    if (tall(b)) { out.push({ x, y, w, h, kind: 'photo' }); return h }
    if (b.kind === 'date') { out.push({ x, y, w: w * 0.45, h: 4, kind: 'text' }); return 8 }
    if (b.kind === 'product_grid' || b.kind === 'collection_tiles') {
      const n = 4, gap = 3, cw = (w - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) out.push({ x: x + i * (cw + gap), y, w: cw, h: 22, kind: 'photo' })
      return 26
    }
    if (b.kind === 'heading') { out.push({ x, y, w: w * 0.7, h: 6, kind: 'heading' }); return 10 }
    if (b.kind === 'text') { out.push({ x, y, w, h: 3, kind: 'text' }, { x, y: y + 6, w: w * 0.7, h: 3, kind: 'text' }); return 14 }
    if (b.kind === 'button') { out.push({ x, y, w: Math.min(34, w), h: 8, kind: 'button' }); return 13 }
    for (let i = 0; i < Math.min(b.items.length, 4); i++) out.push({ x, y: y + i * 7, w, h: 5, kind: 'row' })
    return 8 + 7 * Math.min(b.items.length, 4)
  }
  const stack = (bs: LeafBlock[], x: number, y: number, w: number, bottom: number) => {
    const fixed = bs.reduce((n, b) => n + leafH(b), 0), photos = bs.filter(tall).length
    const ph = photos ? Math.max(14, (bottom - y - fixed) / photos) : 0
    let cy = y
    for (const b of bs) cy += draw(b, x, cy, w, ph)
    return cy
  }
  const rows = d.children
  let y = 10
  rows.forEach((b, i) => {
    const bottom = i === rows.length - 1 ? 90 : Math.min(90, y + (b.kind === 'columns' ? 60 : 14))
    if (b.kind === 'columns') {
      const n = b.children.length, gap = 8, w = (140 - gap * (n - 1)) / n
      b.children.forEach((c, j) => stack(c.kind === 'group' ? c.children : [c], 10 + j * (w + gap), y, w, bottom))
      y = bottom + 4
    } else y = stack(b.kind === 'group' ? b.children : [b], 10, y, 140, bottom) + 2
  })
  return out
}
