# frata-architecture — Money, GST, payments and trials

Part of `frata-architecture` (SKILL.md holds the rules every change obeys: layers, tenancy, auth, actions, the outside world). These sections are moved here unchanged (practices plan G4).

## Contents

- Money
- GST
- Razorpay keys that stop working
- Trials
- Admin › Costs

## Money (ADR-0004)

Paise everywhere (`src/domains/money/paise.ts`); basis points for rates;
`<Money paise>` to render; `formatInr` groups in lakh/crore. Profit is
`orderProfit()` — never a margin computed inline. A price typed in the catalogue (the product editor, collection rules), a part credit
note's amount and a price in an import are read by `parseRupees` (`src/domains/money/rupees.ts`): a misplaced comma, a
third decimal, zero or a negative is null (an error), never guessed and never 0. A new rupee input uses it too; the
Look's controls, Settings' shipping costs and sections, and Admin's custom plan price still strip ₹ themselves.

**Offers (O·1, docs/plans/2026-11-08-offers.md).** Core checkout pricing, not a module
(`check:modules` forbids core importing module code).
- **One engine:** `src/domains/checkout/discounts.ts` — `planOffers` (best per class: product
  (greedy, one per line; Buy X get Y spread over the group by value; a gift line made free, never
  added by the server) → order (highest tier step reached) → thresholds on the bag after it →
  payment, prepaid only), `priceMethod` (the stored `productDiscount` first, then the rest) (spread by value to the
  paise; each line's GST rate on its own discounted piece, **per way of paying**: line tax lives in
  `MethodTotal`, never on `QuoteLine`).
- **Each way of paying gets its best** (shop stress test 2026-11-11): when the best order offer does not combine,
  online also tries the best one that does (or none) with the saving (`plan.online`), taken by `quote()` only at a
  LOWER prepaid total (a tie keeps the order offer); on delivery always keeps the best order offer; one delivery charge
  for both. Placement stores `keptOffers(q, method)`: placed online with two order offers, `order_discounts.method`
  marks them 'prepaid' and 'cod', so `reprice()` prices either way, and uses follow the row's way (`offerWay`;
  `discountUseSql(now, 'both' | 'prepaid' | 'cod')`; a hold holds both).
