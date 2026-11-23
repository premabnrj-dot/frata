# Page weight · every page builds on Vercel with room under its script limit
Status: active (points 1, 2 and 4 built; point 3's A and E built on the owner's word, 2026-11-23; B declined, theme fonts later) · Date: 2026-11-23 · Lane F, branch `claude/lane-f-page-weight`
· Asked by: the owner, 2026-11-23 ("start a lane on the page size job"), after five production builds failed a fraction of a kB over a page's limit
· Gates: `check:storefront-build` (`scripts/check-storefront-build.mjs`, `scripts/lib/app-budget.mjs`) · Skill: `frata-architecture` § Speed
**Mockup:** none — nothing a person sees changes: the same code is loaded in fewer or different chunks, and constants move between files
**Approved:** owner, 2026-11-23 ("start a lane on the page size job"; points 1, 2 and 4 go ahead once speed-reviewer has read the plan)
**Review:** speed-reviewer WITHIN BUDGET, changes requested (2 HIGH: pins not lowered; About/FAQ 11 bytes above the new margin), all folded in but option A (needs the owner's word, § Point 3), 2026-11-23
**Review:** speed-reviewer WITHIN BUDGET, approved on the diff (0 HIGH, 1 MED: About/FAQ 33 bytes above the local margin, waits on point 3), 2026-11-23
**Review:** impact-reviewer CLEAR (2 MED folded in: check:layers keeps each browser half zod-free at commit; a test that each half and its original are one value), 2026-11-23
**Review:** security-reviewer SAFE (every action validates with the same schema; no client file ever ran zod; nothing server-only moved), 2026-11-23
**Review:** design-system-reviewer PASS (nothing a person sees changed), 2026-11-23
**Review:** speed-reviewer WITHIN BUDGET, approved on A and E (4 LOW, folded in), 2026-11-23; impact-reviewer FIX BEFORE COMMIT on A and E (3 MED: helpers and tests, stale ceilings, this paragraph), folded in, 2026-11-23

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
   - At commit, `check:layers` (rule 5) fails a `src/domains/**/*-facts.ts`, `print-cap.ts`, `says-online.ts`,
     `discount-styles.ts` or `catalogue/readiness.ts` that reaches zod through any run-time import (type-only imports are
     erased), and `src/domains/__tests__/browser-halves.test.ts` holds each half and its original to one value.
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
| Shop › checkout, whole page (after A) | 119.8 | 118.5 | 120 (120.5 on main after 6acad4f) → 120 | 1.5 |
| Shop › checkout, own files (E) | — | 17.59 | 18.1 | 0.51 |
| Shop › a product (after A) | 117.5 | 117.6 | 120 | 2.4 |
| Shop › About/FAQ page, whole page (after A) | 109.3 | 109.1 | 109.8 → 110.6 (E: now the runtime's room) | 1.5 |
| Shop › About/FAQ page, own files (E) | — | 8.13 | 8.7 | 0.57 |

Vercel adds about 0.3 kB: 2.0 kB of local room is about 1.7 on Vercel. Every Console, Admin and partner page meets the
goal. **Three pages miss it:** the shop's About/FAQ page (0.5 local), the checkout (1.3) and the Studio fixture (1.8;
lane D's, it doesn't draw the shell, so nothing here touched it). The product page's +0.3 kB is the checkout's change
regrouping the shop's shared chunks: the modules the checkout and the product page shared fell below webpack's 20 kB
split, and the product page now loads its share as a chunk of its own (`availability`, `picker`, `sizes`, `swatch`…);
2.2 kB of room stays.

**Left for later (speed review 6, and on the diff):** Next's `next/navigation` re-export (0.1 kB) is still in two chunks
on 25 shell pages; partner workspace pages still load 1.8–2.4 kB twice (Submit, form errors, the
dialog, the passkey client) and Admin 0.8–1.3 kB; sign-in and start load the Toaster twice (2.4 kB, not budgeted). A
second cache group for the partner workspace and Admin would take them; no page needs it today.

## Found while running the flows: a refresh the lighter pages lose
e2e `90-ux` failed its support-mode step in 4 of 8 runs on this branch, 0 of 4 on main. A debug flow repeating those
steps logged why: the support banner should leave after a visit ends elsewhere (TenantCheck asks which shop, then
refreshes) or runs out (ExpiryRefresh refreshes on time). In the failures the refresh either came back 200 and never
committed, or never left after an in-app move. That is Next 15.5 dropping a refresh while the page's response still
streams (frata-gotchas); the lighter pages load sooner and meet it more often (2 of 36 rounds; main 0 of 24). Both now call
`settle(router)`, the codebase's remedy (a second refresh 700 ms later). After: 54 of 54 rounds and 7 of 8 `ux` runs
green; the eighth was a single React #418 on Admin › Merchants at 200 % that did not come back in 7 more runs (not
explained). Files: `src/components/shell/tenant-check.tsx`, `src/components/nav/expiry-refresh.tsx`.

