'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { managesInPerson } from '@/domains/tenancy/roles'
import { asMember } from '@/lib/auth/as-member'
import { ANY_MEMBER, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { appInterest, tenantModules } from '@/lib/db/schema-modules'
import { cancelQueued } from '@/lib/outbox'
import { moduleAccessIn, readFactsIn } from '@/lib/queries/modules'
import { addOnAllowed } from '@/domains/modules/access'
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
  // A Frrata support visit never turns a shop's app off (Apps A2, security review: it can cancel work queued for
  // shoppers); Admin › Modules pauses instead. Refused before any write, so no audit row says it happened.
  if (!on) {
    const me = await requireMember(CAN_MANAGE)
    if (me.ok && !managesInPerson(me.membership)) return { ok: false, error: me.membership.supportSessionId ? 'A Frrata support visit cannot turn an app off.' : 'Ask the shop’s owner to change this.' }
  }
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
        // An add-on stops being paid for when it is turned off (A3 security review H1: no subscription trap): in the
        // shop's own trial, both rows close now; paid, it works to the month's end (billed in advance) and no further.
        const a = (await moduleAccessIn(tx, tenantId, new Date()))[module]
        if (a.paidFrom) await tx.execute(sql`select app_end_addon_trial(${auth.userId}::uuid, ${module})`)
        else if (a.how === 'add_on') await tx.execute(sql`select app_stop_addon(${auth.userId}::uuid, ${module})`)
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

// ── A3: self-serve add-on trials (docs/plans/2026-11-12-true-profit-a3.md). The owner or an admin, in person (never a
// support visit: it agrees to a price). The definers write the rows (the shop from the session, the price checked
// against the one shown); here the plan's right to buy it, and the app turned on in the same transaction. ──

/** The confirm's wording the owner agreed to (app-action.tsx, "Try … free for 14 days?"); bump when it changes. */
const TRIAL_CONFIRM_VERSION = 1

const TRIAL_ERRORS: Record<string, string> = {
  trialled: 'This shop has tried it before. Ask Frrata to add it.',
  has_it: 'Your shop has it already.',
  price_changed: 'The price changed. Reload the page to see it.',
  not_owner: 'Only the shop’s owner or an admin can start a trial.',
}

export async function startAddonTrialAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z.object({ module: z.enum(MODULE_KEYS), priceId: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown app.' }
  const { module, priceId } = p.data
  const def = MODULES[module]
  const me = await requireMember(CAN_MANAGE)
  if (me.ok && !managesInPerson(me.membership)) return { ok: false, error: me.membership.supportSessionId ? 'A Frrata support visit cannot start a trial.' : 'Ask the shop’s owner to change this.' }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'addon.trial.start', target: module }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const now = new Date()
      const facts = await readFactsIn(tx, tenantId, now)
      if (def.billing !== 'add_on' || def.status !== 'now' || !addOnAllowed(module, facts.planCode)) return 'not_offered'
      const [price] = await tx.execute<{ monthly: string }>(sql`select monthly_price as monthly from addon_prices where id = ${priceId}`)
      const [row] = await tx.execute<{ ends: Date }>(sql`select app_start_addon_trial(${auth.userId}::uuid, ${module}, ${priceId}::uuid) as ends`)
      await tx.insert(tenantModules).values({ tenantId, module, enabledBy: auth.userId }).onConflictDoNothing()
      await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'addon.trial.start', target: module,
        detail: { priceId, monthly: price ? Number(price.monthly) : null, firstCharge: new Date(row!.ends).toISOString(), confirm: TRIAL_CONFIRM_VERSION } })
      return 'done'
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'not_offered') return { ok: false, error: `${def.name} isn’t offered on your plan.` }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    const code = definerError(err)
    if (code && TRIAL_ERRORS[code]) return { ok: false, error: TRIAL_ERRORS[code] }
    console.error('[startAddonTrialAction]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: `We could not start the trial. Nothing was changed.` }
  }
}

/** End trial: both rows close now, the app turns off and its queued messages are cancelled; nothing is ever charged. */
export async function endAddonTrialAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z.object({ module: z.enum(MODULE_KEYS) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown app.' }
  const { module } = p.data
  const def = MODULES[module]
  const me = await requireMember(CAN_MANAGE)
  if (me.ok && !managesInPerson(me.membership)) return { ok: false, error: me.membership.supportSessionId ? 'A Frrata support visit cannot end a trial.' : 'Ask the shop’s owner to change this.' }
  try {
    const r = await asMember(CAN_MANAGE, { action: 'addon.trial.end', target: module }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      const [row] = await tx.execute<{ ended: boolean }>(sql`select app_end_addon_trial(${auth.userId}::uuid, ${module}) as ended`)
      if (!row?.ended) return 'none'
      const closed = await tx.update(tenantModules).set({ disabledAt: new Date(), disabledBy: auth.userId })
        .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.module, module), isNull(tenantModules.disabledAt))).returning({ id: tenantModules.id })
      if (closed.length) await cancelQueued(tx, tenantId, def.outboxKinds, `${def.name} trial ended`)
      await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'addon.trial.end', target: module })
      return 'done'
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value === 'none') return { ok: false, error: 'There is no trial to end.' }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console', 'layout')
    return { ok: true }
  } catch (err) {
    const code = definerError(err)
    if (code && TRIAL_ERRORS[code]) return { ok: false, error: TRIAL_ERRORS[code] }
    console.error('[endAddonTrialAction]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not end the trial. Nothing was changed.' }
  }
}

/** A definer's refusal (`raise exception '<code>' using errcode = 'P0001'`), or null. */
function definerError(err: unknown): string | null {
  const e = (err as { cause?: { code?: string; message?: string }; code?: string; message?: string }) ?? {}
  const c = e.cause ?? e
  return c.code === 'P0001' && typeof c.message === 'string' ? c.message : null
}
