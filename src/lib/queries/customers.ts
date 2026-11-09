import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { customerSessions, shopCustomers } from '@/lib/db/schema-customers'
import { orders } from '@/lib/db/schema-orders'
import { cleanMobile } from '@/domains/checkout/mobile'
import { redeem, saveAddress } from '@/lib/db/ekcode'
import { open, seal } from '@/lib/crypto/secret-box'
import { ekOpen, ekSeal, randomToken, tokenDigest } from '@/lib/ekcode/keys'

// =============================================================================
// FILE: src/lib/queries/customers.ts — A SHOP'S OWN SHOPPERS (EkCode P1 task 7; ADR-0010). The return from ekcode.in in
// ONE tenant transaction (speed M3): redeem the grant (tenant and host from the shop's own request), upsert the
// customer by phone, open the shop's session with the chosen address sealed for 24 h. Cached shop pages never call
// this; only the no-store EkCode routes do. Never logs a value.
// =============================================================================

export type Address = { addressLine: string; area: string; landmark: string; city: string; state: string; pincode: string }
export type Prefill = { name: string; phone: string; address: Address | null; addressLabel: string | null; canSave: boolean }

const SESSION_DAYS = 30
const prefillAad = (sessionId: string) => `customer_sessions:prefill:${sessionId}`
const saveAad = (sessionId: string) => `customer_sessions:save:${sessionId}`

function asAddress(v: unknown): Address | null {
  const a = v as Partial<Address> | null
  if (!a || typeof a !== 'object') return null
  const s = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')
  const out = { addressLine: s(a.addressLine, 200), area: s(a.area, 120), landmark: s(a.landmark, 120), city: s(a.city, 60), state: s(a.state, 60), pincode: s(a.pincode, 6) }
  return /^[1-9][0-9]{5}$/.test(out.pincode) && out.addressLine.length >= 5 ? out : null
}

/** The return: a session token for the shop's cookie, or null (expired, replayed, another shop's, or no account). */
export async function signInFromEkcode(tenantId: string, host: string, code: string, challenge: string): Promise<{ token: string } | null> {
  const saveToken = randomToken()
  return withTenant(tenantId, async (tx) => {
    const r = await redeem(tokenDigest(code), challenge, tenantId, host, tokenDigest(saveToken), tx)
    if (!r) return null
    // r.seal_ref only opens the sealed values here; it is the same at every shop, so it is NEVER stored or returned.
    const name = ekOpen(r.name_sealed, `ekcode_accounts:name:${r.seal_ref}`)
    const phone = ekOpen(r.phone_sealed, `ekcode_accounts:phone:${r.seal_ref}`)
    if (!name || !phone || !/^[6-9][0-9]{9}$/.test(phone)) return null
    const address = r.address_id && r.address_sealed ? asAddress(JSON.parse(ekOpen(r.address_sealed, `ekcode_addresses:sealed:${r.address_id}`) ?? 'null')) : null
    const [c] = await tx.insert(shopCustomers).values({ tenantId, phone, name: name.slice(0, 80), pairwise: r.pairwise, source: 'ekcode' })
      .onConflictDoUpdate({ target: [shopCustomers.tenantId, shopCustomers.phone], set: { name: name.slice(0, 80), pairwise: r.pairwise } })
      .returning({ id: shopCustomers.id })
    if (!c) return null
    const token = randomToken()
    const sessionId = randomUUID()
    const prefill = { address, addressLabel: r.address_label }
    await tx.insert(customerSessions).values({
      id: sessionId, tenantId, customerId: c.id, tokenDigest: tokenDigest(token),
      prefillSealed: seal(JSON.stringify(prefill), tenantId, prefillAad(sessionId)), prefillExpiresAt: new Date(Date.now() + 86_400_000),
      saveTokenSealed: seal(saveToken, tenantId, saveAad(sessionId)),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
    })
    return { token }
  })
}

/** What the checkout fills in: only an unrevoked, unexpired session of this shop. */
export async function prefillFor(tenantId: string, token: string): Promise<Prefill | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select({ id: customerSessions.id, prefill: customerSessions.prefillSealed, prefillUntil: customerSessions.prefillExpiresAt,
      save: customerSessions.saveTokenSealed, name: shopCustomers.name, phone: shopCustomers.phone })
      .from(customerSessions).innerJoin(shopCustomers, and(eq(shopCustomers.tenantId, customerSessions.tenantId), eq(shopCustomers.id, customerSessions.customerId)))
      .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenDigest, tokenDigest(token)), isNull(customerSessions.revokedAt), gt(customerSessions.expiresAt, sql`now()`)))
      .limit(1)
    if (!s) return null
    let address: Address | null = null, addressLabel: string | null = null
    if (s.prefill && s.prefillUntil && s.prefillUntil > new Date()) {
      try {
        const p = JSON.parse(open(s.prefill, tenantId, prefillAad(s.id)) ?? 'null') as { address?: unknown; addressLabel?: string | null } | null
        address = asAddress(p?.address); addressLabel = typeof p?.addressLabel === 'string' ? p.addressLabel.slice(0, 20) : null
      } catch { address = null }
    }
    return { name: s.name, phone: s.phone, address, addressLabel, canSave: !!s.save }
  })
}

/** "Not you?": the session ends and its prefill is gone. */
export async function forgetSession(tenantId: string, token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return
  await withTenant(tenantId, (tx) => tx.update(customerSessions).set({ revokedAt: new Date(), prefillSealed: null, saveTokenSealed: null })
    .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenDigest, tokenDigest(token)), isNull(customerSessions.revokedAt))))
}

/** "Save this address to EkCode", after the order: the session's save token, used once (and spent by the definer). */
export async function saveToEkcode(tenantId: string, token: string, label: string, address: Address): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const clean = asAddress(address)
  const name = String(label ?? '').trim().slice(0, 20)
  if (!clean || !name) return false
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select({ id: customerSessions.id, save: customerSessions.saveTokenSealed }).from(customerSessions)
      .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenDigest, tokenDigest(token)), isNull(customerSessions.revokedAt), gt(customerSessions.expiresAt, sql`now()`)))
      .limit(1).for('update')
    if (!s?.save) return false
    await tx.update(customerSessions).set({ saveTokenSealed: null }).where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.id, s.id)))
    const saveToken = open(s.save, tenantId, saveAad(s.id))
    if (!saveToken) return false
    const addressId = randomUUID()
    return saveAddress(tokenDigest(saveToken), tenantId, addressId, name, ekSeal(JSON.stringify(clean), `ekcode_addresses:sealed:${addressId}`), tx)
  })
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0]

/** Inside placeOrder's own transaction: the order points at the session's customer only when the phones match. */
export async function linkCustomer(tx: Tx, tenantId: string, orderId: string, token: string, phone: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return
  const mobile = cleanMobile(phone)
  if (!mobile) return
  const [c] = await tx.select({ id: shopCustomers.id }).from(customerSessions)
    .innerJoin(shopCustomers, and(eq(shopCustomers.tenantId, customerSessions.tenantId), eq(shopCustomers.id, customerSessions.customerId)))
    .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenDigest, tokenDigest(token)), isNull(customerSessions.revokedAt), gt(customerSessions.expiresAt, sql`now()`), eq(shopCustomers.phone, mobile)))
    .limit(1)
  if (c) await tx.update(orders).set({ customerId: c.id }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
}
