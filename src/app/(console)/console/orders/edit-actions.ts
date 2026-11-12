'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { EDIT_REASONS } from '@/domains/orders/edit'
import { ROLES } from '@/domains/orders/work'
import { asMember } from '@/lib/auth/as-member'
import { requireMember } from '@/lib/auth/require-member'
import { editItems, paymentStillOpen, undoEdit } from '@/lib/orders/edit'
import { drainSoon } from '@/lib/outbox/drain'
import { itemsEditor, itemsToAdd, type AddResult, type EditorData } from '@/lib/queries/order-edit'
import { refreshSoldOut } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/app/(console)/console/orders/edit-actions.ts
//
// EDIT AN ORDER'S ITEMS (OE·1, docs/plans/2026-11-12-order-edit.md). Who may (spec § Owner decisions, as address
// edits): owner, admin — ROLES.edit, checked by requireMember / asMember in each action. Never a support visit (it
// moves stock and what the courier collects). The tenant is the membership's; the order is found inside it. The save is
// src/lib/orders/edit.ts under the order's lock, the money worked out there again (never taken from the browser): the
// total the panel showed is only compared. A support visit's audit row would name the field "items", never a value.
// =============================================================================

const Id = z.string().uuid()
const SUPPORT = 'A support visit can\'t change an order\'s items.'

/** The panel's facts, read once when "Edit items" opens. */
export async function loadItemsEditor(orderId: string): Promise<{ ok: true; data: EditorData } | { ok: false; error: string }> {
  const auth = await requireMember(ROLES.edit)
  if (!auth.ok) return { ok: false, error: auth.message }
  if (auth.membership.supportSessionId) return { ok: false, error: SUPPORT }
  if (!Id.safeParse(orderId).success) return { ok: false, error: 'Order not found.' }
  try {
    const data = await itemsEditor(auth.membership.tenantId, orderId)
    return data ? { ok: true, data } : { ok: false, error: 'Order not found.' }
  } catch (err) {
    console.error('[order.items_editor]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not load its items. Try again.' }
  }
}

/** "Add an item": the shop's pieces whose title matches. */
export async function findItemsToAdd(orderId: string, q: unknown): Promise<AddResult[]> {
  const auth = await requireMember(ROLES.edit)
  if (!auth.ok || auth.membership.supportSessionId || !Id.safeParse(orderId).success || typeof q !== 'string') return []
  try {
    return await itemsToAdd(auth.membership.tenantId, orderId, q)
  } catch (err) {
    console.error('[order.items_find]', err instanceof Error ? err.name : 'error')
    return []
  }
}

const Edit = z.object({
  want: z.array(z.object({ line: Id.nullable(), variantId: Id.nullable(), qty: z.number().int().min(1).max(10) }).strict()).min(1).max(20),
  reasons: z.record(Id, z.enum(EDIT_REASONS)).refine((r) => Object.keys(r).length <= 20),
  notify: z.boolean(),
  expectedTotal: z.number().int().min(0).max(10_000_000_00),
}).strict()

export type SaveResult = { ok: true; eventId: string; total: number } | { ok: false; error: string; total?: number }

/** Save the edit at the total the panel showed (refused, with the new one, when it moved). */
export async function saveItemsEdit(orderId: string, input: unknown): Promise<SaveResult> {
  const p = Edit.safeParse(input)
  if (!Id.safeParse(orderId).success || !p.success) return { ok: false, error: 'This change could not be read. Reload the order.' }
  try {
    const auth = await requireMember(ROLES.edit)
    if (!auth.ok) return { ok: false, error: auth.message }
    if (auth.membership.supportSessionId) return { ok: false, error: SUPPORT }
    // Razorpay is asked before the transaction (never a call out inside one).
    const open = await paymentStillOpen(auth.membership.tenantId, orderId)
    if (open) return { ok: false, error: open }
    const r = await asMember(ROLES.edit, { action: 'order.items_edit', target: orderId, detail: { fields: ['items'] } }, (tx, a) =>
      editItems(tx, a.membership.tenantId, { kind: a.membership.supportSessionId ? 'support' : 'member', userId: a.userId, email: a.email ?? '' }, orderId, p.data))
    if (!r.ok) return { ok: false, error: r.error }
    const v = r.value
    if (!v.ok) return { ok: false, error: v.error, ...('total' in v ? { total: v.total } : {}) }
    if (v.soldOut.length || v.backInStock.length) await refreshSoldOut(r.tenantId).catch((e: unknown) => console.error('[order.items_edit] purge', e instanceof Error ? e.name : 'error'))
    drainSoon()
    revalidatePath('/console', 'layout')
    return { ok: true, eventId: v.eventId, total: v.total }
  } catch (err) {
    console.error('[order.items_edit]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not save that. Nothing was changed.' }
  }
}

/** Undo an items edit by its event (the toast's Undo, and the Items card's while it can). */
export async function undoItemsEdit(eventId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Id.safeParse(eventId).success) return { ok: false, error: 'There is nothing to undo.' }
  try {
    const r = await asMember(ROLES.edit, { action: 'order.items_undo', target: eventId, detail: {} }, (tx, a) =>
      undoEdit(tx, a.membership.tenantId, { kind: a.membership.supportSessionId ? 'support' : 'member', userId: a.userId, email: a.email ?? '' }, eventId))
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return { ok: false, error: r.value.error }
    if (r.value.soldOut.length || r.value.backInStock.length) await refreshSoldOut(r.tenantId).catch((e: unknown) => console.error('[order.items_undo] purge', e instanceof Error ? e.name : 'error'))
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[order.items_undo]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not undo that. Nothing was changed.' }
  }
}
