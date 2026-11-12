// =============================================================================
// FILE: src/domains/modules/access.ts — may this shop use this module now?
//
// The ONE place "usable" is decided (docs/specs/2026-11-07-modules-foundation.md § 2).
// Facts in, answer out: the plan's features, the add-ons (with trial and end
// dates), the merchant's switches, Frata's pauses. Nothing stores "enabled".
// `now` is passed in, never read (check:clock).
// =============================================================================

import { MODULE_KEYS, MODULES, type ModuleKey } from './registry'

export type AddonFact = { id?: string; module: ModuleKey; startsAt: Date; endsAt: Date | null; trialEndsAt: Date | null; byShop?: boolean }
export type ModuleFacts = {
  /** The plan in force ('launch' | 'growth' | 'scale'), or null with none: an add-on's `addOnFor` reads it. */
  planCode: string | null
  planFeatures: readonly string[]
  addons: readonly AddonFact[]
  /** Modules with an open switch row (enabled, not disabled). */
  switchedOn: readonly ModuleKey[]
  paused: readonly ModuleKey[]
}

export type How = 'core' | 'plan' | 'add_on' | 'trial'
export type Why = 'usable' | 'next' | 'not_granted' | 'off' | 'paused' | 'needs'

export type ModuleAccess = {
  key: ModuleKey
  granted: boolean
  how: How | null
  /** When a trial ends (shown as "Trial · N days left"). */
  trialEndsAt: Date | null
  on: boolean
  paused: boolean
  usable: boolean
  why: Why
  /** The dependency that is not usable, when why = 'needs'; for an app that is off, the one to turn on first. */
  needs: ModuleKey | null
  /** Held back by a Frrata pause, its own or a dependency's: its messages wait, nothing is dropped. */
  held: boolean
  /** Ever trialled (by the shop or by Frrata): no self-serve trial again (A3, one per shop and add-on). */
  trialled: boolean
  /** In a trial the shop started itself: when its paid row begins (End trial is the shop's), else null. */
  paidFrom: Date | null
}

/** The add-on row in force for a module: a paid one before a trial. The one rule, read by access and by Admin. */
export function liveAddon<A extends AddonFact>(addons: readonly A[], key: ModuleKey, now: Date): A | null {
  const t = now.getTime()
  const live = addons.filter((a) => a.module === key && a.startsAt.getTime() <= t && (!a.endsAt || a.endsAt.getTime() > t))
  return live.find((a) => !a.trialEndsAt) ?? live.find((a) => a.trialEndsAt && a.trialEndsAt.getTime() > t) ?? null
}

/** May this plan buy (or trial) this add-on? */
export const addOnAllowed = (key: ModuleKey, planCode: string | null): boolean => {
  const def = MODULES[key] as (typeof MODULES)[ModuleKey] | undefined
  if (!def) return false
  const only = def.addOnFor
  return !only || (planCode !== null && (only as readonly string[]).includes(planCode))
}

/**
 * Is an add-on row billed this month? Only while the plan in force at the month's start may buy it AND does not
 * already include it (Growth → Scale: Reviews comes with Scale, so the add-on stops). A downgrade stops the bill as
 * it stops access; the row stays and bills again only if the shop returns to a plan that sells it. The plan at the
 * month's start decides the whole month, as the plan's own bill does (in arrears).
 */
export const addOnBillable = (key: ModuleKey, planCode: string | null, planFeatures: readonly string[]): boolean =>
  addOnAllowed(key, planCode) && !planFeatures.includes(key)

function grant(key: ModuleKey, f: ModuleFacts, now: Date): { how: How; trialEndsAt: Date | null } | null {
  const def = MODULES[key]
  if (def.billing === 'core') return { how: 'core', trialEndsAt: null }
  if (f.planFeatures.includes(key)) return { how: 'plan', trialEndsAt: null }
  if (!addOnAllowed(key, f.planCode)) return null
  const a = liveAddon(f.addons, key, now)
  if (!a) return null
  return a.trialEndsAt ? { how: 'trial', trialEndsAt: a.trialEndsAt } : { how: 'add_on', trialEndsAt: null }
}

export function moduleAccess(f: ModuleFacts, now: Date): Record<ModuleKey, ModuleAccess> {
  const out = {} as Record<ModuleKey, ModuleAccess>
  const base = (key: ModuleKey): ModuleAccess => {
    const def = MODULES[key]
    const g = grant(key, f, now)
    const on = f.switchedOn.includes(key)
    const paused = f.paused.includes(key)
    let why: Why = 'usable'
    if (def.status === 'next') why = 'next'
    else if (!g) why = 'not_granted'
    else if (!on) why = 'off'
    else if (paused) why = 'paused'
    const mine = f.addons.filter((a) => a.module === key)
    const selfTrial = g?.how === 'trial' && mine.some((a) => a.byShop && a.trialEndsAt && a.trialEndsAt.getTime() > now.getTime() && a.startsAt.getTime() <= now.getTime())
    const paid = selfTrial ? mine.find((a) => a.byShop && !a.trialEndsAt && a.startsAt.getTime() > now.getTime() && (!a.endsAt || a.endsAt > a.startsAt)) : undefined
    return { key, granted: !!g, how: g?.how ?? null, trialEndsAt: g?.trialEndsAt ?? null, on, paused, usable: why === 'usable', why, needs: null, held: why === 'paused',
      trialled: mine.some((a) => !!a.trialEndsAt), paidFrom: paid?.startsAt ?? null }
  }
  for (const k of MODULE_KEYS) out[k] = base(k)
  // A dependency that is not usable makes the module not usable (one level is all the registry has; loop for safety).
  for (let pass = 0; pass < MODULE_KEYS.length; pass++) {
    for (const k of MODULE_KEYS) {
      const a = out[k]
      if (!a.usable) continue
      const missing = MODULES[k].dependsOn.find((d) => !out[d].usable)
      if (missing) out[k] = { ...a, usable: false, why: 'needs', needs: missing, held: out[missing].held }
    }
  }
  // Granted and off: the app to turn on first, so Apps offers a link to it instead of a switch that fails (A1 review).
  for (const k of MODULE_KEYS) {
    const a = out[k]
    if (a.why === 'off') out[k] = { ...a, needs: MODULES[k].dependsOn.find((d) => !out[d].usable) ?? null }
  }
  return out
}

/** What the outbox does with a module's queued message (architecture review 2026-11-07). */
export function outboxDecision(a: ModuleAccess): 'send' | 'defer' | 'drop' {
  if (a.usable) return 'send'
  if (a.held) return 'defer' // Frrata's pause (of it or what it needs) holds messages back; nothing is lost
  return 'drop' // the merchant turned it off, or it is no longer granted: cancelled, with the reason
}
