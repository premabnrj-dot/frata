import type { Design } from './blocks'
import { accordionItems, fillFor, fillableOf } from './design-tree'
import { PROMISES, sectionName, type SectionInstance } from './sections'

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

/** Picked collection tiles, as a Collection tiles section and a design's tiles both judge them (one rule): a deleted
 *  collection is said, and fewer than 2 picks with products blocks Publish. */
function pickedIssues(handles: readonly string[], has: Map<string, boolean>): [boolean, string][] {
  const out: [boolean, string][] = []
  if (handles.some((h) => !has.has(h))) out.push([false, 'a collection it shows was deleted'])
  if (handles.filter((h) => has.get(h)).length < 2) out.push([true, 'pick at least 2 collections with products'])
  return out
}

/** Which promises are true today, so Shop by promise never states one that isn't. */
export function truePromises(f: ShopFacts): (typeof PROMISES)[number][] {
  return PROMISES.filter((k) => (k === 'cod' ? f.codOn : k === 'free_shipping' ? f.freeShippingAbove !== null : k === 'returns' ? f.returnDays > 0 : f.dispatchDays > 0))
}

/** `designs`: the look's designs by id (ResolvedTheme.designs, or the editor's); a design not given says nothing. */
export function readinessOf(home: SectionInstance[], f: ShopFacts, now: Date, designs: Record<string, Design> = {}): Issue[] {
  const out: Issue[] = []
  const has = new Map(f.collections.map((c) => [c.handle, c.hasProducts]))
  for (const s of home) {
    if (s.hidden) continue
    const name = sectionName(s, designs)
    const add = (blocks: boolean, text: string) => out.push({ sectionId: s.id, blocks, text: `${name}: ${text}` })
    switch (s.key) {
      case 'hero':
        // V1: a video stands in for the photo (the shop paints the video's first frame); a photo stays optional then.
        if (s.layout !== 'text' && !s.image && !s.video) add(true, 'add a photo or a video')
        if (altMissing(s.image)) add(true, 'describe the photo for people who can’t see it')
        break
      case 'image_text':
        if (!s.image && !s.video) add(true, 'add a photo or a video')
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
        if (s.mode === 'picked') for (const [b, t] of pickedIssues(s.handles, has)) add(b, t)
        break
      case 'products':
        if (s.layout === 'tabs') {
          if (s.tabs.some((h) => !has.has(h))) add(false, 'a collection in its tabs was deleted')
          if (s.tabs.length && !s.tabs.some((h) => has.get(h))) add(false, 'none of its tabs has products, so it shows nothing')
        } else if (s.source.kind === 'collection' && !has.has(s.source.handle)) add(false, 'its collection was deleted, so it shows nothing')
        break
      case 'promises': {
        const t = truePromises(f)
        if (!s.show.some((k) => t.includes(k))) add(false, 'none of these promises is true for your shop today, so it shows nothing')
        break
      }
      // Signal 1.2 (S2): an empty story section shows nothing and never stops a first publish (spec: "empty (hidden)");
      // a photo without a description, or a link with no name, still blocks.
      case 'story_fan': {
        const shown = s.cards.filter((c) => c.image)
        if (shown.length < 3) add(false, 'add 3 cards with photos, or it shows nothing')
        // A card's title is its name on the shop (its photo is then decoration): a description is asked only of an
        // untitled card, and a linked card needs a title or a described photo (a link must have a name).
        if (shown.some((c) => !c.title.trim() && !c.link && altMissing(c.image))) add(true, 'describe each untitled card’s photo for people who can’t see it')
        if (shown.some((c) => c.link && !c.title.trim() && (c.image!.decorative || !c.image!.alt.trim()))) add(true, 'give each linked card a title')
        break
      }
      case 'statement':
        if (!s.image || !s.wordmark.trim()) add(false, 'add a photo and a wordmark, or it shows nothing')
        if (altMissing(s.image)) add(true, 'describe the photo for people who can’t see it')
        break
      // TS0b: an example the owner hasn't replaced blocks Publish (the shop never shows it); a photo not added only
      // leaves its block out; an added photo needs its description, as every photo does.
      case 'design': {
        const d = Object.hasOwn(designs, s.design) ? designs[s.design]! : null
        if (!d) break
        for (const b of fillableOf(d)) {
          const f = fillFor(s.fill, b)
          const example = b.fill?.example === true, label = b.fill!.label
          if (b.kind === 'text' && example && !(f?.kind === 'text' && f.body.length)) add(true, `write your own words for “${label}”`)
          if (b.kind === 'heading' && example && !(f?.kind === 'heading' && f.text.trim())) add(true, `write your own “${label}”`)
          if (b.kind === 'accordion' && example) {
            for (const i of accordionItems(b, f)) if (i.q.trim() && !i.a.trim()) add(true, `write your own answer for “${i.q}”`)
          }
          if (b.kind === 'image') {
            const img = f?.kind === 'image' ? f.image : null
            if (!img) add(false, `add a photo for “${label}”, or it’s left out`)
            else if (altMissing(img)) add(true, `describe “${label}” for people who can’t see it`)
          }
          // TS1b. Nothing here blocks but a picked set without 2 collections and a poster without its description: a
          // block with nothing to show is left out on the shop (the plan's states).
          if (b.kind === 'video') {
            const poster = f?.kind === 'video' ? f.poster : null
            if (!poster && !s.video) add(false, `add a photo or a video for “${label}”, or it’s left out`)
            if (altMissing(poster)) add(true, `describe “${label}” for people who can’t see it`)
          }
          if (b.kind === 'featured_product' && !(f?.kind === 'featured_product')) add(false, `pick a piece for “${label}”, or it’s left out`)
          if (b.kind === 'date') {
            const at = f?.kind === 'date' ? f.at : null
            if (!at) add(false, `set a date for “${label}”, or it’s left out`)
            else if (Date.parse(at) <= now.getTime()) add(false, `its date has passed, so “${label}” is left out`)
          }
          if (b.kind === 'collection_tiles' && (f?.kind === 'collection_tiles' ? f.mode : b.mode) === 'picked') {
            for (const [bl, t] of pickedIssues(f?.kind === 'collection_tiles' ? f.handles : [], has)) add(bl, `${t} for “${label}”`)
          }
          if (b.kind === 'product_grid') {
            const src = f?.kind === 'product_grid' ? f.source : b.source
            if (src.kind === 'collection' && !has.has(src.handle)) add(false, `the collection for “${label}” was deleted, so it’s left out`)
          }
        }
        break
      }
      case 'rich_text': case 'price_tiles': break
      default: s satisfies never
    }
  }
  return out
}
