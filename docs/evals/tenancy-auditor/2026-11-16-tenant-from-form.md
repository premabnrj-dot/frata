# tenancy-auditor 1.1.0 — tenant-from-form

**Query:** Audit this proposed diff (it is not in the repo; read the repo only to compare with its rules). Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE.** A reachable cross-merchant write exists.

**Gates and proof**
- `npm run check:tenant`, `npm run check:actions` and `npm run verify:tenancy`: **not run.** Bash is disabled in this session, so I have no output to report. I reviewed the diff by hand against the repo's rules. Run both gates on the real change. `check:actions` should reject this file for bypassing `asMember`.
- The diff has no migration, so there are no new tables or definers to check. There is no caching, outbox or logging in it.

**Findings**

CRITICAL `orders/[number]/actions.ts:8` — The tenant id comes from `form.get('tenantId')`. ADR-0002 allows only `requireMember()`, `tenantForHost()` and the storefront key as sources. `withTenant` only checks that the id is a UUID, then sets `app.tenant_id` to it. So the RLS policy passes for whatever shop the caller names. Anyone who knows a victim's tenant UUID and order UUID can cancel that merchant's order. **Fix:** delete the field. Take the tenant from the membership inside `asMember`.

CRITICAL `:7` — `await requireMember()` throws the result away, so the call checks nothing.
- The real signature is `requireMember(allowed: readonly MemberRole[])` in `src/lib/auth/require-member.ts:86`. It returns `{ok:false,…}` rather than throwing.
- With no roles argument, a signed-in caller would hit a `TypeError` on `allowed.includes`. A signed-out caller gets `{ok:false}`, which the code ignores, and the update runs anyway.
- The action therefore needs no valid session or membership.
- The import path `@/lib/auth/member` also doesn't exist.
- **Fix:** don't call `requireMember` directly in an action. Use `asMember(ROLES.cancel, …)` as `src/app/(console)/console/orders/actions.ts:41-58` does.

HIGH `:9` — The update's `where` has `eq(orders.id, id)` and no `tenant_id`, so the explicit-filter lock is missing. `orderId` is also unvalidated. **Fix:** inside `work.cancel(tx, tenantId, actor, orderId)`, filter on `tenant_id` and validate with `Id.safeParse`.

HIGH `:9` — The action duplicates the existing cancel and skips the work `work.cancel` does. That function already exists in `src/lib/orders/work.ts` and is exposed by `orders/actions.ts`. The diff skips:
- the owner/admin role rule (`ROLES[action]`), so staff or a partner could cancel;
- the support-session audit row that `asMember` writes;
- the order history row;
- the queued cancellation email (outbox);
- the cancel reason (`CANCEL_REASONS`) and any state guard.

It also overwrites `cancelledAt` on an order that's already cancelled, shipped or delivered. **Fix:** don't add this file. Use the existing `cancelOrder(orderId)` and `run('cancel', …)` path in `orders/actions.ts`. If a per-order page needs it, call that same wrapper.

MEDIUM `:3-4,9` — A route-level action imports the `orders` schema and runs Drizzle directly. Merchant rows are meant to be touched only through `src/lib/queries/` and `src/lib/orders/`. `check:tenant` will probably flag this. The action also has no try/catch, no `revalidatePath` and no `drainSoon()`.

LOW `:1` — The file sits under `[number]/` but takes `orderId` from the form. Two identifiers for one order is how a mismatch gets in.

**Accepted** (`docs/decisions/accepted-findings.md`): none match. Rows 1 and 2 are about the Vercel token and coupon limits. P1 and P2 are proposals the owner hasn't ruled on, and they don't apply here.

**Could not check**
- Gate output and `verify:tenancy` (no shell).
- Whether `check:tenant` flags the direct `orders` import. I'm inferring that from the CLAUDE.md rule.
- Whether `orders.cancelledAt` is the right column. It does appear in `src/lib/db/schema-orders.ts`, but `work.cancel` may set more than that.

**Bottom line:** drop the file and reuse the existing `cancelOrder` in `orders/actions.ts`. As written, a signed-out request can cancel any merchant's order.

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
