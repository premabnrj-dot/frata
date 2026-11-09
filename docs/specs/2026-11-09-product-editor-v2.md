# Product editor v2: details first, forms to edit, swatches done properly
Status: draft · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/Bh81vh3bKbMBFh5Rf6B4yQ (v2, `docs/mockups/2026-11-09-product-editor-v2.html`) · Approved: waiting for the owner

Owner's notes on mockup v1 (9 Nov 2026), all taken in v2:
- fold more sections for a calmer look;
- plan the swatch system for every case, image swatches included: pick a photo and the part of it to use;
- remove the readiness checklist (photo/title/price, in stock, HSN, Google and Meta, colour family, neckline);
- editing opens forms; otherwise show details with an Edit option.

## Goal
Ranked problems 3 (catalogue operations) and 5 (a premium-looking storefront: the swatch is what a shopper taps).
Measures: time to change one price or one stock figure on a phone (e2e stopwatch, today's editor as baseline); the
editor's height at 390 px (today 6,599 px; target under 2,500 px for the same product); share of colours with a real
swatch (photo, colour or two colours) instead of the fallback, across shops, read from `product_colours`.

## Job
A fashion merchant reads a product at a glance, changes one thing in a small form without wading through the rest,
and gives every colour a swatch that looks like the fabric, on a phone, without help.

## Research
Current code (screenshots of `/console/products/chanderi-kurta-set`, 9 Nov 2026):
- 11 cards, every field an input; 3,341 px on a computer, 6,599 px on a phone.
- Status shown three times; readiness twice; colour set in two places.
- Each size × colour on a phone is a 340 px stack of seven inputs.
- Swatches today (`product_colours`: `family`, `hex`, `crop_image_id` + `crop {x,y,r}`;
  `src/domains/media/swatch.ts`; `src/components/storefront/swatch.tsx`):
  - a circle cut from one of the colour's photos (click to place, a size slider);
  - or a plain colour;
  - or the colour's initial in a dashed circle.
  - The swatch is drawn as the 400 px photo behind a round box, on the product page and on cards.

Products (dated sources; [U] = undated, treated as unverified):
- **Shopify**, Fall '26 variant redesign (2026-10-28): variants grouped and bulk-edited; status in a side panel that
  stays in view; heavy sections collapse. Colour option linked to the colour metafield for swatches (craftshift,
  2026-10-19). **Taken:** grouping by colour, status in the side, folded sections, swatches tied to the colour.
- **Etsy** Quick list suggests from photos for review (2026-09-22); **Alura** photos per variation (2026-06-30).
  **Taken:** photos belong to a colour.
- **Indian tools**: Meesho rejects uploads missing HSN or category attributes (base.com, 2026-08-20); Myntra reads
  colour and fabric from a photo (Apparel Resources, 2026-07-18). **Taken:** say what blocks going live, when it blocks.
- **NN/g**, dropdowns (2026-07-17): buttons when options fit, long dropdowns fail on phones. **GOV.UK** error summary
  (June 2026). **Baymard** product page 2026 (2026-03-18): shoppers judge colour and size from images.
  **Taken:** tap buttons in forms, an error list at the top of the form that stopped, swatches that look like the cloth.

## Design (mockup v2)

### Phases
| Phase | What | Data |
|---|---|---|
| **E·1 Details first** | Read views, Edit opens a form; three sections open, the rest folded; status once; grouped price and stock; errors in the form | none |
| **E·2 Swatches** | The swatch form: part of any photo or a close-up, moved and resized; colour from the photo; two colours; family suggested; the family's colour when none; cut all at once | `product_images.role`, `product_colours.hex2` |
| **E·3 Saved swatches** | The shop's swatch library, used on any product, edited once | `shop_swatches`, `product_colours.swatch_id` |
| **E·4 Photos first** | The new-product page; then suggestions from photos (unit-economics review first) | none, then a model call per product |

### E·1 Details first
1. **Read, then edit.** Every section shows its details (a short definition list, a table, chips). Edit opens that
   section's form in place on a computer, as a sheet on a phone. The form has its own **Save** and **Cancel**. One form
   at a time; opening a second with unsaved changes in the first asks "Save Price and stock first?".
   The page-wide Save bar goes, and so does the leave guard, which now covers only an open form with changes.
2. **Open by default:** Photos, Sizes and colours, Price and stock. **Folded to one line each:** Description,
   Details, Fit, Tax, Search and sharing, Story and pairs (phone: also Category and collections). A folded row opens
   to its details, with Edit.
3. **Side:** Status as one switch (Draft · Active · Unlisted) with Schedule; Organise (read, Edit). No checklist, no
   Summary card, no Google and Meta card. If going Active is blocked, the reason shows under the switch
   ("Add a price for Rust L to go live"), and only then.
4. **Price and stock read view:** a table grouped by colour; a group row shows "₹2,490 · 9 in stock · L sold out";
   the first colour open, the rest folded. Form: "every size" price and cost per colour, stock steppers, when sold
   out; SKU and barcode on request; on a phone each colour is a row that opens its sheet.
5. **Errors:** a failed Save lists every problem at the top of that form, focused, each a link to its field, with the
   same words beside the field.

### E·2 Swatches: every case
**Where a swatch shows:** the shop's product page (buy box, 40 px, the name beside it, sold out crossed through);
product cards (14–20 px dots, at most 5 then "+N"); the bag and the order page (the line's colour); the console (read
views, price and stock groups, the product list); filters use the **family**, never the swatch.

**Sources** (the form's switch: Photo · Colour · Two colours · Saved):
| From | For | Stored | When its source goes |
|---|---|---|---|
| Part of a product photo | prints, weaves, zari | `crop_image_id`, `crop {x,y,r}` (today) | deleting the photo warns ("Rust's swatch is cut from this photo"); then the plain colour, then the family colour |
| A close-up | every photo is a model shot | a `product_images` row with `role = 'swatch'`: never in the gallery, the shop, feeds, the sitemap or share cards | as above |
| Plain colour | solids | `hex`; picked from a photo (eyedropper), suggested from the photo's main colours, or typed | nothing to lose |
| Two colours | kurta and dupatta in different colours, ombré | `hex` + `hex2`, drawn split on the diagonal | nothing to lose |
| Saved (E·3) | one fabric on many products | `swatch_id` → `shop_swatches` | deleting a saved swatch warns and copies it into each product using it |
| Nothing | a colour added in a hurry | nothing | drawn in the family's standard colour (a constant per family in code); without a family, a neutral disc. The dashed initial goes |

**The crop, done well:**
- **Choosing the photo:** the colour's own photos first, then the rest, then **Add a close-up**.
- **Moving and resizing:**
  - drag the circle (pointer capture, touch-action none);
  - resize with the slider, the mouse wheel or a two-finger pinch;
  - arrow keys move by 2%, `+`/`-` resize;
  - the circle is kept inside the photo (today's `clampCrop`).
- **Live preview:**
  - the buy-box chip at 40 px and the card dots at 14 px;
  - on the shop's light and dark schemes (the look's own `--store-*` tokens);
  - beside a sold-out neighbour, so contrast is judged in context.
- **Family:** suggested from the swatch's average colour ("Looks orange"), one tap to change. A print can be
  **Multicolour**.
- **Cut them all:** in Sizes and colours, "Cut each swatch from its colour's first photo" places a centred circle on
  each colour that has none.

**Rendering and speed:**
- The swatch keeps today's formula: the photo drawn behind a round box.
- E·2 picks the image width from the drawn size: `bw = d / (2r)` times the device pixel ratio, rounded up to the
  nearest width we serve. A 14 px dot then loads a 160 px image, not 400 px.
- Card dots load lazily.
- Light swatches (ivory, white) get an inner ring, chosen by the colour's luminance.

**Accessibility:**
- The swatch is decorative; the colour's name is always written beside it, or is its button's label.
- The crop stage is a slider with words for its value ("48% across, 40% down").

**Edge cases:**
- A photo reassigned to another colour keeps the swatch cut from it.
- Reordering photos changes nothing (the swatch is tied to the photo's id).
- A colour renamed keeps its swatch (the editor carries it over).
- A colour removed drops its swatch.
- A product duplicated copies its swatches.
- A close-up never counts toward the 10-photo limit or appears in the shop.
- A very large print can take up to half the photo's width (r ≤ 0.5).
- A swatch on a non-colour option (print, work) is **out of scope**; signal: merchants name a second visual option.

### E·3 Saved swatches
- **Data:** `shop_swatches` with id, name, family, hex, hex2, image id and crop, and tenant RLS. Its images are
  `role = 'swatch'` rows owned by the shop.
- **In the editor:** the swatch form's **Saved** tab lists them with "used on N products". "Save to the shop's
  swatches" turns the current swatch into one.
- **Editing one** updates every product that uses it.
- **Deleting one** warns, then copies its values into each product.

### E·4 Photos first
The new-product page (mockup: New product) gets its own mockup round. Suggestions from photos follow after the
unit-economics review.

## Design review
- **UI/UX:**
  - Primary action per state: Edit in each section, then Save in the open form.
  - States:
    - empty: a new product opens its forms;
    - loading: server-rendered;
    - error: the form's error list;
    - one colour or size: no group row;
    - many (24 rows): groups folded;
    - no permission: staff see no cost, Edit is hidden for support visits;
    - phone: sheets.
  - Keyboard: Edit focuses the form's first field; Cancel and Escape return focus to Edit; the crop stage is a
    keyboard slider.
  - Norman: one form at a time, so changes have one place; an undo is the Cancel before Save.
- **Tenancy:**
  - E·1: none.
  - E·2: the new columns sit on tables that already have RLS. A swatch-only image is a normal tenant row; the
    action limits `crop_image_id` to this product's images (today's rule).
  - E·3: a new table with grant, RLS and policy in one migration, and a row in `scripts/verify/tenancy.sql`.
    `tenancy-auditor` runs on the plan.
- **Modularity:**
  - Pure engines: `swatch.ts` (crop, average colour → family, width choice, family fallback colour) and
    `product-form.ts` (per-section validation).
  - Each section's form is a `_components` file; the error summary is a primitive in `components/ui`.
- **SSOT / DRY:**
  - The swatch's kind is derived (crop, else hex2, else hex, else saved, else family), never stored.
  - The family fallback colour is one constant map.
  - "Can go live" is one function, read by the switch and by the save action.
- **YAGNI:** no autosave, tabs or stepper; no field history; no swatches for non-colour options.
- **KISS:**
  - E·1 uses the same data and actions.
  - Section saves send the whole product draft with only that section changed, so `saveProduct` and its version
    check stay one path.
- **Scalability / Performance:**
  - The same statements per page.
  - Swatch images are sized to the dot (measured by `speed-reviewer` on the product page and a collection page).
  - The editor's client JS must not grow beyond today's.
- **Reliability:** unchanged; close-ups upload through the same Blob path as photos.
- **Security:**
  - Swatch-only images never reach a public surface. Every gallery, feed, sitemap and share-card reader filters
    `role = 'gallery'`; `security-reviewer` lists them.
  - `hex2` is checked like `hex`.
- **Motion and visuals:**
  - Forms open in place (200 ms); phone sheets on the spring (rule 25a); folds 200 ms.
  - The crop ring and the scrim are static under reduced motion.
- **Unit economics:** E·1 to E·3 none; E·4's suggestions need the review.
- **Blast radius:**
  - `product-editor.tsx` and its 12 panels.
  - `storefront/swatch.tsx`, `buy-box.tsx`, `card.tsx`.
  - Every reader of `product_images` (gallery, OG card, feeds, sitemap).
  - e2e flows `05`, `10`, `47`, `64`, `70`, `90-ux`: their selectors change, so the regression net is updated first.

## Design-language changes on approval (frata-design-language)
- § Product page: "Settings: one explicit save per page" no longer applies to the product editor. Its rule becomes
  "details first; Edit opens one section's form with its own Save" (owner, 9 Nov 2026).
- § Swatches: the sources, the family fallback (no more dashed initial), the inner ring for light colours, and the
  preview on light and dark.
- The readiness checklist is removed from the product page rules.

## Out of scope
- Autosave, tabs, a stepper (signal: merchants lose work in an open form).
- Bulk editing across products (signal: catalogues past 200 products).
- Swatches on options other than colour (signal: a second visual option).

## Facts used
Sources and dates as in Research. No integration facts are used in E·1 to E·3.
