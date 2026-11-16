// =============================================================================
// FILE: src/domains/brand/accent.ts — THE ONE ACCENT RULE (one-address plan P1·1; spec § 5): a code-site store's
// accent and the text on it are its brand record's, a live season's when one runs; a theme shop's stay its look's
// accent on white text, untouched (O19). Every reader of "the store's colour" outside the theme shell (emails, share
// cards) asks here. Paper is different: a document prints on white, so it keeps paperAccent
// (src/domains/documents/paper.ts) over whatever this answers. Pure: `now` is passed.
// =============================================================================

import { THEME_ON } from './defaults'
import type { BrandRecord } from './record'
import { liveSeason, type Season } from './seasons'

/** The store's accent and the colour of text on it at `now`. */
export function accentOf(record: Pick<BrandRecord, 'palette'> | null, seasons: readonly Season[], now: Date, themeAccent: string): { accent: string; on: string } {
  if (!record) return { accent: themeAccent, on: THEME_ON }
  const s = liveSeason(seasons, now)
  return s ? { accent: s.accent, on: s.on } : { accent: record.palette.accent, on: record.palette.on }
}
