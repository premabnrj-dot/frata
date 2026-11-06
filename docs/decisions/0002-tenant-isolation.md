# ADR-0002: Tenant isolation is two locks — a row policy and a tenant transaction

Status: accepted · 2026-11-06

## Decision
- One Postgres, shared schema, `tenant_id` on every merchant-owned row.
- The app connects as `frata_app` (NOBYPASSRLS, not the table owner).
- Every tenant table has RLS enabled and a policy comparing `tenant_id` to
  `app_current_tenant()`, which reads `app.tenant_id`.
- `withTenant(id, fn)` (`src/lib/db/tenant.ts`) sets `app.tenant_id` with
  `set_config(…, true)` — transaction-local — and queries ALSO filter by
  `tenant_id` explicitly. Merchant rows are read only via `src/lib/queries/`.
- Two SECURITY DEFINER functions answer the only pre-tenant questions: which
  tenant owns this host, and which tenants this user belongs to.
- Supabase's `anon` and `authenticated` roles hold no grant on any table.

## Why
A leak across merchants ends the company. Application filtering alone fails
on the first forgotten `where`; RLS alone fails on the first query run as the
owner. Together, one has to fail AND the other be bypassed.

Transaction-local, not session: Supabase's pooler shares a connection between
requests, so a session `SET` would carry one merchant's id into another's request.

## Differs from Ekatan
Ekatan (ADR-0004 there) enables RLS with **no** policies and connects as the
owner: right for a single-business ERP where every reader is staff. Frata is
multi-tenant, so the database itself must know whose row is whose.

## Proof
`npm run check:tenant` (shape) and `npm run verify:tenancy` (behaviour, on a real
Postgres; CI runs it on every push).
