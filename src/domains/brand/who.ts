// =============================================================================
// FILE: src/domains/brand/who.ts — WHO SAVES A BRAND RECORD, AND WHEN A SAVE WAITS (one-address plan P1·3; owner
// decisions 9, 10, 17; mockup § Words and roles). An allow-list over CAPABILITIES:
//   owner, Manager (shop.manage)            a save goes live; they approve or decline a partner's waiting change
//   the store's partner owner and Lead      before the store opens, a save goes live; once open, it waits for the owner
//     (members role 'partner', shop.build)
//   a partner's Builder, Staff, Accountant  preview only (a Builder sees the page; Staff and the Accountant don't open it)
//   a Frrata support visit                  preview only
// Pure. The page, saveBrand and the decisions read it.
// =============================================================================

import { holds } from '../tenancy/roles'

export type BrandSaver = 'live' | 'waits' | 'support' | 'preview'

export function brandSaver(role: string, supportSessionId: string | null, storeOpen: boolean): BrandSaver {
  if (supportSessionId) return 'support'
  if (holds(role, 'shop.manage')) return 'live'
  if (holds(role, 'shop.build')) return storeOpen ? 'waits' : 'live'
  return 'preview'
}

/** Who approves or declines a waiting change: the owner or a Manager, in person (never a support visit). */
export const decidesBrand = (role: string, supportSessionId: string | null) => !supportSessionId && holds(role, 'shop.manage')

export const BRAND_REFUSAL: Record<'support' | 'preview', string> = {
  support: 'Frrata support can look, not change the store’s brand.',
  preview: 'Only the owner, a Manager or the store’s partner can change the brand. Nothing was changed.',
}
