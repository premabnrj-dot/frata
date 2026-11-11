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

## Reviews (2026-11-11), folded into the phases
### tenancy-auditor: fix before merge (baseline `verify:tenancy`: 64 pass)
- **Rollups** run through a definer `analytics_rollup(day)` (`search_path ''`, tenant first in GROUP BY and ON
  CONFLICT, top-N ranked `over (partition by tenant_id, day …)`). EXECUTE goes to a dedicated cron role only, never
  `postgres` in Vercel and never `frata_app` reading all tenants. Rollup tables give `frata_app` SELECT;
  `events` gives `frata_app` INSERT only; every partition has RLS on with no policy; schema `ev` has usage and default
  privileges revoked from everyone.
- **`check:tenant` learns the analytics pool:**
  - the raw analytics pool only in `src/lib/db/analytics.ts`;
  - `withAnalyticsTenant` only from `src/lib/queries/analytics.ts` and the ingest route, each listed with its reason;
  - an analytics Admin connection (`frata_admin` in that database, a Production-only URL) fenced like `adminDb`;
  - `admin_traffic_by_shop(since)` → (tenant_id, count), EXECUTE to `frata_admin` only.
- **`admin_db_health()`:**
  - query shapes only for `userid` in (`frata_app`, `frata_admin`), `toplevel`, and SELECT, INSERT, UPDATE, DELETE or
    WITH only;
  - quoted strings and numbers stripped before the 80-character cut;
  - from `pg_stat_activity`, counts by role and state only (never `query`, `client_addr` or `application_name`);
  - revoked from public, anon, authenticated and service_role;
  - the ADR-0007 amendment names the function and its columns.
- **Ingest:**
  - capture `tenantId` before `after()`, one `withAnalyticsTenant` per request, no buffer shared across requests, the
    cap Map keyed by tenant;
  - the beacon sends `location.pathname` and the allowed UTM keys only, and Zod refuses `#` (`/orders#t=` is a bearer
    token);
  - forged product ids resolve to names only under `withTenant(A)`, with unknown ids shown as "other";
  - errors log `errName` only (Postgres row messages carry data).
- **`infra_*`:**
  - RLS with a `frata_admin` policy and no `frata_app` policy;
  - writer definers granted to the cron role only;
  - Mux's "one video over 25%" needs an aggregate definer (`frata_admin` holds nothing on `videos`).
- **e2e roles are shared across the instance:** the analytics roles' settings use `alter role … in database`, and their
  attributes are proved from inside the analytics database.
- **`verify:tenancy` proves:**
  - ingest isolation (A invisible to B; inserting B under A fails; unset gives zero rows);
  - `ev.*` refused; SELECT on `events` refused; no BYPASSRLS;
  - rollups: two tenants stay two rows, a re-run is idempotent, A's top-N ignores B;
  - every definer refused to public, anon, authenticated, service_role and `frata_app`;
  - `admin_db_health()` has no text from `pg_stat_activity`, and a planted literal is absent;
  - `infra_*` refused to `frata_app`.

### security-reviewer: fix before merge
- **HIGH-1, the billing token.** A Vercel token carries its creator's whole role, so a token that reads team billing
  is in practice an Owner token. If stolen, it can deploy into production with every secret, switch off the pause or
  the firewall, and reach the other 11 projects.
  - The Vercel tab uses a token made by a **Billing- or Viewer-role member**, if the recheck confirms such a token
    reads `/v1/billing/charges` but gets 403 on deployments, env and firewall. Production only, Sensitive, 90-day
    expiry.
  - The puller probes a forbidden endpoint on every run and refuses the token if it gets a 2xx.
  - Until such a token exists, the Vercel tab shows "Connect a billing-only token" and the spend webhook carries the
    alerts.
  - The existing `VERCEL_API_TOKEN` (domains) never gains billing.
- **HIGH-2, ingest abuse can pause every shop:** each forged beacon is still an invocation, and the $50 budget then
  pauses all shops.
  - A Firewall rate rule on `/api/shop/e` (per IP, deny) goes live in G·2, before A2·2.
  - The middleware skips `/api/shop/e`; `routeFor`'s check is repeated in the route.
  - IPv6 counts per /64 (`ipBucket`).
- **MED-1, spend webhook:**
  - stored through a definer into its own table (as `app_store_billing_event`), keyed on sha256 of the raw body,
    never a tenantless row in `webhook_events`;
  - a 64 KB body cap; the hex length checked before `timingSafeEqual`; the payload's `teamId` must equal
    `VERCEL_TEAM_ID`;
  - the event is a trigger only: the puller confirms it against the billing data before any alert says "spent".
- **MED-2, the salt:**
  - the visitor hash takes a /24 (IPv4) or /48 (IPv6), not the full address;
  - only a definer reads the salt; it is deleted and vacuumed daily;
  - the backup window is written into the spec.
- **MED-3, unknown hosts reach the main database:** a per-instance cache of host misses (60 s) and a per-IP cap ahead
  of `requireShop` on the ingest, backed by the Firewall rule.
