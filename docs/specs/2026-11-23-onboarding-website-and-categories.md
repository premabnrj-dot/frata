# Merchant onboarding, the merchant's website path, and more categories
Status: draft · Date: 2026-11-23 · Mockup: pending (docs/mockups/2026-11-23-onboarding-flow.html) · Approved: pending

Three questions from the owner (2026-11-23), answered in one spec because they share one thing: **what a new merchant meets
before the first sale, and what the store behind it is made of.**

1. Redesign onboarding and shop setup: interactive, friendly, subtle motion, flowy.
2. Should merchants build their own website in Studio? Should the theme/look system retire completely? If so, what does
   a merchant's onboarding to a storefront look like?
3. The product is fashion-first. How do we extend the storefront to more categories?

## In short

- **Onboarding (build now, no dependency).** Today a new merchant types a name, a PIN code, a plan and a category, then lands on
  a flat five-row checklist on Home. No look, no brand, no first-product guidance, no instrumentation of the 15-minute
  target. The redesign is **one question at a time** (owner, 2026-11-23) over the *same derived checklist*: name and
  address, what you sell, brand, first product, how shoppers pay, what the law needs to open. A small store sketch builds
  as each answer lands. The pickup PIN code is not asked; it stays in Settings (owner, 2026-11-23). It reuses the motion
  primitives that exist. It needs no hosting, no Studio and no theme work.
- **Studio for merchants: not as the default, not yet.** Studio is partner-only by schema, ADR and code. No owner or Manager
  entry is planned in any approved spec. No live agent turn has run. Hosting (V2) does not exist. At partner pricing a page
  turn is about ₹380 and an 8-page site about ₹5,000 (hypotheses, never measured). A merchant with no developer cannot judge
  code. So the answer is **a ladder**: a Starter website made from data the merchant already edits (free), then a metered,
  guided "Ask Frrata" for structure changes once the gates below pass, then a partner for anything bigger.
- **Retire themes: yes for the catalogue and customizer, by gate and not by date; keep one renderer until hosting is
  priced.** ADR-0017's own guess puts hosted code at ₹294 / ₹2,937 / ₹9,764 a month per shop, over its kill line on all
  three plans (1.8×, 5.9×, 6.5×; unit-economics review, 2026-11-23). Theme shops already run on the console's Vercel
  deployment at the same per-view rates, so the Starter renderer is not "free". Its marginal cost per view equals hosted
  code's. What it avoids is a deployment, a domain and a fleet per shop. Nothing here is measured: the cheapest test is
  30 days of the existing `frata` project's data transfer and requests per shop page view, which prices both options. So the proposal is to
  retire what is expensive to keep and not what is cheap to run: six themes, 18 versions, a 2,700-line customizer,
  5 tables, 11 migrations, 18 e2e flows. Keep **one** first-party Starter renderer fed by the Brand record and Content.
  This needs an owner call and an ADR-0014 amendment (see Your calls 1 and 2).
- **Categories.** Nothing stops a merchant selling any product today. Fashion is baked into the *defaults*: a 9-key "what do
  you sell" list copied in four places, size and colour copy and suggestions, size charts, an apparel-only taxonomy, an HSN
  table with two waves, and shop-wide COD and returns. The fix is a **category pack**: one pure, versioned module that
  holds everything that differs by category, replacing the four copies. Waves follow the repo's own research: finish beauty
  and wellness, then home, then food, then electronics, each behind its owner and CA calls.

## Goal

Ranked problems (`frata-planning` § North star): **3 catalogue operations** (first product, category defaults),
**5 premium storefront** (a brand-true first look), **4 mobile checkout** (a shop that opens complete), **1 COD/RTO** and
**6 true profit** (which generalise to every category the packs open).

Measures, each derivable from rows that exist today:

