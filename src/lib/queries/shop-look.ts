import 'server-only'
import { liveOf, withdrawnKeys } from '@/domains/themes/release'
import { themeVersionRows } from '@/lib/db/platform'
import { withTenant } from '@/lib/db/tenant'
import { publishCandidates, revisionBody, revisionOf, type Revision } from '@/lib/themes/look'

// A shop's look for the merchant's own previews (uncached; the shop's cached look is in storefront.ts, the one home of
// cached loaders). Theme Studio TS0a: the same candidates rule (publishCandidates) and liveOf as the shop.

export type StoredLook = { revisionId: string; themeKey: string; themeVersion: string; styleKey: string; settings: unknown }
const stored = (r: Revision | null): StoredLook | null => (r ? { revisionId: r.id, themeKey: r.themeKey, themeVersion: r.themeVersion, styleKey: r.styleKey, settings: r.settings } : null)

/** A revision of THIS shop for its own preview (a draft or an old look). Another shop's id and a missing id read the same: null. */
export const previewRevision = (tenantId: string, revisionId: string) => withTenant(tenantId, async (tx) => stored(await revisionOf(tx, tenantId, revisionId)))

/** The live look as the shop shows it, read fresh: one transaction, the same rule. */
export const previewLook = async (tenantId: string): Promise<StoredLook | null> => {
  const bad = withdrawnKeys(await themeVersionRows())
  return withTenant(tenantId, async (tx) => {
    const live = liveOf(await publishCandidates(tx, tenantId), bad)
    return live ? revisionBody(tx, tenantId, live.revisionId) : null
  })
}
