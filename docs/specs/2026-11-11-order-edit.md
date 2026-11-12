# Edit a placed order
Status: active · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/76HjNBCo2xdJyf6Qvwxutx (views COD, Paid online, Saved) · Approved: owner, 2026-11-12

## Goal
North star (1) COD/RTO losses and (2) size returns. Today a "change my size" WhatsApp or a piece out of stock after
the order means cancelling the whole order and hoping the shopper orders again, or shipping two of three pieces with a
COD slip that still says the full amount, which the shopper refuses at the door (shop stress test 2026-11-11).
Measure: orders cancelled with reason "out of stock" or "customer asked", before and after; RTO on edited orders.

## Job
Before a parcel is packed, the merchant changes what is in it (size or colour, quantity, a piece removed or added),
and the amount to collect or refund follows, with the shopper told.

**Owner decisions (2026-11-12, with the mockup's approval, as drawn):** owners and admins edit orders (as address
edits); a paid-online order whose total goes down refunds the difference automatically through the shop's own Razorpay
(refunds API, normal speed; OE·2); one whose total goes up collects the difference on delivery (on the slip), no payment
link in v1.

## Research
| Product | Taken | Not taken |
|---|---|---|
| Shopify Edit order (help pages, undated: unverified) | Edit only what isn't fulfilled; a reason the customer never sees; a "restock" choice; the balance shown owed either way; notify optional | The refund as a separate manual step; a swap as remove + add; an edited order counted as another order in reports |
| Shopify buyer-requested edits API (changelog, 2026-10-01) | An edit is a stored record; the money outcome previewed before it is created; idempotent | Shopper-side edits (later, if ever) |
| Zoho Commerce (India; orders help, 2026-10-30) | Items cancelled only before a shipment exists; partial refund as its own step; invoice timing is a setting (at confirmation, shipment, or by hand) | Its "Edit order" changes addresses only, not items |
| WooCommerce (docs, 2026-10-09) | Private notes vs notes the customer gets; tax recalculated after a change | Edits only while pending payment or on hold (a confirmed COD order couldn't be edited) |
No current source for Shiprocket's, GoKwik's or Instamojo's order edits (Shiprocket's articles are 2016–2022: an AWB
locks the shipment, unverified). Taken for Frrata: edit until packed (the invoice) — before any AWB, since Frrata books
shipments after packing; an edit is a stored event (before, after, reason, who, when), the reason never shown to the
shopper; a swap is one action that moves stock in the same transaction; the money outcome shown before saving,
including that Razorpay keeps its fee on a refund; one message to the shopper per saved edit.

## Design (mockup)
- **Where:** the order page's Items card, "Edit items", until packed (the invoice is issued at packing and is never
  rewritten: GST Rule 46). After packing: no edit (cancel, or a credit note after delivery, as today).
- **Edit mode:** per line, the product's other sizes and colours as chips with what is left ("L · 2 left"; sold out
  crossed through; the original dashed), quantity − / +, Remove (with a reason: out of stock, customer asked, other),
  "Put it back". "Add an item" searches the shop's products.
- **What changes**, live beside it: each line's change in words, an offer that now gives less or no longer applies
  (named), and the money: COD "Collect on delivery ₹6,016 → ₹5,207"; paid online and lower → "Refund ₹1,899" (Razorpay,
  5–10 working days; Razorpay keeps its fee); paid online and higher → "Collect ₹499 on delivery" on the slip.
- An edit's reason (out of stock, customer asked, other) is the merchant's, never shown to the shopper.
- **Save** names the order ("Save KS-1042" / "Save and refund ₹1,899"); the safe button keeps the order. A tick, on by
  default when the order has an email: email the new total (or the refund).
- **After:** a toast with Undo (until packed or 10 minutes); the Items card says what each line was ("Was M"); Activity
  records who changed what and the totals.

**Rules (pure, `src/domains/orders/edit.ts`):**
- Allowed in states confirmed, paid and on hold, before packing; never on a cancelled, packed or awaiting-payment order.
- Stock: a removed or swapped-out line's taken stock goes back; the new variant's stock is taken at once (COD and
  paid both take stock today); a size with too little stock can't be chosen.
