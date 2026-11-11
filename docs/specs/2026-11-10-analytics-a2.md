# A·2 · Traffic, counted by Frrata (replan)
Status: approved (owner, 2026-11-11: "A.2 traffic mockup is approved, go with your recommendations") · Date: 2026-11-10 · Parent: `docs/specs/2026-11-07-analytics.md` (owner calls 1–6) and
`docs/specs/2026-11-08-analytics-a1.md` (built and live) · Mockup: docs/mockups/2026-11-10-analytics-a2.html (https://claude.ai/artifact/5rTrvSAfDZMGoPwCJSRBVF) · Approved: owner 2026-11-11, calls 1–5 as recommended

The owner asked whether to build our own traffic analytics instead of GA4, or use Vercel for now. This file rechecks the
7 Nov answer against what changed today (Vercel paused for CPU; prices rechecked), then replans A·2.

## The answer
**Build our own (A·2), after Vercel Pro (done 2026-11-11) and a home for the analytics database (cached shop pages: already true). Don't put Vercel Web Analytics or GA4 on
the shops.** These are two separate questions with two separate tools:

| Question | Who asks | Tool |
|---|---|---|
| Where did shoppers come from, what did they look at, and which visits became delivered orders and profit? | The merchant | **A·2 (ours)**: a first-party counter, joined to A·1's orders by source |
| What is hitting our servers, bots included, and what does it cost? | Frrata staff | **Vercel Firewall and Observability** (built in, on Pro) and Admin › Infrastructure (mockup 2026-11-10) |

A counting script only sees browsers that run it, while most bots never do. Bots drive the cost, so the cost question
is answered on the server side, never by an analytics script.

## Why not Vercel Web Analytics (rechecked 2026-11-10)
- **Price:** $0.03 per 1,000 events on Pro, with none included; UTM needs Web Analytics Plus at $10 a month; events are
  shared across all of the team's projects (vercel.com/docs/analytics/limits-and-pricing, updated 2026-08-25).
- **It can't split by merchant in the console:** it counts the whole `frata` project. A per-shop view would mean
  querying Vercel for every console page, by host.
- **It can't join to orders:** "visits by channel → delivered → ₹ kept" is the reason for A·2, and only our own data
  joins to `orders`.
- **Another script on every shop page:** the product page is at 120.6 of 121 kB of first-load JS.
- **Cost (estimates; 1.5 events per page view, 30,000 page views per shop a month):**

| Shops | Vercel Web Analytics + Plus | Ours (ingest + analytics database) |
|---|---|---|
| 20 | ≈ $37 a month | ≈ $11 a month (a Micro project; ingest ≈ $1 per million page views) |
| 500 | ≈ $685 | ≈ $80–130 |
| 1,000 | ≈ $1,360 | ≈ $140–230 |

GA4 on shops stays out of scope, as decided on 7 Nov. A merchant who wants GA4 gets it fed server-side from orders in
A·3 (Measurement Protocol), with consent. No GA4 script runs in shoppers' browsers.

## What changed since 7 Nov
1. **Cost is now the first risk.** Vercel paused production on 10 Nov when Hobby's 4 CPU-hours ran out (the cost
   guardrails runbook, `docs/runbooks/cost-guardrails.html`). A·2 adds one server request per page view, so it comes
   **after**:
   - Vercel Pro and its spend limit;
   - shop pages served from cache (otherwise the page and its beacon both run on the server). **Already true**, checked
     2026-11-11: every shop page is `force-static` with `revalidate = 60` and answers `x-vercel-cache: HIT`;
   - the time limits (15 s per page, a 10 s query timeout).
2. **The ingest must be the cheapest request we have:**
   - one `sendBeacon` per page, on `pagehide`, with the page's events batched;
   - `/api/shop/e` skipped by the middleware, with the host resolved in the route itself;
   - an answer of 204 at once and the insert in `after()`;
   - target CPU under 5 ms. `speed-reviewer` measures it.
3. **Supabase Free has to go before A·2:** Free pauses after a week idle, and allows 2 projects
   (`frata-integrations` § Infrastructure usage, 2026-11-10).
   - A Pro org covers one default-size project with its $10 credit.
   - The separate analytics project adds its own compute: Micro ≈ $10 a month.
