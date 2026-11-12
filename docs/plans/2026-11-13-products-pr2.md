# Products PR·2 — the editor
Status: active · Date: 2026-11-13 · Spec: `docs/specs/2026-11-13-products-rework.md` · Mockup: https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4 (§ Add a product, § The editor, § On a phone) · Approved: owner, 2026-11-13

## Goal
Ranked problem 3: a one-colour kurta from "Add product" to Live in under two minutes on a phone. Measure: time from
create to first live; editor page height on a phone (6,599 px in the stress test).

## Regression net first
`78-products-pr0`, `79-products-list`, `68-product-video`, `47-offers`, `76-import` and `90-ux` stay green. New unit:
`kindOf` honours a chosen kind. New e2e steps in `78`: the kind step, the Ctrl+S save, and folded sections opening.

## Tasks
1. **Start from the kind** (mockup § Add a product): the new-product page asks the name, then "What are you selling?"
   (Clothing with sizes · Footwear · Kids · One size), each with its sizes in one line. The kind starts as the name's
   guess (`kindOf`, live as the name is typed) and the merchant can change it. `createProduct({ title, kind })` uses the
   chosen kind; an unknown kind falls back to the guess. A shop that sells nothing sized sees no kind step.
2. **The editor's sections in the order a brand works** (spec § 4): Photos → Description → Sizes, colours and stock →
   Details → Size chart → The model → Search and sharing → Tax → stories and pairs. A section with nothing in it yet
   folds to one line with its action ("Details · Add", "Size chart · Women's kurta · Edit") using `<details>`; one with
   an error opens itself. Section titles and their info tips stay.
3. **The side panel**: the status and Publish card first, then the summary, organise and Ready for, sticky on a wide screen
   (`lg:sticky lg:top-…`) so Publish never scrolls away.
4. **Save from the keyboard**: Ctrl/⌘+S saves while there are changes (prevents the browser's own save); the Save bar
   says it ("Save · ⌘S" on a Mac, "Save · Ctrl+S" otherwise). Only on the product editor.
5. **Speed**: the editor page's reads after the product (`placeForPincode`, video, modules, share card, address) in one
   `Promise.all` (five round trips in a row → one).

## Deliberately not in PR·2 (the signal that brings each back)
- **Status through the same Save** (spec § 2): Publish stays its own action, refused while there are unsaved changes, as
  today. Folding it into Save needs the save and the readiness check in one transaction; it waits until merchants
  publish with unsaved work and lose it (the refusal already prevents that).
- **Photo edits without a page reload**: needs the photo list in client state; PR·3 (swatches cut from photos) touches
  the same component.
- **A bottom Save bar on every page**: the Save bar is a shared primitive (top, sticky). Moving it is a console-wide
  change for its own review.

## Design review
- **UI/UX:** fewer things open at once; nothing removed. Folded sections say what they hold. Keyboard: the summary of each
  `<details>` is a button; Ctrl+S. Phone: sections stack, the aside follows the form (as now). Rule 0: no new helper text.
- **Tenancy / Security:** `createProduct` takes one more field, a `Kind` enum checked on the server; no new action.
- **SSOT:** the kind's sizes come from `startSizes` (from the starting charts); the guess is `kindOf`.
- **Performance:** one `Promise.all` for the editor's reads.
- **Blast radius:** e2e that open sections by their headings (`68-product-video`, `47-offers`, `65-signal`, `70-cleaner`)
  — a folded section's content is not visible until opened; folding applies only to empty optional sections.

## Practices recorded in skills
- frata-design-language § Products rework: the kind step; folded empty sections; Ctrl+S on the editor.