| Measure | Today | Target | Source |
|---|---|---|---|
| Sign-up to first live product | not measured | median ≤ 15 min | `audit_events` `shop.created` to first `products.published_at` |
| Sign-up to open | not measured | ≥ 60% open within 7 days | `tenants.first_opened_at` (trials spec: open rate ≥ 60%) |
| First proof (first order) | not shown | median ≤ 14 days (trials spec) | first order `placed_at` |
| New shops outside fashion | 2 of 9 keys non-fashion | per wave, set at each wave's sign-off | `shop_settings.sells` |

## Job

A new brand owner, on a phone, between other work, wants to see **their** store and sell something today. Frrata's job is
to get them a store that already looks like theirs and has a real product on it before the first coffee goes cold.

## Audit: how it runs today

Source: onboarding audit, repo HEAD 2a15fc7 (2026-11-23).

| Step | What is there | Why it gets in the way | Proposed |
|---|---|---|---|
| `/start` sign-in | Email, 6-digit code or link (`src/app/login/sign-in-flow.tsx`) | Fine. | Keep. |
| Create-shop wizard | name, pickup PIN code, plan, optional phone code, "What do you sell?" (`src/app/start/create-shop-form.tsx`) | Plan comes before the person has seen anything of value. The pickup PIN code is asked before there is a product. Category is optional and only prefills HSN and orders a gallery. | Name and address only. Pickup PIN code stays in Settings. Plan moves to just before Open. Category becomes the pack choice. |
| Land on Home | Flat checklist of 5 rows (`checklist.ts:44-72`); "Name and address" is always done, so progress starts at 1 of 5 | Nothing guides the order. "Add your first product" links to a list page. | One guided pass, the same rows, derived. |
| Look | Never part of onboarding. Classic from default accent and font | The first preview is an empty "Opening soon" store. No logo, colour or font prompt. | A brand step writes today's `accent` and `display_font`. |
| First product | `products/new`, import, photos: separate pages | Ten minutes of hints, no flow, fashion-only kind step. | Photo first, then the pack's two or three fields. |
| Payments, details | Settings pages | Business details (GSTIN, grievance officer) are legal gates to opening and arrive without warning. | Shown as the last step before Open, with what is missing named. |
| Open | `OpenShop` confirm, then a drawn check (`open-moment.tsx`), nothing stored | After the moment, nothing says what to do next. | Open moment, then a share sheet and a waiting-for-first-order state. |
| Partner handover | `/handover`: roles, price, Accept | Owner lands on the standard checklist with no summary of what was built. | Handover ends in the same flow, starting at "what is done". |
| Measure | 15-minute target is spec text only | Admin cannot see where shops stall. | Derived timing, shown in Admin › Trials. |

## Part A: the onboarding flow

Six moments in one pass at one address (`/console/setup`, step in the URL, `?step=`), phone first. The step a person is on
is the URL. What is done is derived from data (`setupSteps()`), so leaving, reloading or opening on another device resumes
in the right place. No stored "done" flag, no new table.

**One field at a time** (owner, 2026-11-23): each screen asks one thing, Enter or one tap moves on, Back keeps the answer.
Seven chapters, about 18 questions (a progress bar counts questions; the chapter list names where you are):

1. **Name and address.** Store name. Then the address, filled from the name (live check as today). **No pickup PIN code**: it
   stays in Settings (owner, 2026-11-23).
2. **What you sell.** One screen of cards with a pictogram each (nine keys now, the packs later). The choice changes the
   store sketch's nouns and the first-product questions.
3. **Your brand.** Logo (skippable), then colour, then font. The sketch changes as you tap. Writes `shop_settings.accent`
   and `display_font` (columns that exist): no theme work, no new tables.
4. **First product.** Photo, title, price, then the pack's questions, one each (clothes: sizes; beauty: shades, volumes,
   ingredients). Import stays one tap away.