## Point 3 · built: A and E (the owner's word, 2026-11-23, through the orchestrator)
- **A.** `next.config.ts` names lazy chunks `static/chunks/[name].[contenthash:8].js` (Next's own is 16 characters):
  webpack's runtime 2,562 → 2,339 bytes gzipped, about 0.22 kB off every page. Checked first that nothing reads the
  length: the 16-hex patterns in the repo are share-card and icon file names; there is no service worker; the CSP uses a
  nonce, not file hashes; check scripts and e2e (`laterChunks`) match whole file names; `vercel.json` routes no chunk.
  **Collision exposure:** a new version of one chunk would have to share its old version's 32-bit hash to be served stale
  from a browser's cache, about 1 in 4.3 billion per changed chunk. `check:storefront-build` fails if the runtime lists a
  hash longer than 8 characters (Next renamed its pattern and the line stopped applying); planted, it fires.
- **E.** Two numbers for the shop's two closest pages (`check-storefront-build.mjs`, TIGHT and SHOP_OWN, the script says
  what each measures and why there are two): **own files**, the first load minus `rootMainFiles` (webpack's runtime, React,
  Next's router), at measured + 0.5 (About/FAQ 8.7, checkout 18.1), so the shop's code only comes down and a lazy chunk
  added in the console no longer fails a shop page; and **whole page** at measured + 1.5, never over 120 (About/FAQ
  110.6, checkout stays 120), so the runtime and the framework can't grow unseen. A successful build prints both for the
  three closest pages. The local 0.5 kB margin applies to the whole page only: Vercel's extra weight is in the framework.
  The own number still counts the next/link chunk (Next's `app-dir/link.js`, 3.3 kB of About/FAQ's 8.1), so a Next
  upgrade can move it; the failure line says so. A ceiling naming a page that no longer builds fails, as a stale pin does.
  The checks are pure helpers in `app-budget.mjs` (`ownKb`, `ownProblems`, `runtimeHashProblems`) with tests; the
  runtime check also fails if it can see no 8-character hash while the app has lazy files (Next changed its format).
  **Proved:** a build with a Vercel-style `NEXT_DEPLOYMENT_ID` (skew protection appends it to chunk URLs) weighs 0.23 kB
  more on every page, all of it in Next's router chunk (`1255`: 45.32 → 45.55); the shop's own files are the same size to
  the byte (About/FAQ 8.13, checkout 17.59).
- **B** (fewer lazy chunks): no, for now (it changes when forms download). **The theme faces' stylesheet:** after this
  release, proposed as its own small step.
- About/FAQ's whole-page number moves 109.8 → 110.6 because it now measures something else (the runtime's and framework's
  room); its own code is held at 8.7. Both shop pages have 1.5 kB of whole-page room locally (about 1.2 on Vercel).

## Point 3 · the analysis as proposed (kept for the record)
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

**What was recommended, and what the owner chose:** A now; E for the owner; the theme faces' stylesheet after, since no
option alone reached the 1.5 kB goal for About/FAQ at a 109.5 ceiling. The owner chose A and E (with a whole-page
ceiling kept beside the own-files one), declined B for now and put the faces after this release: § Point 3 · built.

## After the release (the orchestrator's follow-ups, 2026-11-23)
- **The guard tells a developer what to do.** `npm run weight -- <page>` (a URL path or a manifest key) prints the page's
  first-load files, heaviest first, by kind (framework, shell, layout, page, shared), the client components this page
  renders that bring each (Next's client reference manifest, kept to components whose every file the page loads) and
  the libraries in each (zod, tailwind-merge, lucide, the passkey client). Every budget failure names it for its page,
  then the fix. `scripts/lib/page-weight.mjs`, tested.
- **The theme faces' stylesheet (built: nothing a shopper sees changes).** The eight theme faces are
  `src/components/shop-preview/store-fonts.css`, written by `scripts/build-store-fonts.mjs` with next/font's own local
  loader and its own postcss plugin, so the output is next/font's to the character; `check:store-fonts` (gates) fails a
  stale file. **Proved identical** on the built CSS against a baseline saved from the build before: all 18 `@font-face`
  rules (src aside: `font-display: swap`, weights, unicode-ranges, the fallback faces' `local()` and overrides) and all
  10 `--font-store-*` values match; none of the eight was or is preloaded; Inter and DM Sans (preloaded) stay on next/font.
  e2e `shop-look`'s screenshot baselines match. Saves 0.32 kB of own script on About/FAQ, 0.26 on checkout, 0.4 on the
  product page and Console › Brand; the shop's CSS 15.9 → 15.8 kB.
- **The rest of the double loads.** Three more cache groups in `next.config.ts`, each limited to one surface's pages and
  to modules its layout already loads: `partnerShell` (the passkey gate and its form parts), `adminShell` (Admin's passkey
  gate), `signInToaster` (the Toaster on sign-in, start, join, handover and the partner application). Duplication left on
  any page: at most 0.32 kB (Next's `next/navigation` re-export, 0.1 kB, the largest). Partner Team 145.7 → 142.8 kB,
  Developer 142.4 → 139.5, Admin pages about −0.8.
- **Ceilings lowered again** (measured + 0.5 own, + 1.5 whole; checkout's whole stays 120): About/FAQ 110.3 whole and
  8.4 own (108.75 / 7.81 measured), checkout 120 and 17.9 (118.27 / 17.33). Console pins to measured + 2 again (0.1–0.8 kB
  each), the customizer 149.2. The Studio pins stay lane D's.

## Regression net
The flows the change touches, run on the branch before the release report: checkout, shop-look (its screenshot
baselines guard the shop's look), look, content, brand, products-pr0, partner-credits, partner-team, studio,
studio-agent, primitives (the toast and the shell's keys), ux (every Console and Admin page at four widths).
`npm test`, `npm run typecheck`. No migration.

## Shared files touched
- `next.config.ts` (the `appShell` cache group; every console, Admin, partner workspace and customizer page).
- `src/lib/utils.ts` (one annotation).
- `src/components/shell/tenant-check.tsx`, `src/components/nav/expiry-refresh.tsx` (settle instead of one refresh: every
  staff page and every support visit).
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
