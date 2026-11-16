// The five policy pages a shop has, in order, with their names (Phase 1). Kept apart from render.ts so a screen that only
// lists the pages doesn't ship their templates (Settings' first load, check:storefront-build's app budget).
export const POLICY_PAGES = [
  ['returns', 'Returns and exchanges'],
  ['shipping', 'Shipping'],
  ['privacy', 'Privacy'],
  ['terms', 'Terms of sale'],
  ['contact', 'Contact'],
] as const
export type PolicyPage = (typeof POLICY_PAGES)[number][0]
