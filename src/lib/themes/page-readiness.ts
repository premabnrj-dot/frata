import 'server-only'
import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { shopPolicies, shopSettings } from '@/lib/db/schema'
import { pageIssues } from '@/domains/pages/page'
import type { PageDraft, PageTemplate } from '@/domains/pages/templates'
import { missingFacts, renderPolicy, type PolicyFacts } from '@/domains/policies/render'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'

// =============================================================================
// FILE: src/lib/themes/page-readiness.ts — what a page or the Contact line must have before it is shown (Theme Studio
// TS1a, board v2 States; since V1 content a save is live, so these are asked at the save in Console › Content, read in
// the save's own transaction: never a cached loader inside it, P4). A page with an example not replaced is refused; a
// Contact line is refused while a legal detail the Contact page shows is missing (unless the owner rewrote that policy).
// =============================================================================

/** Why this page can't be shown as it is (null: it can). */
export function pageReadiness(template: PageTemplate, draft: PageDraft): string | null {
  return pageIssues(template, draft).find((i) => i.blocks)?.text ?? null
}

/** Why the Contact page can't show a line yet (null: it can). */
export async function contactReadiness(tx: Tx, tenantId: string): Promise<string | null> {
  const [rewritten] = await tx.select({ id: shopPolicies.tenantId }).from(shopPolicies).where(and(eq(shopPolicies.tenantId, tenantId), eq(shopPolicies.kind, 'contact'))).limit(1)
  if (rewritten) return null
  const [s] = await tx.select({ shopName: shopSettings.tenantId, legalName: shopSettings.legalName, address: shopSettings.address, supportEmail: shopSettings.supportEmail, supportPhone: shopSettings.supportPhone,
    grievanceName: shopSettings.grievanceName, grievanceRole: shopSettings.grievanceRole, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone })
    .from(shopSettings).where(eq(shopSettings.tenantId, tenantId)).limit(1)
  if (!s) return null
  const missing = missingFacts(renderPolicy('contact', { ...s, shopName: 'shop' } as unknown as PolicyFacts, (p) => formatInr(paise(p))))
  return missing.length ? `Add the ${missing[0]} in Settings for the Contact page.` : null
}
