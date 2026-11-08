'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { addressAdminError, BLOCKED_KINDS, blockName, releaseName, unblockName } from '@/lib/admin/addresses'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { hostFor } from '@/lib/queries/storefront'
import { refreshHosts } from '@/lib/storefront/refresh'

// Shop addresses D1·7: Admin › Names. Admin role only; each write is audited.

const NAME = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/
const DOMAIN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const Name = z.string().trim().toLowerCase().max(253)
const Block = z.object({ name: Name, kind: z.enum(BLOCKED_KINDS), reason: z.string().trim().min(3).max(500) })
  .refine((b) => (b.kind === 'domain' ? DOMAIN : NAME).test(b.name), { path: ['name'] })
const Release = z.object({ name: Name.refine((n) => NAME.test(n)), reason: z.string().trim().min(3).max(500) })

const go = (q: 'ok' | 'error', msg: string): never => redirect(`/admin/names?${q}=${encodeURIComponent(msg)}`)

async function admin() {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  return staff
}

export async function blockNameAction(form: FormData) {
  const staff = await admin()
  const p = Block.safeParse(Object.fromEntries(form))
  if (!p.success) go('error', p.error.issues.some((i) => i.path[0] === 'reason') ? addressAdminError('reason') : 'Check the name: letters, digits and hyphens, or a domain.')
  const d = p.data!
  const added = await blockName(staff, d).catch(() => null)
  if (added === null) go('error', addressAdminError('unknown'))
  if (!added) go('error', 'Already blocked.')
  revalidatePath('/admin/names')
  go('ok', `${d.name} blocked.`)
}

export async function unblockNameAction(form: FormData) {
  const staff = await admin()
  const name = Name.safeParse(form.get('name'))
  if (!name.success) go('error', addressAdminError('unknown'))
  const removed = await unblockName(staff, name.data!).catch(() => null)
  if (!removed) go('error', addressAdminError('unknown'))
  revalidatePath('/admin/names')
  go('ok', `${name.data} unblocked.`)
}

export async function releaseNameAction(form: FormData) {
  const staff = await admin()
  const p = Release.safeParse(Object.fromEntries(form))
  if (!p.success) go('error', addressAdminError('reason'))
  const d = p.data!
  const r = await releaseName(staff, d.name, d.reason)
  if (!r.ok) go('error', addressAdminError(r.error))
  // The name stops leading to its old shop at once (it is free for anyone).
  refreshHosts(hostFor(d.name))
  revalidatePath('/admin/names')
  go('ok', `${d.name} released.`)
}
