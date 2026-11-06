# Plan — Phase A: Frata admin (A1 + A2)
Status: in review · Spec: docs/specs/2026-11-06-phase-a-admin.md (approved 2026-11-06)
Mockup: https://claude.ai/artifact/7mikx6osVqgKjs84oERW5k

## Shape

Admin is a third surface: `src/app/(admin)/admin/`, behind `requireStaff`, on the
console host (`/admin`). It reads ACROSS tenants, which the tenant policies forbid
to `frata_app` — so Admin gets its own database role and connection.

### Decision: a second role, `frata_admin`, not SECURITY DEFINER functions

- `frata_admin`: LOGIN, NOBYPASSRLS, not the owner. Policies `admin_all ... to
  frata_admin using (true) with check (true)` on the tables Admin needs; nothing
  on tables it does not. Connection `ADMIN_DATABASE_URL` (owner sets the password,
  as for frata_app). Owned by `src/lib/db/admin.ts`, lazy, URL checked by
  `parseDatabaseUrl` (user must be `frata_admin.<ref>`).
- Import of `@/lib/db/admin` allowed only in `src/lib/admin/**` (`check:tenant`).
  Every file there starts `import 'server-only'`.
- Why not definer functions for every admin read: a dozen hand-written SQL
  functions is more code to review than normal drizzle under a role whose reach
  is listed in one migration. The two locks for Admin become: the role's policies
  (what Admin can touch at all) + `requireStaff` (who may use Admin).
- `frata_app` keeps its exact reach. The support path (staff inside a merchant's
  console) runs as `frata_app` inside `withTenant`, like the merchant does.

## Data (migrations 0004 generated + 0005 custom)