- **One repricer and one writer:** a placed order is priced again only by `amounts.reprice()` from
  its stored lines and `order_discounts` (never today's offers) — or, when its items change, by `planEdit` (new lines,
  the order's own offers re-planned) and an Undo's `priceAsKept` (`src/domains/orders/edit.ts`) — and written only by
  `lib/orders/reprice.ts writeReprice()` — every money column of the order and its lines together.
  Switch to COD, a capture after a switch and a retry go through them; a retry never reprices.
- **An order's own offers on new lines** (an order edit): only `replanKept()` (`src/domains/checkout/replan.ts`), from the terms
  `order_discounts` kept (0110: every tier step, Buy X get Y, the gift, the products covered; `termsCopy` writes them at
  placement and `storedTerms` reads them, `src/domains/checkout/kept-terms.ts`). Never `planOffers` with today's
  offers, never a new offer; one that gives nothing comes off; free delivery that comes off adds back what it waived.
  A product offer on a row placed before 0110 (`targets` null) has no known terms: `storedTerms` gives null, and the
  caller must not re-plan that order. A new term on an offer is copied in `termsCopy` (a typed column) the same day.
  `storedTerms` takes the row's `code_id` as `code`: a tie between product offers goes to the automatic one, as at
  placement (`productPass`, shared with `planOffers`).
- **Editing an order's items** (OE·1, 2026-11-12; plan `docs/plans/2026-11-12-order-edit.md`): planned only by
  `planEdit` (`src/domains/orders/edit.ts`, pure) — the order page's panel prices each tap with it in the browser, and
  `editItems` (`src/lib/orders/edit.ts`, under `current()`) plans again from facts read after every touched variant is
  locked (`editFactsIn`, `src/lib/orders/edit-facts.ts`, the panel's read too) and refuses a total that moved. Lines and
  offers are never rewritten: a line comes out (`removed_at`; `replaced_by` names what a swap or new quantity made) and
  its successor is inserted (`lineSnapshot`); an offer that comes off or gives another amount gets `removed_at`, and a
  new amount is a new row with the old row's `created_at` (one live use per order and offer: a partial unique index).
  **Every reader of an order's lines or offers reads the live rows** (`removed_at is null`; uses through `useOfRowSql`,
  which says it; Admin's `app_admin_offer_totals` too, 0118): a new reader adds it. Stock: the pieces coming out go back
  first, then the new ones are taken; room for a new piece is checkout's `sellable` with the order's own pieces back
  (`roomOf`/`sellsAs`). Money: `writeReprice` (one `update … from (values)`) writes `product_discount` too, and an
  edit's subtotal, delivery and COGS; Frrata's fee follows `merchandise_net` (an edit issues no credit note, so
  `returnedSql` never counts it). Delivery stays the order's own unless the bag crosses today's `freeShippingAbove`;
  the COD fee is the order's own; today's COD maximum refuses a higher total above it, never the minimum. Undo
  (`undoEdit`) puts back the edit's record (`order_edits`, `order_edit_lines` before/after with `replaces`) within
  `UNDO_MINUTES` and before packing, only while the order still has the edit's lines and offers, re-checking any offer
  the edit freed. The `edited` email waits `UNDO_MINUTES` and is skipped when undone or a later edit supersedes it.
  Refused (`cannotEdit`, the one rule for the button and the save): a support visit, and (OE·2) an order whose earlier
  change still waits for the shopper's payment; paid online and switched orders are OE·2's (below). The
  arrival dates are made again from the live lines (`arrivalRange`) after an edit and an Undo; an Undo whose price
  differs from the one before the edit is refused, never written. A removed line holds no stock (CHECK
  `order_lines_removed_stock`: its pieces go back first). Readers by product use `order_lines_product_live` (0118).
  **Deploy order:** 0117 and 0118 before the code (every reader selects `removed_at`; `writeReprice` needs the
  `product_discount` grant).
- **A paid-online order's edit** (OE·2, 2026-11-12; plan § Increase on a paid order, § Razorpay facts): priced the way it
  is paid (`EditFacts.order.way`: the online order offer and the pay-online saving, no COD fee). What the new total means
  for the money already paid is ONE pure rule, `settleOf` (`src/domains/orders/refunds.ts`), run by the panel and again
  by the save, which compares the panel's `expectedDue`: a ledger per Razorpay payment (captured − the attempts that
  count: queued, sending, sent, processed), the net paid against the new total. Lower by ₹1 or more → applied at once and
  the refund queued in the edit's transaction (`queueRefund`: an `order_refunds` attempt row + its `refund.send` outbox
  row, `notBefore` = the Undo window's end), split over the payments newest first, never on one 6 months old (refused
  before Save). Undo cancels the unclaimed attempt in its own transaction (`cancelEditRefunds`); once the sender has
  claimed it (`sending_at`, committed before Razorpay is called) the edit has no Undo. Higher by ₹1 or more → the edit
  WAITS (`order_edits.asked`; `requestPayment`, `src/lib/orders/edit-paid.ts`): nothing on the order changes, its new
  in-stock pieces are held (`order_edit_lines.held`, counted by `heldSql`/`heldByVariant` through `editWaitingSql`),
  `pack` is refused and no other edit is allowed while it waits (one waiting edit per order: a partial unique index).
  Within ₹1 → applied, nothing asked or sent. **A second Razorpay order** per waiting edit (receipt `${number}-e${id8}`,
  found again by receipt) is made when the shopper first taps Pay; its capture is stored first as an event and applied
  by `processEvents` → `applyEditCapture` (`edit-capture.ts`, when no order owns that Razorpay order id): planned again
  from the saved lines at the saved prices (its held pieces counted as its own), written by the same `applyPlan` as a
  save (`edit-write.ts`), the record filled in once (a trigger: each settle column is written once). A capture after the
  request was dropped ("Ship without the change", `dropRequest`) or the order cancelled, or one that can no longer apply,
  is refunded at once in full (cause `after_drop`). **A payment on an order's FIRST Razorpay order after an edit took
  effect** never marks it paid at the old total: `markPaid` asks `strayCapture` first and refunds it in full (cause
  `old_order`); that is what lets an order switched from online to pay on delivery be edited.
