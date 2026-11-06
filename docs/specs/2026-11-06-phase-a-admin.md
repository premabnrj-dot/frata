# Phase A — Frata admin (A1 staff access and merchants, A2 plans and packages)
Status: draft · Date: 2026-11-06 · Mockup: https://claude.ai/artifact/7mikx6osVqgKjs84oERW5k · Approved: pending

## Goal
Enables every ranked problem: no merchant sells until Frata can add them, put
them on a plan and help them set up. Measure: first merchant onboarded by hand;
every merchant on a plan version.

## Job
Frata staff add merchants, put them on a plan, and work inside a merchant's
console to set them up — visibly, briefly, and on the record.

## Research (2026-11-06)
- **Support impersonation** (WorkOS, Yaro Labs, SSOJet, AppMaster blogs — practice,
  not a standard): both identities on every event with reason and session id;
  persistent banner; expiring sessions, alert past 2 h; role-limited; separate,
  immutable log. Taken: reason + length before entering, banner with time left
  and End, every write records staff + tenant + session, Admin/Support roles only.
- **Shopify collaborator accounts**: owner approves scoped access. Taken: merchant
  sees every visit; approval deferred until self-serve sign-up (owner call 1).
- **Stripe Entitlements / Makerkit**: features defined once, attached to plans,
  derived not stored per customer; flags apart from numeric limits. Taken: plan
  version holds flags + included orders; one pure function answers access.
- **Supabase MFA**: enforce aal2 server-side on every protected request. Taken:
  requireStaff checks aal2 on every admin page and action.

## Design
Nine artboards: overview; where-to after sign-in (+ 2FA); merchants list; one
merchant; add merchant; open console (support); console in support mode; plans;
change plan.

## Owner calls
1. Entering a console: reason required, merchant notified (recommended) vs owner approves first.
2. In support mode: full owner rights, all logged (recommended) vs read-only.
3. Per-order fee per plan: values needed; charged on delivered orders (recommended).
4. Past included orders: keep selling, flag, suggest next plan (recommended).
5. Staff 2FA required (recommended).
6. Admin at /admin on the console host, same sign-in (recommended).

## Out of scope
Charging and GST invoices (Phase 6) · revenue dashboards · owner-approved access
requests (with self-serve sign-up) · own domains (Phase 6).

## Design review
After sign-off, with the plan; tenancy-auditor first on support mode (it is the
one place a staff identity acts inside a tenant). Known areas: `platform_staff`,
`support_sessions`, `audit_events` (append-only), `plans`/`plan_versions`,
`tenant_plans`; requireStaff + aal2; how a support session becomes the tenant id
for withTenant without a URL-supplied id; expiry enforced on the server per request.