5. **How shoppers pay.** Pay on delivery, yes or no. UPI and cards: connect Razorpay or not now.
6. **To open.** The two legal items the store needs before it can open, one question each: GSTIN, then the grievance
   officer's name and email. (What `grievanceComplete` needs is checked in P1; a question is added for anything it requires.)
7. **Open.** A preview of the real store (the console's own preview). Open store. The drawn check, then Share and a quiet
   waiting card: "Waiting for your first order".

**The plan** is not asked at sign-up and not at the start. It is chosen before Open, in chapter 6, as one more question
(Growth preselected, as today). The unit-economics review found that deferring it past Open breaks the trial rule: the
provisional trial and `planChangeStarts` (`src/domains/billing/bill.ts:146`) treat a later change as an upgrade after
the trial, and fees start on the first order. So the plan must be set while the shop is still unopened, with a pre-open
"set plan" that replaces the plan row. TR3 cohorts then break at the plan-set date.

### Motion (reuses `frata-design-language` § Motion; nothing new in duration or easing)

| Moment | Primitive | Phone | Reduced motion |
|---|---|---|---|
| Question to question | `animate-step-forward` / `animate-step-back`, 320 ms; focus moves to the new question | same | 120 ms fade |
| Progress | `scaleX` bar, `duration-slow ease-standard` | same | no travel |
| An answer lands on the sketch | element rises in place (`animate-rise`), at most three staggered, 200 ms | the sketch is a sticky strip above the form | fade |
| Colour or font changes | two layers crossfading on opacity, never a width or layout transition | same | instant |
| A field error | `animate-err-in` (4 px, 200 ms), then one toast "1 field needs fixing" with Show | same | fade |
| Open | the existing drawn check (rule 26: once, no confetti) | same | static check |

Rules this respects: CSS only; opacity and transform only; nothing over 400 ms; lists never animate; the route
crossfade (`<ViewTransition>`) is not available, so steps are in-page state as `/start` already does it.

### States (every screen)

Empty (nothing typed), loading (top bar, never `loading.tsx`), error (field line, then one toast), one product, many
products, no permission (Staff and Accountant see the checklist, not the flow; a Builder never reaches it), phone (single
column, sketch as a strip), partner-built (starts at what is done), support visit (read only).

## Part B: merchants, Studio and themes

### What the audits found

| Fact | Where |
|---|---|
| Studio is partner-only: `requirePartner`, partner-keyed policies, a partner credit ledger, no `studio.*` capability. | `src/app/(partner)/…`, ADR-0020 point 5, `roles.ts:27-57` |
| Built and live: Storefront API keys, build keys, device sign-in, Brand, checkout in the brand's look, Content, partner credits. | Studio orchestrator, 2026-11-23 |
| Built, not on main: V3a agent runtime and `/partner/studio`, staff only, `STUDIO_OPEN=staff`, no live model call yet. | same |
| Not built: hosting, previews, publish gate, one address, owner review of agent changes, merchant wallet. | same; audit § 3 |
| Cost per page turn about ₹380 (19 credits), 8-page site about ₹5,000, from hypotheses dated 2026-11-16. Nothing measured. | `frata-unit-economics`, Studio spec § 8 |
| Credit price: ADR-0014 says ₹19; the later approved packs say ₹19.99 to ₹20. | audit § 2 |
| Hosting is unpriced and fails ADR-0017's kill line at its own guesses. | ADR-0017 rule 11 |
| V5 (retire themes) has no kill signal in any document. | agentic-storefront spec |
| The theme system is about 4k lines of domain, 0.7k lib, 2.7k console, 1k shop route, 3k components, 5 tables, 11 migrations, 18 e2e flows, 20k snapshot lines. | audit § 1 |
| Other systems read the theme layer: brand tokens (`PAIRINGS`, contrast), invoices, emails, share cards, SEO, Content, Settings, checkout styling for theme shops. | audit § 1 |
| Merchants today: Look (layout), Brand (code sites only), Content, Settings › Website. Layout change has no merchant path except the customizer. | audit § 5 |

### The theme does three jobs; split them

| Job | Today | Where it should live |
|---|---|---|
| Look: colours, fonts, logo, corners | Look customizer | **Brand record** (built for code-site stores; theme shops later) |
| Words: announcements, menus, pages, FAQ | Look and Content | **Console › Content** (built; one source from V1) |
| Layout: which sections, in what order | Theme sections and designs | A **Starter** (code, kit) for the common case; **the agent or a partner** for anything else |

Retiring the system is moving each job to its home. Two homes already exist. The third, the Starter, is code that Frrata
ships, fed by the first two, so a merchant who never writes a prompt still gets a store.

### Options

| Option | What happens | For | Against |
|---|---|---|---|
| A. Keep themes as they are | Nothing changes | Zero risk now | ADR-0014 reversed; 6 themes and a customizer to maintain forever; two looks to keep consistent with Brand and checkout |
| B. Retire now, every merchant in Studio | Delete themes, all merchants prompt an agent | The cleanest end state | No hosting, no gate, no wallet, no measured quality. A merchant with no developer gets a ₹5,000 prompt session or nothing. Self-serve shops would have no store |
| **C. Split the jobs, Starter renderer, metered agent** (recommended) | Themes freeze (already). Brand and Content take look and words. One Starter renderer replaces six themes. The agent is an optional paid step. Partners keep the build path | Cheap per shop; merchants never face a blank prompt; each step has a gate; the part that costs most to keep goes first | Needs an ADR-0014 amendment: a first-party Starter runs multi-tenant on Frrata's runtime (the ADR says generated code never does; Frrata's own starter is not generated). Needs the owner's yes |
| D. Retire everything including the renderer | Every shop is a hosted code site | Purest reading of ADR-0014 | Hosting cost per shop unpriced and over the kill line at its own guesses; every merchant pays it |

