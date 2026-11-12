# Products rework — list, editor, variants, swatches, delete, links
Status: draft · Date: 2026-11-13 · Mockup: https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4 · Approved: — (awaiting the owner)

## Goal
Ranked problem 3 (catalogue operations) and 5 (a premium-looking storefront): a brand adds a sellable product in under
two minutes on a phone, finds any product in two taps, and never loses work or a price by editing. Measure: time from
"Add product" to Live (target < 2 min for a one-colour kurta with photos), products added per shop per week, support
asks about products.

## What the audit, the stress test and the research found (2026-11-12)
Three agents ran: a code audit (23 findings), a browser stress test across categories on the e2e stack (13 failures,
timings), and dated research (Shopify incl. its Dec 2026 variant redesign, WooCommerce, Dukaan, NN/g, Baymard,
WhatsApp/X card rules). The ones that matter most:
- **Broken today:** the list stops at 50 products with no pager or search; there is no delete or duplicate; a draft can't
  be saved until every variant has a price; renaming a colour or size wipes its price, stock and SKU; sizes can't be
  reordered (S, M, L, XS, XL…); a new product takes the first product type, so a kids' kurta went live with an XS–XXL
  bust/waist chart; size-chart cells drop decimals (23.5 → 235); changing category erases details silently; the list
  says "Sold out" for made-to-order and pre-order products; "Set every price" overwrites per-size prices.
- **Complexity:** ~11 cards on one page (6,599 px on a phone); five save models on one page (photos save at once, video
  saves itself, size chart has its own Save, status is its own action, the rest waits for the Save bar); status shown 3
  times, readiness twice; Publish is at the very bottom on a phone; one-size products (saree, earrings, bag) keep
  clothing sections and HSN 6211.
- **Speed is fine** (save 135–294 ms up to 100 variants, keystroke 14–27 ms, editor reload 228 ms) but every photo edit
  reloads the whole page, and the editor's server reads run five in a row.
- **Link preview:** tags are right (og product, 1200×630, summary_large_image, price) but the card is text on beige; the
  editor's "Shared on WhatsApp" box doesn't look like the real card; the card is cached 5 minutes.
- **Keep:** field errors at the field with clear words, version conflicts, availability derived, Indian-script
  addresses (कुर्ता सेट → kurta-set-…), 308 redirects from old addresses, the swatch cut from a photo, the tax panel,
  costs only for who may see them.

## The approach (recommended)
**One page, one save, a sticky aside; a product starts from what it is.** As Shopify's Dec 2026 redesign does
(variants inline, status and publishing in a sticky side panel, price/stock grouped), and as NN/g/Baymard advise for
forms (validate on blur, error at the field, never reset input).

1. **Start from "What are you selling?"** — the new-product step asks the name and picks a kind: Clothing with sizes,
   Footwear, Kids, One size (saree, dupatta, jewellery, bags). The kind sets the options (S–XXL in order, UK 5–11,
   2-3Y…), the size chart (or none), the HSN default and which sections show. No more "first type wins".
2. **One save model.** Everything on the page is a draft until **Save** (photos upload at once but their order, colour
   and alt join the draft). The Save bar is sticky at the bottom on every width, with ⌘/Ctrl+S and Back protected.
   Status changes go through the same Save.
3. **Sticky aside: Status, Publish, Share card.** Status (Draft, Active, Archived, + **Unlisted**: reachable by link,
   out of search — for Instagram DM links), a readiness line that names the one thing missing, the real share card drawn
   from the draft, and the address. On a phone the aside becomes a top strip and the Save/Publish bar stays at the bottom.
4. **Sections, in the order a brand works:** Photos → Name, price, description → Sizes and colours → Stock → Details
   (category-driven) → Size chart → Search and sharing → Tax. Empty sections fold to one line ("Add a size chart").
5. **Sizes and colours you can edit like text:** rename a chip in place (cells move with it), drag to reorder, case-blind
   duplicates refused at typing, the 100-variant cap shown as you type. The colour option is recognised by its kind, not
   its name (Colour, Shade, Print, रंग all get swatches and photos per colour).
6. **Variant table that fills, not overwrites:** select rows (a colour, a size, all) and set price, stock or SKU; "Fill
   empty only" by default; SKU/barcode in a second view tab, never off-screen.
7. **List that scales:** search, sort, filters (status, stock, type), numbered pages, checkboxes with Set status,
   Archive, Delete, Add to collection, Duplicate; Import in the header; thumbnails; availability from the one rule.
8. **Delete that can't hurt:** a product never live and never ordered can be deleted (typed name for 5+); any other is
   archived (orders keep their snapshot). Archive and delete give Undo for 8 s; an Archived filter restores.
9. **Permalinks:** the address follows the title until first live, then stays; editing it later writes the redirect
   automatically (as today) and collapses chains; the field is shown under the title, never hidden.
10. **Link preview as a full-website card:** 1200×630 with the product photo, name, ₹ price, the shop's logo and address
    (frrata link or own domain); og:title "Name · ₹2,490"; the image versioned by photo + price, cached a day; the editor
    shows the same card from the draft. WhatsApp: < 300 KB.
11. **Colour and type:** status chips on the console tokens (Live green, Draft neutral, Unlisted blue, Archived grey,
    Sold out amber), photo-forward rows, one accent (the rani thread) for the primary action only, money in mono.

## Phases (each its own plan and reviews; this mockup covers all)
- **PR·0 Fix what's broken (no mockup needed: bugs):** pager + search on the list; draft saves without prices; rename
  chips carry cells; size order; kind-driven type default and chart-size check at publish; decimals in chart cells;
  confirm before category wipes details; Sold out from availability; "fill empty only"; SKU taken marked at the field;
  HSN unknown said; regression e2e first.
- **PR·1 List:** search/sort/filters, bulk actions, Duplicate, Delete/Archive with Undo, Import entry, thumbnails.
- **PR·2 Editor:** one save model, sticky aside and bottom bar, sections reordered and folded, kinds, phone layout, the
  editor's reads in parallel and photo edits without a full reload.
- **PR·3 Variants and swatches:** inline rename/reorder, selection fill, colour kind not name, swatch states.
- **PR·4 Links:** address follows title until live, chain collapse, the full-website share card and its live preview,
  Unlisted.

## Design review (first pass; agents run on each phase's plan)
- **Tenancy:** no new table except Unlisted (a status value) and delete (a definer that refuses ordered/live products);
  reads through `withTenant`.
- **SSOT:** availability (`availability.ts`), readiness (one function), option kind (one `optionKind()` replacing the
  three regex copies), share card (`render-card.tsx` used by both the shop and the editor preview).
- **Speed:** list paged at 50 with an index on (tenant, status, updated); editor reads in one `Promise.all`; memoised
  panels; no router.refresh on photo edits.
- **Security:** delete only via a definer; typed confirmation; audit rows.
- **Blast radius:** e2e flows that create products (10, 47-offers, 76-import, 05-shop-look baselines), Import's drafts,
  True Profit's product names, share cards.

## Out of scope
- Combined listings (separate products as one), 2,048 variants (fashion needs two options; cap stays 100).
- Inventory by location (no warehouses yet).
- Autosave (Shopify keeps explicit Save for products; so do we).

## Facts used
Research brief 2026-11-12 (in the session): Shopify variant redesign 2026-10-28; Shopify Unlisted 2025-10-21; WhatsApp
link preview doc (undated, read 2026-11-12); X cards (undated); NN/g forms (reviewed 2024-12-12, older than 12 months);
Baymard inline validation (2024-01-09, older than 12 months).
