# O2a · Setup: the next step on Home and three setup popups, no billing change (task plan)
Status: active
**Mockup:** https://claude.ai/artifact/PzNfST7bdFvLiQsxy11mQT (`docs/mockups/2026-11-23-merchant-onboarding.html` § 2 Setup, phase "O2 · four steps", and its Pickup PIN code popup; the plan radios and charge line of "Open your store?" are O2b's)
**Approved:** owner, 2026-11-23
**Review:** architecture-reviewer findings from the O2 draft fixed, 2026-11-23
**Review:** tenancy-auditor findings from the O2 draft fixed, 2026-11-23 (it stood in for security-reviewer)
**Review:** speed-reviewer covered by architecture-reviewer, 2026-11-23
Spec: `docs/specs/2026-11-23-merchant-onboarding.md` § O2, § Regression net, § Design review, § Stress test; owner call 4
(popups). Call 2 (the plan at opening) is O2b: `docs/plans/2026-11-23-o2b-plan-at-opening.md`.
Replaces, with O2b, the draft `docs/plans/2026-11-23-o2-setup.md`. **Migrations: none.** Built after O1
(`docs/plans/2026-11-23-o1-signup.md`); O1 owns `Dialog`'s `onDismiss` and ✕ (O1·8) and the setup-popup rule text in
`frata-design-language` § Feedback 4 (O1·12), so this plan uses both and bumps no version for that rule.

**Owner decision, 2026-11-23 (binding here):**
1. **"Split it"**: O2a ships the Home card and popups with no billing change, and the plan step STAYS in sign-up; O2b is
   plan-at-opening and billing-from-opening with a small mockup for its money states and its own review.