**Recommendation: C, with D as the destination only if V2 hosting is priced under ADR-0017's line.** The decision date is
the first 30 days of measured pilot hosting cost, which ADR-0017 already requires.

### The merchant ladder (what onboarding to a storefront looks like)

| Rung | What the merchant does | What it needs | Cost to the merchant |
|---|---|---|---|
| M0, now | Onboarding sets colour, font and logo. The store is Classic from those. | This spec's Part A. | Free |
| M1, Starter | "Your website" appears in the flow: Starter, made from Brand, Content and the catalogue. Edits are Brand and Content. | Starter renderer decision (Your calls 2); Brand record for every shop (P1/P2 extended); content parity | Free, inside the plan |
| M2, Ask Frrata | A guided panel, not a blank chat: choose a change (add a page, change a section, new look for a season). See a before and after on a signed preview. Tap Apply. Undo in one tap. | V2 hosting, publish gate, V3a proof, V3b owner review, merchant wallet, a merchant actor in Studio's policy model | Credits, with an allowance in the plan if economics support it |
| M3, Hire a partner | Pick a partner at any rung; the partner path is unchanged. | Built | The partner's own terms |
| M4, retire | Frrata moves each theme shop to the Starter by a parity check; the catalogue, customizer and ADR-0012 go. | Gates below | Frrata's cost, capped, if the owner agrees (Your calls 4) |

### Gates (proposed; every number is a hypothesis with a test)

- **M1 opens when** Brand and checkout-in-the-brand's-look serve every shop, content parity holds on all theme shops, and the
  Starter passes the speed and accessibility floors the kit already sets.
- **M2 opens when** V3a's 20-task proof passes as written (tasks 1 to 13 and 18 to 20 in at least 90% of trials, 14 to 17 every
  time, median ≤ 280 credits, change to preview ≤ 120 s), 20 partner sites are built and measured (median ≤ 45 minutes, at
  least 90% pass the gate first time), and hosting is priced.
- **M2 stops if** fewer than half of merchant Apply taps are kept after seven days, or the median merchant spend is above
  twice any allowance we offer.
