# Neel N2a — the product editor as drawn (the PR·2 redo)
Status: draft (for the review agents) · Date: 2026-11-15 · Spec: `docs/specs/2026-11-13-design-language-neel.md` § N2,
`docs/specs/2026-11-13-products-rework.md` § 4 · Mockups (both approved by the owner, 2026-11-13):
`docs/mockups/2026-11-13-design-language-neel.html` § Screens › Product (the look: Neel), and
`docs/mockups/2026-11-13-products-rework.html` § The editor, § Sizes and colours, § Errors, § On a phone (the layout:
it renders cleanly; the Neel board's grid collapses in Chromium, so the rework board is the reference for placement and
the Neel board for words, colours and components) · Approved: owner, 2026-11-13 (both mockups)

N2b (order detail, offers, settings forms) is not drawn yet: it opens with its own mockup after N2a ships.

## Goal
Ranked problem 3 (catalogue operations): a one-colour kurta from "Add product" to Active in under two minutes on a
phone. Measures: create → first Active (median, from `products.published_at − created_at` for new shops); the editor's
page height on a phone (6,599 px in the 2026-11-13 stress test; target under 3,500 px with folds closed).

## What is drawn, and what we have
| Drawn (in order) | Today | Change |
|---|---|---|
| Header: "‹ Products", the name as plain text, a status chip; Preview and More on the right | The name is an editable textarea in the header; Share in the actions | Name moves into its card; header shows it. Preview (link) and More (menu: Duplicate, View in shop, Share, Delete/Archive) |
| Photos: drag to order, "Cover" on the first, a dashed "+ Add" tile, "JPEG, PNG, WebP" | Photos in a grid, Cover tag, an upload button | Drag (and keyboard) reorder; the add tile as drawn |
| Name, price, description: Name · Price, ₹ · M.R.P., ₹; Description; the address line "…/products/<handle> · follows the name until live" | Price and MRP only per variant; Description its own card; the handle in Search and sharing | One card. Price and M.R.P. here are the product's **common** price (see SSOT); the handle line moves here |
| Sizes and colours: chips with drag handles, "+ Add", swatches on colours, "12 of 100" | OptionsEditor + ColoursPanel | Redrawn as chip rows; the count of variants against the 100 limit |
| Stock and prices: tabs "Price and stock" · "SKU and barcode"; select rows, a bar "Gulabi · 6 sizes selected · Price · Stock · Empty only · Set"; columns Variant · Price · Stock · Shoppers see | VariantGrid: one wide table of every field, a fill row | Two tabs over one table; the bulk bar acts on the selected rows; "Shoppers see" chip (In stock / Sold out / No price yet / Pre-order) |
| Folded rows, one line each with Add/Edit: Details · Size chart · Search and sharing · Tax | Details folds; Size chart, Search and sharing, Tax are full cards | All four as `FoldSection` rows with their summary ("Tax · HSN 6211 · 5% under ₹2,500") |
| Side, sticky: Status (Draft · Active · Unlisted segmented), "Missing: …" chip, Publish | StatusCard with descriptions and a schedule | Segmented as drawn; descriptions go (Rule 0); schedule stays in More (Deviations) |
| Side: Shared on WhatsApp (the link preview) | Share sheet button in the header | The card shows the product's share preview (`shareFor`, already read on the server) |
| Side: Category · Collections chips "+ Add" | OrganiseCard (category, collections, tags) | Category and collections as drawn; tags fold into it below collections (Deviations) |
| Save bar at the foot: "3 unsaved changes · Discard · Save ⌘S" | SaveBar placement bottom, "Save · ⌘S" | Count of changes in the bar's words |

Not drawn, kept (each a Deviations row): Video, The model in the photos, On the pack (label), Stories, Pairs — as
folded rows after Tax, in that order; Summary and Ready for (side) go — their facts are in "Missing: …" and the
Shoppers see chips. Ready for Google and Meta becomes one line in the Missing chip when a feed fact is missing.

