'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CANCEL_REASONS, ROLES, type OrderAction } from '@/domains/orders/work'
import { Address, addressErrors } from '@/domains/checkout/address'
import { risk } from '@/domains/orders/risk'
import { asMember } from '@/lib/auth/as-member'
import { requireMember } from '@/lib/auth/require-member'
import { riskFactsFor } from '@/lib/queries/order-risk'
import type { Tx } from '@/lib/db'
import * as work from '@/lib/orders/work'
import * as out from '@/lib/orders/outcomes'
import { refreshShop } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/app/(console)/console/orders/actions.ts
//
// The console's order actions (1D·4a). Each is a thin wrapper: the roles come
// from ROLES[action] in src/domains/orders/work.ts and are checked by asMember
// (hiding a button is never the guard); the work and its history row are
// src/lib/orders/work.ts, in asMember's tenant transaction, with the tenant
// from the membership — never from the caller. Who may do what:
//   confirm, hold, unhold, undo, note, pack, print — owner, admin, staff
//   edit address or phone, cancel                 — owner, admin
//   mark shipped another way                      — owner, admin, staff (never a partner)
//   delivered, came back, lost; undo those        — owner, admin (Ship S·0; undo by the undone action's roles)
// A support visit acts as the owner and is audited: the audit row carries the
// order id and the NAMES of fields changed, never shopper data.
// =============================================================================

export type ActionResult<T = object> = ({ ok: true; eventId: string } & T) | { ok: false; error: string; by?: { email: string | null; at: string } }

const Id = z.string().uuid()
const notFound = { ok: false as const, error: 'Order not found.' }

