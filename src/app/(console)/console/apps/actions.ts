'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { asMember } from '@/lib/auth/as-member'
import { ANY_MEMBER, CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { appInterest, tenantModules } from '@/lib/db/schema-modules'
import { cancelQueued } from '@/lib/outbox'
import { moduleAccessIn } from '@/lib/queries/modules'
import { refreshShop } from '@/lib/queries/storefront'

// Console › Apps (docs/specs/2026-11-07-modules-foundation.md § 5). Owners and admins switch a module on or off.
// On: only a module that is built and granted, and whose dependencies are usable. Off: the open switch row is
// closed and the module's queued messages are cancelled IN THE SAME TRANSACTION (architecture review).

const Input = z.object({ module: z.enum(MODULE_KEYS), on: z.boolean() })

export async function setModuleAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = Input.safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown app.' }
  const { module, on } = p.data
  const def = MODULES[module]
  try {
    const r = await asMember(CAN_MANAGE, { action: on ? 'module.on' : 'module.off', target: module }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      if (on) {
        const access = await moduleAccessIn(tx, tenantId, new Date())
        const a = access[module]
        if (a.why === 'next') return 'next'
        if (a.why === 'not_granted') return 'not_granted'
        const missing = def.dependsOn.find((d) => !access[d].usable)
        if (missing) return `needs:${missing}`
        if (a.on) return 'done'
        await tx.insert(tenantModules).values({ tenantId, module, enabledBy: auth.userId }).onConflictDoNothing()
      } else {
        const closed = await tx.update(tenantModules).set({ disabledAt: new Date(), disabledBy: auth.userId })
          .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.module, module), isNull(tenantModules.disabledAt)))
          .returning({ id: tenantModules.id })
        if (!closed.length) return 'done'
        await cancelQueued(tx, tenantId, def.outboxKinds, `${def.name} was turned off`)
      }
      if (!auth.membership.supportSessionId) {
        await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: on ? 'module.on' : 'module.off', target: module })
      }
      return 'done'
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'next') return { ok: false, error: `${def.name} is coming soon.` }
    if (r.value === 'not_granted') return { ok: false, error: `${def.name} isn't in your plan.` }
    if (r.value.startsWith('needs:')) return { ok: false, error: `Turn on ${MODULES[r.value.slice(6) as keyof typeof MODULES].name} first.` }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[setModuleAction]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: `We could not ${on ? 'turn on' : 'turn off'} ${def.name}. Nothing was changed.` }
  }
}

const Interest = z.object({ module: z.enum(MODULE_KEYS), on: z.boolean() })

/** "Tell me when it's ready" on a coming-next app (Apps gallery A1; tenancy review): any member, for themselves only;
 *  never during a support visit (a Frrata staff id would be counted). Frrata Admin sees which shops asked, and sends a
 *  Notice when the app ships. */
export async function setInterestAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = Interest.safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown app.' }
  const { module, on } = p.data
  if (MODULES[module].status !== 'next') return { ok: false, error: `${MODULES[module].name} is already here.` }
  try {
    const r = await asMember(ANY_MEMBER, { action: on ? 'module.interest' : 'module.interest_off', target: module }, async (tx, auth) => {
      if (auth.membership.supportSessionId) return 'support'
      const tenantId = auth.membership.tenantId
      if (on) await tx.insert(appInterest).values({ tenantId, module, userId: auth.userId }).onConflictDoNothing()
      else await tx.delete(appInterest).where(and(eq(appInterest.tenantId, tenantId), eq(appInterest.module, module), eq(appInterest.userId, auth.userId)))
      return 'done'
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'support') return { ok: false, error: 'A support visit can’t ask for an app.' }
    revalidatePath('/console/apps', 'layout')
    return { ok: true }
  } catch (err) {
    console.error('[setInterestAction]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not save that. Try again.' }
  }
}
