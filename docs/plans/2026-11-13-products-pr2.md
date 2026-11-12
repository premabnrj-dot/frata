# Products PR·2 — the editor
Status: parity FAILED (owner, 2026-11-13: the editor kept its old status, summary and form cards; the mockup's side panel, name-price-description card, drag photos and one-line folded sections were not built) · redo with the reworked design language · Date: 2026-11-13 · Spec: `docs/specs/2026-11-13-products-rework.md` · Mockup: https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4 (§ Add a product, § The editor, § On a phone) · Approved: owner, 2026-11-13

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

## As built (2026-11-13; architecture review on the plan folded in)
- **Kind:** `typeFor(title, types, sizes, kind)` takes the chosen kind, so "Linen kurta" chosen as Kids gets the Kids type,
  never the women's chart; clothing with sizes never takes the Kids, Footwear or One size type. The server checks the
  kind (`isKind`) and falls back to the guess. HSN stays the shop's starting code (per-kind HSN waits for PR·3's swatches
  work on categories). The button is "Create draft", as drawn.
- **One action with Save:** with unsaved changes, Publish reads "Save and make it active" and saves first; a refused save
  stops there with its mistakes at their fields (the owner's call 2 kept, without a second save model).
- **The Save bar at the foot**, on the editor only (`SaveBar placement="bottom"`): above the phone's bottom nav, sticky at
  the desktop's foot; the toasts lift above it (`--toast-lift`, globals.css). The button stays named "Save"
  (`aria-keyshortcuts`); the "⌘S / Ctrl+S" hint is for the eye.
- **Ctrl/⌘+S** presses the bar's own Save button (one path), never during a save, a modal dialog or input composition.
- **Folds:** `FoldSection` (disclosure pattern: a button in the heading, tips outside it, body kept mounted) for Details and
  The model, decided once from what was saved. Video, Stories and Pairs stay open (their flows look for them).
- **Size chart and model** show for a product with sizes (or a chart already picked).
- **Reads:** the five reads after the product run at once.
- **Budget:** the shop's product page went over 121 kB because a shared chunk carried every starting chart;
  `src/domains/catalogue/chart-units.ts` now holds what the shop shows (the type and cm → inches).

## Deliberately not in PR·2 (the signal that brings each back)
- **Status and Save in one transaction:** "Save and …" runs them one after the other; a status refused after a save
  leaves the save in place (said in its toast). Signal: a merchant reports a half-done publish.
- **Photo edits without a page reload**: needs the photo list in client state; PR·3 (swatches cut from photos) touches
  the same component.
- **A bottom Save bar on every page:** only the editor has it; other pages keep the top bar until their own review.

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
