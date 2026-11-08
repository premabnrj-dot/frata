import { PROMISES, SECTION_NAMES, type SectionInstance } from './sections'

// =============================================================================
// FILE: src/domains/themes/readiness.ts — what blocks Publish, and what a section shows nothing for (the second
// tier: shape lives in the save schemas; facts, dates and alt text are judged here). Pure; `now` passed in.
// =============================================================================

export type ShopFacts = {
  collections: { handle: string; hasProducts: boolean }[]
  codOn: boolean; freeShippingAbove: number | null; returnDays: number; dispatchDays: number
}
export type Issue = { sectionId: string; blocks: boolean; text: string }

const altMissing = (img: { alt: string; decorative: boolean } | null) => !!img && !img.decorative && !img.alt.trim()

/** Which promises are true today, so Shop by promise never states one that isn't. */
export function truePromises(f: ShopFacts): (typeof PROMISES)[number][] {
  return PROMISES.filter((k) => (k === 'cod' ? f.codOn : k === 'free_shipping' ? f.freeShippingAbove !== null : k === 'returns' ? f.returnDays > 0 : f.dispatchDays > 0))
}

export function readinessOf(home: SectionInstance[], f: ShopFacts, now: Date): Issue[] {
  const out: Issue[] = []
  const has = new Map(f.collections.map((c) => [c.handle, c.hasProducts]))
  for (const s of home) {
    if (s.hidden) continue
    const name = SECTION_NAMES[s.key]
    const add = (blocks: boolean, text: string) => out.push({ sectionId: s.id, blocks, text: `${name}: ${text}` })
    switch (s.key) {
      case 'hero':
        if (s.layout !== 'text' && !s.image) add(true, 'add a photo')
        if (altMissing(s.image)) add(true, 'describe the photo for people who can’t see it')
        break
      case 'image_text':
        if (!s.image) add(true, 'add a photo')
        if (altMissing(s.image)) add(true, 'describe the photo for people who can’t see it')
        break
      case 'shop_the_look':
        if (!s.image) add(true, 'add a photo')
        if (altMissing(s.image)) add(true, 'describe the photo for people who can’t see it')
        if (!s.pieces.length) add(true, 'pin at least one piece on the photo')
        break
      case 'logos':
        if (!s.images.length) add(false, 'add a logo, or it shows nothing')
        if (s.images.some((i) => altMissing(i))) add(true, 'name each logo')
        break
      case 'drop_teaser':
        if (Date.parse(s.at) <= now.getTime()) add(false, 'its date has passed, so it shows nothing')
        if (altMissing(s.image)) add(true, 'describe the photo for people who can’t see it')
        break
      case 'collection_tiles':
        if (s.mode === 'picked') {
          const live = s.handles.filter((h) => has.get(h))
          if (s.handles.some((h) => !has.has(h))) add(false, 'a collection it shows was deleted')
          if (live.length < 2) add(true, 'pick at least 2 collections with products')
        }
        break
      case 'products':
        if (s.source.kind === 'collection' && !has.has(s.source.handle)) add(false, 'its collection was deleted, so it shows nothing')
        break
      case 'promises': {
        const t = truePromises(f)
        if (!s.show.some((k) => t.includes(k))) add(false, 'none of these promises is true for your shop today, so it shows nothing')
        break
      }
      default: break
    }
  }
  return out
}
