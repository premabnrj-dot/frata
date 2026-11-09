# Search and sharing S·4 — Google Search Console and Google Shopping (PARKED)
Status: **parked** (owner, 2026-11-09) · Spec: `docs/specs/2026-11-09-seo-and-sharing.md` § S·4 ·
Plan for S·0–S·2: `docs/plans/2026-11-09-seo-and-sharing.md`

Everything needed to start S·4 again, in one place. Nothing here is built.

## What S·4 is
- **Connect Google** (Search Console): verify the shop's own address, submit its sitemap, show the searches and clicks
  that reach it in Analytics (and on Store › Search and sharing, S·3).
- **Google Shopping free listings** through **Merchant API v1** (the Content API was sunset 2026-08-18): products,
  prices, stock and the shop's return and shipping policy kept in sync from our rows through the outbox.
- **Meta catalogue** (Instagram product tags on Reels, open in India since 2026-03; WhatsApp catalogue messages): a feed
  from the same rows — built with roadmap Phase 5 (Channels).

## Owner steps (status 2026-11-09: not started)
The full click-by-click list is `docs/setup.md` § "Frrata's Google app". In short: own and verify **frrata.com** (Search
Console Domain property, DNS TXT); homepage, `/privacy` (Limited Use wording) and `/terms` on frrata.com; Cloud
projects **frrata-prod** and **frrata-dev**; enable Search Console API, Site Verification API, Merchant API; Google
Auth Platform: External, branding with `docs/brand/png/frrata-icon-120.png`, a Web client per project (secret shown
once → Vercel Production only); Data Access scopes (below) — **screenshot their categories**; Testing mode with ≤ 100
test users; verify and publish branding; Frrata's own Merchant Center account for `registerGcp`. Stage 2 (after the
build): YouTube Unlisted demo video, Publish app, submit for verification (~10 business days for sensitive scopes).

## Facts (frata-integrations § Google, checked 2026-11-09)
- Scopes, the smallest set: `https://www.googleapis.com/auth/webmasters` (sitemaps.submit, sites.add, queries),
  `https://www.googleapis.com/auth/siteverification.verify_only` (getToken + insert), `https://www.googleapis.com/auth/content`
  (Merchant API; ask incrementally, when Merchant Center is connected). Category of each: unverified until the console
  shows it.
- Apps in development/testing cannot be verified; the video must show each scope in use. Testing mode: refresh tokens
  expire after 7 days. Production unverified: 100 users for the project's lifetime — never publish before review.
- One Cloud project per tier; no wildcard redirect URIs → Vercel previews never use the prod client.
- Merchant API: `registerGcp` once per Cloud project on Frrata's own production Merchant Center; else 401.
- The callback must be on an authorized, verified domain → a frrata.com host (e.g. `app.frrata.com`), not
  frata.vercel.app. Depends on own domains (shop addresses D·2) / moving the console host.

## Binding requirements from the reviews (2026-11-09; must be in S·4's own plan)
- security-reviewer: only CAN_MANAGE may connect, never inside a support session; OAuth `state` HMAC-bound to user and
  tenant, single use, with PKCE; the callback takes the tenant from `requireMember`, never from `state`; verify a
  **URL-prefix property for the shop's host only** — never a domain property for the platform domain (that would hand
  one merchant every shop's Search Console, URL removal included); unverify and revoke on member removal or disconnect;
  refresh token sealed `seal(…, tenant, 'google_refresh')` — add a key id to `src/lib/crypto/secret-box.ts` first; the
  client secret in Production only (S1: Preview shares the production database).
- Outbox precondition (docs/setup.md): Vercel Pro and a definer-based claim before the first outbound sender ships —
  also holds S1·8 (Meta re-scrape) and S2·9 (IndexNow).
- Feeds carry price only — never a cost (ADR-0003); a test asserts it. AI-written titles/descriptions go in
  `structured_title`/`structured_description` with `digital_source_type=trained_algorithmic_media`.

## To start again
1. Owner confirms stage-1 steps are done and sends the scope-category screenshot.
2. integration-researcher rechecks anything older than 90 days.
3. Spec § S·4 → its own plan (tasks, verify commands), then architecture-reviewer, security-reviewer, tenancy-auditor.
