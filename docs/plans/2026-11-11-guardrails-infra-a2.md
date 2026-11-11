# Plan: cost guardrails, Admin › Infrastructure and A·2 traffic
Status: draft, reviews running · Date: 2026-11-11 · Owner:
- "build the cost guardrails … along with admin infrastructure";
- "take up analytics altogether … cross verify, plan" (2026-11-11);
- Vercel upgraded to Pro the same day.

Sources:
- runbook `docs/runbooks/cost-guardrails.html`;
- mockups `docs/mockups/2026-11-10-infra-usage.html` (three tabs) and `docs/mockups/2026-11-10-analytics-a2.html`, taken as
  approved by the owner's "build" (2026-11-11);
- spec `docs/specs/2026-11-10-analytics-a2.md` (A·2 replan), with parent `docs/specs/2026-11-07-analytics.md`;
- facts: frata-integrations § Mux, § Infrastructure usage (2026-11-10), and the recheck below.

## Cross-check (2026-11-11): what the runbook and the A·2 replan got wrong
1. **Shop pages are already cached.**
   - The shop layout is `force-static` and every shop page has `revalidate = 60`.
   - On production, `demo.frrata.shop` and `/products` answer `x-vercel-cache: HIT` (STALE on the first hit after a day,
     then HIT).
   - So "cache shop pages, about 10× less server work" is already true. The 64 ms per request measured on 10 Nov was
     the account's average across 12 projects, not a shop visit.
   - Pro's first day of billing data (10–11 Nov, a 100-row sample): ekatanv2 cost ≈ 4× frata.
   - What still renders on a function: the console and Admin (signed in, dynamic), `/api/*`, ISR refreshes (at most
     one per page per minute, and only when a page is visited), OG images, sitemaps.
2. **There is a query timeout.** `drizzle/0002` and `0006` set `statement_timeout 20s`, `lock_timeout 10s` and
   `idle_in_transaction_session_timeout 30s` on `frata_app` and `frata_admin`. "No query timeout" was wrong.
3. **There is no page time limit.** No `maxDuration` is set except on the two crons (60 s), so functions run up to
   Vercel's default (to be confirmed by the recheck).
4. **There is no firewall configuration.** `GET /v1/security/firewall/config/active` answers 404: no custom rule and
   no managed ruleset.
5. **The middleware already skips nothing on purpose.** "Image-looking paths are NOT skipped (tenancy audit
   2026-11-07)". For shop hosts it is a pure `routeFor` with no session work, so it stays as it is. A·2's ingest is
   on the shop host and passes through it the same way.
6. **Frrata sends no email yet.** There is no email sender, and notifications are designed but not built. Alerts show
   in Admin, and spend alerts also come from the vendors' own emails and SMS. Frrata's own email alerts come with the
   notifications module.
7. **Supabase is still Free** (2 projects allowed; one used), so A·2's analytics database is a decision below.

The runbook and the A·2 replan are corrected in G·0.

## Phases (each: its verify, `impact-reviewer` on its diff, pushed to the branch when testable; `main` and production migrations only with the owner's go-ahead)

### G · Guardrails (small, first)
- **G·0 Docs:**
  - correct the runbook (§ cross-check 1–3, the bound unchanged) and the A·2 replan's prerequisite "cached shop
    pages" (done);
  - frata-integrations takes the recheck's facts.
- **G·1 Time limits:** a default `maxDuration` for pages and routes, set where Vercel honours it for the App Router
  (recheck item 1); the two crons keep 60 s.
  - The value: the slowest legitimate page measured in e2e, × 3, rounded up. The 20 s query timeout bounds queries
    already.
  - Verify: the build output lists the limit; a route that sleeps past it ends at the limit (a unit test of the
    config, and one e2e probe).
- **G·2 Firewall, through the API** (a change to production, recorded here and in the runbook):
  - turn on the bot ruleset in **challenge** mode for shop hosts, with verified search and link-preview bots allowed
    (recheck item 2);
  - **log** mode for one day first, so a real shopper is never challenged unseen;
  - Attack Mode stays a manual switch (the runbook says where).
  - Verify: Google's Rich Results Test fetches a product page; WhatsApp and Instagram previews still render; `curl`
    with a bot UA is challenged.

