import { z } from 'zod'

// =============================================================================
// FILE: src/domains/content/plain-text.ts — THE ONE PLAIN-TEXT RULE for words a brand saves as content (spec
// 2026-11-14 § plain-text rule; plan docs/plans/2026-11-15-v1-content.md). Used on save, and later by the Storefront
// API's output schemas. NFC first; refuses control characters (a line break only where `lines` allows it), format
// characters (bidi overrides, zero-width spaces, word joiners, the BOM, soft hyphens, tag characters) except ZWNJ and
// ZWJ, which Indic scripts need, private-use and unassigned code points, and < > { } \. Pure.
// =============================================================================

import { PLAIN_WORDS, refusedChar } from './plain-rule'
export { PLAIN_WORDS, refusedChar }

/** Plain words, at most `max` characters after NFC (line breaks only with `lines`; Windows breaks become \n). */
export const plainText = (max: number, opts: { lines?: boolean; min?: number } = {}) =>
  z.string()
    .transform((s) => (opts.lines ? s.replace(/\r\n?/g, '\n') : s).normalize('NFC').trim())
    .pipe(z.string().min(opts.min ?? 1).max(max).refine((s) => refusedChar(s, !!opts.lines) === null, PLAIN_WORDS))
