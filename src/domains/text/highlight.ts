// =============================================================================
// FILE: src/domains/text/highlight.ts — WHERE A SEARCH MATCHED, TO MARK IT (Neel N1c, § Finding: "the match is marked").
//
// Splits text into parts, each a hit or not, by a plain case-folded indexOf: never a RegExp built from what was typed
// (no ReDoS, no escaping), and the parts are rendered as React text, never HTML. Digits match digits only, so "9845"
// marks "9845" inside "+91 98450 12345" whatever the spaces. Pure.
// =============================================================================

export type Part = { text: string; hit: boolean }

/** The parts of `text` with the first match of `query` marked. Nothing to mark → one part. */
export function highlight(text: string, query: string, digitsOnly = false): Part[] {
  const q = digitsOnly ? query.replace(/\D/g, '') : query.trim().toLowerCase()
  if (!q) return [{ text, hit: false }]
  if (!digitsOnly) {
    const at = text.toLowerCase().indexOf(q)
    if (at < 0) return [{ text, hit: false }]
    return [{ text: text.slice(0, at), hit: false }, { text: text.slice(at, at + q.length), hit: true }, { text: text.slice(at + q.length), hit: false }].filter((p) => p.text)
  }
  // Digits: find the run in the digits alone, then map it back to the characters it spans (spaces kept, marked or not).
  const idx: number[] = []
  for (let i = 0; i < text.length; i++) if (/\d/.test(text[i]!)) idx.push(i)
  const at = idx.map((i) => text[i]).join('').indexOf(q)
  if (at < 0) return [{ text, hit: false }]
  const from = idx[at]!, to = idx[at + q.length - 1]! + 1
  return [{ text: text.slice(0, from), hit: false }, { text: text.slice(from, to), hit: true }, { text: text.slice(to), hit: false }].filter((p) => p.text)
}
