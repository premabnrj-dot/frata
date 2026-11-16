# architecture-reviewer 1.1.0 — engine-imports-db

**Query:** Run the design review on this proposed change. Return ranked findings with the fix each needs.

## Answer

**Verdict: RETHINK.** I read the snippet and the code it would sit beside. It is not a branch, so I did not run `npm test` or `npm run typecheck`.

**BLOCKER**

1. **Modularity — `src/domains/orders/cod-risk.ts:1-3`.** A domain imports `@/lib/db`, `@/lib/db/schema` and `drizzle-orm`. CLAUDE.md says engines are pure, and `check:layers` fails this.
   - Fix: take plain facts as arguments and return a result.
   - Any query belongs in `src/lib/queries/`.

2. **Tenancy — `cod-risk.ts:7`.** It uses a raw `db` with no `withTenant()` and no `tenant_id` filter. The only input is a phone number, and the tenant never appears. This breaks ADR-0002 in two ways:
   - Run as `frata_app` with no tenant context, the row policy would return nothing or error. Run as any role that bypasses the policy, it reads every merchant's orders for that phone.
   - Counting one phone's returns across brands is a cross-brand shopper network. CLAUDE.md allows one, EkCode (ADR-0009), and says "No other cross-shop data."
   - Fix: take `(tx, tenantId, …)` and filter `tenant_id` explicitly. Run `tenancy-auditor` on whatever replaces this.

3. **SSOT / DRY — spec §3 "SSOT/DRY".** This fact is already computed and consumed:
   - `src/lib/queries/order-risk.ts:48` counts earlier parcels to the phone that came back, as `cameBack`, and `src/lib/queries/order-risk.ts:49` counts `earlierOrders`.
   - `src/domains/orders/risk.ts:87` turns `cameBack` into a High reason.
   - The proposal is a second definition of "this phone came back", with a different rule. It is a ratio over all orders, and it is not counted against the order's own `placed_at`.
   - Fix: extend `RiskFacts` and `risk()` if a rate is really needed. The spec should first say why a count of 1 or more is not enough. Do not add a parallel module.

4. **Product rule — `risk.ts:5-7`.** The engine says "never a score, never stored", and the design language says "Medium/High in words, never a bare score". A bare `rto / past.length` float is a score. Nothing in the proposal says who reads it or what the merchant sees.

**MAJOR**

5. **Typecheck — `cod-risk.ts:10`.** `orders.rtoAt` is not in `src/lib/db/schema-orders.ts`. The columns are `rtoInitiatedAt` (line 95) and `rtoDeliveredAt` (line 96). I found no `rtoAt` anywhere in `src/`. The snippet won't compile. The "came back" definition is also already in `src/domains/orders/outcomes.ts` and `order-state.ts`, which rank `rtoInitiatedAt` first. Restating it is the "order state computed in two places" failure.

6. **Erased phones — `cod-risk.ts:7`.** Erased orders store `phone = ''` (`schema-orders.ts:51`), and `order-risk.ts:37-38` guards against this with `hasPhone`. This query has no guard. Called with `''`, it loads every erased order in scope and returns a meaningless rate.

7. **Performance — `cod-risk.ts:7`.**
   - `db.select()` pulls every column, including name, address and phone, for a phone's whole history, only to count. Use a `count(*) filter (…)` aggregate.
   - The index is `orders_tenant_phone (tenant_id, phone)` (`schema-orders.ts:137`). A phone-only filter without the tenant cannot use it, so on a 150k-order shop it is a seq scan. This is another reason to fix finding 2.
   - One call per order is an N+1 on a list page. The existing `riskFactsWith` does a whole page in one statement. A new function would also run as a second `withTenant` rather than sharing the page's snapshot.

8. **Process — spec §3.** There is no spec, goal line, mockup or caller. Changing what COD-risk shows a merchant is a visible change. Per `frata-planning`, it needs a short spec, a mockup, and the owner's approval before code. The goal is North-star problem 1 (COD/RTO losses). The measure is missing.

**MINOR**

9. **Tests.** Nothing covers `0 orders`, `1 of 1 returned` or an erased phone. A pure engine is easy to test.
10. **Reliability.** It has no error path. A failure in the query would surface in the caller as an unhandled throw instead of the "Risk unavailable" state that the design language keeps on the page.

**Accepted** (`docs/decisions/accepted-findings.md`): none of rows 1–4 match this change.

**Not run:** `unit-economics-reviewer` (no money or fee is touched), `speed-reviewer` and `security-reviewer` (no route, action or page yet). Recommend `tenancy-auditor` on the replacement.

**Out of scope that I agree with:**
- No schema change. The needed columns already exist.
- No UI in this change. It still needs a mockup before any is added.
- Not storing the rate. The `risk.ts` rule is derive, don't store.

**The shortest path:** drop this file. If "share of returned orders" is wanted, add `earlierOrders` and `cameBack` ratio reasoning inside `risk()`, from the facts `riskFactsWith` already supplies, with tests. Write the short spec first.

## Expected

- Flags that a src/domains engine imports the db and drizzle: engines are pure (check:layers)
- Gives the fix: a pure function over rows in src/domains, the read in src/lib/queries through withTenant
- Flags that reading orders by phone through the raw db crosses tenants
- Flags reading every past order of a phone without a limit or index at festive volume

## Verdict

MET: Flags that a src/domains engine imports the db and drizzle: engines are pure (check:layers)
MET: Gives the fix: a pure function over rows in src/domains, the read in src/lib/queries through withTenant — finding 1 says take plain facts and return a result with queries in src/lib/queries, and finding 2 says take `(tx, tenantId, …)`, which together give the pure-function-plus-tenant-scoped-read split.
MET: Flags that reading orders by phone through the raw db crosses tenants
MET: Flags reading every past order of a phone without a limit or index at festive volume — finding 7 notes the full-history `db.select()` and that a phone-only filter cannot use the `(tenant_id, phone)` index and seq-scans a 150k-order shop.
