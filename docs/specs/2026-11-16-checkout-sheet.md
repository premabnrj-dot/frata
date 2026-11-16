# The checkout sheet: checkout and the order confirmation over the brand's own website
Status: draft (mockup for the owner; reviews to run on this spec) · Date: 2026-11-16 · Mockup: https://claude.ai/artifact/ALB3BYBUTjdwkA8qaWAgXL (`docs/mockups/2026-11-16-checkout-sheet.html`)
(link in the plan once published) · Builds on: `docs/specs/2026-11-16-one-address-checkout.md` (P2 design, P3 secure
frame, P5 one address, P6 one bag) and ADR-0019

The owner, 2026-11-16 (verbatim): "is it possible that we design our checkout on top of website as modal popup,
responsive rather than a page, also order confirmation, if yes, pleaes plan best approach, modular, cleaner, merchant
branded layout. this should element the friction for a shopper to be on a two different domains. 2. it should be
extremely creative, smooth, lightweight, effective."

## In short
- **Yes.** The shopper taps Checkout in the site's bag and **the bag becomes checkout** on the same surface: on a phone the
  bag's full-height sheet turns into checkout; on a computer the bag's side panel widens into it. Payment, and then the
  order confirmation, happen in that sheet. Closing it leaves the shopper on the page they were on, bag emptied, order
  placed. No page change, no second address, no new look.
- **What it rests on, already approved:** one address (P5) puts the site and Frrata's checkout at one host; the secure
  frame (P3) keeps every personal field in Frrata's frame on `secure.<host>`; the brand record (P1, live) and the
  checkout design (P2) draw it in the brand's look. This spec changes **where the frame is shown**: in a sheet over the
  site's page instead of on a separate `/checkout` page. `/checkout` stays, as the full-page version of the same frame.
