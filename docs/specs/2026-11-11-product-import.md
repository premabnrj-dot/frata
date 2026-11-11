# Product import
Status: draft · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/76HjNBCo2xdJyf6Qvwxutx (views 1 · File, 2 · Check, 3 · Done, Photos) · Approved: —

Supersedes the import half of phase-1 § 1A·3 (deferred by the owner on 2026-11-06 until Vercel Pro; Pro is on).

## Goal
North star (3) catalogue operations. A boutique with 60 products in an Excel sheet types about 540 inputs today (4–6
hours; shop stress test 2026-11-11), and that is where sign-ups stall before a first order. Measure: time from
sign-up to the first published product for shops that import, against those that don't. Target: 60 products in
10 minutes.

## Job
An owner moves her catalogue from a spreadsheet or another platform (Shopify, WooCommerce) into Frrata without typing
it again, on a computer or a phone, and sees every problem before anything is written.

## Research
<!-- filled from the research brief (dated sources only) -->

## Design (mockup)
1. **File.** Drop or choose Excel (.xlsx) or CSV, up to 2,000 products. Three starting points: our template, a
   Shopify export, a WooCommerce export. Parsed in the browser (a phone's file picker works). Nothing is sent yet.
2. **Check.** Counts first: new, already in your shop, left out until fixed. Problems as row · column · what to fix,
   with "Download rows to fix" (the same columns, a "What to fix" column, cells starting `=` escaped). Columns matched
   automatically by header (ours, Shopify's, WooCommerce's, common Indian sheet words: Item, MRP, Qty, Rate); "Change a
   match" for the rest; unmatched columns listed as not imported. A preview of the first products as they will look.
   One choice: "Update products already in your shop" (off). Primary: "Import 58 as drafts". Safe: "Keep my shop as
   it is".
3. **Import.** Runs in chunks under a lease (resumable; the page can close). Products arrive as **drafts**. Done shows
   what needs her next, each with its button: need photos, ready to publish, need a GST rate. Import history lists
   each file, who ran it, added and updated counts.
4. **Photos.** Choose many phone photos at once; each is matched to a product by its file name (SKU, address or
   name, with a trailing number for order and a colour for a colour photo); unmatched ones ask "Which product?".
   Resized in the browser like any photo today (one ladder, WebP).

**Parsing rules** (pure, in `src/domains/catalogue/import/`):
- A price: "₹1,299", "Rs. 1299", "1299.00", "1,299/-" → 129900 paise. "1,2,99", "999.999", a negative or zero → a row error.
- Sizes in one cell: "S/M/L", "S, M, L", "S-M-L" → three sizes; "Free size" stays one. A colour column works the same.
- Stock: one number (each size) or per size ("S:4, M:6, L:2"); empty → 0.
- One row per product or one per size/colour (Shopify's: rows sharing a Handle); both read.
- A product's address from its name; a Hindi or other non-Latin name is transliterated (never "product-2").
- SKU unique in the shop and the file; a duplicate is a row error naming the other row.
- Cost (purchase price) imported for the owner only (`seesCosts`), never shown to staff (ADR-0003).
- HSN and GST rate when given; a registered shop's product without a rate imports as a draft that can't go live yet.
- A blank cell never clears a value on update unless asked (no such option in v1).
- Photos by URL (a Shopify export carries them): fetched on the server through the outbox, resized once with sharp,
  stored like uploads; a dead link leaves the product with "Needs photos".

## Phases
| Phase | What |
|---|---|
| PI·1 | File → check → import as drafts (no photos by URL), history, rows to fix; our template; Shopify and WooCommerce headers |
| PI·2 | Bulk photos by file name |
| PI·3 | Photos by URL from an export (outbox + sharp), update existing products |

## Design review
- **UI/UX:** one primary action per step; counts before detail; errors prevented before writing (dry run); products
  arrive hidden (drafts), so a mistake never reaches shoppers; Undo isn't needed (drafts can be deleted in bulk: "Delete
  this import's drafts" on its history row). States: empty (the drop zone), loading (parsing: a bar with rows read),
  error (a file we can't read: "Save it as .xlsx or .csv"), one product, 2,000, no permission (owner/admin; partner
  before handover), phone.
- **Tenancy:** two new tables, `import_jobs` and `import_rows`, tenant-scoped with grant, RLS and policy in one
  migration; rows written by `asMember`; tenant from `requireMember`, never the file.
- **Modularity:** parsing and mapping pure in `src/domains/catalogue/import/`; writes reuse the product create path
  (variants, handles, SKU uniqueness) in `src/lib/catalogue/`; one action per step.
- **SSOT / DRY:** handles, SKUs and variant expansion use the editor's own functions; availability stays derived.
- **YAGNI:** no scheduled imports, no Google Sheets link, no export in v1 (signal: two shops asking).
- **KISS:** browser parse → chunks of 200 rows posted → one job runs them in order.
- **Scalability / performance:** 2,000 products ≈ 6,000 variants: 30 chunks; each chunk one transaction; a refresh of
  the catalogue tag once at the end, not per product.
- **Reliability:** a lease (`lease_until`, `next_row`) resumes a stopped job; the same file twice (hash) is a no-op.
- **Security:** xlsx parsed in the browser only (no server-side spreadsheet parser to exploit); every cell length
  capped; formula cells read as text; photo URLs fetched only over https, size-capped, content-type checked, no
  private IPs (SSRF).
- **Motion and visuals:** the step strip; counts as tiles; the bar while importing.
- **Unit economics:** none on fees; faster first sale.
- **Blast radius:** product creation code paths (shared with the editor), catalogue cache tag.

## Out of scope
Exports, scheduled syncs, Instagram shop import (signal: owner asks), Meesho/Myntra formats (marketplace export is its
own module).

## Facts used
<!-- dated, from research -->
