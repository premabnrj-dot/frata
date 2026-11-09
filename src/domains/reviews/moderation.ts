// =============================================================================
// FILE: src/domains/reviews/moderation.ts — what happens to a review the moment it is sent (Reviews R1).
//
// The same rules for every review and every shop (IS 19000; CCPA dark patterns): never by rating. A link or a phone
// number is hidden with that reason (it never auto-publishes: security and IS 19000 grounds); bad words and spam are
// held for the shop (published after 72 h if it does nothing); "Approve each" holds everything; photos are always
// held until the shop approves them (security review M5).
// =============================================================================

export type HideReason = 'contact' | 'abuse' | 'not_about_product' | 'personal_data' | 'unlawful' | 'spam'
export const HOLD_REASONS = ['language', 'spam', 'approve_each', 'photos'] as const
export type HoldReason = (typeof HOLD_REASONS)[number]
/** What a shopper may report (a report never hides a review by itself). */
export const REPORT_REASONS = ['abuse', 'not_about_product', 'personal_data', 'spam', 'unlawful', 'fake'] as const
export const HIDE_REASONS: readonly { key: HideReason; label: string }[] = [
  { key: 'abuse', label: 'Abusive or hateful' },
  { key: 'not_about_product', label: 'Not about the product' },
  { key: 'personal_data', label: 'Someone’s personal details' },
  { key: 'spam', label: 'Spam or advertising' },
  { key: 'unlawful', label: 'Unlawful content' },
  { key: 'contact', label: 'A link or phone number' },
]

// A bare domain only in lowercase, after a space or the start, with no letter or hyphen after it: "Loved it.In short"
// and "fabric.Co-ord" are missing spaces, not links (impact review R1).
const URL = /https?:\/\/|www\./i
const BARE = /(?:^|[\s("'])[a-z0-9-]+\.(?:com|in|net|org|shop|co|io|me|store)(?![a-zA-Z-])/
// Ten digits with optional +91/0 and separators: an Indian mobile number, however it is spaced.
const PHONE = /(\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}\b/
const REPEAT = /(.)\1{7,}/
// A short list on purpose: a block word list over-holds Indian names and Hinglish. The shop sees everything held.
const BAD = /\b(f+u+c+k+|sh[i1]t|bastard|chutiya|madarchod|behenchod|bhenchod|randi|harami)\w*/i

export type Screened = { hide: HideReason | null; hold: HoldReason | null }

export function screen(text: string, o: { approveEach: boolean; photos: number }): Screened {
  if (URL.test(text) || BARE.test(text) || PHONE.test(text)) return { hide: 'contact', hold: null }
  if (BAD.test(text)) return { hide: null, hold: 'language' }
  if (REPEAT.test(text)) return { hide: null, hold: 'spam' }
  if (o.approveEach) return { hide: null, hold: 'approve_each' }
  if (o.photos > 0) return { hide: null, hold: 'photos' }
  return { hide: null, hold: null }
}
