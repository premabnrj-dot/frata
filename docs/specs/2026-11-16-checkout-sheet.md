# The checkout sheet: checkout and the order confirmation over the brand's own website
Status: draft, reviews folded (architecture CHANGES NEEDED, security FIX BEFORE BUILD, speed OVER BUDGET as drafted,
words; all folded in below, 2026-11-16); for the owner's approval with the mockup · Date: 2026-11-16 · Mockup:
https://claude.ai/artifact/ALB3BYBUTjdwkA8qaWAgXL (`docs/mockups/2026-11-16-checkout-sheet.html`) · Builds on:
`docs/specs/2026-11-16-one-address-checkout.md` (P2 design, P3 secure frame, P5 one address, P6 one bag), ADR-0019

The owner, 2026-11-16 (verbatim): "is it possible that we design our checkout on top of website as modal popup,
responsive rather than a page, also order confirmation, if yes, pleaes plan best approach, modular, cleaner, merchant
branded layout. this should element the friction for a shopper to be on a two different domains. 2. it should be
extremely creative, smooth, lightweight, effective."

## In short
- **Yes.** The shopper taps Checkout in the website's bag and checkout opens as a sheet from that button: the button
  they tapped is where the pay bar appears. They pay and see the order confirmed in the same sheet, close it, and are
  on the page they were on, with an empty bag. No page change, no second address, no new look.
- **What it rests on, already approved:** one address (P5) puts the website and Frrata's checkout at one host; the
  secure frame (P3) keeps every personal field in Frrata's code on `secure.<host>`; the brand record (P1, live) and the
  checkout design (P2) draw it in the brand's look.
- **What changes in P3 (owner call 9):** the secure form draws **all** of checkout, on `/checkout` and in the sheet:
  the top bar (logo, lock, Close), Your bag with the stepper and Remove, the fields, How you'll pay, the code, the
  summary, Place order, the confirmation and the legal block. The page around it only hosts it. One layout, not two.
- **Three parts with one contract:** a small host script Frrata serves on the brand's own address
  (`/_frrata/v1/sheet.js`, ≤ 4 kB, no framework) that is only the dialog and its motion; the secure form; and a short,
  fixed list of messages. The kit's `<CheckoutButton>` loads the host; the website holds no checkout code.
