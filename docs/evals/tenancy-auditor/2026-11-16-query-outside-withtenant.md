# tenancy-auditor 1.0.0 — query-outside-withtenant

**Query:** Audit this proposed diff (it is not in the repo; read the repo only to compare with its rules). Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE**

**Gates and proof**
- I couldn't run `npm run check:tenant`, `npm run check:actions` or `npm run verify:tenancy`. Bash is disabled in this session, so I have no gate output to report.
- The diff isn't in the repo, so the gates would run against the repo as it is, not against these two files. I judged the diff by reading the rules and the sibling files (`saved-views.ts`, `0125_saved_views.sql`, `0126_saved_views_access.sql`, `tenant.ts`, `check-tenant.mjs`).
- `scripts/verify/tenancy.sql` has no `order_notes` rows. The diff doesn't touch it, so that is a finding (see below).
- I didn't check caching, the outbox, webhooks, logs or SECURITY DEFINER functions. The diff has none of them.

**Findings**

**CRITICAL `src/lib/queries/order-notes.ts:1-8`: the query runs on the raw connection with no tenant lock.**
- It imports the raw `db` and never calls `withTenant`.
- `check:tenant` rejects the raw db import (`scripts/check-tenant.mjs:93-96`), and the file has no `server-only` import. Fix the shape first, because the gate will fail on it.
- Once `order_notes` has a policy, a query outside `withTenant` returns nothing, because `app.tenant_id` is unset.
- Until then, the query returns any merchant's notes for any order id it is handed.
- The fix is to follow `saved-views.ts`:
  ```ts
  import 'server-only'
  export async function notesFor(tenantId: string, orderId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select({ id: orderNotes.id, body: orderNotes.body }).from(orderNotes)
        .where(and(eq(orderNotes.tenantId, tenantId), eq(orderNotes.orderId, orderId))))
  }
  ```
- The callers must pass `ctx.tenantId` from `requireMember()`.

**CRITICAL `order-notes.ts:7`: `db` is imported as a value, but `src/lib/db/index.ts:59` exports `db()` as a function.**
- `db.select()` will not typecheck. This is a second reason the file can't ship as written. The fix is the `withTenant` rewrite above, which removes the raw `db` entirely.

**CRITICAL `order-notes.ts:6`: `notesFor(orderId)` takes an id and no tenant.**
- The only filter is a caller-supplied order id. That is the "id from a URL" pattern ADR-0002 forbids.
- Adding the tenant parameter (above) fixes it. The explicit `tenant_id` where is required beside the policy.

**CRITICAL `drizzle/0150_order_notes.sql:1`: the table has no RLS, no policy and no grants.**
- This breaks the new-table checklist in `frata-architecture` § Tenancy and `.claude/rules/database.md`.
- If `anon`, `authenticated` or `service_role` have default grants, they can read the table. The repo revokes all three on every table (see `0126`).
- The fix is to add this to the migration, or to a paired `0151_order_notes_access.sql` as `0125`/`0126` do:
  ```sql
  revoke all on order_notes from anon, authenticated, service_role;
  alter table order_notes enable row level security;
  create policy tenant_rows on order_notes for all to frata_app
    using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant());
  grant select, insert on order_notes to frata_app;
  ```
- I chose select and insert only, like `saved_views`. Grant update or delete only if the product needs notes to be editable.

**HIGH `0150_order_notes.sql:1`: there is no foreign key from `tenant_id` to `tenants`.**
- Add `REFERENCES tenants(id) ON DELETE cascade`.
- `order_id` also has no foreign key. Use a composite `FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id)`, which needs a unique key on `orders(tenant_id, id)`. `saved_views_tenant_id_key` follows the same pattern.
- Without it, a note can point at another tenant's order.

**HIGH `0150_order_notes.sql:1`: there is no index.**
- Add an index on `(tenant_id, order_id)`.
- Without one, the order page scans every tenant's notes.

**HIGH `scripts/verify/tenancy.sql`: no `order_notes` rows.**
- The checklist requires a row per tenant, plus the cross-tenant read and write checks.
- Without them `verify:tenancy` proves nothing about this table, so add them and run it.

**MEDIUM `0150_order_notes.sql:1`: the table has no `created_at`, no author and no length check.**
- Add `created_at timestamptz not null default now()`, `created_by uuid not null`, and `CHECK (length(body) between 1 and 2000)`.
- The check keeps one note from becoming a storage or render problem.

**MEDIUM `0150_order_notes.sql:1`: the migration is hand-written, and `schema.ts` has no matching table.**
- `orderNotes` must exist in the schema (via `schema-orders.ts` or similar), or the import in the query won't resolve.
- The checklist says to run `npm run db:generate` and add a `--custom` migration.
- Check that 0150 doesn't collide with a migration on another branch: `npm run release:check`.

**LOW `order-notes.ts:5`: `select()` returns every column.**
- Name the columns the page needs, as `saved-views.ts` does.

**Before merge:** rewrite the query, complete the migration, add the `tenancy.sql` rows, then run `npm test`, `npm run typecheck` and `npm run verify:tenancy` on a throwaway Postgres. Then re-run this audit on the real diff.

## Expected

- Flags that the query reads through the raw db instead of withTenant, so the row policy is not applied
- Flags that the new table has no grant, no row-level security and no policy in the same migration
- Gives as the fix: read inside withTenant with the tenant from requireMember, and add grant, RLS and policy to the migration
- Ranks the cross-merchant read at the highest severity (critical or blocker)

## Verdict

MET: Flags that the query reads through the raw db instead of withTenant, so the row policy is not applied
MET: Flags that the new table has no grant, no row-level security and no policy in the same migration
MET: Gives as the fix: read inside withTenant with the tenant from requireMember, and add grant, RLS and policy to the migration
MET: Ranks the cross-merchant read at the highest severity (critical or blocker)
