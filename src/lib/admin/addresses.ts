import 'server-only'
import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { tenants } from '@/lib/db/schema'
import { blockedNames, shopNames } from '@/lib/db/schema-addresses'
import type { StaffOk } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/admin/addresses.ts — ADMIN'S SIDE OF SHOP ADDRESSES (D1·7; plan docs/plans/2026-11-08-shop-addresses.md).
// Reads: a shop's names, every held (retired) name, the blocked list.
// Writes: rename, freeze, release, block and unblock ONLY through the definers in drizzle/0069 (role 'admin', reason, own audit row);
// so are blocking and unblocking a name. Callers refresh the host caches.
// =============================================================================

import { BLOCKED_KINDS, type BlockedKind } from '@/domains/addresses/names'
export { BLOCKED_KINDS, type BlockedKind }

export type NameView = { name: string; createdAt: Date; retiredAt: Date | null; retiredByFrrata: boolean }
export type MerchantAddresses = { slug: string; frozenAt: Date | null; firstOpenedAt: Date | null; renamesUsed: number; names: NameView[] }

/** The shop's names: the current one first, then old ones, newest first. */
export async function merchantAddresses(staff: StaffOk, tenantId: string): Promise<MerchantAddresses | null> {
  void staff
  const db = adminDb()
  const [[t], names] = await Promise.all([
    db.select({ slug: tenants.slug, frozenAt: tenants.addressFrozenAt, firstOpenedAt: tenants.firstOpenedAt, renamesUsed: tenants.renamesUsed }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    db.select({ name: shopNames.name, createdAt: shopNames.createdAt, retiredAt: shopNames.retiredAt, retiredByFrrata: shopNames.retiredByFrrata })
      .from(shopNames).where(eq(shopNames.tenantId, tenantId))
      .orderBy(sql`${shopNames.retiredAt} is not null`, desc(shopNames.retiredAt)),
  ])
  return t ? { ...t, names } : null
}

export const HELD_LIMIT = 500

export type HeldName = { name: string; tenantId: string; shop: string; retiredAt: Date; retiredByFrrata: boolean }

/** Every retired name: no shop may take one until Admin releases it. */
export async function heldNames(staff: StaffOk): Promise<HeldName[]> {
  void staff
  const rows = await adminDb()
    .select({ name: shopNames.name, tenantId: shopNames.tenantId, shop: tenants.name, retiredAt: shopNames.retiredAt, retiredByFrrata: shopNames.retiredByFrrata })
    .from(shopNames).innerJoin(tenants, eq(tenants.id, shopNames.tenantId))
    .where(isNotNull(shopNames.retiredAt)).orderBy(asc(shopNames.name)).limit(HELD_LIMIT)
  return rows.map((r) => ({ ...r, retiredAt: r.retiredAt! }))
}

export type BlockedRow = { name: string; kind: BlockedKind; reason: string; createdAt: Date }

export async function listBlocked(staff: StaffOk): Promise<BlockedRow[]> {
  void staff
  const rows = await adminDb().select({ name: blockedNames.name, kind: blockedNames.kind, reason: blockedNames.reason, createdAt: blockedNames.createdAt })
    .from(blockedNames).orderBy(asc(blockedNames.kind), asc(blockedNames.name)).limit(1000)
  return rows
}

const CODES = ['reason', 'bad_slug', 'not_staff', 'no_shop', 'slug_taken', 'not_retired'] as const
export type AddressAdminError = (typeof CODES)[number] | 'unknown'

async function definer<T>(where: string, run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: AddressAdminError }> {
  try {
    return { ok: true, value: await run() }
  } catch (err) {
    const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
    const code = CODES.find((c) => msg.includes(c))
    if (!code) console.error(`[${where}]`, errName(err))
    return { ok: false, error: code ?? 'unknown' }
  }
}

/** Frrata's rename: the old name is retired without a redirect. */
export function adminRenameShop(staff: StaffOk, tenantId: string, slug: string, reason: string) {
  return definer('adminRenameShop', async () => {
    await adminDb().execute(sql`select app_admin_rename_shop(${tenantId}::uuid, ${staff.userId}::uuid, ${slug}, ${reason})`)
  })
}

export function freezeAddress(staff: StaffOk, tenantId: string, frozen: boolean, reason: string) {
  return definer('freezeAddress', async () => {
    await adminDb().execute(sql`select app_admin_freeze_address(${tenantId}::uuid, ${staff.userId}::uuid, ${frozen}, ${reason})`)
  })
}

/** Adds a blocked name; false when it is already on the list. */
export function blockName(staff: StaffOk, b: { name: string; kind: BlockedKind; reason: string }) {
  return definer('blockName', async () => {
    const rows = await adminDb().execute<{ r: boolean }>(sql`select app_admin_block_name(${staff.userId}::uuid, ${b.name}, ${b.kind}, ${b.reason}) as r`)
    return rows[0]!.r
  })
}

/** Removes a blocked name; false when it was not on the list. */
export function unblockName(staff: StaffOk, name: string, reason: string) {
  return definer('unblockName', async () => {
    const rows = await adminDb().execute<{ r: boolean }>(sql`select app_admin_unblock_name(${staff.userId}::uuid, ${name}, ${reason}) as r`)
    return rows[0]!.r
  })
}

/** Frees a retired name for any shop; returns the shop that held it. */
export function releaseName(staff: StaffOk, name: string, reason: string) {
  return definer('releaseName', async () => {
    const rows = await adminDb().execute<{ t: string }>(sql`select app_admin_release_name(${staff.userId}::uuid, ${name}, ${reason}) as t`)
    return rows[0]!.t
  })
}
const WORDS: Record<AddressAdminError, string> = {
  reason: 'Add a reason, 3 to 500 characters.',
  bad_slug: 'Use 3–30 letters, digits and single hyphens.',
  not_staff: 'Only Frrata admins can do this.',
  no_shop: 'That shop no longer exists.',
  slug_taken: 'That address is taken.',
  not_retired: 'Only an old name can be released.',
  unknown: 'We could not save this. Nothing was changed.',
}

/** Admin's words for an address definer's refusal. */
export const addressAdminError = (e: AddressAdminError) => WORDS[e]
