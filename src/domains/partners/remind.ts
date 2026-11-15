// =============================================================================
// FILE: src/domains/partners/remind.ts — the words of a reminder a partner sends from their own WhatsApp (P2 Clients).
// Frrata sends nothing (ADR-0010) and stores no client phone (owner, 2026-11-15, Q4): the link has no number, the
// partner picks the chat. Words the brand controls (its store name) are cleaned of control and direction marks and
// capped (security review 2026-11-16). The link itself is `waText` in settings/whatsapp.ts. Pure.
// =============================================================================

/** Strips control characters and the bidi overrides and isolates (U+202A–202E, U+2066–2069), and the zero-width and direction marks (U+200B–200F, U+061C, U+FEFF), trims, caps. */
export function clean(s: string, max = 60): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩​-‏؜﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export type RemindAbout =
  | { kind: 'bill'; number: string | null; label: string; amountText: string; dueText: string }
  | { kind: 'invite' }
  | { kind: 'open' }

/** One short message, signed by the partner person and the partner's business. */
export function remindText(a: RemindAbout, store: string, from: { person: string; business: string }): string {
  const sign = `${clean(from.person, 40)}, ${clean(from.business, 60)}`
  if (a.kind === 'bill') {
    const what = a.number ? `Bill ${clean(a.number, 20)}` : clean(a.label)
    return `Hi, ${what} for ${a.amountText} was due on ${a.dueText}. Thank you. ${sign}`
  }
  if (a.kind === 'invite') return `Hi, your invite to run ${clean(store)} on Frrata is in your email. Accept it to take over the store. ${sign}`
  return `Hi, ${clean(store)} is ready for you. Open it from your Frrata console when you are. ${sign}`
}
