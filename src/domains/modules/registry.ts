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

export const MODULE_KEYS = ['communication', 'rto_shield', 'ship', 'true_profit', 'reviews', 'marketplace_export', 'size_fit', 'cart_flows', 'gst', 'ekcode', 'product_video', 'delivery_zones'] as const
export type ModuleKey = (typeof MODULE_KEYS)[number]

/**
 * How a module is sold. `core`: in every plan. `plan`: when the shop's plan version lists it. `add_on`: a plan may
 * include it; otherwise it is bought (or trialled) as an add-on at its addon_prices row.
 */
export type Billing = 'core' | 'plan' | 'add_on'
export type Group = 'talk' | 'deliver' | 'grow' | 'run'
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
  /** An add-on sold only on these plans (owner, 2026-11-09: Reviews on Growth and Scale); absent = any plan. A trial
   *  or add-on row on another plan grants nothing, so a downgrade stops it. */
  addOnFor?: readonly ('launch' | 'growth' | 'scale')[]
  /** Charged by someone else, named so the merchant is never surprised. */
  usage?: string
  dependsOn: readonly ModuleKey[]
  /** Where setting it up starts, once it is on. */
  setup?: string
  /** The outbox kinds this module sends (e.g. whatsapp.send): the sweep holds or cancels them with the module. */
  outboxKinds: readonly string[]
}

export const MODULES: Record<ModuleKey, ModuleDef> = {
  communication: {
    key: 'communication', name: 'Messages', job: 'WhatsApp with customers. One inbox for your team.', group: 'talk', billing: 'core', status: 'now',
    usage: 'Meta bills messages', dependsOn: [], outboxKinds: [], setup: '/console/apps/communication',
  },
  rto_shield: {
    key: 'rto_shield', name: 'RTO Shield', job: 'Confirm COD before you pack. Fewer refused parcels.', group: 'deliver', billing: 'plan', status: 'next', dependsOn: ['communication'], outboxKinds: [],
  },
  ship: {
    key: 'ship', name: 'Ship', job: 'Shiprocket labels, tracking, failed deliveries.', group: 'deliver', billing: 'core', status: 'next', usage: 'Shiprocket bills freight', dependsOn: [], outboxKinds: [],
  },
  true_profit: {
    key: 'true_profit', name: 'True Profit', job: 'Profit by product, pincode and campaign.', group: 'run', billing: 'add_on', status: 'next', dependsOn: [], outboxKinds: [],
  },
  reviews: {
    key: 'reviews', name: 'Reviews', job: 'Photo reviews after delivery, on the product page.', group: 'grow', billing: 'add_on', status: 'next', dependsOn: ['communication'], outboxKinds: ['review:ask'], addOnFor: ['growth', 'scale'],
    usage: 'WhatsApp asks are billed by Meta',
  },
  marketplace_export: {
    key: 'marketplace_export', name: 'Marketplace export', job: 'Your catalogue as Myntra, Ajio and Nykaa files.', group: 'grow', billing: 'add_on', status: 'next', dependsOn: [], outboxKinds: [],
  },
  size_fit: {
    key: 'size_fit', name: 'Size and fit', job: 'Fewer size returns. Fit learned from returns.', group: 'grow', billing: 'plan', status: 'next', dependsOn: [], outboxKinds: [],
  },
  gst: {
    key: 'gst', name: 'GST', job: 'Your GSTR-1 each month, and the files your CA needs.', group: 'run', billing: 'plan', status: 'now',
    dependsOn: [], outboxKinds: [], setup: '/console/apps/gst',
    // GST on every invoice and credit note is core, in every plan (plan 2026-11-09 § 1); this is the month's return.
  },
  ekcode: {
    key: 'ekcode', name: 'EkCode', job: 'Shoppers filled in at checkout.', group: 'grow', billing: 'core', status: 'now', dependsOn: [], outboxKinds: [],
    setup: '/console/apps/ekcode',
  },
  product_video: {
    // PV·1 (docs/plans/2026-11-10-product-video-pv1.md): core, so every plan has it; a module, so Admin › Modules can
    // pause it for everyone while each shop's delivered minutes have no budget yet (unit-economics review 2026-11-10).
    key: 'product_video', name: 'Product video', job: 'A reel or a film on each product.', group: 'grow', billing: 'core', status: 'now', dependsOn: [],
    // Off stops paid 720p prep still queued; never the deletes or cancels (security review LOW-2, 2026-11-10).
    outboxKinds: ['mux.rendition.create'],
    usage: 'Up to a minute each, one per product',
  },  delivery_zones: {
    key: 'delivery_zones', name: 'Delivery Zones', job: 'Delivery charges, dates and COD by PIN code.', group: 'deliver', billing: 'add_on', status: 'now',
    // In Growth and Scale through their plan features (0105); an add-on on Launch at ₹999/month (owner, 2026-11-12).
    addOnFor: ['launch'], dependsOn: [], outboxKinds: [], setup: '/console/apps/delivery_zones',
  },

  cart_flows: {
    key: 'cart_flows', name: 'Cart flows', job: 'Bring back bags left behind.', group: 'talk', billing: 'plan', status: 'next', dependsOn: ['communication'], outboxKinds: [],
    usage: 'Meta bills messages',
  },
}

/** The gallery's groups, by the merchant's job (Apps gallery, owner 2026-11-11). Keys are code only; no table holds them. */
export const GROUPS: readonly [Group, string][] = [['talk', 'Talk to shoppers'], ['deliver', 'Get paid and ship'], ['grow', 'Sell more'], ['run', 'Run the books']]

/** Modules a plan version may list in `features` (core ones are in every plan already). */
export const PLAN_GRANTABLE: readonly ModuleKey[] = MODULE_KEYS.filter((k) => MODULES[k].billing !== 'core')
/** Modules sold as add-ons (addon_prices rows exist only for these). */
export const ADD_ONS: readonly ModuleKey[] = MODULE_KEYS.filter((k) => MODULES[k].billing === 'add_on')

/** The module that owns an outbox kind, if any (one list: each module's outboxKinds). */
export function moduleForKind(kind: string): ModuleKey | null {
  return MODULE_KEYS.find((k) => MODULES[k].outboxKinds.includes(kind)) ?? null
}

export const isModuleKey = (k: string): k is ModuleKey => (MODULE_KEYS as readonly string[]).includes(k)
