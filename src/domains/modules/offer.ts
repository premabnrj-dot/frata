// =============================================================================
// FILE: src/domains/modules/offer.ts — how an app is offered to a merchant: its
// card's price line and state chip, which filter it falls under, the price box,
// and its ONE action (Apps gallery, approved mockup 2026-11-11; spec § 5, § 5b).
// Pure, so the card, the filters and the app's page can never say different things.
// =============================================================================

import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { ModuleAccess } from './access'
import { MODULES, type ModuleKey } from './registry'

/** The gallery's filters (All is every app). */
export type OfferFilter = 'included' | 'addon' | 'plan' | 'next'
export const FILTERS: readonly [OfferFilter | 'all', string][] = [['all', 'All'], ['included', 'In your plan'], ['addon', 'Add-ons'], ['plan', 'On a higher plan'], ['next', 'Coming next']]

export type OfferAction =
  /** Built and granted: on or off. */
  | { kind: 'switch'; on: boolean }
  /** Granted and off, but another app must be on first: a link to that app, never a switch that fails. */
  | { kind: 'needs'; module: ModuleKey; name: string }
  /** An add-on this plan may buy: today a WhatsApp ask to Frrata (self-serve trials are A3). */
  | { kind: 'ask'; label: string }
  /** On a higher plan: Plan and billing. */
  | { kind: 'plans'; label: string }
  /** Coming next: tell me when it's ready (asked or not). */
  | { kind: 'interest'; asked: boolean }

export type Offer = {
  /** The price as a merchant reads it in the price box ("In your plan", "₹499/mo + 18% GST"). */
  price: string
  /** The card's footer: "Included", "₹499/mo", "On Growth". */
  footer: string
  /** Whether the footer is a lock (a higher plan). */
  locked: boolean
  /** The card's state chip, or none. */
  state: { label: string; tone: 'ok' | 'warn' | 'neutral' | 'info' } | null
  filter: OfferFilter
  action: OfferAction
}

/**
 * `canAdd`: whether this shop's plan may buy it as an add-on (addOnAllowed); false offers the plans instead.
 * `asked`: whether this member asked to be told when a coming-next app is ready. An app that is off and needs another
 * links to it (access.needs); one that is on while what it needs is off says it is waiting.
 */
export function offerFor(key: ModuleKey, a: ModuleAccess, addonPrice: number | null, now: Date, canAdd = true, asked = false): Offer {
  const def = MODULES[key]
  const monthly = addonPrice !== null ? `${formatInr(paise(addonPrice))}/mo` : null
  if (def.status === 'next') {
    const footer = def.billing === 'add_on' && monthly ? monthly : def.billing === 'core' ? 'Included' : 'On Growth'
    return {
      price: def.billing === 'add_on' && monthly ? `Add-on · ${monthly}` : def.billing === 'core' ? 'In every plan' : 'In Growth and up',
      footer, locked: false, state: { label: 'Coming next', tone: 'neutral' }, filter: 'next', action: { kind: 'interest', asked },
    }
  }
  if (a.paused) {
    return { price: priceLine(a, monthly, now), footer: footerOf(a, monthly, now), locked: false,
      state: { label: 'Paused by Frrata', tone: 'warn' }, filter: filterOf(a), action: { kind: 'switch', on: a.on } }
  }
  if (a.granted) {
    const state = a.why === 'needs' && a.needs ? { label: `Waiting for ${MODULES[a.needs].name}`, tone: 'warn' as const }
      : a.usable ? homeState() : a.how === 'trial' ? { label: trialBadge(a, now), tone: 'warn' as const } : null
    const action: OfferAction = !a.on && a.needs ? { kind: 'needs', module: a.needs, name: MODULES[a.needs].name } : { kind: 'switch', on: a.on }
    return { price: priceLine(a, monthly, now), footer: footerOf(a, monthly, now), locked: false, state, filter: filterOf(a), action }
  }
  if (def.billing === 'add_on' && monthly && canAdd) {
    return { price: `${monthly} + 18% GST`, footer: monthly, locked: false, state: null, filter: 'addon',
      action: { kind: 'ask', label: `Ask Frrata to add ${def.name}` } }
  }
  return { price: 'In Growth and up', footer: 'On Growth', locked: true, state: null, filter: 'plan',
    action: { kind: 'plans', label: 'See Growth' } }
}

/** The state of an app that is in use, read by Your apps and by the app's home alike (A2): one chip, one source. An
 *  app's own condition (EkCode not live, Messages needing attention) is a second badge on its home only. */
export const homeState = (): { label: string; tone: 'ok' } => ({ label: 'Working', tone: 'ok' })

/** Does this offer pass the gallery's filter? */
export const passes = (o: Pick<Offer, 'filter'>, f: OfferFilter | 'all') => f === 'all' || o.filter === f

function filterOf(a: ModuleAccess): OfferFilter {
  return a.how === 'add_on' || a.how === 'trial' ? 'addon' : 'included'
}

function footerOf(a: ModuleAccess, monthly: string | null, now: Date): string {
  if (a.how === 'trial') return trialBadge(a, now)
  if (a.how === 'add_on' && monthly) return monthly
  return 'Included'
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
