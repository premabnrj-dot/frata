# tenancy-auditor 1.1.0 — query-outside-withtenant

**Query:** Audit this proposed diff (it is not in the repo; read the repo only to compare with its rules). Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE**

**Gates and proof:** I did not run `check:tenant`, `check:actions` or `verify:tenancy`. The diff isn't in the repo, so they would only test the current tree, not this change. No throwaway Postgres was checked. `check:tenant` would fail this diff on the missing RLS and policy. This diff adds a table and has no `scripts/verify/tenancy.sql` entry, so that is a finding below.

**Accepted:** none. Neither row 1 nor row 2 in `docs/decisions/accepted-findings.md` matches. P1 and P2 are only proposed.

**Findings**

- **CRITICAL `drizzle/0150_order_notes.sql:1`: the table has no row-level security.**
  - It has no `enable row level security` and no `tenant_rows` policy. Both are required by the checklist in `frata-architecture` § Tenancy.
  - It has no `grant … to frata_app` and no `revoke all … from anon, authenticated`. Supabase's default privileges can leave those roles with access.
  - The next person to add a grant makes every merchant's notes readable by every other merchant.
  - Fix: in the same migration, add the `grant select, insert, update, delete … to frata_app` and the `revoke`. Then add `enable row level security` and `create policy tenant_rows … to frata_app using (tenant_id = app_current_tenant()) with check (tenant_id = app_current_tenant())`. The `with check` half matters as much as `using`.

- **CRITICAL `src/lib/queries/order-notes.ts:5`: the query runs outside `withTenant`.**
  - It has no tenant context and no `tenant_id` filter.
  - It takes a bare `orderId` from the caller. That is an id from a URL, which ADR-0002 forbids as a tenant source. With RLS added, the query would return nothing. Without RLS, it returns any merchant's notes for a guessed id.
  - `db` is imported as a value and used as `db.select`. In this repo `db()` is a function (`src/lib/db/tenant.ts:35`), and raw `db()` is allowed only in `src/lib/db/`, `src/lib/outbox/` and `src/app/api/webhooks/`.
  - Fix: add `import 'server-only'`. Change the signature to `notesFor(tenantId, orderId)`, where the page passes the id from `requireMember()`. Wrap the body in `withTenant(tenantId, tx => tx.select().from(orderNotes).where(and(eq(orderNotes.tenantId, tenantId), eq(orderNotes.orderId, orderId))))`. If a support-session visit opens notes, read them inside the `asMember` transaction so the audit row is written (as `documentsFor` does).

- **HIGH `drizzle/0150_order_notes.sql:1`: there is no `scripts/verify/tenancy.sql` entry.**
  - Without one, nothing proves the policy on a real Postgres.
  - Fix: add a row per tenant plus the cross-tenant read and write checks, then run `npm run verify:tenancy`.

- **HIGH `drizzle/0150_order_notes.sql:1`: `tenant_id` has no index and no foreign key to `tenants`.**
  - `order_id` has no index and no foreign key either.
  - Fix: add `references tenants` and an index on `(tenant_id, order_id)`.

- **HIGH: `orderNotes` is not in `src/lib/db/schema.ts`.** The diff shows no schema change, so the import cannot compile. The SQL is also hand-written rather than generated. Fix: add the table to the schema, run `npm run db:generate`, then do the RLS part as a `--custom` migration. The journal and `meta` files must match.

- **MEDIUM `drizzle/0150_order_notes.sql:1`: `order_id` is a bare uuid.**
  - A note could point at another merchant's order id.
  - Fix: add a composite foreign key `(tenant_id, order_id)` to `orders`, which needs a unique `(tenant_id, id)` on `orders`. At minimum, have the writer check that the order belongs to the tenant.

- **MEDIUM: note text must not leave the table.**
  - `body` is free text that may hold shopper details.
  - It must not go into `order_events`, `audit_events` or logs. Those carry field names only.
  - The writer is not in this diff.

- **LOW `drizzle/0150_order_notes.sql`: it lacks `created_at` and an author column.** Both are needed to show who wrote a note. It also lacks the CHECK on `body` length that other free-text columns have.

**Could not check:**
- The writer action, which is not in the diff. It needs `asMember` and a conditional `where`.
- Any caching of the order page. Check that nothing wraps `notesFor` in `unstable_cache` or `cache()` with a key that omits the tenant.
- That 0150 is the next free number. The latest in the repo is 0149, so it looks right, but `release:check` should confirm it.

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
