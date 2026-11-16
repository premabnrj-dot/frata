# tenancy-auditor 1.0.0 — tenant-from-form

**Query:** Audit this proposed diff (it is not in the repo; read the repo only to compare with its rules). Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE.** This diff has a CRITICAL cross-tenant write, and the rest of the action is wrong too.

**Gates and proof:** I could not run any. Bash is disabled in this session, so `check:tenant`, `check:actions` and `verify:tenancy` did not run. The diff isn't in the repo, so those gates would only have checked the existing code. The diff adds no migration or table. I compared it with `src/lib/db/tenant.ts`, `src/app/(console)/console/orders/actions.ts`, `src/lib/orders/work.ts` and `src/domains/orders/work.ts`.

**Findings**

1. **CRITICAL** `actions.ts:8` — The tenant id is read from `form.get('tenantId')`, which is a form field. ADR-0002 allows only `requireMember()` and `tenantForHost()` (plus the API-host storefront key). Any signed-in member of any shop can post another shop's UUID. `withTenant` only checks that the string is a UUID (`tenant.ts:26`). It does not check membership, so it sets `app.tenant_id` to the victim's id. RLS then passes, and the update cancels the victim's order.
   - **Fix:** Delete the field. Take the tenant id from the membership, as the existing actions do through `asMember(roles, …, (tx, auth) => auth.membership.tenantId)`.

2. **CRITICAL** `actions.ts:9-10` — The order id also comes from the form, with no zod check. Because of finding 1 it can name any shop's order.
   - **Fix:** Validate it with the same `Id.safeParse` that `orders/actions.ts` uses. Better, take it as a bound argument, as `cancelOrder(orderId)` does in the existing file.

3. **HIGH** `actions.ts:10` — The `update` has no explicit `tenant_id` filter. ADR-0002 says queries also filter by `tenant_id`, so only RLS stands between this and a leak.
   - **Fix:** Add `eq(orders.tenantId, tenantId)` to the `where`. `work.cancel` at `src/lib/orders/work.ts:238` already does this.

4. **HIGH** `actions.ts:8` — `requireMember()` is called with no roles, and its result is discarded. `ROLES.cancel` is `MANAGERS` (owner and admin), and "hiding a button is never the guard". As written, any member can cancel, including staff. A partner's Builder is meant to be kept out through `requireCapability`.
   - **Fix:** Pass the roles through `asMember(ROLES.cancel, …)`.
   - **Import path:** `@/lib/auth/member` does not exist. The real modules are `src/lib/auth/require-member.ts` and `as-member.ts`. I did not check whether a barrel file re-exports the name, so confirm the import resolves.

5. **HIGH** `actions.ts:10` — This is a bare `update` of `cancelledAt` that duplicates a function that already exists. `work.cancel` (`src/lib/orders/work.ts:223`) does the real cancellation:
   - It sets `cancelReason` and `cancelNote`.
   - It guards on `isNull(cancelledAt)` and `isNull(shippedAt)`, so a shipped order can't be "cancelled".
   - It handles restock and writes the history row.
   - `actions.ts` also queues the cancellation email and refreshes the shop pages, and the diff skips both.
   - **Fix:** Call `work.cancel` through the existing `run('cancel', …)` wrapper. Don't add a second path.

6. **MEDIUM** `actions.ts` — The action writes no audit row. In a support session, `asMember` writes the audit row in the same transaction, and `check:actions` expects that. The new action will most likely fail `check:actions`.
   - **Fix:** Use `asMember`.

7. **LOW** `actions.ts:11` — The action has no error handling and no `ActionResult` return, so a failure surfaces as an unhandled throw. It also never calls `revalidatePath('/console', 'layout')`, so the nav's "To confirm" count stays stale after a cancel.
   - **Fix:** Reuse `run()`, which does both.

**Not checked:** I checked nothing on caching, outbox, webhooks, logs, SECURITY DEFINER functions or new tables, because the diff has none of them. After the rewrite, run `npm run check:actions` and `npm run check:tenant`, and add a test in which a member of shop A posts shop B's order id and nothing changes.

**Simplest correct fix:** Delete this file. `cancelOrder` already exists in `orders/actions.ts`, with the correct roles, tenant source and audit. If the dynamic route needs its own wrapper, make it a one-line call to that action.

## Expected

- Flags that the tenant id comes from the form, which a merchant can change to another shop's id
- Says the tenant id must come from requireMember() (its returned tenant), never from a form, URL or body
- Notes that requireMember is called but its result is ignored
- Ranks it at the highest severity (critical or blocker)

## Verdict

MET: Flags that the tenant id comes from the form, which a merchant can change to another shop's id
MET: Says the tenant id must come from requireMember() (its returned tenant), never from a form, URL or body
MET: Notes that requireMember is called but its result is ignored
MET: Ranks it at the highest severity (critical or blocker)
