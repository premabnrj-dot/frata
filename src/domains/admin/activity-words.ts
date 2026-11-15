// =============================================================================
// FILE: src/domains/admin/activity-words.ts — ADMIN › ACTIVITY IN WORDS (Neel N4; architecture review on the plan).
// An audit row's action ("module.trial") is code; a person reads "gave an app trial". One map, the kinds Activity
// filters by (each a set of the action's first words, which the kind index reads), and a plain fallback for the rest.
// =============================================================================

export const ACTIVITY_KINDS = {
  plan: { label: 'Plans', words: ['plan'] },
  trial: { label: 'Trials', words: ['trial'] },
  address: { label: 'Addresses', words: ['address', 'name', 'domain'] },
  partner: { label: 'Partners', words: ['partner'] },
  billing: { label: 'Billing', words: ['billing'] },
  app: { label: 'Apps', words: ['module', 'addon'] },
  theme: { label: 'Themes', words: ['theme', 'look'] },
  support: { label: 'Support visits', words: ['support'] },
  staff: { label: 'Staff', words: ['staff'] },
  order: { label: 'Orders', words: ['order', 'orders'] },
  offer: { label: 'Offers', words: ['offer'] },
} as const satisfies Record<string, { label: string; words: readonly string[] }>
export type ActivityKind = keyof typeof ACTIVITY_KINDS
export const ACTIVITY_KIND_KEYS = Object.keys(ACTIVITY_KINDS) as ActivityKind[]

/** Rows only a master admin reads (money; the security review on the plan, M3). */
export const MASTER_ONLY_WORDS: readonly string[] = ['billing']

const SAID: Record<string, string> = {
  'plan.change': 'changed the plan',
  'plan.version.create': 'saved a new plan version',
  'trial.set': 'set the trial',
  'trial.extend': 'extended the trial',
  'trial.end': 'ended the trial',
  'module.trial': 'gave an app trial',
  'module.end': 'ended an app',
  'module.pause': 'paused an app for every store',
  'module.resume': 'resumed an app',
  'addon.trial.start': 'started a paid app trial',
  'addon.trial.end': 'ended a paid app trial',
  'billing.issue': 'issued invoices',
  'billing.payment': 'recorded a payment',
  'billing.refund': 'recorded a refund',
  'billing.credit_note': 'issued a credit note',
  'billing.drafts.run': 'ran drafts',
  'billing.collect.run': 'ran collection',
  'theme.stage': 'added a pilot store',
  'theme.unstage': 'removed a pilot store',
  'theme.release': 'released a theme version',
  'theme.recall': 'recalled a theme version',
  'theme.withdraw': 'withdrew a theme version',
  'support.start': 'opened the console',
  'support.end': 'ended a support visit',
  'merchant.create': 'added the store',
  'offer.stop': 'stopped an offer',
  'offer.resume': 'resumed an offer',
}

/** What a row did, in words: the map first, then the action's own words ("order.items_edit" → "order items edit"). */
export function actionWords(action: string): string {
  return SAID[action] ?? action.replace(/^module\b/, 'app').replace(/^addon\b/, 'paid app').replace(/[._]+/g, ' ')
}
