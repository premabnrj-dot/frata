// =============================================================================
// FILE: src/domains/modules/offer.ts — how an app is offered to a merchant: its
// badge, its price line and its ONE action (spec § 5, § 5b; approved mockup v2).
// Pure, so the Apps row and the details dialog can never say different things.
// =============================================================================

import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { ModuleAccess } from './access'
import { MODULES, type ModuleKey } from './registry'

export type Offer = {
  badge: string
  tone: 'ok' | 'info' | 'neutral' | 'warn'
  /** The price as a merchant reads it ("In your plan", "₹499/mo + 18% GST"). */
  price: string
  /**
   * The one action: switch it (on/off), ask Frrata for an add-on, see the plans (Plan and billing), or none (coming next).
   * `switch` carries whether it is on.
   */
  action: { kind: 'switch'; on: boolean } | { kind: 'ask'; label: string } | { kind: 'plans'; label: string } | { kind: 'none' }
}

export function offerFor(key: ModuleKey, a: ModuleAccess, addonPrice: number | null, now: Date): Offer {
  const def = MODULES[key]
  const monthly = addonPrice !== null ? `${formatInr(paise(addonPrice))}/mo` : null
  if (def.status === 'next') {
    return { badge: 'Next', tone: 'info', price: def.billing === 'add_on' && monthly ? `Add-on · ${monthly}` : def.billing === 'core' ? 'In every plan' : 'In Growth and up', action: { kind: 'none' } }
  }
  if (a.paused) return { badge: 'Paused by Frrata', tone: 'warn', price: priceLine(a, monthly, now), action: { kind: 'switch', on: a.on } }
  if (a.granted) return { badge: a.how === 'trial' ? trialBadge(a, now) : a.how === 'add_on' ? 'Add-on' : 'In your plan', tone: a.how === 'trial' ? 'warn' : 'ok', price: priceLine(a, monthly, now), action: { kind: 'switch', on: a.on } }
  if (def.billing === 'add_on' && monthly) return { badge: `Add-on · ${monthly}`, tone: 'neutral', price: `${monthly} + 18% GST`, action: { kind: 'ask', label: `Add ${def.name} · ${monthly}` } }
  return { badge: 'In Growth and up', tone: 'neutral', price: 'In Growth and up', action: { kind: 'plans', label: 'See plans' } }
}

function trialBadge(a: ModuleAccess, now: Date): string {
  const days = a.trialEndsAt ? Math.max(1, Math.ceil((a.trialEndsAt.getTime() - now.getTime()) / 86_400_000)) : 0
  return `Trial · ${days} ${days === 1 ? 'day' : 'days'} left`
}

function priceLine(a: ModuleAccess, monthly: string | null, now: Date): string {
  if (a.how === 'trial') return `${trialBadge(a, now)}${monthly ? `, then ${monthly}` : ''}`
  if (a.how === 'add_on' && monthly) return `${monthly} + 18% GST`
  return 'In your plan'
}
