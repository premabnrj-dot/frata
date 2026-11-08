'use server'

import { sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { parseBillingDetails } from '@/domains/billing/details'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { billingAccounts } from '@/lib/db/schema-billing'
import { errName } from '@/lib/log'

// Billing details (billing B1; plan finding 10): owners and admins (a Frrata support visit may correct them, audited),
// through asMember. Only the detail columns: frata_app holds no grant on the gateway or mandate columns (0048), so the
// upsert names its columns rather than letting drizzle write DEFAULT into every one.
export async function saveBillingDetails(input: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string; errors?: Record<string, string> }> {
  const p = parseBillingDetails(input && typeof input === 'object' ? input : {})
  if (!p.ok) return { ok: false, error: 'Some fields need a look before saving.', errors: p.errors }
  const v = p.value
  try {
    const r = await asMember(CAN_MANAGE, { action: 'billing.details', detail: { gstin: !!v.gstin, state: v.stateCode } }, async (tx, auth) => {
      const t = auth.membership.tenantId
      await tx.execute(sql`insert into ${billingAccounts} (tenant_id, legal_name, gstin, address, state_code, email, updated_at)
        values (${t}, ${v.legalName}, ${v.gstin}, ${v.address}, ${v.stateCode}, ${v.email}, now())
        on conflict (tenant_id) do update set legal_name = excluded.legal_name, gstin = excluded.gstin, address = excluded.address,
          state_code = excluded.state_code, email = excluded.email, updated_at = now()`)
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId: t, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'billing.details', detail: { gstin: !!v.gstin, state: v.stateCode } })
      }
    })
    if (!r.ok) return { ok: false, error: r.error }
    revalidatePath('/console/settings/billing')
    return { ok: true }
  } catch (err) {
    console.error('[billing.details]', errName(err))
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}
