# Build that converts — a cornerstone page
Status: built · Date: 2026-11-16 · Mockup: https://claude.ai/artifact/B2rA72TRjJr525gTLGCkoF · Approved: owner, 2026-11-16

## Goal
Supports acquisition, not a ranked North-star problem directly — the same reason `/partners` exists. Measure:
organic/referral visits to the page and signups it sends to `/start` (GA4, once connected; not blocking ship).

## Job
One public page that teaches a brand owner, in their own words, why small checkout choices cost or keep orders —
so they trust Frrata's own checkout and storefront defaults, and so the page itself earns search traffic.

## Research
Taken from the earlier chat in this session (grounded in Baymard checkout-UX research, Kahneman anchoring/loss
aversion, Norman's *Design of Everyday Things*, and NN/g on dark patterns) — condensed from 12 points to 8 that map
to pictograms/icons the codebase already draws, so the page teaches Frrata's own product decisions, not abstract
theory:
1. One tap to buy (skip the cart gate)
2. No signup wall before purchase
3. Full price shown before checkout, never only at the end
4. COD priced for the risk, never used to punish the buyer
5. Reviews matched to the shopper (size, fit), not sorted by star count alone
6. Stock and urgency shown only when true
7. Returns started in one tap, not a ticket
8. Search that understands intent, not just the category tree

Each point is already a real Frrata decision (COD risk pricing, guest checkout, size charts, `momentIN`/real stock)
or a near-term one — the page never claims a feature that does not exist; `frata-planning` § North star keeps that
honest.

## Design
One page, `/build-that-converts`, on the existing public frame (`SiteStage`, `SiteHeader`, `Selvedge`,
`SiteFooter` — brand-and-public.md rule 42). Hero (h1 ≤ 8 words, one line ≤ 12 words, Start free + WhatsApp), one
spot illustration (the buying journey: browse → pay → delivered, built from the `store`/`payments`/`delivered`
pictograms — § Graphic language, one per page), a 3-step band ("Sees it · Trusts it · Buys it" — words, not an
invented stat, so it never breaks the "every figure from the engines" rule since it carries no number), 8 cards
(icon + heading ≤ 6 words + one line ≤ 12 words, UI icons not pictograms — rule: one illustration per page, the rest
are the website's existing 2-stroke icon set), closing CTA. Linked from `SiteFooter`'s links on `/` and `/partners`.

## Design review
- **UI/UX** — read-only page, one audience (a prospective merchant), one action (Start free). States: this page has
  only one (content loads with the build; no data fetch, so no loading/error/empty state applies). Phone: single
  column, cards stack 1-up.
- **Tenancy** — n/a, no data read or written, no tenant id anywhere on the page.
- **Modularity** — a server component under `src/app/build-that-converts/page.tsx`, reusing `src/components/brand/*`
  and `src/components/icons/icon.tsx`. No new engine, no new query.
- **SSOT/DRY** — no fact is stored; the page states no merchant-specific number. Copy lives once, in the page file.
- **YAGNI** — no CMS, no MDX pipeline, no related-posts system. If more cornerstone pages follow, a shared
  `<SiteArticle>` wrapper is the signal to add one; not needed for the first page.
- **KISS** — one static file, no new dependency.
- **Scalability / performance** — static, `revalidate` long (same pattern as `/`), no client script beyond what the
  shared frame already loads (brand-and-public.md rule 44: no new client script on a public page). Well under the
  300 kB HTML budget — it is text, icons and one inline SVG illustration.
- **Reliability / security** — no outbound call, no action, no webhook. No merchant content rendered. n/a.
- **Motion and visuals** — no new motion; the frame's existing hover/focus rules apply. One spot illustration (hero),
  the rest UI icons per card — § Graphic language's "one illustration per page" is respected.
- **Unit economics** — no price, fee or plan figure changes or appears.
- **Storefront API / theme blocks** — n/a, not reachable from the API, no theme block.
- **Blast radius** — adds one route and one footer link on `/` and `/partners`; touches no shared component's
  behaviour, only its usage.
- **Stress test** — the only control is the Start free link; it goes to the existing `/start` route unchanged.
  Nothing on this page can be wrong at runtime beyond a typo, caught by `npm run check:words` and `check:name`.

## Out of scope
- A blog/CMS system for more cornerstone pages — signal to add: a second page like this one is requested.
- Analytics wiring beyond what the site already has — signal: GA4/analytics gets connected (`frata-integrations`).
- Linking the 8 points to in-product settings (e.g. "see your COD risk pricing") — signal: owner asks for it once
  the page is live and the product affordances it references are user-facing (some, like size-chart display, already
  are; COD risk pricing is staff-only today).

## Facts used
None third-party; the page cites no Meta/Google/Razorpay/Shiprocket term and no regulation.
