# Search and sharing — plan (S·0, S·1, S·2)
Status: active · Date: 2026-11-09 · Spec: `docs/specs/2026-11-09-seo-and-sharing.md` ·
Mockup: https://claude.ai/artifact/P4wfSezqiVxzG4D7FsrnYM · Approved: owner, 2026-11-09 (mockup; share images are JPEG,
the one exception to "WebP only" — ADR-0005 amended; order S·0 → S·1 → S·2; Google's app review started now for S·4)

Reviewed 2026-11-09 by architecture-reviewer, security-reviewer and tenancy-auditor; every finding is folded into the
tasks below (§ Review findings lists them). S·3–S·5 get their own plans when S·2 closes. Every task ends with its
verify command run and read, and `impact-reviewer` on its diff before the commit (frata-planning rule 5).

## Regression net first (rule 5)
- **S0·1** `e2e/flows/64-seo.mjs`: home, a product, a sale product, a sold-out product, an archived product, a
  collection, `/products/page/2`, a policy, an unpublished shop — fetched with `node:http` (Host header) as
  `WhatsApp/2.23.20.0 A`, `facebookexternalhit/1.1`, `Twitterbot/1.0`, `Pinterestbot/1.0`,
  `TelegramBot (like TwitterBot)`, `LinkedInBot/1.0`, `Googlebot`. Asserts 200 (or 404 / noindex where due), tags
  inside the raw `<head>` read as the crawlers read them (`property=` for og, `name=` for twitter), canonical and
  og:url identical with and without `?utm_source=x`, each JSON-LD block parses and its price equals the visible price;
  robots.txt and sitemap.xml. It asserts today's tags first; each task extends it. Verify:
  `npm run e2e -- --only 64-seo`.
- **S0·2** A metadata-cost test: no cost field (the names `scripts/check-client-bundle.mjs` checks) in any page's
  `<head>` or a card's inputs (ADR-0003; the bundle gate does not cover metadata).

## S·1 Share cards
- **S1·1 One SEO module** `src/domains/seo/` (pure; no `next` imports, not even types — `check:layers`): move
  `src/domains/catalogue/seo.ts` (shareCard, defaultTitle/Description, productJsonLd, shopJsonLd, handleChange) in
  and update its four users (`product-view.tsx`, `pages.tsx`, `product-editor.tsx`, `seo-panel.tsx`). Add
  `pageTags(kind, facts, words)` → plain data (title, description, canonical, og fields incl. image
  type/width/height/alt, twitter `summary_large_image`, product:* from paise, robots `max-image-preview:large` when
  indexable); words (Hindi titles, "Pay on delivery") are passed in from `src/components/storefront/words.ts`. A thin
  mapper in `src/app/s/[host]/_meta.ts` turns it into Next `Metadata` for every shop route. The editor's WhatsApp
  preview and the share sheet read the same builder. Verify: vitest + 64-seo.
- **S1·2 Card facts and hash** `src/domains/seo/card.ts` (pure): from the page's own view model → what the card
  shows (title; price and M.R.P. exactly as the buy box — `shown.compareAt`, never a struck M.R.P.; sold out; COD on;
  photo bases at the 1200 rung via `pick(widths, 1200)`; shop name; logo; theme colours through the zod hex check);
  the hash covers content **and** reachability (status, published) and `TEMPLATE_VERSION`. Hashing (node:crypto) lives
  in `src/lib/seo/card-hash.ts`, never imported by client code. Verify: vitest.
- **S1·3 The image route** `src/app/s/[host]/og/[kind]/[...rest]/route.ts`, `dynamic = 'force-dynamic'`, Node:
  - Canonical paths only: `/og/product/<uuid>/<hash16>.jpg`, `/og/collection/<uuid>/<hash16>.jpg`,
    `/og/shop/<hash16>.jpg` (no id: the shop is the host's). Lower-case, exact regex; any query string or other shape →
    308 to the canonical URL (`no-store`).
  - Tenant from the host (`shopIdForHost`); one loader `shopCard(tenantId, kind, id)` in
    `src/lib/queries/storefront.ts` on `shopCached('card', …)` (key `['sf','card',tenantId,kind,id]`), built on the
    product page's own read, reachable only by `visibility().reachable` with `drafts` hard-coded false (no scheduled,
    archived or unlisted cards); unpublished shop → 404 `no-store`.
  - Recompute the current hash; a different hash in the path → **200 with the current card**, `s-maxage=300`
    (crawlers are not shown to follow a 308 on og:image).
  - Made once: the JPEG is stored in Blob at `og/<tenant>/<kind>/<id|shop>/<hash>.jpg`; a later request serves the
    stored bytes. Rendering (only when absent) is budgeted per shop with `withinLimit` (fail closed to the stored shop
    card). The route fetches photos and the logo itself: URL rebuilt with `acceptedBase(…)` for the host's tenant,
    `fetchWithTimeout`, `redirect: 'error'`, 1 MB cap, `sharp(buf, { limitInputPixels: 4e6, failOn: 'error' })`,
    format must be WebP, decoded to PNG data URIs for `next/og` (no URL reaches Satori; a test asserts the tree has no
    `http`). Fonts: the Inter woff files in `src/lib/documents/fonts/`. Then `sharp` → JPEG q80 sRGB, down to q60
    until ≤ 300 KB, else the shop card.
  - Headers: the current-hash 200 `Cache-Control: public, s-maxage=31536000, immutable`; fallbacks, 404s and 308s
    `no-store` or `s-maxage≤300`. 64-seo asserts `x-vercel-cache: HIT` on a second fetch where the CDN is present.
  - `sharp` and `qrcode` added to `package.json`, pinned exact, with a line each on why; `npm audit` re-run.
  Verify: route unit tests (shapes, tenancy, size) + 64-seo (image/jpeg, 1200×630, ≤ 300 KB).
