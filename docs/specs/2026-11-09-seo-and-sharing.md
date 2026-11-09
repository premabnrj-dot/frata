# Search and sharing — found on Google, sold in a WhatsApp chat
Status: active · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/P4wfSezqiVxzG4D7FsrnYM · Approved: owner, 2026-11-09 (share images JPEG — the one exception to "WebP only"; order S·0 → S·1 → S·2; Google app review started now)

Research: `docs/research/2026-11-09-seo-audit.md` (what the code does), `docs/research/2026-11-09-seo.md` (Google,
competitors, keywords, accessibility), `docs/research/2026-11-09-link-previews.md` (WhatsApp, Instagram, Facebook, X,
Pinterest, iMessage). Every third-party fact used here is dated there.

## Goal
North star problems **4 (mobile conversion)** and **5 (a premium-looking storefront)**, and the ad cost inside profit
per delivered order: a brand gets orders it did not pay an ad for — from Google (search, free Shopping listings, AI
Mode) and from links its shoppers and the brand share on WhatsApp and Instagram.
**Measures** (all from data we already capture or will): share of delivered orders whose first visit came from
organic Google, `srsltid` (free listings) or a share link (`utm_source` from our Share button); Search Console clicks
per shop (S·4); share of shops with 0 search-health issues; WhatsApp large-preview rate in the QA run (100%).

## Job
A brand owner who sells through Instagram and WhatsApp wants every link they paste to look like a shop window (photo,
price, name) and their products to appear when someone in India searches "rust cotton kurta set" — without learning
SEO, and without a developer.

## Research — taken
- **Shopify**: sitemap, product markup and title defaults built in; alt text manual. *Taken:* everything automatic by
  default; *not taken:* leaving alt to chance.
- **Wix**: auto 301 on URL change, IndexNow on publish, an "AI visibility" panel. *Taken:* redirects on every rename
  (collections too), IndexNow for Bing. *Not taken:* llms.txt panel (Google ignores llms.txt, 2026-07-10).
- **Dukaan / Instamojo**: a title/description form and a sitemap URL to submit by hand. *Taken:* nothing — that is the
  bar we clear by doing it for them.
- **Google** (2026): Merchant listings markup with one org-level return/shipping policy; variants as ProductGroup;
  canonical in the first HTML; lastmod only if accurate; free listings in India; Merchant API v1 only; AI drafts must
  be reviewed by a person; Search Console shows the queries that reach a brand's Instagram. *Taken:* all of it.
- **Link previews**: one 1200×630 **JPEG ≤ 300 KB**, key content in the centred square, clean og:url, `twitter:card`
  `summary_large_image`, `og:type product` + price tags (Pinterest Rich Pins, Meta catalogue microdata), no text-heavy
  images (Apple), no Devanagari in generated images (Satori cannot shape it). *Taken:* all of it.
- **Accessibility**: draft RPwD (Amendment) Rules 2026 would make IS 17802 mandatory for e-commerce in 12–18 months and
  ask platforms to guide accessible content at upload. *Taken:* alt at upload, a conformance report, WCAG 2.2 AA gates.

## Design (phases; each usable on its own; mockup first)

### S·0 Regression net (before any change)
An e2e flow `e2e/flows/64-seo.mjs` that fetches each page type (home, product, collection, list page n, policy,
archived product, unpublished shop) **as each crawler** (WhatsApp, facebookexternalhit, Twitterbot, Pinterestbot,
TelegramBot, LinkedInBot, Googlebot) with `node:http` and asserts: 200, every tag inside the raw `<head>`, canonical and
og:url clean when the request carries `utm_*`, JSON-LD parses and matches the visible price, sitemap and robots. Unit
tests for every builder below. This is the net for every later phase.

### S·1 Share cards (what the owner asked first)
1. **One tag builder** `src/domains/seo/meta.ts` (pure): per page type → title, description, canonical, og:*,
   twitter:*, product:*. Every shop route's `generateMetadata` calls it; no route builds tags by hand.
   - Product: og:type `product`, product:price:amount (from paise), :currency INR, :availability, :condition new,
     :brand (the shop), :retailer_item_id, :item_group_id; og:price:standard_amount when on sale.
   - og:title without the shop name; og:site_name the shop; og:description ≤ 80 characters, the selling line
     ("₹1,499 · Cotton · Pay on delivery").
   - og:locale `en_IN` / `hi_IN`; `max-image-preview:large` on indexable pages.
