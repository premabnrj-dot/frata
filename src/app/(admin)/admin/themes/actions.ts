'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { THEME_KEYS } from '@/lib/db/schema-themes'
import { pullVersion, releaseVersion, stageVersion, unstageVersion } from '@/lib/admin/themes'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { refreshThemeVersions } from '@/lib/queries/storefront'

// Admin › Themes (themes T3). Admin role only; every write audited in the library. A withdraw re-reads which
// versions every shop may render (one tag, whatever the number of shops).
const V = z.object({ key: z.enum(THEME_KEYS), version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/) })
const page = (k: string, v: string, kind: 'ok' | 'error', m: string) => `/admin/themes/${k}/${v}?${kind}=${encodeURIComponent(m)}`

// A refusal or a form that doesn't parse says so on the page, never a silent bounce to the list (UX audit 2026-11-11).
const list = (m: string) => `/admin/themes?error=${encodeURIComponent(m)}`
const NOT_ADMIN = 'Only an admin can change theme versions.'
const BAD_FORM = 'That form was incomplete. Nothing was changed.'

async function admin() { const s = await requireStaff(ADMIN_ONLY); if (!s.ok) redirect(list(NOT_ADMIN)); return s }

export async function stageAction(form: FormData) {
  const staff = await admin()
  const p = V.extend({ tenantId: z.uuid() }).safeParse(Object.fromEntries(form))
  if (!p.success) redirect(list(BAD_FORM))
  const r = await stageVersion(staff, p.data.key, p.data.version, p.data.tenantId)
  redirect(page(p.data.key, p.data.version, r === 'staged' ? 'ok' : 'error', r === 'staged' ? 'Staged: that shop can try this version now.' : r === 'pulled' ? 'This version was recalled; it can’t be staged.' : 'This version is not in the deployed code.'))
}

export async function unstageAction(form: FormData) {
  const staff = await admin()
  const p = V.extend({ tenantId: z.uuid() }).safeParse(Object.fromEntries(form))
  if (!p.success) redirect(list(BAD_FORM))
  const ok = await unstageVersion(staff, p.data.key, p.data.version, p.data.tenantId)
  redirect(page(p.data.key, p.data.version, ok ? 'ok' : 'error', ok ? 'Unstaged. A look already published on it stays.' : 'That shop was not staged.'))
}

export async function releaseAction(form: FormData) {
  const staff = await admin()
  const p = V.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(list(BAD_FORM))
  const r = await releaseVersion(staff, p.data.key, p.data.version)
  redirect(page(p.data.key, p.data.version, r.ok ? 'ok' : 'error', r.ok ? 'Released: every shop can try it, and shops on an older version see that it’s ready.' : r.error))
}

export async function pullAction(form: FormData) {
  const staff = await admin()
  const p = V.extend({ how: z.enum(['recall', 'withdraw']), reason: z.string().trim().min(3).max(300) }).safeParse(Object.fromEntries(form))
  if (!p.success) {
    const v = V.safeParse(Object.fromEntries(form))
    redirect(v.success ? page(v.data.key, v.data.version, 'error', 'Give a reason of at least 3 characters. Nothing was changed.') : list(BAD_FORM))
  }
  const r = await pullVersion(staff, p.data.key, p.data.version, p.data.how, p.data.reason)
  if (r.ok && p.data.how === 'withdraw') refreshThemeVersions()
  redirect(page(p.data.key, p.data.version, r.ok ? 'ok' : 'error', r.ok ? (p.data.how === 'recall' ? 'Recalled. No new looks on it; shops live on it are offered their previous look.' : 'Withdrawn. Shops on it show their previous look now.') : r.error))
}
