# One address, one bag, one brand record: the build
Status: draft for the owner · Spec: `docs/specs/2026-11-16-one-address-checkout.md` (draft) · Record: ADR-0019 (proposed)
· Date: 2026-11-16
**Mockup:** none yet — each phase names its own below (P1, P2, P3, P5 new; P6 the pilot's own; P0 and P4 none, no screen)
**Approved:** —
**Review:** security-reviewer FIX BEFORE MERGE (4 high, 7 medium, 7 low, 2 notes), all folded in, 2026-11-16
**Review:** tenancy-auditor FIX BEFORE MERGE (6 high, 3 medium, 4 low, grants), all folded in, 2026-11-16
**Review:** architecture-reviewer CHANGES NEEDED (2 blockers, 12 majors, the minors), all folded in, 2026-11-16
**Review:** unit-economics-reviewer pending, 2026-11-16
**Review:** speed-reviewer pending, 2026-11-16
**Review:** api-contract-reviewer pending (P1, P5, P6), 2026-11-16
**Review:** integration-researcher pending (Razorpay in a frame; COOP in in-app browsers; PSL process), 2026-11-16
The three reviews above ran independently as separate agents on 2026-11-16; this revision folds every finding into the spec
and this plan. Nothing below is built before its phase's mockup is approved and the pending reviews have run (ADR-0001).
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
| 3 | **P3 The secure frame** | E | shopper data only in Frrata's frame | P2; P3·1 spike; decisions 3, 15 | **new (states)** |
| 4 | **P5 One address** | A | site and checkout on one host | V2a·1, ·5, ·6; P2; P3 (any store with real shoppers); P4a; P5·1 spike; decisions 1, 5, 6, 7, 16, 20, 21, 22 | **new:** Settings › Website; we'll be back |
| 5 | **P6 One bag** | B | the site uses Frrata's bag | P5 | the pilot's bag drawer |
| 6 | **P7 Studio designs checkout** | D | checkout design in Studio's pane | P2; Studio V3b | approved one screen + Checkout tab |
**Proof blocks** in `scripts/verify/tenancy.sql`: § 98 (P1), § 99 (P2), § 100 (P5's predicate and keys; § 81 and § 86
rewritten). § 87 and § 88 are taken (0150, 0151); the Studio plan's § 88–96 must be renumbered. **New e2e flows** take the
next free numbers at build (93 and 95 are taken; the Studio plan's `93-site-hosting` must be renamed).
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
| P0·2 | `bag-store.ts`: `frata.bag.by.v1` written inside `write()` from the caller's kind: `link` (the bag link), `shop` (theme product page, bag drawer), `keep` (checkout's reconcile, the gift button, and from P2 checkout's Remove and stepper); `shop` stays until `clear`, which empties it; page-only fallback as the bag's. `cart-link.tsx` calls `fillMode` | `npm test`; `npm run typecheck` |
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
| P1·2 | Migration: `brand_tokens` and `brand_seasons` (typed columns; `logo_mark_url`, `logo_stacked_url`, `logo_reversed_url` each CHECKed to `tenants/<t>/brand/`; `previous jsonb` for Undo); `shop_settings.logo_url` gains the same folder CHECK (existing rows checked first). Grants: `frata_app` select, insert, update (delete on `brand_seasons`); `tenant_rows` policy, no null branch; `revoke all … from anon, authenticated, service_role`; `frata_admin` none; `frata_builder` select on named columns under `builder_rows` and `builder_only`; `shop_settings` gains `frata_builder` select on `(tenant_id, logo_url, doc_logo, accent, display_font)` only. Proof § 98 (cross-tenant reads and writes, the Builder's columns, the CHECKs) | `npm run verify:tenancy`; `npm test` (`check:tenant`, `check:capabilities`) |
| P1·3 | `src/lib/queries/brand.ts`: `shopBrand`, a `shopCached` loader of scope `settings` (tag `shop:<t>:settings`, shared with `shopFor`). `src/lib/content/save.ts` `saveBrand`: the **only** writer of the record and of `logo_url` (today's `settings.brand.logo` action calls it), `asMember(CAN_BUILD)`, Zod with caps, the check, the previous record kept, Activity row; on an open store a save by anyone but the owner or a Manager is stored as a proposal waiting for the owner's yes (one Inbox line, Approve or Decline) | `npx vitest run src/lib/content`; `npm run e2e -- --only brand` (new flow) |
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
| P2·3 | Checkout, bag-link, order and policy pages read `shopBrand` and the design (props, never the theme) for code-site stores | `npm run e2e -- --only checkout,order-page,storefront-sale,shop-look` |
| P2·4 | Checkout lines: Remove with Undo and a stepper (the drawer's pattern; `by` kind `keep`), re-priced by the quote | `npm run e2e -- --only checkout,offers` |
| P2·5 | The preview on sample data from pure fixtures, on the console host (the look preview's route pattern), every state; it is also where a site preview's Checkout lands | `npm run e2e -- --only brand` |
| P2·6 | Console › Brand › Checkout as drawn; saves through P1·3 | `npm run e2e -- --only brand` (checkout tab steps); `mockup-parity-reviewer`; `npm run check:words` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer`, `speed-reviewer`, `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 12, 13, 14.

## P3 · The secure frame (lane E)
- **After it:** on code-site stores, phone, email, name, address, PIN code, GST fields, EkCode, the priced summary, Place
  order, the reload copy, the pending order, the order token and the order's personal details live only in the frame on
  `secure.<store host>`. The brand origin keeps the bag, its `by`, the code and public data.
- **Mockup:** **new (states):** the frame loading, failed ("We couldn't load the secure form." with Try again), EkCode in a
  popup (EkCode's own look), the frame's summary with **Place order · ₹<amount>**; the rest as P2's.
- **Regression net:** e2e `10-checkout`, `50-order-page`, `64-gst`, `67-ekcode`, `77-order-edit`, `12-security`.
| # | Task | Verify |
|---|---|---|
| P3·1 | **Spike, one week** (`integration-researcher` first). Pass/fail: (a) Razorpay Checkout from a same-site frame completes UPI intent, card and netbanking on Android Chrome, iPhone Safari, Instagram's and WhatsApp's in-app browsers, else Razorpay opens from the page with the contact in memory only; (b) EkCode's popup returns to the frame by `postMessage` to the exact origin in all four; (c) the frame's `__Host-` cookie survives a day in WebKit; (d) Vercel issues `secure.<store>.frrata.shop` and `secure.<brand domain>` certificates; (e) COOP `same-origin` or `same-origin-allow-popups` severs a partner page's handle in all four browsers, else decision 20 | the spike's dated report, read by the owner |
| P3·2 | `secureHostOf` (pure, tests: one strip, the rest must route as `shop`, two-label and odd hosts refused); `routeFor` kind `secure`, `secure.*` out of `shopRewrites`, `/secure/*` a 404 on every host; `secure` in `RESERVED` (`slug.ts`); `checkDomain` and a `shop_domains` CHECK refuse a first label `secure`; tenant from `hostFacts(stripped)`; `[host]` checked equal to the Host | `npx vitest run src/domains/tenancy src/domains/addresses src/domains/signup`; `npm run check:tenant`; `npm run verify:tenancy` |
| P3·3 | `requireSecure`: exact Origin on non-GET; `Sec-Fetch-Site` absent or `same-origin`; the frame page refuses `Sec-Fetch-Dest: document`; the shop's per-IP limits | `npx vitest run src/lib/auth` |
| P3·4 | One handler set mounted under `/api/shop/*` (theme shops) and `/api/secure/*` (frames): price for an address, place, view, pay, retry, switch, change, invoice, EkCode, email opt-in; on one-address hosts the personal `/api/shop/*` routes 404 | `npx vitest run src/app/api`; `npm run e2e -- --only checkout,ekcode,order-page` |
| P3·5 | `src/domains/checkout/frame-messages.ts`: page → frame: bag ids and quantities, method, code; frame → page: delivery fee or zone name, height, order number, a failure code; never a personal field, PIN code or token. The frame: renders nothing unless framed; accepts only `event.source === window.parent` from the exact store origin; sends only to that origin, never `'*'` | `npx vitest run src/domains/checkout` |
| P3·6 | The frame page (`src/app/secure/[host]/`): one form component shared with the page checkout; rendered per request with a nonce and `default-src 'none'` (Razorpay's hosts if P3·1(a) passes), `frame-ancestors` the store's host from the Host string, `private, no-store`; its own tab storage | `npm run e2e -- --only checkout,ekcode` |
| P3·7 | EkCode's cookies move to the secure host (`__Host-`, `SameSite=Lax`, HttpOnly); the `shop_in` hint goes; one cookie module taking the host kind | `npx vitest run src/lib/ekcode`; `npm run e2e -- --only ekcode` |
| P3·8 | `check:storage` (new gate): brand-origin checkout code writes only `frata.bag.v1`, `frata.bag.by.v1`, the code and attribution keys; run against its own documentation file too | `npm test` |
| P3·9 | e2e (new flow `secure-frame`): a brand-origin page opens and frames `/checkout` and `/orders`, fetches the secure host, reads tab storage after an order, frames the secure host after `pushState('/checkout')`, posts every non-schema message from itself and from a child frame: each reads nothing | `npm run e2e -- --only secure-frame` |
- **Reviews:** `security-reviewer` (and a person's review), `tenancy-auditor`, `architecture-reviewer`, `speed-reviewer`,
  `unit-economics-reviewer` (H-3), `design-system-reviewer`, `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`,
  `impact-reviewer` per task.
- **Owner decisions:** 3, 15, 20 (if P3·1(e) fails).

## P4a · Cross-store hardening (lane A)
- **After it:** no cookie under `frrata.shop` carries `Domain`; store and secure hosts read only `__Host-` names;
  `Sec-Fetch-Site` refused when present and not `same-origin` on personal and state-changing shop routes.
- **Mockup:** none.
- **Regression net:** e2e `10-checkout`, `67-ekcode`, `12-security`, `52-addresses`, `53-domains`.
| # | Task | Verify |
|---|---|---|
| P4a·1 | `check:cookies` (new gate) scoped to `src/app/s`, `src/app/secure`, `src/app/api/shop`, `src/app/api/secure`, `src/lib/ekcode`: host-only, `__Host-` names; `shop_in` allowed until P3·7; local e2e's plain names as today | `npm test` |
| P4a·2 | `requireShop` and `requireSecure`: log a week, then refuse `Sec-Fetch-Site` present and not `same-origin` on personal and state-changing routes (absent passes: iOS before 16.4, `require-ek.ts:26`'s rule); exemptions named in the code: EkCode's return GET (a cross-site navigation), the beacon `/api/shop/e` | `npx vitest run src/lib/auth`; `npm run e2e -- --only checkout,ekcode,security` |
| P4a·3 | e2e (new flow `cross-store`): store Y's page sets large and many `Domain=frrata.shop` cookies and posts to store X; X ignores them and refuses the post; the eviction case recorded as the residual | `npm run e2e -- --only cross-store` |
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
| P5·1 | **Spike, one week.** Pass/fail: (a) project-level routing rules on `frata` rewrite a host's non-reserved GETs to a protected deployment with a bypass header, delete `cookie` and `authorization`, forward only the allowlist, and drop every upstream `Set-Cookie`; (b) response headers can be allowlisted by rules or middleware, else a streaming proxy function in bom1 is measured (decision 21); (c) rules a project and Edge Config's size measured, and the store count at which the router moves to middleware fixed; (d) proxied caching keyed by host and honouring `Vary` and RSC, else caching stays off; (e) added TTFB p75 ≤ 30 ms on the document; (f) requests and bytes billed on each project for 1,000 views (H-2) | the spike's dated report; numbers into H-2 |
| P5·2 | Migration and definer `app_website_of(tenant)` (`search_path ''`, revoked from public, anon, authenticated, service_role; granted to `frata_app`); `app_storefront_key`, `app_site_origin_check` and its trigger rewritten on it; grants re-run; pure mirror `src/domains/addresses/website.ts`; proof § 100 and § 81, § 86 rewritten (one-address keys live; split stores unchanged; a removed deployment stops the key) | `npm run verify:tenancy`; `npx vitest run src/domains/addresses` |
| P5·3 | Every reader moved to the predicate: `siteMove` and `_meta.ts`, the sitemap's `elsewhere`, `apiShop`'s `siteOrigin` and `checkoutOrigin`, `cart-link.tsx`'s `site`, analytics' `own` (`source.ts`, landing-based on one-address stores), Settings › Website, Razorpay's website check, the D2·7 sweeps, Admin › Sites | `npx vitest run src/domains/analytics src/domains/addresses src/domains/storefront-api`; `npm run e2e -- --only storefront-api,storefront-sale,domains` |
| P5·4 | `src/domains/tenancy/reserved.ts` (the prefix rule, `%` and `//` to a 404, GET and HEAD only to the site) and `src/lib/sites/routing.ts`: outbox `site.route` (ids only) from every writer (publish, rollback, kill, partner removed or suspended, store opened, handover, domain added, proved, moved, failing, removed, `secure.` proved); one single-flight sender (advisory lock) that builds the whole rule set from the predicate inside `withTenant`, verifies each upstream against `site_deployments`, publishes, reads back; the 5-minute sweep rebuilds and deletes strays; a removal never kept as last good; another store can't prove a host until the removal reads back; pause's from and until carried, or flipped by the boundary sweep; the token and bypass secret Production only, never in the outbox, database or logs | `npx vitest run src/domains/tenancy src/lib/sites`; `npm run check:config` |
| P5·5 | Headers, first Report-Only in waves (kit spec § 4), then enforced. Partner responses: `default-src 'self'` and the spec's T9 list, COOP `unsafe-none`, no COEP, the response allowlist (P5·1(b)); `Service-Worker: script` answered with a self-unregistering script. Frrata's pages on one-address hosts only: COOP (per P3·1(e)), `frame-ancestors 'none'`, `X-Frame-Options: DENY` | `node scripts/verify/one-address.mjs` (new: a header matrix by path, request headers seen by an echo upstream, two hosts' caches) |
| P5·6 | V2a·6's gate gains: absolute `assetPrefix` on the site's own deployment origin, no reserved path, no `next/link` into a reserved path, `images.unoptimized`, no service worker, no personal-data inputs (build output and a crawl), no `RTCPeerConnection` | `npx vitest run src/domains/sites`; `cd kit/starter && npm run check` |
| P5·7 | One address switches on only when the store's host and its `secure.` record are proved and certified; a removed domain stays parked while its `secure.` resolves to Vercel (D2·7 sweep) | `npm run e2e -- --only addresses,domains` |
| P5·8 | Settings › Website as drawn | `npm run e2e -- --only one-address` (new flow, its Settings steps); `mockup-parity-reviewer` |
| P5·9 | The pilot moves after P3 (decision 7): its deployment in `frrata-sites` (V2a·11) as the upstream of `testing.frrata.shop`; policies and checkout links become paths; 30 days of the router's cost recorded (H-2) | `curl -sI https://testing.frrata.shop/` (the site's response through the router); `curl -sI https://testing.frrata.shop/checkout` (Frrata's headers); `npm run e2e -- --only storefront-sale` |
| P5·10 | e2e (new flow `one-address`): a partner page opens and frames `/checkout`, registers a service worker, posts to a site path (405), sees no `cookie` upstream, is removed mid-session, the upstream answers 500, a pause starts with no event, two hosts never share a cached copy | `npm run e2e -- --only one-address` |
- **Reviews:** `architecture-reviewer`, `security-reviewer` (and a person's review), `tenancy-auditor`, `speed-reviewer`,
  `unit-economics-reviewer` (H-2 on the pilot's 30 days), `api-contract-reviewer`, `design-system-reviewer`,
  `words-reviewer`, `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 1, 5, 6, 7, 16, 20, 21, 22.

## P6 · One bag (lane B)
- **After it:** the site reads and writes Frrata's bag through `/_frrata/v1/bag.js`; its drawer shows the quote's subtotal
  and sold-out lines; checkout clears the one bag; attribution captured on landing.
- **Mockup:** the pilot's own mockup (`mokobara/docs/mockups/house-of-ayuda.html`, the bag) redrawn with the quote's
  subtotal and sold-out lines, approved by the owner.
- **Regression net:** e2e `92-storefront-sale`, `10-checkout`, `47-offers`, `51-analytics`, `72-traffic`.
| # | Task | Verify |
|---|---|---|
| P6·1 | `/_frrata/v1/bag.js` from `bag-store.ts`'s core: the same bytes on every host, immutable, ≤ 3 kB gzipped; `get`, `add`, `set`, `remove`, `subscribe`, `quote()` (no PIN code); `pageshow` and `storage` re-reads; `captureAttribution` on load | `npm run check:bag-script` (new gate, `check:beacon`'s pattern: stale file, size ceiling, no cost field, no host-specific bytes); `npx vitest run src/components/storefront` |
| P6·2 | Kit: the bag button and drawer use it; the starter's own bag removed; optional `shop.bag` in the API | `cd kit/starter && npm run check && npm run build`; `npm run check:api` |
| P6·3 | e2e (new flow `one-bag`): spec § 8 S1–S8, S11, S15 on one host, two tabs, a bfcache return, an order then back | `npm run e2e -- --only one-bag` |
| P6·4 | The pilot drops `lib/bag.ts`; its gaps G1 and G25 closed | in `mokobara`: `npm run check && npm run build` |
- **Reviews:** `architecture-reviewer`, `speed-reviewer`, `security-reviewer`, `api-contract-reviewer`, `e2e-runner`,
  `impact-reviewer` per task.

## P7 · Studio designs checkout (lane D)
- **After it:** Studio's pane shows checkout and the order page on sample data; hand edits and `tokens_propose`/`logo_propose`
  write through `saveBrand` (an open store's changes wait for the owner, as P1·3).
- **Mockup:** the approved one screen, plus a Checkout tab.
| # | Task | Verify |
|---|---|---|
| P7·1 | The pane's Checkout tab (P2·5's preview); Apply calls `saveBrand` | `npm run e2e -- --only studio` |
- **Reviews:** as Studio V3b.

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
| A site's own logo, colours, personal inputs, reserved paths | the kit's `npm run check` and the publish gate (P1·7, P5·6) |
| Which browsers carry the PSL listing | a quarterly line by `integration-researcher` (P4b·3) |

## Deviations (BUILT AS DRAWN; for the owner before a phase ships)
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| — | — | — | — |
