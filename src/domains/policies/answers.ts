import { renderPolicy, type Piece, type PolicyFacts, type PolicyPage } from './render'

// =============================================================================
// FILE: src/domains/policies/answers.ts — an FAQ's answers that follow the shop's Settings (Theme Studio TS1a; one
// source with the policy pages, architecture review 4). Each answer is a paragraph of the same policy renderPolicy
// writes; when the owner has rewritten that policy, the answer points to it instead (never two versions of a promise).
// Pure.
// =============================================================================

export const BOUND = ['cod', 'delivery', 'returns'] as const
export type Bound = (typeof BOUND)[number]
/** The question a bound answer starts with (the owner may reword the question, never the answer). */
export const BOUND_QUESTION: Record<Bound, string> = {
  cod: 'Can I pay on delivery?',
  delivery: 'How fast do you ship?',
  returns: 'Can I return or exchange?',
}
/** The policy each answer comes from. */
export const BOUND_POLICY: Record<Bound, PolicyPage> = { cod: 'shipping', delivery: 'shipping', returns: 'returns' }

export type Answer = { pieces: Piece[] } | { policy: PolicyPage } | null

/**
 * A bound answer: the policy's own paragraph, or a pointer to the policy when the owner rewrote it. Null when the
 * facts it needs aren't in Settings yet (the shop leaves the question out; the console says what to add).
 */
export function boundAnswer(kind: Bound, f: PolicyFacts, overrides: Partial<Record<PolicyPage, string | null>>, inr: (paise: number) => string): Answer {
  const page = BOUND_POLICY[kind]
  if (Object.hasOwn(overrides, page) && overrides[page]?.trim()) return { policy: page }
  const paras = renderPolicy(page, f, inr)
  const pick = kind === 'returns' ? paras[0]
    : kind === 'delivery' ? paras[0]
    : f.codOn ? paras.find((p) => p.some((x) => 'text' in x && x.text.startsWith('Pay on delivery')))
    : [{ text: 'No. Every order is paid online when you place it.' }] as Piece[]
  if (!pick || pick.some((x) => 'fact' in x && x.value === null)) return null
  return { pieces: pick }
}

/** An answer as plain words (pieces joined; facts by their value). */
export const answerText = (pieces: Piece[]) => pieces.map((p) => ('text' in p ? p.text : p.value ?? '')).join('')