So in O2a: sign-up keeps its plan step (O1's), `openShop()` takes no input, nothing in `drizzle/`, `src/domains/billing`,
`src/domains/plans` or `src/lib/billing` changes. "Open your store?" is the existing confirm drawn as the mockup's popup
without the plan radios and the charge line (§ Deviations 1). Line numbers are as read on 2026-11-23; files O1 rewrites
(`src/domains/settings/sections.ts` Store block, `console/apps/delivery_zones/page.tsx:50`, `dialog.tsx`) are re-read when
the task that touches them starts.

## Regression net (O2a·0, before any change; all green on the tree O1 left)
```bash
npm test && npm run typecheck
npx vitest run src/domains/setup src/domains/settings src/domains/catalogue
INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx vitest run src/lib/catalogue
npm run e2e -- --only ux,storefront-api,owner-only,neel-settings,neel,products-pr0,products-list,delivery-zones,security
```
Pinned or added now; each fails when its bug is planted (frata-verify: plant it, watch it go red, restore):
| What | Where | Pins |
|---|---|---|
| The opening gate | `src/domains/setup/__tests__/checklist.test.ts` (new case) | `readyToOpen` false until product, details and a way to pay are done; `openShop`'s "Not yet:" names each missing step (`shop-actions.ts:54`) |
| Whole-section saves | `src/domains/settings/__tests__/sections.test.ts` (new case) | for every section, `parseSection(s, formValues(s, stored))` returns the stored columns unchanged (O2a·2 must keep it) |
| A new product's shape | `src/app/(console)/console/products/__tests__/create-product.int.test.ts` (new, real Postgres) | `createProduct` (`products/actions.ts:43-75`): "Kids kurta" → the Kids type and its 3 start sizes; "Silk saree" → one variant, no chart; a beauty-only store → no sizes; "Ivory kurta set" in a women's store → `startSizes.sized` (`kind.ts:44`). O2a·3 must keep each |
| Products' write path | `src/lib/catalogue/__tests__/save-product.int.test.ts`, `write.int.test.ts` | run as they are |
| Opening in e2e | `90-ux.mjs:362-380`, `91-storefront-api.mjs:209-234` (D0·3 included) | both press "Open my store" → "Open it"; O2a·8 moves them to `openStore(page)` in `e2e/lib.mjs` and the new words in the same commit |
| Home's role guards | `page.tsx:33-37` | a Builder → Products, an Accountant → GST: unchanged (e2e `93-owner-only`, `86-builders`) |

## Tasks
Each task: the test first (watch it fail for the right reason), the change, its verify command run and read, `npm test`
and `npm run typecheck`, then **impact-reviewer on the diff**, then its commit. UI tasks also run `words-reviewer` and
`design-system-reviewer` on the diff. The tree is green after each; production needs nothing by hand (no migration), and
the app works against production after every push.

### O2a·0 · Regression net
**What:** § Regression net. **Files:** the tests named there. **Verify:** every command green; each planted bug red.
**impact-reviewer** on the diff.

### O2a·1 · Four derived steps and the next one (pure)
**What:** `setupSteps(f)` (`src/domains/setup/checklist.ts:44-72`) returns four steps in order, keys `product`,
`details`, `payments`, `publish` (the key stays: `readyToOpen` `:75`, `shop-actions.ts:54`); `shop` (`:48`, always done)
leaves. Each step: `title` and `action` (the focus button) as drawn, `value` (the row's right side once done), `done`,
`who: Capability` (`product` → `shop.work`, `details` and `payments` → `shop.build`, `publish` → `shop.manage`;
`src/domains/tenancy/roles.ts:33,39,41`). `detail` and `href` go, and with them `BuiltPages`, `BUILT_PAGES` (`:38-42`)
and the fashion line at `:52` ("sizes and colours" no longer reaches a beauty store: the first product's words come
from `firstProductShape`, O2a·3). New `nextSetupStep(steps, can)`: the first step not done that `can(step.who)`, `publish`
only once every other step is done; null when nothing is left for this person. `SetupFacts` gains nothing (values come
from `productCount`, `legalName`, `codOn`, `paymentsConnected`). Callers: `shop-actions.ts:52-54` (drops `BUILT_PAGES`,
`String`), `src/lib/queries/settings.ts:51-55` (drops them), `console/_components/checklist.tsx` (renders `title` and
`value` until O2a·7 deletes it), `today.tsx:117-120` (reads `left[].title`: unchanged).
**Test first:** `checklist.test.ts`: a new store → `[product ✗, details ✗, payments ✓, publish ✗]`, done 1 of 4;
`nextSetupStep` for an owner: product, then details, then publish; for Staff: product, then null; for a partner: product,
then details, never publish; `publish` never next while another step is open; values "1 product", "3 products", the
legal name, "Pay on delivery" / "UPI, cards and Pay on delivery" / "UPI and cards", "Open".
**Verify:** `npx vitest run src/domains/setup` (D0·3's case still passes); `node scripts/check-layers.mjs` clean;
`npm run e2e -- --only ux` (the old checklist still renders).

### O2a·2 · The field-subset parser (pure)
**What:** in `src/domains/settings/sections.ts`, `parseFields(section, keys, values, stored)`:
1. `sent = keys.filter((k) => Object.hasOwn(values, k))` — the patch is limited to keys actually sent;
2. `merged = { ...formValues(section, stored) }` (`:314`), then for each key of the section
   `merged[k] = Object.hasOwn(values, k) ? values[k] : merged[k]` (only sent keys overlay; a left-out GSTIN or grievance
   email keeps its stored value);
3. `check(section, merged)` (`:216`) whole, so cross-field rules see stored values (`codMin` against a typed `codMax`,
   `:288-291`; `taxesPatch` `:302-312`);
4. returns `{ ok: true, patch }` restricted to `sent` plus the columns `taxesPatch` derives from them (`gstScheme`,
   `homeState`, and for Composition `pricesIncludeGst`, `b2bInvoices`); an error on a sent key goes back by field; an
   error only on a key not sent (a stored value no longer valid) is `{ ok: false, stale: [key] }`.
`SETUP_FIELDS` (exported const, the only subsets a popup may save, chosen on the server, never from the client):
`details: { business: ['legalName', 'gstRegistration', 'homeState', 'gstin'], contact: ['grievanceName',
'grievancePhone', 'grievanceEmail'] }`, `payments: { payments: ['codOn', 'codMax'] }`, `pickup: { store:
['pickupPincode'] }` (O1·5's field). `lockedFor`, `NEEDED_WHEN_OPEN`, `HELD_BY_ZONES` and the version check stay in the
save (O2a·5), never in the parser.
**Test first:** `sections.test.ts`: business subset, Not registered → `address`, `originCountry`, `turnoverBand`,
`defaultHsn` absent from the patch; Regular with a GSTIN sets `homeState` from it (`:308`); **GSTIN left out of
`values` keeps the stored GSTIN** (not in the patch, no error); **grievance email left out keeps the stored email**;
contact subset never writes `supportEmail`; payments subset with `codMax` 1,000 and stored `codMin` 2,000 →
`stale: ['codMin']` (`:290`); a key outside the subset in `values` is ignored, never written; pickup '' → `null`.
**Verify:** `npx vitest run src/domains/settings` green, O2a·0's round-trip case included.

### O2a·3 · `firstProductShape`, one rule for the server and the popup (pure)
**What:** `src/domains/catalogue/first-product.ts`: `firstProductShape(title, types, sells)` →
`{ kind, sized: boolean, options: string[], pressed: string[], typeId: string | null }`, lifted from `createProduct`
(`products/actions.ts:55-58`): `kind = kindOf(title)` (`kind.ts:33`); `sized = sellsSized(sells) && kind !== 'one_size'`
(`sell-keys.ts:23`); `typeId = sized || kind === 'one_size' ? typeFor(title, types, undefined, kind) : null`
(`kind.ts:51`); `options` = the type's chart sizes when it has a chart, else the kind's preset rows (`PRESETS`,
`size-charts.ts`); `pressed = startSizes[kind]` (`kind.ts:44`) ∩ `options`. An empty title is kind `sized` (no telling
word), so the pills show before a name is typed and change as it is typed. `createProduct` reads it (no behaviour
change; O2a·0's int test pins that).
**Test first:** `src/domains/catalogue/__tests__/first-product.test.ts`: '' in a women's store → sized, womens_kurta rows,
3 pressed; "Kids frock" → Kids; "Silk saree" → not sized, no options; any title in a beauty-only store → not sized;
"Kolhapuri chappal" → footwear rows.
**Verify:** `npx vitest run src/domains/catalogue`; O2a·0's `create-product.int.test.ts` green.

### O2a·4 · `Dialog`'s pictogram, and two new pictograms
**Depends on O1·8** (`onDismiss` and the ✕, `aria-label="Close"`). If O1·8 has not merged, stop and say so.
**What:** `Dialog` (`src/components/ui/dialog.tsx:23-63`) gains `picto?: PictogramName`: a 44 px `PictoTile`, radius 10,
before the title, as the mockup's `.dh .picto.sm`. The file comment `:9-11` becomes: "A DIALOG CONFIRMS WHAT LOSES WORK,
MONEY OR STOCK, OR IS A SETUP POPUP (design-language § Feedback 4). Never one inside another." `PICTOGRAMS`
(`src/components/brand/pictogram.tsx:14`) gains `product` (the mockup's parcel, `M8 16l16-8 16 8v18l-16 8-16-8z`, with a
haldi tag dot, not `risk`'s question mark) and `details` (a page with a folded corner and one haldi line, mockup
`P.biz`). The payments step reuses `payments` (`:91-96`); its comment `:89` ("for brand moments only") becomes "Online
payments: a brand moment, and the setup step".
**Files:** `dialog.tsx`; `pictogram.tsx`; the gallery `console/fixtures/neel` (a setup popup with picto and ✕, desktop and
the phone sheet); `e2e/flows/81-neel.mjs` (a step "a setup popup as drawn").
**Test first:** that `81-neel` step (picto drawn, ✕ closes, focus returns, axe clean) fails before the prop exists.
**Verify:** `npm run e2e -- --only neel` green, screenshots read at 390 and 1280; `npm test` (check:motion, check:hex,
check:feedback clean).

### O2a·5 · Saving and loading a setup popup's fields
**What:** `settings/actions.ts`: the body of `saveSection` (`:76-130`) becomes `saveIn(tx, auth, section, columns,
values, version, …)`, used by `saveSection` unchanged and by new `saveSetupFields(popup: 'details' | 'payments' |
'pickup', values, version)`: Zod (`popup` an enum; each value a string ≤ 400 or a boolean; `.strict()` on the keys of
the popup's `SETUP_FIELDS`); the sections from `SETUP_FIELDS[popup]` (never from the client); `asMember(<intersection of
the sections' editors>, { action: 'settings.setup.' + popup, detail: { fields } }, …)`; the row read `for update`;
`parseFields`; then per section the existing locks in order: `lockedFor` + `lockOf` (`:83-103`; business is a whole
owner-only page, `owner-only.ts:15`, so a support visit and a handed-over partner are refused as on the page; the
grievance fields are owner-only fields, `:18`); `openShopErrors` for contact (`:106-111`); `HELD_BY_ZONES` dropped while
Delivery Zones is usable (`:113-115`); ONE `update … where version = $version` for the popup (`details` writes its two
sections in that one update, one version); the audit row (`:124-126`); `unrated` for business (`:128-129`). `stale` →
`{ ok: false, stale }`. Read: `setupPopupFor(tenantId, role, support, popup)` in `src/lib/queries/settings.ts`: one
`withTenant`; the popup's columns, `version`, `supportEmail` (the grievance email's prefill), `hasOwnerHeldIn`, and for
payments `moduleAccessIn(...).delivery_zones.usable`; returns `{ values, version, locked, held }`, no cost field. Exposed
as `loadSetupPopup(popup)` in `settings/actions.ts` (`requireMember(ANY_MEMBER)`, then the popup's own tuple).
Staff's browser receiving the legal name is fine: it is public on the storefront's Contact page and invoices.
**Test first:** `src/app/(console)/console/settings/__tests__/save-setup.int.test.ts` (real Postgres): a details save
leaves `address`, `supportEmail`, `orderPrefix`, `turnoverBand` as they were; GSTIN not sent → stored GSTIN kept; a stale
version → `conflict`; a partner after handover → `locked`; a support visit → `locked` for details, saved and audited for
payments; Delivery Zones usable → `codMax` untouched, `codOn` saved; an open store blanking the grievance phone → refused
at the field; a GSTIN saved with live products without a rate → `unrated`; Staff calling `saveSetupFields('payments')`
→ refused (not `CAN_BUILD`); a pickup save writes only `pickup_pincode`.
**Verify:** that test green; `npx vitest run 'src/app/(console)/console/settings'`; `npm test` (check:actions,
check:tenant clean); `npm run e2e -- --only neel-settings,owner-only` (pages unchanged).

### O2a·6 · One action for the first product
**What:** `addFirstProduct(input, activate: boolean)` in `products/actions.ts` beside `createProduct`. Input through Zod:
`title` 1–140 (trimmed, spaces collapsed as `:44`), `price` a string of digits → whole rupees 1–9,99,999 → paise by
`fromRupees` (`src/domains/money/paise.ts:18`), `stock` 0–99,999, `sizes` ≤ 12 strings, `photos` ≤ 4 `NewPhoto`.
1. **Outside any transaction**: `photosAreMade(photos)` (`src/lib/media/uploaded.ts:16`) — never inside `asMember`, as
   `attachPhotos` (`:243`).
2. One `asMember(ANY_MEMBER, { action: 'product.create', target: title }, …)`: `ensureTypes`; the types with chart
   sizes and `sells`, `defaultHsn`; `firstProductShape(title, types, sells)` (O2a·3); a size not in `shape.options` →
   refused before any write; `writeProducts(tx, t, [{ handle: '', title, options, variants, row: { typeId, hsn:
   defaultHsn } }], { costs: false })` (`src/lib/catalogue/write.ts:69`; every size the price and the stock; no cost
   written); `attachIn(tx, t, id, photos.map((p) => ({ ...p, colour: null })))` (`photos.ts:29`, colour cleared as
   `:247`); when `activate`, `setStatusIn(tx, t, [id], 'active', null, now)` (`status.ts:22`): changed → `{ ok, status:
   'active', handle }`; refused → kept a draft, `{ ok, status: 'draft', handle, needs }` (readiness's own labels,
   `product-form.ts:173-188`); `memberAudit`.
3. After: `refreshShop(t, 'catalogue')`, `revalidatePath('/console', 'layout')`. Errors as `saveProduct`'s (SKU taken,
   lock timed out, else "We couldn’t add the product. Nothing was saved.").
Read for the popup: `firstProductFormFor(tenantId)` in `src/lib/queries/catalogue.ts` (one `withTenant`: `sells`,
`defaultHsn`, the types with chart sizes), exposed as `loadFirstProduct()` (`requireMember(ANY_MEMBER)`).
**Test first:** `src/lib/catalogue/__tests__/add-first-product.int.test.ts`: complete input → Active, one product, its
variants priced (₹2,490 → 249000 paise) with stock, its photos with colour null; no photo → draft, needs `["at least one
photo"]`; a size outside the options → refused, nothing written; a store charging GST with no default HSN → draft with
its HSN need; a beauty store → draft with its label need; Staff may add; Accountant refused; a photo base from another
store's folder → refused, nothing written. A unit test that `photosAreMade` is awaited before `asMember` is entered (a
mock order check).
**Verify:** that test green; `npx vitest run src/lib/catalogue`; `npm run e2e -- --only products-pr0,products-list`.

### O2a·7 · Home's setup card and three popups (BUILT AS DRAWN)
**What:** `src/app/(console)/console/_components/setup/`:
- `setup-card.tsx` (server) + `setup-actions.tsx` (client, the one island). `.focus`: `PictoTile` 64 (product →
  `product`, details → `details`, payments → `payments`, publish → `store`); the ring (36 px, r 15, stroke 4, `--line`
  under `--action`, its arc a path with `pathLength={1}` and `animate-draw-circle`, keyed on the count so it redraws);
  "N of 4 done"; the step title (16/24, 600); ONE primary button. On a phone (< 768 px) `.focus` is one column, padding
  16. `.sl`: the four rows as buttons (min 44 px, 20 px in, 16 on a phone): a 20 px check circle (done: `--ok-dot` fill,
  the tick drawn with `animate-draw-tick`, `base.css:352`), the title (the next step's row weight 500; done titles in
  `text-2`), the done value right-aligned in `text-3`, 13 px. A row the person may not act on (`who`) is text, not a
  button. `publish` pressed before the rest are done: the toast "Finish N steps to open your store." After a save the
  next step enters with `animate-step-forward`.
- `store-sketch.tsx` (server, desktop only, the mockup's `.sec.mini`, `aria-hidden`): **O1·8's store card** (address bar
  with the dot, name, hero gradient by the first sold key, three tiles, the chip "Opening soon" / "Open"); if O1 left it
  page-local to `/start`, move it to `src/components/brand/store-card.tsx` with its stylesheet so both read one card
  (no second copy, `check:hex`).
- `first-product.tsx`, `business-details.tsx`, `payments.tsx`: each `next/dynamic` from `setup-actions.tsx`, loaded on
  first open; each calls its loader (O2a·5, O2a·6) on first open; never two open at once. **Each popup's values live in
  the island's state and survive a close** (✕, Esc, Back, the backdrop: `Dialog` calls `onClose` on a backdrop click,
  `dialog.tsx:52`); they reset only after a save or a reload. The first field carries `data-autofocus` (`dialog.tsx:45`).
  - First product (`Dialog` "Add your first product", `picto` none as drawn, ✕): a 92 px dashed photo tile
    (`uploadPhoto` from `products/_components/upload-photos.ts`, `import()`ed on pick); Name; Price; the stock field
    ("In stock, each size" when `shape.sized`, else "In stock") in one row of two; Sizes (pressed pills from
    `firstProductShape(typedTitle, types, sells)`, recomputed as the name is typed; none when not sized). Buttons "Add
    more details" (ghost: with a name typed, saves a draft with `activate: false`, then goes to its editor; without
    one, to `/console/products`) and "Add product". A draft result keeps the popup open with "Saved as a draft." and the
    needs as a list in the error slot.
  - Business details: view 1 Legal name; GST registration (Not registered, Regular, Composition); State only for Not
    registered (§ Deviations 3); GSTIN when registered. "Add grievance officer" moves to view 2
    (`animate-step-forward`; Back with `animate-step-back`; title "Grievance officer" with an `InfoTip`); Name, Phone,
    Email (prefilled `grievanceEmail || supportEmail`); "Save details" saves both views in one call. Locked → the values
    as `Facts` and "Ask the owner" (`owner-only.ts:72-74`), no save. `unrated` → `UnratedNotice`
    (`settings/_components/unrated.tsx`) in the popup and one button "Back to setup".
  - How shoppers pay: `Switch` "Pay on delivery"; "Pay on delivery up to" (rupees); held → the value as text with "Set
    in Delivery Zones" (link `/console/apps/delivery_zones`); `stale` → "Your limit is below the lowest Pay on delivery
    order. Change that first." with a link to `/console/settings/payments`; "UPI and cards" row: "Connect Razorpay" (link
    `/console/settings/online-payments`), connected → `Badge` ok "Connected"; "Not now", "Save payment choices".
- `page.tsx:52-59`: before opening, header "Home" + `Badge` warn "Opening soon", no meta line; the card replaces
  `Checklist`. `setup/page.tsx:17-18`: the same card + `OpenShop`'s close half (closing stays there, ux rule 30).
  `checklist.tsx` is deleted.
- Flow `e2e/flows/99-setup.mjs` (next free number at build): a store made through `/start` (cleanup as `63-signup`), Home
  at 1280 and 390, each popup as drawn; Esc, ✕, the backdrop and Back close and keep typed values; focus returns to the
  opener; a saved product goes Active (DB); a photo-less one stays a draft with its needs; details leave `address` and
  `supportEmail` as they were (DB); payments with Delivery Zones on; Staff sees one actionable row; axe clean;
  screenshots also under reduced motion.
**Test first:** `99-setup.mjs` written against the mockup, red.
**Verify:** `npm run e2e -- --only setup,ux,neel`; § Performance's commands; `npm test` (check:words, check:motion,
check:feedback, check:client-bundle on build).

### O2a·8 · "Open your store?" and the open moment (BUILT AS DRAWN, without the plan)
**What:**
- `open-store.tsx` (`next/dynamic` from the island): `Dialog` "Open your store?", `picto="store"`, no ✕, no body
  (§ Deviations 1), "Not yet" (`data-autofocus`, safe) and "Open store" → `openShop()` unchanged. Its refusal in the error
  slot; `website: true` closes it and opens D0·3's existing dialog ("Your store is still closed.", `open-shop.tsx:60-62`,
  moved to the island), never two at once. A support visit on a trial store gets `SUPPORT_TRIAL` (`shop-actions.ts:26`) in
  the slot.
