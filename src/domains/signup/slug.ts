// =============================================================================
// FILE: src/domains/signup/slug.ts
//
// A SHOP'S ADDRESS FROM ITS NAME, and the small judgements sign-up makes. Pure.
// The database holds the same SHAPE as a CHECK in app_create_shop
// (drizzle/0008); the reserved words live only here.
// =============================================================================

/** Lower-case letters, digits and single hyphens; 3–30 long; no hyphen at either end. */
export const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/

/** Addresses a shop may not take: ours, or ones a shopper could mistake for ours. */
export const RESERVED = new Set([
  'ekcode',
  'www', 'app', 'api', 'admin', 'console', 'frata', 'frrata', 'help', 'support', 'status', 'mail', 'email',
  'shop', 'store', 'stores', 'login', 'signin', 'signup', 'account', 'billing', 'pay', 'payments',
  'checkout', 'cdn', 'static', 'assets', 'blog', 'docs', 'demo', 'test', 'staging', 'dev', 'root',
])

/** "Kesar & Co." → "kesar-and-co". Letters outside a–z (Hindi, emoji) are dropped; the merchant types the rest. */
export function slugFor(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '')
}

export type SlugProblem = 'too_short' | 'shape' | 'reserved'

/** Why an address cannot be used, or null. "Taken" needs the database and is not decided here. */
export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length < 3) return 'too_short'
  if (!SLUG_SHAPE.test(slug) || slug.includes('--')) return 'shape'
  if (RESERVED.has(slug)) return 'reserved'
  return null
}

/** Order numbers read KS-1043. The merchant's own prefix wins; otherwise two letters of the name. */
export function orderPrefix(stored: string, shopName: string): string {
  if (stored.trim()) return stored.trim().toUpperCase()
  const letters = shopName.replace(/[^A-Za-z]/g, '').toUpperCase()
  return letters.slice(0, 2) || 'OR'
}

const TYPO_DOMAINS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gnail.com': 'gmail.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'hotmal.com': 'hotmail.com', 'outlok.com': 'outlook.com',
  'redifmail.com': 'rediffmail.com', 'rediffmail.co': 'rediffmail.com',
}

/** "riya@gmial.com" → "riya@gmail.com"; null when nothing looks mistyped. */
export function emailTypo(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const fix = TYPO_DOMAINS[email.slice(at + 1).toLowerCase()]
  return fix ? `${email.slice(0, at)}@${fix}` : null
}

// Linear: every part between dots excludes the dot, so a long hostile string cannot make it backtrack (security
// review 2026-11-08 measured 7.7 s at 80k characters on the old /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/).
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/
export const PINCODE_SHAPE = /^[1-9][0-9]{5}$/
