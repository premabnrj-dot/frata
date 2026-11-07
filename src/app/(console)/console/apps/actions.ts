'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { asMember } from '@/lib/auth/as-member'
import { CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { tenantModules } from '@/lib/db/schema-modules'
import { cancelQueued } from '@/lib/outbox'
import { shopModules } from '@/lib/queries/modules'
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
        const { access } = await shopModules(tenantId, new Date().toISOString())
        const a = access[module]
        if (def.status !== 'now') return 'next'
        if (!a.granted) return 'not_granted'
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
