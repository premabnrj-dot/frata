// =============================================================================
// FILE: src/domains/content/who.ts — WHO MAY SAVE A STORE'S CONTENT (ADR-0014 amendment 8 rule 2; ADR-0015
// `content.write`; owner 2026-11-15: a partner only before handover in V1, staff read only). An allow-list: owners and
// Managers save; a partner only while the store has no owner; every other role, and any role added later, reads only.
// A Frrata support visit never saves (it acts as the owner, so it is refused by its session). The one rule for the
// page, the actions and Undo. Pure: `hasOwner` is read by the caller inside its transaction, failing closed.
// =============================================================================

import { holds } from '../tenancy/roles'

export type ContentSaver = 'yes' | 'support' | 'after_handover' | 'read_only'

export function contentSaver(role: string, hasOwner: boolean, supportSessionId: string | null): ContentSaver {
  if (supportSessionId) return 'support'
  // ADR-0015: who holds `content.write` (lane C's table); a partner only before handover, this lane's own rule (V1).
  if (!holds(role, 'content.write')) return 'read_only'
  if (role === 'partner') return hasOwner ? 'after_handover' : 'yes'
  return 'yes'
}

export const SAVER_REFUSAL: Record<Exclude<ContentSaver, 'yes'>, string> = {
  support: 'Frrata support can look, not change the store’s content.',
  after_handover: 'The owner saves content now. Ask them to change it.',
  read_only: 'Only the owner or a Manager can change content.',
}