## Regression net first
`78-products-pr0`, `79-products-list`, `68-product-video`, `47-offers`, `76-import`, `83-neel-finding`, `90-ux` stay green
before any change (run them on main first and record the result). New flow `85-neel-editor.mjs` written before the
build, failing: header as drawn; the name typed in its card renames the page; common price fills every variant that had
it and leaves an own price alone; select two rows → Set price; SKU tab; folded rows open; Status segmented + Publish;
drag a photo to cover (keyboard too); the phone (no sideways scroll, page height recorded); axe clean.
Unit: `commonPrice` (below) and `applyCommon`.

## SSOT — the common price (no new column)
The product has no price of its own; variants do. The card's **Price** is *derived*: `commonPrice(cells)` = the price
most variants share (ties → the lowest), or empty when none has a price. Typing a new price calls
`applyCommon(cells, from, to)`: every variant whose price equals the old common price, or is empty, takes the new one;
a variant with its own price keeps it (the drawn XXL at ₹2,890). M.R.P. the same over `compareAt`. Both pure, in
`src/domains/catalogue/common-price.ts`, unit-tested. Nothing new is stored; the save sends variants as today.

## Design-system review on the plan (2026-11-15), folded in
- **A fold opens itself on an error.** `FoldSection` gains `invalid` (true when any of its error keys is in `errors`): it
  forces the fold open before `focusFirstInvalid` runs (next frame), and its one-line summary shows a danger "1 to fix".
  The same for the SKU tab (switches to it) and a row's Shoppers see popover (opens it). e2e: a refused save focuses
  HSN inside a closed Tax fold.
- **Three primitives first, in `src/components/ui`:** `SortableList`/`useReorder` (pointer events, not HTML5 drag;
  Alt+←/→ with `aria-keyshortcuts`; `announce("M moved to 2 of 6")`; focus stays; no animation) for photos, size and
  colour chips; `Tabs` (WAI-ARIA tabs: tablist/tab/tabpanel, roving tabindex) replacing the two hand-rolled tablists in
  apps/gst/review-tabs.tsx and settings-form.tsx; `Popover` (native popover, role=dialog, `placeUnder`, focus to the first
  field, Esc back to its trigger; the Dialog sheet on a phone).
- **Status is a draft.** The Segmented choice is a draft value the save bar counts; arrowing never publishes. Publish =
  choose Active and save (one action). With something Missing, Publish is `aria-disabled` (keeps focus),
  `aria-describedby` the Missing chip, and each missing item is a Fix link that focuses its field (opening its fold).
- **The save bar never covers a focused field.** While dirty: bottom padding and `scroll-padding-bottom` equal to bar +
  bottom nav; the bar hides while the on-screen keyboard is open (`visualViewport`).
- **The count is not live.** "N unsaved changes" from `diff(saved, d)` (Discard → 0); `announce()` once when the bar
  appears, then "Saved" or "Changes discarded".
- **44 px on a phone:** photo and chip controls, the fold header, the swatch link: `min-h-11 md:min-h-6` (or Menu's
  hit-area). Chip moves are a chip menu on a phone (no hover there).
- **Bulk bar:** a labelled checkbox per row ("Select Gulabi · M"), select-all with `indeterminate`; the bar an inline
  `role=group` with its count in `role=status`; Set announces "Price set on 6 variants"; Esc clears; the table stays
  `DataTable data-rows="form"`.
- **More:** `Menu`; Delete through `ConfirmDelete`; Share and Schedule open a `Dialog`, and focus returns to More.
- **Photo tiles:** a `Menu` per tile ("Photo 2 of 5": Make cover, Move earlier, Move later, Remove); Cover is a `Tag`.
- **Tokens:** the WhatsApp card in tokens (no WhatsApp green); Price and M.R.P. as `UnitField` with tabular numbers; the
  address line not mono; "N of 100" tabular; a fold's Add/Edit stays the one heading button.

## Tasks
0. **Primitives:** `SortableList`/`useReorder`, `Tabs` (and move the two hand-rolled tablists onto it), `Popover`;
   `FoldSection invalid`; each in the N0 gallery (flow 81) with its keyboard path.
