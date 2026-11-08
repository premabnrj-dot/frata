'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { slugProblem } from '@/domains/signup/slug'
import { addressAdminError, adminRenameShop, freezeAddress, merchantAddresses } from '@/lib/admin/addresses'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { hostFor } from '@/lib/queries/storefront'
import { refreshHosts, refreshShop } from '@/lib/storefront/refresh'

// Shop addresses D1·7: Frrata's rename and the freeze, admin role only (the definers check again and audit).

const Reason = z.string().trim().min(3).max(500)
const Rename = z.object({ tenantId: z.uuid(), slug: z.string().trim().toLowerCase().max(64), reason: Reason })
const Freeze = z.object({ tenantId: z.uuid(), frozen: z.enum(['yes', 'no']), reason: Reason })

const back = (id: unknown) => `/admin/merchants/${typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id) ? id : ''}/addresses`
const fail = (id: unknown, msg: string): never => redirect(`${back(id)}?error=${encodeURIComponent(msg)}`)

export async function adminRenameAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const id = form.get('tenantId')
  const p = Rename.safeParse(Object.fromEntries(form))
  if (!p.success) fail(id, p.error.issues.some((i) => i.path[0] === 'reason') ? addressAdminError('reason') : addressAdminError('bad_slug'))
  const d = p.data!
  const problem = slugProblem(d.slug)
  if (problem) fail(id, problem === 'reserved' ? 'That address is reserved.' : addressAdminError('bad_slug'))
  const before = await merchantAddresses(staff, d.tenantId)
  const r = await adminRenameShop(staff, d.tenantId, d.slug, d.reason)
  if (!r.ok) fail(id, addressAdminError(r.error))
  // Every name the shop has had stops pointing at the old one: the old name now serves nothing. Read again after the
  // rename too, so a merchant rename landing in between is refreshed as well (tenancy audit D1·7).
  const after = await merchantAddresses(staff, d.tenantId).catch(() => null)
  const names = [d.slug, ...(before?.names ?? []), ...(after?.names ?? [])].map((n) => (typeof n === 'string' ? n : n.name))
  refreshHosts(...[...new Set(names)].map((n) => hostFor(n)))
  refreshShop(d.tenantId, 'shop')
  if (before) revalidatePath(`/s/${hostFor(before.slug)}`, 'layout')
  revalidatePath(back(id))
  redirect(`${back(id)}?ok=${encodeURIComponent(`Renamed to ${hostFor(d.slug)}.`)}`)
}

export async function freezeAddressAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const id = form.get('tenantId')
  const p = Freeze.safeParse(Object.fromEntries(form))
  if (!p.success) fail(id, addressAdminError('reason'))
  const d = p.data!
  const r = await freezeAddress(staff, d.tenantId, d.frozen === 'yes', d.reason)
  if (!r.ok) fail(id, addressAdminError(r.error))
  revalidatePath(back(id))
  redirect(`${back(id)}?ok=${encodeURIComponent(d.frozen === 'yes' ? 'Address changes frozen.' : 'Address changes allowed.')}`)
}
