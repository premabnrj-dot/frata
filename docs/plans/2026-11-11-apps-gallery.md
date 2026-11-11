# Apps gallery — plan
Status: active · Date: 2026-11-11 · Mockup v1 (approved by the owner 2026-11-11, calls 1–5 as recommended):
https://claude.ai/artifact/6Th5A8X4YSXCcyozpzPLEg (`docs/mockups/2026-11-11-apps-gallery.html`) · Research: the
gallery study summarised in § Research below.

## Goal
Problem 3 (catalogue and operations) and the pricing ladder: merchants find the app that fits their shop, see exactly
what it costs, and turn it on, from a page that looks as professional as the rest of the console. Measure: apps turned
on per shop in 30 days; "Tell me when it's ready" counts per app (what to build next); support asks about prices.

## Research (2026-11-11; Shopify App Store and Built for Shopify rules, Stripe Apps docs, Linear, Notion, Vercel, Zoho)
Taken: one card for every app whatever its state; your apps above the gallery; groups by the merchant's job; a full page
per app (benefit headline, ≤ 3 features each with a picture, a plain price block, what it uses, works with, questions);
one button that matches the state; higher-plan apps shown, locked, never a button that fails; once on, a home with the
state first; phone: one column. Avoided: pop-ups, timers, animated upgrade buttons, promised outcomes, screenshots with
real shoppers, hidden prices.

## Phases
- **A1 (this build): gallery and app pages.** Everything below.
- **A2: one home for apps that are on** — EkCode, Messages and GST move to the shared layout (state chip, tabs
  Overview · own · Usage and billing · Settings, meters, Turn off at the foot). Its own short plan.
- **A3: self-serve add-ons** — "Start free trial" (14 days, then the add-on on the Frrata bill, the first charge date
  shown) needs billing: a trial a shop starts itself that becomes an add-on row. Until then the add-on's button is the
  honest "Ask Frrata to add <app>" (today's WhatsApp ask). Its own plan with unit-economics and security review.

## A1 tasks
1. **Registry and showcase data (pure).** `GROUPS` relabelled by job: talk → Talk to shoppers, deliver → Get paid and
   ship, grow → Sell more, run → Run the books (keys unchanged; TS-only, no table holds them). Cart flows moves to talk,
   True Profit to run. New `src/domains/modules/showcase.ts`: per app a benefit headline, up to 3 features (title, one
   line, a picture as data: chat bubbles, rows with chips, or a stat strip), up to 3 questions, and "What it uses"
   lines. Unit test: every module has a headline, 1–3 features, ≤ 3 questions, no feature line > 90 characters.
2. **Gallery** (`/console/apps`): Your apps (usable modules: icon, name, state, Open → setup page or app page); at most
   one featured card from `featuredApp()` (pure; today one rule: a Launch shop whose last 30 days of delivered value
   would have cost less on Growth, in its rupees, featuring GST and the Growth plan; nothing when the rule has no real
   number), dismissible per browser (localStorage, a convenience); search; filters with counts (All · In your plan ·
   Add-ons · On a higher plan · Coming next); the grid by job group; an empty search says so with Clear. Each card links
   to the app's page.
3. **App page** (`/console/apps/[app]`, and the about view of `communication`, `ekcode`, `gst` when the app isn't on —
   one `AppAbout` component): back link, header (tile, name, "By Frrata · group · Works with"), headline, the features
   with drawn pictures (`ShowcaseShot`, console tokens, no real data), questions (`<details>`), and the side column:
   price box (`offerFor` — badge, price + 18% GST, the one action), Works with (On/Off), What it uses, Billed by others.
   Actions: Turn on (`setModuleAction`, as today), Turn off (confirm, as today), Ask Frrata to add (WhatsApp link, as
   today), See Growth (Plan and billing, with the saving line when `featuredApp` has one), Tell me when it's ready.
4. **"Tell me when it's ready"** — `app_interest` (tenant_id, module, user_id, created_at; PK tenant, module, user),
   grant select/insert/delete to frata_app, RLS + tenant policy, a row in the tenancy proof; `setInterestAction`
   (any member; module must be a `next` one); Admin › Modules shows the count per app (a frata_admin definer returning
   counts only). Migration numbered after main's latest at build time.
5. **Phone**: the gallery as one column of rows; the app page with the price and its button in a bar at the bottom.
6. **Checks and tests**: unit tests (showcase data, `featuredApp`, filter counts); e2e `45-modules` updated (gallery
   card → app page → turn on Product video → Your apps shows it; GST locked on Launch with See Growth; a coming-next
   app's interest toggle persists); `verify:tenancy` for `app_interest`; 90-ux widths; visual baselines regenerated for
   the console pages that change.

## Design review (frata-planning § 3)
- **UI/UX:** one job per screen (find an app; decide on one app); states: none on, some on, all coming next, search
  empty, no permission (staff see, can't switch: "Ask an owner"), phone; one primary action per app page; no pop-ups.
- **Tenancy:** one new table with grant, RLS and policy in its migration and a proof row; tenant from `requireMember`;
  Admin counts through a definer.
- **Modularity:** pure data and rules in `src/domains/modules/`; reads in `src/lib/queries/modules.ts`; actions in
  `apps/actions.ts`; components in `src/components/modules/`.
- **SSOT:** the offer stays `offerFor()` (the card, the page and the price box read it); features move from
  `registry.features` to `showcase.ts` (registry keeps what access needs).
- **YAGNI:** no ratings, installs, categories pages, or screenshots; self-serve trials wait for A3.
- **KISS:** 11 apps: filter and search in the browser; no new query beyond interest and the featured number.
- **Performance:** the gallery adds one query (the shop's 30-day delivered value, already used by Analytics) inside the
  page's existing reads; no client data fetching.
- **Reliability:** no outbound calls.
- **Security:** `setInterestAction` checks role and module; the page shows prices only from `addon_prices`.
- **Unit economics:** none; the featured line is the pricing ladder's nudge.
- **Blast radius:** the Apps page and its e2e; the console nav's Apps children (unchanged); the three app pages gain an
  about view when off.