1. **Net**: run the flows above on main; write `85-neel-editor.mjs` (failing) and the unit tests for common price.
2. **Header and the name card**: PageHeader with plain title + StatusBadge; Preview link; More menu (Duplicate, View in
   shop, Share — the existing ShareSheet opens from it — Schedule, Archive/Delete via the existing actions). Name,
   Price, M.R.P., Description, address line in one Section. The title textarea goes.
3. **Photos as drawn**: reorder by drag and by keyboard (Move earlier/later on each tile's menu), saving the order through
   the existing photo action (check `actions.ts` for an order action; if none, one `reorderPhotos` action with
   `check:actions` role tuple and Zod, inside `withTenant`). "+ Add" tile; formats line.
4. **Sizes and colours**: chip rows with drag handles (keyboard: arrows), swatch on colour chips, "N of 100".
   OptionsEditor and ColoursPanel keep their logic (renames keep cells: PR·0); only the drawing changes.
5. **Stock and prices**: tabs over one table; row selection; the bulk bar (Price, Stock, Empty only, Set) acting on the
   selection; "Shoppers see" chips from `shopperSees`; the cost column only for `seesCosts` (as today). SKU and barcode
   tab holds SKU, GTIN; When it runs out and lead days open per row from the Shoppers see chip (a popover), as today's
   fields.
6. **Folded rows**: Details, Size chart, Search and sharing, Tax, then Video, The model, On the pack, Stories, Pairs, each
   a `FoldSection` with a one-line summary; a row with an error opens itself (PR·2 rule kept).
7. **Side panel**: Status segmented + Missing + Publish (one action with Save kept); Shared on WhatsApp preview card;
   Category and Collections (tags below). Sticky on lg. Summary and Ready for removed.
8. **Save bar**: "N unsaved changes" (count of changed top-level fields and cells), Discard, Save ⌘S.
9. **Phone**: one column, side cards after the main ones in the drawn order (rework § On a phone); Save bar above the
   bottom nav.
10. **Reviews on the diff**: impact, design-system, words, security (if task 3 adds an action), speed (page reads),
    mockup-parity; then the owner's Deviations call.

## Deviations (proposed; mockup element · built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Video, model, label, stories, pairs (not drawn) | Folded rows after Tax | Live features with data; dropping them loses what merchants set | — |
| Tags (not drawn) | Under Collections in the side card | Collections' automatic rules read tags | — |
| Schedule a publish (not drawn) | In More › Schedule | Live feature (publish_at) | — |
| Ready for Google and Meta card (not drawn) | One line in the Missing chip | Same facts, the drawn place | — |
| When it runs out, lead days, cap (not drawn) | Opened from a row's Shoppers see chip | Pre-orders and made-to-order are live | — |

## Design review
- **UI/UX:** one primary action (Publish/Save); every state: empty product, no photos, one variant, 100 variants, a save
  refused (errors at fields, input kept), a conflict (Reload), no permission (staff: no cost column), phone.
- **Tenancy:** no new table; a new photo-order action (if needed) reads the tenant from `requireMember`, writes through
  `withTenant`, and checks the image belongs to the product.
- **Modularity:** `common-price.ts` pure; components under `products/_components/`; `product-editor.tsx` (360 lines)
  splits into `editor-main.tsx` and `editor-side.tsx` to stay under check:size.
- **SSOT:** price stays on variants; the common price is derived. Status, readiness, shopper view: existing engines.
- **YAGNI:** no product-level price column; no new status; no undo history beyond Discard.
- **Performance:** no new reads (share card, video, modules are already in the page's one `Promise.all`).
- **Security:** reorder action (if added) Zod-capped (≤ 50 ids), role `ANY_EDITOR`, same as photo upload.
- **Blast radius:** e2e 78, 68, 47, 76 click editor parts by name; each is updated in the same task that moves the part.

## Practices recorded in skills
frata-design-language: § Neel editor (derived common price; folded rows; side panel order). Version bump in task 10.