- **MED-4, the firewall rule:**
  - scope: shop hosts, own domains included;
  - excluded: `/api/webhooks/*`, `/api/cron/*`, `/api/ek/*` and the OG and share-card routes;
  - the verify list adds Google-InspectionTool, Storebot-Google, Telegram and iMessage previews;
  - the change is made as the owner (a Vercel session, not the app's token), and the previous config is saved for
    rollback.
- **MED-5, forged content in the Console:**
  - strict Zod with length caps;
  - paths must match the shop's own path shapes; product ids must be uuids joined to the tenant's products;
  - the referrer must be a bare hostname;
  - sources and cities with fewer than 5 visitors fold into "Other" (k ≥ 5).
- **LOW-1:** the `pg_stat_statements` filters (as the tenancy review), and statistics reset after any password change.
- **LOW-2, the Supabase token:**
  - Usage Analytics Read and Organization Settings Read only. **Logs Read stays off**, because logs carry emails and
    IPs, so the Management API metrics endpoint is not used;
  - a forbidden endpoint is probed on each pull.
- **LOW-3, the settings action:** it calls `requireStaff(ADMIN_ONLY)` itself, with Zod caps and an audit row. Alerts
  are evaluated in memory on page load and written only by the cron's definer.
- **LOW-4:**
  - the Mux token is Video Read only;
  - every new env variable is Production only;
  - the ingest reads its body with a running byte count;
  - `ENTRY_POINTS` gains `/api/shop/e` and the two crons;
  - partitions are dropped through a definer with `format('%I')`;
  - errors inside `after()` log `errName` only;
  - `npm audit` runs when `isbot` is added.

### unit-economics-reviewer
Computed with `orderProfit`; the scratch model is in the session scratchpad.
- **Visitor counts and ₹ kept per visit go in every plan** (call 5 settled by the evidence).
  - They cost Frrata ₹5–49 a shop a month; Shopify Basic shows sessions and sources.
  - Gating them behind True Profit would add 28% to a Launch shop's bill.
  - True Profit keeps the cuts by product, pincode and campaign.
- **A·2's cost (30,000 page views a shop a month):**
  - ingest $0.89–5.41 per million beacons (the 5 ms-CPU best case to the measured worst);
  - 20 shops ≈ ₹930–990 a month; 500 shops ≈ ₹2,600–10,600; 1,000 ≈ ₹7,800–20,500.
  - The "$1 per million" in the spec is the best case; the cheapest test is 100,000 synthetic beacons on a preview
    (≈ $0.09–0.54), with CPU and GB-s read from Observability.
- **Bound:** ≈ $215 is launch-only.
  - A second paid Supabase project adds ≈ $10 (compute isn't under the spend cap).
  - The beacon brings the $100 CDN tier forward (from about 67 shops to about 56).
  - The runbook's bot-crawl row is understated: a crawler hitting each page once a day always meets a stale page, so
    each hit re-renders. 30M re-renders ≈ $162 a month, not $100. The runbook is corrected, and the bound is restated
    per shop count.
- **The ingest shares the budget that pauses production** (≈ 9M forged beacons = $50). The Firewall rule ships first
  (security HIGH-2), plus an **Admin switch that turns counting off**: the beacon reads a flag baked into the shell, so
  turning it off stops new calls on the next page refresh.
- **Free analytics project:** at 20 shops, 500 MB in about 83 days (about 28 at a 3× festive peak); full = read-only,
  and `after()` inserts are lost silently. Option (a) only with **a disk alert on that project** in Infrastructure, and
  90-day partitions dropped on time. The spec's A2·0 is reconciled with this plan.
- **The Infrastructure dashboard itself costs ≈ $0.03–2 a month** (the hourly cron), plus $0.21–1.24 for the rollup cron.

### architecture-reviewer: changes needed
- **BLOCKER 1, process:** G and I execute now (the owner's "build … along with admin infrastructure"). **A2 waits for
  the owner's explicit sign-off** of the A·2 mockup and calls 4 (retention) and 5 (visitor counts in every plan: the
  unit-economics review recommends yes). Asked of the owner with this plan.
- **BLOCKER 2, SSOT:** rollups are keyed by the raw inputs (referrer host, utm keys, click-key flags, with top-N) and
  classified on read through `sourceOfInputs`, never a stored channel (frata-architecture § Attribution: raw in,
  classified on read).
- **MAJOR 3:** **`infra_alerts` is cut.** A pure `alertsFor(facts, now)` runs on the page; the nav count reads the
  same facts. A table returns with notifications, which need send dedupe.
- **MAJOR 4, the schema follows the mockups:**
  - `infra_usage_daily` gains a `subject` column (a video, shop or project id), and `infra_pulls` records each pull's
    outcome (source, at, ok, why);
  - "Top shops by requests · Bots" is retitled "Top shops by visits" (from A·2's beacon), and Bots is cut;
  - A·2's products, browsers and speed sections each get their own rollup (grant, RLS, `verify:tenancy` row), or are
    cut at sign-off.
- **MAJOR 5, states:**
  - Infrastructure: a stale or failed pull ("Last read 3 h ago · Vercel didn't answer"); a support-role staffer sees
    settings read-only.
  - Analytics: the database paused or unreachable gives a "Visits unavailable" panel. The analytics pool has a 2 s
    connect timeout and is read in parallel with A·1's snapshot, never inside it.
  - Pool sum per instance: main 10 + analytics 5, against the pooler's 200.
- **MAJOR 6, writers:**
  - **`infra_*` are written by the hourly cron through `adminDb` (`frata_admin`)**, fenced in `src/lib/admin/infra.ts`.
    `frata_admin` gets INSERT/UPDATE on `infra_usage_daily` and `infra_pulls` only. No new database role.
  - **Analytics:** pg_cron inside the analytics project runs the rollup, creates partitions 7 days ahead, drops after
    90 days and rotates the salt, if the recheck confirms pg_cron there. No Vercel cron, role or secret is then
    needed.
- **MAJOR 7, ADR-0006:** the pullers need no outbox (a read with no effect at the provider; precedent `checkDomainRow`,
  `getAsset`), on four conditions:
  - every call goes through `fetchWithTimeout`, with deadlines that add up to under 55 s;
  - sources run under `allSettled`;
  - no transaction is open during a call;
  - writes are idempotent upserts.

  This is recorded as an ADR-0006 amendment line for the owner, and in frata-architecture. The pullers reuse
  `src/lib/connectors/vercel/` and `src/lib/video/mux.ts`.
- **MAJOR 8:** the facts recheck (running) is required before G·1, G·2, I·1 and A2·0.
- **MAJOR 9, bundle:** A2·2 comes **after PV1-4a and PV1-4** (the product page is at 120.x of 121 kB);
  `useReportWebVitals` loads `web-vitals`, which has to fit.
- **MAJOR 10, rules 5 and 6:**
  - the firewall config is a checked-in file (`ops/firewall.json`) applied by a script (`scripts/ops/firewall.mjs`)
    that saves the previous version;
  - migrations to the analytics database are applied by a script, not by hand;
  - § Practices recorded in skills and § Regression net are added before execution (below).
- **MAJOR 11, money:** micro-dollars get an ADR-0004 amendment line, a `MicroUsd` type in `src/domains/money/`,
  `formatUsd` in `src/lib/format.ts`, and one conversion point.
- **MINOR:**
  - **order:** Supabase tab first (the definer only), then Vercel, then Mux; I·3's pure rules and tests before the
    pullers;
  - Mux "Live / cap" reuses `videoState` and `PRODUCT_VIDEO_CAPS` (raw facts from a definer);
  - G·1's verify reads `.vc-config.json` from the build, with the value from Observability's p99;
  - G·2's verify adds in-app checkout (Instagram, WhatsApp), `/api/shop/*`, the Razorpay return and EkCode;
  - "Send to" and the 30 s live poll are not built ("Check now" refreshes); "Cache hits" is added to the definer;
  - Mux is pulled every 6 h, as the mockup;
  - "₹ kept per visit" goes behind `seesCosts`, its maths in `totals.ts`, the 1,000 threshold in `judge.ts`, and an
    IST-day parity test against `istDayKey`;
  - the Vercel budget shows "as set in Vercel".
- **YAGNI, cut:**
  - the Supabase Management API puller and its token (the Data API is off, so counts are near zero, and there is no
    egress endpoint). The plan is a dated constant;
  - the I·2 spend webhook, until notifications (the hourly pull plus Vercel's own email and SMS);
  - per-rule toggles;
  - data-centre IP ranges.

## Regression net (before G·1)
- e2e flows run before and after each phase:
  - storefront: 10 checkout, 20 baselines, 47 look, 66 video, 68 product-video;
  - Admin: 45 modules and the admin flows;
  - Analytics: the A·1 flow.
- A new e2e flow `69-infrastructure` is written first, against fakes of the Vercel billing API and Mux delivery usage
  (in `e2e/fakes/`): the three tabs, a failed pull, and a support-role staffer seeing settings read-only.

## Practices recorded in skills
- frata-architecture:
  - outside reads with no effect need no outbox (the ADR-0006 conditions);
  - `infra_*` platform tables;
  - § Hosting is now Pro.
- frata-integrations: the recheck's facts, the billing API, the firewall API.
- frata-gotchas: shop pages are CDN-cached (check `x-vercel-cache` before blaming the storefront for CPU).

## Facts recheck (2026-11-11), folded in
- **G·1:**
  - Pro's default duration is 300 s, with an 800 s maximum.
  - A layout's `maxDuration` reaches its pages and their Server Actions, never `route.ts`.
  - **Built:** root layout 60 s; every route handler declares its own (60 for crons and routes that work in `after()`,
    30 otherwise); `scripts/check-duration.mjs` in `npm test` keeps it so.
  - **Owner step:** set the project's Default Max Duration to 60 s (Settings › Functions › Advanced) as the backstop.
- **G·2:**
  - Bot Protection is project-wide (no host scope).
  - WhatsApp, Shiprocket and Mux are not verified bots. Googlebot, Bingbot, Storebot and facebookexternalhit
    (Facebook, Instagram and Messenger previews) are.
  - **Built:** `ops/firewall.json` (bypass `/api/webhooks/` and `/api/cron/`; bypass WhatsApp and Telegram previews on
    GET and HEAD; Bot Protection and AI Bots in LOG).
  - **Blocked:** the API answers 404 "config not found" until the firewall has been opened once in the dashboard.
    **Owner step:** open Project frata › Firewall once; then the config is applied by API and read back.
  - Challenge comes after a day of logs.
- **pg_cron is available on frata (Free)** (`pg_available_extensions`), so A·2's rollups, partitions and salt run there.
- **Role timeouts are set on production:** `frata_app` and `frata_admin` have statement 20 s, lock 10 s,
  idle-in-transaction 30 s.

### speed-reviewer (measured on throwaway copies, 2026-11-11)
- **HIGH 1, the beacon breaks the shop JS budget:**
  - product 120.6 → 124.2 kB with `useReportWebVitals` (it observes for every shopper whatever the sample), 121.5 kB
    without it;
  - fix: web-vitals by `import()` only after the phone and sample check; PV1-4a's split (≥ 1.5 kB) is a hard
    prerequisite of A2·2.
- **HIGH 2, a 15-minute full recompute fails on Diwali** (a 10× day takes 133 s, past 20 s and 60 s).
  - Fold each 15-minute slice into a per-day visitor table (upsert with a bitmask of funnel steps): 5.3 s at 10×.
  - A closed IST day is recomputed once, by ranges of tenants.
- **MED 3:** one narrow rollup per dimension, plus a per-tenant daily total. The five-dimension grain made 353k rows a
  day, and distinct visitors don't add across cells.
- **MED 4:**
  - **Built:** `outbox_dead` partial index (drizzle/0094); "gave up today" took 350 ms at 10×.
  - `admin_db_health` is cached 60 s per instance (pg_stat_statements costs 26–38 ms at 4,553 shapes).
- **MED 5, each beacon is two Fluid invocations:**
  - `/api/shop/e` is taken out of the middleware matcher exactly, because `requireShop` re-runs `routeFor`;
  - no Firewall rate rule on that path unless under attack ($0.55/M);
  - flush on `visibilitychange` = hidden, batched per visit (soft navigations fire no `pagehide`), so about ⅓ of the
    requests.
- **MED 6, ingest order:** size cap → isbot → a 60 s negative host memo → `requireShop`.
- **MED 7, a stalled analytics database:**
  - the ingest role gets a 2 s statement and connect timeout, and a queue cap past which events are dropped;
  - one definer call sets the tenant and inserts (instead of four round trips);
  - `synchronous_commit` off for events;
  - the analytics pool reports to `attachDatabasePool`.
- **MED 8, ISR:** the 60 s backstop costs more than the beacon (at 10×, about 73% of views start a background render).
  It stays for now: render-time `now` drives scheduled drops, pauses and offer windows. Later: a 5-minute cron purges
  the tags of shops whose time boundary has passed, then `revalidate` rises to 3600.
- **LOW:** a project default Max Duration in the dashboard (owner step); the ingest gets 5 s.
- **Cost:** the beacon adds $1.9–4.6/M page views; after fixes 5 and 6 about ⅓ of that. Affordable.

## Owner, 2026-11-11 (after the release of G and I)
- **G:** Bot Protection set to Log and published; the project Default Max Duration set to 60 s. The firewall API still
  answers 404 for the config, so the two bypass rules in `ops/firewall.json` go in by hand (custom rules) before
  Bot Protection ever moves to Challenge.
- **A·2:** the mockup is approved; calls as recommended:
  1. a separate Supabase project for analytics (Free now, Pro at launch), with a disk alert in Infrastructure;
  2. after the prerequisites;
  3. separate, about $10 a month on Pro;
  4. raw events 90 days, rollups 2 years. The DPDP Rule 8(3) one-year question stays with the lawyer;
  5. visitor counts in every plan (unit-economics review).

  Build order: A2·0 (the owner creates the project) and A2·1 (the database and its locks), then PV1-4a (the island
  split frees room on the product page: the beacon adds 0.8–0.9 kB), then A2·2 → A2·5.

## A2·1 as built (2026-11-11, branch only; nothing applied to any live database yet)
- **The project:** the owner created `frata-analytics` (ref `frbyvvxxqheigcutlamj`) in a separate Supabase account, Data
  API off. The session's Supabase connection belongs to the main account and is refused there, so its migrations go
  in by the owner's hand through its SQL editor: one transaction holding 0000–0002 and their
  `drizzle.__drizzle_migrations` rows (sha256 of each file, the journal's `when`), checked first on a fresh database.
- **Migrations** (`drizzle-analytics/`, `drizzle.analytics.config.ts`, `npm run db:generate:analytics`):
  - 0000 (custom): roles `frata_app` and `frata_admin`, with their limits set in this database only (`alter role … in
    database`; `frata_app` 2 s statement, 1 s lock, 5 s idle, `synchronous_commit` off); `app_current_tenant()`, granted
    by name, because functions belong to no one by default here; pgcrypto in `extensions`; the schema `ev` with no grant.
  - 0001 (generated from `src/lib/db/analytics-schema.ts`): six narrow rollups (`traffic_daily`, `source_daily` with
    the raw source inputs, `browser_daily`, `city_daily`, `product_daily`, `vitals_daily`), tenant first in every
    key, plus an index on day each.
  - 0002 (custom):
    - `events`, partitioned by IST day, with partitions in `ev` (RLS on each);
    - `frata_app` may INSERT only, under `tenant_insert`;
    - `visitor_days`, `visitor_salts` and `fold_state` are definers' tables with a restrictive false policy;
    - `ingest_events()` (invoker: one round trip, still under the events policy) and `analytics_visitor()` (definer:
      a 16-byte HMAC with the IST day's salt, which never leaves the database);
    - `analytics_fold()` runs every 15 minutes and is incremental: a watermark with a 1-minute lag, upserts into
      `visitor_days` with a step bitmask, the day's first landing keeps the source, and the touched days are then
      rebuilt;
    - `analytics_rollup(day)` keeps the top 200 sources (rh `*` for the rest) and the top 50 cities ('' for the rest)
      per shop;
    - `analytics_maintain()` runs hourly: partitions 7 days ahead, raw events and visitor-days dropped after 90 days,
      rollups after 730, yesterday's salt deleted;
    - pg_cron schedules both where the server has it (Supabase).
- **Code:**
  - `src/lib/db/analytics.ts`: pool of 5 with a 2 s connect timeout; `withAnalyticsTenant` (read only);
    `ingestBatch` (one statement, dropped past 20 in flight);
  - `ANALYTICS_DATABASE_URL` in `src/lib/env.ts` and `.env.example`.
- **Gates:** `check:tenant` § 8 holds the analytics folder to RLS and a tenant-bound policy on every table, no grant on
  `ev`, and the connection only from `src/lib/queries/**` (or `ANALYTICS_IN_APP`). `check:config` lets
  `src/lib/db/analytics.ts` own its `postgres()`.
- **Proof:** `scripts/verify/analytics-tenancy.sql`, 12 checks, run by `verify:tenancy` on a second throwaway database
  (`<name>_analytics`), and so in CI. It covers:
  - roles and per-database limits;
  - `ev` closed, and every partition under RLS;
  - grants;
  - definer privileges and search paths;
  - reads of events, partitions, salts and visitor-days refused;
  - ingest isolation, the 50-event cap and the hash;
  - fold and rollups: two shops stay two rows, top-N is ranked within a shop, histograms add up;
  - idempotent re-runs, and a later slice that adds;
  - console reads limited to the shop;
  - retention.

  Three mutations (a grant on `ev`, a `using (true)` policy, the fold granted to `frata_app`) each fail it.
- **e2e:** the stack makes `frata_e2e_analytics` beside `frata_e2e` and sets `ANALYTICS_DATABASE_URL`.
- **Left for A2·2:** the route (it joins `ANALYTICS_IN_APP`, or reads through a query file), `src/domains/analytics/`
  event, device and visitor modules, the beacon. The analytics admin connection waits for A2·5, its first reader.
- **tenancy-auditor on A2·1 (2026-11-11), folded:**
  - **HIGH:** `ingest_events` set the shop for the rest of the caller's transaction, so a later read would see the
    other shop. It now refuses a shop other than one already set, and puts the caller's setting back; the proof tests
    both, and the unset case.
  - **MED:**
    - the default-privilege revokes now include `service_role`;
    - the proof's grant and function checks are driven by the catalog (RLS on every table in public, `ev` and
      `extensions`; no privilege of any kind for the API roles or `frata_admin`; an exact allow-list for `frata_app`
      and PUBLIC, TRUNCATE included; `pg_default_acl`; every definer's search path and EXECUTE). The auditor's four
      escapes now fail it.
  - **MED, gate § 8:**
    - every policy that isn't restrictive false must name its role and bind the shop;
    - tables in any schema are checked;
    - TRUNCATE, ALL, REFERENCES and TRIGGER grants fail it, as do default-privilege grants and disabling RLS.
  - **LOW, accepted:**
    - `frata_app` can hash for any shop: it reads nothing that holds a hash;
    - `pg_stat_user_tables` shows platform-wide daily event counts, not one shop's;
    - the relative-import case was already caught, because the gate resolves relative paths first.
- **impact-reviewer on A2·1 (2026-11-11), folded:**
  - **HIGH:**
    - the gate's type-only escape now passes only when every import of the module is `import type { … }`, so a
      namespace import or `import()` fails it;
    - 0000 refuses to run on the main database (both Supabase databases are named `postgres`). This is proved: run
      there, it raises and changes nothing.
  - **MED:**
    - § 8 fails on any `alter policy`, and on a policy that names no app role;
    - the proof gains a 205-source shop (top 200, then one bare `rh = '*'` row of 5, no other shop folded), ordered
      visitors (traffic, source, city), a batch's first landing (events in a batch now get microsecond-apart `at`), and
      a fold across IST midnight. 13 checks in all.
  - **Docs:**
    - ADR-0011 (the second database);
    - `docs/setup.md` § Analytics database (paste, password, URL);
    - `scripts/ops/analytics-paste.mjs` derives the paste from the files and is checked on a fresh database and on the
      main one (refused, rolled back);
    - frata-verify 1.8.0 and frata-architecture 2.36.0 (covers `drizzle-analytics/**`);
    - pg_cron is guarded on `shared_preload_libraries`.
  - **Deferred, with their phase:**
    - A2·2: `IngestBatch` takes its event type from `src/domains/analytics/event.ts`, with one round-trip test (an
      unknown key is silently null); `withAnalyticsTenant` and `ingestBatch` are tested through the route's e2e flow
      (UUID refusal, read only, the in-flight cap).
    - A2·4: creator visits are labelled by joining `cc` to the main database's creators (`sourceOfInputs` needs label
      and code); `rh = '*'` reads as "Other", never as a site.
    - On apply: `cron.job` lists both jobs (the paste ends with that query).
    - `CLAUDE.md` § Before you commit and § Migrations name only `drizzle/`. A line for `drizzle-analytics/` (pasted by
      the owner; 0000 refuses the main database) is proposed to the owner, not written by an agent.
- **Applied (owner, 2026-11-11):** 0000–0002 pasted into frata-analytics; `cron.job` lists `analytics-fold` (`*/15 * * * *`) and `analytics-maintain` (`7 * * * *`), both active.

## A2·2 amendment, proposed 2026-11-11 (for speed-reviewer and security-reviewer before building)
**Why.** The plan put the beacon in the shop shell as a React island, next to `CaptureAttribution`. The shell also
frames checkout, so the island lands on every shop page, measured today (`SHOW_BUDGETS=1`) as:
- product 120.6 of 121 kB;
- checkout 120.2 of 121 kB;
- home 114.0.

With 0.8–0.9 kB more, checkout fails too, and PV1-4a only frees room on the product page.

**Proposal: the beacon is one static, async script, not an island.**
- `public/fe.js`: plain JS, ≤ 1.2 kB gzip, no React and no hydration. It runs after parsing and blocks nothing.
  - On shop hosts `/fe.js` is exempted, by that exact name, from the shop rewrite (`shopRewrites`, as image files
    are).
  - It is cached at the CDN, and versioned by `?v=` from a constant, so a change reaches every shopper on their next
    page.
  - `check:storefront-build` gives it its own ceiling (1.2 kB gzip). It isn't counted in a page's first-load figure,
    and the gate's comment says why.
- **Mounted by the server shell** for live shops only: no previews, the console address refused as `captureAttribution`
  does, and only while counting is on (`isAnalyticsConfigured()`; the Admin switch from A2·5 later).
  `<script async src="/fe.js?v=N">`.
- **What it sends.** One `sendBeacon` to `/api/shop/e`, made on `visibilitychange` = hidden and on `pagehide`. Each
  call carries the events queued since the last one, at most 50.
  - `page_view` on load and on each soft navigation (`history.pushState` and `popstate`), with `location.pathname`
    only, never a query or `#`;
  - a landing (the tab's first page, `sessionStorage`) carries the raw source inputs from the URL and the referrer's
    bare hostname, in the same shape `captureAttribution` stores (utm source, medium and campaign; `gclid`/`gbraid`/
    `wbraid`/`gad_source`, `srsltid` and `fbclid` as flags; the creator `?code=`);
  - `view_item`, `begin_checkout` and `purchase` come from a server-rendered marker in the page
    (`<i hidden data-fe="view_item" data-pid="…">` on the product page, the checkout page and the order page's first
    view). No component code is involved;
  - `add_to_cart` comes from the bag store's existing `frata:open-bag` event (detail set means an item was added),
    with the marker's product id;
  - Web Vitals on phones only (`pointer: coarse`), 1 in 4 page views, with `PerformanceObserver`: LCP, CLS (the largest
    session window) and INP (the worst event duration). No `web-vitals` package.
- **What the server adds** (nothing extra from the browser):
  - device, browser and in-app browser from the User-Agent, in a pure parser in `src/domains/analytics/device.ts`;
  - the city from `x-vercel-ip-city`;
  - the visitor input: length-prefixed /24 or /48 of the address, then the UA, in `visitor.ts`. The address is never
    stored.
- **The route** `src/app/api/shop/e/route.ts` follows A2·2 and the reviews:
  - checks in this order: body ≤ 8 KB read with a running count, a bot User-Agent, a 60 s negative memo of unknown
    hosts, the host to its shop (`tenantForHost`, never the body), and Origin equal to the host;
  - a cap per shop per minute, in memory;
  - strict Zod from `src/domains/analytics/event.ts`, which also gives `IngestBatch` its type;
  - answers 204 at once, then `ingestBatch` runs in `after()`; errors log `errName` only;
  - stays out of the middleware matcher;
  - lives in `ANALYTICS_IN_APP` with its reason, and in `ENTRY_POINTS`.
- **PV1-4a** is still needed for PV1-4's video tile, but no longer blocks A2·2.
- **Owner step before the beacon goes live:** a Vercel Firewall rate rule on `/api/shop/e` (security HIGH-2).
- **Tests:**
  - unit tests for `event.ts`, `device.ts` and `visitor.ts`;
  - one round trip of `ingestBatch` against the e2e analytics database;
  - an e2e flow: a shop page sends its beacon, a soft navigation adds a page view, add to bag sends `add_to_cart`, a
    bot or an unknown host or another Origin is refused or dropped, and after a fold Traffic's rows exist under the
    shop and no other.

### security-reviewer on the A2·2 amendment (2026-11-11): the static script is sound; fixes folded in
- **HIGH-1, the route is public at deploy:** `/api/shop/e` answers 404 before reading anything unless
  `ANALYTICS_INGEST_ON` is set (Production only). The owner sets it only after the Firewall rate rule is live and the
  privacy sentence (MED-6) is approved.
- **HIGH-2, the WhatsApp bypass could skip the rate rule:**
  - `ops/firewall.json` puts the `/api/shop/e` rate rule first;
  - each link-preview bypass condition is ANDed with a path that doesn't start with `/api/`;
  - owner step: the same change in the dashboard.
- **MED-3, order and lookup:**
  - `requireShop`: Origin before the lookup, with hits cached for 60 s;
  - the order is method and content type, Origin equal to Host, then User-Agent (`isBot`), then a per-IP cap with
    `ipBucket` (/64), then the body count (8 KB), then a 60 s miss memo, then `requireShop`, then a per-shop cap,
    then Zod;
  - both Maps are bounded LRUs.
- **MED-4, paths:** `pathShape()` maps every path to the shop's own shapes (home, product or collection by handle,
  bag, checkout, orders, policy) or `other` before storing. Tested.
- **MED-5, personal data in utm values:** a value that looks like an email or a phone number is dropped at the route,
  and the event still counts (`looksPersonal`, tested). k ≥ 5 stays on read: folding single days would erase small
  shops' sources.
- **MED-6, the privacy policy:** the shop's policy says it collects name, phone, email and address "and nothing else
  without asking you". A sentence about counting visits (network, browser, city, pages; no cookie, nothing that
  names a person, raw data deleted after 90 days) goes to the owner and the lawyer before `ANALYTICS_INGEST_ON`.
  Proposed: "We count visits to this shop to see which pages and links work: the pages you open, your browser and an
  approximate city. We don't use cookies for this, don't store your IP address, and can't tell who you are from it.
  Visit records are deleted after 90 days."
- **MED-7, forged product ids:** migration 0003 caps `product_daily` and `vitals_daily` at the top 1,000 products per
  shop-day in the fold (it can't go in 0002, which is applied).
- **LOW:**
  - Forged text in the Console: referrer hosts and utm values render as text, never as links (A2·4).
  - `purchase` comes from a sessionStorage flag set just before checkout leaves for the order page, never from the
    static order page, and no order id or token is in a marker.
  - The `/fe.js` exemption is exact (anchored with `$`), with tests that `/fe.js/x`, `/fe.json`, `/FE.JS` and
    `/fe%2ejs` still rewrite.
  - Data-centre ranges stay cut (YAGNI in the plan): Bot Protection, the firewall rate rule and `isBot` cover them,
    and nothing is billed on tier-0 counts.
  - `fe.js` never reads `href`, `hash`, `document.URL` or cookies, never writes to the DOM, refuses to run in a frame,
    and checks `data-pid` is a uuid. `check:storefront-build` greps for these.
  - Origin on `sendBeacon` is confirmed in Chromium by e2e. Firefox and WebKit aren't installed here: a manual check
    on a phone before go-live.

### speed-reviewer on the A2·2 amendment (2026-11-11): within budget with conditions; folded in
- **HIGH 1, the lookup:**
  - `requireShop`, cached 60 s, never `tenantForHost`;
  - checks that need only headers run first;
  - the miss memo and both caps are bounded at 5,000 keys.
- **MED 2, caching:**
  - `/fe.js` and `/api/shop/e` are out of the middleware matcher;
  - `/fe.js` is `public, max-age=31536000, immutable`;
  - `v` is the file's content hash (`BEACON_VERSION`), and `check:beacon` fails a stale file or version.
- **MED 3, soft navigation:**
  - a view only when the pathname changes, so the size guide's same-URL entry and `replaceState` aren't counted;
  - markers are read after `setTimeout(0)` and again at flush, de-duplicated by kind, product and path;
  - a `window.__fe` guard.
- **MED 4, the switch:** the tag is tied to the environment only (`ANALYTICS_INGEST_ON` and the URL), never an Admin
  flag baked into cached pages. A2·5's Admin switch goes in the route (drop and 204, from a 60 s flag).
- **MED 5, purchase:** a sessionStorage flag set by the checkout just before it leaves for the order page, read once.
  No server write.
- **MED 6, the build:** esbuild from `src/beacon/fe.ts`, sharing A·1's `landingParams`, with `ERASED_KEYS` made
  pure-annotated so it drops out. 1,649 B gzip (ceiling 1.7 kB; the reviewer's 1.6 kB had no room for the security
  checks). The budget gate prints each page with the beacon: product 122.2, checkout 121.8.
- **LOW, done:**
  - the beacon has its own landing key (`fe.l`);
  - one queue is emptied by whichever of `visibilitychange` and `pagehide` comes first;
  - bodies are cut under 7,000 characters;
  - a back-forward restore counts a view;
  - vitals carry the hard-load product, and INP is the slowest interaction.
- **LOW, open:**
  - a real Instagram in-app browser test before go-live (flush the landing after load if events go missing there);
  - `pair-add` credits `add_to_cart` to the page's product;
  - the analytics project's region (owner: check Settings › General; ADR-0011 records it once known).
- **Test limit found while building:** headless Chromium here delivers nothing sent during unload (frata-gotchas). The
  flow hides the tab before full navigations, and the phone check covers the unload send.

## A2·2 as built (2026-11-11, branch only)
- `src/beacon/fe.ts` → `public/fe.js` (`npm run build:beacon`; `check:beacon` in `npm test`), mounted by
  `ShopShell` when `capture && isCountingVisits()`.
- `/fe.js` is exempted from the shop rewrite by exact name (tested), skipped by the middleware, and cached immutable.
- Markers: `view_item` on the product page, `begin_checkout` on the checkout page, and `purchase` from the
  checkout's `fe.p` flag.
- The route `src/app/api/shop/e/route.ts` → `src/lib/analytics/ingest.ts`, in `ANALYTICS_IN_APP` and `ENTRY_POINTS`.
- Pure: `src/domains/analytics/event.ts`, `device.ts`, `visitor.ts` (tests in `__tests__/beacon.test.ts`).
- `drizzle-analytics/0003_product_cap.sql`: the 1,000-products cap. The proof is now 14 checks.
- `ops/firewall.json`: the rate rule first, and the preview bypass kept off `/api/`.
- e2e `71-traffic` passes 4 steps: the tag and the file, a phone visit (landing source, soft view, product, bag,
  checkout), the fold, and the refusals.
- **Before counting goes live (owner):**
  1. paste 0003 (`FROM=0003 node scripts/ops/analytics-paste.mjs`);
  2. the Firewall changes in the dashboard (the rate rule first, the bypass conditions);
  3. the privacy sentence, approved with the lawyer;
  4. `ANALYTICS_INGEST_ON=1`, Production only;
  5. a phone check: Chrome, Safari and Instagram's in-app browser each show events after the tab is left.

### impact-reviewer and security-reviewer on A2·2 as built (2026-11-11), folded
- **HIGH (impact), the product cap deleted counted views.**
  - 0003 now replaces `analytics_fold()`, not the rollup. A shop-day names at most 1,000 products. A product already
    named always adds; a new one is named only while there is room. The rest add to one row,
    `ffffffff-ffff-ffff-ffff-ffffffffffff` ("other products"). Per-product vitals are kept only for named products.
  - Proved over two folds: a named product's views carry across, a new product past the cap goes to "other products",
    and all 1,010 views are counted.
  - 0003 was never applied anywhere live, so it was changed in place.
- **MED, fixed:**
  - a paired piece's add to bag names its own product (`openBag(variant, product)`);
  - an odd path is "other", never a lost beacon;
  - only an Indian mobile shape counts as a phone (numeric campaign ids stay);
  - a phone-shaped creator code is dropped;
  - lone surrogates are refused, and the beacon cuts by code point;
  - Pinterest, Telegram, LinkedIn and Cubot users are not bots (tested);
  - `check:beacon` also fails a cost field;
  - the shared rules live in `beacon-rules.ts`;
  - a lookup failure is a 503 logged by its name only;
  - `networkOf` handles brackets and zone ids.
- **MED-A (security), the privacy policy:** while visits are counted (`countsVisits` from `isCountingVisits()`), the
  shop's privacy policy drops "nothing else without asking you" and says what is counted. Tested. A merchant's own
  rewritten policy is theirs; the owner's wording review covers ours.
- **e2e `71-traffic`, now 5 steps:**
  - the policy says visits are counted;
  - Web Vitals arrive;
  - one purchase per order, and a reopened order page is not another;
  - a body with no length is cut as it streams (413).
- **Left, with reasons:**
  - the 429 caps, "counting off" and the in-flight cap have no automated test (the e2e stack runs with counting on,
    and the caps need 120+ requests a minute; they are 10 lines each);
  - the WAF's IPv6 keying (per address or per /64) is unconfirmed;
  - shop domains must be DNS-only (a proxy would merge visitors under its edge IPs), so note it in the Connect
    dialog's help (D·2) later;
  - a forged Origin can crowd out a shop's beacons on one instance (tier 0, accepted; revisit with A2·5);
  - `CLAUDE.md`'s `npm test` list doesn't name `check:beacon` (proposed to the owner).

## Owner, 2026-11-11 (A2·2 go-live steps)
- Region of frata-analytics: ap-south-1 (South Asia, Mumbai).
- The privacy wording while visits are counted: **approved**.
- `ANALYTICS_INGEST_ON=1` set in Vercel (Production); the `/api/shop/e` rate rule added. The link-preview bypass
  conditions and migration 0003 are pending, and the code isn't on `main` yet, so nothing is counted in production.
- The e2e failures in addresses and domains (Make main) also fail on `main` (964fdc0), so they predate A·2.