async function run<T extends object>(action: OrderAction, target: string, detail: object, fn: (tx: Tx, tenantId: string, actor: work.Actor) => Promise<work.Done<T>>, after?: (tenantId: string, v: T) => void): Promise<ActionResult<T>> {
  try {
    const r = await asMember(ROLES[action], { action: `order.${action}`, target, detail }, (tx, auth) =>
      fn(tx, auth.membership.tenantId, { kind: auth.membership.supportSessionId ? 'support' : 'member', userId: auth.userId, email: auth.email ?? '' }))
    if (!r.ok) return { ok: false, error: r.error }
    const v = r.value
    if (!v.ok) return { ok: false, error: v.error, ...(v.by ? { by: { email: v.by.email, at: v.by.at.toISOString() } } : {}) }
    after?.(r.tenantId, v)
    // The whole console layout: the nav's To confirm count lives there, and layouts do not re-render on soft navigation.
    revalidatePath('/console', 'layout')
    return v
  } catch (err) {
    console.error(`[order.${action}]`, err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not save that. Nothing was changed.' }
  }
}

export async function confirmOrder(orderId: string) {
  return Id.safeParse(orderId).success ? run('confirm', orderId, {}, (tx, t, a) => work.confirm(tx, t, a, orderId)) : notFound
}
export async function holdOrder(orderId: string) {
  return Id.safeParse(orderId).success ? run('hold', orderId, {}, (tx, t, a) => work.hold(tx, t, a, orderId)) : notFound
}
export async function unholdOrder(orderId: string) {
  return Id.safeParse(orderId).success ? run('unhold', orderId, {}, (tx, t, a) => work.unhold(tx, t, a, orderId)) : notFound
}
/** Undo by the event the toast or the order's Undo link holds. */
export async function undoOrderAction(eventId: string) {
  return Id.safeParse(eventId).success ? run('undo', eventId, {}, (tx, t, a) => work.undo(tx, t, a, eventId)) : { ok: false as const, error: 'There is nothing to undo.' }
}
/**
 * Undo a bulk action's events in ONE request (architecture review 2026-11-07: fifty client calls run one after
 * another, each with its own render, outlasting the 8 s toast). Each still goes through undoOrderAction: its own
 * compare-and-set, history and audit row. The first refusal is returned, in its own words.
 */
export async function undoMany(eventIds: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = pickIds(eventIds)
  if (!ids.length) return { ok: false, error: 'There is nothing to undo.' }
  let bad: string | null = null
  for (const id of ids) { const r = await undoOrderAction(id); if (!r.ok && !bad) bad = r.error }
  return bad ? { ok: false, error: bad } : { ok: true }
}

export async function addOrderNote(orderId: string, body: string) {
  return Id.safeParse(orderId).success && typeof body === 'string' ? run('note', orderId, {}, (tx, t, a) => work.addNote(tx, t, a, orderId, body)) : notFound
}
export async function packOrder(orderId: string) {
  // Packing takes pre-orders' stock and changes what they are owed: the product pages refresh when it moved.
  return Id.safeParse(orderId).success ? run('pack', orderId, {}, (tx, t, a) => work.pack(tx, t, a, orderId), (tenantId, v) => { if (v.preordersTaken) refreshShop(tenantId, 'catalogue') }) : notFound
}

// Who it goes to: checkout's own rules (src/domains/checkout/address.ts), so an edited address is held to what a
// shopper typed was. Partial: only the fields that changed are sent. `name` there is customerName here.
const Contact = Address.partial().strict()
const TO_ORDER: Record<string, string> = { name: 'customerName' }
export async function editOrderContact(orderId: string, input: unknown): Promise<ActionResult<{ fields: string[] }> & { fieldErrors?: Record<string, string> }> {
  if (!Id.safeParse(orderId).success) return notFound
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const { customerName, ...rest } = raw
  const p = Contact.safeParse({ ...rest, ...(customerName !== undefined ? { name: customerName } : {}) })
  if (!p.success) {
    const errs = addressErrors(p.error)
    return { ok: false, error: 'Check the fields marked below.', fieldErrors: Object.fromEntries(Object.entries(errs).map(([k, v]) => [TO_ORDER[k] ?? k, v])) }
  }
  // Only the fields that were sent: checkout's schema defaults landmark to '' even when partial, which would
  // otherwise "change" it on every edit (found by e2e: "Changed the landmark, city", 2026-11-07).
  const sent = new Set(Object.keys(raw).map((k) => (k === 'customerName' ? 'name' : k)))
  const edit = Object.fromEntries(Object.entries(p.data).filter(([k, v]) => v !== undefined && sent.has(k)).map(([k, v]) => [TO_ORDER[k] ?? k, v])) as work.ContactEdit
  // The audit row (support visits) names the fields, never their values.
  return run('edit', orderId, { fields: Object.keys(edit) }, (tx, t, a) => work.editContact(tx, t, a, orderId, edit))
}

const Cancel = z.object({ reason: z.enum(CANCEL_REASONS), note: z.string().max(500).optional(), restock: z.boolean() }).strict()

export async function cancelOrder(orderId: string, input: unknown) {
  if (!Id.safeParse(orderId).success) return notFound
  const p = Cancel.safeParse(input)
  if (!p.success) return { ok: false as const, error: 'Pick a reason.' }
  return run('cancel', orderId, { reason: p.data.reason, restock: p.data.restock }, (tx, t, a) => work.cancel(tx, t, a, orderId, p.data),
    // A piece back from 0 is buyable again: the cached shop pages show it at once.
    (tenantId, v) => { if (v.backInStock.length) refreshShop(tenantId, 'catalogue') })
}

export type BulkResult = { ok: true; done: { id: string; eventId: string }[]; skippedHigh: number; failed: { id: string; error: string }[] } | { ok: false; error: string }

/** The selection's ids: uuids only, each once, at most a page. */
const pickIds = (orderIds: unknown) => [...new Set(Array.isArray(orderIds) ? orderIds : [])].filter((x): x is string => Id.safeParse(x).success).slice(0, 50)

/**
 * Confirm a selection (the queue's bulk action). Risk is worked out HERE, on the server, from the orders
 * themselves — a High-risk order is skipped and counted, never confirmed in bulk (spec § 1D·1; a person opens
 * it to decide). Each order goes through confirmOrder: its own compare-and-set, history row and audit row, and
 * its own words when it cannot ("Already confirmed by …").
 */
export async function confirmMany(orderIds: string[]): Promise<BulkResult> {
  try {
    const ids = pickIds(orderIds)
    if (!ids.length) return { ok: false, error: 'Select the orders to confirm.' }
    const auth = await requireMember(ROLES.confirm)
    if (!auth.ok) return { ok: false, error: auth.message }
    const facts = await riskFactsFor(auth.membership.tenantId, ids)
    const high = ids.filter((id) => { const f = facts.get(id); return f && risk(f).level === 'high' })
    const done: { id: string; eventId: string }[] = [], failed: { id: string; error: string }[] = ids.filter((x) => !facts.has(x)).map((id) => ({ id, error: 'Order not found.' }))
    for (const id of ids.filter((x) => facts.has(x) && !high.includes(x))) {
      const r = await confirmOrder(id)
      if (r.ok) done.push({ id, eventId: r.eventId })
      else { const by = (r as { by?: { email: string | null } }).by; failed.push({ id, error: by ? `${r.error} by ${by.email ?? 'someone'}` : r.error }) }
    }
    return { ok: true, done, skippedHigh: high.length, failed }
  } catch (err) {
    console.error('[order.confirmMany]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not confirm those. Nothing more was changed.' }
  }
}

/** Put a selection on hold (the queue's bulk action), each through holdOrder. */
export async function holdMany(orderIds: string[]): Promise<BulkResult> {
  try {
    const ids = pickIds(orderIds)
    if (!ids.length) return { ok: false, error: 'Select the orders to hold.' }
    const done: { id: string; eventId: string }[] = [], failed: { id: string; error: string }[] = []
    for (const id of ids) { const r = await holdOrder(id); if (r.ok) done.push({ id, eventId: r.eventId }); else failed.push({ id, error: r.error }) }
    return { ok: true, done, skippedHigh: 0, failed }
  } catch (err) {
    console.error('[order.holdMany]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not hold those. Nothing more was changed.' }
  }
}

// ── Ship S·0: a parcel's dates by hand (src/lib/orders/outcomes.ts) ──

const Shipped = z.object({ courierName: z.string().trim().max(60).optional(), trackingNumber: z.string().trim().max(40).optional() })

/** Shipped another way: courier name and tracking number as typed, both optional. */
export async function shipOrder(orderId: string, input: unknown = {}) {
  const p = Shipped.safeParse(input)
  if (!Id.safeParse(orderId).success || !p.success) return notFound
  return run('ship_self', orderId, {}, (tx, t, a) => out.markShipped(tx, { tenantId: t, actor: a, orderId, ...p.data }))
}
export async function deliverOrder(orderId: string) {
  return Id.safeParse(orderId).success ? run('deliver', orderId, {}, (tx, t, a) => out.markDelivered(tx, { tenantId: t, actor: a, orderId })) : notFound
}
/** It came back to the shop; its stock goes back only when asked (then the shop's pages read fresh stock). */
export async function cameBackOrder(orderId: string, restock: boolean) {
  return Id.safeParse(orderId).success
    ? run('came_back', orderId, { restock: !!restock }, (tx, t, a) => out.markCameBack(tx, { tenantId: t, actor: a, orderId, restock: !!restock }),
      (t, v) => { if (v.backInStock.length) refreshShop(t, 'catalogue') })
    : notFound
}
export async function lostOrder(orderId: string) {
  return Id.safeParse(orderId).success ? run('lost', orderId, {}, (tx, t, a) => out.markLost(tx, { tenantId: t, actor: a, orderId })) : notFound
}

/** Undo Shipped, Delivered, Came back or Lost: shippers reach it; undoOutcome checks the role of the action undone. */
export async function undoOutcomeAction(eventId: string): Promise<ActionResult> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: 'There is nothing to undo.' }
  try {
    const r = await asMember(ROLES.ship_self, { action: 'order.undo_outcome', target: eventId, detail: {} }, (tx, auth) =>
      out.undoOutcome(tx, auth.membership.tenantId, { kind: auth.membership.supportSessionId ? 'support' : 'member', userId: auth.userId, email: auth.email ?? '', role: auth.membership.role }, eventId))
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: r.value.error }
    revalidatePath('/console', 'layout')
    return r.value
  } catch (err) {
    console.error('[order.undo_outcome]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not undo that. Nothing was changed.' }
  }
}

/** Mark a selection delivered (the queue's bulk action, at most 50), each through deliverOrder. */
export async function deliverMany(orderIds: string[]): Promise<BulkResult> {
  try {
    const ids = pickIds(orderIds)
    if (!ids.length) return { ok: false, error: 'Select the orders that were delivered.' }
    const done: { id: string; eventId: string }[] = [], failed: { id: string; error: string }[] = []
    for (const id of ids) { const r = await deliverOrder(id); if (r.ok) done.push({ id, eventId: r.eventId }); else failed.push({ id, error: r.error }) }
    return { ok: true, done, skippedHigh: 0, failed }
  } catch (err) {
    console.error('[order.deliverMany]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not mark those. Nothing more was changed.' }
  }
}
