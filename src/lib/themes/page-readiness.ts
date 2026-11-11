import 'server-only'
import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { shopPolicies, shopSettings } from '@/lib/db/schema'
import { pageIssues } from '@/domains/pages/page'
import type { PageTemplate } from '@/domains/pages/templates'
import { missingFacts, renderPolicy, type PolicyFacts } from '@/domains/policies/render'
import { readContact } from '@/domains/themes/layer'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { draftOf, pendingPages } from './pages'

// =============================================================================
// FILE: src/lib/themes/page-readiness.ts — what a Publish's pages must have (Theme Studio TS1a, board v2 States), read
// in the publish's own transaction (never a cached loader inside it: P4). Only what THIS publish changes is judged: a
// page whose draft differs from live (an example not replaced blocks), and the Contact page when its line changed
// (a missing legal detail blocks, unless the owner rewrote the Contact policy).
// =============================================================================

export async function pagesReadiness(tx: Tx, tenantId: string, draftLayer: { contact?: unknown }, liveSettings: unknown): Promise<string | null> {
  for (const p of await pendingPages(tx, tenantId, false)) {
    if (!p.target) continue
    const d = draftOf(p.row)
    const why = d ? pageIssues(p.row.template as PageTemplate, d).find((i) => i.blocks) : null
    if (why) return why.text
  }
  const live = (liveSettings ?? {}) as { contact?: unknown }
  if (JSON.stringify(readContact(draftLayer.contact) ?? null) === JSON.stringify(readContact(live.contact) ?? null)) return null
  const [rewritten] = await tx.select({ id: shopPolicies.tenantId }).from(shopPolicies).where(and(eq(shopPolicies.tenantId, tenantId), eq(shopPolicies.kind, 'contact'))).limit(1)
  if (rewritten) return null
  const [s] = await tx.select({ shopName: shopSettings.tenantId, legalName: shopSettings.legalName, address: shopSettings.address, supportEmail: shopSettings.supportEmail, supportPhone: shopSettings.supportPhone,
    grievanceName: shopSettings.grievanceName, grievanceRole: shopSettings.grievanceRole, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone })
    .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).limit(1)
  if (!s) return null
  const missing = missingFacts(renderPolicy('contact', { ...s, shopName: 'shop' } as unknown as PolicyFacts, (p) => formatInr(paise(p))))
  return missing.length ? `Contact: add the ${missing[0]} in Settings` : null
}
