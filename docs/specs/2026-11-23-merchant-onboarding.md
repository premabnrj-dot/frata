# Merchant onboarding: sign-up, setup, the website, the end of themes, more categories
Status: draft (awaiting the owner's eleven calls; nothing built) · Date: 2026-11-23 · Mockup: MOCKUP_LINK
(`docs/mockups/2026-11-23-merchant-onboarding.html`) · Approved: pending
Builds on: ADR-0014 (themes retire; partners get the builder first), ADR-0020 (Studio's agent),
`docs/plans/2026-11-12-studio-build.md`, `docs/plans/2026-11-16-execution.md`,
`docs/plans/2026-11-09-gst-core-and-categories.md` (§ 4 phase 6, category packs).

The owner, 2026-11-23: "plan more interactive, ux friendly onboarding, shop setup flow, mockups, redesigning, more
subtle, motion graphic flowy onboarding flow for merchants"; "shall merchants also switch to the studio to build their
own website … Should we retire theme/look system completely?"; "how can we extend the storefront to more categories";
"PIN code isn't required for the signup, move it to settings/address"; "there is signup flow and then there is setup
flow. plan both well"; "use popup/modals where they make better sense"; "One thing at a time, smooth transitions".

This is a roadmap spec (frata-planning rule 1). It names eight phases; O1 and O2 are specified here in full and can be
built once their calls are answered. Each later phase gets its own spec and mockup before it is built.

## In short
1. **Sign-up goes from 5 steps to 3**: brand name (address derived), email and code, what you sell. The PIN code and
   the plan question leave. The store draws itself beside the questions.
2. **Setup shows one step at a time** on Home. Three short steps open in a popup (a sheet on a phone). Measured today:
   16 things typed or picked over about 12 screens before a store can open; proposed 12 over 5.
3. **Retire themes completely, in four stages.** 7 stores exist, 4 have a published look, 2 are open (production,
   2026-11-23), so moving them is cheap now. But nothing can build or host a code website today, so themes cannot go
   until a store owner can get a website without a partner.
4. **Store owners get a website builder, not the partner workbench**: first a starter with their Brand and Content, free
   and with no agent turn; later "Ask for a change", priced before it runs.
5. **Categories become packs**: one definition per category carrying options, fields, tax codes, what the law asks on
   the page, words and photo shape. Wave 1 needs no licence number; wave 2 does.

## Goal
Ranked problems 5 (a premium storefront, built as code), 3 (catalogue operations) and 4 (mobile conversion, through a
faster first store). Measures: median time from `/start` to Home under 60 s; share of new stores open within a day of
sign-up; first Active product within 15 minutes (the Phase 1 measure, never met by measurement); zero stores on a look
(T); first open store outside fashion (C2).

## Job
A brand's owner, on a phone, between orders, gets from "I want a store" to a store that takes orders, one short step at
a time, and gets a website that looks like the brand without a developer or a theme.

## What is there today (read in the code and on a local production build, 2026-11-23)
| What | Where | Why it matters |
|---|---|---|
| Sign-up is sign-in (email, code), then 5 steps: name, pickup pincode, plan, WhatsApp code (when on), what you sell | `src/app/start/create-shop-form.tsx` | 7 screens, 6 inputs and two codes before a store exists |
| The pickup pincode is required by the definer and by Zod | `drizzle/0065_trial_signup.sql:65`, `src/app/start/actions.ts:44` | The column is already nullable (`src/lib/db/schema.ts:294`); only the definer, Zod and the form require it |
| Only two places read it, both in the console, both handle null | `console/products/[handle]/page.tsx:84`, `console/apps/delivery_zones/page.tsx:50` | Nothing a shopper sees depends on it. The step's line "It sets delivery times now and courier rates later" is not true in code |
| No Settings field shows or edits it; "add the city in Settings" points nowhere | `create-shop-form.tsx:141` | "Move it to Settings" needs a small new block; it has no home today |
| The partner's New store form asks it too | `(partner)/partner/(workspace)/new/actions.ts:18`, `drizzle/0129:519` | Same change there |
| Home's checklist is 5 derived steps, each a link to a full page | `src/domains/setup/checklist.ts`, `console/_components/checklist.tsx` | Every step leaves Home; none is marked next |
| "Add your first product" links to the empty Products list | `checklist.ts:47` | One extra screen before the form |
| "Business details" checks legal name + grievance officer, across two pages; the save also demands a state; required fields read "(optional)" | `checklist.ts:52-53`, `src/domains/settings/sections.ts:305,333` | The same row leads to a different page on the second visit |
| "How shoppers pay" is done from the start (Pay on delivery on, ₹3,000) | `schema.ts:257-259` | A step that never asks anything |
| Setup has no look or website step; a new store renders Classic from its accent and font with no row | `src/domains/themes/resolve.ts:133-147` | Removing the theme gallery from a new store's path changes no data |
| Sell keys: 9, set once at sign-up, never editable | `src/domains/catalogue/sell-keys.ts:2`, `schema.ts:102` | `label.ts:19` says Settings changes it; nothing does |
| Category logic: about 8 `sells.some(...)` checks, fashion word lists, 4:5 photos, apparel-only taxonomy | § Categories | No registry to extend |
| Themes: 6 themes, 14 versions, about 6,400 non-test lines, 5 tables, 7 e2e flows, 32 test files, two size limits (customizer at 204.2 of 208 kB) | `src/domains/themes`, `(lookeditor)`, `console/look` | The cost of keeping them |
| Studio: the workbench is fixtures; no agent runtime, no hosting, no fleet, no placements, one starter (`kit/starter`) | `docs/plans/2026-11-12-studio-build.md`, `docs/research/2026-11-22-studio-agent-spike.md` | Nothing can generate or publish a website today |
| Credits and Studio's tables are keyed on a partner | `drizzle/0163`, ADR-0020 § 5 | An owner cannot hold a session or credits as designed |

## Research (current sources only; a date marked "index" was read from a search copy, the page would not open here)
- **Shopify** (Winter '26 Edition, 2025-12-10, page read): skippable sign-up questions; a generated store before an
  account; Sidekick's edits wait on a "Store changes" card. **Taken:** skippable questions, the store drawn while you
  answer, review before live. **Skipped:** a day-one advice feed.
- **Razorpay** (docs, describes the 2026-01-01 CKYC rule): account first, KYC later, status in words. **Taken:** Pay on
  delivery works at once; Razorpay runs beside setup. **Skipped:** copying its activation form.
- **Stripe** (Sessions 2026, index): collect only what is due now; prefill what is known. **Taken:** ask a fact once,
  where it is first used (the PIN code, the plan).
- **Linear**: one question a screen; setup tasks are real objects. No current dated source found; unverified.
  **Taken:** one thing at a time; each step leaves a real product.
- **Lovable, Durable, Wix Harmony, Hostinger** (2026, index): a site from two or three answers; a plan step that
  changes nothing; credits kept after undo (Hostinger). **Taken:** a plan and its price before anything is spent; Undo
  returns credits. **Skipped:** a blank prompt as the start.
- **Benchmarks** (Produktly, 464 companies, updated 2026-08-13, index): 1–2 step flows finish at 73%, 9+ at 8%;
  self-started 69% against forced 23%. Userpilot 2025 (index): setup checklists finish at 19.2%. **Taken:** three
  sign-up steps; every setup step started by the owner and short.
- **Waiting on an agent** (uxdesign.cc, May 2026, index): named, streamed progress and a stop control.
- **Not found:** any current study on celebration effects, sign-up field counts, or popups against pages. NN/g's
  overlay (2022) and wizard (2017) guidance is older than 12 months. So the opening moment stays one short screen and
  the popup rule below is ours, to be measured.
- **Code:** `Dialog` (`src/components/ui/dialog.tsx`, a sheet under 768 px), `Steps`, `LongJob`, `Toast`,
  `animate-step-forward/back`, `animate-draw-tick`, `animate-going-sweep` already exist; nothing new is needed for motion.

## Design

### O1 · Sign-up (mockup § 1)
1. **Brand name.** The address is derived and checked as today. "Change address" opens a popup. The name is held in the
   browser (sessionStorage) until the person is signed in; the address is checked again on the server at creation.
   Before sign-in the availability check is rate-limited by IP (today it is by user).
2. **Email, then the 6-digit code** on one screen, using `SignInFlow`'s existing actions. A signed-in person skips it.
3. **What you sell.** One tap or none; picks category packs (C1). Until C1 ships the nine existing keys show.
4. **WhatsApp code** stays a fourth step only while `signupCodeOn()` (the trial check), unchanged.
5. **Created.** `animate-going-sweep` once, then `/console` with the first setup step in focus.
- **Leaves sign-up:** the pickup pincode (to Settings › Store, § O2); the plan (to "Open your store"; `createShop`
  keeps its `growth` default, and the plan is set when the store opens).
- **Words:** "store" throughout (the page says "shop" today).
- **States:** address taken, too short, reserved; wrong or expired code; resend after 60 s; already has a store; rate
  limited; no connection; reduced motion (fade only); phone (the preview is a strip above the question).

### O2 · Setup (mockup § 2)
- Home's card leads with **the next step only** (pictogram, title, one button) over the full list of steps, each
  derived as today from `setupSteps` (nothing stores "done"). Any step can be opened in any order.
- **Five steps:** first product · business details · how shoppers pay (done from the start) · website · open.
- **Setup popups** (`Dialog`; the sheet on a phone), one job each, never stacked, saved at once:
  - *Add your first product*: photo, name, price, sizes from the pack. Creates an Active product through the existing
    product save. "Add more details" opens the editor with what was typed.
  - *Business details*: view 1 legal name, GSTIN, state; view 2 the grievance officer, prefilled with the owner's
    name, phone and email. Writes the same settings sections as the pages.
  - *How shoppers pay*: Pay on delivery switch and limit; Razorpay stays a button to its own page.
- **Open your store**: the plan (radio cards, Growth preselected), the trial line with its charge date, then the
  existing "store is open" moment with Copy link and Share on WhatsApp.
- **Pickup address** is not a setup step. A new block in Settings › Store (PIN code, city and state derived, address,
  courier phone) holds it; Delivery Zones and shipping ask for it in the same popup when they first need it.
- **The rule this adds** (to `frata-design-language` § Feedback 4 on approval): today a popup only confirms what loses
  work, money or stock. A **setup popup** is a second kind: one short job of up to five fields that saves at once. A
  job with a test step, a long form or many items stays a page.
- **Motion**, all from the approved set (§ Motion 22–25a): popups 200 ms, sheets 320 ms on the spring, the tick drawn
  in 320 ms, the next step in 16 px over 200 ms, the ring 320 ms. Opacity and transform only. No confetti.
- **States:** new; part done; ready; open (the card can be hidden); a refused save (the popup's error slot); Staff
  (list without actions); support visit (read only); a partner-built store before handover (the partner's steps show
  done by them); phone.
- **Theme stage 1 ships with O2:** the menu shows Look only to a store that has a look revision; a new store's
  built-in look takes its colour and type from Brand. No theme code changes.

### W1 · Website from a starter (mockup § 3; its own spec after Studio V2a)
Pick one of three Frrata starters, set Brand (colour, type, logo: the existing Brand record), build (about 2 minutes,
named steps, "Carry on with setup"), ready (live when the store opens). No agent turn, no charge. Words, banners, menus
and pages stay in Content. Needs: Frrata hosting and New site (V2a), an owner-facing "New website", placements (V2a·7),
two more starters.

### W2 · Ask for a change (mockup § 3; its own spec after Studio V3b)
The agent for owners, in the console's Website page: a sentence in, a plan and its price out, Apply, Undo returns the
credits. Opens only when all five bars are measured:
1. the 20-task proof passes at 90% or more (Studio spec § 9);
2. five partners have used the builder for two weeks with no site slower or less accessible than its starter;
3. a small change has a median of 4 credits or fewer and a preview in 120 s or less;
4. 30 days of measured hosting cost per site sit inside the plan's allowance;
5. an owner step-up and a store-side credit ledger exist and have passed `tenancy-auditor` and `security-reviewer`.
The partner workbench stays the partner's tool. An owner's turn reads as `frata_builder` exactly as a partner's does.

### T · Themes end (four stages)
| Stage | When | What |
|---|---|---|
| 1 Stop offering | with O2 | New stores never meet the theme gallery |
| 2 Starter first | with W1 | Setup's Website step makes a code website |
| 3 Move the stores with a look | after W1 | By hand, with each owner, while the count is 4: settings → Brand, home sections → placements. No mapper is built |
| 4 Delete | after 3 | Themes, the customizer, Theme Studio, their 5 tables, 7 flows, two size limits. Content keeps the page forms it imports from the customizer (`console/content/_components/pages.tsx:16-18`), moved first |

**Options weighed:** keep themes for owners with no partner (two renderers for good; contradicts ADR-0014); retire now
with websites only through partners (a new owner would have no store to open; one partner is signed up); retire in
stages, starter first (recommended).

### C1–C3 · Category packs (mockup § Categories; each its own spec)
- **C1 Packs:** one registry (the shape of `src/domains/modules/registry.ts`) replaces `SELL_KEYS` and its CHECK,
  `STARTING`, `presetsFor`, `KINDS`, `labelAsked`, the policy `condition` and `sampleSetFor`. A pack gives: options and
  starting values, typed product fields (text, number with unit, date, choice), the declarations a product needs to go
  Active, HSN presets, the store's words ("product"/"piece", no model line) and photo ratio, shipping flags. Wave 0
  moves today's behaviour into packs with tests pinned first; a store changes what it sells in Settings › Store. The
  Storefront API grows optional typed fields (`category`, `attributes[]`, `declarations`), additive.
- **C2 Wave 1:** home and living (not furniture), handicrafts and art, stationery and books. No licence number.
- **C3 Wave 2:** packaged food, supplements, toys and baby, electronics accessories: a licence or mark number, batch
  and dates, shipping limits.
- **Later:** furniture, pet food, gold and silver jewellery (quality orders, per-piece hallmark ids, disputed rates).

## Phases
| Phase | A store owner can… | Depends on | Measure |
|---|---|---|---|
| O1 Sign-up | create a store in 3 steps | calls 1–3 | median `/start` → Home under 60 s |
| O2 Setup | go from empty to open, one step at a time | call 4 | share of new stores open within a day |
| C1 Packs | see fields and words that fit; change what they sell | calls 10, 11 | no fashion word on a store outside fashion |
| C2 Wave 1 | sell home, handicrafts, stationery | C1, a CA's read | first open store outside fashion |
| W1 Website from a starter | get a code website, free, in setup | Studio V2a, placements, call 7 | share of new stores on a code website |
| T Themes end | (Frrata) move 4 stores, delete themes | W1, call 6 | zero stores on a look |
| C3 Wave 2 | sell food, supplements, toys, electronics accessories | C1, a legal read | licence shown on every product that needs one |
| W2 Ask for a change | ask the agent, see the price, apply, undo | Studio V3a/V3b, the five bars, call 8 | median credits and seconds per change |

## Design review (O1 and O2; later phases are reviewed in their own specs)
- **UI/UX** — O1: one job, "create my store"; the reader is a brand's owner on a phone, on the brand surface (`/start`
  keeps rule 42's frame). O2: one job, "the next step"; console, Neel. States are listed per phase above. Norman:
  the next step is the signifier; popups constrain to one job; every save is followed by a toast and a drawn tick;
  nothing typed is lost on a refusal; "Not now" is always safe. Keyboard: Enter submits a step, Esc and Back close a
  popup, focus returns to the opener. Built from `Dialog`, `Steps`, `Button`, `FIELD`, `Switch`, `Toast`, `PictoTile`.
- **Tenancy** — No new table in O1 or O2. O1 changes `app_create_shop` (a new version without `p_pickup`; revoke and
  grant as `0065:103-107`) and `app_partner_create_shop`. The tenant id still comes only from `requireMember`. The
  pre-sign-in address check reads only "is this slug free" (as today, already cross-tenant by nature, through
  `slugAvailable`). The pickup address is new columns on `shop_settings` (tenant-scoped, existing RLS). Run
  `tenancy-auditor` on the O1 plan.
- **Modularity** — `src/domains/signup` (slug, unchanged), `src/domains/setup/checklist.ts` (steps reordered; no
  pickup), popups in `console/_components/setup/`, saves reuse the existing actions' `*In(tx)` forms. No new engine.
- **SSOT / DRY** — Setup steps stay derived. The popups write the same rows as the Settings pages through the same
  validators (`sections.ts`); no second form schema. The plan lives in `tenant_plans` only, set at open. The brand
  name before sign-in lives in sessionStorage only and is never trusted: the server re-validates.
- **YAGNI** — Not built: a store generated before sign-up; Instagram import (Meta's API offers none; index
  2026-04-22); a tour, coach marks or a chat helper; confetti; Google sign-in (signal: owner asks); a theme-to-code
  mapper (4 stores); saving sign-up answers on the server before the account exists.
- **KISS** — O1 is the existing form with two steps removed, one moved in front of sign-in, and a preview beside it.
  O2 is the existing checklist with a focus panel and three `Dialog`s over existing saves. No new dependency or table.
- **Scalability** — Nothing grows with tenants. The pre-sign-in address check is one indexed lookup, rate-limited by IP
  (/64 for IPv6), failing closed.
- **Performance** — (a) Home runs the same statements as today (setup facts in one `withTenant`); the popups are
  loaded when first opened (`next/dynamic`), so Home's first-load JS does not grow. `/start`: the preview is CSS and
  about 1 kB of markup; budget: `/start` first-load JS no higher than today. (b) No new query on orders, lines or
  variants. (c)–(e) no cached entry changes; creating a store calls `refreshHosts` as today. (g) nothing new preloaded.
- **Reliability** — No new outbound call. The email code and the WhatsApp code are attempt rows as today (ADR-0008).
  A failed creation says "We could not create your store. Nothing was saved." and keeps every answer.
- **Security** — `checkAddress` before sign-in: anonymous, Zod-capped slug, reply is one of four states, limit by IP
  failing closed (someone could be enumerating names; the names are public addresses anyway). `createMyShop`: unchanged
  tuple (a signed-in person with a verified email), `pickup` removed from its input. Setup popups call the existing
  actions with their existing tuples (`shop.manage` and the settings capabilities); no new action. The quick product
  popup uses the product save's own checks (a photo, a price). sessionStorage holds a brand name only, no PII.
- **Motion and visuals** — As § O2 Motion; one pictogram per focus step from `PICTOGRAMS` (store, build, shield plus
  two new ones drawn to the same rule: product, payments). Reduced motion: everything fades in 120 ms.
- **Unit economics** — O1 and O2 change no price. Moving the plan choice to opening changes when a plan is picked, not
  what is charged (the trial already counts from opening). W1 (hosting inside the plan) and W2 (credits on the store's
  invoice) change what Frrata pays and are reviewed in their own specs; `unit-economics-reviewer` ran on this roadmap.
- **Theme blocks** — None. Stage 1 hides a menu row; no block, token or version changes.
- **Storefront API** — O1 and O2: no change. C1 adds optional fields to a released version (it only grows); its own
  spec runs `api-contract-reviewer`.
- **Blast radius** — `e2e/flows/63-signup.mjs` (reads `getByLabel('Pincode')`), `90-ux.mjs:73` and `:365-377`,
  `91-storefront-api.mjs:209-232`, `40-partners.mjs`; `checklist.test.ts`; the partner New store form; Admin's
  merchant view if it shows the pincode; `routeAfterSignIn` (unchanged: no store → `/start`).

### Stress test
| Severity | What | Where | Fix |
|---|---|---|---|
| High | A popup "Add product" that makes an Active product must pass the same rules as the editor (photo, price on every size, a size chart if sized, HSN if the store charges GST) | `src/domains/catalogue/product-form.ts:180-188` | The popup saves a draft and makes it Active only if `canActivate` passes; else it says what is missing and offers "Add more details". The step is done only by an Active product, as today |
| High | Choosing the plan at opening must not let a store open with no plan row | `openShop`, `tenant_plans` | `createShop` keeps writing the default plan at creation; the open popup changes it in the same transaction as opening |
| Medium | A name typed before sign-in can be taken by the time the code is entered | `slugAvailable` | Checked again at creation (as today: "Someone just took that address"), returning to step 1 with the name kept |
| Medium | "Business details" done in the popup must mean what the pages mean | `sections.ts:305,333` | The popup calls the pages' validators; the state is asked because the save demands it |
| Medium | Sign-in by the emailed link opens a new tab without the typed name | `/auth/callback` | The link lands on `/start`; if sessionStorage is empty the name step shows again, one field |
| Low | The Delivery Zones header shows "From 452009" from the old column | `delivery_zones/page.tsx:50` | Reads the new pickup address block; hidden when empty, as today |

## Out of scope (and the signal that brings each back)
- Google or phone sign-in: three owners ask, or sign-up completion under 60%.
- A store drawn before any sign-up at all (from the home page): after O1's completion is measured.
- Products imported from Instagram: Meta ships an import endpoint.
- The agent for owners before the five bars: never; the bars are the signal.
- A mapper from theme settings to code: more than 20 stores on a look at stage 3.
- Furniture, pet food, hallmarked jewellery: three brands ask and a lawyer has read the pack.

## Facts used
| Fact | Source | Date |
|---|---|---|
| 7 stores, 1 internal, 2 open, 4 with a published look, 1 partner | production, aggregate counts only | 2026-11-23 |
| 16 inputs, about 12 screens, 20+ taps from `/start` to open | local production build (e2e stack) and code | 2026-11-23 |
| A page turn about 19 credits, a small edit 3–4, an 8-page site about 251; ₹19 a credit | `docs/specs/2026-11-16-studio-agent.md` § 8 (estimates, none measured) | 2026-11-16 |
| Plans ₹1,499 + 2%, ₹4,999 + 1%, ₹14,999 + 0.5% | `frata-unit-economics` | 2026-11-16 |
| Shopify Winter '26: pre-signup generation, Sidekick review card | shopify.com/news/winter-26-edition-merchant | 2025-12-10 |
| Completion by step count; self-started against forced | Produktly benchmarks (index, not opened) | 2026-08-13 |
| Indian category rules (FSSAI on listings, BIS/CRS, toy and furniture quality orders, GST by product) | search summaries only; pib.gov.in, cbic-gst.gov.in and others would not open from this session | **unverified**; recheck in C2 and C3 with the hosts allowed, then a CA or lawyer |
| Possible errors in `src/domains/tax/rates.ts`: 3304 and 3307 are flat 18%, but talcum, face powder and shaving cream are reported at 5% from 22 Sep 2025 | search summaries (WB Commercial Taxes slide; The Week 2025-09-04) | **unverified**; for the CA who signs the table (`caSigned: false`) |

## Owner calls (each with a recommendation; mockup § Your calls)
1. Brand name before the email — yes.
2. The plan is chosen at "Open your store" — yes.
3. The pickup PIN code leaves sign-up, setup and the partner's New store form; it becomes the pickup address in
   Settings › Store — yes.
4. Setup popups, widening Feedback rule 4 — yes.
5. Retire themes completely, in four stages — yes.
6. Move the stores with a look by hand, V5 brought forward — yes.
7. Owners get a website from a starter at no charge, once hosting is measured — yes.
8. "Ask for a change" for owners after the five bars; credits on the store's invoice; Undo returns them — yes, later.
9. Three Frrata starters first (Quiet, Story, Mela: working names) — yes.
10. Category packs and the wave order — yes.
11. A store can change what it sells in Settings › Store — yes.

## Reviews
Pending: `architecture-reviewer`, `security-reviewer`, `unit-economics-reviewer` on this spec; `words-reviewer` on the mockup.
