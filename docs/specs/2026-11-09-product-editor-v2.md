# Product editor v2: calmer, one place for each fact
Status: draft · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/Bh81vh3bKbMBFh5Rf6B4yQ (`docs/mockups/2026-11-09-product-editor-v2.html`) · Approved: waiting for the owner

## Goal
Ranked problem 3, catalogue operations: a merchant lists and keeps a product right faster, on a phone, without help.
Measures: time to list a product with 3 sizes × 2 colours (e2e stopwatch, today's editor as the baseline); the
editor's height at 390 px (today 6,599 px; target under 3,000 px for the same product); products saved with a
problem fixed from the error summary (counted from the save action's error codes).

## Job
A fashion merchant adds a new piece from the photos on their phone, and later changes its price or stock in seconds,
without reading every card to find the one field.

## Research
Current code (screenshots of `/console/products/chanderi-kurta-set`, 9 Nov 2026):
- 11 cards of equal weight; 3,341 px on a computer, 6,599 px on a phone.
- Status shows three times (header badge, Status card, Summary card); on a phone it is the last card.
- Readiness shows twice ("Ready · 6 of 6" in Status, the "Ready for" card).
- Colour is set in two places (the option chip, then a Colours list for family and swatch).
- Each size × colour on a phone is a 340 px stack of seven fields; 6 sizes × 4 colours is about 8,000 px.
- 11 "Choose…" dropdowns in Details; the cost is typed per size though it is nearly always one cost per colour.
- Three save models live together: photos save as added, Status is its own action, the rest is one Save.

Products (every source dated; [U] = undated or older than 12 months, treated as unverified):
- **Shopify**, Fall '26 variant redesign (2026-10-28): variants grouped, filtered and bulk-selected on the product page;
  a table view; a side panel for category, status and publishing that stays in view; heavy sections collapse; guided
  setup asks media, title, description first; options suggested from the category. Category metafields drive colour
  swatches (craftshift, 2026-10-19). Unlisted status (Winter '26, 2025-12-10). Explicit save bar [U, shopify.dev].
  **Taken:** variants grouped by colour with bulk select; status in the side; collapsed sections; photos first.
- **Indian tools**: Meesho's common bulk rejections are a missing HSN code, GST rate or category attributes
  (base.com, 2026-08-20); Myntra extracts colour, fabric, neckline and sleeve from a photo (Apparel Resources,
  2026-07-18); Dukaan's description generator is unreliable for complex pieces (review, 2026-06-19).
  **Taken:** check HSN and category attributes before going live, never after; photo suggestions only as drafts.
- **Etsy** "Quick list" test suggests title, tags, attributes from photos for review, nothing applied by itself
  (Value Added Resource, 2026-09-22). **Alura** photos per variation and a field-level revert (2026-06-30).
  **Linear** marks agent edits separately (2026-07-23). **Taken:** suggestions are marked until the merchant keeps them.
- **Research**: NN/g, dropdowns (2026-07-17): buttons or radios when options fit, long dropdowns go wrong on phones,
  numeric keypad for numbers. GOV.UK error summary (updated June 2026): one summary at the top, focused, each item a
  link to its field, the same words as the field's message. Baymard, product page 2026 (2026-03-18): shoppers judge
  size from photos; a human model image and size buttons matter. **Taken:** chips for small sets, the error summary,
  the model beside the size chart.

## Design (the mockup)
Phased (frata-planning rule 1); this spec asks approval for **E·1**, and shows E·2 and E·3 for direction only.

**E·1 Calmer editor (no new data):**
1. Header: title (the field), the shop address, Preview, Share, More (Duplicate, Archive).
2. Side, in view while scrolling: **Status** as one three-way switch (Draft · Active · Unlisted) with Schedule; under it
   one **checklist in two tiers**: *Can sell* (photo, title, price, something in stock, HSN when the shop charges GST)
   gates Active; *Google and Meta* is advice. Each open item is a link to its field. Price and stock in two figures.
   **Organise** (category, collections, tags). The Summary and Ready-for cards go.
3. Main: Photos (cover larger, colour dot per photo, drag to reorder plus a non-drag Move), Description, **Sizes and
   colours** as chips (each colour chip carries its swatch and family: the Colours list goes), **Price and stock**
   grouped by colour (cost once per colour, stock steppers, select rows to set price, stock or "when sold out" for
   many; SKU and barcode on request), **Details** (what Google asks as chips first; the rest under "More details ·
   N"), **Fit** (size chart as one line with View and Change, the model beside it), then one card of folded rows with
   a one-line summary each: Tax, Search and sharing, On the pack, Story and pairs.
4. Phone: title, then a status chip and the checklist count at the top; photos as a strip; each colour a row
   ("₹2,490 · 9 in stock · S on pre-order") that opens a sheet with price, cost and per-size steppers; folded rows for
   the rest; the Save bar above the bottom bar.
5. A failed save: an error summary at the top, focused, each problem a link that opens its folded row and focuses the
   field; the field shows the same words.

**E·2 Photos first (separate mockup round):** a new product starts with photos, title, price, sizes, colours and
one stock figure; the rest folds with "Add later"; tax and size chart from the category and the last product.
**E·3 Filled from photos:** suggestions from the photos, marked until kept; needs the unit-economics review.

## Design review (E·1)
- **UI/UX** — one primary action per state (Save in the bar; Status in the side). States: empty (new product: the
  checklist lists what is missing), loading (none; server-rendered), error (the summary), one size or colour
  (no grouping row), many (24 rows: groups fold, a group shows its sums), no permission (staff: no cost, as today),
  phone (sheet per colour). Keyboard: every chip and stepper is a button; the error summary takes focus; folded rows
  are `<details>`. Norman: status mapped to one control; constraints (Active needs Can sell) over refusals.
- **Tenancy** — n/a: no new table, read or action; the same `saveProduct` and `productForEdit`.
- **Modularity** — `readiness()` in `src/domains/catalogue/product-form.ts` gains the two tiers (pure); the grid and
  sheet are `_components`; the error summary becomes a primitive in `components/ui` (Settings will reuse it).
- **SSOT / DRY** — cost per colour is a view: saving writes the same per-variant `unit_cost`; "Can sell" is one
  function read by the checklist, the Status switch and the save action (which already refuses Active without a price).
- **YAGNI** — no autosave (a product change goes live; research favours an explicit save), no tabs or stepper (tabs
  hide errors), no field history (comes back if merchants ask to undo a saved edit).
- **KISS** — the same data and actions, rearranged; the biggest piece of new code is the colour-grouped grid.
- **Scalability / Performance** — the page runs the same statements; the editor's client JS should not grow beyond
  today's (measured before and after with the speed-reviewer); 24+ variants render grouped and folded.
- **Reliability** — unchanged (photos already save as added through Blob).
- **Security** — unchanged actions; cost stays server-gated by `seesCosts`.
- **Motion and visuals** — sheet on the spring (rule 25a), folds 200 ms, the Save bar as today; reduced motion fades.
  Swatches and photo colour dots carry colour; words always beside them.
- **Unit economics** — E·1 none. E·3 adds a model call per product (review before E·3).
- **Blast radius** — `product-editor.tsx` (271 lines) and its 12 panels; e2e flows that edit products (`05`, `10`,
  `47`, `64`, `70`, `90-ux`) change selectors: the regression net is updated first (rule 5).

## Out of scope
- Autosave, tabs, a stepper (signal: merchants lose work, which the leave guard already prevents).
- Bulk editing across products (signal: catalogues past 200 products ask for it).
- A Hinglish or voice assistant (signal: E·3 shows merchants use suggestions).

## Facts used
See Research; every source and its date is in the mockup's "What changed" view and in this file. No integration
facts are used in E·1.
