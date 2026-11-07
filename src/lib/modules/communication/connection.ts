import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { waConnections } from '@/lib/db/schema-communication'
import { withTenant } from '@/lib/db/tenant'
import { open, seal } from '@/lib/crypto/secret-box'
import type { HealthFacts } from '@/domains/communication/health'
import { account, accountNumbers } from './graph'

// =============================================================================
// FILE: src/lib/modules/communication/connection.ts — the one module that reads or writes wa_connections.
// The token is sealed per shop and field; nothing here returns it to a caller that renders. Callers pass the
// shop's own transaction (asModule / withTenant): the row policy is the second lock.
// =============================================================================

const FIELD = 'wa_token'
export type Connection = typeof waConnections.$inferSelect
export type ConnectionView = Omit<Connection, 'tokenEnc'> & { health: HealthFacts }

const toView = ({ tokenEnc: _t, ...c }: Connection): ConnectionView => ({
  ...c,
  health: { displayPhone: c.displayPhone, verifiedName: c.verifiedName, coexistence: c.coexistence, quality: c.quality, limitTier: c.limitTier,
    nameStatus: c.nameStatus, paymentOk: c.paymentOk, currency: c.currency, canSend: c.canSend, tokenRejectedAt: c.tokenRejectedAt },
})

async function openRow(tx: Tx, tenantId: string): Promise<Connection | null> {
  const [r] = await tx.select().from(waConnections).where(and(eq(waConnections.tenantId, tenantId), isNull(waConnections.disconnectedAt))).limit(1)
  return r ?? null
}

/** What the console shows: no token. */
export async function connectionFor(tx: Tx, tenantId: string): Promise<ConnectionView | null> {
  const r = await openRow(tx, tenantId)
  return r ? toView(r) : null
}

/** The open connection and its token, for the server only. Null: not connected, or unreadable (the secret changed). */
export async function tokenFor(tx: Tx, tenantId: string): Promise<{ row: Connection; token: string } | null> {
  const r = await openRow(tx, tenantId)
  if (!r?.tokenEnc) return null
  const token = open(r.tokenEnc, tenantId, FIELD)
  return token ? { row: r, token } : null
}

export type NewConnection = {
  wabaId: string; phoneNumberId: string; businessId: string | null; displayPhone: string; verifiedName: string | null
  coexistence: boolean; token: string; quality: string | null; limitTier: string | null; nameStatus: string | null
  currency: string | null; canSend: string | null; historySyncAt: Date | null
}

/** A reconnect closes the old row first (its token deleted), so one shop has one open number. */
export async function saveConnection(tx: Tx, tenantId: string, userId: string, c: NewConnection, now: Date): Promise<void> {
  await tx.update(waConnections).set({ disconnectedAt: now, disconnectedBy: userId, tokenEnc: null })
    .where(and(eq(waConnections.tenantId, tenantId), isNull(waConnections.disconnectedAt)))
  const { token, ...rest } = c
  await tx.insert(waConnections).values({ tenantId, ...rest, tokenEnc: seal(token, tenantId, FIELD), connectedBy: userId, connectedAt: now, checkedAt: now })
}

/** Meta told us the merchant removed Frrata (account_update PARTNER_REMOVED): closed by the system. */
export const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000'

/** Closes the open row and deletes its token. The number stays the merchant's; history stays here. */
export async function closeConnection(tx: Tx, tenantId: string, userId: string, now: Date): Promise<Connection | null> {
  const [r] = await tx.update(waConnections).set({ disconnectedAt: now, disconnectedBy: userId, tokenEnc: null })
    .where(and(eq(waConnections.tenantId, tenantId), isNull(waConnections.disconnectedAt))).returning()
  return r ?? null
}

/** Reads the number's health from Meta and stores it as facts. Calls Meta outside any transaction. */
export async function refreshHealth(tenantId: string, now: Date): Promise<'ok' | 'none' | 'rejected' | 'unreachable'> {
  const t = await withTenant(tenantId, (tx) => tokenFor(tx, tenantId))
  if (!t) return 'none'
  const [nums, acct] = await Promise.all([accountNumbers(t.token, t.row.wabaId), account(t.token, t.row.wabaId)])
  if (nums === 'rejected' || acct === 'rejected') {
    await withTenant(tenantId, (tx) => tx.update(waConnections).set({ tokenRejectedAt: now, checkedAt: now }).where(and(eq(waConnections.id, t.row.id), eq(waConnections.tenantId, tenantId))))
    return 'rejected'
  }
  if (!nums && !acct) return 'unreachable'
  const n = nums?.find((x) => x.id === t.row.phoneNumberId)
  await withTenant(tenantId, (tx) => tx.update(waConnections).set({
    ...(n ? { displayPhone: n.displayPhone || t.row.displayPhone, verifiedName: n.verifiedName, quality: n.quality, limitTier: n.limitTier, nameStatus: n.nameStatus, canSend: n.canSend } : {}),
    ...(acct ? { currency: acct.currency } : {}),
    tokenRejectedAt: null, checkedAt: now,
  }).where(and(eq(waConnections.id, t.row.id), eq(waConnections.tenantId, tenantId), isNull(waConnections.disconnectedAt))))
  return 'ok'
}

/** The shop's open connection for a page (no token), read in its own transaction. */
export const shopConnection = (tenantId: string) => withTenant(tenantId, (tx) => connectionFor(tx, tenantId))