- **M4 (deleting themes) waits for** zero theme shops serving traffic for 30 days, a parity pass on every one, and the
  theme-shop count read from `src/lib/admin/themes.ts` (the docs say every store is test data today, so the count may be tiny).

### What stays true on every rung

Prices, stock, orders, shoppers, payments and costs are never in the site's reach (ADR-0014). Policy pages and legal
details are owner-only after handover (PP1) and the agent cannot touch them. A person publishes. A Builder gets no
developer key.

## Part C: more categories

### What is true today

| Question | Answer | Evidence |
|---|---|---|
| Can a merchant sell a non-fashion product? | Yes. Nothing gates it. | audit (categories) § 1 |
| What does "category" mean in code? | Three unrelated things: a shop-level 9-key list (`sells`), a per-product apparel taxonomy id, and a sizing "kind". | `sell-keys.ts:2`, `schema-catalogue.ts:65`, `kind.ts:13` |
| Where is the 9-key list? | Four copies: TypeScript, DB CHECK, the sign-up definer, the Zod enum. | `sell-keys.ts`, `schema.ts:321`, `0065_trial_signup.sql`, `start/actions.ts:44` |
| Tax | GST 2.0 from 22 Sep 2025: chapters 61 to 64 are 5% to ₹2,500 a piece, else 18%. Any other HSN needs the merchant's own rate. The table is not CA-signed. | `rates.ts:13-78` |
| What generalises | COD/RTO, mobile checkout, catalogue ops (mostly), true profit, festive reliability. | audit § 3 |
| What is fashion-only | size and fit returns, size charts, the model line, the apparel taxonomy, the theme gallery, copy ("piece", "size", "About this piece"). | audit § 2 |

### The category pack

One module in `src/domains/catalogue/packs/` (pure, no I/O, after `layers`), one Zod schema, one `packCheck` used by tests and
by save, versioned, immutable once released (the one reusable idea from ADR-0012; its theme part retires). A pack holds:

1. id, label, pictogram, wave.
2. Starting HSN and a bounded HSN list for the wave (CA signed, `caSigned`).
3. Option templates (Size and Colour; Shade and Volume; Weight and Pack of; Storage and Colour) and how each reads.
4. Size chart presets, or none, and whether "the model in the photos" shows.
5. Taxonomy slice and the attributes it asks for.
6. Label and compliance fields (net quantity and maker today; FSSAI, BIS, HUID, serial and warranty by wave).
7. Returns default, return reasons, and the resale rate used in profit (food 0%).
8. COD defaults and caps, quantity limits.
9. Noun set for the store ("item", "pack"; today "piece" is fashion).
10. The facets a store may offer.

It replaces `SELL_KEYS`, `SELL_LABELS`, `startingHsn`, `sellsSized`, `kindOf`, `presetsFor`, `labelAsked` and the sample-set
switch. A gate (`check:packs`) fails when the pack list, the latest migration's CHECK and the sign-up definer disagree.

### Waves (research brief 2026-11-09, sources dated there; ordering is a proposal)

| Wave | Categories | Work beyond the pack | Needs first |
|---|---|---|---|
| W0 | Fashion, footwear, accessories, jewellery | Pack scaffold with no behaviour change (snapshot parity) | Nothing |
| W1 finish | Beauty, wellness | Shade and volume options, ingredients attribute, a beauty taxonomy slice, sample photos | Owner sign-off on mockup |
| W2 | Home and kitchen | Weight and dimensions in the editor (`variants.weight_grams` exists, unused), per-pack COD cap, damage returns | CA ruling on HSN rows |
| W3 | Packaged food | FSSAI and shelf life on the product page, no restock in profit, no-returns default | CA and counsel (FSSAI, legal metrology) |
| W4 | Electronics, fine jewellery | BIS, serial, warranty, HUID; COD cap or prepaid-only; e-way bill at ₹50,000 | CA and counsel |

