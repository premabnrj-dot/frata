# Plan — Phase A: Frata admin (A1 + A2)
Status: built 2026-11-06 (A1 + A2) · Spec: docs/specs/2026-11-06-phase-a-admin.md (approved 2026-11-06)
Mockup: https://claude.ai/artifact/7mikx6osVqgKjs84oERW5k · Decision: docs/decisions/0007-admin-role-and-support-sessions.md

Reviewed 2026-11-06 by architecture-reviewer, tenancy-auditor and
unit-economics-reviewer. Every finding is fixed below or listed under
"Kept against a reviewer" / "For the owner".

## Shape

A third surface, `src/app/(admin)/admin/`, behind `requireStaff`, on the console
host. Admin reads across tenants through a second role, `frata_admin`
(NOBYPASSRLS, not owner), whose reach is listed table by table below. Staff inside
a merchant's console run as `frata_app` inside `withTenant`, like the merchant.

## Grants (the whole reach of each role)

| Table | frata_app | frata_admin |
|---|---|---|
| tenants | tenant policy (as now) | select, insert, update — **no delete** |
| tenant_domains | tenant policy | select, insert |
| members | **select only** (writes only via `app_claim_invites`) | select |
| orders | tenant policy | **none** — counts via `app_admin_order_counts(since)` |
| outbox, webhook_events | as now | **none** |
| platform_staff | none (via `app_access_for`) | select, insert, delete |
| invites | none (via `app_claim_invites`) | select, insert, update(revoked_at) |
| support_sessions | select (own tenant) | select, insert, update(ended_at) |
| audit_events | insert (check tenant), select (own tenant) | insert, select — never update/delete; FK `on delete restrict` |
| plans, plan_versions | select | select; plan_versions insert |
| tenant_plans | select (own tenant) | select, insert — never update; unique (tenant_id, starts_at) |

Every new table: `revoke all … from anon, authenticated`, RLS enabled, policies per role.
`frata_admin` gets the same statement/lock/idle timeouts as `frata_app`.

## Tables (0004 drops tenants.plan, 0005 generated tables, 0006 custom access)

- `platform_staff` (user_id pk, email, role admin|support, created_at, created_by)
- `invites` (id, tenant_id, email lower-case CHECK, role CHECK, created_by, created_at, expires_at default +14 d, accepted_at, revoked_at)
- `support_sessions` (id, tenant_id, staff_user_id, staff_email snapshot, reason CHECK, note, started_at, expires_at, ended_at; index (staff_user_id) where ended_at is null)
- `audit_events` (id, at, tenant_id?, actor_user_id, actor_email, actor_kind member|staff|support, support_session_id?, action, target, detail jsonb; indexes (tenant_id, at desc), (at desc))
- `plans` (id, code CHECK, name, position)
- `plan_versions` (id, plan_id, version, monthly_price paise, included_orders, fee_bps, features text[] CHECK ⊆ FEATURES, created_at, created_by; unique (plan_id, version)) — **features live on the version**: a feature change is a new version, like a price change.
- `tenant_plans` (id, tenant_id, plan_version_id, starts_at, trial_ends_at?, custom_monthly_price?, reason?, created_by, created_at; CHECK custom price ⇒ reason; unique (tenant_id, starts_at); index (tenant_id, starts_at desc))
- `tenants`: + `is_internal`; **drop `plan`** (derived from tenant_plans).
- Seed: launch/growth/scale v1 = ₹1,499/150/200 bps/{}; ₹4,999/1,500/100/{rto_shield,size_fit,cart_flows}; ₹14,999/5,000/50/{same}. `demo` → Launch v1, internal.

## Definer functions (owner postgres, `set search_path = ''`, `revoke all from public, anon, authenticated`, then one grant)

- `app_access_for(uid) → jsonb {staffRole, memberships[{tenantId, tenantName, role, supportSessionId}]}` — EXECUTE frata_app. Replaces `app_memberships_for` (dropped). Support rows only when the session is active AND the staffer is still in platform_staff; one row per tenant, the support row preferred. One round trip gives the console both the membership and the staff link.
- `app_claim_invites(uid)` — EXECUTE frata_app. Only if `auth.users.email_confirmed_at is not null`; `lower(email)` match; unexpired, unrevoked; one `update … where accepted_at is null returning`, then `insert into members … on conflict do nothing`.
- `app_user_directory(uuid[]) → id, email, last_sign_in_at` — EXECUTE frata_admin.
- `app_find_confirmed_user(email) → uuid` — EXECUTE frata_admin (adding staff).
- `app_admin_order_counts(since) → tenant_id, n` — EXECUTE frata_admin.

