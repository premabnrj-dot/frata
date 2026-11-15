# Neel N2a — the product editor as drawn (the PR·2 redo)
Status: active (architecture and design-system reviews folded in, 2026-11-15) · Date: 2026-11-15 · Spec: `docs/specs/2026-11-13-design-language-neel.md` § N2,
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
`78-products-pr0`, `79-products-list`, `68-product-video`, `15-clock`, `49-ship`, `64-seo`, `65-signal`, `70-cleaner`,
`83-neel-finding`, `90-ux` stay green
before any change (run them on main first and record the result). New flow `85-neel-editor.mjs` written before the
build, failing: header as drawn; the name typed in its card renames the page; common price fills every variant that had
it and leaves an own price alone; select two rows → Set price; SKU tab; folded rows open; Status segmented + Publish;
drag a photo to cover (keyboard too); the phone (no sideways scroll, page height recorded); axe clean.
Unit: `commonPrice` (below) and `applyCommon`.

## SSOT — the common price (no new column; architecture review 1 folded in)
The product has no price of its own; variants do. The card's **Price** shows `commonPrice(cells)`: over the LIVE
combinations only (never cells of removed values), the price in paise most variants share (ties → the lowest); empty
when none is priced. "Unpriced" is one test, `unpriced(c)` (`''` or 0 after `parseRupees`), in
`src/domains/catalogue/common-price.ts`, imported by the grid's "Empty only" too.
- **The targets are fixed on focus**: `targetsOf(cells)` = live variants priced at the common price, or unpriced. While
  the field has focus, each keystroke writes the typed price (`rupeesText` of its paise, or `''` while it does not parse,
  e.g. "14.") to those targets only; blur ends it. Clearing the field never sweeps an own price, and an intermediate value
  equal to an own price never takes that variant.
- Under the field, when some variants differ: "Sets 5 of 6 · XXL has its own price" (one tie, or a variant priced at the
  common price on purpose, is visible before typing).
- M.R.P. the same over `compareAt`.
- **Which price where** (one rule each): the card shows the common price; Tax's gap check and the "5% under ₹2,500"
  summary read the common price (was the lowest); the WhatsApp preview reads the buy-box price (`priceOf`,
  `domains/storefront/listing.ts`), as the real link card does; `defaultDescription` keeps the lowest ("from ₹…").
- Unit cases: cleared field, tie, unparsable text, a variant equal to the common price on purpose, removed values ignored.

## Architecture review on the plan (2026-11-15), folded in
- **Folds and hidden fields** (also design-system 1): Tax, Search and sharing, On the pack, Stories fold with `invalid`;
  the SKU tab and the Shoppers-see popover open on their errors; the chip is `aria-invalid`. Field ids and `fieldProps`
  names stay (`title`, `desc`, `handle`, `tax.hsn`, `v:<k>:sku` …). The handle is edited in one place (Search and
  sharing); the address line under the name only shows it.
- **Photos:** the order action exists, `editPhoto(id, { move: -1|1 })` (actions.ts), and the dashed tile and formats line
  exist. Drag adds `move: { to: 0..49 }` to `editPhoto` (Zod), optimistic on drop; role `ANY_MEMBER` as today.
- **The WhatsApp preview** is built in the browser from the draft (title, description, cover, buy-box price), as the
  rework board says ("from your draft, before you publish"); SeoPanel's second preview goes.
- **Blast radius (e2e):** 78 (`radio 'Archived'`, "Save and set to archived", `getByText('Unsaved changes')` → the region
  by name), 15-clock (a status description), 70-cleaner and 49-ship ("Sizes, colours and stock" heading), 64-seo (Share
  moves into More), 65-signal (Stories folds), 68 (Video folds), 90 (page heights). The net adds 15, 49, 64, 65, 70; 47,
  76 and 66 never open the editor and leave the list.
- **check:size:** variant-grid.tsx splits (`stock-table.tsx`, `bulk-bar.tsx`, `shopper-chip.tsx`); Summary and ReadyFor go.
- **onReprice** clears the `v:*:price` errors it fixes and writes `rupeesText(to)`.
- **Archived:** the drawn switch has three states. Archive and Unarchive go in More; an archived product shows its chip
  and the switch reads its last state disabled with "Archived · Unarchive" (Deviations).
- **A variant's own M.R.P. and Your cost** (not drawn as columns): in the Price and stock tab as two more columns, Your
  cost only for `seesCosts`, M.R.P. only when a variant's differs from the card's (Deviations).
- **Phone as drawn (rework § On a phone):** rows grouped by colour; the folds as one "Size chart · Details · Sharing ·
  Tax ›" row opening a sheet; Publish in the save bar ("2 changes · Save · Publish").
- **Check on blur:** a field's mistake shows when it loses focus; a refused save lists "2 things to fix: Price · SKU"
  (the existing summary toast, words as drawn).
- **More** as drawn: Duplicate (copies what is saved; the menu says so when there are unsaved changes) · View in shop ·
  Delete draft (a draft) or Archive (live); then Share and Schedule (Deviations).
- **Chips reorder** with Alt+←/→ (as options-editor does today), never plain arrows.

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
| Schedule a publish (not drawn) | "Go live later" under Active in the status card | Live feature (publish_at); where the old card had it, beside the choice it belongs to | — |
| Ready for Google and Meta card (not drawn) | One line in the Missing chip | Same facts, the drawn place | — |
| When it runs out, lead days, cap (not drawn) | Opened from a row's Shoppers see chip | Pre-orders and made-to-order are live | — |
| The status choice as a change the save bar counts (plan) | The status is its own action (Publish, Make unlisted, Move to draft), not in the save bar's count | One press does what it says; a draft status a Discard could undo would leave the shop and the switch disagreeing | — |
| Phone: Size chart · Details · Sharing · Tax as one row, Publish in the save bar | The folds stay one line each; Publish stays in the status card (after the main cards) | Each fold's line already says what is set; one shared sheet hides which has a mistake | — |
| Stock and prices table | A plain table with row checkboxes (not the list's DataTable) | Two tabs over one set of rows with selection; the list primitive has no tabs or row selection | — |
| A pop-up for the run-out choice on a phone | A sheet at the foot, without a backdrop | The native popover closes on a tap outside; no backdrop keeps the row visible above it | — |
| The name field (drawn one line) | One line; a long name scrolls in its field | As drawn; the page heading above shows the whole name, wrapped | — |
| Status: Draft · Active · Unlisted | Archive and Unarchive in More; an archived product's switch reads "Archived · Unarchive" | Archived is a live status; the switch was drawn without it | — |
| Price and stock columns: Variant · Price · Stock · Shoppers see | Plus Your cost (only who sees costs) and M.R.P. (only when a variant's differs) | Profit per order needs the cost; an own M.R.P. exists today | — |
| More: Duplicate · View in shop · Delete draft | Plus Archive for a live product; Share stays its own button beside Preview | Archive needs a home off the switch; the share sheet is a dialog of its own | — |

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
- **Security:** `editPhoto`'s new `move.to` is Zod-capped (0..49) under its existing role (`ANY_MEMBER`) and row check.
- **Blast radius:** e2e 78, 68, 47, 76 click editor parts by name; each is updated in the same task that moves the part.

## Practices recorded in skills
frata-design-language: § Neel editor (derived common price; folded rows; side panel order). Version bump in task 10.
