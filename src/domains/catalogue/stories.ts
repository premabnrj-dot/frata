import { z } from 'zod'

// =============================================================================
// FILE: src/domains/catalogue/stories.ts — a product's stories and pairings (Signal S3, plan
// docs/plans/2026-11-09-signal-s3.md; board "Product editor"). Pure: shapes and limits only. Characters are the real
// limit (Hindi takes ~3 bytes a character; the database CHECK is a looser byte backstop). Whether a photo is this
// shop's, and whether a paired piece is, is the server's (src/lib/catalogue/extras.ts).
// =============================================================================

import { MAX_NOTES, MAX_PAIRS, MAX_STORIES, STORY_LIMITS } from './stories-facts'
export * from './stories-facts'

const photo = z.object({
  base: z.string().max(300),
  widths: z.array(z.number().int().positive()).min(1).max(4),
  width: z.number().int().positive().max(10000), height: z.number().int().positive().max(10000),
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

/** The stories as saved: trimmed; a story with nothing in it is dropped; empty notes dropped. */
export function cleanStories(input: unknown): { ok: true; stories: Story[] } | { ok: false; error: string } {
  const p = z.array(StorySchema).max(MAX_STORIES).safeParse(input ?? [])
  if (!p.success) return { ok: false, error: `Up to ${MAX_STORIES} stories, each with up to ${MAX_NOTES} notes. A title holds ${STORY_LIMITS.title} characters, the text ${STORY_LIMITS.text}.` }
  const stories = p.data.map((s) => ({ ...s, title: s.title.trim(), text: s.text.trim(), notes: s.notes.map((n) => n.trim()).filter(Boolean) }))
    .filter((s) => s.image || s.title || s.text || s.notes.length)
  return { ok: true, stories }
}

/** Stored stories as read back (the editor, the shop): anything that no longer parses reads as none. */
export const readStories = (stored: unknown): Story[] => { const r = cleanStories(stored); return r.ok ? r.stories : [] }

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Pair ids as asked for: uuids only, each once, never the product itself, at most two (tenancy review M2). */
export function cleanPairIds(input: unknown, self: string): string[] {
  if (!Array.isArray(input)) return []
  const me = self.toLowerCase()
  return [...new Set(input.filter((x): x is string => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()).filter((x) => x !== me))].slice(0, MAX_PAIRS)
}
