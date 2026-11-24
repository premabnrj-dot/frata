# Merchant onboarding: sign-up, setup, the website, the end of themes, more categories
Status: active (owner, 2026-11-23: "approve all 11 calls, go with your recommendations. for now defer starter and look/theme retirement work. Keep categories work modular and scalable clients should be able to update categories later on as well"; four reviews folded in, § Reviews; nothing built) · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/PzNfST7bdFvLiQsxy11mQT
(`docs/mockups/2026-11-23-merchant-onboarding.html`) · Approved: owner, 2026-11-23 (all eleven calls as recommended)
Plans: `docs/plans/2026-11-23-o1-signup.md`, `docs/plans/2026-11-23-o2a-setup-card.md`, `docs/plans/2026-11-23-o2b-plan-at-opening.md` (replacing the draft `docs/plans/2026-11-23-o2-setup.md`), `docs/plans/2026-11-23-c1-category-packs.md`.
**Deferred by the owner, 2026-11-23:** W1 (website from a starter), W2 (Ask for a change) and T (themes end). Look stays as it is. Building now: O1, O2, C1.
Builds on: ADR-0014 (themes retire; partners get the builder first), ADR-0017 (hosting), ADR-0019 (one address),
ADR-0020 (Studio's agent), `docs/plans/2026-11-12-studio-build.md`, `docs/plans/2026-11-16-execution.md`,
`docs/specs/2026-11-08-trials.md` (rule 3 is replaced by call 2, if approved),
`docs/plans/2026-11-09-gst-core-and-categories.md` (§ 4 phase 6, category packs).

The owner, 2026-11-23: "plan more interactive, ux friendly onboarding, shop setup flow, mockups, redesigning, more
subtle, motion graphic flowy onboarding flow for merchants"; "shall merchants also switch to the studio to build their
own website … Should we retire theme/look system completely?"; "how can we extend the storefront to more categories";
"PIN code isn't required for the signup, move it to settings/address"; "there is signup flow and then there is setup
flow. plan both well"; "use popup/modals where they make better sense"; "One thing at a time, smooth transitions".

This is a roadmap spec (frata-planning rule 1). It names eight phases. O1 and O2 are specified here and get their plans
once their calls are answered; every later phase gets its own spec and mockup before it is built.

## In short
1. **Sign-up goes from 5 steps to 3**: brand name (address derived), email and code, what you sell. The PIN code
   leaves in O1; the plan question leaves in O2. The store draws itself beside the questions.
2. **Setup shows one step at a time** on Home. Three short steps open in a popup (a sheet on a phone). Measured today:
   16 things typed or picked over about 12 screens before a store can open; proposed 13 over 5.
3. **Retire themes completely, in four stages.** 7 stores exist, 4 have a published look, 2 are open (production,
   2026-11-23), so moving them is cheap now. But nothing can build or host a code website today, and Look is the only
   place a store sets its colour and font, so Look stays until W1.
4. **Store owners get a website builder, not the partner workbench**: first a starter with their Brand and Content, free
   and with no agent turn; later "Ask for a change", priced before it runs.
5. **Categories become packs**: one definition per category carrying options, fields, tax codes, what the law asks on
   the page, words and photo shape. Wave 1 needs no licence number; wave 2 does.

## Goal
Ranked problems 5 (a premium storefront, built as code), 3 (catalogue operations) and 4 (mobile conversion, through a
faster first store). Measures: median "/start → created" under 60 s (finishers only; O1 adds the record of arrival at `/start`, nothing
records it today; a completion rate needs an arrivals count that O1 does not record); share of new stores open within a day of sign-up; first Active product within 15 minutes;
zero stores on a look (T); first open store outside fashion (C2).

## Job
A brand's owner, on a phone, between orders, gets from "I want a store" to a store that takes orders, one short step at
a time, and gets a website that looks like the brand without a developer or a theme.

## What is there today (read in the code and on a local production build, 2026-11-23)
| What | Where | Why it matters |
|---|---|---|
| Sign-up is sign-in (email, code), then 5 steps: name, pickup pincode, plan, WhatsApp code (when on), what you sell | `src/app/start/create-shop-form.tsx` | 7 screens, 6 inputs and two codes before a store exists |
| The pickup pincode is required by the definer and by Zod | `drizzle/0065_trial_signup.sql:65`, `src/app/start/actions.ts:44` | The column is already nullable (`src/lib/db/schema.ts:294`); only the definer, Zod and the form require it |
| Only two places read it, both in the console, both handle null; Admin does not read it | `console/products/[handle]/page.tsx:84`, `console/apps/delivery_zones/page.tsx:50` | Nothing a shopper sees depends on it. The step's line "It sets delivery times now and courier rates later" is not true in code |
| No Settings field shows or edits it | `create-shop-form.tsx:141` ("add the city in Settings") | "Move it to Settings" needs a field; it has no home today |
| The partner's New store form asks it too | `(partner)/partner/(workspace)/new/actions.ts:18`, `drizzle/0129:485-541` | Same change there |
| The plan is picked at sign-up; the trial runs on it (trials rule 3, owner-approved) | `docs/specs/2026-11-08-trials.md`, `drizzle/0065` | Call 2 replaces an approved rule |
| A plan change holds an upgrade until the trial ends and a downgrade until the 1st | `drizzle/0058_plan_change.sql:14-49`, `0063_trials_access.sql:221-250` | It cannot serve "choose the plan at opening" |
| A store refused a trial has its plan row from creation, and the billing run has no "opened" condition (as read; to confirm in the O2 plan) | `drizzle/0065:83-85`, `0066_trial_partners.sql:84-89` | A never-opened store could accrue a plan nobody chose |
| Home's checklist is 5 derived steps, each a link to a full page | `src/domains/setup/checklist.ts`, `console/_components/checklist.tsx` | Every step leaves Home; none is marked next |
| "Add your first product" links to the empty Products list; creating an Active product is four actions | `checklist.ts:47`, `products/actions.ts:43,77,192,241` | Extra screens before the form |
| A product goes Active only through `readiness()` and `setStatusIn` (photo, a price on every size, stock or pre-order, a size chart if sized, a label for beauty and wellness, HSN if the store charges GST) | `src/domains/catalogue/product-form.ts:173-188`, `src/lib/catalogue/status.ts` | The popup must use this rule, not a copy |
| "Business details" checks legal name + grievance officer, across two pages; the save parses the whole section with a `version`; required fields read "(optional)" | `checklist.ts:52-53`, `src/domains/settings/sections.ts:216-311`, `settings/actions.ts:64-67` | A popup that sends a few fields would blank the others |
| "How shoppers pay" is done from the start (Pay on delivery on, ₹3,000) | `schema.ts:257-259` | A step that never asks anything |
| Look is the only writer of a store's accent and font; Brand opens only for a store with a code site | `console/look/actions.ts`, `src/domains/themes/resolve.ts:133-141`, `console/brand/page.tsx:36`, `console/layout.tsx:134` | Look cannot be hidden before W1 |
| Sell keys: 9, set once at sign-up, never editable | `src/domains/catalogue/sell-keys.ts:2`, `schema.ts:224,321` | `label.ts:19` says Settings changes it; nothing does |
| Category logic: about 8 `sells.some(...)` checks, fashion word lists, 4:5 photos, apparel-only taxonomy | § C1 | No registry to extend |
| Themes: 6 themes, 14 versions, about 6,400 non-test lines, 5 tables, 7 e2e flows, 32 test files, two size limits (customizer at 204.2 of 208 kB) | `src/domains/themes`, `(lookeditor)`, `console/look` | The cost of keeping them |
| Studio: the workbench is fixtures; no agent runtime, no hosting, no fleet, no placements, one starter (`kit/starter`) | `docs/plans/2026-11-12-studio-build.md`, `docs/research/2026-11-22-studio-agent-spike.md` | Nothing can generate or publish a website today |
| Credits and Studio's tables are keyed on a partner; owners have no step-up | `drizzle/0163`, ADR-0020 § 5, `src/lib/auth/session.ts` | An owner cannot hold a session or credits as designed |

## Research (current sources only; a date marked "index" was read from a search copy, the page would not open here)
- **Shopify** (Winter '26 Edition, 2025-12-10, page read): skippable sign-up questions; a generated store before an
  account; Sidekick's edits wait on a "Store changes" card. **Taken:** skippable questions, the store drawn while you
  answer, review before live. **Skipped:** a day-one advice feed.
- **Razorpay** (docs, describes the 2026-01-01 CKYC rule): account first, KYC later, status in words. **Taken:** Pay on
  delivery works at once; Razorpay runs beside setup. **Skipped:** copying its activation form.
- **Stripe** (Sessions 2026, index): collect only what is due now. **Taken:** ask a fact once, where it is first used.
- **Linear**: one question a screen; setup tasks are real objects. No current dated source found; unverified.
- **Lovable, Durable, Wix Harmony, Hostinger** (2026, index): a site from two or three answers; a plan step that
  changes nothing; credits kept after undo (Hostinger). **Taken:** what will change and its price before anything is
  spent. **Skipped:** a blank prompt as the start.
- **Benchmarks** (Produktly, 464 companies, updated 2026-08-13, index): 1–2 step flows finish at 73%, 9+ at 8%;
  self-started 69% against forced 23%. Userpilot 2025 (index): setup checklists finish at 19.2%.
- **Waiting on an agent** (uxdesign.cc, May 2026, index): named, streamed progress and a stop control.
- **Not found:** any current study on celebration effects, sign-up field counts, or popups against pages. NN/g's
  overlay (2022) and wizard (2017) guidance is older than 12 months. The popup rule below is ours, to be measured.
- **Code:** `Dialog` (a sheet under 768 px), `Steps`, `LongJob`, `Toast`, `animate-step-forward/back`,
  `animate-draw-tick`, `animate-going-sweep` exist; no new motion is needed.

## Design

### O1 · Sign-up (mockup § 1)
1. **Brand name.** The address is derived; its shape is checked in the browser. Availability before sign-in is a new
   anonymous action, `checkAddressOpen`, in its own file (named in `check:actions`' `ENTRY_POINTS`): limited per IP
   (IPv6 by /64) and by one global bucket, both failing closed. Over the limit it answers a fifth state, `limited`,
   which shows nothing and lets the person continue, so a shared mobile address never tells a brand its name is gone.
   Creation checks the address again. Settings' rename keeps today's signed-in `checkAddress`.
2. **Email, then the 6-digit code** on one screen, with `SignInFlow`'s existing actions (resend after 60 s). A
   signed-in person skips it. The name is held in sessionStorage only: never in the URL, never in localStorage, no
   `next` parameter on `/auth/callback`. A sign-in by the emailed link in a new tab shows the name step again.
3. **What you sell.** One tap or none. Until C1 ships the nine existing keys show.
4. **WhatsApp code** stays a step only while `signupCodeOn()` (the trial check), unchanged.
5. **Created.** `animate-going-sweep` once (the sign-up's one brand moment, UX rule 26), then `/console`.
- **The PIN code leaves.** A new `app_create_shop_v3` without `p_pickup`, keeping the confirmed-email check, the
  per-uid lock, `has_shop`, the name and slug checks, code consumption, both trial-claim locks and inserts, and the
  audit (sells, plan, trial). v1 (`drizzle/0008`, still granted) and v2 are dropped in the same migration; the new
  function is revoked from public, anon, authenticated, service_role and frata_admin, then granted to `frata_app`. The
  partner definer is recreated the same way with its 0129 grants. Settings › Store gains one field, **Pickup PIN
  code**, on the existing column; Delivery Zones' header opens it in a popup. A full pickup address (street, courier
  phone) waits for shipping, its first reader.
- **The plan step stays in O1** and leaves in O2, in the same release as the "Open your store" chooser (call 2). So O1
  ships four steps for a while.
- **Words:** "store" throughout (the page says "shop" today). Amends `reference/console-catalogue.md:37` ("Sign-up
  asks … pickup pincode").
- **States:** address taken, too short, reserved, limited; wrong or expired code; resend; already has a store; rate
  limited; no connection; reduced motion (fade only); phone (the preview is a strip above the question).

### O2 · Setup (mockup § 2, phase "O2 · four steps")
- Home's card leads with **the next step only** (pictogram, title, one button) over the full list, each step derived
  from `setupSteps` as today (nothing stores "done"). Any step opens in any order.
- **Four steps:** first product · business details · how shoppers pay (done from the start) · open. The Website step
  joins with W1.
- **Setup popups** (`Dialog`; the sheet on a phone), one job each, never stacked:
  - *Add your first product*: photo, name, price, stock, sizes. **One new action** composes the existing
    `writeProducts`, `attachIn` and `setStatusIn` in one `asMember`; it makes the product Active only when
    `readiness()` passes, else it saves a draft and names what is missing with "Add more details". Staff may use it
    (products are `ANY_MEMBER`).
  - *Business details*: view 1 legal name, GST registration (Not registered, Regular, Composition), state, GSTIN when
    registered; view 2 the grievance officer (name and phone typed; the owner's email filled in). It saves through a
    **field-subset parser added to `sections.ts`** that keeps `lockedFor`, `NEEDED_WHEN_OPEN`, `HELD_BY_ZONES` and
    the `version` check, so no field it omits is blanked. Values and version load when the popup opens.
  - *How shoppers pay*: the Pay on delivery switch and limit through the same subset parser (the COD-risk PIN list is
    untouched); Razorpay stays a button to its own page.
- **Open your store**: the plan as radio cards with **Launch preselected**, the trial line from
  `src/domains/plans/trial.ts` with the first charge's amount and date, then the existing "store is open" moment with
  Copy link and Share on WhatsApp. Written by a new definer, **`app_open_plan(code, by)`**: bound to
  `app_current_tenant()`; the caller's own `members` row must be owner or Manager (never the role a support visit
  reports); refused once `tenants.first_opened_at` is set, when a custom price exists, or when Frrata has scheduled a
  change; it replaces the sign-up row with the same `starts_at` (the trial trigger recomputes) and audits from and to.
  After the first opening only `app_change_plan` changes a plan. A support visit opens a store without the plan step.
  A store is created on Launch (partner-built stores already are), and the O2 plan confirms and, if needed, fixes that
  a store is not billed before it first opens. `createMyShop` drops `plan` from its input.
- **The rule this adds** (to `frata-design-language` § Feedback 4 on approval): a **setup popup** is a second kind of
  popup beside the confirm: one short job of up to five fields that saves at once. A job with a test step, a long form
  or many items stays a page.
- **Motion**, from the approved set (§ Motion 22–25a): popups 200 ms, sheets 320 ms on the spring, the next step in
  16 px over 200 ms; the tick and the ring are drawn strokes (`animate-draw-tick`'s existing technique). No confetti.
- **States:** new; part done; ready; open (the card can be hidden); a refused save (the popup's error slot); Staff
  (products only); Accountant (no steps); a support visit (saves are audited as on the pages; no plan step); a store
  handed over (business details read as `Facts` for a partner, PP1); Delivery Zones on (the Pay on delivery limit reads
  "Set in Delivery Zones"); a saved GSTIN that would make live products unbuyable (the page's own warning, in the
  popup); phone.

### W1 · Website from a starter (mockup § 3; its own spec)
Pick one of three Frrata starters, set Brand (colour, font, logo), build (about 2 minutes, named steps, "Back to
setup"), ready (live when the store opens). No agent turn, no charge. **Depends on:** Studio V2a (hosting, New site,
placements V2a·7), P3 and P5 (one address, ADR-0019 point 5), V2c·3, decision 18, two more starters, and the hosting
gate: **the median site costs ₹167 / ₹500 / ₹1,500 a month or less on Launch / Growth / Scale over 30 days, all-in
(first and repeat views, router, Blob, builds), with a theme store measured beside it.** At ADR-0017's guesses (₹294 /
₹2,937 / ₹9,764) it fails on every plan; if Vercel fails, ADR-0017's Cloudflare test runs first. A Content edit must
not trigger a build. Theme stage 2 ships here: Look leaves a new store's menu because Brand now sets colour and font.

### W2 · Ask for a change (mockup § 3; its own spec after Studio V3b)
A sentence in, what will change and its price out, Apply, Undo. ₹20 a credit (the decided price) on the store's
Frrata invoice. **Undo is always free to use. Credits come back in full when Frrata's checks failed; otherwise for one
change a month, within 15 minutes, before shoppers have seen it** (free Undo without a bound falls below 3× once 2.8%
of credits are returned). Plans may include 10 / 40 / 120 credits from the first paid invoice, never in a trial (an
owner call in W2's spec). Opens only when all of these are measured or built:
1. the 20-task proof passes at 90% or more (Studio spec § 9);
2. five partners have used the builder for two weeks with no site slower or less accessible than its starter;
3. a small change has a median of 4 credits or fewer and a preview in 120 s or less;
4. the hosting gate above holds;
5. an owner's turn is as locked as a partner's: a capability row in `CAPABILITIES` (owner only, or Manager by an owner
   call; never Staff, Accountant, a partner or a support visit); an owner step-up, with how recent it must be per
   spend; `app_turn_actor` and `asTurn` extended to an owner with no partner link; the restrictive `app.partner_id`
   policy generalised to a session subject, so owner and partner sessions on one store never read each other's; a
   monthly credit ceiling per store checked in the reserve definer, failing closed; an append-only ledger written by
   definers only; Undo refunds bounded as above; staff- and partner-written content reaching the model only as data;
   Apply limited to ADR-0020 § 6's tools at exact values. `tenancy-auditor` and `security-reviewer` pass.
The partner workbench stays the partner's tool. An owner's turn reads as `frata_builder`, as a partner's does.

### T · Themes end (four stages)
| Stage | When | What |
|---|---|---|
| 1 Freeze | now, already held | No new theme work. Look stays: it is the only writer of a store's colour and font |
| 2 Starter first | with W1 | Setup's Website step makes a code website; new stores never meet the gallery |
| 3 Move the stores with a look | after W1 | By hand, with each owner, while the count is 4: settings → Brand, home sections → placements. No mapper is built |
| 4 Delete | after 3 | Themes, the customizer, Theme Studio, their 5 tables, 7 flows, two size limits. Content's page forms and its links to Look (`content/_components/pages.tsx:16-18`, `menus.tsx:67`, `content/actions.ts:383`) move first |

**Options weighed:** keep themes for owners with no partner (two renderers for good; contradicts ADR-0014); retire now
with websites only through partners (a new owner would have no store to open; one partner is signed up); retire in
stages, starter first (recommended). Removing themes does not lower cost per tenant (the bytes move to the sites
account, which adds a team seat of about ₹2,068 a month); it removes code, flows and two size limits.

### C1–C3 · Category packs (mockup § Categories; each its own spec)
- **C1 Packs:** one registry (the shape of `src/domains/modules/registry.ts`) that the nine keys become, one pack per
  key (not merged: `STARTING` and `presetsFor` differ per key); the DB CHECK is built from the registry's keys and
  widened before the deploy that adds a key. A pack gives: options and starting values, typed product fields (text,
  number with unit, date, choice), the declarations a product needs to go Active, HSN presets and its own rate rules
  (never apparel's price slab by inheritance), the store's words and photo ratio, shipping flags. Wave 0 moves today's
  behaviour into packs with tests pinned first. Changing what a store sells is the owner's or a Manager's (it rewrites
  the returns policy, `src/domains/policies/render.ts:83`, so it sits behind PP1's lock, not `CAN_BUILD`), and re-runs
  `ensureTypes` and the starting HSN. The Storefront API grows optional typed fields, additive.
- **C2 Wave 1:** home and living (not furniture), handicrafts and art, stationery and books. No licence number.
- **C3 Wave 2:** packaged food, supplements, toys and baby, electronics accessories: a licence or mark number, batch
  and dates, shipping limits. Low order values matter here: at ₹400 the fee is ₹8 a delivered order and a COD order's
  expected profit about ₹36 (hypothesis, 2026-11-23); the pack's spec runs `unit-economics-reviewer`.
- **Later:** furniture, pet food, gold and silver jewellery.

## Phases
| Phase | A store owner can… | Depends on | Measure |
|---|---|---|---|
| O1 Sign-up | create a store with the brand name first and no PIN code | calls 1, 3 | median `/start` → Home under 60 s |
| O2 Setup | go from empty to open, one step at a time; choose the plan at opening | calls 2, 4 | share of new stores open within a day |
| C1 Packs | see fields and words that fit; change what they sell | calls 10, 11 | no fashion word on a store outside fashion |
| C2 Wave 1 | sell home, handicrafts, stationery | C1, a CA's read | first open store outside fashion |
| W1 Website from a starter | get a code website, free, in setup | Studio V2a, P3, P5, placements, the hosting gate, call 7 | share of new stores on a code website |
| T Themes end | (Frrata) move 4 stores, delete themes | W1, call 6 | zero stores on a look |
| C3 Wave 2 | sell food, supplements, toys, electronics accessories | C1, a legal read | licence shown on every product that needs one |
| W2 Ask for a change | ask the agent, see the price, apply, undo | Studio V3a/V3b, the five bars, call 8 | median credits and seconds per change |

## Regression net (planning rule 5; in place before O1 and O2 change anything)
- **Isolation proof:** `scripts/verify/tenancy.sql:355-371,1137-1213,2156-2173,3265-3668` assert the definers' exact
  signatures and `pickup_pincode`; they change with the new versions, and `npm run verify:tenancy` runs on both plans.
- **e2e:** `63-signup` (reads `getByLabel('Pincode')`), `90-ux:73,365-377`, `91-storefront-api:209-232`, `40-partners`,
  `62-billing`, `93-owner-only`, `88-neel-settings`, `78-products-pr0`, `79-products-list`, `81-neel`, `47-look`,
  `89-content`, `94-brand`, `12-security`, `87-partner-clients`; the `/console/setup` page.
- **Unit:** `checklist.test.ts`, `slug.test.ts`, `route-after-sign-in.test.ts`; new tests for the subset parser, the
  open-plan rules and the quick-add action's refusal paths, written before the change.
- **New gate work:** `checkAddressOpen` in `check:actions`' entry points.

## Design review (O1 and O2; later phases are reviewed in their own specs)
- **UI/UX** — O1: one job, "create my store"; a brand's owner on a phone, on the brand surface. O2: one job, "the next
  step"; console, Neel. States per phase above. Norman: the next step is the signifier; popups constrain to one job;
  every save is followed by a toast and a drawn tick; nothing typed is lost on a refusal; "Not now" is always safe.
  Keyboard: Enter submits a step, Esc and Back close a popup, focus returns to the opener. Built from `Dialog`, `Steps`,
  `Button`, `FIELD`, `Switch`, `Toast`, `PictoTile`.
- **Tenancy** — No new table. New definers `app_create_shop_v3`, the partner definer and `app_open_plan`, each with its
  revoke and grant in its migration. The tenant id comes only from `requireMember` or `app_current_tenant()`.
  `checkAddressOpen` answers only "is this slug free", which is public by nature (`app_name_check` reveals a store in
  setup exists; accepted with the limits). The Pickup PIN code is the existing tenant-scoped column. `tenancy-auditor`
  runs on both plans.
- **Modularity** — `src/domains/signup` unchanged; `src/domains/setup/checklist.ts` reordered; the subset parser in
  `src/domains/settings/sections.ts`; popups in `console/_components/setup/`; one new product action; one new anonymous
  action. No new engine.
- **SSOT / DRY** — Setup steps stay derived. Popups write the same rows through the same validators. The Active rule
  stays `readiness()` + `setStatusIn`. The plan lives in `tenant_plans` only. The trial line is derived from
  `plans/trial.ts`.
- **YAGNI** — Not built: a store generated before sign-up; Instagram import (Meta's API offers none; index
  2026-04-22); a tour or chat helper; confetti; Google sign-in; a theme-to-code mapper; a pickup address block before
  shipping reads it; server-side saving of sign-up answers before the account exists.
- **KISS** — O1 is the existing form with one step removed, one moved in front of sign-in and a preview beside it. O2
  is the existing checklist with a focus panel, three `Dialog`s, one parser, two actions and one definer.
- **Scalability** — Nothing grows with tenants. `checkAddressOpen` is one indexed lookup plus rate-limit writes (the
  first anonymous database writes on `/start`; `withinLimit` also runs a cleanup delete of old windows on about 1% of
  calls, `rate-limit.ts:223`); its limits are numbers in the O1 plan.
- **Performance** — Home runs today's statements; a popup loads its values and version when it opens (one `withTenant`
  each) and its code with `next/dynamic`, so Home's first-load JS does not grow. `/start`: the preview is CSS and about
  1 kB of markup; its first-load JS stays at or under today's. No new query on orders, lines or variants; no cache entry
  changes; creating a store calls `refreshHosts` as today.
- **Reliability** — No new outbound call. The codes are attempt rows as today (ADR-0008). A failed creation says "We
  could not create your store. Nothing was saved." and keeps every answer.
- **Security** — As § O1 and § O2: the anonymous check fails closed and never lies "taken"; the popups cannot widen
  what a page allows (same tuples, same parser, `version`); the plan at opening is the owner's or a Manager's through
  one definer; support visits write only what they write today, audited, and never choose a plan. sessionStorage holds
  a brand name only. The preview renders the name as text.
- **Motion and visuals** — As § O2 Motion; one pictogram per focus step (store, build, shield, plus product and
  payments drawn to the same rule). Reduced motion: everything fades in 120 ms.
- **Unit economics** — O1 changes no price. O2 preselects Launch (a Launch-sized store on Growth would pay ₹6,011.50 a
  month against ₹3,524.00; a preselected dearer plan is a dark pattern the skill forbids). W1 and W2 as their sections
  say. `unit-economics-reviewer` ran on this roadmap (§ Reviews).
- **Theme blocks** — None. O2 does not touch Look.
- **Storefront API** — O1 and O2: no change. C1 adds optional fields to a released version; `api-contract-reviewer`
  runs on its spec.
- **Blast radius** — § Regression net; the partner New store form; `routeAfterSignIn` (unchanged); trials rule 3.

### Stress test
| Severity | What | Where | Fix (in this spec) |
|---|---|---|---|
| Blocker | Plan-at-open had no writer and contradicted trials rule 3 | `0058`, `0063:221-250`, trials spec | `app_open_plan`; moved to O2; rule 3 replaced by call 2 |
| Blocker | Hiding Look left a new store unable to set colour or font | `look/actions.ts`, `brand/page.tsx:36` | Look stays until W1 |
| High | The quick-add popup could never make an Active product (stock 0); `canActivate` does not exist | `product-form.ts:173-188`, `status.ts` | Stock field; one action over `readiness()` and `setStatusIn` |
| High | A popup sending a few fields would blank the rest of a settings section | `sections.ts:216-233` | A field-subset parser with `version` |
| High | A support visit could choose a paid plan through "open" | `shop-actions.ts:37-41` | The definer checks the caller's own member row |
| Medium | The anonymous address check would fail open and answer "taken" | `rate-limit.ts`, `start/actions.ts:30` | `checkAddressOpen`, fail closed, a `limited` state |
| Medium | A name typed before sign-in can be taken meanwhile | `slugAvailable` | Checked again at creation, back to step 1 with the name kept |
| Medium | A never-opened store may be billed from creation | `0066:84-89` (as read) | Confirm in the O2 plan; no billing before first opening |
| Low | "Home runs the same statements" | — | True for Home; each popup adds one read when opened |

## Out of scope (and the signal that brings each back)
- Google or phone sign-in: three owners ask, or sign-up completion under 60% (completion needs an arrivals count that
  O1 does not record; O1 measures "/start → created" for finishers only).
- A store drawn before any sign-up, from the home page: after sign-up completion is measured (it needs an arrivals
  count that O1 does not record).
- Products imported from Instagram: Meta ships an import endpoint.
- A pickup address block: shipping (Ship S·1) reads it.
- The agent for owners before the five bars: the bars are the signal.
- A mapper from theme settings to code: more than 20 stores on a look at stage 3.
- Furniture, pet food, hallmarked jewellery: three brands ask and a lawyer has read the pack.

## Facts used
| Fact | Source | Date |
|---|---|---|
| 7 stores, 1 internal, 2 open, 4 with a published look, 1 partner | production, aggregate counts only | 2026-11-23 |
| 16 inputs, about 12 screens, 20+ taps from `/start` to open | local production build (e2e stack) and code | 2026-11-23 |
| A page turn about 19 credits, a small edit 3–4, an 8-page site about 251 | `docs/specs/2026-11-16-studio-agent.md` § 8 (estimates, none measured) | 2026-11-16 |
| A credit costs ₹6.33 and sells at ₹19.99–20.00; plans ₹1,499 + 2%, ₹4,999 + 1%, ₹14,999 + 0.5% | `frata-unit-economics` (decided) | 2026-11-22 |
| Hosting guesses ₹294 / ₹2,937 / ₹9,764 a site a month; kill lines ₹167 / ₹500 / ₹1,500 | ADR-0017 (hypothesis); `unit-economics-reviewer` | 2026-11-15; 2026-11-23 |
| Shopify Winter '26: pre-signup generation, Sidekick review card | shopify.com/news/winter-26-edition-merchant | 2025-12-10 |
| Completion by step count; self-started against forced | Produktly benchmarks (index, not opened) | 2026-08-13 |
| Indian category rules (FSSAI on listings, BIS/CRS, toy and furniture quality control orders, GST by product) | search summaries only; pib.gov.in, cbic-gst.gov.in and others would not open from this session | **unverified**; recheck in C2 and C3 with the hosts allowed, then a CA or lawyer |
| Possible errors in `src/domains/tax/rates.ts`: 3304 and 3307 are flat 18%, but talcum, face powder and shaving cream are reported at 5% from 22 Sep 2025 | search summaries | **unverified**; for the CA who signs the table (`caSigned: false`) |

## Owner calls (each with a recommendation; mockup § Your calls)
1. Brand name before the email — yes.
2. The plan is chosen at "Open your store", Launch preselected; replaces trials rule 3; a store is not billed before it
   first opens — yes, in O2. If no, the plan stays as a fourth sign-up step.
3. The pickup PIN code leaves sign-up, setup and the partner's New store form; it becomes a field in Settings › Store;
   a full pickup address waits for shipping — yes.
4. Setup popups, widening Feedback rule 4 — yes.
5. Retire themes completely, in four stages; Look stays until W1 — yes.
6. Move the stores with a look by hand, V5 brought forward — yes.
7. Owners get a website from a starter at no charge once the hosting gate holds — yes.
8. "Ask for a change" for owners after the five bars; ₹20 a credit on the store's invoice; bounded Undo — yes, later.
9. Three Frrata starters first (Quiet, Story, Mela: working names) — yes.
10. Category packs and the wave order — yes.
11. A store's owner or Manager can change what it sells in Settings › Store — yes.

## Reviews (2026-11-23; every finding fixed in this spec unless listed as open)
- **architecture-reviewer** — CHANGES NEEDED: 3 blockers, 7 major, fixed above (plan-at-open's definer and phase;
  Look until W1; quick-add over `readiness()`; the subset parser; four steps in O2; the anonymous check; W1's
  dependencies; one pack per key; the regression net).
- **security-reviewer** — fix before building: 1 high, 4 medium, 4 low, fixed above (`app_open_plan`'s checks;
  `checkAddressOpen` failing closed; no blanked fields; support visits; W2's bar 5; the definer versions' grants; the
  PIN code as the existing column; no `next` parameter).
- **unit-economics-reviewer** — helps the merchant (parity with Shopify's free themes), hurts Frrata as first drafted:
  fixed above (the hosting gate's rupee limits; ₹20 a credit and bounded Undo; Launch preselected; pack rate rules).
  Open: measure the CI minutes of the 7 theme flows; 30 days of Vercel usage for the pilot site beside a theme store.
- **words-reviewer** (mockup) — not ready, then fixed: button names, the first charge's amount, the PIN code error, two
  meanings of "plan", "piece".
- Not yet run, for each phase's plan: `tenancy-auditor` (the three definers), `speed-reviewer` (Home and `/start`),
  `design-system-reviewer` and `mockup-parity-reviewer` at build.
