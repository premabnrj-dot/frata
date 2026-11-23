# One address, one bag, one brand record: the build
Status: active (approved, owner, 2026-11-16: "approve all" (decision page https://claude.ai/artifact/ChPS16kSEiabXz4J5Q7ALT)) · Spec: `docs/specs/2026-11-16-one-address-checkout.md` (active) · Record: ADR-0019 (accepted)
· Date: 2026-11-16
**Mockup:** approved (owner, 2026-11-16: "all mockups approved"): P1 https://claude.ai/artifact/BtzqpF9M1dgpPubunSHyEw,
P2 https://claude.ai/artifact/TWvK4wN8s7eUAS1fDJyBzp, P3 https://claude.ai/artifact/VAND3HpPwsd5MvkjBuWnFA, P5 (with V2a)
https://claude.ai/artifact/4dn3tMbA4H6JemWtAcQn4b; P6 the pilot's own, still to draw; P0 and P4 none, no screen. Files in
`docs/mockups/2026-11-16-*.html`. The calls and the four reconciliations: `docs/plans/2026-11-16-execution.md`
**Approved:** owner, 2026-11-16 ("approve all"; mockups "all mockups approved"). Order of work: `docs/plans/2026-11-16-execution.md`
**Review:** security-reviewer FIX BEFORE MERGE (4 high, 7 medium, 7 low, 2 notes), all folded in, 2026-11-16
**Review:** tenancy-auditor FIX BEFORE MERGE (6 high, 3 medium, 4 low, grants), all folded in, 2026-11-16
**Review:** architecture-reviewer CHANGES NEEDED (2 blockers, 12 majors, the minors), all folded in, 2026-11-16
**Review:** speed-reviewer OVER BUDGET as planned (3 high, 5 medium, 5 low), all folded in, 2026-11-16
**Review:** unit-economics-reviewer NEUTRAL for merchants, HURTS Frrata unpriced (7 findings), all folded in, 2026-11-16
**Review:** api-contract-reviewer CHANGES NEEDED (1 blocker, 9 majors, 5 minors), all folded in below (§ API contract review), 2026-11-16
**Review:** integration-researcher: 4 facts change the plan (COOP unsupported in Android WebView; WebKit's 7-day CNAME cap; header allowlists by `ninc`; Vercel adds the shopper's IP on external rewrites), all folded in below (§ Integration facts), 2026-11-16
All five reviews above ran independently as separate agents on 2026-11-16; every finding is folded into the spec, this
plan and ADR-0019. Nothing below is built before its phase's mockup is approved, the owner's decisions it names are made,
and its own reviews (each phase's list) have run on its diff (ADR-0001).
P0 is a bug fix (frata-planning § When this applies): it needs decision 2 and `security-reviewer` on its diff, no mockup.

## Order and lanes
Lanes as in `docs/plans/2026-11-15-parallel-lanes.md` (**A** hosting, **B** API and data, **D** the agent) plus **E**,
checkout, new here. One lane released at a time; phases in different lanes may run at once.
| Step | Phase | Lane | After it | Needs first | Mockup |
|---|---|---|---|---|---|
| 0 | **P0 Bag link fix** | E | the pilot's checkout shows exactly the site's bag | decision 2 | none (bug fix) |
| 1 | **P1 One brand record** (replaces Studio BT) | B | code-site stores' logo, palette and type saved once, one writer, read everywhere | decisions 8–11, 17, 19 | **new:** Console › Brand |
| 1 | **P4a Cross-store hardening** | A | no `Domain` cookie; `__Host-` names only; fetch metadata logged, then enforced | — | none |
| 1 | **P4b PSL listing** | A | each `<store>.frrata.shop` its own site where browsers carry it | P4a; decision 4 | none |
| 2 | **P2 Checkout and order pages in the brand's design** | E | the pilot's checkout, bag-link and order pages in House of Ayuda's look, on today's hosts | P1; decisions 12–14 | **new:** the pages; Console › Brand › Checkout |
| 3 | **P3 The secure frame** | E | shopper data only in Frrata's frame | P2; P3·1 spike; decisions 3, 15, 24 | **new (states)** |
| 4 | **P5 One address** | A | site and checkout on one host | V2a·1, ·5, ·6; P2; P3 (any store with real shoppers); P4a; P5·0; P5·1 spike; decisions 1, 5, 6, 7, 16, 20–23, 25 | **new:** Settings › Website; we'll be back |
| 5 | **P6 One bag** | B | the site uses Frrata's bag | P5 | the pilot's bag drawer |
| 6 | **P7 Studio designs checkout** | D | checkout design in Studio's pane | P2; Studio V3b | approved one screen + Checkout tab |
**Proof blocks** in `scripts/verify/tenancy.sql`: § 98 (P1), § 99 (P2), § 100 (P5's predicate and keys; § 81 and § 86
rewritten). § 87 and § 88 are taken (0150, 0151); the Studio plan's blocks are renumbered (2026-11-16: V2a § 90, BT's number, freed
by P1's § 98; C1 § 89, V3a § 91 to V3d § 96 unchanged). **New e2e flows** take the next free numbers at build (93 and 95
are taken; the Studio plan's `93-site-hosting` is renamed `site-hosting`).
**Spikes have pass/fail lines,** written in each.

## P0 · Bag link fix (lane E)
- **After it:** a bag link replaces a bag that only links filled and joins a bag the shopper built on the store's own
  Frrata pages, whatever the referrer.
- **Mockup:** none.
- **Regression net (before the change):** e2e `92-storefront-sale`, `10-checkout`, `47-offers` (the gift button),
  `67-ekcode`; the unit tests of `cart-link.ts`.
| # | Task | Verify |
|---|---|---|
| P0·1 | `src/domains/checkout/bag-fill.ts` (pure): `fillMode({ by, empty, fromSite })` → `replace` \| `join`; a test per row (link-made, shop-made, empty, stripped referrer, same-site referrer) | `npx vitest run src/domains/checkout` |
| P0·2 | `bag-store.ts`: `frrata.bag.by.v1` written inside `write()` from the caller's kind: `link` (the bag link), `shop` (theme product page, bag drawer), `keep` (checkout's reconcile, the gift button, and from P2 checkout's Remove and stepper); `shop` stays until `clear` empties it or a link from the store's own website replaces the bag; every writer names its kind (no default); page-only fallback as the bag's. `cart-link.tsx` calls `fillMode` | `npm test`; `npm run typecheck` |
| P0·3 | e2e `92-storefront-sale` gains: hand off two lines, remove one and change the other on the site, hand off again → checkout shows the site's bag; the same with no referrer; a theme-page bag then a link → joined; the gift added at checkout then a new link → replaced | `npm run e2e -- --only storefront-sale,checkout,offers,ekcode` |
| P0·4 | The pilot's `docs/design/deviations.md` notes "the site's bag stays full after an order until P6" | read the file |
- **Reviews:** `security-reviewer` (L1 narrowed), `impact-reviewer`.
- **Owner decisions:** 2.
- **Cost:** about 20 lines in two files, one pure module and tests, four e2e steps; no migration, no API change.

## P1 · One brand record (lane B; replaces Studio plan BT)
- **After it:** a code-site store's logo files, palette, type, radius and density are saved once by one writer, read by the
  console, checkout (P2), emails, documents, share images, the API and the site; a site that ships its own logo or colours
  fails its check; House of Ayuda's logo is in its record. Theme shops unchanged.
- **Mockup:** **new**, Console › Brand, phone first: logo files (primary, mark, stacked, reversed), palette roles with each
  pair's contrast as a chip, fonts from a list, radius scale, density, a preview strip on sample data (header, a product
  card, the pay bar, an email header). States: no logo, uploading, a file refused (why, at the field), a pair below contrast
  (named at the field), saved, Undo, **waiting for the owner** (a partner's change on an open store) and the owner's Inbox
  line with Approve, no permission (a Builder sees the preview only), support visit read-only, phone.
- **Regression net:** e2e `05-shop-look` (theme shops unchanged), `10-checkout`, `60-documents`, `64-seo`, `71-email`,
  `86-builders`, `91-storefront-api`, `92-storefront-sale`; `npx vitest run src/domains/themes src/domains/storefront-api`.
| # | Task | Verify |
|---|---|---|
| P1·1 | `src/domains/brand/`: roles, type, radius scale, density, seasons; `check.ts` (contrast via `src/domains/themes/contrast.ts`, sizes, fonts); `lines.ts` (lengths; refuses UPI IDs, phone numbers, URLs and runs of 6+ digits); `accentOf` | `npx vitest run src/domains/brand src/domains/themes` |
| P1·2 | Migration: `brand_tokens` and `brand_seasons` (typed columns; `logo_mark_url`, `logo_stacked_url`, `logo_reversed_url` each CHECKed to `tenants/<t>/brand/`; `previous jsonb` for Undo); `shop_settings.logo_url` gains the same folder CHECK (existing rows checked first). Grants: `frata_app` select, insert, update (delete on `brand_seasons`); `tenant_rows` policy, no null branch; `revoke all … from anon, authenticated, service_role`; `frata_admin` none; `frata_builder` select on named columns under `builder_rows` and `builder_only`; `shop_settings` gains `frata_builder` select on `(tenant_id, logo_url, doc_logo, accent, display_font)` only. Proof § 98 (cross-tenant reads and writes, the Builder's columns, the CHECKs). **As built:** also `brand_proposals` (a partner's waiting change, one open a store, decided once) and `app_brand_notice` (Deviations) | `npm run verify:tenancy`; `npm test` (`check:tenant`, `check:capabilities`) |
| P1·3 | `src/lib/queries/brand.ts`: `shopBrand`, a `shopCached` loader of scope `settings` (tag `shop:<t>:settings`, shared with `shopFor`). `src/lib/content/save.ts` `saveBrand`: the **only** writer of the record and of `logo_url` (today's `settings.brand.logo` action calls it), `asMember(CAN_BUILD)`, Zod with caps, the check, the previous record kept, Activity row, purging `shop:<t>:settings` only
(today's logo save purges the whole `shop:<t>`); on an open store a save by anyone but the owner or a Manager is stored as a proposal waiting for the owner's yes (one Inbox line, Approve or Decline) | `npx vitest run src/lib/content`; `npm run e2e -- --only brand` (new flow) |
| P1·4 | Logo files: raster as today; SVG through an allowlist cleaner (elements and attributes; no script, `foreignObject`, event attributes, external references) and only ever shown through `<img>`; a PNG rendition of the primary by `sharp` at `tenants/<t>/documents/<sha256>.png`, read by documents and emails when `doc_logo` is empty (`doc_logo` stays the owner's upload) | `npx vitest run src/lib/media src/lib/documents`; `npm run e2e -- --only documents,email` |
| P1·5 | Readers for code-site stores: console header and previews, emails (`layouts.ts`, `compose.ts`), share cards and icons. Theme shell not edited | `npm run e2e -- --only email,seo,shop-look` |
| P1·6 | API: `shop.brand` (additive on `2026-12`; a future season never served; `updated_by` never); `shop.logo` unchanged | `npm run check:api`; `npx vitest run src/domains/storefront-api` |
| P1·7 | Kit: `<Logo>` and `<BrandStyle>` in `@frrata/ui`; the starter's `npm run check` fails logo files, a header SVG instead of `<Logo>`, colours or fonts not from the variables; the partner skill's rule; `node scripts/kit-sync.mjs` | `cd kit/starter && npm run check && npm run build`; `npm run e2e -- --only storefront-sale` |
| P1·8 | Console › Brand as drawn | `npm run e2e -- --only brand`; `mockup-parity-reviewer` |
| P1·9 | The pilot: decision 8 applied; the site reads `shop.brand` through the kit; its own logo files deleted | in `mokobara`: `npm run check && npm run build` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer` (SVG, the approval path), `speed-reviewer`,
  `api-contract-reviewer`, `design-system-reviewer`, `words-reviewer`, `mockup-parity-reviewer`, `impact-reviewer` per task.
- **Owner decisions:** 8, 9, 10, 11, 17, 19.

## P2 · Checkout and order pages in the brand's design (lane E)
- **After it:** for code-site stores, checkout, the bag-link page, order pages and policies draw the brand record and
  checkout design; partners set the design in Console › Brand › Checkout on sample data; checkout lines gain Remove and a
  stepper. On today's hosts, so the pilot's checkout at `testing.frrata.shop` looks like House of Ayuda now.
- **Mockup:** **new**: checkout (empty bag, Pay on delivery not offered, a sold-out line, a changed price, a failed
  payment, a code applied and refused), the bag-link page, the order page (placed, paid, waiting, on its way), a policy page,
  in House of Ayuda's design at 390 and 1280 px; Console › Brand › Checkout (header and footer variant, trust blocks, two
  lines with counters, the preview, waiting for the owner). Opens per frata-planning § Step 4 with today's theme checkout
  screenshotted in the audit.
- **Regression net:** e2e `10-checkout`, `47-offers`, `50-order-page`, `64-gst`, `67-ekcode`, `69-delivery-zones`,
  `77-order-edit`, `92-storefront-sale`; `check:size`.
| # | Task | Verify |
|---|---|---|
| P2·1 | Migration: `checkout_design` (one row a store: header variant, back link, footer variant, trust blocks text array CHECKed to a closed set, two lines with length CHECKs, `previous jsonb`, `updated_by`, `updated_at`); grants as P1·2 (`frata_builder` named-column select); proof § 99 | `npm run verify:tenancy` |
| P2·2 | `src/domains/brand/checkout.ts`: closed sets, trust words derived from the store's facts, the render-time fallback | `npx vitest run src/domains/brand` |
| P2·3 | Checkout, bag-link, order and policy pages read `shopBrand` and the design (props, never the theme) for code-site stores; checkout's field label "Pincode" becomes "PIN code" (the glossary; `src/components/storefront/checkout.tsx:289`), its id and stored key unchanged; the bag-link page keeps no footer (P2 mockup, screen 1) | `npm run e2e -- --only checkout,order-page,storefront-sale,shop-look` |
| P2·4 | Checkout lines: Remove with Undo and a stepper (the drawer's pattern; `by` kind `keep`), re-priced by the quote. `checkout.tsx` is 398 of `check:size`'s 400 lines: split its lines block into its own component first. A sold-out line is drawn from the quote's problem lines with Sold out and Remove (today checkout hides qty-0 lines, `checkout.tsx:146`, and the shopper learns only after Place order is refused) | `npm run e2e -- --only checkout,offers` |
| P2·5 | The preview on sample data from pure fixtures, on the console host (the look preview's route pattern), every state; it is also where a site preview's Checkout lands | `npm run e2e -- --only brand` |
| P2·6 | Console › Brand › Checkout as drawn; saves through P1·3 | `npm run e2e -- --only brand` (checkout tab steps); `mockup-parity-reviewer`; `npm run check:words` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer`, `speed-reviewer`, `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 12, 13, 14.

**P2 as built (2026-11-22, lane E, branch `claude/lane-e-p2-checkout`):** P2·1 `drizzle/0161_checkout_design.sql`
(proof § 99; `brand_proposals` gains `kind`, one open change of each kind a store; the Builder also reads the store's
public delivery, returns and Pay on delivery facts, never the GSTIN). P2·2 `src/domains/brand/checkout.ts`
(`lineProblem` speaks screen 9's words). P2·3 `BrandFrame` with its rules inline (`brand-css.ts`), so the shop's
shared sheet keeps 15.9 kB for theme shops; the brand faces' `@font-face` (0.35 kB) have their own ceiling in
`check:storefront-build`. P2·4 `checkout-stepper.tsx`, its own chunk (checkout's first load stays ≤ 120 kB). P2·5 the
preview is drawn on Console › Brand › Checkout itself from the frame's own parts (`checkout-preview.tsx`, sample data in
`src/domains/brand/checkout-sample.ts`), not a framed route: no new framed path, no change to the middleware or
`next.config`; a site preview's Checkout landing waits for V2a's previews. P2·6 `/console/brand/checkout`, saving through
`saveCheckout` (beside `saveBrand`); `decideBrand` answers either kind from Notices.

## P3 · The secure frame (lane E)
- **After it:** on code-site stores, phone, email, name, address, PIN code, GST fields, EkCode, the priced summary, Place
  order, the reload copy, the pending order, the order token and the order's personal details live only in the frame on
  `secure.<store host>`. The brand origin keeps the bag, its `by`, the code and public data.
- **Mockup:** **new (states):** the frame loading, failed ("We couldn't load the secure form." with Try again), EkCode in a
  popup (EkCode's own look), the frame's summary with **Place order · ₹<amount>**; the rest as P2's. Approved with
  (owner, 2026-11-16, "all mockups approved"): the online button keeps today's **Pay · ₹<amount>** (Place order · ₹ on
  delivery); the computer layout is P2's one 560 px column with the frame inside it, under Your bag and How you'll pay
  (P3's drawing put the frame left and the bag right; P2 is the layout, P3 drew states).
- **Regression net:** e2e `10-checkout`, `50-order-page`, `64-gst`, `67-ekcode`, `77-order-edit`, `12-security`.
| # | Task | Verify |
|---|---|---|
| P3·1 | **Spike, one week** (`integration-researcher` first). Pass/fail: (a) Razorpay Checkout from a same-site frame completes UPI intent, card and netbanking on Android Chrome, iPhone Safari, Instagram's and WhatsApp's in-app browsers, else Razorpay opens from the page with the contact in memory only; (b) EkCode's popup returns to the frame by `postMessage` to the exact origin in all four; (c) the frame's `__Host-` cookie survives a day in WebKit; (d) Vercel issues `secure.<store>.frrata.shop` and `secure.<brand domain>` certificates; (e) COOP `same-origin` or `same-origin-allow-popups` severs a partner page's handle in all four browsers, else decision 20; (f) a cold checkout with the frame on a mid phone over 4G is within 300 ms of today's checkout at p75 | the spike's dated report, read by the owner |
| P3·2 | `secureHostOf` (pure, tests: one strip, the rest must route as `shop`, two-label and odd hosts refused); `routeFor` kind `secure`, `secure.*` out of `shopRewrites`, `/secure/*` a 404 on every host; `secure` in `RESERVED` (`slug.ts`); `checkDomain` and a `shop_domains` CHECK refuse a first label `secure`; tenant from `hostFacts(stripped)`; `[host]` checked equal to the Host | `npx vitest run src/domains/tenancy src/domains/addresses src/domains/signup`; `npm run check:tenant`; `npm run verify:tenancy` |
| P3·3 | `requireSecure`: exact Origin on non-GET; `Sec-Fetch-Site` absent or `same-origin`; the frame page refuses `Sec-Fetch-Dest: document`; the shop's per-IP limits | `npx vitest run src/lib/auth` |
| P3·4 | One handler set mounted under `/api/shop/*` (theme shops) and `/api/secure/*` (frames): price for an address, place, view, pay, retry, switch, change, invoice, EkCode, email opt-in; on one-address hosts the personal `/api/shop/*` routes 404 | `npx vitest run src/app/api`; `npm run e2e -- --only checkout,ekcode,order-page` |
| P3·5 | `src/domains/checkout/frame-messages.ts`: page → frame: bag ids and quantities, method, code; frame → page: delivery fee or zone name, height, order number, a failure code; never a personal field, PIN code or token. The frame: renders nothing unless framed; accepts only `event.source === window.parent` from the exact store origin; sends only to that origin, never `'*'` | `npx vitest run src/domains/checkout` |
| P3·6 | The frame page (`src/app/secure/[host]/`), decision 24: a server-rendered form plus one standalone script built like `fe.js` (`src/frame/`, built to `public/frame.js`), ≤ 25 kB gzipped; the fields from one list shared with the page checkout (`src/domains/checkout/fields.ts`); rendered per request with a nonce and `default-src 'none'` (Razorpay's hosts if P3·1(a) passes), `frame-ancestors` the store's host from the Host string, `private, no-store`; the bag from its URL in the bag link's grammar (`parseCartLink`) so it prices on first render; the font from one absolute Frrata media URL, no preload; reads through cached loaders outside the transaction (module facts in a `shopCached` loader) and one `withTenant` for the shopper's own reads, ≈ 4 statements a render; its own tab storage | `npm run check:frame-script` (new gate: size ceiling, stale build, no cost field, no `'*'` target); `npm run e2e -- --only checkout,ekcode` |
| P3·6b | The one-address checkout page: the `<iframe>` in its server HTML with the bag in the frame's URL, a preconnect to `secure.<host>`, its own bundle with the bridge only (no form code) under 120 kB first load | `npm run build` (`check:storefront-build` gains the one-address checkout's budget); `npm run e2e -- --only speed` |
| P3·7 | EkCode's cookies move to the secure host (`__Host-`, `SameSite=Lax`, HttpOnly); the `shop_in` hint goes; one cookie module taking the host kind | `npx vitest run src/lib/ekcode`; `npm run e2e -- --only ekcode` |
| P3·8 | `check:storage` (new gate): brand-origin checkout code writes only `frata.bag.v1`, `frrata.bag.by.v1`, the code and attribution keys; run against its own documentation file too | `npm test` |
| P3·9 | e2e (new flow `secure-frame`): a brand-origin page opens and frames `/checkout` and `/orders`, fetches the secure host, reads tab storage after an order, frames the secure host after `pushState('/checkout')`, posts every non-schema message from itself and from a child frame: each reads nothing | `npm run e2e -- --only secure-frame` |
- **Reviews:** `security-reviewer` (and a person's review), `tenancy-auditor`, `architecture-reviewer`, `speed-reviewer`
  (the frame's bytes and statements, the checkout bundle), `unit-economics-reviewer` (H-3), `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 3, 15, 24; 20 if P3·1(e) fails.

## P4a · Cross-store hardening (lane A)
- **After it:** no cookie under `frrata.shop` carries `Domain`; store and secure hosts read only `__Host-` names;
  `Sec-Fetch-Site` refused when present and not `same-origin` on personal and state-changing shop routes.
- **Mockup:** none.
- **Regression net:** e2e `10-checkout`, `67-ekcode`, `12-security`, `52-addresses`, `53-domains`.
| # | Task | Verify |
|---|---|---|
| P4a·1 | `check:cookies` (new gate) scoped to `src/app/s`, `src/app/secure`, `src/app/api/shop`, `src/app/api/secure`, `src/lib/ekcode`: host-only, `__Host-` names; `shop_in` allowed until P3·7; local e2e's plain names as today; also `document.cookie` and `cookieStore` writes in the shop's client code (`src/components/storefront`, `modules`, `ekcode`; impact review) | `npm test` |
| P4a·2 | `requireShop` and `requireSecure`: log a week, then refuse `Sec-Fetch-Site` present and not `same-origin` on personal and state-changing routes (absent passes: iOS before 16.4, `require-ek.ts:26`'s rule); exemptions named in the code: EkCode's return GET (a cross-site navigation), the beacon `/api/shop/e` | `npx vitest run src/lib/auth`; `npm run e2e -- --only checkout,ekcode,security` |
| P4a·3 | e2e (new flow `cross-store`): store Y's page sets large and many `Domain=frrata.shop` cookies and posts to store X; X ignores them and refuses the post; the eviction case recorded as the residual | `npm run e2e -- --only cross-store` |

**P4a·3 as built (2026-11-16, e2e `94-cross-store`):** Y's `__Host-` cookies refused; Y's forged session and state sign nobody in; Y's POSTs refused (Origin); a same-site GET logged (log mode) and EkCode's return exempt, proven with the header sent straight to the app, since Chromium sends `Sec-Fetch-Site` only to https or localhost and the stack's shop host is http. Local limits: the stack's plain names do reach X (production reads `__Host-`, held by `check:cookies`). Residuals until P4b, observed in Chromium: 200 Domain cookies from Y **evict** X's host-only session (the shopper is signed out); 12 Domain cookies of 4 kB make X answer **431** (a cookie bomb). Accepted as row 4 of `docs/decisions/accepted-findings.md` until P4b.

**P4a notes (orchestrator, 2026-11-16):** *Done:* `GET /api/shop/ekcode/start` is refused from another site already in log mode (`FETCH_SITE_ENFORCED_NOW`, security review LOW-4; its refusal is a 303 to checkout). *Open, decide with P3·7:* a nameless cookie `=__Host-shop_s=…` set with `Domain` by a sibling store may reach X as a second `__Host-shop_s` in browsers that still send it (unconfirmed in Safari and old WebViews; current Chrome and Firefox refuse it), and Next keeps the last duplicate. The fix would be `sessionToken()` refusing a Cookie header that carries the name twice, a named exception to `check:cookies`' ban on reading the raw Cookie header (security review LOW-5).
- **Reviews:** `security-reviewer`, `impact-reviewer`.

## P4b · `frrata.shop` on the Public Suffix List (lane A; the owner acts)
- **After it:** each `<store>.frrata.shop` is its own site in browsers that carry the listing.
- **Mockup:** none.
| # | Task | Verify |
|---|---|---|
| P4b·1 | Before the PR: `_dmarc.notify.frrata.shop` exists, or notices move to the frratamail domain (the owner's mailing domain); a per-store `p=reject` DMARC answer for `<store>.frrata.shop`, or the reason none is needed (unconfirmed today); no Frrata host under `frrata.shop` sets a cookie but the secure host's own; Vercel and Let's Encrypt unchanged for the wildcard | `dig +short TXT _dmarc.notify.frrata.shop`; `npm test` (`check:cookies`) |
| P4b·2 | The owner renews `frrata.shop` to 3 years, adds `_psl.frrata.shop` TXT with the PR's URL, opens the PR on the automated template (PRIVATE section, Frrata's header, the reason) | `dig +short TXT _psl.frrata.shop`; the PR's URL in `docs/setup.md` |
| P4b·3 | Once merged, `docs/setup.md` and frata-integrations § Domains carry the date; a quarterly line on which stable Chrome, Firefox and Safari carry it | the dated lines |
- **Reviews:** `integration-researcher`.
- **Owner decisions:** 4.

## P5 · One address (lane A)
- **After it:** a store whose predicate is `one_address` serves the site for every GET outside the reserved paths;
  Frrata's app answers those paths first-hand; a public key answers for it; `siteOrigin` equals `checkoutOrigin`.
- **Needs first:** Studio plan V2a·1 (`sites`, `site_deployments`), V2a·5 (the fleet), V2a·6 (the gate, which creates
  `src/domains/sites`); P2; P3 for any store with real shoppers; P4a; P5·1.
- **Mockup:** **new:** Settings › Website (one address; Connect my domain with the host and `secure.` records and each
  record's state: waiting, proved, certified; the site's state: building, live, paused, maintenance); the we'll be back page.
- **Regression net:** e2e `52-addresses`, `53-domains`, `91-storefront-api`, `92-storefront-sale`, `10-checkout`,
  `12-security`, `95-speed`; `node scripts/verify/api-isr.mjs`; proofs § 81 and § 86.
| # | Task | Verify |
|---|---|---|
| P5·0 | **An afternoon, before the spike** (unit-economics review): the owner reads Vercel › Settings › Billing for the `frata` team (Flat Rate CDN on or off, which tier; decision 23) and `vercel billing usage`; a HAR of 20 page views on the pilot's production build (https://mokobara-mu.vercel.app), first and repeat views, counting same-origin requests outside `/_next/static` as documents, RSC navigations and prefetches. Pass: the numbers replace H-2's guesses (requests and bytes a view) | the HAR's counts and the billing tier written into the spec's § Unit economics with the date |
| P5·1 | **Spike, one week.** Pass/fail: (a) project-level routing rules on `frata` rewrite a host's non-reserved GETs to a protected deployment with a bypass header, delete `cookie` and `authorization`, forward only the allowlist, and drop every upstream `Set-Cookie`; (b) response headers can be allowlisted by rules or middleware, else (k) applies (decision 21); (d) proxied caching keyed by host and honouring `Vary` and RSC, else caching stays off; (e) added TTFB p75 ≤ 30 ms on the document, with p95 and a cold edge miss recorded; (f) requests and bytes billed on each project for 1,000 views, RSC requests a view counted with prefetch on and off (H-2); (g) the cache key holds host, path, `rsc`, `next-router-state-tree`, `next-router-prefetch`, `next-router-segment-prefetch` and `_rsc`, matching the upstream's `Vary`, else caching off; (h) LCP with the site's assets on its own origin plus a preconnect against assets proxied as immutable: the faster wins; (c) rules a project measured, and the store count at which the router moves to middleware with Edge Config fixed; (i) Edge Config's size at 750 hosts (≈ 110 kB estimated) and its read cost; (j) bfcache restores a site page after a COOP-different checkout page (S3), else `pageshow` alone is relied on and written down; (k) a header-filtering fallback that runs at the edge, if (b) fails | the spike's dated report; numbers into H-2 |
| P5·2 | Migration and definer `app_website_of(tenant)` (`search_path ''`, revoked from public, anon, authenticated, service_role; granted to `frata_app`); `app_storefront_key`, `app_site_origin_check` and its trigger rewritten on it; grants re-run; pure mirror `src/domains/addresses/website.ts`; proof § 100 and § 81, § 86 rewritten (one-address keys live; split stores unchanged; a removed deployment stops the key) | `npm run verify:tenancy`; `npx vitest run src/domains/addresses` |
| P5·3 | Every reader moved to the predicate: `siteMove` and `_meta.ts`, the sitemap's `elsewhere`, `apiShop`'s `siteOrigin` and `checkoutOrigin`, `cart-link.tsx`'s `site`, analytics' `own` (`source.ts`, landing-based on one-address stores), Settings › Website, Razorpay's website check, the D2·7 sweeps, Admin › Sites | `npx vitest run src/domains/analytics src/domains/addresses src/domains/storefront-api`; `npm run e2e -- --only storefront-api,storefront-sale,domains` |
| P5·4 | `src/domains/tenancy/reserved.ts` (the prefix rule, `%` and `//` to a 404, GET and HEAD only to the site). Migration: the platform row `site_routes_state` (dirty flag, dirty time, last read-back), no role grant, written only by `app_site_routes_dirty()`, called in every writer's transaction (publish, rollback, kill, partner removed or suspended, store opened, handover, domain added, proved, moved, failing, removed, `secure.` proved); the paged definer `app_site_routes(p_after uuid)` (hosts, `secure.` hosts, verified upstream, state; 500 a page; `search_path ''`; revoked from public, anon, authenticated, service_role; granted to `frata_app`); proof § 100. `src/lib/sites/routing.ts` `drainRoutes()`, its own lane (the writer's `after()` and its own 5-minute cron with a deadline, never the shared outbox drain): `pg_try_advisory_lock`, clears the flag, reads all pages, reads the live rules back, publishes **only differences**, reads back again, one trailing send if the flag was set meanwhile; the sweep the same and deletes strays; a removal never kept as last good; another store can't prove a host until the removal reads back; pause's from and until carried, or flipped by the boundary sweep; the token and bypass secret Production only, never in a row or a log | `npx vitest run src/domains/tenancy src/lib/sites`; `npm run verify:tenancy`; `npm run check:config`; a test marking 500 stores dirty makes one send |
| P5·5 | Headers, first Report-Only in waves (kit spec § 4), then enforced. Partner responses: `default-src 'self'` and the spec's T9 list, COOP `unsafe-none`, no COEP, the response allowlist (P5·1(b)); `Service-Worker: script` answered with a self-unregistering script. Frrata's pages on one-address hosts only: COOP (per P3·1(e)), `frame-ancestors 'none'`, `X-Frame-Options: DENY` | `node scripts/verify/one-address.mjs` (new: a header matrix by path, request headers seen by an echo upstream, two hosts' caches) |
| P5·6 | V2a·6's gate gains: absolute `assetPrefix` on the site's own deployment origin, no reserved path, no `next/link` into a reserved path, `prefetch={false}` on the kit's product and collection cards (decision 25), `images.unoptimized`, no service worker, no personal-data inputs (build output and a crawl), no `RTCPeerConnection` | `npx vitest run src/domains/sites`; `cd kit/starter && npm run check` |
| P5·7 | One address switches on only when the store's host and its `secure.` record are proved and certified; a removed domain stays parked while its `secure.` resolves to Vercel (D2·7 sweep) | `npm run e2e -- --only addresses,domains` |
| P5·8 | Settings › Website as drawn | `npm run e2e -- --only one-address` (new flow, its Settings steps); `mockup-parity-reviewer` |
| P5·9 | The pilot moves after P3 (decision 7): its deployment in `frrata-sites` (V2a·11) as the upstream of `testing.frrata.shop`; policies and checkout links become paths; 30 days of the router's cost recorded (H-2) | `curl -sI https://testing.frrata.shop/` (the site's response through the router); `curl -sI https://testing.frrata.shop/checkout` (Frrata's headers); `npm run e2e -- --only storefront-sale` |
| P5·10 | e2e (new flow `one-address`): a partner page opens and frames `/checkout`, registers a service worker, posts to a site path (405), sees no `cookie` upstream, is removed mid-session, the upstream answers 500, a pause starts with no event, two hosts never share a cached copy | `npm run e2e -- --only one-address` |
- **Reviews:** `architecture-reviewer`, `security-reviewer` (and a person's review), `tenancy-auditor`, `speed-reviewer`,
  `unit-economics-reviewer` (H-2 on P5·0 and the pilot's 30 days, the router counted in ADR-0017 rule 11's kill line),
  `api-contract-reviewer`, `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 1, 5, 6, 7, 16, 20, 21, 22, 23, 25.

## P6 · One bag (lane B)
- **After it:** the site reads and writes Frrata's bag through `/_frrata/v1/bag.js`; its drawer shows the quote's subtotal
  and sold-out lines; checkout clears the one bag; attribution captured on landing.
- **Mockup:** the pilot's own mockup (`mokobara/docs/mockups/house-of-ayuda.html`, the bag) redrawn with the quote's
  subtotal and sold-out lines, approved by the owner.
- **Regression net:** e2e `92-storefront-sale`, `10-checkout`, `47-offers`, `51-analytics`, `72-traffic`.
| # | Task | Verify |
|---|---|---|
| P6·1 | `/_frrata/v1/bag.js` from two entry files, `bag-store.ts`'s core and `capture-attribution.ts` (with `landing.ts`; capture left `bag-store.ts` on 2026-11-16): the same bytes on every host, ≤ 3 kB gzipped (1.4 kB measured), `Cache-Control: max-age=300, stale-while-revalidate=86400` (or a hashed name; never immutable on a fixed URL), loaded with `defer`; `get`, `add`, `set`, `remove`, `subscribe`, `quote()` (no PIN code); `pageshow` and `storage` re-reads; `captureAttribution(landingNow())` on load | `npm run check:bag-script` (new gate, `check:beacon`'s pattern: stale file, size ceiling, no cost field, no host-specific bytes); `npx vitest run src/components/storefront` |
| P6·2 | Kit: the bag button and drawer use it, quoting only while the drawer is open, one request in flight, never on `subscribe` or a `storage` event; `quoteIp` re-sized for many phones behind one 4G address; the starter's own bag removed; optional `shop.bag` in the API | `cd kit/starter && npm run check && npm run build`; `npm run check:api`; `npx vitest run src/lib/db` (the limit) |
| P6·3 | e2e (new flow `one-bag`): spec § 8 S1–S8, S11, S15 on one host, two tabs, a bfcache return, an order then back | `npm run e2e -- --only one-bag` |
| P6·4 | The pilot drops `lib/bag.ts`; its gaps G1 and G25 closed | in `mokobara`: `npm run check && npm run build` |
- **Reviews:** `architecture-reviewer`, `speed-reviewer`, `security-reviewer`, `api-contract-reviewer`, `e2e-runner`,
  `impact-reviewer` per task.
- **Owner decisions:** 25.

## P7 · Studio designs checkout (lane D)
- **After it:** Studio's pane shows checkout and the order page on sample data; hand edits and `tokens_propose`/`logo_propose`
  write through `saveBrand` (an open store's changes wait for the owner, as P1·3).
- **Mockup:** the approved one screen, plus a Checkout tab.
| # | Task | Verify |
|---|---|---|
| P7·1 | The pane's Checkout tab (P2·5's preview); Apply calls `saveBrand` | `npm run e2e -- --only studio` |
- **Reviews:** as Studio V3b.

## API contract review, folded in (2026-11-16; these override the task text above)
| Finding | Task | What is built |
|---|---|---|
| **B1** an open store's first production build can't read its store | P5·2, § 100 | The public key answers for **a code site at one address**: a `sites` row not ended and the store's host live and proved. It never depends on a deployment being live this minute or on the `secure.` certificate. `one_address` routing (the predicate) keeps its stricter test; the key's test is its own function beside it. Proof lines: an open store's first production build reads its shop; a failing `secure.` certificate, a kill and a deployment swap don't stop the key |
| M1 test key on a one-address store in build mode | P5·2, § 81, § 100 | A test key answers while the store has never opened and the website is `frrata` or `one_address`; for `elsewhere` only with its domain live, as today |
| M2 `checkoutOrigin` must not move | P5·3 | `checkoutOrigin` stays `https://<main host>` for every kind. Only `siteOrigin` derives from the predicate: `frrata` → null, `elsewhere` → `site_origin`, `one_address` → byte-identical to `checkoutOrigin`. One mapper test per kind. `StoreShop` gains `website: { kind, origin }` so `siteMove` can't redirect a host to itself; cache entry names bumped (`api-shop-v3`, `shop-v4`) |
| M3 the meaning of `siteOrigin` | P5·3 | Redefined in writing before it ships: the field's `.describe()` ("Where the store's website answers shoppers. Null when Frrata's own pages are the website. Equal to `checkoutOrigin` when site and checkout share one address."), `openapi.ts`'s info line, `docs.ts:38` and `:45`, llms.txt, the frata-storefront-api skill |
| M4 purges on a predicate change | P5·3, P5·4 | Every writer that moves the predicate calls `refreshShop(t, 'settings')` and `refreshKeys(t)` after commit; the drain's `app_shops_with_key_stop` and `app_shops_with_domain_gone` gain `site_deployments` start and stop times and the `secure.` state times (starts too: cached 404s). Verify adds `PERIOD=1 node scripts/verify/api-isr.mjs` |
| M5 `shop.brand` and the API's hour; seasons | P1·3, P1·6 | An `apiBrand` loader at `API_HOUR` on the `settings` tag (never the 60 s `shopBrand` in the API); `app_shops_with_boundary` gains `brand_seasons` start and end, purged as `settings`; an answered season carries `until` (nullable). Verify adds `PERIOD=1 node scripts/verify/api-isr.mjs` |
| M6 what the mapper receives | P1·3, P1·6 | The loaders select named columns only, never `previous`, `updated_by`, `updated_at` or a waiting proposal; `BrandIn` is a named pick of the live record without `checkout_design`; shoppers, emails, the API and the build-key tree read the live record only; a test pins `shop.brand`'s key set |
| M7 `shop.logo` stays raster | P1·4, P1·6 | `shop.logo` is the PNG rendition when the primary is SVG; SVG only inside `shop.brand` (primary, mark, stacked, reversed), each through `fromOurStore`, described "render through `<img>` only" |
| M8 `shop.bag` and `bag.js` are contracts | P6·1, P6·2 | `bag: z.strictObject({ script }).nullable().optional()`, non-null only on `one_address`, `settings` tag. `bag.js`'s `get`, `add`, `set`, `remove`, `subscribe`, `quote()` are a partner contract: `quote()` maps to its own strict schema for `v1` with a grow-only snapshot test; `/_frrata/v1/` frozen, a break is `/v2/` kept 12 months; documented in the docs and llms.txt |
| m1 readers missed | P5·3 | `siteOriginFor` (test tree's CORS, `src/lib/queries/storefront-api.ts:19`) and `app_my_handover_keys`' `site_host` move to the predicate |
| m2 shapes | P1·6 | Density an open `z.enum` (MAY_GROW); fonts an open enum or `{ family, url }` on Frrata media (a named allowance); radius `int().min(0).max(64)`; the eleven palette roles named hex fields, never a record; `brand` optional, always answered, null for theme shops |
| m3 the released snapshot | P1·6, P6·2 | No task edits or regenerates `__tests__/released/2026-12.json`; freezing additions is its own reviewed `UPDATE_API=1` commit, additions only |
| m4 docs per task | P1·6, P5, P6 | Field notes ("`logo` stays raster"); M3's lines and `cart`'s ("on one address a bag link from the site replaces the bag"); `shop.bag`'s; the kit's `lib/frrata.ts` types and `node scripts/kit-sync.mjs` in each |
| m5 `shop.status` | P5 | No new status value for maintenance or We'll be back: checkout keeps taking orders; the kit keeps the bag link when `shop.bag` is null |

## Integration facts, folded in (2026-11-16; integration-researcher; facts in frata-integrations; these override the task text above)
| Fact | Task | What changes |
|---|---|---|
| Razorpay documents nothing about Checkout in a frame; checkout.js builds its own frame with `allow="payment; otp-credentials; clipboard-write; publickey-credentials-get …"` | P3·1(a), P3·6 | The checkout page's `<iframe>` carries `allow="payment; otp-credentials; clipboard-write; web-share"` and the frame's own Permissions-Policy allows them (today `security-headers.ts:45` sends `publickey-credentials-get=()` everywhere: keeping passkeys off in the frame is decided in the spike, with `security-reviewer`). The frame's CSP ships Report-Only first with the hosts seen in checkout.js. **Ask Razorpay in writing** whether a frame is supported and whether a live key works from `secure.<host>` with only `<host>` registered |
| Instagram/Facebook in-app (Standard Checkout): UPI Intent and cards show; netbanking (a pop-up page) never does, framed or not | P3·1(a) | The spike's pass line in Instagram is UPI intent and cards; netbanking is out there for everyone |
| Android WebView turns `window.open` into a same-view navigation unless the host app allows windows; Razorpay says its pop-up doesn't appear in Instagram | P3·1(b), P3·7 | EkCode's popup gets a fallback planned now: the same tab to ekcode.in and back to `/checkout` (today's path), chosen when no popup handle comes back |
| COOP is not supported in Android WebView | P3·1(e), decision 20 | Likely the Android in-app browsers fail T1; decision 20 (approved: C5, no partner JavaScript there) is planned as the expected outcome on Android in-app browsers, the spike confirms by testing the real apps |
| WebKit caps cookies at 7 days when a subresource's CNAME differs from the top host's | P3·1(c), P5·7 | The `secure.` record matches the host's own (A for an apex; the same project CNAME for `www`); Connect my domain gives it that way; the spike tests a brand domain at day 8 |
| One domain and one certificate per `secure.` host; Let's Encrypt 50 a registered domain a week until the PSL listing | P3·1(d), P5·7 | Before the listing, new `secure.<store>.frrata.shop` hosts are issued at most 40 a week (a queue, oldest first) |
| vercel.json transforms allowlist headers by `ninc`; external rewrites add `x-real-ip` and `x-forwarded-for` | P5·1(a), (b), (k) | The spike tests `ninc` in project rules first, and whether the shopper's IP can be removed before it reaches a partner's deployment; if not, a DPDP note and decision 21's fallback. The `frata-gotchas` practice line "a rule deletes headers by name only" waits for the spike |
| PSL template asks for distinct users in thousands (2,000–3,000) | P4b·2 | The PR may be declined while Frrata is small; P4a's hardening is the control until then |

## Practices recorded in skills (once the owner approves; versions bumped in the same commit)
| Skill | Practice |
|---|---|
| `frata-architecture` | One address (ADR-0019): reserved paths in `reserved.ts`; the brand origin holds no secret and no shopper data; personal routes only on the secure host through `requireSecure`; tenant from `hostFacts(secureHostOf(host))`; `Sec-Fetch-Site` absent or `same-origin`; no `Domain` cookie; one predicate `app_website_of`; routing written only by the app's single-flight sender, read back, failing closed |
| `frata-storefront-api` | `siteOrigin` equals `checkoutOrigin` on one address; `shop.brand`; the bag link's same-origin replace |
| `frata-design-language` | Checkout draws the brand record for code-site stores; what a partner may set (spec § 3); the two lines; waiting for the owner on open stores |
| `frata-integrations` § Domains | `frrata.shop` on the PSL (status, date); `secure.` records and certificates; routing rules' measured limits |
| `frrata-site` (kit skill) | Never draw a logo or set brand colours in code; read `shop.brand`; use `bag.js`; absolute `assetPrefix`; plain `<a>` into Frrata's paths; no service worker, no personal inputs |
| `frata-gotchas` | `/_next/*` on a one-address host is Frrata's; routing rules run before the deployment's routes; a rule deletes headers by name only |

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Headers, forwarded request headers and caches on a one-address host | `scripts/verify/one-address.mjs` (P5·5) |
| No `Domain` cookie, `__Host-` names only | `check:cookies` (P4a·1) |
| Nothing personal in brand-origin storage | `check:storage` (P3·8) |
| `bag.js` stale, too big or host-specific | `check:bag-script` (P6·1) |
| The frame's script stale, too big, or posting to `'*'` | `check:frame-script` (P3·6) |
| Counting requests a page view on a site (documents, RSC, prefetch) | a HAR script, `scripts/verify/view-requests.mjs` (P5·0, reused in P5·1 and the pilot's 30 days) |
| A site's own logo, colours, personal inputs, reserved paths | the kit's `npm run check` and the publish gate (P1·7, P5·6) |
| Which browsers carry the PSL listing | a quarterly line by `integration-researcher` (P4b·3) |

## Deviations (BUILT AS DRAWN; for the owner before a phase ships)
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| Screens 4–5: the waiting change and its Notices row (Needs you, Approved, Declined) | P1·2 adds a third table, `brand_proposals` (one open a store, decided once, its outcome kept), with `app_brand_notice`; the plan's row named two tables and a proposal kept on the record | A row that keeps each change's outcome is what lets the Notices row read Approved or Declined after the fact, as drawn; the screen is unchanged | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| Screen 6: a Builder's sidebar drawn with the owner's whole menu (Orders, Notices, Analytics …) | A Builder's sidebar holds its own pages only: Products, Collections and Brand | ADR-0015: a Builder never sees orders, notices or analytics; the mockup reused the owner's sidebar | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| Screen 6: the Builder's invoice preview with the legal name, address and GSTIN | The store's name only | frata_builder holds no grant on the legal details (ADR-0015 column list); the rest of the preview is as drawn | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| Screen 5: the Notices row's chips (Needs you, Approved, Declined) | Also "Replaced" when a newer save took a waiting change's place | A partner may save again while a change waits (screen 4's "A new save replaces the waiting one"); the old row needs a state | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| Logo slot's tag (drawn: SVG) | SVG, WebP or JPEG, by the stored file | A PNG is stored as WebP by the photo pipeline (the browser makes the sizes); the tag names what is stored | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| P1·7: `<Logo>` and `<BrandStyle>` "in `@frrata/ui`" (plan text; no screen) | In the starter, `kit/starter/components/frrata/{logo,brand-style}.tsx`, exempt by name from its own check | No `@frrata/ui` package or publishing pipeline exists; the kit already ships copied files (the bag link). They move as a unit when the package exists | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| P1·8: the toasts (a green check disc and × on Saved., Sent to the owner., Approved. It’s live., Declined. Nothing changed.; the error toast dark with a red "!"), a red mark before a field’s error, and "1 colour needs fixing" with no full stop | The console’s shared Toaster and FieldError, unchanged: the Neel toast (no disc, no × on an ok toast, the error toast in the pale red tint), no mark before a field error (`in-data-neel:hidden`), and the error summary’s full stop (`field-error.tsx`) | Each is a shared primitive every console screen draws; changing it for one screen would make Brand differ from the rest, and changing it console-wide is beyond P1. Precedent: the same row in the v1-content, v1-storefront-api and T1c builders plans | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| Type card's sample line ("A daily kurta set that looks like you tried. ₹2,790") | The store's tagline and its first product's price | The catalogue's cached cards carry no description; the tagline is the store's own words (reconciliation 2: sample data is the store's own). A Builder's preview (screen 6) shows the price alone and no M.R.P. line: `frata_builder` is granted neither the tagline nor a variant's M.R.P. (ADR-0015, the Builder reads only what it builds with), and its sample is the first active product in the owner's list order | yes, 2026-11-16 (owner: "Approve all 8, ship it") |
| P2 screen 8–9: the error toast "2 lines need fixing" (no full stop), the toasts with a green check disc | The console's shared Toaster and error summary: "2 lines need fixing." with its full stop, the Neel toast | Shared primitives every console screen draws; the same row as P1·8's above | yes, 2026-11-22 (owner: "approved") |
| P2 screen 10: the Builder's preview with the legal block (legal name, address, care, grievance) and every trust block | The store's name in the legal block; no GST block; no size under the sample product; no Arrives row | frata_builder holds no grant on the legal details, the GSTIN or variant sizes (ADR-0015; P1's invoice-preview row) | yes, 2026-11-22 (owner: "approved") |
| P2 screen 4: "Code AYUDA10 applied. Remove" and a refused code as one line under Offers | Today's offers block (its cards and code line), in the brand's colours and type | Owner call 4: today's checkout words and steps stay in P2; the offers block is today's | yes, 2026-11-22 (owner: "approved") |
| P2 screen 5 and 3: the "Pay on delivery not offered" card on the panel colour | Today's card (an edge, dimmed), in the brand's colours | Today's checkout markup, restyled only by the record's tokens | yes, 2026-11-22 (owner: "approved") |
| P2·5 (plan text, no screen): the preview on the look preview's framed route, "where a site preview's Checkout lands" | Drawn on Brand › Checkout itself from the frame's own parts; no framed route; a site preview's Checkout landing waits | A framed route changes the middleware and `next.config` (shared files) for nothing the screen needs; the landing needs V2a's site previews, which don't exist yet. Back when V2a's previews ship | yes, 2026-11-22 (owner: "approved") |
| P2 screen 10: the Builder's preview with the store's trust words | The same words from the store's settings, but on Delivery Zones the Builder's preview shows the settings' days, not the zones' | frata_builder holds no grant on the zones (a module's rows); the live checkout and the owner's preview follow the zones | yes, 2026-11-22 (owner: "approved") |
| P2 screens 3–5: no "Continue with EkCode … or" block, no "Claim GST input credit" switch | Both, where the store has them on (EkCode is on by default; the GST switch is today's) | Today's checkout parts, kept by owner call 4 and restyled only by the record's tokens; the mockup's store has neither switched on | yes, 2026-11-22 (owner: "approved") |
| P2 screens 3–5: the field label "Pincode" | "PIN code" | Plan task P2·3 orders it (the glossary, frata-design-language § Words: **PIN code**); the mockup kept today's label | yes, 2026-11-22 (owner: "approved") |
| P2 screen 6: the order page's "To" line with the street and a part-masked phone, and the full email under "Updates to" | Today's masked lines: city and PIN code, the phone's last digits, the email masked; a "Pay on delivery fee" row where the store charges one | The order page is reached by a link anyone holding it can open: today's masking stays (owner call 4; `src/app/api/shop/orders/view/route.ts`) | yes, 2026-11-22 (owner: "approved") |
| Four-screens § 4 (2026-11-22): "Staff or an Accountant: the card without buttons" | Staff open Brand › Checkout while a partner's checkout change waits and read the card (chip "Waiting for the owner") and the page as Preview only; otherwise refused as built. The Accountant stays refused; Brand's own page keeps refusing both | The Accountant holds no `preview.read`; showing it the card means widening `CAPABILITIES` (`roles.ts`, a shared file) for one card, and P1's approved table refuses both on Brand. Orchestrator asked 2026-11-23 | no |
| Four-screens § 4: "Already approved by Anita, Today, 10:44 am" | "Already approved by the owner, today, 10:44 am." (or "by a Manager", "by you"), with Reload | Frrata holds no person's name, only a member's email and role; mid-sentence "today" lower case and the full stop as the Sent row and the Words rulebook have them | no |
| Four-screens § 4: the "Needs you" chip in the warn colour (P1's Brand drew it neutral) | Warn on both pages: one ReviewCard (`brand/_components/review-card.tsx`) for Brand and Brand › Checkout | The newer approved drawing; one component can't draw both | no |
| Four-screens § 4: the switch's row labelled "Preview" with the switch beside it | The switch in the Preview card's header beside "Sample data", named "Live or waiting" for a screen reader | The Preview card already holds a switch named "Preview" (Checkout, Order, Policy); two of one name confuse a screen reader | no |
| Four-screens § 4: the buttons at `sm` | `sm` on both pages, the Notices row's own buttons (`BrandDecision`); Brand's card drew them full size before | One component for the card and Notices, as the task orders | no |
