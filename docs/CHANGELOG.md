# Changelog

What a merchant (or Frata staff) can do now that they could not before, newest first. One entry per closed
phase; the detail is in its plan.

## 2026-11-08 — Analytics A·1 ([plan](plans/2026-11-08-analytics-a1.md), [spec](specs/2026-11-08-analytics-a1.md))

- **Console › Analytics** (`/console/analytics`): where this period's orders came from (7, 30 or 90 days against the
  period before), judged on ₹ kept after returns: delivered, came back or lost, before ads and packaging. Orders,
  sales, COD, delivered and came back per source; counts, not shares, under 30; returns by pincode.
- **A source's page:** its campaigns and its latest 50 orders, each opening the order.
- **Make a link:** a link for an Instagram bio, a story, a WhatsApp broadcast or an ad, to any page, with a name;
  copied in one tap, and it says what its orders will show as. "A creator" goes to Offers.
- **The order page says where the order came from** ("Came from: Creator · Riya · diwali-drop").
- **The shop remembers where a shopper came from** (the link's tags and the referring site) until the order; a console
  preview never does. An abandoned order's click ids are erased with its other details.
- **₹ kept is a cost:** owners and admins see it; a partner only before handover; staff never. Product cost of goods
  follows the same rule.

## 2026-11-07 — 1D Orders ([plan](plans/2026-11-07-orders.md), [spec](specs/2026-11-07-orders.md))

- **The orders queue** (`/console/orders`): To confirm · To pack · On hold · All, with counts; 50 a page;
  search by number, name or the last digits of a phone; keys (`j` `k` `x` `c` `h` `p` `z`, `?` lists them,
  a switch turns them off); bulk Confirm (High-risk orders skipped and counted), Hold and Print slips.
- **COD risk as reasons, not a score:** several COD orders from one phone today, an earlier fake cancel, an
  address too short to deliver, a total far above the shop's usual; one next step (Call, WhatsApp).
- **The order page:** one primary action for its state (Confirm · Mark packed · Print packing slip · Cancel
  and refund); Hold and Undo for 8 s; Cancel with a reason, putting stock back per line; edit who it goes to
  until packed; team notes; activity with who did what (field names only, never shopper data).
- **Documents:** the packing slip (Code 128 barcode drawn locally; what to collect, or "Prepaid — collect
  nothing"; a cancelled order gets none, and the page says why) and the tax invoice or bill of supply,
  numbered once at Mark packed (`KESR/26-27/00001`, ≤ 16 characters; a series too long for the year is refused in
  Settings), CGST + SGST inside the seller's state, IGST outside. The seller's name and address are stored as the
  invoice is issued, and an issued invoice is never rewritten: a payment captured after packing is flagged on the
  order page (tell the courier, or refund) instead.
- **Bulk Undo** in one request, and Undo only ever reverses an order's latest action.
- **Stock per line:** a late payment, a switch to Pay on delivery or a cancel never takes or returns stock twice;
  the product page shows what checkout can sell.
- **Cleaner screens:** explanation behind an (i), limits, money and legal words kept visible; homepage claims
  that were not yet true corrected.
- **An open shop keeps its grievance officer:** opening needs a name, email and phone (owner, 2026-11-07), and a
  filled-in field cannot be emptied while the shop is open.
