import { z } from 'zod'

// =============================================================================
// FILE: src/domains/catalogue/stories.ts — a product's stories and pairings (Signal S3, plan
// docs/plans/2026-11-09-signal-s3.md; board "Product editor"). Pure: shapes and limits only. Characters are the real
// limit (Hindi takes ~3 bytes a character; the database CHECK is a looser byte backstop). Whether a photo is this
// shop's, and whether a paired piece is, is the server's (src/lib/catalogue/extras.ts).
// =============================================================================

export const MAX_STORIES = 6, MAX_NOTES = 3, MAX_PAIRS = 2
export const STORY_LIMITS = { title: 60, text: 300, note: 60 } as const

const photo = z.object({
  base: z.string().max(300),
  widths: z.array(z.number().int().positive()).min(1).max(4),
  width: z.number().int().positive(), height: z.number().int().positive(),
  alt: z.string().max(160).default(''),
  decorative: z.boolean().default(false),
})
export const StorySchema = z.object({
  image: photo.nullable().default(null),
  title: z.string().max(STORY_LIMITS.title).default(''),
  text: z.string().max(STORY_LIMITS.text).default(''),
  notes: z.array(z.string().max(STORY_LIMITS.note)).max(MAX_NOTES).default([]),
})
export type Story = z.infer<typeof StorySchema>
export type StoryPhoto = z.infer<typeof photo>

/** The stories as saved: trimmed; a story with nothing in it is dropped; empty notes dropped. */
export function cleanStories(input: unknown): { ok: true; stories: Story[] } | { ok: false; error: string } {
  const p = z.array(StorySchema).max(MAX_STORIES).safeParse(input ?? [])
  if (!p.success) return { ok: false, error: `Up to ${MAX_STORIES} stories: a title up to ${STORY_LIMITS.title} characters, text up to ${STORY_LIMITS.text}, up to ${MAX_NOTES} notes.` }
  const stories = p.data.map((s) => ({ ...s, title: s.title.trim(), text: s.text.trim(), notes: s.notes.map((n) => n.trim()).filter(Boolean) }))
    .filter((s) => s.image || s.title || s.text || s.notes.length)
  return { ok: true, stories }
}

/** Stored stories as read back (the editor, the shop): anything that no longer parses reads as none. */
export const readStories = (stored: unknown): Story[] => { const r = cleanStories(stored); return r.ok ? r.stories : [] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Pair ids as asked for: uuids only, each once, never the product itself, at most two (tenancy review M2). */
export function cleanPairIds(input: unknown, self: string): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.filter((x): x is string => typeof x === 'string' && UUID.test(x) && x !== self))].slice(0, MAX_PAIRS)
}

/** What a shopper is offered for a paired piece: Add only with no options (one variant) and buyable; else Choose (its
 *  page), so a sized piece is never put in the bag without its size (architecture review 6). */
export const pairAction = (p: { options: string[]; buyableVariants: number }): 'add' | 'choose' =>
  p.options.length === 0 && p.buyableVariants === 1 ? 'add' : 'choose'

/** A piece as the editor's "Pair it with" card shows it (src/lib/queries/catalogue.ts reads it). */
export type Piece = { id: string; title: string; status: string; base: string | null; widths: number[] | null; price: number | null; sizes: number; buyable: boolean }
