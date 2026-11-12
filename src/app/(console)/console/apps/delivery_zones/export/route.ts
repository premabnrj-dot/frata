import { asc, eq } from 'drizzle-orm'
import { CAN_BUILD } from '@/lib/auth/require-member'
import { asModule } from '@/lib/auth/as-module'
import { contentDisposition } from '@/domains/documents/paper'
import { rulesCsv, type RuleKind } from '@/domains/delivery/lists'
import { deliveryRules } from '@/lib/db/schema-delivery'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { errName } from '@/lib/log'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30
export const dynamic = 'force-dynamic'

// =============================================================================
// FILE: apps/delivery_zones/export/route.ts — the shop's PIN code rules as the CSV the import reads back (Delivery
// Zones PD·1; security review L2). Who edits them may export them (CAN_BUILD, the app usable), limited per member,
// failing closed. ≤ 5,000 rows (MAX_RULES): one buffered reply. Formula-safe cells; attachment; never cached or sniffed.
// =============================================================================

const plain = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function GET() {
  const now = new Date()
  try {
    const r = await asModule('delivery_zones', CAN_BUILD, { action: 'delivery.rules.export' }, async (tx, auth) => {
      if (!(await withinLimit(LIMITS.deliveryExportMember, auth.userId, now, true))) return 'limited' as const
      return tx.select({ pincode: deliveryRules.pincode, rule: deliveryRules.rule, codMax: deliveryRules.codMax, note: deliveryRules.note })
        .from(deliveryRules).where(eq(deliveryRules.tenantId, auth.membership.tenantId)).orderBy(asc(deliveryRules.pincode))
    })
    if (!r.ok) return plain(403, r.error)
    if (r.value === 'limited') return plain(429, 'Too many exports in the last few minutes. Try again shortly.')
    const body = `﻿${rulesCsv(r.value.map((x) => ({ pincode: x.pincode, rule: x.rule as RuleKind, codMax: x.codMax === null ? null : Number(x.codMax), note: x.note })))}`
    return new Response(body, { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': contentDisposition('PIN_code_rules.csv'),
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch (err) {
    console.error('[delivery export]', errName(err))
    return plain(500, 'We could not make the file. Try again in a minute.')
  }
}
