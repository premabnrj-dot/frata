// =============================================================================
// FILE: src/domains/content/plain-rule.ts — THE PLAIN-TEXT RULE ITSELF, without its zod schema (plain-text.ts), so a
// page that checks a line as it is typed (Console › Brand › Checkout, one-address P2·6) doesn't carry zod to the browser.
// plain-text.ts re-exports both names: one home. Pure.
// =============================================================================

/** The rule's one sentence, shown wherever it refuses. */
export const PLAIN_WORDS = 'Use plain words. Leave out < > { } \\ and hidden characters.'

const ZWNJ = 0x200c, ZWJ = 0x200d
const BAD = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}<>{}\\]/u

/** The first character the rule refuses, or null. */
export function refusedChar(s: string, lines = false): string | null {
  for (const ch of s) {
    if (!BAD.test(ch)) continue
    const c = ch.codePointAt(0)!
    if (c === ZWNJ || c === ZWJ) continue
    if (lines && ch === '\n') continue
    return ch
  }
  return null
}
