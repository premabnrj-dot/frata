// =============================================================================
// FILE: src/domains/addresses/domain-state.ts — A DOMAIN'S STATE, DERIVED (design rules 68, 76; mockup v2 § states).
// Pure and client-safe. One tuple of chips from the row's timestamps; the words are the screen's (Rule 0: a state is a
// chip, a problem one line with its fix). Never stored.
// =============================================================================

export type DomainFacts = {
  provedAt: Date | string | null; addedAt: Date | string | null; dnsOkAt: Date | string | null; certOkAt: Date | string | null
  failingSince: Date | string | null; mainAt: Date | string | null; razorpayOkAt: Date | string | null; contestAt: Date | string | null
  vercelTxt: string | null; removedAt: Date | string | null; removedReason: string | null
}

export type DomainState = 'waiting' | 'held' | 'other_account' | 'securing' | 'connected' | 'main' | 'not_working' | 'moved' | 'disconnected'
export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

export function domainState(d: DomainFacts): DomainState {
  if (d.removedAt) return d.removedReason === 'moved' ? 'moved' : 'disconnected'
  if (!d.provedAt) return d.contestAt ? 'held' : 'waiting'
  if (d.vercelTxt && !d.addedAt) return 'other_account'
  if (d.mainAt) return d.failingSince ? 'not_working' : 'main'
  if (d.certOkAt) return 'connected'
  return 'securing'
}

export const DOMAIN_CHIP: Record<DomainState, { tone: Tone; words: string }> = {
  waiting: { tone: 'warn', words: 'Waiting for records' },
  held: { tone: 'warn', words: 'In use by another shop' },
  other_account: { tone: 'warn', words: 'Waiting for records' },
  securing: { tone: 'info', words: 'Securing' },
  connected: { tone: 'ok', words: 'Connected' },
  main: { tone: 'neutral', words: 'Main' },
  not_working: { tone: 'danger', words: 'Not working' },
  moved: { tone: 'danger', words: 'Moved to another shop' },
  disconnected: { tone: 'danger', words: 'Disconnected by Frrata' },
}

/** Make main is offered on a connected domain; on live payments, only once Razorpay approved it. */
/** The console's red banner (design rule 76): a main domain failing this long is the merchant's to fix. */
export const BANNER_AFTER_MS = 24 * 3_600_000
export const bannerDue = (failingSince: Date | null, now: Date) => !!failingSince && now.getTime() - failingSince.getTime() >= BANNER_AFTER_MS

export const canMakeMain = (d: DomainFacts, livePayments: boolean) => domainState(d) === 'connected' && (!livePayments || !!d.razorpayOkAt)