- **S1·4 Layouts** as the mockup: product (photo fills, subject in the centred square, band: shop name, "Pay on
  delivery" when COD is on, price as the buy box), collection (1 large + 3 small, name, "From ₹… · N styles" from the
  collection page's own membership read), shop (name on the theme colour, three listed best sellers). No photo →
  the shop card. Verify: screenshots from 64-seo, looked at.
- **S1·5 Crawlers**: robots.txt keeps `Allow: /`. Vercel firewall: crawlers pass by Vercel's verified-bot category,
  never by user-agent string (spoofable) and never for `/api/`. frata-gotchas: `htmlLimitedBots` if a shop route ever
  turns dynamic.
- **S1·6 Logo and icon**: the setter lives in **Settings › Brand** (`settings/sections.ts`, which already says "Your
  logo…"; the upload route already authorises `brand/`). It stores only `acceptedBase(raw, blobHost, tenantId,
  'brand')`, checks `isWebp` and dimensions. Icons at `/icon/<size>/<hash>.png` (32, 180), the logo on the theme
  colour or the shop's initial, the same route pattern and rules as S1·3. The shop layout's `icons` point at them;
  theme colour in `generateViewport`. Root `/favicon.ico` and `/apple-touch-icon.png` stay the platform's on shop hosts
  (not rewritten by `shopRewrites`) — accepted: browsers use the `<link rel=icon>`. Verify: unit + e2e.
- **S1·7 Share sheet** `src/app/(console)/console/_components/share-sheet.tsx` on `ui/dialog.tsx` (a sheet on a
  phone), on the product editor, the collection editor and Home:
  - Links from `shopLink` (`src/domains/analytics/link.ts`, the one builder) with new presets
    `whatsapp | instagram | facebook | copy | qr`; `classifySource` learns `copy` and `qr` (test). The host comes from
    the member's shop (`requireMember`), never a form. wa.me and the Facebook sharer get `encodeURIComponent`.
  - The preview is a **console route** behind `requireMember` (`previewProduct`/`previewShop`, `private, no-store`)
    so drafts and an unpublished shop preview too; the public route has no bypass.
  - QR: a server action in a `'use server'` file taking kind and id only (never a URL or text), resolved under
    `requireMember`; `qrcode` server-only; a PNG download.
  - States: draft (share disabled, preview shown), unpublished shop (copy only, "Opens when your shop opens" is not
    shown — Rule 0: the button is disabled), clipboard refused (reuse `_components/copy-link.tsx`).
  Verify: unit (links) + an e2e step.
- **S1·8 Meta re-scrape — held.** The first outbox sender needs Pro and a definer-based claim first (docs/setup.md).
  When it ships: token in the POST body with `appsecret_proof`, `dedupeKey` per product per hour, paths only in the
  payload, host rebuilt from the row's tenant, no token in error text. The new image URL already refreshes every app.
- **S1·9 Docs and skills**: ADR-0005 amended (JPEG share images, made once in Blob); frata-design-language (share
  cards), frata-architecture (`src/domains/seo/`, the image and icon routes, `shopLink` presets), frata-gotchas
  (htmlLimitedBots; og other tags are `name=`), version bumps; spec status per phase.

### S1·1 as built (2026-11-09; impact review applied)
- `src/domains/seo/` holds defaults (moved from catalogue), `pageTags` and `offerOf` (the lowest price a shopper can
  buy at, with that size's availability). `s/[host]/_meta.ts` maps tags to Next metadata; description is always set
  (null clears it — Frrata's root description reached shop cards otherwise; the shop layout sets null too).
- Product `og:type` and `product:*` render as property= meta in the page (React hoists them; nothing above the page may
  suspend). "Shop all" follows the shop's language. Open: the console's seo-panel still calls `shareCard` directly
  (the same function the builder uses); S1·7's share sheet reads `pageTags`.

## S·2 Search foundations
- **S2·1 Descriptions everywhere** in `pageTags` (lists, collections trimmed to 155, policies, page n); Hindi titles.
- **S2·2 Collections**: migration — `collections.seo_title`, `seo_description` (length checks);
  `collection_handle_history` as `product_handle_history`: PK (tenant_id, handle), `retired_at`, FK
  (tenant_id, collection_id) → collections (tenant_id, id) on delete cascade, index (tenant_id, collection_id), grant
  select+insert only, revoke anon/authenticated, RLS, policy `using` + `with check`, no frata_admin grant (added to the
  frata_admin check), proof rows as §21. Renaming to a retired handle refused; the 308 lookup joins collections on the
  tenant. Editor disclosure as the mockup; the intro rendered as plain text above the grid.
- **S2·3 Structured data**: BreadcrumbList, WebSite, ItemList, OnlineStore + free-shipping threshold and handling time;
  Product + brand, `gtin`/`mpn` (nullable `variants.gtin`, `variants.mpn`, `products.no_barcode`, length checks),
  colour, size, material. Kept out of `shopCatalogue` (880 kB of 1 MB at 600 products); a test: markup = page.
  `speed-reviewer` on this task.
- **S2·4 Sitemap**: its own narrow read; image entries; `lastmod` = `updated_at` only once `updated_at` moves on real
  edits; no empty collections. (Sitemap index past 50k: dropped, YAGNI.)
- **S2·5 Language**: each surface gets its own root layout (`<html>` moves into `src/app/s/[host]/layout.tsx`,
  reading `shopFor(params)`, and a console group) so a Hindi shop is `<html lang="hi-IN">` with ISR intact. Its own
  task with a full e2e run (it touches every page).
- **S2·6 Photo descriptions**: an alt field per photo (the action takes `alt`), default "<title>, <colour>, <n>";
  cards and the grid use the stored alt.
- **S2·7 Accessibility**: skip link, focus style, 24 px targets, pickers not colour-only.
- **S2·8 `themes:speed`**: its own task — Lighthouse in CI against the e2e stack (perf ≥ 90, a11y ≥ 95, SEO ≥ 95,
  CLS ≤ 0.05), the median of 3 runs, Lighthouse pinned in devDependencies.
- **S2·9 Bing (IndexNow) — held** with S1·8 (outbox precondition). When it ships: key env `INDEXNOW_KEY`
  (check:config), key file `s/[host]/<key>.txt` answering exactly the key, one POST per host, published shops' listed
  URLs only.
- **S2·10 Out of stock**: price kept, Add to bag greyed, not hidden.

## Owner steps
- **Google OAuth app verification** for S·4: Google Cloud project "Frrata" → OAuth consent screen (external) →
  scopes for Search Console and the Merchant API (S·4's plan fixes the exact list: `webmasters` to submit sitemaps,
  `siteverification`, `content`) → verified domain and privacy policy → submit. Review takes weeks.
- Vercel firewall: let verified bots through; no user-agent allow rules.

## Review findings (2026-11-09) — all accepted, folded above
- **tenancy-auditor** (FIX BEFORE MERGE): shop card without an id; one tenant loader `shopCard`; logo only through
  `acceptedBase`; console preview route, no public bypass; collection history spec; per-surface root layouts; outbox
  payload paths only; fallback stored under the tenant; no-store on 404s; share host from the member; QR takes ids.
- **security-reviewer** (FIX BEFORE MERGE): canonical paths only, query strings 308, made once in Blob, per-shop render
  budget; photos fetched by the route (SSRF), WebP and pixel limits; reachability gate (no scheduled/archived cards);
  verified-bot firewall rule; S1·8/S2·9 held for the outbox precondition; S·4 OAuth requirements (CAN_MANAGE, PKCE,
  URL-prefix property per shop host, sealed token with a key id, Production-only secret) go into S·4's plan; `shopLink`
  presets; qrcode pinned; intro as text.
- **architecture-reviewer** (CHANGES NEEDED): per-surface root layouts; one `domains/seo/` module (move
  `catalogue/seo.ts`); force-dynamic route, `s-maxage`, hash includes reachability; stale hash 200 not 308; WebP inputs
  decoded by sharp; sharp/qrcode/Lighthouse pinned; ADR-0005 amended; `shopLink` presets and `classifySource`; words
  passed in, no Next types in domains; catalogue cache budget (narrow reads); M.R.P. as the buy box; logo in Settings ›
  Brand; share-sheet states; root icons accepted; sitemap index dropped; `themes:speed` its own task;
  unit-economics: card transfer — ≤ 300 KB per first fetch per app, then each app caches; ~0.3 GB per 1,000 shares
  worst case, inside Vercel Pro's included transfer.

## Repetitive work → agents and scripts (rule 6)
| Chore | Becomes |
|---|---|
| Checking every page type's tags as each crawler | `e2e/flows/64-seo.mjs` (S0·1) |
| Card size, format, cache | the route's checks + 64-seo |
| Costs in metadata | the S0·2 test |
| Lighthouse per theme | `themes:speed` (S2·8) |

## Practices recorded in skills
- UI/UX: share cards; the share sheet. Performance: tags in the static head; images made once, hashed, immutable.
- Architecture: one SEO module; card facts from the page's view model; image routes take canonical ids, never text.
- Testing: crawl as each bot, raw `<head>` only.