4. **The product page has no JS room:** PV1-4a's island split frees ≥ 1.5 kB. The beacon must stay under 1 kB gzip, in
   the shop shell, not the product page.
5. **Admin › Infrastructure** (mockup 2026-11-10) reads A·2's human page views per shop for "Top shops". Bot requests
   come from the Firewall view.

## Unchanged from the parent spec
- Tier 0 counting needs no cookie and stores no IP: the visitor is an HMAC of a daily salt with tenant, IP and UA, and
  the salt is deleted daily. No banner is needed.
- The tenant comes from the host, never the body.
- A separate analytics Postgres: partitions in a schema with no grant; rollups keyed tenant-first; `verify:tenancy` on
  a second throwaway database.
- One `classifySource()` (built in A·1) on both sides; the join is by (day, channel), never by person.
- `isbot` and data-centre ranges, applied before the IP is dropped.
- Nothing is billed or blocked on tier-0 numbers, which can be forged.

## Phases (each verified before the next; mockup first)
- **A2·0 Prerequisites, mostly the owner:**
  - Vercel Pro with the guardrails;
  - a Supabase Pro org;
  - the analytics project in Mumbai, with the Data API off;
  - shop pages served from cache and the time limits (from the runbook);
  - PV1-4a's island split.
- **A2·1 Analytics database and its locks:**
  - `src/lib/db/analytics.ts`, its own pool and tenant transaction;
  - `drizzle-analytics/`, whose first migration holds the roles, `app_current_tenant()` and the default-privilege
    revokes;
  - an events parent with RLS; daily partitions in an ungranted schema;
  - `check:tenant` reads both folders; `verify:tenancy` proves that reading a partition fails and that two tenants never
    merge in a rollup.
- **A2·2 Beacon and ingest:**
  - in `src/domains/analytics/` (pure): the event schema (Zod), the device and in-app parser, the hash input;
  - the shell island (page_view, view_item, add_to_cart, begin_checkout, and Web Vitals from Next);
  - `src/app/api/shop/e/route.ts` (≤ 8 KB, known fields only, Origin checked, capped per tenant per minute);
  - a Vercel Firewall rate rule; the middleware skip.
- **A2·3 Rollups:**
  - `traffic_daily` and `funnel_daily` (tenant × IST day × channel × device × in-app × top-N city), every 15 minutes by
    pg_cron in the analytics project, recomputed per day idempotently;
  - raw partitions dropped after 90 days (call 4).
- **A2·4 Console › Analytics, Traffic:**
  - visitors, channels, devices, the in-app share and cities;
  - the funnel: visit → product → bag → checkout → order → delivered;
  - per channel, orders per 100 visits and ₹ kept per visit, joined to A·1;
  - states: no traffic yet; too few visits to judge; phone.
- **A2·5 Admin:**
  - platform totals and ingest health through a definer of aggregates;
  - per-shop human page views for Admin › Infrastructure.

## Owner calls (recommendation first)
1. **Build our own (A·2)** · use Vercel Web Analytics for the merchant view. The 7 Nov call 1 stands, on the rechecked
   price.
2. **After the prerequisites in A2·0** · start A·2 now on Hobby and Free. Starting now isn't possible: Hobby can't
   buy usage, and Free has no room for a second project.
3. **A separate analytics project, about $10 a month** · events in the main database for the first months. Separate
   keeps a festive spike in events from slowing orders (7 Nov call 3).
4. **Raw events for 90 days, rollups for 2 years** · raw for 1 year (DPDP Rule 8(3), a lawyer question, still open).
5. **Visitor counts in every plan** (as A·1 put ₹ kept by source in every plan) · in True Profit only. This is a
   pricing call, so `unit-economics-reviewer` runs before it is decided.

## Before execution (frata-planning)
- The A·2 mockup (the Traffic section, phone first), then sign-off.
- `architecture-reviewer`, `tenancy-auditor`, `speed-reviewer` (ingest cost, bundle bytes), `security-reviewer` (the
  public ingest) and `unit-economics-reviewer` (call 5) run on the plan.
- `integration-researcher` rechecks Supabase pg_cron on Pro and the Vercel Firewall rate-rule price, which is
  "Regional" on the WAF pricing page, before A2·2.