- **Refunds** (`src/lib/payments/refunds.ts`; frata-integrations § Razorpay, refunds 2026-11-12): one `order_refunds` row
  per ATTEMPT; its stage is derived from its moments (`refundStage`), never a status column; only its moments are
  updatable, each once (trigger). The sender lists the payment's refunds first (a matching receipt is this attempt),
  checks the payment's age and what it has left, then creates it with `speed: "normal"` always, receipt and
  `X-Refund-Idempotency` = the attempt id. 409 / "another operation in progress" → `Later`; unreachable → counted and
  retried (the list finds it); a refusal (balance, 6 months, refunds off, keys, more than is left) → failed with OUR
  code (`FAILURE_WORDS`), "Refund ₹X not sent" with Try again (`retryRefund`: a NEW attempt, `retry_of`); Razorpay
  failing it later (`refund.check`, which reads a pending refund back every hour for 15 days) → a new attempt by itself,
  `AUTO_RETRIES` times. `refund.*` webhooks are not relied on (an unmatched event is processed as nothing).
  `edit.payment` asks Razorpay for a waiting edit's second order's payments (a lost reply and webhook), `edit.remind`
  writes the 24-hour Notice (definer `app_edit_payment_notice`, source `edit_payment`, once per edit).
  Reviews 2026-11-12 folded in: **a later change settles a failed edit refund** nobody tried again (`supersedeFailed`:
  `superseded_by`, set by an applied edit and by a change when its payment applies, never by one only waiting); Try again
  refuses a superseded attempt, `too_old` and `over`, and any `edit` refund larger than the payments' net minus the
  order's total (or a waiting change's total less what it asks); an edit that superseded one has no Undo. A change
  settles ONLY the failed attempts its own plan counted as not going back: an applied edit the ids in its facts
  (`failedUnretried`), a paid change those failed before it was saved (`created_at` = clock_timestamp() after its plan;
  `fail()` stamps under the order's lock), so one failing after the plan is still owed (security re-review H1). An
  attempt the sender leaves unresolved (no answer on its last try, or its outbox row dead) is never failed by the
  sender: it stays on its way (counted, no Try again, never superseded) until the `refund.settle:<id>` check queued with
  its claim reads Razorpay's list once the sender is done — its receipt, or an earlier attempt's in its chain, there →
  recorded; absent → `refused` (re-review M3, L4); a new attempt also takes an earlier chain receipt it finds as its own.
  A payment at the old total refunded once stays refunded after an Undo (`strayCapture` checks the refund first, M2). On
  the last try after an unanswered one, no create is made again (it may be in flight). "A saving that grew" is one rule
  (`grownUses`, edit-write.ts) for Save and capture; held pieces go back through one leaf (`releaseHeld`, edit-held.ts). Save
  refuses a refund or ask without the panel's `expectedDue`. At capture, a saving that grew must still `stillFit`
  (else `cannot_apply`). Another payment on a change already paid is refunded (`after_drop`). **Razorpay's fee on a
  payment refunded in full** is written once on its first attempt (`order_refunds.gateway_fee`) and added to the order's
  `gateway_fee` (`addOrderFee`; `editFeesSql` sums edits' and these when the order's own fee arrives).
  A cancel names what the payments still hold (`paidLeft(o, ledgerIn)`, amounts.ts), never the placement's online
  total, and frees a waiting change's held pieces (`held` goes back to 0 whenever a change is paid, dropped, refunded or
  cancelled: the partial index stays small). `order_refunds` names an edit of its own order (FK on (tenant, order, edit)),
  and an edit line names only lines of its own order (trigger, 23503). `orderDetail` reads the waiting change by
  `editWaitingSql` and the ledger.
  **Deploy order:** 0120 and 0121 before the code (the readers select `order_edits.asked` and `held`).
