// =============================================================================
// FILE: fixtures.ts — THE WORKBENCH SHELL'S FIXTURE DATA (plan WB·3: "on fixture data, with no agent, no hosting, no
// credits and no database"). Every value is as drawn in docs/mockups/2026-11-22-studio-workbench.html screen 1 and the
// chat's cards in docs/mockups/2026-11-16-studio-redraw.html. A fixture store's colours are its data (check:hex
// QUOTED_OK names this file). WB·4–WB·6 replace these with the session's real rows.
// =============================================================================

export const CLIENT = 'House of Ayuda'
export const CREDITS = 142
/** The Studio steps (the 16 Nov redraw's six; owner 2026-11-22: the fourth is "Website", not "Site"). */
export const STEPS = ['Brand', 'Look', 'Pages', 'Website', 'Publish', 'Hand over'] as const
export const STEP_NOW = 3
export const BUILDING = 'v8'
export const PREVIEWING = 'v7'

/** The store's look, as its brand record holds it (the redraw's "Sindoor paper"). */
export const SITE = {
  paper: '#FAF6EF', ink: '#2B1B14', accent: '#8C1D2C', soft: '#EADFCF', onHero: '#FFF8EC',
  hero: ['#D9A441', '#B5542B', '#7A2A1E'],
} as const

export const PRODUCTS = [
  { name: 'Mustard Cotton Kurta', price: '₹2,190', swatch: '#E7C9A9', soldOut: false },
  { name: 'Gold Tissue Sari', price: '₹7,490', swatch: '#D9BE62', soldOut: true },
  { name: 'Haldi Cotton Sari', price: '₹1,890', swatch: '#8D90B8', soldOut: false },
] as const

/** The store's serif in the fixture (the real preview draws the store's own faces, WB·4). */
export const SERIF = 'Georgia, serif'
export const STRIP = 'Free shipping above ₹1,499 · Pay on delivery'
export const HEADING = 'For the days you’ll keep'
export const LONGEST = 'For the days you’ll keep and hand on to your daughters'

export const PAGES = ['Home', 'Product', 'Collection', 'Size help', 'Checkout'] as const
/** The preview's cases: each stands for a real record of the store (spec § 1), drawn here from fixtures. */
export const CASES = [['normal', 'Normal'], ['empty', 'No products'], ['long', 'Longest heading'], ['soldout', 'Sold out']] as const
export type Case = (typeof CASES)[number][0]

/** The chat: the person's ask, the agent's work lines, and the Words for Content card (redraw, S17). */
export const ASK = 'Make the hero warmer'
export const WORK = [{ t: 'Built Home', run: false }, { t: 'Built Product', run: false }, { t: `Building ${BUILDING} · about 1–2 min`, run: true }] as const
export const PROPOSALS = [
  ['Home hero · heading', 'For the days you’ll keep'],
  ['Size help · how to measure', 'Bust or chest: around the fullest part, tape level.'],
  ['Questions · delivery', 'Dispatched in 2 days. Delivered in 4–7 days.'],
] as const
export const SUGGESTIONS = ['Add a PIN code check to Product', 'Tighten spacing'] as const

/** Parts of the preview a person can pick, and what Design shows for each. `more`: said after the part's own words, so
 *  its name starts with what is seen (WCAG 2.5.3). */
export const PARTS = {
  hero: { name: 'Home hero', heading: HEADING, more: ' · Home hero' },
  newin: { name: 'New in · heading', heading: 'New in', more: ' · heading' },
} as const
export type Part = keyof typeof PARTS

/** Code: the files changed in v8 and its diff (read-only; WB·6 reads them from the session). */
export const FILES = [
  { path: 'app', dir: true, changed: false, depth: 0 },
  { path: 'page.tsx', dir: false, changed: true, depth: 1 },
  { path: 'product/[handle]/page.tsx', dir: false, changed: false, depth: 1 },
  { path: 'components', dir: true, changed: false, depth: 0 },
  { path: 'hero.tsx', dir: false, changed: true, depth: 1 },
] as const
export const DIFF = [
  { kind: 'file', text: 'components/hero.tsx' },
  { kind: 'cut', text: '- <Hero tone="cool" />' },
  { kind: 'add', text: '+ <Hero tone="warm" />' },
  { kind: 'same', text: '  <h1>{content.hero.heading}</h1>' },
] as const
export const DEV_COMMAND = 'npx frrata dev house-of-ayuda'
export const BRANCH = { name: 'dev/kabir', changes: 3 }

/** Checks on v8 (the publish gate's results; WB·5 keeps them). */
export const CHECKS = [
  { title: 'Photo has no description.', where: 'components/hero.tsx:14', fix: true },
  { title: 'Phone speed', where: 'Loads in 1.9 s · passes', fix: false },
  { title: 'Logo and colours from the brand', where: 'passes', fix: false },
  { title: 'No personal fields', where: 'passes', fix: false },
  { title: 'Accessibility', where: '41 of 42 pass', fix: false },
] as const
export const TO_FIX = CHECKS.filter((c) => c.fix).length

export const VERSIONS = [
  { name: 'v8 · Warmer hero', state: 'building' },
  { name: 'v7 · 6 pages built', state: 'preview' },
  { name: 'v6 · Sindoor paper', state: 'restore', id: 'v6' },
  { name: 'v5 · Warm voice', state: 'restore', id: 'v5' },
] as const

/** The Brand book (mockup docs/mockups/2026-11-22-four-screens.html § 3): the brand record read-only, in Design. */
export const BRAND_ROW = ['#8C1D2C', '#D9A441', '#FAF6EF'] as const
export const BOOK = {
  line: 'Kurtas, saris and lehengas for haldi mornings, sangeet nights and every day after.',
  voice: 'Warm · English',
  buyers: 'Brides’ families · gifting · everyday wear',
  words: 'haldi · sangeet · ready to wear · kind prices',
  never: 'cheap · hurry · trendy',
  logo: 'House of Ayuda · from the console',
  look: 'Sindoor paper',
  lookSwatches: ['#FAF6EF', '#8C1D2C', '#2B1B14'],
  type: 'For the days you’ll keep',
} as const
/** The shell's states, set from the test page's address (?builder=1, ?nologo=1, ?waiting=1); fixtures only. */
export type ShellFlags = { builder: boolean; noLogo: boolean; waiting: boolean }
export const NO_FLAGS: ShellFlags = { builder: false, noLogo: false, waiting: false }