- **Safe with partner code beside it:** every security decision is in the secure form or on the server, never in
  `sheet.js` (it runs next to the partner's code). Place order works only once the browser confirms the form is in view.
- **Light:** nothing loads until the bag opens; opening the bag warms the empty form; Checkout shows it in under
  400 ms on a phone.

## Goal
Ranked problem 4, mobile checkout conversion (and 5, a premium storefront). After P5 the address is one, but checkout is
still a page change. Measure, a month after the pilot ships it against P5's page checkout: the share of checkout opens
that place an order; tap → form ready (target < 400 ms p75 on phones, warm); the share of shoppers who close checkout
and reopen it in the same visit; the share of warmed forms never shown (§ 4's rule).

## Job
A shopper with a bag on the brand's website pays and sees the order confirmed without leaving the page they are on, in
the brand's look, as fast as opening the bag.

## Research
(Current sources only, dated. `integration-researcher`, 2026-11-16; § Facts used.)
- **Razorpay Magic Checkout** opens as a modal over the merchant's page; Back closes it (`handleback`); the confirmation
  goes to the merchant's page or an order-status URL. **Taken:** Back closes the sheet (for us natively: Android's Back is a
  `<dialog>` close request; no history entry, ux-foundation rule 27); the confirmation reachable at a real URL (the
  order page, from the receipt and WhatsApp).
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
  computers, Checkout at its foot. **Taken:** the sheet opens from where the Checkout button is (its box passed in
  by the kit's `<CheckoutButton>`), so the button the shopper tapped is where the pay bar appears; the website's own
  drawer closes under it.
- See § Facts used for the dated facts and the browser behaviours the design depends on.

## Design

### 1. What the shopper sees
1. **Bag.** The website's own drawer, or its `/bag` page (unchanged). Opening it warms checkout (§ 4).
2. **Checkout.** The website's drawer closes under the sheet as the sheet rises from the Checkout button's position
   (`<CheckoutButton>` passes its box): on a phone a full-height sheet with an 8 px strip of the page above, on the
   spring in 320 ms over the standard scrim; on a computer a 560 px panel at the right (P2's one column), fading and
   sliding 24 px in 200 ms (no spring on a desktop dialog). The pay bar lands where the Checkout button was. From
   `/bag`, the same sheet over the bag page.
3. **Checkout itself** is P2's approved content and order, all drawn by the secure form: the top bar (the brand's logo,
   the lock and **Secure checkout**, Close), Your bag with the stepper and Remove, Contact (EkCode first), Delivery
   address, How you'll pay, the code, the summary and trust blocks, the legal block and policy links at its foot, and
   the pay bar pinned (**Place order · ₹** or **Pay · ₹**).
4. **Paying.** Razorpay opens from inside the secure form (P3·1's spike). UPI intent leaves for the UPI app and comes
   back to the same page with the sheet open. **Where the sheet is not offered:** Instagram's and Facebook's in-app
   browsers (Razorpay's pop-up does not appear there, Razorpay's docs 2026-11-12) and decision 20's list get the
   full-page checkout, decided on the server; and **if P3·1(a) fails** (Razorpay cannot run in the frame) there is no
   sheet anywhere: the fallback would open Razorpay from the partner's page (security H2).
5. **Placed.** The pay bar's button draws a check (200 ms), then the confirmation (P2's order view) replaces the form,
   with **Continue shopping** in the bar.
6. **Closing.** Continue shopping, Close, Esc and Android's Back (a `<dialog>` close request; no history entry, rule 27)
   close the sheet in 200 ms. The website's bag is empty (§ 3, the bag contract) and a toast reads **Order placed ·
   View**; View reopens the confirmation in this page view. The order page stays the receipt's and WhatsApp's link.
7. **A refresh** reloads the page the shopper was on, sheet closed; an order placed stays on its order page (receipt,
   WhatsApp, email). No new "last order" state on `/checkout`.

### 2. What stays the same
Every field, label, step, word, price rule and button of P2; P3's frame origin, CSP, cookies and `frame-ancestors`;
P5's routing. `/checkout` and `/orders/<token>` stay real pages: a link from Instagram, a shared link, a payment return,
an in-app browser and a browser without JavaScript land there, the same secure form on a full page. Theme stores keep
today's checkout until themes retire (ADR-0014).

### 3. The parts and their contract
| Part | Where | Owns | Never |
|---|---|---|---|
| **Host** `sheet.js` | `/_frrata/v1/sheet.js` on the store's host (a reserved path; `host.ts` and the middleware matcher leave `/_frrata/*` to Frrata's app), fixed URL, `max-age=300, stale-while-revalidate`; built by the one table-driven build script (beacon, bag, frame, sheet); `check:sheet-script` ≤ 4 kB; its own stylesheet `/_frrata/v1/sheet.css` (`style-src 'self'`); a kill switch (the API's `shop.bag` null) | A closed shadow root holding the `<dialog>` (`showModal()`), the scrim, the iframe, the open and close motion from the button's box, a Close for the load-failure state only, the toast | Any security decision (it runs beside partner code: **untrusted UX**); a brand read; a storage write; Razorpay |
| **Secure form** | `secure.<host>/checkout?view=sheet&l=…` (P3·6), the same document as the full page's form | Everything a shopper sees and does in checkout (§ 1.3), the price, Place order, payment, the confirmation; the visibility proof for Place order | Trusting a message beyond the list; drawing outside its box |
| **Messages** | `src/domains/checkout/frame-messages.ts`, hand-written (no `zod`), one list both sides import | page → form: `bag` {ids, quantities} (before the first `open` only), `open`; form → page: `ready`, `lines` {ids, quantities} (after Remove or the stepper), `placed` {nonce}, `close`, `failed` (load only) | A personal field, a PIN code, a token, an order number, an amount, a method or a code; `'*'` |
**The bag contract** (architecture B2, M4): `<CheckoutButton>` takes `onLines` and `onPlaced` and calls the kit's bag:
`bag.set(lines)` and a new `bag.clear()` (the bag lives in memory, `kit/starter/lib/bag.ts`; a storage write by
another script would be overwritten). `sheet.js` writes nothing. The full-page paths (a payment return, Open checkout as
a page, a tab Android discarded during the UPI switch) never send `placed`, so the pilot's documented deviation ("the
website's bag after an order") stays for them until P6, when the bag is Frrata's.
**The API** (architecture M6): no new `shop.cart.sheet`. The one nullable field M8 already planned, `shop.bag`, carries
`{ script, sheet }` URLs on one-address stores and is null elsewhere (the predicate, never stored); null is also the
kill switch. `<CheckoutButton>` renders the bag link (works with no JavaScript) and loads `sheet` when it is present.

### 4. Speed (`speed-reviewer` 2026-11-16, OVER BUDGET as first drafted; folded in)
- **Before the bag opens:** nothing on the path. On a page with a non-empty bag, `sheet.js` is prefetched when idle
  and `dns-prefetch` names `secure.<host>`.
- **When the bag opens:** `sheet.js` (≤ 4 kB gz; a working prototype measured 2.2 kB) preconnects and creates the
  frame **inside the dialog where it will stay** (moving an iframe reloads it), hidden. The warm form renders **empty
  fields only, no price, no EkCode prefill** (≈ 4 statements); one per page view, kept across bag opens.
- **On Checkout:** `open`; the form prices once through `/api/secure` (its own bucket, `frameIp`) and reads EkCode's
  prefill after the shopper's first tap inside it. The sheet rises in 320 ms; the form posts `ready` when it can take
  input. **Target: tap → `ready` < 400 ms p75** on phones, warm, Android and iOS reported apart. No field is focused
  for the shopper: EkCode comes first, and iOS raises the keyboard only on the shopper's own tap; focus goes to the
  sheet's heading for screen readers.
- **Cold path** (Buy now, a fast tap): the form's first field is a working server-rendered input, never waiting for
  `frame.js` (hashed, immutable). Expected 1.0–1.3 s on a slow phone network, against ≈ 1.5–2.5 s today.
- **Fonts, one download:** `<BrandStyle>` loads the brand's fonts from **Frrata media** (`@font-face`, `crossorigin`),
  the same URLs the form uses; `secure.<host>` is the same site, so the HTTP cache is shared; `font-display: swap`.
  (Today's kit loads Google Fonts: changed in S·4.)
- **Field data:** `sheet.js` records bag open, warm start, `ready`, tap, form ready (with the form's `responseStart`
  and `Server-Timing`), tagged warm, partial or cold with `effectiveType`, `deviceMemory` and the OS, and forms warmed
  against forms shown. One sampled `sendBeacon` to `/e`, nothing personal. **Rule:** if more than 70 % of warmed forms
  are never shown and fewer than half of the taps at p75 find the form warm, warm after 600 ms in the open bag.
- **Costs at 10× festive peak** (one shop, 25k sessions an hour, the reviewer's model): ≈ 4 statements per bag open for
  warming; pricing ≈ once per Checkout tap (≈ 13k statements an hour against ≈ 58k had the warm form priced).

### 5. Motion and visuals (the design language's patterns; nothing new)
| Moment | Phone | Computer | Reduced motion |
|---|---|---|---|
| Open | the sheet rises from the button's box on `--ease-spring`, 320 ms, scrim with it | the panel fades in and slides 24 px, 200 ms, `--ease-entrance` | fade, 120 ms |
| Close | 200 ms, `--ease-exit` (nothing leaves slower than it came, rule 23) | 200 ms, `--ease-exit` | fade, 120 ms |
| Inside the form (bag → fields, form → confirmation) | crossfade, 200 ms | crossfade, 200 ms | instant |
| Placed | the check draws in 200 ms (rule 26's tick) | same | the check appears |
| Toast | 200 ms | 200 ms | fade, 120 ms |
Nothing animates width or height (rule 22, `check:motion`). The pay bar never moves: Checkout → Place order · ₹ → the
check → Continue shopping, in one place. The phone handle and swipe-to-close are drawn and handled inside the secure form
(a touch inside the frame never reaches the page), which sends `close`.

### 6. Accessibility
`<dialog>` with `showModal()` (the page behind is inert, `aria-modal`); the iframe has `title="Checkout"`; focus moves
to the sheet's heading inside the form on open and returns to the Checkout button on close; Esc and Android's Back close;
step changes are announced inside the form; targets 44 px; contrast from the brand record's own checks (P1).

### 7. When the sheet is not used (fallbacks, in order)
- `shop.bag` is null (not one-address, or the kill switch) → the kit's button is the bag link.
- An in-app browser on decision 20's list, or P3·1(a) failed → the server refuses `view=sheet`; the button opens the
  full-page checkout.
- JavaScript off, `sheet.js` fails, or `<dialog>` is unsupported → the bag link.
- The form doesn't post `ready` in 8 s → the sheet shows **We couldn't load the secure form.** with **Try again** and
  **Open checkout as a page** (drawn by `sheet.js`, the only words it draws).
- Android discards the tab during the UPI switch → the payment return lands on the order page.

## Design review
- **UI/UX:** one primary action per state (Checkout; Place order or Pay; Continue shopping). States drawn in the mockup:
  bag, form loading (first open), filled, paying, payment failed, placed, form didn't load, closed with the toast, phone
  and computer. To draw before build: Checkout from `/bag`, the legal block at the form's foot, Deliver here (a saved
  address on a browser without the visibility proof), a bag changed after `open` (Place order held for 1 s). Norman:
  the sheet comes from the button just tapped; Close keeps what was typed for this page view; feedback is P2's.
- **Tenancy:** no new table or tenant source; the store from the host (P5); the form's tenant from `secure.<host>`
  (P3·2). `shop.bag` is derived from the predicate, never stored.
- **Modularity:** host (`src/sheet/`, browser-only), form (P3's `src/app/secure/[host]/` and `src/frame/`), messages
  (`src/domains/checkout/frame-messages.ts`, pure, hand-written). One table-driven build script for the four
  standalone scripts (architecture m13). The kit adds `<CheckoutButton>` and `bag.clear()`.
- **SSOT / DRY:** **one checkout layout**, drawn by the secure form on the page and in the sheet (architecture B1;
  amends P3·5, P3·6, P3·6b and P3's page/frame split: owner call 9). The fields stay `src/domains/checkout/fields.ts`;
  prices only from the quote; the website's bag is changed only through the kit's bag.
- **YAGNI:** no sheet on theme stores; no partner styling of the sheet; no second layout; no `height` or `step`
  messages (nothing reads them). Signal to revisit: a partner asks for a different sheet edge.
- **KISS:** one script and one dialog on the website, one form, seven messages.
- **Storefront API** (`api-contract-reviewer` to run on the diff): `shop.bag` gains `{ script, sheet }` (additive in
  `2026-12`, nullable, named in M8); docs § Bag link gains the sheet; no other field changes.
- **Scalability:** warming adds ≈ 4 statements a bag open; pricing on `open` under `frameIp` (per `<tenant>:<ip>`) and a
  logged per-shop ceiling; the quote has no per-shop limit today (`shopRequest` keys tenant and IP), so the frame gets
  its own. Shared mobile IPs on Indian 4G: the limit is on the frame's pricing, not on Place order.
- **Performance** (frata-planning § 3 (a)–(g)): (a) the form's render ≈ 4 statements in one transaction (P3·2's
  ceiling, now true: no price on render), pricing one `/api/secure` call on `open`; (b) no new query: the quote's, already
  EXPLAINed; (c) nothing cached (the form is `private, no-store`); (d) the form's HTML is P2's checkout, under 300 kB;
  (e) no write invalidates a tag (placing an order purges stock tags as today); (f) `sheet.js` ≤ 4 kB, `frame.js` ≤ 25
  kB, no change to the website's first-load JS (the host loads after the bag opens); (g) nothing preloaded; one font
  download (§ 4).
- **Reliability:** every failure lands on the full-page checkout or the bag link, which already work; Place order is
  inside the form, never blocked by the host; `placed` carries a nonce, so a repeated message never clears a new bag.
- **Security** (`security-reviewer`, 2026-11-16: FIX BEFORE BUILD; every finding folded in). In the sheet the form's
  parent is always the partner's code, so P3's T12 becomes the normal case. `sheet.js` is **untrusted UX**: partner
  code runs first and can skip it, frame `?view=sheet` itself or patch `postMessage`, `history` and `showModal`. Every
  decision lives in the form or on the server:
  - **H1 a tap the shopper didn't mean.** In the form: **Place order is enabled only after IntersectionObserver v2
    (`trackVisibility`) reports the form fully visible for ≥ 800 ms**; where v2 is missing (WebKit) a prefilled order
    needs one **Deliver here** tap inside the form first; `open` is never proof of visibility; the page cannot choose
    the method or a code. The T10 crawl gains an overlay check. Accepted finding row 3 is re-raised (owner call 7).
  - **H2 Razorpay outside the form:** no sheet when P3·1(a) fails; `sheet.js` never loads Razorpay.
  - **M1 the order changed on screen:** the page's `bag` is taken only before the first `open`; after it the bag changes
    only inside the form, and any change holds Place order for 1 s and highlights it.
  - **M2 what the page learns:** only `ready`, `lines` (ids and quantities the website already holds), `placed` (a
    nonce, no number or amount), `close`, `failed` (load). A bare `placed` still tells partner code an order happened:
    owner call 8.
  - **M3:** in-app browsers decided on the server; the lock, logo and Close drawn inside the form (a closed shadow root
    keeps the partner's CSS off the host's dialog, but only the form is trusted).
  - **M4 limits:** `frameIp` per `<tenant>:<ip>` and a logged per-shop ceiling on the form's render and pricing; reprices
    one in flight, ≥ 500 ms apart, capped per form; EkCode's prefill only after the first tap inside the form.
  - **L1:** `Referrer-Policy: no-referrer` on Frrata's `/checkout` and `/orders` on one-address hosts; the Razorpay
    return route named with its host, its T8 exemption, a timing-safe signature check, its 303 target and the form's
    `form-action`.
  - **L3:** the form reports a blur while the shopper is typing; payment state in the form's tab storage and on the
    server; EkCode's and Razorpay's popups opened unnamed (`_blank`).
  - **L4:** `sheet.js` draws no merchant content; accepts messages only from `iframe.contentWindow` at exactly
    `https://secure.<host>`; the partner CSP (T9, P5·5) gains `frame-src https://secure.<host>` and nothing wider.
- **Motion and visuals:** § 5; no Unicode glyph as an icon; the check is an SVG path.
- **Unit economics:** none for merchants; Frrata pays ≈ 4 statements per bag open and one quote per Checkout tap.
- **Theme blocks:** n/a.
- **Blast radius** (architecture M11): `host.ts:119` (only `/fe.js` is left unrewritten today) and the middleware matcher
  (`middleware.ts:82`) for `/_frrata/*`; `next.config.ts` headers for `/_frrata/v1/*`; P3·5, P3·6, P3·6b (one layout in
  the form); P3·8's `check:storage` scope (the host writes nothing); P5·5's partner CSP (`frame-src`); P5·6's reserved
  path gate; `kit/starter/lib/bag.ts` (`clear()`), `<BrandStyle>` (fonts from Frrata media), `<CheckoutButton>`; the
  storefront API's `shop.bag`.

### Stress tests
| Scenario | Expected | Guaranteed by |
|---|---|---|
| Partner code shows the warm form at 1 % opacity under its own button | Place order stays disabled | IntersectionObserver v2 in the form; e2e |
| Partner code sends `bag` after `open` | Ignored | the form's message rule; unit |
| Partner code sends `method` or `code` | Not in the list: dropped | `frame-messages.ts`; unit |
| Remove a line in the sheet, close, reopen the bag | The website's bag shows the change | `lines` → `bag.set`; e2e |
| Place an order, close, open the bag | Empty | `placed` → `bag.clear`; e2e |
| Pay online by UPI; Android discards the tab | The payment return lands on the order page; the website's bag is not cleared (documented until P6) | P3's return route; e2e note |
| Instagram's in-app browser taps Checkout | The full-page checkout | the server's refusal of `view=sheet`; e2e with the user agent |
| A refresh with the sheet open | The page reloads, sheet closed, bag kept | no history entry; e2e |
| `sheet.js` blocked or failing | The bag link, full page | `<CheckoutButton>`'s link; e2e |
| The form takes over 8 s | Try again, Open checkout as a page | `sheet.js`'s timer; e2e |
| 25k sessions an hour at one shop | ≈ 4 statements per bag open; pricing per Checkout tap; limits hold | `frameIp`, the per-shop ceiling; load note |

## Practices recorded in skills (when the owner approves; versions bumped in the same commit)
- `frata-design-language` (shop reference): the checkout sheet's motion table (§ 5) and that the secure form draws all of
  checkout; a host script beside partner code is untrusted UX.
- `frata-architecture`: a standalone script is built by the one table-driven script; `/_frrata/v1/*` is Frrata's
  reserved path on one-address hosts.
- `frata-storefront-api`: `shop.bag` carries the host's URLs; null is the kill switch.
- `frata-gotchas`: moving an iframe in the DOM reloads it; iOS raises no keyboard on a focus that arrives by message.

## Phase and tasks (P3s, after P3, shipped with P5)
**Regression net first:** e2e `10-checkout`, `secure-frame` (P3·9), `one-address` (P5), `92-storefront-sale`,
`12-security`; unit tests for `frame-messages.ts`.
| # | Task | Verify |
|---|---|---|
| S·0 | Owner approves the mockup and calls 1–9; P3's plan amended for one layout (P3·5, P3·6, P3·6b); `api-contract-reviewer` and `design-system-reviewer` on the amended plan | the reports |
| S·1 | `frame-messages.ts` (hand-written): page → form `bag` (before `open`), `open`; form → page `ready`, `lines`, `placed` {nonce}, `close`, `failed`; tests that nothing else passes and nothing personal, numeric about the order, a method or a code is carried | `npx vitest run src/domains/checkout` |
| S·2 | The form's sheet variant: the top bar, handle and swipe inside; Your bag with the stepper and Remove (sends `lines`); the legal block at its foot; Place order behind IntersectionObserver v2 (≥ 800 ms) or Deliver here; bag frozen after `open`, a change holds Place order 1 s; no price or prefill until `open`; refused for decision 20's browsers; `frameIp`, the per-shop ceiling and the reprice limits; `no-referrer` on `/checkout` and `/orders` | `npm run e2e -- --only checkout-sheet,secure-frame,security` |
| S·3 | `src/sheet/` → `/_frrata/v1/sheet.js` and `sheet.css` (≤ 4 kB, `check:sheet-script`, no `zod`; the one build script): closed shadow root, `<dialog>`, open from the button's box, close, the 8 s failure state, the toast, warm form, field data; routing in `host.ts`, the middleware and `next.config.ts` | `npm test`; `npm run e2e -- --only checkout-sheet` |
| S·4 | `shop.bag` `{ script, sheet }` (additive in `2026-12`; docs § Bag link); the kit's `<CheckoutButton>` (`onLines`, `onPlaced`), `bag.clear()`, `<BrandStyle>` fonts from Frrata media; `kit-sync` | `npm run check:api`; `cd kit/starter && npm run check && npm run build` |
| S·5 | e2e `checkout-sheet`: § Stress tests, phone and computer, warm and cold | `npm run e2e -- --only checkout-sheet` |
| S·6 | The pilot: House of Ayuda's Checkout through `<CheckoutButton>`; `mockup-parity-reviewer` on the build | the report |

## Out of scope
The sheet on theme stores; partner-styled sheet edges; a checkout before the bag (Buy now opens the bag first, then the
sheet); saved cards.

## Owner decisions (each with a recommendation)
1. **The motion:** the sheet rises from the Checkout button, the pay bar landing where the button was (recommended).
2. **Computer:** a 560 px panel at the right, fading in (recommended), rather than a centred box.
3. **Phone:** full height with an 8 px strip of the page above and a handle (recommended).
4. **The confirmation:** in the sheet, Continue shopping back to the same page; the order page stays for the receipt and
   WhatsApp links (recommended).
5. **Where the host lives:** served by Frrata on the brand's address, so a fix reaches every website within minutes;
   the kit gives one button (recommended).
6. **When:** with one address (P5) (recommended). Until then the pilot keeps the bag link to the branded checkout page
   (P2).
7. **Accepted finding row 3, re-raised** ("orders are placed only by the shopper's own tap"): accept again **with** the
   form's visibility proof (IntersectionObserver v2 for 0.8 s, or Deliver here where the browser lacks it) and the bag
   frozen once checkout opens (recommended).
8. **What the website learns:** only that an order was placed, so it can empty its bag; never the number, amount or
   address (recommended: accept; P6 removes even this).
9. **One checkout layout (amends approved P3):** the secure form draws all of checkout, on the full page and in the
   sheet; Frrata's page around it only hosts it (recommended). The approved P3 split put the bag lines, the method and
   the code in Frrata's page shell; in the sheet that page is the partner's.

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
