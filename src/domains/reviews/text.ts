// =============================================================================
// FILE: src/domains/reviews/text.ts — what a shopper types, made safe to store and show (security review L1).
// NFC; bidi, zero-width and control characters removed (newlines kept); spaces collapsed; capped. Rendered through
// React only, never as HTML or with links made clickable.
// =============================================================================

export const LIMITS = { title: 100, body: 2000, reply: 1000 } as const

// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g

export function cleanText(raw: unknown, max: number): string {
  const s = String(raw ?? '').normalize('NFC').replace(STRIP, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return s.slice(0, max)
}

/** The name a review shows, chosen by its author (never typed): "Ananya R.", "Ananya" or "Anonymous". */
export type NameChoice = 'initial' | 'first' | 'anon'
export function displayName(fullName: string, choice: NameChoice): string {
  const parts = cleanText(fullName, 80).split(/\s+/).filter(Boolean)
  if (choice === 'anon' || !parts.length) return 'Anonymous'
  const first = parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1)
  if (choice === 'first' || parts.length < 2) return first
  return `${first} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`
}