### The Storefront API and the starters

Released API versions only grow. Additive: a generic `attributes` list on a product, a facet list that is not fixed to size
and colour, and nullable `sizeChart` and `model` (they stay in released versions). `kit/starter`'s product page stops
assuming a "Size" option ("Pick a {option}") and renders a pack's presentation (shade swatches, declarations, nutrition).
`api-contract-reviewer` runs on each diff. No theme block work for categories: themes are retiring (ADR-0014).

### Admin

A category column and wave switch per shop, and a review queue for "Other" (research § 2; none built).

## Research

Current sources only. **The outside research did not run**: this session's network allows four hosts, and every fetch of
Shopify, NN/g, Baymard and Indian vendor pages failed. No competitor, onboarding-UX or regulatory fact below is verified.

| Area | Status | Taken (from the repo only) |
|---|---|---|
| Onboarding patterns (Shopify, Wix, Framer, Dukaan, GoKwik, Linear, Stripe) | Not verified. No current source found. | Nothing cited. The repo's own research (`docs/research/2026-11-06-market-ux-and-stack.md`, `2026-11-07-ux-foundation.md`) predates 12 months for several sources and is not reused here. |
| AI-built store quality and retention | Not verified. | Nothing cited. |
| Category rules (FSSAI, BIS, legal metrology, HUID) | Not verified; repo research dated 2026-11-09 covers wave order and RTO | Wave order and RTO ranges, as dated in `docs/research/2026-11-09-all-categories.md` |
| Codebase | Verified this session | Everything in Audit, Parts B and C |

A re-run needs the hosts opened (Your calls 8). Until it runs, the mockup's "What to take" cards say so rather than citing.

## Design review (headings from `frata-planning` § 3)

- **UI/UX.** Job: first live product and an open store. One primary action per step. Norman checks: signifiers (the sketch
  shows what each answer does), constraints over refusals (the pack removes fields that do not apply), feedback after
  every action (the sketch changes), undo (back keeps answers; Undo on product publish), good defaults (Classic palette,
  the pack's fields), recognition over recall (cards, not codes). Built from Neel primitives and pictograms. States above.
- **Pickup PIN code (owner, 2026-11-23).** Not asked in onboarding. Today `app_create_shop_v2` raises `bad_pincode` when it is
  missing (`drizzle/0065_trial_signup.sql:65`) and `createMyShop` requires it (`src/app/start/actions.ts:43`). The column is
  nullable (`schema.ts:294`). So P1 adds a definer version that takes none (migration 0169 or later), makes the field optional
  in the action, and proves that the two readers (`src/lib/queries/catalogue.ts:183`, `delivery.ts:97`) and any shipping
  estimate show a plain "Add your pickup PIN code" in Settings, not an error, until it is set. Opening is not blocked by it
  (`setupSteps()` does not read it).
- **Tenancy.** No new table in Part A. Reads through `src/lib/queries/`; the tenant is from `requireMember()`. A pack is
  global, read-only data (no tenant). If M1 adds a Brand record to theme shops that is a migration with its own grant,
  RLS and policy; `tenancy-auditor` runs then. Part B's merchant Studio actor changes ADR-0020 point 5 and needs
  `tenancy-auditor` and `security-reviewer` before any build.
- **Modularity.** Engine: `src/domains/catalogue/packs/`. Reads: `src/lib/queries/`. Mutations: console `actions.ts`.
  Rendering: `_components/`. The flow extends `src/domains/setup/checklist.ts`, it does not replace it.
- **SSOT / DRY.** Derived: step state, time to first product, the first-order state. Stored: nothing new in Part A beyond
  existing columns. The category list collapses from four copies to one. Colour and font stay in `shop_settings` until the
  Brand record takes them; one reader, `brandBasics`, so there is never a second copy (a migration moves it).
- **YAGNI.** Left out: a theme picker in onboarding, AI product descriptions, a template gallery, a merchant chat, the
  Starter renderer itself, WhatsApp onboarding. Each returns on a named signal: stall data from the new timing for the
  first two, the M1 gate for the Starter, M2 for the chat.
- **KISS.** One flow, one derived list, one pack module. No new dependency: motion is CSS.
- **Scalability.** Part A adds no tables or background work. The pack is a constant. Part B's cost cap: ₹25,000 list a day
  platform-wide for the first three months stays (Studio spec § 8).
- **Performance.** Flow page first-load script within the console's 150 kB surface budget (partner pages are within 3 kB of
  it; the flow is a console page, so it is measured, not assumed). The store sketch is SVG and CSS. Statements per step:
  one `withTenant` with `Promise.all` for the setup read. `speed-reviewer` runs on the plan.
