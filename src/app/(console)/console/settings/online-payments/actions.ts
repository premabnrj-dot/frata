'use server'

import { revalidatePath } from 'next/cache'
import { asMember } from '@/lib/auth/as-member'
import { auditEvents } from '@/lib/db/schema'
import { removeKeys, saveKeys } from '@/lib/payments/keys'
import { checkKeys, modeOf } from '@/lib/payments/razorpay'
import { isPaymentsConfigured } from '@/lib/env'
import { refreshShop } from '@/lib/queries/storefront'

// Connecting Razorpay moves a merchant's money: owner only, and never during a
// Frrata support visit (support acts as owner; tenancy review 2026-11-07). The
// keys are checked with Razorpay before anything is saved.

type Result = { ok: true } | { ok: false; error: string; field?: 'keyId' | 'keySecret' }
const OWNER = ['owner'] as const

export async function connectRazorpay(input: { keyId: string; keySecret: string }): Promise<Result> {
  const keyId = String(input?.keyId ?? '').trim(), keySecret = String(input?.keySecret ?? '').trim()
  if (!modeOf(keyId)) return { ok: false, field: 'keyId', error: 'A Key ID starts rzp_live_ or rzp_test_. Copy it from Razorpay → Account & Settings → API keys.' }
  if (!/^[A-Za-z0-9]{12,64}$/.test(keySecret)) return { ok: false, field: 'keySecret', error: 'Paste the Key secret exactly as Razorpay showed it.' }
  if (!isPaymentsConfigured()) return { ok: false, error: 'Online payments are not switched on for Frrata yet. Nothing was saved.' }
  const check = await checkKeys({ keyId, keySecret })
  if (check === 'wrong') return { ok: false, field: 'keySecret', error: 'Razorpay did not accept these keys. Check both, or generate a new pair. Nothing was saved.' }
  if (check === 'unreachable') return { ok: false, error: 'Razorpay did not answer. Nothing was saved. Try again in a minute.' }
  try {
    const r = await asMember(OWNER, { action: 'payments.connect', target: keyId.slice(0, 13) }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return 'support' as const
      await saveKeys(tx, auth.membership.tenantId, { keyId, keySecret })
      await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'payments.connect', target: `${modeOf(keyId)} key` })
      return 'ok' as const
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'support') return { ok: false, error: 'Only the shop’s owner can connect Razorpay, not Frrata support.' }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[connectRazorpay]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not save the keys. Nothing was changed.' }
  }
}

export async function disconnectRazorpay(): Promise<Result> {
  try {
    const r = await asMember(OWNER, { action: 'payments.disconnect' }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return 'support' as const
      await removeKeys(tx, auth.membership.tenantId)
      await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'payments.disconnect' })
      return 'ok' as const
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'support') return { ok: false, error: 'Only the shop’s owner can disconnect Razorpay.' }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[disconnectRazorpay]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not disconnect. Nothing was changed.' }
  }
}
