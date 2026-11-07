# Changelog

What a merchant (or Frata staff) can do now that they could not before, newest first. One entry per closed
phase; the detail is in its plan.

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
  nothing", or "Cancelled — do not ship") and the tax invoice or bill of supply, numbered once at Mark packed
  (`KESR/26-27/00001`, ≤ 16 characters), CGST + SGST inside the seller's state, IGST outside.
- **Stock per line:** a late payment, a switch to Pay on delivery or a cancel never takes or returns stock twice;
  the product page shows what checkout can sell.
- **Cleaner screens:** explanation behind an (i), limits, money and legal words kept visible; homepage claims
  that were not yet true corrected.
- **An open shop keeps its grievance officer:** opening needs a name, email and phone (owner, 2026-11-07), and a
  filled-in field cannot be emptied while the shop is open.