- **Uses are derived:** `discountUses()`/`fits()` in `src/lib/db/discount-predicates.ts` (with
  `liveDiscountSql`, twin of `offerStatus()`), counted through `discountUseSql`/`usesDiscount`
  (parity-tested). Placement locks every offer the bag could get that has a limit, in id order,
  before counting; an offer over a limit drops out and the shopper gets `changed`. The cached pages (bar, cards,
  product lines) leave out an offer `usedUp` for everyone (`usedUpIds`: total limit or budget; never per phone).
- **A percentage saving is whole rupees, rounded down, once per offer** (`wholeRupees` in discounts.ts; 100% exact):
  never a ₹949.05 total, never ₹1 or more short. Stored amounts are what reprice() reads, so placed orders keep theirs.
- **The shopper's read** of offers is `liveOffers()` in `queries/checkout.ts` (terms only);
  `publicQuote` maps offers to named fields (a test proves no id, term, limit or budget leaks).
  Codes: one per order, unique per shop forever, fail-closed per-IP guess limit, one answer for
  every failure but `'beaten'` (a real code a better offer of its class beat: told so, not a wrong guess). A creator
  code is a labelled code: matched only when typed (`codeFor`), never in the bar (`isNull(label)`), recorded with `via`
  (link or typed) — only when it applies: a beaten code is not on the order (no column for it yet).
- **First order** is decided at placement under a per-phone advisory lock (standing or holding
  order from that phone), and again on a payment retry.
- **Did it make money?** `offerStats` (queries/discounts.ts) is the ONE computation of an offer's results:
  window orders that use it now (`useOfRowSql`), state through `stateSql`, ₹ kept through profit.ts with freight from
  `freightOf` (domains/orders/freight.ts: Shiprocket actual or pending — pending left out — else the shop's confirmed
  estimate, `estimateOf(shipCostsIn)`, else none; `keptBasis` says which; computed only for owners and admins), new vs repeat
  through `priorOrderSql` (also the first-order rule), each creator code's week through `leakOf` (domains/checkout/
  leak.ts). Nothing stored. Uses for limits and budgets stay `discountUses` (all time).
- **Stopped by Frrata** (O·4): `stopped_*` makes an offer `stopped` in `offerStatus` and not live in
  `liveDiscountSql`; the shop can only end it (every console WHERE has `stopped_at is null`, except End). At most
  `MAX_RUNNING_OFFERS` (20) run per shop: `runningOffers` counts under the shop's offers advisory lock, read by a
  start and by Admin's resume.
- **Prior price** is derived from `price_history` (`priorPriceSql`, `lib/db/price-predicates.ts`):
  the lowest price in the 30 days before the current one took effect, shown only within 30 days
  of the change. `variants.compare_at` is the M.R.P. (`mrp`), never a struck price.

## GST (plan docs/plans/2026-11-09-gst-core-and-categories.md, built 2026-11-09)

**The split.** GST in the **core** is always on and correct at the source: rates, invoices, credit notes, Settings ›
Taxes, Products › HSN codes — every shop, every plan. The **GST app** is the module `gst` (registry; billing `plan`:
Growth and Scale, owner 2026-11-09), at `console/apps/gst/`, shown in the nav only when usable, its writes and export
through `asModule('gst', …)`, the Accountant's invite too (removing one works with GST off). It only READS the documents as issued (`invoice()` / `creditNote()` in `domains/orders/documents.ts`)
— it never edits a document and never recomputes a tax head.
- **The rate:** `domains/tax/rates.ts` `RATE_TABLES` — dated (`from`), matched by the longest HSN prefix, the ₹2,500
  per-piece slab (after discounts) for chapters 61–64. The date is the order's `placedAt`, never the clock (`taxOrder`,
  `rateFor` take it). An unknown HSN is never guessed: the merchant's own rate (`products.gst_bps`) or the line is not
  sellable for a registered shop (quote 'gone'; publish refused). A new rate is a new dated table, never an edit.
- **Who charges:** `chargesGst({ gstin, scheme })` only — regular with a GSTIN. Composition: bill of supply with the
  declaration. Unregistered or composition: delivery within `home_state` only (s.24), at placement too.
