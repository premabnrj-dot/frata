// =============================================================================
// FILE: src/domains/content/who.ts — WHO MAY SAVE A STORE'S CONTENT (ADR-0014 amendment 8 rule 2; ADR-0015
// `content.write`; owner 2026-11-15: a partner member manages content before and after handover, staff read only). An
// allow-list: whoever holds `content.write` (owner, Manager, the store's partner) saves; every other role, and any role
// added later, reads only. A Frrata support visit never saves (it acts as the owner, so it is refused by its session).
// The one rule for the page, the actions and Undo. A partner's save after handover is told to the owner in the Inbox
// (app_content_partner_notice, called by the actions).
// =============================================================================

import { holds } from '../tenancy/roles'

export type ContentSaver = 'yes' | 'support' | 'read_only'

export function contentSaver(role: string, supportSessionId: string | null): ContentSaver {
  if (supportSessionId) return 'support'
  return holds(role, 'content.write') ? 'yes' : 'read_only'
}

export const SAVER_REFUSAL: Record<Exclude<ContentSaver, 'yes'>, string> = {
  support: 'Frrata support can look, not change the store’s content.',
  read_only: 'Only the owner, a Manager or the partner can change content.',
}