## Engines (done, `src/domains/`)

`plans/entitlements.ts`, `support/session.ts`, `access/route-after-sign-in.ts` — 45 tests.

## Server

- `parseDatabaseUrl(raw, role)`: `db()` accepts only `frata_app`; `adminDb()` (`src/lib/db/admin.ts`, max 2) only `frata_admin`.
- `requireStaff(roles)` (`src/lib/auth/require-staff.ts`): getUser → `app_access_for`; returns `StaffOk` or a refusal; never throws. The aal2 check goes here if 2FA is turned on.
- `requireMember`: reads `app_access_for`; result gains `supportSessionId`, `staffRole`.
- `asMember(roles, work)` (`src/lib/auth/as-member.ts`): requireMember → withTenant → work → if in support mode, an audit row in the same transaction. Every console server action uses it (`check:actions`).
- `src/lib/admin/*.ts`: every exported function takes `staff: StaffOk` first; `import 'server-only'`; no `'use server'`. Staff admin actions all write `audit_events`.
- Support start (`src/app/(admin)/admin/merchants/[id]/support/actions.ts`, the one sanctioned form tenant id): Zod uuid, tenant must exist, `staff_user_id` from requireStaff, ends that staffer's other active session, cookie `frata_tenant` httpOnly/secure/sameSite=lax, redirect `/console`. End: `endSupport` via frata_admin, update(ended_at) only.
- `removeStaff`: deletes the platform_staff row and ends their sessions in one transaction (access already stops: app_access_for joins platform_staff).
- Auth callback: `app_claim_invites`, then `routeAfterSignIn`.
- Middleware: signed-out `/admin` and `/choose` → `/login`.

## Gates

- `check:tenant`: `@/lib/db/admin` only from `src/lib/admin/**`; `@/lib/admin` only from `src/app/(admin)/**`; no `'use server'` in `src/lib/admin/`; no `withTenant(` in `src/app/(admin)/**`.
- `check:actions`: `requireStaff` a chokepoint; `src/app/(admin)/**/page.tsx` must call `requireStaff(`; console `'use server'` files must call `asMember(`.
- `check:config`: `ADMIN_DATABASE_URL` owned by `src/lib/env.ts`.
- `check:states`: `src/app/(admin)/admin` has `error.tsx`.

## Proof (`scripts/verify/tenancy.sql`, plus a live rolled-back run)

frata_app: cannot read another tenant's support_sessions / tenant_plans / audit_events; cannot read platform_staff, invites; cannot insert members; cannot update or delete audit_events; cannot update support_sessions. app_access_for: support row only while active, gone when expired or the staffer is removed; prefers support row. claim_invites: ignores unconfirmed email, other emails, expired/revoked invites. frata_admin: reads all tenants; cannot read orders, outbox, webhook_events; cannot delete tenants or audit; cannot update plan_versions, tenant_plans. Every `app_*` function: no EXECUTE for public/anon/authenticated. Both roles NOBYPASSRLS.

## UI

As drawn (`frata-design-language` § Frata Admin). `/choose`; `/admin/merchants` (50 a page, orders this month), `/new`, `/[id]`, `/[id]/support`, `/[id]/plan`; `/admin/plans`, `/admin/plans/[code]` (new version: price, included, fee, features); `/admin/staff`; `/admin/activity`. Console: support banner, "Frata Admin" link for staff, `/console/activity`.

Stated deviations from the mockup: "Setup" shows owner signed-in status (the checklist's data arrives with Phase 1); a feature change makes a new plan version (the mockup said it applied to everyone at once — that would rewrite agreed plans).

## Kept against a reviewer (owner-approved in the mockup)

Trial end date and custom price (YAGNI suggested cutting); the `/choose` screen; editing features (now as a new version).

## For the owner

1. Fee reading: on every delivered order (built this way, nothing is charged until Phase 6) vs only beyond the included orders.
2. Fee base: order value excluding GST and shipping (built this way).
3. Launch is ₹270/month dearer than Shopify Basic + a checkout app for the reviewer's illustrative shape, before any WhatsApp-tool saving.

## Order of work, each with its check

1. Migrations 0004/0005 + schema → `npm run verify:tenancy` (throwaway PG) green, new cases included.
2. db/admin, url roles, requireStaff, access, asMember, audit → `npm test`, `npm run typecheck`.
3. Admin lib + pages + console changes → `npm test`, `npm run build`, local run with both roles (curl + Playwright).
4. Supabase apply + live rolled-back proof + advisors → advisors clean.
5. Deploy → runtime errors none; owner sets `frata_admin` password and `ADMIN_DATABASE_URL` (Production only).
