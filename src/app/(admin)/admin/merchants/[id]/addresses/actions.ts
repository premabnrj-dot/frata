'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { slugProblem } from '@/domains/signup/slug'
import { addressAdminError, adminRenameShop, disconnectDomain, freezeAddress, merchantAddresses, merchantDomains } from '@/lib/admin/addresses'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { hostFor } from '@/lib/queries/storefront'
import { refreshHosts, refreshShop } from '@/lib/storefront/refresh'
import type { ActionResult } from '@/components/ui/action-form'

// Shop addresses D1·7: Frrata's rename and the freeze, admin role only (the definers check again and audit).

const Reason = z.string().trim().min(3).max(500)
const Rename = z.object({ tenantId: z.uuid(), slug: z.string().trim().toLowerCase().max(64), reason: Reason })
const Freeze = z.object({ tenantId: z.uuid(), frozen: z.enum(['yes', 'no']), reason: Reason })

const back = (id: unknown) => (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id) ? `/admin/merchants/${id}/addresses` : '/admin/merchants')

export async function adminRenameAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const id = form.get('tenantId')
  const p = Rename.safeParse(Object.fromEntries(form))
  if (!p.success) return p.error.issues.some((i) => i.path[0] === 'reason') ? { fields: { reason: addressAdminError('reason') } } : { fields: { slug: addressAdminError('bad_slug') } }
  const d = p.data
  const problem = slugProblem(d.slug)
  if (problem) return { fields: { slug: problem === 'reserved' ? 'That address is reserved.' : addressAdminError('bad_slug') } }
  const before = await merchantAddresses(staff, d.tenantId)
  const r = await adminRenameShop(staff, d.tenantId, d.slug, d.reason)
  if (!r.ok) return { error: addressAdminError(r.error) }
  // Every name the shop has had stops pointing at the old one: the old name now serves nothing. Read again after the
  // rename too, so a merchant rename landing in between is refreshed as well (tenancy audit D1·7).
  const after = await merchantAddresses(staff, d.tenantId).catch(() => null)
  const names = [d.slug, ...(before?.names ?? []), ...(after?.names ?? [])].map((n) => (typeof n === 'string' ? n : n.name))
  refreshHosts(...[...new Set(names)].map((n) => hostFor(n)))
  refreshShop(d.tenantId, 'shop')
  if (before) revalidatePath(`/s/${hostFor(before.slug)}`, 'layout')
  revalidatePath(back(id))
  return { ok: `Renamed to ${hostFor(d.slug)}.` }
}

export async function freezeAddressAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const id = form.get('tenantId')
  const p = Freeze.safeParse(Object.fromEntries(form))
  if (!p.success) return { fields: { reason: addressAdminError('reason') } }
  const d = p.data
  const r = await freezeAddress(staff, d.tenantId, d.frozen === 'yes', d.reason)
  if (!r.ok) return { error: addressAdminError(r.error) }
  revalidatePath(back(id))
  return { ok: d.frozen === 'yes' ? 'Address changes frozen.' : 'Address changes allowed.' }
}

// D2·11: Frrata disconnects a shop's domain (the shop sees "Disconnected by Frrata"; a host on Vercel parks).
const Disconnect = z.object({ tenantId: z.uuid(), id: z.uuid(), reason: Reason })
export async function disconnectDomainAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const tid = form.get('tenantId')
  const p = Disconnect.safeParse(Object.fromEntries(form))
  if (!p.success) return { fields: { reason: addressAdminError('reason') } }
  const d = p.data
  const r = await disconnectDomain(staff, d.id, d.reason)
  if (!r.ok) return { error: addressAdminError(r.error) }
  // The shop is the one the definer names (never the form's), and the host is read back from that shop's rows.
  const shop = r.value
  const row = (await merchantDomains(staff, shop)).find((x) => x.id === d.id)
  if (row) refreshHosts(row.host, ...(row.withWww ? [`www.${row.host}`] : []))
  refreshShop(shop, 'shop')
  revalidatePath(back(tid))
  return { ok: `${row?.host ?? 'The domain'} disconnected.` }
}
