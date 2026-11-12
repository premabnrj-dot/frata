# Products PR·1 — the list
Status: active · Date: 2026-11-13 · Spec: `docs/specs/2026-11-13-products-rework.md` · Mockup: https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4 (§ Products list, § Delete and archive) · Approved: owner, 2026-11-13

## Goal
Ranked problem 3 (catalogue operations): find any product in two taps and act on many at once. Measure: products
archived/deleted/duplicated per shop per week; support asks "how do I delete a product".

## Regression net first
- e2e `78-products-pr0` (PR·0) stays green; `90-ux` screenshots the list.
- Unit: the list's filter/sort parsing (`listQuery`, pure), `deletable` rule.
- Int: `products-bulk.int.test.ts`: delete refuses a live, published, scheduled, ordered or filmed product and deletes the rest;
  another shop's id is a no-op; duplicate copies options, prices, photos, colours and collections but not SKUs, barcodes,
  handle history or status; set status refuses what isn't ready and names it.

## Tasks
1. **Pure query parsing** — `src/domains/catalogue/list-query.ts`: `listQuery(searchParams)` → `{ status, low, sort, q, page }`
   (status: all | active | draft | unlisted | archived; `low` = "Low stock"; sort: edited | name | stock). Verify: vitest.
2. **Read** — `listProducts(tenantId, query)`: search title, SKU or tag; Low stock = a size selling from stock
   (`when_out = 'stop'`) with 1–`LOW_STOCK_AT` left; sort edited (index `products_tenant_updated`), name, stock; rows add
   `colours` (up to 6 hex swatches from `product_colours`) and `optionNames`. `statusCounts` adds `low`. One `withTenant`, two
   statements as now plus the counts. Verify: int test + EXPLAIN at 10k products (speed-reviewer).
3. **Shared delete rule** — `src/lib/catalogue/delete-products.ts`: `deleteProducts(tx, tenantId, ids)` locks the rows,
   deletes only drafts never published or scheduled, never ordered (any size, archived ones included) and with no product
   video, returns `{ deleted, kept: { id, why }[], photos }`; photo blobs go after commit if no other row shows them
   (`photosInUse`). `import-drafts.ts deleteDrafts` calls it (one rule, two callers).
4. **Actions** (`products/bulk-actions.ts`, every one `asMember(ANY_MEMBER)`, ids Zod-checked uuids, ≤ 50 per call, tenant
   from the member): `bulkStatus(ids, status)` (live needs readiness for each; the not-ready are named and left as they were),
   `bulkArchive(ids)` returning the previous statuses for Undo, `restoreStatus(pairs)` (Undo; live again only if still
   ready), `bulkDelete(ids)`, `duplicateProduct(id)` (≤ 1 at a time, copy is a draft "Name copy"), `addToCollection(ids, collectionId)`
   (manual collections only). One audit row per action with the count.
5. **UI** — the page stays a server component; the table becomes `ProductTable` (client) for selection only:
   - filter chips with counts (All, Live, Draft, Unlisted, Archived, Low stock), the search (name, SKU or tag), Sort select;
     links, no client state;
   - checkboxes (row and all-on-page), a bulk bar when ≥ 1 selected: Set status ▾, Add to collection ▾, Duplicate (1
     selected), Archive, Delete;
   - rows: thumb, name, sub-line "type · edited 2 h ago", status chip, price, stock, "6 sizes · ●●●" swatches;
   - Archive/status/duplicate: toast with Undo (8 s); Delete: a dialog. Drafts never live: "Delete 2 drafts?"; when some
     can't go: "N have orders or were live: archive them instead", with Archive as the action. 5 or more: type the count.
6. **e2e** `79-products-list`: search by tag, Low stock filter, select 2 → Archive → Undo → back; Duplicate → copy opens as
   draft; Delete a draft (dialog) → gone; Delete an ordered one → offered Archive.