- Price: each line at the price it was sold at; an added or swapped line at today's price. Offers are the order's own
  (as placed) re-planned on the new lines: one that no longer qualifies comes off, never a new one added.
- COD charge and the COD limits from today's settings (as a switch to COD does); a new total over the COD limit is
  refused with the limit.
- Totals, GST per line and the stored money columns rewritten together (`writeReprice`), as a capture after a switch
  does today.
- Risk is recomputed.

## Phases
| Phase | What |
|---|---|
| OE·1 | COD and unpaid orders: swap, quantity, remove, add; collect amount; email; Activity; Undo |
| OE·2 | Paid online: a lower total refunds the difference through the shop's own Razorpay (refunds API); a higher one collects the difference on delivery |

## Design review
- **UI/UX:** recognition over recall (the other sizes shown, with stock); feedback (the money before Save); the safe
  button named; Undo; refusals as constraints (a sold-out size can't be picked). States: no edit allowed (no button),
  one line, many, a line whose product was deleted (swap unavailable, remove only), staff (owner/admin only, like
  address edit), phone (stacked, sticky Save).
- **Tenancy:** no new table; an `order_events` kind `items_edited` with the field changes (variant ids and quantities,
  never addresses); tenant from `requireMember`.
- **Modularity:** pure planning in `src/domains/orders/edit.ts` (reusing `reprice`, `planOffers`); the write in
  `src/lib/orders/edit.ts` under the order lock (`current()`), as every order write.
- **SSOT / DRY:** one pricing path (`reprice`) for placement, switch, capture and edit; stock through `takeStock` /
  `putStockBack` per line.
- **YAGNI:** no edit after packing (credit note instead), no shopper-side edit, no payment link for a higher prepaid
  total in v1 (collect on delivery instead; signal: shops asking).
- **KISS:** an edit is "these lines now" → reprice → one transaction.
- **Performance:** one order, a handful of lines; one statement batch under the lock.
- **Reliability:** the refund (OE·2) is an outbox row written in the edit's transaction (ADR-0006); a refund Razorpay
  refuses shows on the order as "Refund ₹X not sent · Try again" and never undoes the edit.
- **Security:** owner/admin; Zod with caps; the variant must be the shop's and the same product for a swap; refund
  amount computed on the server, never sent by the client.
- **Unit economics:** a saved order instead of a cancel (and a re-order that often never comes); Frrata's fee follows
  the delivered value as today.
- **Blast radius:** order money columns, stock, offers' use counts (an offer that comes off frees its use), invoices
  (none issued yet by rule), email.

## Out of scope
Edits after packing, the shopper editing her own order, exchanges after delivery (roadmap "Exchange-first returns").

## Facts used
Razorpay docs pages carry one site-wide date (2026-10-08): "served current", not "rechecked that day".
- Partial refund: `amount` less than the payment; more than captured fails; `receipt` unique per payment (our edit id
  makes it idempotent); no normal refund on a payment older than 6 months (Refunds API, 2026-10-08).
- A normal refund is free, but Razorpay's original fee and its GST are not returned (Refunds, 2026-10-08).
- Timing: "5–7 working days" (API page, FAQ) vs "7–10 working days" (Normal refunds page); UPI 2–7 days. Shown as
  "5–10 working days" (2026-10-08).
- Instant refunds cost ₹7.99 (to ₹1,000), ₹11.99 (to ₹25,000), ₹14.99 above; credited back if it falls back to normal
  (pricing, "Last updated May 2026"). Frrata uses normal refunds.
- Refunds come from the merchant's Razorpay balance, can't be cancelled, and may wait in `pending`; `refund.processed`
  is final (FAQ, 2026-10-08).
- Payment Links (an option for a higher prepaid total, not in v1): expire within 6 months, at least 15 minutes ahead;
  `reference_id` ≤ 40 characters; Razorpay's own SMS/email can be switched off (`notify`), which our no-SMS rule needs;
  fee: the standard 2% (pricing page ambiguous: confirm with Razorpay) (2026-10-08).
- GST: a tax invoice is issued before or at the removal of goods; a change after it is a credit or debit note
  referencing it (taxgarden.in, 2026-09-15, secondary); e-invoicing applies above ₹5 cr turnover, B2B only (Tally,
  2026-08-31). **A CA should confirm** editing before the invoice is the clean path for B2C.
