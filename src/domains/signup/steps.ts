// =============================================================================
// FILE: src/domains/signup/steps.ts
//
// THE SIGN-UP'S STEPS AND THE ADDRESS CHECK'S WORDS. Pure (check:layers): the page, its client flow, the anonymous
// check and the signed-in forms that show an address line all read this one file (plan 2026-11-23-o1-signup O1·1).
// =============================================================================

/** The questions, in the one order they are asked. `email` only for a signed-out person; `phone` only while the
 *  WhatsApp code is on (`signupCodeOn()`). */
export const STEP_ORDER = ['name', 'email', 'plan', 'phone', 'sells'] as const
export type Step = (typeof STEP_ORDER)[number]
/** After the last question: the store is being made, then made. */
export type Moment = Step | 'making' | 'done'

export function signupSteps({ askEmail, codeOn }: { askEmail: boolean; codeOn: boolean }): readonly Step[] {
  return STEP_ORDER.filter((s) => (s !== 'email' || askEmail) && (s !== 'phone' || codeOn))
}

/** 1-based place of a step; making and done count as the last step. */
export function stepNumber(steps: readonly Step[], s: Moment): number {
  if (s === 'making' || s === 'done') return steps.length
  return Math.max(1, steps.indexOf(s) + 1)
}

/** What an address check answers. `limited`: the check was refused (a limit or the database) and says nothing. */
export const ADDRESS_STATES = ['ok', 'taken', 'too_short', 'shape', 'reserved', 'limited'] as const
export type AddressState = (typeof ADDRESS_STATES)[number]
export type AddressCheck = { state: AddressState }

/** The chip beside an address (sign-up, Settings › Web address, the partner's New store). Reserved reads as taken:
 *  the reason is never told. Limited shows nothing. */
export const ADDRESS_WORDS: Record<AddressState, string> = {
  ok: 'Available',
  taken: 'Taken',
  too_short: 'Use 3 or more letters or numbers',
  shape: 'Letters, numbers and hyphens only',
  reserved: 'Taken',
  limited: '',
}

/** The line under an address being typed (the Change web address popup). */
export function addressLine(s: AddressState): string {
  return s === 'taken' || s === 'reserved' ? 'Taken. Try another address.' : ADDRESS_WORDS[s]
}

/** May the person go on with this address? Creation checks it again, so a silent check never stops anyone. */
export function addressUsable(s: AddressState): boolean {
  return s === 'ok' || s === 'limited'
}

const DAY_MS = 86_400_000

/** Milliseconds from the first arrival at /start to "Create store", or null outside 0 to a day (the measure
 *  "/start → created"; v3 clamps it again). */
export function signupMs(arrivedAt: number | null, now: number): number | null {
  if (arrivedAt === null || !Number.isFinite(arrivedAt) || !Number.isFinite(now)) return null
  const ms = Math.round(now - arrivedAt)
  return ms >= 0 && ms <= DAY_MS ? ms : null
}

/** Where a refused creation sends the person back to; null keeps them where they are. */
export function stepForRefusal(code: string | undefined): Step | null {
  if (code === 'slug_taken' || code === 'bad_slug' || code === 'bad_name') return 'name'
  if (code === 'bad_code') return 'phone'
  return null
}
