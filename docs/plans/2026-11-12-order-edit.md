# Plan: edit a placed order (OE·0–OE·2)
Status: planned · Date: 2026-11-12 · Spec: `docs/specs/2026-11-11-order-edit.md` (active; mockup approved 2026-11-12)

Every finding of the five plan reviews (2026-11-12) is folded into a task below or listed under "Open / accepted".
Every task ends with `npm test`, `npm run typecheck` and `impact-reviewer`; `drizzle/` changes also run
`npm run verify:tenancy`.

## Changes to the spec the reviews forced
| Was | Now | Why (review) |
|---|---|---|
| "No new table" | `order_edits` (who, when, reason enum, totals before/after, undone_at) and `order_edit_lines` (the lines before and after, with prices); `order_refunds` in OE·2 (Razorpay id, amount, status, timestamps); `order_events` kind `items_edited` added to its CHECK. Typed columns, never jsonb | Undo and "Was M" need the lines before; a refund needs its own record (architecture MAJOR, tenancy MED 5) |
| Lines rewritten | **Lines are never rewritten**: a removed or swapped line gets `removed_at` / `replaced_by` (column-level grant on those two only), the new line is inserted; an offer that comes off gets `order_discounts.removed_at` | `order_lines` is "as sold" (column grants, proof check 826) (tenancy HIGH 1) |
| `reprice()` re-plans offers | A pure `replanKept()` re-plans the order's own offers from their stored terms; tiers and buy-X-get-Y are copied onto `order_discounts` at placement first; a free-delivery offer that no longer applies brings the delivery charge back | `reprice()` re-applies stored amounts and never re-plans (architecture BLOCKER) |
| States: confirmed, paid, on hold | `applies('edit', state)`: includes unconfirmed (the common "change my size" moment) | Don't restate the list (architecture MAJOR) |
| Undo 10 minutes, refund at once | A refund is queued with `notBefore` = the end of the Undo window; Undo cancels the unclaimed row in its own transaction; after it is sent, an edit that refunded has no Undo. Undo of an edit needs the edit's roles | A refund can't be cancelled; repeated edit + Undo could refund the whole order (security H1) |
| Refund = old total − new total | Refund = captured − refunded − pending − new total (a ledger); the amount Save showed is sent and refused if it changed under the lock | Earlier refunds ignored (security H1, architecture BLOCKER) |
| Pricing on the server per tap | Pricing in the browser with the same pure code (4.7 kB gz), loaded with the panel (`next/dynamic`) when "Edit items" opens: one action, one `withTenant`, three reads in `Promise.all`; the server re-plans the same way on Save | A server action per tap, serialized (speed MED 8) |

## Open (owner)
- **An offer that now gives less** (a tier steps down, a % on a smaller bag, a product offer on fewer lines). Uses and
  budgets read `order_discounts.amount`. Leaning (coordinator, 2026-11-12): mark the old row `removed_at` and insert a
  new one with the new amount — history kept, no update grant on `amount`.
- **An edit that drops the bag below the shop's own free-delivery threshold** (`freeShippingAbove`, not an offer):
  `replanKept` brings back only what a free-delivery offer waived. Leaning: the delivery charge comes back, as checkout
  would charge it.
- **A paid order whose total goes up.** As specced ("collect the difference on delivery") it fails three ways: the
  courier booking knows only COD or prepaid, many shoppers can't be told, and COD-blocked pincodes can't collect
  (unit-economics, architecture). Recommendation: **refuse an increase on a paid order in OE·2** (the merchant cancels;
  the shopper re-orders), and add a Razorpay payment link later (cheaper than a COD fee below ₹1,271; no door risk).

## Tasks
**OE·0 · lock today's behaviour, pull out the shared parts**
1. Tests that pin today: `reprice` both ways, stock taken and put back per order, a capture after a switch to COD.
   Verify: `INT_DB_HOST=… npx vitest run src/lib/orders`.
2. Pure `replanKept()` (`src/domains/checkout/discounts.ts`), `cogsOf()` and `lineSnapshot()` out of `place.ts`,
   per-line `takeStockLines` / `putStockBackLines` (every touched variant locked once, in id order; the order-wide ones
   call them), `edit` in `WHEN`/`ROLES` (owner/admin). Migration adding offer tiers/scope to `order_discounts`.
   Verify: vitest; `verify:tenancy`.
   As built: `replanKept` lives in `src/domains/checkout/replan.ts` (discounts.ts stays under the size gate). The terms
   are copied as sold, so a collection's products are copied onto each order offer row (`target_products`): at most the
   live catalogue limit (`MAX_LISTED`, 600 products), about 10 kB per row (16 bytes a uuid, plus the array header).
   Signal to store one copy per version of an offer's terms instead (a `discount_terms` row the order points to): order
   offer rows over 2 kB on average, or `order_discounts` over 1 GB in any shop.

**OE·1 · COD and unpaid orders**
3. Migration: `order_edits`, `order_edit_lines`, `order_lines.removed_at/replaced_by` (column grant), `order_discounts
   .removed_at`, `order_events` kind `items_edited`; `tenancy.sql` gains exact column privileges and cross-tenant
   refusals (tenancy audit list). Verify: `verify:tenancy`.
4. `src/lib/orders/edit.ts` under the order lock: refuses while a Razorpay payment can still capture (an order switched
   to COD with a payment created or authorized); stock per line; `writeReprice` set-based (one `update … from (values)`);
   COD max checked (never the minimum); Frrata's fee follows `merchandise_net` (no credit note issued, so `returnedSql`
   never double counts: a `draft.int` case); `refreshSoldOut` on sell-out or back-in-stock; `undoEdit`; an email kind
   `edited` held for the Undo window. Refused in a support visit. Verify: `edit.int.test.ts` (swap, remove, add, a race
   with packing, Undo, offers re-planned, an offer's use freed and re-checked on Undo).
   Note for OE·1: an edit that moves stock both ways (a swap) locks every variant it touches first (`lockVariants`,
   stock.ts) — two lines on one variant (a removed line and its replacement) then share one lock; when too little stock
   is left for both, which line is taken must not depend on row order (take the kept line first, or refuse the edit).
5. UI per the mockup, plus the states it didn't draw (over the COD limit, phone). Verify: `npm run e2e -- --only
   order-edit` (new flow) and `50-order-page`.

**OE·2 · paid online** (after the owner decides the increase case)
6. `refund()` in `src/lib/payments/razorpay.ts` (normal speed; before each create, list the payment's refunds and match
   `receipt`/`notes.edit_id`; amount capped at what Razorpay reports refundable; payment age < 6 months checked before
   Save), `order_refunds`, a `refund.check` sender reading refund status back (no `refund.*` webhook assumed);
   the email says "started" until processed; refused in a support visit. Verify: int test against the Razorpay fake;
   e2e; `security-reviewer`; `integration-researcher` on the refunds API facts (`X-Refund-Idempotency`, receipt rules).

## Accepted
- No edit after packing (a credit note instead), no shopper-side edit, normal-speed refunds only (all reviews agreed).
- A size swap at today's price can change the amount to collect: shown in "What changes" before Save.
