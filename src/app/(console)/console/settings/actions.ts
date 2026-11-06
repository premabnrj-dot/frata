'use server'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { parseSection, sectionFor, type Values } from '@/domains/settings/sections'
import { POLICY_PAGES } from '@/domains/policies/render'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { changeShopAddress } from '@/lib/db/platform'
import { auditEvents, shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { slugProblem } from '@/domains/signup/slug'

// Settings are changed by an owner or admin (CAN_MANAGE). Each save checks the
// section's values with the same definition the form drew (src/domains/settings/
// sections.ts), carries the version the page loaded (two tabs never overwrite
// each other silently), and leaves an Activity row with who changed what.

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; error: string; errors?: Record<string, string>; conflict?: boolean }

export async function saveSection(sectionKey: string, values: Values, version: number): Promise<SaveResult> {
  const section = sectionFor(sectionKey)
  if (!section || !Number.isInteger(version)) return { ok: false, error: 'This page is out of date. Reload it.' }
  const parsed = parseSection(section, values)
  if (!parsed.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: parsed.errors }
  const { name, ...columns } = parsed.patch
  try {
    const r = await asMember(CAN_MANAGE, { action: `settings.${section.key}`, detail: { fields: Object.keys(parsed.patch) } }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [row] = await tx.update(shopSettings)
        .set({ ...(columns as Partial<typeof shopSettings.$inferInsert>), version: sql`${shopSettings.version} + 1`, updatedAt: new Date() })
        .where(and(eq(shopSettings.tenantId, tenantId), eq(shopSettings.version, version)))
        .returning({ version: shopSettings.version })
      if (!row) return null
      if (typeof name === 'string') await tx.update(tenants).set({ name }).where(eq(tenants.id, tenantId))
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: `settings.${section.key}`, detail: { fields: Object.keys(parsed.patch) } })
      }
      return row.version
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === null) return { ok: false, conflict: true, error: 'Someone saved this page while you were editing. Reload to see their changes, then make yours again.' }
    revalidatePath('/console', 'layout')
    return { ok: true, version: r.value }
  } catch (err) {
    console.error('[saveSection]', section.key, err instanceof Error ? err.message : err)
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}

/** A policy page rewritten by hand, or `null` to follow the settings again. */
export async function savePolicyText(kind: string, body: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!POLICY_PAGES.some(([k]) => k === kind)) return { ok: false, error: 'Unknown page.' }
  const text = body?.trim() ?? null
  if (text !== null && (text.length < 1 || text.length > 20000)) return { ok: false, error: 'Between 1 and 20,000 characters.' }
  try {
    const r = await asMember(CAN_MANAGE, { action: `policy.${text === null ? 'reset' : 'edit'}`, target: kind }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      if (text === null) await tx.delete(shopPolicies).where(and(eq(shopPolicies.tenantId, tenantId), eq(shopPolicies.kind, kind)))
      else await tx.insert(shopPolicies).values({ tenantId, kind, body: text, updatedBy: auth.userId })
        .onConflictDoUpdate({ target: [shopPolicies.tenantId, shopPolicies.kind], set: { body: text, updatedAt: new Date(), updatedBy: auth.userId } })
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: `policy.${text === null ? 'reset' : 'edit'}`, target: kind })
      }
    })
    if (!r.ok) return { ok: false, error: r.error }
    revalidatePath('/console/settings/policies')
    return { ok: true }
  } catch (err) {
    console.error('[savePolicyText]', err instanceof Error ? err.message : err)
    return { ok: false, error: 'We could not save the page. Nothing was changed.' }
  }
}

const ADDRESS_ERRORS: Record<string, string> = {
  not_owner: 'Only the owner or an admin of this shop can change its address.',
  published: 'Your shop is open, so its address is fixed. Ask Frata support on WhatsApp to move it.',
  bad_slug: 'Letters, digits and hyphens, at least 3.',
  slug_taken: 'That address is taken. Try another.',
}

export async function changeAddress(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return { ok: false, error: auth.message }
  if (auth.membership.supportSessionId) return { ok: false, error: 'Only the shop’s owner can change its address.' }
  const s = String(slug ?? '').toLowerCase()
  const problem = slugProblem(s)
  if (problem) return { ok: false, error: problem === 'reserved' ? 'That address is reserved. Try another.' : ADDRESS_ERRORS.bad_slug! }
  const r = await changeShopAddress(auth.membership.tenantId, auth.userId, s)
  if (!r.ok) return { ok: false, error: ADDRESS_ERRORS[r.error] ?? 'We could not change the address. Nothing was changed.' }
  revalidatePath('/console', 'layout')
  return { ok: true }
}
