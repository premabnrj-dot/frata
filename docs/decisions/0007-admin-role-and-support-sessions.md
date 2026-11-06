# ADR-0007: Admin reads through a second role; staff enter a store through a support session

Status: accepted · 2026-11-06 · amends ADR-0002

## Decision
- **`frata_admin`**, a second login role (NOBYPASSRLS, not the owner), is the only
  way to read across tenants. Its reach is listed table by table in
  `drizzle/0006_admin_access.sql`; it has no access to orders' rows, the outbox or
  webhooks. It connects through `ADMIN_DATABASE_URL`, set for **Production only**,
  owned by `src/lib/db/admin.ts`, imported only from `src/lib/admin/**`, which is
  imported only from `src/app/(admin)/**` and every function of which takes a
  verified `StaffOk` (`check:tenant`).
- **Staff inside a merchant's console** run as `frata_app` inside `withTenant`,
  exactly like the merchant. The tenant still comes only from a definer function
  (`app_access_for`), which includes a support session while it is active and the
  staffer is still staff. The `frata_tenant` cookie is a selector, honoured only
  if that function returns the tenant.
- **One sanctioned form-supplied tenant id**: the support-start action in
  `src/app/(admin)/admin/merchants/[id]/support/actions.ts`, where the caller is
  verified staff choosing a merchant on purpose.
- In support mode every write is audited in the same transaction (`asMember`).
  Members cannot be added by `frata_app` at all (only `app_claim_invites`, which
  requires a confirmed email), so a support visit cannot leave access behind.
- Definer functions: `app_access_for`, `app_claim_invites` (frata_app);
  `app_user_directory`, `app_find_confirmed_user`, `app_admin_order_counts`
  (frata_admin). Each revokes EXECUTE from public, anon and authenticated —
  Postgres grants PUBLIC EXECUTE by default and Supabase exposes functions over RPC.

## Why
Admin's job is to see across merchants, which the tenant policies forbid by
design. A role whose reach is one readable migration is easier to review than a
dozen hand-written definer functions, and it keeps `frata_app` exactly as narrow
as before. Reviewed by architecture-reviewer and tenancy-auditor (2026-11-06).

## Staff 2FA
Not required for now (owner, 2026-11-06). `requireStaff` is the one place an aal2
check is added when it is.