- The open moment, over the whole frame as drawn: a native `<dialog>` opened with `showModal()` (the top layer covers the
  sidebar and holds focus, `dialog.tsx:12-13`), full viewport, `--surface`, centred box: the drawn check (rule 26,
  § Deviations 2), "<Store> is open" in the display face, the address in mono + "Copy link" (`copy-link.tsx`), "Share on
  WhatsApp" (the `share.whatsapp` link `shareFor` makes, `page.tsx:48`) and "Go to Home" (focused 80 ms after open, as
  the mockup; Esc too). Its children rise with `animate-rise`, staggered 0, 80, 160, 240 ms through one
  `animate-rise-stagger` utility in `base.css` beside `animate-rise` (`:335`; a delay, no new duration; check:motion).
  `OpenMoment` (`open-moment.tsx:22-41`) holds `just` as today and gains `hidden`.
- The open card (the session that opened only): while `just && !hidden` Home shows the header "Home" + `Badge` ok "Open"
  and the card's open state (the `store` pictogram, "Your store is open", "See your store" → the address in a new tab,
  "Hide this card" → `hidden`), in place of Today; otherwise Today as today ("Store open", `page.tsx:53`). Nothing is
  stored (spec § O2: nothing stores "done").
- `open-shop.tsx`: the open half (`:65-70`) goes; the close half stays for `/console/setup`.
- `e2e/lib.mjs`: `openStore(page)` (opens from the card, presses "Open store", waits for the moment, "Go to Home");
  `90-ux.mjs:362-380` and `91-storefront-api.mjs:209-234` call it (D0·3's refusal path keeps its own assertions).
  `99-setup.mjs` gains: open from the card, the moment over the sidebar, focus on "Go to Home", the open card, "Hide this
  card" → Today, reload → Today.
**Test first:** those `99-setup` steps red.
**Verify:** `npm run e2e -- --only setup,ux,storefront-api`; `npm test`.

### O2a·9 · Pickup PIN code popup from Delivery Zones (handed over by O1·6)
**What:** `console/apps/delivery_zones/page.tsx:50` (as O1·6 left it): for `canEdit` (`:44`, `CAN_BUILD`) the header's
"From 452009" / "Add pickup PIN code" is a button that opens `pickup-pin.tsx` (`next/dynamic`): `Dialog` "Pickup PIN
code", ✕; "PIN code" (numeric, 6, `data-autofocus`) and "City and state" (`aria-live`, O1's `placeFor(pin)`, flashed with
`animate-value-flash` on change); "Not now", "Save PIN code" → `saveSetupFields('pickup', …)` with the version from
`loadSetupPopup('pickup')`; toast "Saved your pickup PIN code."; `revalidatePath` refreshes the header. Others see the
plain text as O1 left it. Closes O1's Deviations row "Delivery Zones header opens the popup".
**Test first:** `69-delivery-zones` step: the header opens the popup, 302003 → "Jaipur, Rajasthan", save, the header
reads "From 302003"; Staff sees no button.
**Verify:** `npm run e2e -- --only delivery-zones`.

