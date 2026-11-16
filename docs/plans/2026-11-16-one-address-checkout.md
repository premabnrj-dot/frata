# One address, one bag, one brand record: the build
Status: draft for the owner · Spec: `docs/specs/2026-11-16-one-address-checkout.md` (draft) · Date: 2026-11-16
**Mockup:** none yet — each phase names its own below (P1, P2, P3, P5 new; P6 the pilot's own; P0 and P4 none, no screen)
**Approved:** —
**Review:** architecture-reviewer pending, 2026-11-16
**Review:** security-reviewer pending, 2026-11-16
**Review:** tenancy-auditor pending, 2026-11-16
**Review:** speed-reviewer pending, 2026-11-16
**Review:** unit-economics-reviewer pending, 2026-11-16
**Review:** api-contract-reviewer pending, 2026-11-16
**Review:** integration-researcher pending (Razorpay in a frame; PSL propagation), 2026-11-16
Nothing below is built before its phase's mockup is approved and the reviews above have run on this plan (ADR-0001).
P0 is a bug fix (frata-planning § When this applies): it needs the owner's decision 2 and `security-reviewer` on its diff,
no mockup.

## Order and lanes
Lanes as in `docs/plans/2026-11-15-parallel-lanes.md` (**A** hosting, **B** API and data, **D** the agent) plus **E**,
checkout, new here. The orchestrator releases one lane at a time; phases in different lanes may run at once.
| Step | Phase | Lane | A shopper, brand or partner can, after it | Needs first | Mockup |
|---|---|---|---|---|---|
| 0 | **P0 Bag link fix** | E | the pilot's shoppers see at checkout exactly the bag they left on the site | owner decision 2 | none (bug fix) |
| 1 | **P1 One brand record** (replaces Studio plan BT) | B | the brand's logo, palette and type are saved once; console, checkout, emails, invoices, cards, the API and the site read them | owner decisions 8–11 | **new:** Console › Brand |
| 1 | **P4a Cross-store hardening** | A | — (no screen): no `Domain` cookie, `__Host-` names only, fetch metadata on every personal or state-changing route | — | none |
| 1 | **P4b PSL listing** (owner's PR; lands when it lands) | A | each `<store>.frrata.shop` is its own site in browsers that have the listing | P4a; owner decision 4 | none |
| 2 | **P2 Checkout and order pages in the brand's design** | E | the pilot's checkout, bag-link page and order page look like House of Ayuda, on today's hosts; partners set checkout design in the console | P1 | **new:** the pages in the pilot's design, every state, phone and desktop; Console › Brand › Checkout |
| 3 | **P3 The secure frame** | E | shopper details live only in Frrata's frame; ready for partner code beside checkout | P2; P3·1 spike | **new (states):** frame loading, failed, EkCode popup |
| 3 | **P5 One address** | A | the site and checkout on one host; the pilot first (decision 7) | P2, P4a, P5·1 spike; P3 for outside partners | **new:** Settings › Website (one address, two records) |
| 4 | **P6 One bag** | B | the site uses Frrata's bag; totals and sold-out lines in the site's own drawer; the bag link only for outside links | P5 | the pilot's bag drawer, redrawn in its own mockup |
| 5 | **P7 Studio designs checkout** | D | partners set checkout design in Studio's pane; agent proposals write the record | P2; Studio V3b | **approved:** the one screen, plus a Checkout tab redraw |
Proof blocks in `scripts/verify/tenancy.sql`: § 90 (P1, BT's number kept), § 97 (P2 `checkout_design`), § 98 (P3 the
secure host's routes need no table; § 98 proves the frame's definers if any are added), § 99 (P5 routing rows). Every
table states its `frata_admin` and `frata_builder` grants. New e2e flows take the next free numbers at build (93 and 95
are taken; the Studio plan's `93-site-hosting` must be renamed too).

## P0 · Bag link fix (lane E)
- **After it:** a bag link replaces a bag that only bag links filled, and joins a bag the shopper built on the store's own
  Frrata pages. The pilot's removals and quantity changes reach checkout, whatever the referrer.
- **Needs first:** owner decision 2 (security L1 narrowed).
- **Mockup:** none: no new element on any screen.
- **Regression net (before the change):** e2e `92-storefront-sale` (the bag link from a site, a broken link),
  `10-checkout`, `47-offers` (the gift button), `67-ekcode`; unit tests of `cart-link.ts`.
| # | Task | Verify |
|---|---|---|
| P0·1 | `src/domains/checkout/bag-fill.ts` (pure): `fillMode({ filledBy, empty, fromSite })` → `replace` \| `join`; `filledBy` is `link`, `shop` or none; tests for every row, including a stripped referrer and an empty bag | `npx vitest run src/domains/checkout` |
| P0·2 | `bag-store.ts`: `frata.bag.by.v1` beside the bag (same storage rules, page-only fallback); `replace` and a link's joins write `link`; `add`/`set`/`remove` from the theme's product page and bag drawer write `shop`; checkout's `reconcile`, the gift button and `clear` leave it (`clear` empties it). `cart-link.tsx` calls `fillMode` | `npm test`; `npm run typecheck` |
| P0·3 | e2e `92-storefront-sale` gains: hand off two lines, remove one and change the other's quantity on the site, hand off again → checkout shows the site's bag; the same with `referer` absent; a bag built on a theme page then a link → joined | `npm run e2e -- --only storefront-sale,checkout,offers,ekcode` |
| P0·4 | The pilot: no code change; its `docs/design/deviations.md` notes "the site's bag stays full after an order until one bag (P6)" | read the file |
- **Reviews:** `security-reviewer` (L1 narrowed), `impact-reviewer` on the diff, `words-reviewer` n/a (no words).
- **Owner decisions:** 2.
- **Cost:** about 20 lines in two files, one pure module and its tests, two e2e steps; no migration, no API change.

## P1 · One brand record (lane B; replaces Studio plan BT)
- **After it:** a store's logo files, palette, type, radius and density are saved once and read by every surface; a site
  that ships its own logo or colours fails its check; House of Ayuda's logo is in its record.
- **Needs first:** owner decisions 8, 9, 10, 11.
- **Mockup:** **new**, Console › Brand (phone first): logo files (primary, mark, stacked, reversed; each optional but the
  primary), palette roles with each pair's contrast shown as a chip, display and body fonts from a list, radius on a
  five-step scale, density, a preview strip (header, a product card, the checkout's pay bar, an email header) on sample
  data; states: no logo, uploading, a file refused (why, at the field), a pair below contrast (named at the field), saved,
  Undo, no permission, support visit read-only.
- **Regression net:** e2e `05-shop-look` (theme shops unchanged), `10-checkout`, `60-documents`, `64-seo`, `71-email`,
  `91-storefront-api`, `92-storefront-sale`, `86-builders`; `npx vitest run src/domains/themes src/domains/storefront-api`.
| # | Task | Verify |
|---|---|---|
| P1·1 | `src/domains/brand/`: roles, type, radius scale, density, seasons (BT·1), the design check (`check.ts`: contrast via `src/domains/themes/contrast.ts`, sizes, fonts from the list), `accentOf` (record's accent, else the enum's colour) | `npx vitest run src/domains/brand src/domains/themes` |
| P1·2 | Migration: `brand_tokens` and `brand_seasons` (BT·2) with typed columns, plus `logo_mark_url`, `logo_stacked_url`, `logo_reversed_url`, each CHECKed to the store's media folder like `doc_logo`; `shop_settings.logo_url` stays the primary; grants (`frata_app` select/insert/update; `frata_builder` select through its policy; `frata_admin` none), RLS, `tenant_rows`; proof § 90 | `npm run verify:tenancy`; `npm test` |
| P1·3 | `src/lib/queries/brand.ts` (`shopBrand`, cached, tag `shop:<t>:brand`); the one save in `src/lib/content/save.ts` (`saveBrand`, asserts `CAN_BUILD` or `brand.edit`, Zod with caps, the design check, the previous record kept for Undo, Activity row, partner-save notice per amendment 8); `CAPABILITIES` gains `brand.edit` (owner's name and date in `capabilities.test.ts`) | `npx vitest run src/lib/content src/domains/tenancy`; `npm run check:capabilities` |
| P1·4 | `doc_logo` rendered from the primary when none is uploaded (resvg, the rendition keyed by the source's sha256, stored under `documents/`); invoices and slips read it unchanged | `npx vitest run src/lib/documents`; `npm run e2e -- --only documents` |
| P1·5 | Readers: console header and previews, emails (`layouts.ts`, `compose.ts`), share cards and icons (`og`, `icon.ts`), the theme's shell only when the store has a record | `npm run e2e -- --only email,seo,shop-look` |
| P1·6 | API: `shop.brand` (additive on `2026-12`: logo files, palette, type, radius, density; a future season never served); `shop.logo` unchanged | `npm run check:api`; `npx vitest run src/domains/storefront-api`; `api-contract-reviewer` |
| P1·7 | Kit: `<Logo>` and `<BrandStyle>` in `@frrata/ui` (CSS variables from `shop.brand`); the starter's `npm run check` fails logo files, a header SVG instead of `<Logo>`, and colours or fonts not from the variables; the partner skill's rule; `node scripts/kit-sync.mjs` | `cd kit/starter && npm run check && npm run build`; `npm run e2e -- --only storefront-sale` |
| P1·8 | Console › Brand as drawn | `npm run e2e -- --only brand` (new flow); `mockup-parity-reviewer` |
| P1·9 | The pilot: the owner's decision 8 applied (monogram uploaded, or Frrata's identity step later); the site reads `shop.brand` through the kit; its own logo files deleted; its deviations updated | in `mokobara`: `npm run check && npm run build` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer` (SVG upload, the capability), `speed-reviewer`,
  `api-contract-reviewer`, `design-system-reviewer`, `words-reviewer`, `mockup-parity-reviewer`, `impact-reviewer` per task.
- **Owner decisions:** 8, 9, 10, 11.

## P2 · Checkout and order pages in the brand's design (lane E)
- **After it:** checkout, the bag-link page, the order page and policies draw the brand record and the store's checkout
  design, not the theme; partners set the design in Console › Brand › Checkout on sample data; checkout lines gain Remove
  and a stepper. Works on today's hosts, so the pilot's checkout at `testing.frrata.shop` looks like House of Ayuda now.
- **Needs first:** P1; owner decisions 13, 14.
- **Mockup:** **new**: the checkout (every state: empty bag, Pay on delivery not offered, a sold-out line, a changed price,
  a failed payment, a code applied and refused), the bag-link page, the order page (placed, paid, waiting, on its way) and
  a policy page, in House of Ayuda's design at 390 and 1280 px; Console › Brand › Checkout (header and footer variant,
  trust blocks, three lines with counters, the preview on sample data). Its opening follows frata-planning § Step 4,
  with the audit of today's theme checkout screenshotted.
- **Regression net:** e2e `10-checkout`, `47-offers`, `50-order-page`, `64-gst`, `67-ekcode`, `69-delivery-zones`,
  `77-order-edit`, `92-storefront-sale`; the checkout first-load JS budget (`check:size`).
| # | Task | Verify |
|---|---|---|
| P2·1 | Migration: `checkout_design` (one row a store: header variant, back link on/off, footer variant, trust blocks as a text array CHECKed to a closed set, the three lines with length CHECKs, `updated_by`, `updated_at`); grants as P1·2; proof § 97 | `npm run verify:tenancy` |
| P2·2 | `src/domains/brand/checkout.ts`: the closed sets, the three lines' limits, the check (P1·1's plus the variants); the render-time fallback to defaults on a failing record | `npx vitest run src/domains/brand` |
| P2·3 | Checkout, the bag-link page, order pages and policies read `shopBrand` and the design (props, never the theme) when the store has a record; theme shops without one unchanged | `npm run e2e -- --only checkout,order-page,storefront-sale,shop-look` |
| P2·4 | Checkout lines: Remove with Undo and a stepper (the bag drawer's pattern), re-pricing through the existing quote | `npm run e2e -- --only checkout,offers` |
| P2·5 | The preview on sample data on the console host (the look preview's route pattern, framed by the console only), every state from fixtures | `npm run e2e -- --only brand` |
| P2·6 | Console › Brand › Checkout as drawn; the save is P1·3's | `mockup-parity-reviewer`; `npm run check:words` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer` (merchant words on checkout), `speed-reviewer`,
  `design-system-reviewer`, `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 13, 14.

## P3 · The secure frame (lane E)
- **After it:** phone, email, name, address, GST invoice fields, EkCode sign-in and prefill, the typed form's reload copy,
  placement and the order's personal details live only in a Frrata frame on `secure.<the store's host>`; the brand origin
  holds the bag, the code and public data only.
- **Needs first:** P2; P3·1's answers; owner decision 15.
- **Mockup:** **new (states):** the frame loading inside checkout, the frame failed ("We couldn't load the secure form."
  and Try again), EkCode in a popup, Place order inside the frame; otherwise as P2's approved screens.
- **Regression net:** e2e `10-checkout`, `50-order-page`, `64-gst`, `67-ekcode`, `77-order-edit`, `12-security`; the
  Razorpay test-mode flows in `10-checkout`.
| # | Task | Verify |
|---|---|---|
| P3·1 | **Spike, one week** (`integration-researcher` first): Razorpay Checkout opened from a same-site frame on Android Chrome, iPhone Safari, Instagram's and WhatsApp's in-app browsers (UPI intent, cards, netbanking); EkCode in a popup back to the frame; Vercel certificates for `secure.<store>.frrata.shop` and `secure.<brand domain>`; WebKit with Playwright for the frame's `__Host-` cookie. Written up with dates | the spike's report read by the owner |
| P3·2 | `routeFor` kind `secure` (host `secure.<store host>`; tenant from the Host with `secure.` stripped, through `tenantForHost`); `requireSecure` (exact Origin, `Sec-Fetch-Site: same-origin`, the shop's per-IP limits); `src/app/secure/[host]/` with `frame-ancestors` set to the store's live hosts only | `npx vitest run src/domains/tenancy src/lib/auth`; `npm run check:tenant` |
| P3·3 | Move `/api/shop/orders/*`, `/api/shop/ekcode/*` and `/api/shop/email-drops` to `/api/secure/*` (same handlers, same Zod, same limits); the old paths answer 410 on hosts with a frame and keep working on theme shops until V5 | `npx vitest run src/app/api`; `npm run e2e -- --only checkout,ekcode,order-page` |
| P3·4 | `src/domains/checkout/frame-messages.ts`: the closed message schema (page → frame: bag, method, code; frame → page: PIN code and state for pricing, height, order number and total, a failure code); never a personal field out | `npx vitest run src/domains/checkout` |
| P3·5 | The frame: contact, address, GST fields, EkCode, Place order inside it; its own tab storage for the reload copy and the pending order; the page holds the pay bar's label and total | `npm run e2e -- --only checkout,ekcode` |
| P3·6 | EkCode's shop cookies move to the secure host (`__Host-`, `SameSite=Lax`, host-only); the readable hint cookie goes (the frame asks `me` itself) | `npx vitest run src/lib/ekcode`; `npm run e2e -- --only ekcode` |
| P3·7 | `check:storage` (new gate): brand-origin checkout code writes only `frata.bag.v1`, `frata.bag.by.v1`, the code and attribution keys | `npm test` (the gate run against its own documentation file too) |
| P3·8 | Proof suite (e2e, new flow `secure-frame`): a page on the brand origin opens and frames `/checkout` and `/orders`, fetches the secure host, reads tab storage after an order, posts every non-schema message to the frame: each reads nothing | `npm run e2e -- --only secure-frame` |
- **Reviews:** `security-reviewer` (and a person's review), `tenancy-auditor`, `architecture-reviewer`, `speed-reviewer`
  (frame JS ≤ 25 kB gzipped), `unit-economics-reviewer` (EkCode codes per order, H-3), `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 3, 15.

## P4a · Cross-store hardening (lane A)
- **After it:** no cookie under `frrata.shop` carries `Domain`; Frrata reads only `__Host-` names on store and secure hosts;
  every personal or state-changing shop route also needs `Sec-Fetch-Site: same-origin`.
- **Needs first:** nothing.
- **Mockup:** none.
- **Regression net:** e2e `10-checkout`, `67-ekcode`, `12-security`, `52-addresses`, `53-domains`.
| # | Task | Verify |
|---|---|---|
| P4a·1 | `check:cookies` (new gate): every `cookies().set` and `Set-Cookie` in `src/` is host-only with a `__Host-` name (local e2e's plain names allowed as today) | `npm test` |
| P4a·2 | `requireShop` and `requireSecure` refuse a non-GET without `Sec-Fetch-Site: same-origin`, and a personal GET the same (browsers send it since March 2023; a request without it from a non-browser is refused on personal routes only) | `npx vitest run src/lib/auth`; `npm run e2e -- --only checkout,ekcode,security` |
| P4a·3 | Two-store e2e (new flow `cross-store`): store Y's page sets `Domain=frrata.shop` cookies and posts to store X → ignored and refused | `npm run e2e -- --only cross-store` |
- **Reviews:** `security-reviewer`, `impact-reviewer`.
- **Owner decisions:** none.

## P4b · `frrata.shop` on the Public Suffix List (lane A; the owner acts)
- **After it:** each `<store>.frrata.shop` is its own site in browsers that ship the listing.
- **Needs first:** P4a; owner decision 4; `integration-researcher` on the PSL's current process and browser pickup.
- **Mockup:** none.
| # | Task | Verify |
|---|---|---|
| P4b·1 | Before the PR: confirm `_dmarc.notify.frrata.shop` exists (or move notices to `notify.frrata.com` per setup.md), that no Frrata host under `frrata.shop` sets a cookie, and that Let's Encrypt and Vercel see no change for the wildcard | `dig +short TXT _dmarc.notify.frrata.shop`; `npm test` (`check:cookies`) |
| P4b·2 | The owner renews `frrata.shop` to 3 years, adds `_psl.frrata.shop` TXT with the PR's URL, opens the PR on the automated template (PRIVATE section, Frrata's header, the reason: per-store subdomains running brands' and partners' code) | `dig +short TXT _psl.frrata.shop`; the PR's URL in `docs/setup.md` |
| P4b·3 | Once merged, `docs/setup.md` and frata-integrations § Domains record the date; a quarterly check notes which stable Chrome, Firefox and Safari carry it | the dated line in both files |
- **Reviews:** `integration-researcher`.
- **Owner decisions:** 4.

## P5 · One address (lane A)
- **After it:** the store's host serves the partner's site for every path but the reserved ones; Frrata's app answers
  those first-hand; `siteOrigin` and `checkoutOrigin` are one origin. The pilot moves first.
- **Needs first:** P2 and P4a; P5·1's answers; owner decisions 1, 5, 6, 7, 16; for outside partners' sites also P3 (and
  the pen test, kit spec § 7).
- **Mockup:** **new:** Settings › Website (one address; Connect my domain with the host and the `secure.` record; the
  site's state: building, live, maintenance) and the "we'll be back" page for a site upstream that fails.
- **Regression net:** e2e `52-addresses`, `53-domains`, `91-storefront-api`, `92-storefront-sale`, `10-checkout`,
  `12-security`, `95-speed`; `node scripts/verify/api-isr.mjs`.
| # | Task | Verify |
|---|---|---|
| P5·1 | **Spike, one week:** project-level routing rules on the `frata` project (a host condition, a path regex leaving the reserved paths, an external rewrite to a protected deployment with a bypass header, response header actions, `x-vercel-enable-rewrite-caching`), how many rules a project holds and whether a host capture works in a destination; else Routing Middleware with an Edge Config map; measured: added TTFB p75, requests and bytes billed on each project, purge by `Vercel-Cache-Tag` | the spike's report; the numbers into H-2 |
| P5·2 | `src/domains/tenancy/reserved.ts` (the one list) and the router config writer `src/lib/sites/routing.ts`: outbox `site.route` (publish, partner removed, domain moved, site killed) in the same transaction as the change; drained at once; proof § 99 for any rows it keeps | `npx vitest run src/domains/tenancy src/lib/sites`; `npm run verify:tenancy` |
| P5·3 | Headers on every partner response (the router): CSP (`connect-src`, `img-src`, `form-action 'self'`, `frame-src`, `worker-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`), COOP `unsafe-none`, no COEP, `Set-Cookie` with `Domain` stripped; 403 on `Service-Worker: script`. Frrata's pages: COOP `same-origin`, `frame-ancestors 'none'`, `X-Frame-Options: DENY` | `node scripts/verify/one-address.mjs` (new: a header matrix by path on a host) |
| P5·4 | The kit: `assetPrefix: '/_s'` set by the fleet's config overlay; the gate refuses a reserved path in the build, a service worker, personal-data inputs (build output and a headless crawl) | `npx vitest run src/domains/sites`; `cd kit/starter && npm run check` |
| P5·5 | `shop.siteOrigin` and `shop.checkoutOrigin` from the one live host; `cart-link.tsx` treats a same-origin referrer as the site; docs updated (no field changes meaning) | `npm run check:api`; `npx vitest run src/domains/storefront-api`; `api-contract-reviewer` |
| P5·6 | Settings › Website as drawn: one address; Connect my domain adds the `secure.` record (Domain Connect where offered); the domain proof as today | `npm run e2e -- --only addresses,domains`; `mockup-parity-reviewer` |
| P5·7 | The pilot moves: its deployment registered as the upstream of `<store>.frrata.shop` (the owner's Vercel team for the test, ADR-0017 § The pilot); policies and checkout links become paths; 30 days of the router's cost recorded (H-2) | `curl -sI https://<pilot host>/` from the site; `curl -sI https://<pilot host>/checkout` from Frrata; `npm run e2e -- --only storefront-sale` |
| P5·8 | e2e (new flow `one-address`): a partner page opens and frames `/checkout`, registers a service worker, reads a reserved path's cache, is removed mid-session; the site upstream answers 500 | `npm run e2e -- --only one-address` |
- **Reviews:** `architecture-reviewer`, `security-reviewer` (and a person's review), `tenancy-auditor`, `speed-reviewer`,
  `unit-economics-reviewer` (H-2 on the pilot's 30 days), `api-contract-reviewer`, `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 1, 3, 5, 6, 7, 16.

## P6 · One bag (lane B)
- **After it:** the site reads and writes Frrata's bag through `/_frrata/v1/bag.js`; its drawer shows the quote's
  subtotal, delivery and sold-out lines; checkout clears the one bag after an order; attribution is captured on landing.
- **Needs first:** P5.
- **Mockup:** the pilot's own mockup (`mokobara/docs/mockups/house-of-ayuda.html`, the bag) redrawn with the quote's
  subtotal and sold-out lines (it drew neither, G1 and G25), approved by the owner.
- **Regression net:** e2e `92-storefront-sale`, `10-checkout`, `47-offers`, `51-analytics`, `72-traffic`.
| # | Task | Verify |
|---|---|---|
| P6·1 | `/_frrata/v1/bag.js` built from `bag-store.ts`'s core (never a copy), immutable, ≤ 3 kB gzipped; `get`, `add`, `set`, `remove`, `subscribe`, `quote()`; `pageshow` and `storage` re-reads; `captureAttribution` on load | `npx vitest run src/beacon src/components/storefront`; a size gate like `check:beacon` |
| P6·2 | Kit: the bag button and drawer use it; the starter's own bag removed; optional `shop.bag` in the API (`script`, `checkout`) | `cd kit/starter && npm run check && npm run build`; `npm run check:api` |
| P6·3 | e2e (new flow `one-bag`): spec § 8 S1–S8, S11, S15 on one host, two tabs, a bfcache return, an order then back | `npm run e2e -- --only one-bag` |
| P6·4 | The pilot drops `lib/bag.ts` for the kit's bag; its api-gaps G1 and G25 closed | in `mokobara`: `npm run check && npm run build` |
- **Reviews:** `architecture-reviewer`, `speed-reviewer`, `security-reviewer`, `api-contract-reviewer`, `e2e-runner`,
  `impact-reviewer` per task.
- **Owner decisions:** none new.

## P7 · Studio designs checkout (lane D)
- **After it:** Studio's preview pane shows the checkout and order page on sample data; a partner's hand edits and the
  agent's `tokens_propose`/`logo_propose` write the brand record and checkout design through P1·3's save.
- **Needs first:** P2; Studio V3b.
- **Mockup:** the approved one-screen Studio mockup, plus a Checkout tab redrawn for it.
| # | Task | Verify |
|---|---|---|
| P7·1 | The pane's Checkout tab (P2·5's preview); Apply on a proposal calls `saveBrand` | `npm run e2e -- --only studio` |
- **Reviews:** as Studio V3b.
- **Owner decisions:** none new.

## Practices recorded in skills (once the owner approves; versions bumped in the same commit)
| Skill | Practice |
|---|---|
| `frata-architecture` | One address: the store's host is Frrata's; reserved paths in `reserved.ts`; the brand origin holds no secret and no shopper data; personal routes on the secure host only, through `requireSecure`; `Sec-Fetch-Site: same-origin` on every personal or state-changing route; no `Domain` cookie |
| `frata-storefront-api` | `siteOrigin` equals `checkoutOrigin` on one address; `shop.brand`; the bag link's same-origin replace |
| `frata-design-language` | Checkout draws the brand record, never the theme; what a partner may set (spec § 3); the three lines' limits; the preview on sample data |
| `frata-integrations` § Domains | `frrata.shop` on the PSL (status and date); the secure record; routing rules' limits as measured |
| `frrata-site` (kit skill) | Never draw a logo or set brand colours in code; read `shop.brand`; use `bag.js`; asset prefix `/_s`; no service worker, no personal inputs |
| `frata-gotchas` | `/_next/*` on one host belongs to Frrata; a routing rule runs before the deployment's routes |

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Checking the headers on every path of a one-address host | `scripts/verify/one-address.mjs` (P5·3) |
| Checking that no cookie carries `Domain` and only `__Host-` names are read | `check:cookies` (P4a·1) |
| Checking that brand-origin checkout code stores nothing personal | `check:storage` (P3·7) |
| Checking a site for its own logo, colours and personal inputs | the kit's `npm run check` and the publish gate (P1·7, P5·4) |
| Watching which browsers carry the PSL listing | a quarterly line in frata-integrations, by `integration-researcher` (P4b·3) |

## Deviations (BUILT AS DRAWN; for the owner before a phase ships)
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| — | — | — | — |
