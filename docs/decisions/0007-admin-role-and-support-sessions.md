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
- **A new column on a table `frata_admin` reads table-wide reaches Admin too.** `shop_settings` is one (0008): its
  shipping-cost estimates (Ship 0044, 2026-11-08) are readable by `frata_admin`, accepted because Admin reads no
  cost column and support needs the shop's settings. Each later column on such a table makes this choice in its
  migration's header, on purpose (tenancy audit 2026-11-08).

## Why
Admin's job is to see across merchants, which the tenant policies forbid by
design. A role whose reach is one readable migration is easier to review than a
dozen hand-written definer functions, and it keeps `frata_app` exactly as narrow
as before. Reviewed by architecture-reviewer and tenancy-auditor (2026-11-06).

## Staff 2FA
Not required for now (owner, 2026-11-06). `requireStaff` is the one place an aal2
check is added when it is.

**Amended (owner, 2026-11-12):** staff move from email codes to passkeys. **No authenticator app** (owner, 2026-11-12:
"drop the authenticator app"): each person keeps two passkeys, and a lost device is replaced through a request whose
code another admin approves. Frrata checks the passkey itself (Supabase's passkeys are experimental); the check is
inside `app_access_for`, so support visits need it too; `frata_admin` has no reach into the `staff_*` tables (definers
only). Spec: `docs/specs/2026-11-12-staff-passkeys.md`.
Order: GitHub and the package registry before the first kit release; Admin before Frrata hosts shop websites (V2).
`requireStaff` then requires a live passkey step-up, with no branch-protection bypass for staff accounts. Source:
`docs/specs/2026-11-12-kit-and-fleet.md` § 7 (security review H3).

## Amendment (owner, 2026-11-16): a switch that turns passkeys off for testing
The owner: "offer me option to turn off pass key, currently I feel they are frictions … we should be able to turn it
on when we want … I want to be able to test the system without any frictions." While a `passkeys_off` row in
`platform_switches` is live (`until` in the future, at most 7 days from when it was set), getting in counts as
checked for people who already qualify: staff, and live partner people (owners, leads and Builders). What still needs a
real passkey: adding, approving, listing and removing passkeys, for staff and partners and from Admin (security review
2026-11-16 H1: otherwise a passkey enrolled with an inbox alone would outlive the switch). Signing in still needs the
email; roles and store access don't change; the row ends by itself; a trigger writes an audit row for every change. No
role can read or write the switch: Frrata's operator sets it in the Supabase SQL editor on the owner's word
(`docs/setup.md` § Passkeys off). While it is on, a staff inbox alone opens Admin and support visits (S5 reopened for
the window), so it stays off once real merchants trust the platform. Proof: `scripts/verify/tenancy.sql` § 88.
