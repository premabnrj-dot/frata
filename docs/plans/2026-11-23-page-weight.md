# Page weight · every page builds on Vercel with room under its script limit
Status: active (points 1, 2 and 4 built on the branch, speed review folded in; point 3 waits on the owner's word) · Date: 2026-11-23 · Lane F, branch `claude/lane-f-page-weight`
· Asked by: the owner, 2026-11-23 ("start a lane on the page size job"), after five production builds failed a fraction of a kB over a page's limit
· Gates: `check:storefront-build` (`scripts/check-storefront-build.mjs`, `scripts/lib/app-budget.mjs`) · Skill: `frata-architecture` § Speed
**Mockup:** none — nothing a person sees changes: the same code is loaded in fewer or different chunks, and constants move between files
**Approved:** owner, 2026-11-23 ("start a lane on the page size job"; points 1, 2 and 4 go ahead once speed-reviewer has read the plan)
**Review:** speed-reviewer WITHIN BUDGET, changes requested (2 HIGH: pins not lowered; About/FAQ 11 bytes above the new margin), all folded in but option A (needs the owner's word, § Point 3), 2026-11-23

## The problem
On 2026-11-23 five production builds failed on Vercel, each on a different page a fraction of a kB over its first-load
script limit (the Look customizer, Console › Content, the shop's About/FAQ page, Console › Brand twice). Vercel's build
measures about 0.2–0.3 kB more than a local one and varies by a few bytes between builds of one commit, so a page within
0.3 kB of its limit fails on Vercel at random.

**Goal:** every page at least 1.5 kB under its limit on Vercel (about 1.8 kB on a local build), by taking weight off,
never by raising a number. Each pin that frees up comes down to what the page measures + 2.

## What the weight was (measured 2026-11-23 on main, `npm run e2e` build)
- A plain console page (`/console/notices`) loaded 131.4 kB gzipped: 101.7 kB is Next 15 and React 19 (react-dom
  53.1, Next's app router 45.3, webpack's runtime 2.5, the link chunk 3.3), and the console shell about 28 kB.
- **The shell was loaded twice.** The Toaster, Button, the progress bar, the live region, `cn()`, the navs' icon set and
  the keyboard shortcuts were in the console layout's own chunk AND again in a shared chunk the page loaded: webpack makes
  a shared chunk only from 20 kB of code (`minSize`), so these small modules were copied into each side. 4.6–7.1 kB
  gzipped was a second copy on most Console, Admin and partner pages (Brand 4.65, Orders 7.1).
- **Zod (26 kB gzipped) loaded with three pages** that never run it in the browser: Console › Content, the product
  editor and the customizer. Their forms imported a cap or a list (`MAX_FAQ`, `MENU_LIMITS`, `MAX_STORIES`,
  `SECTION_NAMES`…) from a domain file whose save schemas are built with zod at load. No browser code parses with zod.
- **tailwind-merge (8.6 kB)** is built when `src/lib/utils.ts` loads, even on a page that never calls `cn()`. Today the
  console layout itself calls `cn()`, so 98 of 124 app pages still load it (speed review 7): the `/*#__PURE__*/` mark
  below only helps a page outside those layouts, and Notices' saving is the shell loading once, not this.
- **The GST rate table and the order and discount maths** loaded with Orders and the offer editor for one constant each
  (`MAX_DOCUMENTS`, `DISCOUNT_STYLES`).
- **Every offer sentence** loaded with the shop's checkout for one one-line rule (`saysOnline`).
- The shop's pages are almost all framework: About/FAQ is 109.3 kB, of which ours is about 4.6 kB (the bag button and its
  store 2.2, next/font's class objects 0.7, the shop-shared chunk's helpers, the moved-address check).

## What is built (points 1, 2 and 4)
1. **One shell chunk** (`next.config.ts`, cache group `appShell`): the shell's browser modules — `components/shell/{nav,
   nav-progress, rail-toggle, announce}`, `components/ui/{toast, toast-context, button, use-shortcuts}`,
   `components/icons/icon`, `lib/utils`, `domains/ui/shortcuts` — go into ONE chunk, and only for the entries that draw
   AppShell (Console, Admin, the partner workspace, the customizer). Those pages loaded every one of these modules
   already; now once. A page elsewhere (sign-in, start, Studio's own screen) keeps its own copy and never gets the navs.
   The shop's `shopShared` group (2026-11-16) is the same fix for the shop.
2. **Zod and other libraries out of the first load:**
   - Each domain file a browser read for a cap or a list is split in two: a zod-free `*-facts.ts` (the caps, lists,
     names, the library's search, the palette rule) that the browser imports, and the original file, which keeps its
     schemas and re-exports the facts, so every server caller is unchanged: `content/kinds-facts.ts`,
     `pages/templates-facts.ts`, `themes/sections-facts.ts`, `themes/site-facts.ts`, `themes/layer-facts.ts`,
     `catalogue/stories-facts.ts`; and `catalogue/readiness.ts` (the editor's "ready to show" list, out of
     `product-form.ts`, which also brought the tax rates and variant rules).
   - `orders/print-cap.ts` (`MAX_DOCUMENTS`), `checkout/discount-styles.ts` (`DISCOUNT_STYLES`) and
     `checkout/says-online.ts` (`saysOnline`) on their own, re-exported where they were.
   - `src/lib/utils.ts`: the merger is marked `/*#__PURE__*/`, so a page that never calls `cn()` can drop tailwind-merge
     (a small, harmless step; it saves nothing on a console page today, finding 7).
   - Security: no validation moves. Every server action still parses with the same schema from the same file; the
     browser never ran zod (no `parse` or `safeParse` in any client file), so it loses no check.
   - Two new lines in `check:storefront-build`, pure helpers in `app-budget.mjs` with tests: a page whose first-load
     script holds zod (`ZodError"`, which catches zod and zod/mini) fails; so does a Console page that loads no
     `app-shell-*.js` (the cache group matched nothing and the shell is loaded twice again).
4. **The guard** (`scripts/lib/app-budget.mjs`, tested in `scripts/__tests__/practices-gates.test.ts`):
   - `appBudgetRows` gives every budgeted page's kB and limit; `marginProblems` fails a page under its limit by less
     than `VERCEL_MARGIN_KB` (0.5); `closest` names the three pages with the least room.
   - `check:storefront-build` collects the shop pages, the customizer and every Console, Admin and partner page into
     those rows. Off Vercel (`VERCEL` unset: a local build, CI, the e2e stack) a page within 0.5 kB of its limit fails;
     on Vercel only the limit counts (the margin is what Vercel spends). On success it prints the three closest pages.
   - On a shop page the margin message says the likely cause: a lazy chunk added elsewhere grew webpack's runtime.
   - The gate reads only `.next`, so it cannot match its own documentation. Proven by planting both failures in a
     made-up build folder: a page at 149.69/150 and a chunk holding `"ZodError"` each fail; with `VERCEL` set only the
     zod line fails.

## Measured before and after (local `npm run e2e` build after merging main at 6acad4f, kB of first-load script gzipped)
| Page | Before | After | Limit before → after | Room after (local) |
|---|---|---|---|---|
| Console › Content | 194.4 | 155.8 | 196.2 → 157.8 | 2.0 |
| Console › Products › a product | 208.3 | 176.0 | 209.1 → 178 | 2.0 |
| Look customizer | 171.4 (175.0 on main after 6acad4f) | 147.7 | 177 → 149.7 | 2.0 |
| Console › Orders | 159.0 | 146.7 | 160.2 → 148.7 | 2.0 |
| Console › Offers › an offer | 152.9 | 142.5 | 154.1 → 144.5 | 2.0 |
| Console › Offers › new | 150.0 | 139.6 | 151.3 → 141.6 | 2.0 |
| Console › Collections › a collection | 151.9 | 144.9 | 152.9 → 146.9 | 2.0 |
| Console › Collections › new | 150.6 | 143.6 | 151.6 → 145.6 | 2.0 |
| Console › Settings › a section | 153.7 | 149.7 | 155.7 → 151.7 | 2.0 |
| Console › Preview store | 149.1 | 148.5 | 150.6 → 150.5 | 2.0 |
| Console › Brand | 149.6 | 144.8 | 150 | 5.2 |
| Console › Brand › Checkout | 147.6 | 142.9 | 150 | 7.1 |
| Console › Notices (a plain page) | 131.4 | 127.6 | 150 | 22.4 |
| Partner › Clients › a client | 147.8 | 146.6 | 150 | 3.4 |
| Partner › Team | 146.9 | 145.7 | 150 | 4.3 |
| Partner › Credits | 146.7 | 145.6 | 150 | 4.4 |
| Admin (most pages) | 142.7 | 137.5 | 150 | 12.5 |
| Studio (live screen, lane D) | 131.0 | 131.0 | 133.4 | 2.4 |
| Studio workbench fixture (lane D) | 131.6 | 131.6 | 133.4 | 1.8 |
| Shop › checkout | 119.8 | 118.7 | 120 (120.5 on main after 6acad4f) → 120 | 1.3 |
| Shop › a product | 117.5 | 117.8 | 120 | 2.2 |
| Shop › About/FAQ page | 109.3 | 109.3 | 109.8 | 0.5 |

Vercel adds about 0.3 kB: 2.0 kB of local room is about 1.7 on Vercel. Every Console, Admin and partner page meets the
goal. **Three pages miss it:** the shop's About/FAQ page (0.5 local), the checkout (1.3) and the Studio fixture (1.8;
lane D's, it doesn't draw the shell, so nothing here touched it). The product page's +0.3 kB is the checkout's change
regrouping the shop's shared chunks: the modules the checkout and the product page shared fell below webpack's 20 kB
split, and the product page now loads its share as a chunk of its own (`availability`, `picker`, `sizes`, `swatch`…);
2.2 kB of room stays.