- **B2B:** `b2bProblem` (checksum + the GSTIN's state = delivery state), no autofill; buyer fields freeze with the invoice
  (`app_buyer_fixed` trigger); off at ₹5 crore and above until e-invoicing.
- **Credit notes:** `domains/orders/credits.ts` (what is left of each line; return pro rata by quantity, discount by value
  at each line's rate, goodwill no GST in its own G series, reversal takes the rest), lines in `credit_note_lines`
  (final). ₹ kept: `keptSql` takes off credited taxable (`creditedSql`) and the cost of pieces a return put back in
  stock (`cogsSql`). A return restocks only when ticked: `issueCredit`, same transaction, `restockOf` (never past what
  the line sold less earlier restocks), recorded once in `credit_note_lines.restocked_qty`. A return that CAME BACK
  (RTO) loses its COGS unless its came-back event put the stock back (`rtoRestockedSql`, grouped by keptSql and
  Analytics alike; frata-unit-economics).
- **GSTR-1:** `domains/tax/gstr1.ts` from the documents; files in `gstr1-files.ts`; the period read is
  `queries/gst.ts gstPeriod(In)`, never cached. Filing (G2): `lib/gst/gsp.ts` (`gsp()` null = off; the fake never in
  Production), the actions in `console/gst/actions.ts` write a `gst_attempts` row before each call (ADR-0008, accepted 2026-11-09),
  `gst_filings` is final once filed (trigger).
- **The Accountant** (`MEMBER_ROLES`): in `CONSOLE_ROLES` and `CAN_SEE_GST` only — never add it to an existing role tuple;
  `seesCosts` is false. Invited by the owner through the `app_*_accountant` definers.

## Razorpay keys that stop working (2026-11-12)

- A call with a shop's keys (`createOrder`, `orderPayments`) that Razorpay answers 401/403 sets
  `payment_keys.problem` to `KEYS_REFUSED` (Settings: "Needs attention"); a call that works clears that problem only.
  `noteKeysAnswer` (src/lib/payments/keys.ts) runs after the call, with no transaction open, and writes only when the
  problem changes, matching the key id the call used. No needs-you notice yet: `notices.source_kind` has no kind for it
  and `notice_write` is not granted to frata_app.

## Trials (TR0 built 2026-11-08; spec docs/specs/2026-11-08-trials.md, plan docs/plans/2026-11-08-trials.md)

- **Terms are frozen into the shop's row when they apply.** Admin's `trial_settings` are for NEW sign-ups; a shop's
  `shop_trials` row keeps the length and window it started with, so a later change never moves a running trial.
  Do the same for any setting that changes terms (a price, a length, a limit).
- **One writer of a derived-but-stored fact.** `tenant_plans.trial_ends_at` (what billing reads) is written only by
  `app_trial_recompute` (drizzle/0063: security invoker, revoked from every role, locks the tenant, touches the row in
  force and later rows only). Every change calls it — the first-publish trigger, every insert into `tenant_plans`, the
  extension, Admin's set / extend / end. Its SQL day rule (`app_ist_day_end_after`) is held to
  `src/domains/plans/trial.ts` by a parity int test.
- **The trial begins once the website is live** — the first `published_at` only; closing and reopening never restarts
  it. A support visit never opens or closes a shop with a running trial (it would start the clock for good).
- **The state is derived, never stored** (`trialState`); every trial end is the end of an IST day, stored as the first
  moment of the next (exclusive) — show it with `lastDay()`, never `dayIN(trialEndsAt)`.

## Admin › Costs (C1 built 2026-11-23; spec docs/specs/2026-11-23-admin-costs.md, plan docs/plans/2026-11-23-admin-costs.md)

- **Admin › Costs** (2026-11-23; spec `docs/specs/2026-11-23-admin-costs.md`, drizzle/0172, proof § 102, `check:tenant` § 10): `cost_items` and
  `cost_payments` are platform-scope tables in 0093's shape (direct `frata_admin` grants, one permissive policy each, nothing for any other
  role), imported only by `src/lib/admin/costs.ts` (and `today.ts`). Support staff share the `frata_admin` connection, so every export
  there re-checks `ADMIN_ONLY` itself. Due dates, next due, overdue and burn are derived in `src/domains/admin/costs.ts`, never stored;
  USD is micro-dollars. Editing an amount, currency or anchor, and undoing a payment older than 10 minutes, need `confirmedRecently`.