### I · Admin › Infrastructure (the three-tab mockup as drawn)
- **I·0 Data (main database, platform tables, Admin only):**
  - `infra_usage_daily`:
    - columns: source (vercel | mux | supabase), day, project, service, quantity, unit, cost in integer micro-dollars,
      fetched_at;
    - unique on (source, day, project, service).
  - `infra_alerts`:
    - columns: key, kind, severity, words, detail, opened_at, last_seen_at, resolved_at;
    - one open row per key.
  - `infra_settings`: one row of budgets (Vercel, Mux) and the rules switched on or off.
  - Access:
    - no grant to `frata_app` or the API roles; `frata_admin` reads, and writes settings only;
    - writers are definers called by the cron;
    - `check:tenant` lists them as platform tables; `verify:tenancy` proves `frata_app` reads nothing.
- **I·1 Pullers** (an hourly Vercel cron `/api/cron/infra`, 60 s, `isCronRequest`; each pull's outcome is its own row;
  no outbox, because these are reads with no side effects):
  - **Vercel** `GET /v1/billing/charges` for the month, with the token the recheck names. If the existing
    project-scoped `VERCEL_API_TOKEN` can't read billing, it is an owner step: a team token with the least scope,
    `VERCEL_BILLING_TOKEN`.
  - **Mux** `GET /video/v1/delivery-usage`, hourly and 12 h behind, with a read-only token (`MUX_READ_TOKEN_ID` and
    `_SECRET`, an owner step). Never the write token. Stored minutes are derived from our own `videos` rows.
  - **Supabase:** the Management API usage counts and the org's plan, with a scoped token (Usage Analytics Read,
    Organization Settings Read; `SUPABASE_USAGE_TOKEN`, an owner step).
  - **Postgres, read live on the page:** a definer `admin_db_health()` (owned by `postgres`, `search_path ''`) that
    returns aggregates only:
    - database size;
    - connections by role (open and busy) and the connection limit;
    - outbox waiting, the oldest wait, and failed today;
    - unprocessed `webhook_events`;
    - the top 5 query shapes by total time, as `queryid`, calls, mean and total, with the text cut to 80 characters
      and literals already normalised by `pg_stat_statements`;
    - the biggest tables.

    Execute is granted to `frata_admin` only, with ADR-0007 amended in words. A source that isn't configured shows
    "Connect …" on its tab, never an error.
- **I·2 Spend webhook** `/api/webhooks/vercel`:
  - verified on the raw body (`x-vercel-signature`, HMAC-SHA1, `VERCEL_WEBHOOK_SECRET`), stored in `webhook_events`
    under our own key (type, team, threshold, cycle), answered at once, processed after;
  - a `budget.reached` event opens or updates the "Vercel spend" alert;
  - `check:actions` lists it with its credential.
- **I·3 Alert rules** (pure, `src/domains/infra/alerts.ts`, unit-tested):
  - Vercel: on pace past the budget; a day over 3× the 7-day average (CPU, requests); one project over 40%; the
    spend webhook.
  - Mux: delivery on pace past 100,000 free minutes; one video over 25% of delivery; failed uploads over 20% in a day.
  - Supabase: connections over 80%; database over 80% of the plan; outbox waiting over 10 minutes; a query shape over
    1 s on average.

  Evaluated by the cron and on page load; opened and resolved on `infra_alerts`.
- **I·4 The page** `/admin/infrastructure` (staff; settings changes need the admin role):
  - the tabs Vercel, Mux and Supabase (`?tab=`); the nav item under Frrata, with an open-alert count;
  - every state in the mockup: normal, spike, paused, a source not connected, and phone;
  - costs labelled "estimate" where the vendor has no bill API (Mux, Supabase);
  - rates kept in one dated config (`src/domains/infra/rates.ts`, with the date checked).
- **I·5** "Top shops by requests" comes from A·2's human page views once A2·3 lands, and is hidden until then.

