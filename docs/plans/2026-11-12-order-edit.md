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

## Increase on a paid order (owner, 2026-11-12)
COD: the new total is collected at the door; nothing else changes. Paid online: **the shopper pays the difference first**,
and the edit is applied only when that payment is captured. Built as:
- Save on a paid order with a higher total stores the edit as **waiting for payment** (its lines in `order_edit_lines`,
  `order_edits.waiting_since`), and changes nothing on the order yet: lines, totals, stock and the courier booking stay.
- The request is a page of ours, not a Razorpay Payment Link: the order page shows "Pay ₹499 for the changes" with what
  changed, through Razorpay Checkout on the shop's own keys (a second Razorpay order for the difference; money to the
  shop, no SMS, the fee as any online payment). Sent by the "edited" email when the order has one; the merchant also
  gets "Copy payment link" to send on WhatsApp.
- Captured (webhook or the payment check, as any payment: stored first, then applied): the edit is applied under the
  order lock if the order is still before packing and the new pieces are still free; if not, the difference is
  refunded at once (refund ledger) and the merchant sees why.
- Proposed defaults, **owner to confirm**: the request waits **24 hours**, then lapses (the order ships as it was; the
  merchant is told); the new pieces are **not** held while it waits (checked again when paid); packing the order
  cancels a waiting request.
- Tasks: an `edit.payment` kind beside `payment.check`; the order page's payment block reads a waiting edit; e2e: pay
  the difference, and a request that lapses.

## Tasks
**OE·0 · lock today's behaviour, pull out the shared parts**
1. Tests that pin today: `reprice` both ways, stock taken and put back per order, a capture after a switch to COD.
   Verify: `INT_DB_HOST=… npx vitest run src/lib/orders`.
2. Pure `replanKept()` (`src/domains/checkout/discounts.ts`), `cogsOf()` and `lineSnapshot()` out of `place.ts`,
   per-line `takeStockLines` / `putStockBackLines` (every touched variant locked once, in id order; the order-wide ones
   call them), `edit` in `WHEN`/`ROLES` (owner/admin). Migration adding offer tiers/scope to `order_discounts`.
   Verify: vitest; `verify:tenancy`.

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
5. UI per the mockup, plus the states it didn't draw (over the COD limit, phone). Verify: `npm run e2e -- --only
   order-edit` (new flow) and `50-order-page`.

**OE·2 · paid online** (increase decided 2026-11-12: pay the difference first)
6. `refund()` in `src/lib/payments/razorpay.ts` (normal speed; before each create, list the payment's refunds and match
   `receipt`/`notes.edit_id`; amount capped at what Razorpay reports refundable; payment age < 6 months checked before
   Save), `order_refunds`, a `refund.check` sender reading refund status back (no `refund.*` webhook assumed);
   the email says "started" until processed; refused in a support visit. Verify: int test against the Razorpay fake;
   e2e; `security-reviewer`; `integration-researcher` on the refunds API facts (`X-Refund-Idempotency`, receipt rules).

## Accepted
- No edit after packing (a credit note instead), no shopper-side edit, normal-speed refunds only (all reviews agreed).
- A size swap at today's price can change the amount to collect: shown in "What changes" before Save.