2. **Generated share images** at `/og/<kind>/<id>/<hash>.jpg` on the shop's own host: `next/og` renders PNG, `sharp`
   (already installed with Next) makes a JPEG ~q80; the route refuses anything over 300 KB (re-encodes lower). The hash
   covers what the card shows (title, price, availability, photo ids, shop name, logo, template version), so an edit
   makes a new URL and every app fetches the new card; the response is immutable for a year. Rendered once per version
   and served from the CDN — the spirit of ADR-0005 ("made once"); **decision for the owner**: a JPEG exception to
   "WebP only" for share images (WhatsApp, Facebook and LinkedIn document JPEG/PNG only).
   - **Product card**: the photo fills the frame (subject kept in the centred 630×630 square); one slim band: price in
     large digits, the shop name or logo, "Pay on delivery" when COD is on. Sale: struck MRP.
   - **Collection card**: one large + three small photos, the collection name, "From ₹799 · 24 styles".
   - **Shop card**: the logo (or name) on the theme's colour with three best sellers.
   - Policies and pages: the shop card. No Devanagari drawn into images; Hindi shops get Hindi og:title/description
     (the phone lays it out).
3. **Share from the console**: a Share button on a product, a collection and Home: WhatsApp (opens WhatsApp with the
   link), Instagram (copies the link for a Story sticker or bio), Facebook, Copy link, **QR code** (PNG to print on
   packaging and at stalls). Each link carries `utm_source=<channel>&utm_medium=social|qr`; the shop already records it
   as the order's source (Analytics). The card preview is shown beside it.
4. **The shop's own icon**: a logo setter in Settings › Store details (today `logo_url` has no setter at all) →
   favicon, apple-touch icon (180 px, square, on the theme colour), theme-color; JSON-LD logo.
5. **Freshness**: on publish and on a price change, an outbox job asks Meta to re-scrape the clean URL (endpoint to be
   checked by integration-researcher before building; skipped if unverifiable — the new image URL already refreshes
   WhatsApp and X).

### S·2 Search foundations (automatic, nothing for the merchant to do)
- **Descriptions everywhere**: pure defaults for lists, collections (trimmed to 155), policies, pages n.
- **Collections as landing pages**: SEO title and description fields, an intro shown above the grid, and **handle
  history with 308** like products (a rename today breaks the old link).
- **Structured data, complete and true**: BreadcrumbList (product, collection), WebSite (home), ItemList
  (collection), OnlineStore adds the free-shipping threshold and handling time already passed in; Product adds
  brand, **GTIN / MPN** (new optional fields; "This product has no barcode" sets identifier_exists false for feeds),
  colour, size, material. A unit test holds markup = visible price/availability.
- **Sitemap**: image entries, `lastmod` = the last real edit, no empty collections, an index past 50,000 URLs.
- **Language**: `<html lang>` follows the shop (`hi-IN` for Hindi shops; today it is always `en-IN`), Hindi page
  titles. hreflang waits until a shop has both languages (YAGNI).
- **Alt text**: an alt field per photo in the product editor, filled with a default ("Rust cotton kurta set, front")
  the merchant can change; cards use the stored alt.
- **Accessibility in every theme** (WCAG 2.2 AA / IS 17802): skip link, a storefront focus style, 24 px targets,
  pickers never colour-only; `themes:speed` (Lighthouse perf ≥ 90, a11y ≥ 95, SEO ≥ 95, CLS ≤ 0.05) built as the gate
  the themes plan promised.
- **Bing**: IndexNow ping on publish and edit (outbox). Google ignores it; Bing powers ChatGPT search.
- **Out of stock**: the price stays, the button greyed (not hidden) — Google's 2026 Merchant rule.

### S·3 Search and sharing page (console)
Under Store: **Search and sharing** — one list of fixes, each with a count and a link straight to the fix:
"6 photos without a description", "2 collections without an intro", "3 products with the same title", "Products
without a barcode (Google Shopping)". Below: how Home looks on Google (editable title and description) and on
WhatsApp. No score, no explanations (Rule 0); a fix disappears when done.

### S·4 Google and Meta (the biggest lever; needs Google's OAuth review — start the app verification now)
- **Search Console**: "Connect Google" (OAuth, read-only) — verify the shop's address, submit its sitemap, and show
  the top searches and clicks in Analytics. Own domains (D·2) verify by DNS.
- **Google Shopping free listings** through **Merchant API v1**: products, prices, stock and the shop's return and
  shipping policy kept in sync from our rows (the outbox); AI-written text labelled as Google requires.
