# Search and sharing — plan (S·0, S·1, S·2)
Status: active · Date: 2026-11-09 · Spec: `docs/specs/2026-11-09-seo-and-sharing.md` ·
Mockup: https://claude.ai/artifact/P4wfSezqiVxzG4D7FsrnYM · Approved: owner, 2026-11-09 (mockup; share images are JPEG,
the one exception to "WebP only"; order S·0 → S·1 → S·2, Google's app review started now for S·4)

S·3–S·5 get their own plans when S·2 closes. Every task ends with its verify command run and read, and
`impact-reviewer` on its diff before the commit (frata-planning rule 5).

## Regression net first (rule 5)
- **S0·1** `e2e/flows/64-seo.mjs`: for home, a product, a sale product, a sold-out product, an archived product, a
  collection, `/products/page/2`, a policy and an unpublished shop — fetch with `node:http` (Host header) as
  `WhatsApp/2.23.20.0 A`, `facebookexternalhit/1.1`, `Twitterbot/1.0`, `Pinterestbot/1.0`,
  `TelegramBot (like TwitterBot)`, `LinkedInBot/1.0`, `Googlebot`; assert 200 (or 404 / noindex where due), the tags
  inside the raw `<head>`, canonical and og:url identical with and without `?utm_source=x`, every JSON-LD block parses
  and its price equals the visible price; robots.txt and sitemap.xml. It asserts today's tags first; each later task
  extends it. Verify: `npm run e2e -- --only 64-seo`.
- **S0·2** A metadata-cost test: no field from the cost list (`scripts/check-client-bundle.mjs`'s names) in any page's
  `<head>` or in a share image's inputs (ADR-0003; the bundle gate does not cover metadata).

## S·1 Share cards
- **S1·1 One tag builder** `src/domains/seo/meta.ts` (pure) + tests: `pageMeta(kind, facts)` → title, description,
  canonical, openGraph (type, locale, site_name, images with type/width/height/alt), twitter
  (`summary_large_image`, image alt), `other` (product:price:amount from paise, :currency, :availability,
  :condition, :brand, :retailer_item_id, :item_group_id, og:price:standard_amount), robots
  (`max-image-preview:large` when indexable). og:title never carries the shop name; og:description ≤ 80 chars from the
  facts. Every shop route's `generateMetadata` calls it (home, products, products/page/n, product, collection,
  collection page n, policies). Verify: vitest + 64-seo.
- **S1·2 Card facts and hash** `src/domains/seo/card.ts` (pure) + tests: from the product view model / collection /
  shop → the card's content (title, price paise, MRP when on sale, sold out, COD on, photo bases, shop name, logo,
  theme colours) and `cardHash(content, TEMPLATE_VERSION)` (sha-256 hex, 16 chars). The tag builder puts
  `/og/<kind>/<id>/<hash>.jpg` in og:image. One source: the page and the card read the same view model.
- **S1·3 The image route** `src/app/s/[host]/og/[kind]/[id]/[hash]/route.ts` (Node runtime): tenant from the host
  (`shopIdForHost`), the id checked inside that tenant through `src/lib/queries/` (never trusted alone), kinds
  `product | collection | shop`; renders the card with `next/og` (flexbox, Inter woff from `src/lib/documents/fonts/`,
  no Devanagari drawn), photos read from our own storage by base URL (the 800 rung), then `sharp` → JPEG q80 sRGB,
  re-encoded down to q60 until ≤ 300 KB (else the shop card). A hash that is not the current one → 308 to the current
  URL (an old card in a chat still opens the new one). Current hash: `Cache-Control: public, max-age=31536000,
  immutable`. Unknown id, draft or unpublished shop → 404. Verify: route test + 64-seo (content-type, 1200×630,
  ≤ 300 KB, declared size = file size).
- **S1·4 Layouts** (as the mockup): product (photo fills, subject in the centred square, band: shop name, "Pay on
  delivery" chip when COD is on, price; sale: struck MRP; sold out: "Sold out"), collection (1 large + 3 small, name,
  "From ₹… · N styles"), shop (name on the theme colour, three best sellers). A product with no photo, a collection
  with none, a shop with no products → the shop card with the name only. Verify: screenshots in 64-seo at 1200×630,
  looked at.
- **S1·5 robots and crawlers**: robots.txt keeps `Allow: /` (covers `/og/`); confirm the Vercel firewall does not
  challenge the crawler UAs (owner step if a rule exists). `htmlLimitedBots` noted in frata-gotchas for the day a shop
  route turns dynamic.
