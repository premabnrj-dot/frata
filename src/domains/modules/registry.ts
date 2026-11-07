// =============================================================================
// FILE: src/domains/modules/registry.ts — every module Frata can switch on, once.
//
// docs/specs/2026-11-07-modules-foundation.md. A module is data: its key, what
// it does in one line, how it is sold, what it needs, where it lives. The plan
// features CHECK and the add-on CHECK are built from MODULE_KEYS (schema), so
// TypeScript and Postgres cannot drift. Prices are NOT here: add-on prices are
// versioned rows (addon_prices), plan inclusion is plan_versions.features.
// Pure: no React, no db (check:layers).
// =============================================================================

export const MODULE_KEYS = ['communication', 'rto_shield', 'ship', 'true_profit', 'reviews', 'marketplace_export', 'size_fit', 'cart_flows'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

/**
 * How a module is sold. `core`: in every plan. `plan`: when the shop's plan version lists it. `add_on`: a plan may
 * include it; otherwise it is bought (or trialled) as an add-on at its addon_prices row.
 */
export type Billing = 'core' | 'plan' | 'add_on'
export type Group = 'talk' | 'deliver' | 'grow'
/** `now`: built, can be switched on. `next`: listed so merchants see what is coming; never switchable. */
export type Status = 'now' | 'next'

export type ModuleDef = {
  key: ModuleKey
  name: string
  /** One line, the job (frata-design-language § Voice). */
  job: string
  group: Group
  billing: Billing
  status: Status
  /** Charged by someone else, named so the merchant is never surprised. */
  usage?: string
  /** What the merchant gets, 4–6 short lines (the details dialog). */
  features: readonly string[]
  dependsOn: readonly ModuleKey[]
  /** Where setting it up starts, once it is on. */
  setup?: string
  /** The outbox kinds this module sends (e.g. whatsapp.send): the sweep holds or cancels them with the module. */
  outboxKinds: readonly string[]
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  communication: {
    key: 'communication', name: 'Messages', job: 'WhatsApp with customers. One inbox for your team.', group: 'talk', billing: 'core', status: 'next',
    usage: 'Meta bills messages', dependsOn: [], outboxKinds: [],
    features: ['Your own WhatsApp Business number', 'COD confirmation by reply', 'Shipped and delivered updates', 'One inbox for your team', 'Notes, assignment, quick replies'],
  },
  rto_shield: {
    key: 'rto_shield', name: 'RTO Shield', job: 'Confirm COD before you pack. Fewer refused parcels.', group: 'deliver', billing: 'plan', status: 'next', dependsOn: ['communication'], outboxKinds: [],
    features: ['COD waits for a WhatsApp confirm', 'A COD commitment fee, your rule', 'Pincode and phone history', 'Prepaid nudge at checkout'],
  },
  ship: {
    key: 'ship', name: 'Ship', job: 'Shiprocket labels, tracking, failed deliveries.', group: 'deliver', billing: 'core', status: 'next', usage: 'Shiprocket bills freight', dependsOn: [], outboxKinds: [],
    features: ['Labels from the Pack button', 'A tracking page for shoppers', 'A queue of failed deliveries', 'Courier picked by rate and pincode'],
  },
  true_profit: {
    key: 'true_profit', name: 'True Profit', job: 'Profit by product, pincode and campaign.', group: 'grow', billing: 'add_on', status: 'next', dependsOn: [], outboxKinds: [],
    features: ['Profit per delivered order', 'By product, size and colour', 'RTO cost by pincode', 'By campaign, on delivered orders'],
  },
  reviews: {
    key: 'reviews', name: 'Reviews', job: 'Photo reviews after delivery, on the product page.', group: 'grow', billing: 'add_on', status: 'next', dependsOn: ['communication'], outboxKinds: [],
    usage: 'WhatsApp asks are billed by Meta',
    features: ['A WhatsApp ask after delivery', 'Photos and stars on the product page', 'Delivered buyers only', 'You approve each one', 'Stars in Google results'],
  },
  marketplace_export: {
    key: 'marketplace_export', name: 'Marketplace export', job: 'Your catalogue as Myntra, Ajio and Nykaa files.', group: 'grow', billing: 'add_on', status: 'next', dependsOn: [], outboxKinds: [],
    features: ['Myntra, Ajio and Nykaa formats', 'Sizes and colours mapped', 'Problems listed before you upload'],
  },
  size_fit: {
    key: 'size_fit', name: 'Size and fit', job: 'Fewer size returns. Fit learned from returns.', group: 'grow', billing: 'plan', status: 'next', dependsOn: [], outboxKinds: [],
    features: ['A size finder on the product page', '"Runs small or large" from returns', 'Exchange first, refund second'],
  },
  cart_flows: {
    key: 'cart_flows', name: 'Cart flows', job: 'Bring back bags left behind.', group: 'grow', billing: 'plan', status: 'next', dependsOn: ['communication'], outboxKinds: [],
    usage: 'Meta bills messages', features: ['WhatsApp reminder for a left bag', 'Back-in-stock alerts', 'Only shoppers who agreed'],
  },
}

export const GROUPS: readonly [Group, string][] = [['talk', 'Talk'], ['deliver', 'Deliver'], ['grow', 'Grow']]

/** Modules a plan version may list in `features` (core ones are in every plan already). */
export const PLAN_GRANTABLE: readonly ModuleKey[] = MODULE_KEYS.filter((k) => MODULES[k].billing !== 'core')
/** Modules sold as add-ons (addon_prices rows exist only for these). */
export const ADD_ONS: readonly ModuleKey[] = MODULE_KEYS.filter((k) => MODULES[k].billing === 'add_on')

/** The module that owns an outbox kind, if any (one list: each module's outboxKinds). */
export function moduleForKind(kind: string): ModuleKey | null {
  return MODULE_KEYS.find((k) => MODULES[k].outboxKinds.includes(kind)) ?? null
}

export const isModuleKey = (k: string): k is ModuleKey => (MODULE_KEYS as readonly string[]).includes(k)