- **Meta catalogue** (Instagram product tags on Reels are open in India since 2026-03; WhatsApp catalogue messages):
  a feed from the same rows. Overlaps roadmap Phase 5 (Channels); built there, specified here.

### S·5 Automations
- **AI drafts the merchant approves**: alt text and descriptions from the photo and attributes, shown as a draft,
  never published unseen (Google's scaled-content and Merchant labelling rules).
- **Reviews from delivered orders** (a WhatsApp ask after delivery) → real AggregateRating: its own spec.
- **Collections from real searches**: from Search Console queries and the festive calendar ("Diwali edit" three weeks
  before), a suggestion on Search and sharing.
- **Broken links**: a weekly check of the shop's own links (theme sections, descriptions); a fix in the list.
- **Accessibility conformance report**: a platform page, kept current with the gates.

## Design review
- **UI/UX** — Job per surface: shopper sees a card that sells; merchant shares in two taps; fixes in one list.
  States: no photos (shop card), sold out (card says "Sold out"), sale, Hindi shop, no logo (name in the theme font),
  unpublished shop (no cards: robots blocks crawlers — wanted), phone width (Share is a sheet). Feedback: "Link copied";
  QR downloads. Keyboard: every share option a button. Norman: the preview is the signifier — the merchant sees the
  card before sending; defaults do the work; recognition over recall (counts, not rules).
- **Tenancy** — the image route reads through `src/lib/queries/` with the tenant from the host (never from the URL's
  id alone: the id is checked against that tenant); new columns (collection seo fields, handle history table with
  tenant_id + RLS + policy + proof row; product gtin/mpn) in one migration with the proof; feeds and Google tokens are
  per-tenant rows sealed like Razorpay keys. `tenancy-auditor` on the plan.
- **Modularity** — `src/domains/seo/` (pure: tags, defaults, JSON-LD, checks, card layout data), `src/lib/queries/`
  (reads), route handlers for images/sitemap, `_components/share-sheet.tsx` in the console; connectors in `src/lib/`
  per integration.
- **SSOT / DRY** — price, availability and title are read once (the product view model) and feed page, tags, JSON-LD,
  card and feeds; one tag builder; one alt per photo; health checks derive from rows (no stored score).
- **YAGNI** — no SEO score, no keyword tool (needs an Ads account), no blog, no llms.txt, no hreflang until two
  languages, no Google Business Profile (online-only brands are not eligible), no Indexing API (forbidden for
  products), no auto-translation (spam policy). Signals to bring each back are in Out of scope.
- **KISS** — S·1 is one builder, one image route, one share sheet, one setting. sharp is already in the tree.
- **Scalability** — images render once per version (500 shops × ~200 products ≈ 100k renders over a catalogue's
  life, spread over edits); immutable CDN cache; sitemap index past 50k.
- **Performance** — tags in the static head (ISR); no new client JS on the storefront; image route ~200–400 ms once;
  `<head>` well under 300 KB; card ≤ 300 KB.
- **Reliability** — a failed render answers with the shop card (rendered when the shop is published), so a link
  never previews blank; outbound calls (Meta re-scrape, IndexNow, Google) through the
  outbox with retries.
- **Security** — the image route takes ids only, never text or prices from the query; rate-limited by the CDN cache;
  Google tokens sealed, read-only scope; feeds expose price only (ADR-0003: no cost reaches a browser or a feed — a
  test asserts it); crawlers never challenged by the firewall. `security-reviewer` on the plan.
- **Unit economics** — near-zero: renders cached; Merchant Center, Search Console, Meta catalogue are free; Google OAuth
  verification is a one-time lead time. Organic orders lower ad cost per delivered order (the measure).
- **Blast radius** — every shop route's metadata (S·0 holds it), `robots.txt` (allow `/og/`), the storefront head,
  root layout (`<html lang>`), the product and collection editors, Settings. Footgun: Next streams metadata after
  `<head>` for unknown bots if a shop route ever turns dynamic — set `htmlLimitedBots` then (it replaces the default).

## Out of scope (and what brings it back)
- llms.txt — an AI engine that documents using it. hreflang — a shop with both languages translated and reviewed.
- Blog — merchants asking to write; lookbooks cover first-hand content now.
- Keyword research tool — Search Console data proves too thin for suggestions.
- Pinterest catalogue — India availability confirmed.
- Short links (`/s/abc`) — QR codes on packaging need shorter URLs than the product address.

## Facts used
All in the three research files, each with source and date.
