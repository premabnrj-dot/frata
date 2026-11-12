# Product import
Status: active · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/76HjNBCo2xdJyf6Qvwxutx (views 1 · File, 2 · Check, 3 · Done, Photos) · Approved: owner, 2026-11-12

> **Amended by the plan reviews (2026-11-12):** see `docs/plans/2026-11-12-product-import.md` § Changes to the spec — that table overrides the text below where they differ.

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
Sources dated by the page (cutoff 2025-11-11). Shopify's help pages carry no date: their facts are **unverified** by
the 12-month rule, though still the most complete reference. No current NN/g or Baymard study of spreadsheet import
was found.
| Product | Taken | Not taken |
|---|---|---|
| Shopify product CSV (help pages, undated) | One row per variant grouped by a handle, the first row carrying the product; photo URLs fetched by the server; a column missing from the file leaves values alone | A blank cell blanks the value; changing option values deletes variants; errors only by email, no error file, no history, no cancel |
| Zoho Commerce (India; help, 2026-10-30) | Configure → map fields → preview; headers auto-matched and the mapping saved; duplicates "skip" by default; preview counts ready / skipped / unmapped | Matching on platform ids a merchant from Excel won't have |
| Airtable CSV import (support, ~Oct 2026) | Merge on a chosen key; a preview counting updated / unchanged / new before writing; the mapping remembered | Invalid values silently imported blank and not listed |
Taken for Frrata: a dry run always; every rejected cell by row, column and reason with the failed rows as a file; a
mapping saved per source (Shopify, WooCommerce, an Excel layout); re-import updates by SKU, then address, and never
duplicates; a blank cell means "no change" (the opposite of Shopify); no variant is ever deleted by an import; prices
parsed forgivingly (₹, Rs, INR, "1,299", Indian grouping "1,00,000", "/-") and shown back for her to confirm, an
unreadable price an error, never 0; photos fetched after the import, never holding it up.

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
- On update (PI·3) a blank cell never clears a value, and no variant is deleted; a product is matched by SKU, then by its address.
- The column mapping is remembered per source (a Shopify export, a WooCommerce export, her own sheet's headers).
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
- Shopify: Title required for a new product, a handle once there are variants; 3 options; one image URL per row, up
  to 250 a product; prices without a currency symbol; 15 MB per file; results by email (help.shopify.com, undated:
  unverified).
- Zoho Commerce: CSV, TSV or XLS up to 25 MB; skip or overwrite duplicates (zoho.com/commerce/help, 2026-10-30).
- Airtable: 25,000 rows and 5 MB; the key match is case-sensitive; a repeated key uses its first row (support, ~Oct 2026).
- No current source on how platforms parse "₹1,299.00" or "1,00,000", or on import from a phone.