- **Reliability.** The Razorpay connect and WhatsApp code steps use the existing attempt-row pattern (ADR-0008). Opening
  re-derives readiness on the server as today.
- **Security.** Actions reuse existing ones; new ones (brand save, first product) take Zod with caps and the `CAN_BUILD`
  tuple. Logo upload follows the existing upload checks. `security-reviewer` runs on the plan. Part B adds the largest new
  surface: a merchant actor that can change a published site.
- **Motion and visuals.** Table above. A pictogram per category card. The sketch is the picture that replaces three
  paragraphs.
- **Unit economics.** Part A: no change to fees. Part B: M1 cost per shop depends on hosting not yet priced; M2 credits are a
  new revenue and cost line. `unit-economics-reviewer` runs before sign-off.
- **Theme blocks.** n/a. No theme work (ADR-0014).
- **Storefront API.** Part C only: additive fields, a new facet list, no cost field to a mapper. `api-contract-reviewer`
  and `frata-storefront-api` apply.
- **Blast radius.** Sign-up and Home are on every merchant's path. Lanes in flight touch `console/brand/**`,
  `domains/brand/**`, `(partner)/partner/**`, `middleware.ts` and `vercel.json` crons; migrations 0166 to 0168 are
  reserved, so any migration here takes 0169 or later after checking main (Studio orchestrator, 2026-11-23).

### Stress test

| Severity | What | Where | Fix |
|---|---|---|---|
| High | Retiring the renderer before hosting is priced raises the cost of every no-developer shop | ADR-0017 rule 11 | Option C; decide at 30 days of measured pilot cost |
| High | A merchant Studio actor breaks the partner-keyed policy model | ADR-0020 point 5, `app_turn_actor` | Own spec and `tenancy-auditor` before M2; no work until V3a passes |
| Medium | Colour and font would live in two homes (`shop_settings` and the Brand record) | `brand/page.tsx` says theme shops have no record | One reader `brandBasics`; the move is part of M1 |
| High | Plan chosen after Open breaks the trial rule (a later plan change is treated as an upgrade after the trial) | `bill.ts:146`, trials spec | Choose before Open (chapter 6) with a pre-open set-plan |
| Medium | M1 is not near-zero cost: theme shops already run on Vercel at hosted code's per-view rates | unit-economics review | Read 30 days of `frata` project data before Your calls 2 and 4 |
| Medium | A plan allowance of credits fits Launch only (78 credits at most under rule 9a); with D hosting Growth and Scale have none | unit-economics review | No allowance until hosting is measured |
| Medium | Credit price disagrees across documents (₹19 or ₹19.99 to ₹20) | ADR-0014 amendment 1 vs Studio spec § 8 | Owner picks; amend ADR-0014 |
| Medium | "Free migration" of theme shops is not written anywhere | research row B7 | Owner call (Your calls 4) |
| Medium | Category list in four places drifts | `sell-keys.ts`, `schema.ts:321`, `0065`, `start/actions.ts:44` | `check:packs` |
| Medium | `BuiltPages` is all true and the checklist still says "Products open in the next release" | `checklist.ts:42,52` | Remove with Part A |
| Low | "Name and address" is always done, so progress starts at 1 of 5 | `checklist.ts` | Count from the first real action |
| Low | No timing is stored for the 15-minute target | spec text only | Derive from existing rows; show in Admin › Trials |
| Low | Docs headed "nothing built" are stale on the Studio shell | `2026-11-22-studio-workbench.md:3` | Not this spec's to fix; noted |

