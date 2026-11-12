# Products PR·3 — sizes, colours and swatches
Status: active · Date: 2026-11-13 · Spec: `docs/specs/2026-11-13-products-rework.md` § 5, 6 · Mockup: https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4 (§ Sizes and colours, § edge cases) · Approved: owner, 2026-11-13

## Goal
Ranked problem 3: options edited like text, fills that never overwrite, colour wherever the brand calls it that.
Measure: support asks about sizes or colours; products with a Shade/Print option that get swatches.

## Regression net first
`78-products-pr0` (rename keeps cells), `79-products-list`, `65-signal`, `90-ux`, the shop's picker flows (`05-shop-look`,
`10-checkout`) stay green. Unit: `optionKind` for every name it knows; reorder keeps every cell.

## Tasks
1. **One rule for what an option is** — `optionKind(name)` in `src/domains/catalogue/option-kind.ts`: `size` (Size,
   Sizes, साइज़), `colour` (Colour, Color, Colours, Shade, Shades, Print, Prints, रंग), else `other`. `isSizeOption` and
   `isColourOption` (`src/domains/storefront/picker.ts`) become `optionKind(name) === …`; the seven regex copies
   (editor, options editor, variants, product-form, seo defaults ×2, import read) call them. The shop's swatches and the
   editor's colour panel then follow a "Shade" option too.
2. **Reorder chips** — each chip has ← → buttons (shown on focus and hover, 24 px) and Alt+←/→ on the chip moves it;
   the order is the option's values order, which the grid, the shop's buttons and the size chart follow. Cells are keyed by
   values, so nothing moves with it but the order.
3. **Removing an option asks first** when it has values: "Remove Size and its 18 rows?" (a Dialog; Keep the safe one).
4. **Fill by size too** — the bulk bar's "Set for" lists every value of the first option and of the grouped one
   ("Every S", "Indigo"), still "Empty only" by default.
5. **Two views of the table** — tabs "Price and stock" | "SKU and barcode" above the grid; the second shows the SKU and
   barcode columns only, so neither sits off-screen on a laptop. A mistake in a hidden column switches to its tab.

## Review findings and what the plan does (architecture-reviewer, 2026-11-13)
- **Which option is the colour has one answer, with precedence** — `colourIndex(names)`: Colour/Color first, then
  Shade, then रंग; first among equals. Every `findIndex(isColourOption)` and `find(/colou?r/)` uses it, so a product with
  "Print, Colour" keeps its Colour swatches on the next save (a test pins it).
- **Print is a pattern, not a colour** (Google and schema.org name it `pattern`): no swatches, no `color` in structured data;
  nothing is emitted for it until a dated fact in `frata-integrations` says how. Shade and रंग are colours.
- **Names compared as typed in any form:** NFC, trimmed, case-blind (साइज़ with ज़ as one character or as ज + nukta).
- **Reorder:** Alt+←/→ is taken only while a chip has focus; focus stays on the moved chip; each move is announced
  ("M moved to 2 of 5").
- **"Set for"** lists each value of the grouped option and of the first option once.
- **Blast radius** (added): the listing card, photo-per-colour (`lib/catalogue/photos.ts`, `lib/queries/photos.ts`), readiness
  (a साइज़ option asks for a chart), import typing. Variant links keep their option's own name (`?shade=`), on purpose.
- **Two table views (task 5) moves out:** a fourth hand-written tablist is the wrong way; a shared tablist primitive made
  from the three existing ones comes first. Signal: SKU and barcode columns reported off-screen on a laptop.

## Deliberately not in PR·3
- **A per-option "this is a colour" switch** (spec: "any option the brand marks as colour"): the names above cover the
  words brands use; a switch needs a stored flag per option. Signal: a shop names its colours something else.
- **Drag to reorder:** buttons and keys do the same job without a drag library. Signal: merchants ask for it.

## Design review
- **UI/UX:** every change is undoable by Discard (nothing saves on its own); the confirm guards the one loss; keyboard
  paths for reorder and tabs; phone: the arrows show on tap focus. Rule 0: no helper text.
- **Tenancy/Security:** no server change beyond `optionKind` (pure); saves go through the same action.
- **SSOT:** the option kind once (`optionKind`), replacing seven copies.
- **Blast radius:** the shop's picker (swatches for Shade/Print), SEO structured data (`color` for Shade), import's
  colour column, `defaults.ts`. Shop product page budget (121 kB): `option-kind.ts` is a few lines.