### A2 · Traffic (the A·2 mockup as drawn; spec `docs/specs/2026-11-10-analytics-a2.md`)
- **A2·0 Where the analytics database runs** (owner call below). Code reads `ANALYTICS_DATABASE_URL`. In e2e, a second
  database on the throwaway Postgres. Rollups run from a Vercel cron every 15 minutes (`/api/cron/analytics`, SQL
  does the work), or pg_cron if the recheck says it is better.
- **A2·1 Database and locks:**
  - `src/lib/db/analytics.ts`: its own pool (max 5) and `withAnalyticsTenant`;
  - `drizzle-analytics/` with its own config;
  - the first migration: roles, `app_current_tenant()`, the default-privilege revokes, the timeouts;
  - `events` parent (RLS + grant) with daily partitions in the ungranted schema `ev`;
  - `traffic_daily` and `funnel_daily` (tenant first in every key);
  - `check:tenant` reads both folders;
  - `verify:tenancy` runs the analytics proof on a second database: a partition read fails; two tenants never merge.
- **A2·2 Beacon and ingest:**
  - pure in `src/domains/analytics/`:
    - `event.ts` (Zod: page_view, view_item, add_to_cart, begin_checkout, web_vital);
    - `device.ts` (device type, OS, browser, in-app: Instagram, Facebook, WhatsApp);
    - `visitor.ts` (the HMAC input, length-prefixed);
    - `classifySource()` reused from A·1;
  - the island in the shop shell, next to `CaptureAttribution`: under 1 kB gzip, `sendBeacon` on `pagehide`, one
    request per page, off in previews;
  - Web Vitals from `useReportWebVitals`, phones only, sampled;
  - the route `src/app/api/shop/e/route.ts`:
    - `requireShop` (the tenant from the host);
    - ≤ 8 KB, known fields only, Origin checked;
    - `isbot` and data-centre ranges before the IP is dropped;
    - a per-tenant cap, in memory per instance and in the Firewall, never `rate_limits`;
    - 204 at once, the insert in `after()`;
  - the daily salt lives in the analytics database and rotates per IST day.
- **A2·3 Rollups:** IST days, recomputed per day idempotently, top-N cities; raw partitions dropped after 90 days.
- **A2·4 Console › Analytics, as the mockup:**
  - the Visits strip; the visit-to-delivered funnel (orders and delivered from A·1);
  - Sources gain visits, orders per 100 visits and ₹ kept per visit;
  - browsers and in-app; cities; products; speed on phones;
  - the states: no visits yet; too few (under 1,000); phone.
  - The join is by (IST day, channel) in TypeScript, never by person.
- **A2·5 Admin:** platform totals and ingest health through a definer of aggregates; I·5's per-shop human page views.
- **Erasure:** tier 0 holds nothing linkable to a person; `erase.ts` is unchanged (spec).

## Owner calls (recommendation first; the build follows the recommendation unless the owner says otherwise)
1. **The analytics database:**
   - **(a) a second Supabase project now** (Free allows 2; the recheck confirms its limits), moving to Pro at launch;
   - **(b)** the main database in its own schema until Pro;
   - **(c)** wait for Supabase Pro.

   (a) keeps the design in the spec and costs nothing until launch.
2. **Tokens, owner steps:**
   - a Vercel token that can read team billing (if the current one can't);
   - a read-only Mux token;
   - a scoped Supabase token;
   - the spend webhook's secret.

   Each tab works without the others.
3. **Alert emails** wait for the notifications module. Until then: Admin, plus Vercel's and Mux's own emails and SMS.
4. **The firewall's bot rule:** log mode for one day, then challenge · challenge at once.

## Reviews before execution (frata-planning)
`architecture-reviewer`, `tenancy-auditor`, `security-reviewer` (the public ingest, the webhook, tokens, the definer),
`speed-reviewer` (the ingest's cost, the island's bytes, the Admin page) and `unit-economics-reviewer` (A·2's cost and
visitor counts in every plan) run on this plan. Their findings are folded in here before G·1.