### O2a·10 · Parity, words and design system
**What:** `mockup-parity-reviewer` (mockup § 2 against the build at 390 and 1280: New store, Part done, Ready, Open, each
popup, the moment, Pickup PIN code); `words-reviewer`; `design-system-reviewer`; screenshots of every undrawn state in
§ States shown to the owner with the parity report. Each difference fixed or written in § Deviations.
**Verify:** the three reports read; § Deviations complete; `npm run e2e -- --only setup,ux,storefront-api,neel,delivery-zones`.

### O2a·11 · Rules and docs
**What:** § Practices recorded in skills, each with its version bump from whatever is current after O1
(`check:skills`); the spec's Plans line names both O2 plans (the orchestrator retires the O2 draft). **Verify:** `npm
test` (check:skills, check:docs, check:plans).

## Performance
- **Home before opening:** `requireCapability` + `requireMember` ×2 (one `app_access_for`, React-cached); `setupFor`
  (`queries/settings.ts:47-60`): `Promise.all` of `shopWithSettings`, `activeProductCount`, `paymentStatusFor`, then
  `mainHostFor`. **After: the same statements.** `who` and `nextSetupStep` are computed from the role in hand.
- **A popup's one read**, on first open only, one `withTenant` each: first product (`shop_settings` by key, `product_types`
  by `tenant_id` with chart sizes); details, payments, pickup (`shop_settings` by key, `members` for `hasOwnerHeldIn`,
  `tenant_modules` for payments). No read of `orders`, `order_lines` or `variants`; EXPLAIN each in the 10× seed
  (frata-verify § Speed proof): index scans, under 10 ms.
- **Writes:** `addFirstProduct` purges `catalogue` (as `createProduct`); setup saves purge `shop` (as `saveSection`);
  opening as today (`refreshShop` 'shop', `refreshKeys`). No cache entry changes size.
- **First-load JS, Home** (`/(console)/console/page`, under the 150 kB console budget): measured before O2a·7 and after;
  pinned in `APP_PINNED` (`scripts/lib/app-budget.mjs:12`) at the measured value + 2 kB; target growth ≤ 1 kB (the island;
  popups, the uploader and the moment are `next/dynamic`). Delivery Zones' page measured before and after O2a·9.
  ```bash
  npm run build && SHOW_BUDGETS=1 node scripts/check-storefront-build.mjs | grep -E "/\(console\)/console/(page|apps/delivery_zones/page):"
  ```

## States
| State | Drawn | Primitive |
|---|---|---|
| New (1 of 4), part done, ready (open is next) | yes | `SetupCard` (`PictoTile`, ring, `Button`), rows |
| Open, in the session that opened it | yes | the open card, `Badge` ok "Open", `Button` secondary + ghost |
| Open, any other session or after "Hide this card" | (today's screen) | Today, unchanged |
| A save refused, a conflict, no connection | yes (error line) | `Dialog` error slot (`DialogError`); fields `FieldError` |
| Product kept a draft with its needs | in words | `Dialog` error slot listing readiness labels |
| One-size product, or a store selling nothing sized | no | no Sizes pills; "In stock" |
| Staff (products only) | spec | rows as text, one button |
| Accountant (no steps) | spec | redirected to GST (`page.tsx:36-37`), unchanged |
| A support visit (saves audited; details read-only) | spec | `Dialog` with `Facts`; `SUPPORT_TRIAL` in the slot |
| A store handed over: details as facts for its partner (PP1) | spec | `Facts` + "Ask the owner" |
| Delivery Zones on: "Set in Delivery Zones" | spec | text + link |
| A stale lowest order (payments) | no | the slot's line + link |
| A saved GSTIN makes live products unbuyable | spec | `UnratedNotice` in the popup |
| Razorpay connected | no | `Badge` ok |
| D0·3: the website on a Test key | (D0·3's own) | its existing `Dialog`, after the open popup closes |
| Phone: popups are sheets, the sketch hides, the focus panel is one column | yes | `Dialog` (< 768 px) |
| Reduced motion: everything fades in 120 ms | yes | `base.css` rule 25 (`:316` zeroes the delays) |
Undrawn rows are screenshotted and shown with the parity report (O2a·10).

## Words (final; console, `check:words`)
- Header: "Home" · `Badge` "Opening soon" · in the opening session `Badge` "Open".
- Card: "1 of 4 done" (also the ring's label) · "Add your first product" / "Add product" · "Add business details" / "Add
  details" · "Choose how shoppers pay" / "Change payments" · "Open your store" / "Open store" · values "1 product",
  "3 products", the legal name, "Pay on delivery", "UPI, cards and Pay on delivery", "UPI and cards", "Open" · toast
  "Finish 2 steps to open your store." / "Finish 1 step to open your store." · open: "Your store is open" · "See your
  store" · "Hide this card".
- First product: "Add your first product" · "Add a photo" / "Photo added. Change photo" · "Name" · "Price" · "In stock,
  each size" / "In stock" · "Sizes" · "Add more details" · "Add product" · toast "Added Ivory kurta set." · "Saved as a
  draft." then the needs (readiness labels as they are) · "We couldn’t add the product. Nothing was saved." · a photo
  the uploader refuses: its own sentence; any other failure "We couldn’t add the photo. Nothing was saved. Try again." · "Give your
  product a name of up to 140 characters." · "Whole rupees, digits only." · "A number, 0 or more." · "Choose sizes from
  the list."
- Business details: "Business details" · "Legal name" · "GST registration" · "Not registered" · "Regular" ·
  "Composition" · "State" · "GSTIN" (placeholder 08ABCDE1234F1Z5) · "Not now" · "Add grievance officer" · "Grievance
  officer" · tip "About the grievance officer": "The law asks your store to name a person who answers complaints." ·
  "Name" · "Phone" · "Email" · "Back" · "Save details" · toast "Saved business details." · "Ask the owner" · "Back to
  setup".
- How shoppers pay: "How shoppers pay" · "Pay on delivery" · "Pay on delivery up to" · "Set in Delivery Zones" ·
  "Your limit is below the lowest Pay on delivery order. Change that first." · "UPI and cards" · "Connect Razorpay" · "Connected" · "Not now" ·
  "Save payment choices" · toast "Saved payment choices."
- Open your store?: "Open your store?" · "Not yet" · "Open store" · refusals as `openShop` today · a website on a
  Test key: "Your store is still closed" (no period: a title).
- Moment: "Kesar Studio is open" · "Copy link" · toast "Copied." · "Share on WhatsApp" · "Go to Home".
- Pickup PIN code: "Pickup PIN code" · "PIN code" · "City and state" · "We do not know this PIN code. Check the 6
  digits." · "A PIN code is 6 digits and starts with 1 to 9." · "Not now" · "Save PIN code" · toast "Saved your pickup
  PIN code." · header "From 302003" (named "Change pickup PIN code, from 302003": the visible words stay in the name,
  WCAG 2.5.3) / "Add pickup PIN code".
- Field errors otherwise the section rules' own (`sections.ts:236-288`).

## Practices recorded in skills (landed in O2a·11; bumps from the versions O1 leaves)
| Practice | Skill file § | Bump |
|---|---|---|
| Pictogram names list every pictogram: add `payments`, `risk`, `returned`, `tally` (missing today) and `product`, `details` | `frata-design-language` SKILL.md § Graphic language (`:96-100`) | design-language minor (once for this table's three rows) |
| Rule 30: "Before the store opens, Home is the setup card: the next step, then the four steps. The session that opens the store sees the open card until it hides it." | `reference/ux-foundation.md` rule 30 (`:175`) | same |
| A setup popup keeps what was typed when it closes, until it saves; its first field takes focus | `reference/ux-foundation.md` beside rule 27 (dialogs) | same |
| A popup saves through `parseFields` + `SETUP_FIELDS` (server-named subsets, only keys sent), never a whole-section parse of a partial form; `addFirstProduct` composes `writeProducts`, `attachIn`, `setStatusIn` and is not a second writer; photo checks run before the transaction | `frata-architecture` SKILL.md § Server actions; `reference/catalogue-and-content.md` § Writing products | architecture minor |
| A page's popup reads on open, never on the page | `frata-architecture/reference/speed.md` | same |

## Repetitive work → agents and scripts
| Chore | Done by hand | Becomes |
|---|---|---|
| Moving flows from "Open my store" / "Open it" to the popup | 90-ux, 91-storefront-api, 99-setup | `openStore(page)` in `e2e/lib.mjs` (O2a·8); O2b adds `{ plan }` |
| Checking a popup sends only server-named fields | each popup review | no gate: `security-reviewer` judges it; `check:actions` already sees the chokepoint |
| Pinning a page's JS after a change | each UI phase | the existing `APP_PINNED` |

## Deviations
| Mockup element | What is built | Reason | Owner seen |
|---|---|---|---|
| 1 "Open your store?" with three plan radio cards and "Free for 30 days. First charge ₹1,499 + GST on 23 Dec." | the popup's title, store pictogram, "Not yet" and "Open store"; no radios, no line | owner decision 1 (2026-11-23): the plan choice and its money line are O2b, built after its addendum | yes |
| 2 The open moment's store pictogram on a haldi tile, title 22 px semibold | the drawn rani check (circle then tick), the title in the display face; the layer covers the whole frame as drawn | ux rule 26 (approved): the one brand moment is the drawn check in the display face | no |
| 3 State select beside GST registration for every registration | State only for Not registered; Regular and Composition take it from the GSTIN | one fact, one answer: `taxesPatch` sets `homeState` from the GSTIN (`sections.ts:308`) | no |
| 4 The next step slides 16 px over 200 ms; the tick 320 ms; the moment's children rise over 320 ms | `animate-step-forward` (16 px, 320 ms, `base.css:331`); `animate-draw-tick` (200 ms after 320 ms, `:352`); `animate-rise` (200 ms, `:335`) with the drawn 80 ms stagger | no new duration (rule 22): the approved utilities | no |
| 5 Toast leaves after 3.2 s | 8 s, paused on hover | Feedback rule 2 | no |
| 6 Payments pictogram drawn as a card with a haldi chip | the existing `payments` pictogram | one pictogram per meaning (`pictogram.tsx:91`) | no |
| 7 A done row's value in `--text-3`, 13 px | the value in text 2 (`muted-foreground`), 13 px | a law: axe finds text 3 at 13 px below 4.5:1 on white (WCAG 1.4.3; e2e `99-setup`) | no |
| 8 On a phone the popup sheet has a grab handle and its two buttons share the width | the `Dialog` primitive's sheet: no handle, buttons at the end of the row | one sheet for every dialog (Neel primitives); a handle that does not drag would promise a gesture the sheet lacks. Changing the primitive changes every sheet: an owner call | no |
| 9 "Open your store?", the moment and the open card draw their own store (a box with a haldi door) | the existing `store` pictogram (a shopfront with a haldi awning) on its tile | one pictogram per meaning (`pictogram.tsx`): Home's empty state and the website already draw the store this way | no |
| 10 Price and the Pay on delivery limit show "₹2,490" / "₹3,000" as typed values | a ₹ drawn inside the field before the digits; the value is digits and commas | the parser takes whole rupees (`sections.ts` rupees, `addFirstProduct`); a typed ₹ would be one more thing to strip | no |

## Out of scope (and the signal that brings each back)
- The plan at opening, billing from the first opening, the plan step leaving sign-up: O2b.
- The Website step: W1.
- Hiding the open card across sessions: three owners ask (it would need a stored flag; nothing stores "done").
- Per-category words in the first-product popup beyond `sellsSized` and the kind: C1's packs.

## Open questions for the orchestrator
1. O2a·4 needs O1·8's `onDismiss` and ✕ in `Dialog`; this plan does not add them. Confirm O1·8 merges first.
2. O2a·7 reuses O1·8's store card; if it is page-local to `/start`, O2a moves it to `src/components/brand/`. Agree?
3. The 80 ms stagger needs one `animate-rise-stagger` utility (a delay, no new duration). Accept, or a Deviations row?
4. "Change payments" is drawn only for a done step; when Pay on delivery is off and Razorpay is not connected, keep
   "Change payments" or say "Choose payments"?