## Review findings and what the plan does (architecture-reviewer, tenancy-auditor, 2026-11-13)
- **Duplicate copies no photos** (blocker: `product_images_tenant_base` is unique and `photosInUse` doesn't look at other
  products' photos, so shared files would be deleted with the copy). A copy is a new colourway with its own photos.
  Swatches keep hex and family, not the crop. Stories (which `photosInUse` does guard) are copied. The copy's handle comes
  from `freeHandle` ("<handle>-copy"), its options and values as they are, SKUs and barcodes blank (made on save), status draft,
  tenant from the member, never the source row.
- **One status function**: `setStatusIn(tx, tenantId, ids, status, when)` in `src/lib/catalogue/status.ts`, rows locked in
  id order. `setStatus`, `bulkStatus`, `bulkArchive` and Undo all call it. Live needs readiness for each row. The ones not ready
  are named and left as they were.
- **Undo of Archive** restores `{ status, publishAt }` (a schedule still in the future stays scheduled), Zod-checked
  (enum, ISO date, ≤ 50), through `setStatusIn`: never more than Set status would allow.
- **Delete files once**: `removePhotoFiles(tenantId, photos)` (`src/lib/catalogue/photo-files.ts`) keeps only bases
  inside this shop's folder (`acceptedBase`), calls Blob `del` with a 10 s timeout, logs a failure. Both import and list
  deletes call it after commit. `deleteProducts` re-checks draft and never-published in its `where`.
- **Add to collection**: manual collections of this shop only (`tenant_id` and `kind = 'manual'`, else "not in your
  shop"), `on conflict do nothing`.
- **refreshShop(tenant, 'catalogue')** after every bulk commit; audit `detail` keeps the ids (≤ 50).
- **Low stock counts on-hand stock** (`variants.stock`, as the list's Stock column does): a merchant restocks the shelf.
  Held carts expire in minutes. The rule (`when_out = 'stop'`, 1–`LOW_STOCK_AT`) is one SQL fragment in
  `src/lib/queries/catalogue.ts`, beside the list that reads it.
- **Speed**: tag search is an exact, case-blind tag match (`exists (select 1 from unnest(tags) …)`), not a substring.
  Counts run in the list's own `withTenant`. Budget: < 150 ms at 10k products for a stock sort with a term (speed-reviewer
  on the built SQL).
- **Who may**: any member, as in the editor today (each can already archive or publish one product there).
- **Words**: the status chips keep "Active" (`statusLabel`, used across the console); the mockup's "Live" is not
  introduced in one place only.
- **States**: a partial bulk result says "Archived 3. 2 weren't changed: …"; selection clears on any filter or page change;
  Low stock with none: "No products are low on stock"; `ProductTable` gets row ids and display fields only.

## Decision taken without the owner (they asked me to decide, 2026-11-13)
- **Delete happens on the server, with no definer** (spec § Security said a definer): `frata_app` already holds delete on
  `products` under RLS (the import deletes drafts this way), and the rule lives in one module (task 3).
- **Delete has no Undo; it is confirmed by a dialog** (5 or more: type the number). A delete removes the rows and their photo files, so an 8 s Undo
  would need a soft-delete column and a sweeper for a rare action. Archive, status changes and Duplicate keep Undo, as
  the mockup draws. Revisit if merchants ask for a delete Undo.

## Design review
- **UI/UX:** one primary action (Add product); filters are links (back button works, shareable); selection is the only
  client state; every bulk action reports counts and names what it left; phone: rows stack, the bulk bar sticks to the
  bottom. Rule 0: no helper text.
- **Tenancy:** no new table. Every read and write through `withTenant`/`asMember`; ids from the body are filtered by
  `tenant_id` in every statement; a foreign id is silently not found.
- **SSOT:** delete rule once (task 3); availability via `bestOffer`; readiness via `readinessIn`.
- **YAGNI:** no saved views, no column picker, no CSV export (Import exists), no per-page size.
- **Performance:** list ≤ 3 statements; `Low stock` an `exists` on variants (tenant, product) index; bulk ≤ 50 ids.
- **Security:** Zod on ids, cap 50, ANY_MEMBER (as the editor); delete only via the shared rule; audit rows.
- **Blast radius:** import's delete (now the shared rule, its int tests stay), `90-ux` list screenshot, `listProducts` caller.

## Practices recorded in skills
- frata-design-language § Products rework: bulk bar shape, delete confirmed vs undo rule.

## Repetitive work → agents and scripts
| Work | Becomes |
|---|---|
| Checking a destructive action has a confirm or an Undo | (already in security-reviewer) |
