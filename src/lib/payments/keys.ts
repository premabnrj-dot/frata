import 'server-only'
import { randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { paymentWebhookFor } from '@/lib/db/platform'
import { paymentKeys } from '@/lib/db/schema-orders'
import { open, seal } from '@/lib/crypto/secret-box'
import { modeOf, type Keys } from './razorpay'

// =============================================================================
// FILE: src/lib/payments/keys.ts
//
// A SHOP'S RAZORPAY KEYS — the one module that reads or writes payment_keys.
// Secrets are sealed per shop and field (secret-box.ts); nothing here returns
// a key secret to a caller that renders, and the webhook secret only until
// Razorpay's first event proves it was pasted. Callers pass a tenant
// transaction (asMember / withTenant); webhookFor is the one tenant-free read.
// =============================================================================

export type PaymentStatus =
  | { connected: false }
  | { connected: true; keyId: string; mode: 'test' | 'live'; connectedAt: Date; webhookSeenAt: Date | null; lastEventAt: Date | null; problem: string | null
      webhookKey: string; webhookSecret: string | null }

/** Live payments, as the definers test them (0084, 0086): live keys whose webhook has worked. The ONE reading for
 *  "Razorpay must approve an address first" (D1·8), on Settings and on the address page alike. */
export const takesLivePayments = (p: PaymentStatus | null): boolean => !!p && p.connected && p.mode === 'live' && !!p.webhookSeenAt

/** Save checked keys. A reconnect keeps the webhook (key and secret) so the merchant does not redo it in Razorpay.
 * A change of mode (test → live) forgets that the webhook worked: Razorpay keeps test and live webhooks apart, so a
 * test event proves nothing about live. Before, live keys inherited "Working" from the test webhook, the shop offered
 * online payment with no live webhook, and the secret she needed to make one stayed hidden (shop stress test
 * 2026-11-11). */
export async function saveKeys(tx: Tx, tenantId: string, k: Keys): Promise<void> {
  const mode = modeOf(k.keyId)
  if (!mode) throw new Error('bad key id')
  const [cur] = await tx.select({ webhookKey: paymentKeys.webhookKey, webhookSecretEnc: paymentKeys.webhookSecretEnc, mode: paymentKeys.mode }).from(paymentKeys).where(eq(paymentKeys.tenantId, tenantId))
  const webhookKey = cur?.webhookKey ?? `k_${randomBytes(16).toString('hex')}`
  const webhookSecretEnc = cur?.webhookSecretEnc ?? seal(`whsec_${randomBytes(24).toString('hex')}`, tenantId, 'webhook_secret')
  const newMode = cur && cur.mode !== mode ? { webhookSeenAt: null, lastEventAt: null } : {}
  const row = { keyId: k.keyId, keySecretEnc: seal(k.keySecret, tenantId, 'key_secret'), webhookSecretEnc, webhookKey, mode, connectedAt: new Date(), problem: null, ...newMode }
  await tx.insert(paymentKeys).values({ tenantId, ...row }).onConflictDoUpdate({ target: paymentKeys.tenantId, set: row })
}

export async function removeKeys(tx: Tx, tenantId: string): Promise<void> {
  await tx.delete(paymentKeys).where(eq(paymentKeys.tenantId, tenantId))
}

/** What the console shows. The webhook secret only until the first event arrives. */
export async function paymentStatus(tx: Tx, tenantId: string): Promise<PaymentStatus> {
  const [r] = await tx.select({ keyId: paymentKeys.keyId, mode: paymentKeys.mode, connectedAt: paymentKeys.connectedAt, webhookSeenAt: paymentKeys.webhookSeenAt, lastEventAt: paymentKeys.lastEventAt,
    problem: paymentKeys.problem, webhookKey: paymentKeys.webhookKey, webhookSecretEnc: paymentKeys.webhookSecretEnc }).from(paymentKeys).where(eq(paymentKeys.tenantId, tenantId))
  if (!r) return { connected: false }
  const { webhookSecretEnc, ...rest } = r
  return { connected: true, ...rest, mode: r.mode as 'test' | 'live', webhookSecret: r.webhookSeenAt ? null : open(webhookSecretEnc, tenantId, 'webhook_secret') }
}

/** The keys to call Razorpay with, for the server only. Null: not connected, or unreadable (the secret changed: reconnect). */
export async function keysFor(tx: Tx, tenantId: string): Promise<(Keys & { mode: 'test' | 'live'; webhookSeen: boolean }) | null> {
  const [r] = await tx.select({ keyId: paymentKeys.keyId, keySecretEnc: paymentKeys.keySecretEnc, mode: paymentKeys.mode, webhookSeenAt: paymentKeys.webhookSeenAt }).from(paymentKeys).where(eq(paymentKeys.tenantId, tenantId))
  if (!r) return null
  const keySecret = open(r.keySecretEnc, tenantId, 'key_secret')
  return keySecret ? { keyId: r.keyId, keySecret, mode: r.mode as 'test' | 'live', webhookSeen: !!r.webhookSeenAt } : null
}

/** Online payment is offered on an open shop only with live keys and a webhook that has worked. */
export const canTakeOnline = (k: Awaited<ReturnType<typeof keysFor>>) => !!k && k.mode === 'live' && k.webhookSeen

export async function markProblem(tx: Tx, tenantId: string, problem: string | null) {
  await tx.update(paymentKeys).set({ problem }).where(eq(paymentKeys.tenantId, tenantId))
}

export async function markEvent(tx: Tx, tenantId: string) {
  await tx.update(paymentKeys).set({ lastEventAt: new Date(), webhookSeenAt: sql`coalesce(${paymentKeys.webhookSeenAt}, now())` }).where(eq(paymentKeys.tenantId, tenantId))
}

/** A webhook's shop and its secret, from the key in its URL (before any tenant is known: app_payment_webhook_for). */
export async function webhookFor(key: string): Promise<{ tenantId: string; secret: string } | null> {
  const r = await paymentWebhookFor(key)
  if (!r) return null
  const secret = open(r.secretEnc, r.tenantId, 'webhook_secret')
  return secret ? { tenantId: r.tenantId, secret } : null
}
