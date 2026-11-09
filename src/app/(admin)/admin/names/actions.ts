'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SLUG_SHAPE } from '@/domains/signup/slug'
import { addressAdminError, BLOCKED_KINDS, blockName, releaseName, unblockName } from '@/lib/admin/addresses'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { hostFor } from '@/lib/queries/storefront'
import { refreshHosts } from '@/lib/storefront/refresh'

// Shop addresses D1·7: Admin › Names. Admin role only (the definers in 0069 check again, need a reason and audit).

const shopName = (n: string) => SLUG_SHAPE.test(n) && !n.includes('--')
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const Name = z.string().trim().toLowerCase().max(253)
const Reason = z.string().trim().min(3).max(500)
const Block = z.object({ name: Name, kind: z.enum(BLOCKED_KINDS), reason: Reason })
  .refine((b) => (b.kind === 'domain' ? DOMAIN.test(b.name) : shopName(b.name)), { path: ['name'] })
const Unblock = z.object({ name: Name, reason: Reason })
const Release = z.object({ name: Name.refine(shopName), reason: Reason })

const go = (q: 'ok' | 'error', msg: string): never => redirect(`/admin/names?${q}=${encodeURIComponent(msg)}`)
const reasonOr = (e: z.ZodError, other: string) => (e.issues.some((i) => i.path[0] === 'reason') ? addressAdminError('reason') : other)

async function admin() {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  return staff
}

export async function blockNameAction(form: FormData) {
  const staff = await admin()
  const p = Block.safeParse(Object.fromEntries(form))
  if (!p.success) go('error', reasonOr(p.error, 'Use letters, digits and single hyphens, or a domain.'))
  const d = p.data!
  const r = await blockName(staff, d)
  if (!r.ok) go('error', addressAdminError(r.error))
  if (r.ok && !r.value) go('error', 'Already blocked.')
  revalidatePath('/admin/names')
  go('ok', `${d.name} blocked.`)
}

export async function unblockNameAction(form: FormData) {
  const staff = await admin()
  const p = Unblock.safeParse(Object.fromEntries(form))
  if (!p.success) go('error', reasonOr(p.error, addressAdminError('unknown')))
  const d = p.data!
  const r = await unblockName(staff, d.name, d.reason)
  if (!r.ok) go('error', addressAdminError(r.error))
  if (r.ok && !r.value) go('error', 'Not on the list.')
  revalidatePath('/admin/names')
  go('ok', `${d.name} unblocked.`)
}

export async function releaseNameAction(form: FormData) {
  const staff = await admin()
  const p = Release.safeParse(Object.fromEntries(form))
  if (!p.success) go('error', reasonOr(p.error, addressAdminError('bad_slug')))
  const d = p.data!
  const r = await releaseName(staff, d.name, d.reason)
  if (!r.ok) go('error', addressAdminError(r.error))
  // The name stops leading to its old shop at once (it is free for anyone).
  refreshHosts(hostFor(d.name))
  revalidatePath('/admin/names')
  go('ok', `${d.name} released.`)
}