- **Three parts with one contract:** a small **sheet host** served by Frrata at a reserved path on the brand's own host
  (`/_frrata/sheet.js`, ≤ 6 kB gzipped, no framework), the **secure frame** (P3, ≤ 25 kB) in a sheet variant, and the
  **frame messages** (P3·5's closed schema) gaining open, close, height, step, placed and focus. The kit's
  `<CheckoutButton>` loads the host; the site holds no checkout code.
- **Lightweight by intent:** nothing loads until the shopper opens the bag; opening the bag preconnects and warms the
  frame, so Checkout opens in well under half a second on a mid-range Android phone.

## Goal
Ranked problem 4, mobile checkout conversion (and 5, a premium storefront). Today a shopper leaves the brand's site for
a checkout at another address and look; after P5 the address is one, but checkout is still a page change. Measure, a
month after the pilot ships it against P5's page checkout: the share of checkout opens that place an order; the time from
the Checkout tap to the first field the shopper can type in (target under 400 ms at the 75th percentile on phones); the
share of shoppers who close checkout and come back to it in the same visit.

## Job
A shopper with a bag on the brand's site pays and sees the order confirmed without leaving the page they are on, in the
brand's look, as fast as opening the bag.

## Research
(Current sources only, dated. `integration-researcher`, 2026-11-16; § Facts used.)
- **Razorpay Magic Checkout** opens as a modal over the merchant's page; Back closes it (`handleback`); the confirmation
  goes to the merchant's page or an order-status URL. **Taken:** one history entry so Back closes; the confirmation
  reachable at a real URL.
- **GoKwik** draws its checkout over the page from an SDK and, on completion, sends the shopper to the merchant's
  thank-you page; **Shopflo** redirects to its own checkout; **Shiprocket Checkout** shows its success as an overlay.
  **Taken:** shoppers in India know a checkout over the shop; keep a full-page fallback, as each vendor does.
  **Skipped:** their own look and cross-shopper networks (EkCode stays the one network, ADR-0009); their uplift figures
  (40 %, 70 %) have no method, so we measure our own (§ Goal).
- **Shopify Checkout Kit for web** opens checkout in a separate window or a 600 × 600 popup, not a frame; Shop Pay needs
  Shopify Payments, which India lacks. **Skipped:** neither is a model here.
- **Baymard:** average abandonment 70.22 %, 17 % for a long or complicated checkout (2026-10-28). Guideline #709 warns
  against site-initiated overlays during checkout (newsletters, offers): the sheet is the checkout itself, and nothing
  else may open over it. No current study compares overlay and page checkouts.
- **W3C's modal dialog pattern:** focus in, trapped, Esc closes, focus returns (§ 6).
- **The site's own bag drawer** (House of Ayuda, live, 2026-11-16): full height on phones, a 420 px right panel on
  computers, Checkout at its foot. **Taken:** the drawer is the start of the motion; checkout grows out of it.
- See § Facts used for the dated facts and the browser behaviours the design depends on.

## Design

### 1. What the shopper sees
1. **Bag.** The site's own drawer (unchanged). Opening it warms checkout (§ 4).
2. **Checkout tap → the bag becomes checkout.** The Checkout button at the bag's foot stays where the thumb is and
   becomes checkout's pay bar (**Place order · ₹2,790**); the bag's lines slide up and fade as checkout's form rises
   (`--d-morph`, 400 ms, glide); the bag's title gives way to the brand's logo and **Secure checkout**. On a computer
   the 420 px panel widens to 560 px (P2's one column) over the dimmed page. The site stays visible and dimmed behind on
   a computer, and as an 8 px strip above the sheet on a phone. The bag's lines reappear in checkout's Your order, with
   the stepper and Remove, where P2 drew them.
3. **Checkout itself** is P2's approved page, unchanged in content and order: Contact (EkCode first), Delivery address,
   How you'll pay, Your order with the stepper and Remove, the trust blocks, and the pay bar pinned to the sheet's foot
   (**Place order · ₹** or **Pay · ₹**). It scrolls inside the sheet.
4. **Paying.** Razorpay opens over the sheet from inside the frame (P3·1's spike decides; its fallback stands). UPI
   intent leaves for the UPI app and comes back to the same page with the sheet still open. **In Instagram's and
   Facebook's in-app browsers Razorpay's pop-up does not appear** (Razorpay's docs, 2026-11-12): there, Pay online
   takes the full-page path (`callback_url`) and returns to the order page; Pay on delivery stays in the sheet.
5. **Placed → the confirmation in the sheet.** The pay bar's button turns into a check that draws itself (`--d-small`),
   then the sheet's content becomes P2's order page: Order placed, the brand's thank-you line, the number, Arrives, the
   items, Keep ₹ ready for Pay on delivery. The foot carries **Continue shopping**.
6. **Closing.** Continue shopping, Close, the phone's back gesture and Esc all close the sheet (opening it pushes one
   history entry, as Razorpay's Magic Checkout does with `handleback`). Behind it the site's bag is empty and its count
   reads 0; a toast reads **Order AY-1042 placed · View** (View reopens the confirmation in this visit). The receipt,
   WhatsApp and the order page link keep the real order page for later.
7. **A refresh after placing** lands on `/checkout`; the secure frame still holds the order it just placed (its own
   session, P3) and shows that confirmation again instead of an empty checkout. Every vendor studied keeps the
   confirmation at a real URL; ours is the order page, reached from the confirmation, the receipt and WhatsApp.

### 2. What stays the same (approved)
Every field, label, step, word, price rule and button of P2; every security rule of P3 (the frame's origin, CSP,
messages, `frame-ancestors`, cookies); P5's routing. `/checkout` and `/orders/<token>` stay real pages: a link from
Instagram, a refresh, a shared link, a payment return and a browser without JavaScript land there, the same frame on a
full page. Theme shops (Frrata's own pages) keep today's checkout until themes retire (ADR-0014).

### 3. The three parts and their contract
| Part | Where | Owns | Never |
|---|---|---|---|
| **Sheet host** `sheet.js` | Frrata's reserved path on the store's host (`/_frrata/sheet.js`), versioned and cached by hash; built like `fe.js` (`src/sheet/`, `check:sheet-script` ≤ 6 kB gz) | The `<dialog>`, its motion, the top bar (logo from `shop.brand`, Close), the dimmed page, the back button (one history entry), focus return, the site bag's "placed" clear through the kit's bag hooks, the warm frame | A field, a price worked out, a payment, any personal data; any write to storage but the bag's own keys |
| **Secure frame**, sheet variant | `secure.<host>/checkout?view=sheet&l=…` (P3·6) | Every field, the price for the address, Place order, payment, the confirmation (it holds the order's personal details) | Drawing outside its box; trusting a message but the schema |
| **Frame messages** | `src/domains/checkout/frame-messages.ts` (P3·5), one closed schema both sides import | page → frame: bag ids and quantities, method, code, `open`, `focus`; frame → page: `height`, `step`, delivery fee or zone name, `placed` {order number}, `failed` {code}, `close` | A personal field, a PIN code, a token; `'*'` as a target |
The kit gains `<CheckoutButton>` (in `components/frrata/`, kit-synced like `cart-link.ts`): it renders a plain link to
`cartLink(bag)` (works with no JavaScript) and, when the store answers `shop.cart.sheet: true` (additive in `2026-12`),
loads `sheet.js` and opens the sheet instead. A site needs no other code. Because Frrata serves `sheet.js` itself, a
fix reaches every site at once, without a partner rebuild.

### 4. Speed (lightweight)
- **Before the bag opens:** nothing. No checkout script, no frame, no preconnect on product or list pages.
- **When the bag opens:** `sheet.js` (≤ 6 kB) loads, `<link rel=preconnect>` to `secure.<host>`, and a hidden frame
  starts loading `?view=sheet&l=…` with the current bag; a bag change re-sends lines by message (no reload).
- **On Checkout:** the warm frame is shown; no request is on the tap's path. Target: first field ready < 400 ms (p75,
  mid-range Android, 4G), against today's page change of ≈ 1.5–2.5 s.
- **Frame weight** (P3·6): server HTML plus one script ≤ 25 kB gz, the brand's two fonts from the shared Frrata media
  URL (one download for page and frame). The sheet adds no font.
- **Costs:** a warm frame prices the bag once per bag open (one quote, already rate-limited); a frame never prices on
  each keystroke.

### 5. Motion and visuals (creative, smooth)
- **One surface, never a cut:** bag → checkout → paying → placed is one sheet changing shape, and **the button the
  shopper taps never moves**: Checkout → Place order · ₹ → a check → Continue shopping. The movements, all from the
  design language (no new duration or easing): the sheet rises with `--d-sheet` 320 ms and `--e-settle` (a cold start);
  the bag's lines slide up as the form rises with `--d-morph` 400 ms and `--e-glide`; the computer panel widens 420 → 560 px with
  `--d-morph`; the check after placing draws over `--d-small` 200 ms; closing leaves with `--e-leave`.
- **The brand's moment:** the confirmation opens on the brand's accent band behind the logo, for the thank-you line only;
  everything else stays the brand's background.
- **Reduced motion:** crossfades only, same durations halved.
- **Phone details:** a grab handle; swiping down closes only when the sheet is scrolled to its top and no field is being
  edited; the sheet follows `visualViewport` so the keyboard never covers the focused field or the pay bar (iOS gets
  `interactive-widget` only in a 27.3 beta, so it is not relied on).

### 6. Accessibility
`<dialog>` opened with `showModal()` (the page behind is inert); the frame has `title="Checkout"`; focus moves into the
frame's first field on open (`focus` message) and back to the Checkout button on close; Esc closes; the step changes are
announced from inside the frame; targets 44 px; contrast from the brand record's own checks (P1).

### 7. When the sheet is not used (fallbacks, in order)
- The store is not one-address yet, or `shop.cart.sheet` is false → the kit's button is the bag link (today).
- JavaScript off, `sheet.js` fails to load, or `<dialog>` unsupported → the link (full-page checkout).
- The frame fails to load in 8 s → the sheet shows **We couldn't load the secure form.** with **Try again** and **Open
  checkout as a page**.
- A browser the P3·1 spike fails (an in-app browser) → `sheet.js` opens the full page for it (decision 20's list).

## Design review
- **UI/UX:** one primary action per state (Checkout; Place order or Pay; Continue shopping). States drawn in the mockup:
  opening (warm), cold (warming), filled, a field error, paying, payment failed, placed (Pay on delivery and paid), frame
  failed, closed with the toast, phone and computer, the full-page fallback. Norman: the sheet maps to the bag the shopper
  just looked at; undo is Close (entries kept in the frame for the visit); feedback after every action is P2's.
- **Tenancy:** no new table, no new read. The store comes from the host (P5); the frame's tenant from `secure.<host>`
  (P3·2). `shop.cart.sheet` is a flag on the public shop answer, derived from the predicate (`one_address` and the secure
  host certified), never stored.
- **Modularity:** host (`src/sheet/`, browser-only, built like `src/beacon/`), frame (P3's `src/app/secure/[host]/` and
  `src/frame/`), schema (`src/domains/checkout/frame-messages.ts`, pure). The kit adds one component. `check:layers`
  unchanged.
- **SSOT / DRY:** the fields stay `src/domains/checkout/fields.ts`; prices only from the quote; the confirmation is P2's
  order view rendered by the frame, not a second copy; the sheet's sizes and motion are design-language tokens.
- **YAGNI:** no sheet on theme shops; no partner styling of the sheet's chrome beyond the brand record; no second
  checkout layout. Signal to revisit: a partner asks for a different sheet edge, or theme shops outlive V5.
- **KISS:** one script and one dialog on the site, one frame variant, five new message types.
- **Scalability:** the warm frame adds one quote per bag open; at 10× festive traffic that is bounded by the quote's
  existing per-IP and per-shop limits; the frame is never cached (P3) and is ≈ 4 statements a render (P3·2's ceiling).
- **Performance:** § 4. `speed-reviewer` to measure the warm path and `sheet.js` bytes before build.
- **Reliability:** every failure lands on the full-page checkout, which already works; the sheet never blocks Place
  order (it is inside the frame). `placed` is idempotent (order number), so a repeated message never clears a new bag.
- **Security** (`security-reviewer` to run): the parent page is now the partner's code, not Frrata's checkout shell.
  This is the case P3's model already assumes ("no check depends on telling Frrata's document from the partner's", spec
  § 2): personal fields stay in the frame; the frame accepts only the closed schema from `window.parent` at the exact
  store origin and sends nothing personal. New for the sheet: (a) `sheet.js` is Frrata's code on the brand origin at a
  reserved path the partner cannot answer (§ 1b's negative match); (b) T10 (a fake form drawn over the frame) is the
  same residual with the frame's own fields as the only real ones; the sheet's top bar shows the store's address and a
  lock icon from Frrata's code; (c) `placed` carries only the order number; View reopens the frame, never a token in
  the page.
- **Motion and visuals:** § 5; no Unicode glyph as an icon; the check is an SVG path.
- **Unit economics:** none for merchants; Frrata pays one quote per bag open (≈ statements, no outside call).
- **Theme blocks:** n/a.
- **Blast radius:** P3's frame gains a `view=sheet` variant (no header or footer, the pay bar pinned); the kit's bag
  button; `shop.cart` gains `sheet` (additive, `api-contract-reviewer`); the site's bag clear on `placed` replaces the
  pilot's documented deviation ("the site's bag after an order").

## Phase and tasks (to join the one-address plan as P3s, after P3, shipped with P5)
| # | Task | Verify |
|---|---|---|
| S·0 | Mockup approved (this spec's); `integration-researcher` facts folded; reviews: `architecture-reviewer`, `security-reviewer`, `speed-reviewer`, `api-contract-reviewer`, `design-system-reviewer`, `words-reviewer` | the reports |
| S·1 | `frame-messages.ts`: `open`, `focus`, `height`, `step`, `placed`, `failed`, `close`; tests that every message is in the closed list and none carries a personal field | `npx vitest run src/domains/checkout` |
| S·2 | The frame's sheet variant (`?view=sheet`): no header or footer, pay bar pinned, confirmation in place, `placed` sent once | `npm run e2e -- --only checkout-sheet` |
| S·3 | `src/sheet/` → `public/sheet.js` (≤ 6 kB gz, `check:sheet-script`), served at `/_frrata/sheet.js` on one-address hosts (a reserved path); `<dialog>`, motion, history, focus, warm frame, fallbacks | `npm test`; `npm run e2e -- --only checkout-sheet,secure-frame` |
| S·4 | `shop.cart.sheet` in `2026-12` (additive; docs § Bag link); the kit's `<CheckoutButton>`; `kit-sync` | `npm run check:api`; `cd kit/starter && npm run check && npm run build` |
| S·5 | e2e `checkout-sheet`: phone and computer; open warm and cold; Place order (Pay on delivery); pay online (fake Razorpay); back closes; refresh lands on `/checkout`; frame fails → Try again → the page; the site's bag empties on `placed` | `npm run e2e -- --only checkout-sheet` |
| S·6 | The pilot: House of Ayuda's Checkout through `<CheckoutButton>`; mockup-parity on the build | `mockup-parity-reviewer` |

## Out of scope
The sheet on theme shops; partner-styled sheet chrome; a checkout before the bag (Buy now opens the bag first, then the
sheet: one path); saved cards. Signals to revisit in § Design review YAGNI.

## Owner decisions (each with a recommendation)
1. **The motion:** the bag becomes checkout on the same surface (recommended), or checkout opens as a new sheet over the bag.
2. **Computer:** the right panel widening to 560 px (recommended, continuity with the bag), or a centred modal.
3. **Phone:** a full-height sheet with an 8 px strip of the site above and a handle (recommended), or fully covering.
4. **The confirmation:** in the sheet, with Continue shopping returning to the same page (recommended); the order page
   stays for links.
5. **Where the host lives:** served by Frrata at `/_frrata/sheet.js` so fixes reach every site at once (recommended),
   or copied into each site by the kit.
6. **When:** with P5 (recommended; the sheet needs the frame on the same site as the page). Until then the pilot keeps
   the bag link to the brand-design checkout page (P2).

## Facts used (read 2026-11-16 by `integration-researcher`)
| Fact | Source | Date |
|---|---|---|
| Magic Checkout (web) is a modal (`rzp1.open()`); `handleback` default true; success to `handler` or `callback_url`; `theme.color` on request; no logo option | razorpay.com/docs/payments/magic-checkout/web | lastmod 2026-11-16 |
| Magic, headless: the handler then redirects to `order_status_url` | razorpay.com/docs/…/magic-checkout/shopify/custom/web-integration-nextjs | lastmod 2026-11-12 |
| "The Razorpay Checkout pop-up page does not appear in certain browsers, for example, on Facebook and Instagram browsers"; fix: `callback_url` | razorpay.com/docs/…/standard/troubleshooting-faqs | lastmod 2026-11-12 |
| Razorpay Checkout inside a frame: no support statement and no ban found | — | unverified (P3·1 spike) |
| Shopify Checkout Kit for web opens a separate window on the checkout origin (new tab, or a 600 × 600 popup) | shopify.dev/docs/storefronts/mobile-next/checkout-kit/web | undated vendor page |
| Shopflo on a custom store redirects to Shopflo, then to `success_url` | Shopflo help article 15896402 | 2026-07-10 |
| GoKwik's SDK draws over the page and on completion sets `window.location` to the merchant's thank-you page | github.com/GoKwik/kwikcheckout-woo | secondary, undated |
| Cart abandonment 70.22 %; "too long / complicated" 17 % | baymard.com/lists/cart-abandonment-rate | 2026-10-28 |
| Baymard #709: site-initiated overlays in checkout distract (body paywalled) | baymard.com/guidelines/709 | updated Jul 2026 |
| Chrome autofills when the focused field and the candidate share an origin (so a form wholly inside one frame fills) | chromium.googlesource.com …/autofill-across-iframes.md | undated, cites Oct 2026 |
| iOS: login autofill inside a cross-origin frame fixed 2026-06-04; address and one-time-code autofill in a frame unverified | bugs.webkit.org/show_bug.cgi?id=310075 | 2026-06-04 |
| `interactive-widget` defaults to `resizes-visual`; iOS supports it only in the 27.3 beta | MDN viewport meta; bugs.webkit.org/show_bug.cgi?id=259770 | 2026-09-23; 2026-11-06 |
| Firefox keys storage by top-level site (scheme plus registrable domain) | MDN, State Partitioning | 2026-06-15 |
| Chrome does not partition a chain of same-site frames | privacysandbox.google.com/3pcd/storage-partitioning | 2025-06-13 (no current source; unverified) |
