// =============================================================================
// FILE: src/domains/brand/lines.ts — A SHORT LINE A PARTNER MAY SET where shoppers pay (one-address plan P1·1, used by
// P2's checkout heading and thank-you line; spec § 3, owner decision 14). Plain text (the content layer's one rule),
// within its length, and never a way to send a shopper's money or messages elsewhere: no UPI ID or email address, no
// link or web address, no phone number and no six or more digits anywhere in the line, in any script (Devanagari and full-width digits
// included). A date written in figures ("10-11-2026") is refused too: write it in words ("10 Nov"). Pure.
// The words are the P2 mockup's (screen 9, owner-approved 2026-11-16; frata-design-language § Checkout and order
// pages): each refusal names what to take out, at the field; the money rules are checked before the length, so a line
// that is both too long and carries a UPI ID names the UPI ID.
// =============================================================================

import { PLAIN_WORDS, refusedChar } from '@/domains/content/plain-rule'

/** A UPI ID or an email, with or without spaces around the @ ("pay shop @ ybl"). */
const UPI = /[\p{L}\p{N}._-]{2,}\s*@\s*[\p{L}]{2,}/u
/** A scheme, a www., or any word.word ending in two or more letters (a closed list of endings missed .online, .site). */
const URL_LIKE = /(https?:|www\.|[\p{L}\p{N}-]+\.\p{L}{2,}(?![\p{L}\p{N}]))/iu
/** An Indian mobile number in a line's digits once everything else is taken out: 6–9 and nine more. */
const PHONE = /[6-9]\d{9}/

/** The line's digits alone, in plain figures (NFKC has already folded full-width ones; Devanagari ones are mapped). The
 *  money rules count digits across the whole line, so no separator — brackets, commas, underscores, dashes, words —
 *  splits a phone number or an account number past them (security review 2026-11-22, MED-1). */
const digitsOf = (s: string) => s.replace(/[\u0966-\u096F]/g, (d) => String(d.charCodeAt(0) - 0x0966)).replace(/\D/g, '')

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
  // NFKC folds full-width letters and digits; the ideographic and half-width full stops are made plain dots too.
  const folded = s.normalize('NFKC').replace(/[\u3002\uFF61\uFF0E]/g, '.')
  if (UPI.test(folded)) return LINE_WORDS.upi
  if (URL_LIKE.test(folded)) return LINE_WORDS.link
  const digits = digitsOf(folded)
  if (PHONE.test(digits)) return LINE_WORDS.phone
  if ((folded.match(/\p{Nd}/gu) ?? []).length >= 6) return LINE_WORDS.number
  if (s.length > max) return LINE_WORDS.long(max)
  return null
}