**Left for later (speed review 6):** partner workspace pages still load 1.8–2.4 kB twice (Submit, form errors, the
dialog, the passkey client) and Admin 0.8–1.3 kB; sign-in and start load the Toaster twice (2.4 kB, not budgeted). A
second cache group for the partner workspace and Admin would take them; no page needs it today.

## Point 3 · the runtime tax, and the shop (needs the owner's word; nothing here is built)
**Measured.** webpack's runtime (`static/chunks/webpack-*.js`, 2.52 kB gzipped) is shipped by every page, the shop's
included. 0.64 kB of it is the map of every lazy chunk in the app (39 today: the console's 13, the customizer's 9,
Studio and the partner workspace's 10, the shop and modules' 14), about 16 bytes gzipped each. So each next/dynamic added
anywhere costs every shop page about 16 bytes. With the new margin, About/FAQ (0.51 kB of room) fails the local build on
the next lazy chunk added anywhere: main already traded a customizer form back into its first load (+3.6 kB there) to
save 16 bytes on the shop. The rest of the runtime (1.9 kB) is webpack's loader and does not shrink.

**What Next 15 allows (nextjs.org docs, read 2026-11-23).** A `webpack()` function in `next.config` is supported, but
"changes to webpack config are not covered by semver so proceed at your own risk"; the page says nothing about
`splitChunks` or `runtimeChunk`. The App Router loads one runtime for every route (the build manifest's `rootMainFiles`),
and no option gives a route group its own: a shop-only runtime is not on offer. The lazy-loading guide documents no
`webpackChunkName` for next/dynamic (only `webpackIgnore` / `turbopackIgnore`). Turbopack builds are beta in 15.5
(stable in 16) and ignore our `webpack()` config, so they are a Next 16 question, not this plan's.

**The options, each measured on today's build (speed review re-measured them by editing the built files):**
| Option | Saves on every page | Cost |
|---|---|---|
| A. Shorter chunk hashes (`output.chunkFilename` `[contenthash:8]` instead of 16) | 0.22 kB | One line in `next.config.ts`. 32 bits of hash still tell two versions of one chunk apart; nothing reads the length. |
| B. Fewer lazy chunks: a `splitChunks` cache group with `chunks: 'async'` per surface (39 → about 8) | 0.50 kB | The first open of any lazy form downloads its group's other forms too; the largest group's size needs checking. |
| C. A and B | 0.54 kB | |
| E. Hold the shop's ceilings on the shop's own files (first load minus `rootMainFiles`: the runtime and the framework), and the whole page on the 120 budget | none, but app-wide lazy chunks stop failing shop builds | It changes what the tripwire measures, so it is the owner's call. Shop code still only comes down. |

**The shop also carries next/font's class objects:** each `localFont()` leaves a small object (`{className, style,
variable}`) in the layout's chunk although only the server reads it: 0.48 kB on About/FAQ and 0.54 kB on the checkout.
Not all of it can go: Inter (`src/app/layout.tsx`) and DM Sans (`src/components/brand/site-fonts.ts`) are preloaded by
next/font, and a plain stylesheet would drop the preload, so text would swap in late on every page (speed review 4).
Only the eight theme faces, none preloaded, can move to a plain stylesheet: 0.34 kB on About/FAQ. It is how text looks on
every theme shop, so it is listed here, not built.

**Recommendation:** A now, with this change (About/FAQ to about 0.73 kB of local room, so one stray lazy chunk no longer
fails builds); E for the owner; the theme faces' stylesheet after. A and the theme faces put About/FAQ at about 108.7
local. **No option reaches the 1.5 kB goal for About/FAQ at a 109.5 ceiling** (A + B + the theme faces: about 0.95 kB on
Vercel). The ceiling can come back to 109.5 only after A and the faces land, and then with less room than the other
pages; E is the way to the goal for the shop's About/FAQ page. Until the owner decides, it stays at 109.8 with 0.5 kB
local room.

## Regression net
The flows the change touches, run on the branch before the release report: checkout, shop-look (its screenshot
baselines guard the shop's look), look, content, brand, products-pr0, partner-credits, partner-team, studio,
studio-agent, primitives (the toast and the shell's keys), ux (every Console and Admin page at four widths).
`npm test`, `npm run typecheck`. No migration.

## Shared files touched
- `next.config.ts` (the `appShell` cache group; every console, Admin, partner workspace and customizer page).
- `src/lib/utils.ts` (one annotation).
- `scripts/check-storefront-build.mjs`, `scripts/lib/app-budget.mjs` (the gate every build runs: the pins, the customizer's
  ceiling and checkout's back to 120), `scripts/__tests__/practices-gates.test.ts`, and the budget row in
  `.claude/skills/frata-architecture/reference/speed.md`.
- Domain files split, each still exporting everything it did: `src/domains/{content/kinds, pages/templates,
  themes/sections, themes/site, themes/layer, catalogue/stories, catalogue/product-form, checkout/discounts,
  checkout/offer-text, orders/documents}.ts`, and `themes/readiness.ts`' import.
- Client imports changed (nothing else in them): Content's five forms, the product editor and its extras panel, the
  customizer's eight forms, the orders queue, the offer form's rules (`domains/checkout/offer-form.ts`), the bag's quote.
- Not touched: lane C's credits files and lane D's Studio files (`src/app/(partner)/partner/studio`,
  `src/components/studio`, `src/lib/studio`). The Studio pages are outside the `appShell` group on purpose.

## Risks
- The `appShell` cache group relies on webpack naming each App Router entry by its path (`app/(console)/…`). If Next
  renames entries, the group matches nothing and the duplicates come back: the budgets catch it (Brand would be 149.6
  again, within the margin).
- A `*-facts.ts` file must stay zod-free; the new zod line in `check:storefront-build` fails the build if one imports it.
