// =============================================================================
// FILE: src/domains/brand/lines.ts — A SHORT LINE A PARTNER MAY SET where shoppers pay (one-address plan P1·1, used by
// P2's checkout heading and thank-you line; spec § 3, owner decision 14). Plain text (the content layer's one rule),
// within its length, and never a way to send a shopper's money or messages elsewhere: no UPI ID or email address, no
// link or web address, no phone number or run of six or more digits in any script (Devanagari and full-width digits
// included). A date written in figures ("10-11-2026") is refused too: write it in words ("10 Nov"). Pure.
// =============================================================================

import { PLAIN_WORDS, refusedChar } from '@/domains/content/plain-text'

const UPI = /[\p{L}\p{N}._-]{2,}@[\p{L}]{2,}/u
/** A scheme, a www., or any word.word ending in two or more letters (a closed list of endings missed .online, .site). */
const URL_LIKE = /(https?:|www\.|[\p{L}\p{N}-]+\.\p{L}{2,}(?![\p{L}\p{N}]))/iu
/** Six or more digits of any script, with spaces, dots, dashes or slashes between them ("98450 12345", "१२३४ ५६७८"). */
const DIGIT_RUN = /\p{Nd}(?:[\s./\-–]*\p{Nd}){5,}/u

/** Why a line can't be used, or null. `max` counts as the content layer's plainText does (after NFC). */
export function lineProblem(raw: string, max: number): string | null {
  const s = raw.normalize('NFC').trim()
  if (s.length > max) return `Keep it to ${max} characters.`
  if (refusedChar(s) !== null) return PLAIN_WORDS
  // NFKC folds full-width letters and digits to their plain forms before the money rules look.
  const folded = s.normalize('NFKC')
  if (UPI.test(folded)) return 'Leave out UPI IDs and email addresses.'
  if (URL_LIKE.test(folded)) return 'Leave out links and web addresses.'
  if (DIGIT_RUN.test(folded)) return 'Leave out phone numbers and long numbers.'
  return null
}
