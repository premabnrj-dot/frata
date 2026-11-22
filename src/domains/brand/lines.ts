// =============================================================================
// FILE: src/domains/brand/lines.ts — A SHORT LINE A PARTNER MAY SET where shoppers pay (one-address plan P1·1, used by
// P2's checkout heading and thank-you line; spec § 3, owner decision 14). Plain text (the content layer's one rule),
// within its length, and never a way to send a shopper's money or messages elsewhere: no UPI ID or email address, no
// link or web address, no phone number or run of six or more digits in any script (Devanagari and full-width digits
// included). A date written in figures ("10-11-2026") is refused too: write it in words ("10 Nov"). Pure.
// The words are the P2 mockup's (screen 9, owner-approved 2026-11-16; frata-design-language § Checkout and order
// pages): each refusal names what to take out, at the field; the money rules are checked before the length, so a line
// that is both too long and carries a UPI ID names the UPI ID.
// =============================================================================

import { PLAIN_WORDS, refusedChar } from '@/domains/content/plain-text'

const UPI = /[\p{L}\p{N}._-]{2,}@[\p{L}]{2,}/u
/** A scheme, a www., or any word.word ending in two or more letters (a closed list of endings missed .online, .site). */
const URL_LIKE = /(https?:|www\.|[\p{L}\p{N}-]+\.\p{L}{2,}(?![\p{L}\p{N}]))/iu
/** Six or more digits of any script, with spaces, dots, dashes or slashes between them ("98450 12345", "१२३४ ५६७८"). */
const DIGIT_RUN = /\p{Nd}(?:[\s./\-–]*\p{Nd}){5,}/u
/** An Indian mobile number once its digits are plain: +91, 91 or 0 before it at most, then 6–9 and nine more. */
const PHONE = /(?<!\d)(?:\+?91[\s./-]*|0)?[6-9](?:[\s./-]*\d){9}(?!\d)/

/** Devanagari digits as plain ones (NFKC has already folded full-width digits). */
const plainDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))

export const LINE_WORDS = {
  upi: 'This line has a UPI ID. Remove it to save.',
  link: 'This line has a link. Remove it to save.',
  phone: 'This line has a phone number. Remove it to save.',
  number: 'This line has a long number. Remove it to save.',
  long: (max: number) => `Up to ${max} characters.`,
} as const

/** Why a line can't be used, or null. `max` counts as the content layer's plainText does (after NFC). */
export function lineProblem(raw: string, max: number): string | null {
  const s = raw.normalize('NFC').trim()
  if (refusedChar(s) !== null) return PLAIN_WORDS
  // NFKC folds full-width letters and digits to their plain forms before the money rules look.
  const folded = s.normalize('NFKC')
  if (UPI.test(folded)) return LINE_WORDS.upi
  if (URL_LIKE.test(folded)) return LINE_WORDS.link
  if (PHONE.test(plainDigits(folded))) return LINE_WORDS.phone
  if (DIGIT_RUN.test(folded)) return LINE_WORDS.number
  if (s.length > max) return LINE_WORDS.long(max)
  return null
}
