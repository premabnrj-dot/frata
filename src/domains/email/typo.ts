// =============================================================================
// FILE: src/domains/email/typo.ts — "DID YOU MEAN …@gmail.com?" Pure; run on the server (checkout ships no hint: the
// 121 kB budget, speed review P2). Only the domains Indian shoppers use most, one edit away.
// =============================================================================

const COMMON = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'rediffmail.com', 'icloud.com', 'live.com']

function oneEditAway(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else if (a[i + 1] === b[j] && a[i] === b[j + 1]) { i += 2; j += 2 } // a swap counts as one edit
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** The address with its domain fixed, or null when it looks right. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const domain = email.slice(at + 1)
  if (COMMON.includes(domain)) return null
  const fix = COMMON.find((d) => oneEditAway(domain, d))
  return fix ? `${email.slice(0, at)}@${fix}` : null
}
