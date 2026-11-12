'use server'

import { z } from 'zod'
import { THEME_KEYS } from '@/lib/db/schema-themes'
import { pullVersion, releaseVersion, stageVersion, unstageVersion } from '@/lib/admin/themes'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { refreshThemeVersions } from '@/lib/queries/storefront'
import type { ActionResult } from '@/components/ui/action-form'

// Admin › Themes (themes T3). Admin role only; every write audited in the library. A withdraw re-reads which
// versions every shop may render (one tag, whatever the number of shops).
const V = z.object({ key: z.enum(THEME_KEYS), version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/) })
// A refusal or a form that doesn't parse says so on the page, in a toast (UX audit 2026-11-11; § Feedback 1).
const NOT_ADMIN = 'Only an admin can change theme versions.'
const BAD_FORM = 'That form was incomplete. Nothing was changed.'
const refusal = (reason: string) => (reason === 'signed_out' ? 'Sign in again.' : reason === 'needs_passkey' ? 'Confirm it\'s you with your passkey first.' : NOT_ADMIN)

export async function stageAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: refusal(staff.reason) }
  const p = V.extend({ tenantId: z.uuid() }).safeParse(Object.fromEntries(form))
  if (!p.success) return { error: BAD_FORM }
  const r = await stageVersion(staff, p.data.key, p.data.version, p.data.tenantId)
  return r === 'staged' ? { ok: 'Staged: that shop can try this version now.' } : { error: r === 'pulled' ? 'This version was recalled; it can’t be staged.' : 'This version is not in the deployed code.' }
}

export async function unstageAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: refusal(staff.reason) }
  const p = V.extend({ tenantId: z.uuid() }).safeParse(Object.fromEntries(form))
  if (!p.success) return { error: BAD_FORM }
  const ok = await unstageVersion(staff, p.data.key, p.data.version, p.data.tenantId)
  return ok ? { ok: 'Unstaged. A look already published on it stays.' } : { error: 'That shop was not staged.' }
}

export async function releaseAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: refusal(staff.reason) }
  const p = V.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: BAD_FORM }
  const r = await releaseVersion(staff, p.data.key, p.data.version)
  return r.ok ? { ok: 'Released: every shop can try it, and shops on an older version see that it’s ready.' } : { error: r.error }
}

export async function pullAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: refusal(staff.reason) }
  const p = V.extend({ how: z.enum(['recall', 'withdraw']), reason: z.string().trim().min(3).max(300) }).safeParse(Object.fromEntries(form))
  if (!p.success) return V.safeParse(Object.fromEntries(form)).success ? { fields: { reason: 'Give a reason of at least 3 characters. Nothing was changed.' } } : { error: BAD_FORM }
  const r = await pullVersion(staff, p.data.key, p.data.version, p.data.how, p.data.reason)
  if (r.ok && p.data.how === 'withdraw') refreshThemeVersions()
  return r.ok ? { ok: p.data.how === 'recall' ? 'Recalled. No new looks on it; shops live on it are offered their previous look.' : 'Withdrawn. Shops on it show their previous look now.' } : { error: r.error }
}
