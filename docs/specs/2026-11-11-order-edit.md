# Edit a placed order
Status: draft · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/76HjNBCo2xdJyf6Qvwxutx (views COD, Paid online, Saved) · Approved: —

## Goal
North star (1) COD/RTO losses and (2) size returns. Today a "change my size" WhatsApp or a piece out of stock after
the order means cancelling the whole order and hoping the shopper orders again, or shipping two of three pieces with a
COD slip that still says the full amount, which the shopper refuses at the door (shop stress test 2026-11-11).
Measure: orders cancelled with reason "out of stock" or "customer asked", before and after; RTO on edited orders.

## Job
Before a parcel is packed, the merchant changes what is in it (size or colour, quantity, a piece removed or added),
and the amount to collect or refund follows, with the shopper told.

## Research
<!-- filled from the research brief (dated sources only) -->

## Design (mockup)
- **Where:** the order page's Items card, "Edit items", until packed (the invoice is issued at packing and is never
  rewritten: GST Rule 46). After packing: no edit (cancel, or a credit note after delivery, as today).
- **Edit mode:** per line, the product's other sizes and colours as chips with what is left ("L · 2 left"; sold out
  crossed through; the original dashed), quantity − / +, Remove (with a reason: out of stock, customer asked, other),
  "Put it back". "Add an item" searches the shop's products.
- **What changes**, live beside it: each line's change in words, an offer that now gives less or no longer applies
  (named), and the money: COD "Collect on delivery ₹6,016 → ₹5,207"; paid online and lower → "Refund ₹1,899" (Razorpay,
  5–7 working days); paid online and higher → "Collect ₹499 on delivery" on the slip.
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
<!-- dated, from research: Razorpay refunds API, refund timelines, fees -->