## Your calls (each with a recommendation)

1. **Retire the theme catalogue and customizer?** Yes, as the end state, behind the M4 gate and not a date. *Recommended.*
2. **Keep one first-party Starter renderer on Frrata's runtime until hosting is priced?** Yes. Needs an ADR-0014 amendment.
   *Recommended.* Alternative: go straight to hosted code for everyone (Option D) and accept an unpriced hosting bill.
3. **Merchants in Studio.** Not as a default. A guided, metered "Ask Frrata" after the M2 gate. *Recommended.*
4. **Who pays to move theme shops to the Starter?** Frrata, capped, since the docs say every store is test data today.
   Needs the live theme-shop count first. *Recommended.*
5. **Credit price.** ₹20 and amend ADR-0014's ₹19. At ₹19 a credit is 3.002× before fees and 2.930× after the 2% payment fee and
   GST, which fails rule 9a; ₹20 is 3.160× and 3.085×, ₹13.20 contribution a credit. *Recommended.*
6. **Build Part A now.** Yes: it depends on none of the above. Plan: `docs/specs/2026-11-23-onboarding-flow-and-packs-plan-draft.md (moves to docs/plans/ at sign-off)`. *Recommended.*
7. **Category order.** Pack scaffold, then finish beauty and wellness, home, food, electronics, each with its own mockup and
   CA gate. *Recommended.*
8. **Open research hosts** (shopify.com, nngroup.com, baymard.com, m3.material.io, developer.apple.com, fssai.gov.in,
   the Indian vendors) so competitor, onboarding-UX and category-rule facts can be read and dated before the Part A mockup is
   signed. *Recommended.*

## Out of scope

| Left out | Brings it back |
|---|---|
| A theme or template picker in onboarding | never (ADR-0014) |
| AI-written product descriptions | stall data showing titles and descriptions are where first products stop |
| A merchant chat with the agent | M2 gate passes |
| A new Starter renderer's build | Your calls 2 approved, then its own spec and mockup |
| A WhatsApp-first onboarding | a third of sign-ups start on a phone and abandon at sign-in (needs the new timing) |
| New theme blocks for other categories | never |

## Facts used

| Fact | Source | Date |
|---|---|---|
| GST 2.0 slabs for chapters 61 to 64 | `src/domains/tax/rates.ts` | table from 2025-09-22, not CA-signed |
| Studio status, caps, credit packs | Studio orchestrator session, repo `main` 5511d656 | 2026-11-23 |
| Credit costs, 19 credits a page turn, 251 for 8 pages | `frata-unit-economics`, Studio spec § 8 | 2026-11-16, hypotheses |
| Category waves, RTO ranges, store shares | `docs/research/2026-11-09-all-categories.md` | 2026-11-09 and its own dated sources |
| Hosting cost guesses and kill line | ADR-0017 | 2026-11-12 |
| Hosting under D: ₹294 / ₹2,937 / ₹9,764 a month, 1.8× / 5.9× / 6.5× the kill line | unit-economics review, run with the repo's own engines; shapes are illustrative (150, 1,500, 5,000 orders a month) | 2026-11-23, on ADR-0017's guesses |
| Per order, expected: beauty weight freight −₹33, home weight −26%, food no resale −77%, a home COD cap +₹217.68 | same review, `orderProfit` | 2026-11-23, hypotheses |
| Outside onboarding, AI-builder and regulatory facts | not read | no current source found |
