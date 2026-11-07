'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { asMember } from '@/lib/auth/as-member'
import { asModule, moduleGate } from '@/lib/auth/as-module'
import { CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { isMessagesConfigured } from '@/lib/env'
import { closeConnection, refreshHealth, saveConnection, tokenFor } from '@/lib/modules/communication/connection'
import { account, accountNumbers, exchangeCode, grantedAccounts, registerNumber, startHistorySync, subscribeApp, unsubscribeApp } from '@/lib/modules/communication/graph'

// =============================================================================
// Connecting WhatsApp (C1). Owner or admin, never a Frrata support visit (it is the merchant's Meta account).
// ADR-0006 exception, written down: the signup code lives 30 s, so the exchange is an inline call (with a
// timeout), made before any transaction; nothing is stored until Meta has answered every step.
// The ids stored come from the token Meta gave us (debug_token, then the account's numbers), never from the
// browser: the popup's ids are a hint for which of the granted numbers was picked (tenancy review, HIGH).
// =============================================================================

type Result = { ok: true } | { ok: false; error: string }
const META_ID = /^[0-9]{5,20}$/
const Connect = z.object({
  code: z.string().min(10).max(1024),
  hint: z.object({ wabaId: z.string().regex(META_ID).optional(), phoneNumberId: z.string().regex(META_ID).optional() }).optional(),
})

const audit = (tx: Parameters<Parameters<typeof asMember>[2]>[0], a: { tenantId: string; userId: string; email: string | null }, action: string, target?: string) =>
  tx.insert(auditEvents).values({ tenantId: a.tenantId, actorUserId: a.userId, actorEmail: a.email, actorKind: 'member', action, target: target ?? null })

export async function connectWhatsAppAction(input: unknown): Promise<Result> {
  const p = Connect.safeParse(input)
  if (!p.success) return { ok: false, error: 'Meta did not finish. Nothing was saved. Try again.' }
  if (!isMessagesConfigured()) return { ok: false, error: 'WhatsApp is not switched on for Frrata yet. Nothing was saved.' }
  const gate = await moduleGate('communication', CAN_MANAGE)
  if (!gate.ok) return gate
  if (gate.auth.membership.supportSessionId) return { ok: false, error: 'Only the shop’s owner or an admin can connect WhatsApp, not Frrata support.' }

  const ex = await exchangeCode(p.data.code)
  if (!ex.ok) return { ok: false, error: 'Meta did not accept the sign-in. It lasts 30 seconds: try again.' }
  const granted = await grantedAccounts(ex.token)
  const wabaId = p.data.hint?.wabaId && granted.includes(p.data.hint.wabaId) ? p.data.hint.wabaId : granted[0]
  if (!wabaId) return { ok: false, error: 'Meta did not share a WhatsApp account with Frrata. Try again and pick your business.' }
  const numbers = await accountNumbers(ex.token, wabaId)
  if (!numbers || numbers === 'rejected' || numbers.length === 0) return { ok: false, error: 'Meta did not share a number. Try again and pick your number.' }
  const n = numbers.find((x) => x.id === p.data.hint?.phoneNumberId) ?? numbers[0]!
  if (!(await subscribeApp(ex.token, wabaId))) return { ok: false, error: 'Meta did not finish connecting. Nothing was saved. Try again.' }
  // A Business app number is already registered and must not be (checked 2026-11-07); a new one gets a PIN.
  if (!n.onBusinessApp && !(await registerNumber(ex.token, n.id))) return { ok: false, error: 'Meta did not turn the number on. Nothing was saved. Try again in a few minutes.' }
  const [acct, synced] = await Promise.all([account(ex.token, wabaId), n.onBusinessApp ? startHistorySync(ex.token, n.id) : Promise.resolve(false)])
  const a = acct && acct !== 'rejected' ? acct : null
  const now = new Date()
  try {
    const r = await asModule('communication', CAN_MANAGE, { action: 'messages.connect', target: n.displayPhone }, async (tx, auth) => {
      await saveConnection(tx, auth.membership.tenantId, auth.userId, {
        wabaId, phoneNumberId: n.id, businessId: a?.businessId ?? null, displayPhone: n.displayPhone, verifiedName: n.verifiedName,
        coexistence: n.onBusinessApp, token: ex.token, quality: n.quality, limitTier: n.limitTier, nameStatus: n.nameStatus,
        currency: a?.currency ?? null, canSend: n.canSend, historySyncAt: synced ? now : null,
      }, now)
      await audit(tx, { tenantId: auth.membership.tenantId, userId: auth.userId, email: auth.email }, 'messages.connect', n.displayPhone)
    })
    if (!r.ok) return r
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    // The number or account is open on another shop (the partial unique indexes).
    if ((err as { code?: string })?.code === '23505') return { ok: false, error: 'This number is connected to another Frrata shop. Disconnect it there first.' }
    console.error('[connectWhatsApp]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not save the connection. Try again.' }
  }
}

export async function disconnectWhatsAppAction(): Promise<Result> {
  try {
    const read = await asMember(CAN_MANAGE, { action: 'messages.disconnect.read' }, async (tx, auth) =>
      auth.membership.supportSessionId ? 'support' as const : tokenFor(tx, auth.membership.tenantId))
    if (!read.ok) return read
    if (read.value === 'support') return { ok: false, error: 'Only the shop’s owner or an admin can disconnect WhatsApp.' }
    // Best effort: Frrata stops receiving this account's webhooks. The row is closed either way.
    if (read.value) await unsubscribeApp(read.value.token, read.value.row.wabaId)
    const r = await asMember(CAN_MANAGE, { action: 'messages.disconnect' }, async (tx, auth) => {
      const closed = await closeConnection(tx, auth.membership.tenantId, auth.userId, new Date())
      if (closed) await audit(tx, { tenantId: auth.membership.tenantId, userId: auth.userId, email: auth.email }, 'messages.disconnect', closed.displayPhone)
    })
    if (!r.ok) return r
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[disconnectWhatsApp]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not disconnect. Nothing was changed.' }
  }
}

export async function checkWhatsAppAction(): Promise<Result> {
  const gate = await moduleGate('communication', CAN_MANAGE)
  if (!gate.ok) return gate
  const r = await refreshHealth(gate.auth.membership.tenantId, new Date())
  revalidatePath('/console/apps/communication')
  if (r === 'unreachable') return { ok: false, error: 'Meta did not answer. Try again in a minute.' }
  if (r === 'none') return { ok: false, error: 'No number is connected.' }
  return { ok: true }
}