- **S1·6 The shop's logo and icon**: Settings › Store details gets a Logo field (upload through the existing photo
  pipeline; `shop_settings.logo_url`, which has no setter today); `/icon/<hash>.png` (180 and 32 px, square, the logo on
  the theme colour, or the shop's initial) via the same route pattern; the shop layout's `icons` point at it (today
  `data:,`), `themeColor` from the theme. Verify: unit + e2e (icon link present, PNG served).
- **S1·7 Share sheet** `src/app/(console)/console/_components/share-sheet.tsx` (mockup board 2) on the product
  editor, the collection editor and Home: the card preview (the real `/og/` URL), WhatsApp (`https://wa.me/?text=`),
  Instagram (copy), Facebook (sharer URL), QR code, the link with Copy. Links carry
  `utm_source=whatsapp|instagram|facebook|copy|qr&utm_medium=social|qr` (built in `src/domains/seo/share.ts`, pure);
  the shop already records utm as the order's source. QR: the `qrcode` package (MIT; nothing in the tree draws QR) on
  the server, a PNG download. Verify: unit (links) + an e2e step (sheet opens, copy, QR downloads).
- **S1·8 Freshness**: integration-researcher checks the current Meta re-scrape endpoint; if verified, an outbox job on
  publish and on a price change; if not, skipped (the new image URL refreshes every app). Verify: outbox unit test.
- **S1·9 Docs and skills**: frata-design-language (share-card rules: 1200×630 JPEG ≤ 300 KB, the band, no text-heavy
  cards, no Devanagari in images), frata-architecture (`src/domains/seo/`, the image route, the tag builder as the one
  writer of tags), frata-gotchas (htmlLimitedBots), each with a version bump; spec status active → built per phase.

## S·2 Search foundations
- **S2·1 Descriptions everywhere**: defaults in `meta.ts` for lists, collections (trimmed to 155), policies, page n;
  Hindi page titles for Hindi shops.
- **S2·2 Collections**: migration — `collections.seo_title`, `seo_description`; `collection_handle_history`
  (tenant_id, collection_id, handle; grant, RLS, policy, proof row in `scripts/verify/tenancy.sql`); the editor's
  Search and sharing disclosure (mockup board 4); 308 from an old handle; the intro above the grid.
- **S2·3 Structured data**: BreadcrumbList (product, collection), WebSite (home), ItemList (collection),
  OnlineStore + free-shipping threshold and handling time; Product + brand, `gtin`/`mpn` (migration: nullable
  `variants.gtin`, `variants.mpn`, `products.no_barcode`), colour, size, material. A test: markup price and
  availability = the page's.
- **S2·4 Sitemap**: image entries, `lastmod` = `updated_at`, no empty collections, a sitemap index past 50,000.
- **S2·5 Language**: `<html lang>` per shop (`hi-IN` for Hindi shops) — the root layout reads the shop's language for
  shop hosts; og:locale.
- **S2·6 Photo descriptions**: an alt field per photo in the product editor (the action already takes `alt`), filled
  with "<title>, <colour>, <n>" by default; cards use the stored alt.
- **S2·7 Accessibility**: storefront skip link, a focus style, 24 px targets, pickers not colour-only; the
  `themes:speed` Lighthouse gate (perf ≥ 90, a11y ≥ 95, SEO ≥ 95, CLS ≤ 0.05) built.
- **S2·8 Bing**: IndexNow key file and an outbox ping on publish and edit.
- **S2·9 Out of stock**: the price stays and Add to bag is greyed, not hidden (check the buy box).

## Owner steps (start now)
- **Google OAuth app verification** for S·4: Google Cloud project "Frrata" → OAuth consent screen (external) →
  scopes `webmasters.readonly`, `content` (Merchant API) → verified domain (frrata.com) and privacy policy URL →
  submit. Review takes weeks.
- If the Vercel firewall has bot rules: allow the crawler UAs listed in S0·1.

## Repetitive work → agents and scripts (rule 6)
| Chore | Becomes |
|---|---|
| Checking every page type's tags as each crawler | `e2e/flows/64-seo.mjs` (S0·1) |
| Card size and format | the route's own 300 KB check + 64-seo |
| Costs in metadata | the S0·2 test |

## Practices recorded in skills
- UI/UX: share cards (S1·9), the share sheet pattern. Performance: tags in the static head; immutable hashed images.
- Architecture: one tag builder; card facts from the page's view model; image routes take ids, never text.
- Testing: crawl as each bot, raw `<head>` only.