| Table | Scope | frata_app | frata_admin |
|---|---|---|---|
| `platform_staff` (user_id pk, email, role admin\|support, created_at, created_by) | platform | none (read via `app_staff_role(uid)` definer fn) | all |
| `invites` (id, tenant_id, email, role, created_by, created_at, accepted_at) | tenant | none (claimed via `app_claim_invites(uid)` definer fn) | all |
| `support_sessions` (id, tenant_id, staff_user_id, reason, note, started_at, expires_at, ended_at) | tenant | select own tenant (merchant's Activity); update `ended_at` own session | all |
| `audit_events` (id, at, tenant_id?, actor_user_id, actor_kind member\|staff\|support, support_session_id?, action, target, detail jsonb) | append-only | insert with tenant check, select own tenant; NO update/delete grant | insert, select; NO update/delete grant |
| `plans` (id, code launch\|growth\|scale, name, position, features text[]) | platform | select | all |
| `plan_versions` (id, plan_id, version, monthly_price bigint paise, included_orders int, fee_bps int, created_at, created_by; unique plan+version) | platform | select | select, insert (no update: a price change is a new row) |
| `tenant_plans` (id, tenant_id, plan_version_id, starts_at, trial_ends_at?, custom_monthly_price?, reason?, created_by, created_at) | tenant | select own tenant | all |
| `tenants` + `is_internal boolean`; **drop `tenants.plan`** (now derived from tenant_plans — one fact, one place) | | | all |
| `tenant_domains`, `members` | | (as now) | all |
| `orders` | | (as now) | select (counts) |

Seed (in 0005): plans launch/growth/scale; v1 = ₹1,499 / 150 / 200 bps,
₹4,999 / 1,500 / 100 bps, ₹14,999 / 5,000 / 50 bps; growth and scale features
`{rto_shield,size_fit,cart_flows}`. Existing tenant `demo` → Launch v1, internal.
`check (tenant_plans.custom_monthly_price is null or reason is not null)`.

Definer functions (owned by postgres, `set search_path = ''`, EXECUTE to frata_app only):
- `app_staff_role(uid) → text|null`
- `app_memberships_for(uid)` — extended: UNION active support sessions
  (`ended_at is null and expires_at > now()`) as role `owner` with `support_session_id`.
- `app_claim_invites(uid)` — reads that user's email from `auth.users`, inserts
  `members` for unaccepted invites with that email, marks them accepted. Called
  from the auth callback; the tenant comes from the invite row, never the request.
- `app_user_directory(uuid[])` → id, email, last_sign_in_at — EXECUTE to frata_admin only.

## Pure engines (`src/domains/`)

- `plans/entitlements.ts`: `currentPlan(rows, now)` (latest `starts_at <= now`),
  `canUse(features, feature)`, `deliveredFee(netRevenue, bps)` (paise, via applyBps),
  `usage(ordersThisMonth, included) → { used, included, over }`.
- `support/session.ts`: `isActive(s, now)`, `minutesLeft(s, now)`, allowed lengths
  `[30, 60, 240]`.
- `access/route-after-sign-in.ts`: `{ isStaff, memberships } → '/admin' | '/console' | '/choose'`.

All unit-tested.

## Server

- `src/lib/auth/require-staff.ts`: `requireStaff(roles)` → `{ok, userId, email, role}`;
  `getUser()` then `app_staff_role`. Never throws; `not_configured` when
  `ADMIN_DATABASE_URL` is unset. (aal2 check slots in here if 2FA is turned on.)
- `requireMember` (existing): result gains `supportSessionId` when the membership
  came from a support session; `frata_tenant` cookie still only honoured if the
  function returns that tenant.
- `src/lib/audit.ts`: `audit(tx, { action, target, detail })` — actor derived from
  the MemberResult/StaffResult passed in, never from input.
- `src/lib/admin/*.ts` (frata_admin): `listMerchants`, `getMerchant`,
  `createMerchant` (tenant + domain + invite + tenant_plan + audit, one tx),
  `startSupport`/`endSupport`, `listPlans`, `newPlanVersion`, `setPlanFeatures`,
  `changeTenantPlan`, `listStaff`, `addStaff`, `removeStaff`, `listActivity`.
- Server actions in `src/app/(admin)/admin/**/actions.ts`: `requireStaff` first,
  Zod, call `src/lib/admin/*`, revalidate, human error. `check:actions` gains
  `requireStaff` as a chokepoint; admin `page.tsx` must call `requireStaff(`.
- Support start: action takes the tenant id from the form — the one sanctioned
  case, because the caller is verified staff choosing a merchant; sets
  `frata_tenant`, redirects to `/console`. End: sets `ended_at`, clears cookie.
- Auth callback: `app_claim_invites`, then route by `route-after-sign-in`.

## UI (as drawn; `frata-design-language` § Frata Admin)

- `/choose`, `/admin` → `/admin/merchants`, `/admin/merchants/new`,
  `/admin/merchants/[id]` (change-plan and open-console dialogs as pages-with-forms
  first: `/admin/merchants/[id]/plan`, `/admin/merchants/[id]/support`),
  `/admin/plans`, `/admin/plans/[code]` (new version + features), `/admin/staff`,
  `/admin/activity`; `error.tsx` for the surface (`check:states`).
- Console: support banner in the console layout; "Frata Admin" nav link when
  staff; `/console/activity` (support visits + audit for the tenant).
- Deviation from the mockup, stated: "Setup" shows owner signed-in status only —
  the 6-step checklist's data arrives with Phase 1.

## Proof and gates

- `scripts/verify/tenancy.sql` extended: frata_app cannot read another tenant's
  support_sessions / tenant_plans / audit_events / invites; cannot read
  platform_staff; cannot update or delete audit_events; memberships include a
  support session only while active (expired → gone); claim_invites only claims
  the user's own email; frata_admin can read all tenants and cannot delete audit.
- `check:tenant`: admin-db import scope; every new table has RLS + policy (existing).
- Live proof on Supabase via rolled-back DO block (frata-verify) after apply.

## Order of work

1. Migrations 0004/0005 + schema; local proof green.
2. Engines + tests.
3. requireStaff, admin db, audit, admin lib; gates updated.
4. Auth callback routing, /choose.
5. Admin pages (merchants, new, detail, support, plan), console banner/link/activity.
6. A2 pages (plans, versions, features, change plan).
7. Build, local run with both roles, Supabase apply + live proof + advisors, deploy.

## Owner steps after deploy

Set `frata_admin` password (hex) in SQL Editor; add `ADMIN_DATABASE_URL`
(Sensitive) in Vercel; redeploy. I add you to `platform_staff` as admin.
