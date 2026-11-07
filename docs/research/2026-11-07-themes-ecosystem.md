# Themes and a customizer for Frrata shops

Status: research + proposal · Date: 2026-11-07 · Approved: pending (owner calls in § 12)
North star: problem (5) a premium-looking storefront, with (4) mobile checkout conversion. A faster, better-looking
shop turns more Instagram visits into delivered orders, and the delivered-order fee is how Frrata earns.
Sources: every external fact carries the date it was checked (2026-11-07) and the page's own date where it has one.
Shopify's developer docs are live but undated; they are marked "undated, live". Anything older than 12 months is
marked "no current source" (frata-planning § Step 2).

## 0. Summary and recommendation (10 lines)

1. **Build data-only themes, not a code-theme platform.** A theme is a versioned JSON manifest of tokens, layout
   variants and page templates. Each template lists sections from one shared library of React Server Components
   that Frrata owns. A merchant's edits are a separate JSON document, checked against that version's schema.
2. **No templating language of our own (no Liquid clone), no uploaded JS, no custom HTML.** Shopify needed Liquid
   because outsiders write theme code. For years Frrata's themes are written by its own team. A DSL would be a
   second rendering layer and a sandbox to keep secure: LiquidJS shipped three sandbox-bypass CVEs in 2026.
3. **"Shortcodes" become typed product sources** (New in, Best sellers by delivered units, Back in stock, Under ₹X,
   a collection, an occasion). They are pure filters, resolved on the server. Modules (Reviews, Size and fit) plug into
   themes through the existing `<ModuleSlot>`, the same idea as Shopify app blocks.
4. **Safety comes from the architecture, checked by gates.** Sections bind only to shopper-safe types, so ADR-0003
   holds by construction. Gates: a check on the theme manifest, a Lighthouse CI budget on fixture shops, the existing
   120 kB script budget, and RUM field data per shop.
5. **Phases:** T0 turns today's views into the section library (no visible change). T1 is a customizer with 3–4
   free Frrata themes, draft → preview → publish, and rollback. T2 adds PDP and collection templates, module slots
   and Hindi. T3 adds the gallery, premium themes and Admin release tooling. T4 lets partners author themes as data,
   but only when partners ask for it.
6. **Money:** themes are free in every plan at first. The fee on delivered orders gains more from conversion than
   any theme sale would. Premium themes come later as a "theme licence" with the same shape as `tenant_addons`,
   which reuses `offerFor` and its trial badge. A partner share starts as a hypothesis of 70/30.
7. **Effort:** about 7–10 agent-weeks for T0 through T3. T4 is a decision for later.

## 1. Where Frrata is today (codebase, 2026-11-07)

| What exists | Where | What it means for themes |
|---|---|---|
| Theme tokens: `accent` (5 values) and `display_font` (3) on `shop_settings`, with CHECKs | `src/lib/db/schema.ts:226`, `globals.css:329` (`[data-store-theme][data-accent=…]`) | The token model works. It is too small, and its values sit in columns, not in a theme |
| One rendering of a shop | `src/components/storefront/*` (shell, pages, product-view, card, photo, json-ld) | This becomes the section library. Console preview and Settings already reuse it |
| Display fonts loaded only by shop pages | `src/components/shop-preview/fonts.ts` (Fraunces, Cormorant, Inter) | Font strategy: `next/font`, self-hosted, `swap` |
| ISR per path, `force-static`, revalidate 60 s, tags `shop:<id>` and `shop:<id>:catalogue` | `src/app/s/[host]/layout.tsx`, `src/lib/queries/storefront.ts:32`, `refreshShop()` | Publishing a theme is one `refreshShop(tenantId,'shop')` |
| Storefront script budget of 120 kB gzipped, ISR check, no Bricolage in shops | `scripts/check-storefront-build.mjs` | The performance gate exists. Add Lighthouse and a theme check |
| Cost fields fail the build in any browser chunk | `scripts/check-client-bundle.mjs`, `cost-sentinels.mjs` | ADR-0003 is already enforced at build time |
| JSON-LD with `<` escaped; sitemap; robots; `noindex` while opening soon | `json-ld.tsx`, `sitemap.xml/route.ts`, `_shop.ts robotsFor` | SEO is part of the platform, not the theme |
| CSP: `frame-ancestors 'none'; object-src 'none'; base-uri 'self'` and **deliberately no script-src** | `src/lib/security-headers.ts` | No third-party code runs on a shop today. Keep it that way |
| Modules: registry, `moduleAccess()`, `offerFor()` (trial badge), `tenant_addons` with `trial_ends_at`, `addon_prices` versions, `<ModuleSlot>` with a `storefront.product` slot | `src/domains/modules/*`, spec `2026-11-07-modules-foundation.md` | Premium themes and app blocks reuse these patterns |
| `CAN_BUILD` = owner, admin, partner: "catalogue, the look, the shop's own settings" | `frata-architecture` § Auth | Who may edit and publish a theme is already decided |

The research note `2026-11-07-fashion-modules-and-next-milestone.md` lists problem 5 as "Built (themes)". Today
that means 5 accents × 3 fonts. The partner research (U3) names "no theme code" as a gap partners will feel.

## 2. How others do it (dated)

| Product | Model | Facts (checked 2026-11-07) | Taken / not taken |
|---|---|---|---|
| **Shopify Online Store 2.0** | Code themes (Liquid). JSON templates list sections. Sections hold blocks. `settings_schema.json` defines the global settings | A JSON template renders **up to 25 sections, 50 blocks each**. A theme can hold 1,000 JSON templates. Merchant edits live in the template JSON. Section code is the theme's (shopify.dev JSON templates, undated, live). Theme blocks sit in `/blocks`, can be reused and nest. App blocks come in through `@app` (shopify.dev theme blocks, undated, live). Setting types include color, color_scheme, font_picker, image_picker, richtext, link_list, video, liquid, html (shopify.dev settings, undated, live) | **Taken:** templates are data, sections are code, merchant values are kept apart from code, presets, block limits. **Not taken:** `liquid` and `html` setting types, which let a merchant run code |
| **Shopify Theme Store** | Reviewed marketplace | Lighthouse **performance average ≥ 60 and accessibility ≥ 90** across home, product and collection pages, desktop and mobile. Prohibited: minified CSS/JS (except libraries), external scripts not on Shopify's servers, themes based on Dawn or Horizon, fake urgency, features that depend on an app. At least 4 colours; every background has a foreground; fonts only through `font_picker` (shopify.dev requirements, undated, live). Review runs in 5 stages (shopify.dev review process, undated, live). **15% revenue share on gross**, no submission fee (shopify.dev revenue share, undated, live). Theme app add-ons on listings (shopify.dev changelog, **2026-10-28**). Paid themes cost about $100–500 one-time; a dataset of 306 paid themes has a **$315 median** (shopthemedetector, updated **2026-08-30**) | **Taken:** a written, checkable bar per theme; a review queue; no fake urgency. **Our bar is higher:** mobile performance ≥ 90 (the storefront spec) |
| **Shopify Theme Check** | A linter for Liquid and JSON, in the CLI, CI and the VS Code language server (shopify.dev, undated, live) | — | **Taken:** a gate that runs before review (our `check:theme`) |
| **Theme app extensions** | Apps inject blocks without touching theme code | Enforced: **10 MB in total, 30 blocks, 100 KB of Liquid**. Suggested: **≤ 10 KB of compressed JS and ≤ 100 KB of CSS** per block. "Apps don't edit theme code" (shopify.dev configuration, undated, live). Script tags are going away: apps must move to extensions or web pixels (The4, Editions Fall '26 summary, **2026-10-29**) | **Taken:** modules render into named slots and never edit the theme. Per-block budgets |
| **Shopify Horizon / Canvas** | Nested theme blocks, AI-written blocks, then the Canvas editor | Summer '26 (released **2026-06-17**): native A/B tests, scheduled and gradual publishing for themes (shopappy, easysellapp, June 2026, third-party). Fall '26: a new theme architecture with "typed contracts, partial updates", built-in Tailwind, markdown files that guide the AI, and only the CSS each page uses (The4, **2026-10-29**, third-party summary of Shopify's page) | **Taken:** typed section contracts, per-page CSS, scheduled publish (later). **Not taken now:** AI-generated code blocks |
| **Dawn** | Shopify's reference theme | "HTML-first, JavaScript-only-as-needed". Features default to "no" until they are lean, fast and reliable. Rendered on the server (github.com/Shopify/dawn README, undated, live) | **Taken:** the principle, word for word, as the section-library rule |
| **Hydrogen** | Headless React (React Router 7) on Oxygen | `@shopify/hydrogen@2026.4.0` (2026-04-09), released quarterly (askphill, qualimero, 2026, third-party) | **Not taken:** a separate headless framework. Frrata already is Next + RSC; a "theme" is data for that app |
| **WordPress block themes** | `theme.json` (v3, WP 6.6): `settings` hold presets and `styles` hold values. Presets become CSS variables `--wp--preset--color--x`. User changes are a separate origin in the same format (developer.wordpress.org, updated **2026-10-20**) | — | **Taken:** tokens as presets that become CSS variables; the merchant layer has the same shape as the theme layer, so a merge is a plain overlay |
| **Elementor** | A page builder on WordPress | V4 "atomic" elements claim "no additional wrapper layers … improved Core Web Vitals", but mixing v3 and v4 widgets makes gains vary (elementor.com v4 FAQ, 2026). The WordPress ecosystem had **11,334 new vulnerabilities in 2025 (+42%)**, ~91% in plugins and ~9% in themes (Patchstack, *State of WordPress Security in 2026*, via secondary reports, 2026) | **Not taken:** free-form layout (DOM bloat, slow pages, merchants breaking their own shop) and third-party code in the page. A cautionary tale |
| **BigCommerce** | Stencil (Handlebars themes, marketplace with review) + Catalyst (Next.js) + Makeswift visual editor, now also on Stencil (bigcommerce.com blog, 2026) | — | **Taken:** a visual editor over React components, the Catalyst/Makeswift pattern, which is the closest match to Frrata |
| **Puck** | An MIT React visual editor. Components are `fields` plus `render`. RSC opt-in. v0.24.0 (29 Oct; the release page shows no year, current per the docs banner) added field groups and tabs; v0.23 added an outline and i18n of the editor UI (github releases, puckeditor.com, 2026) | — | **Candidate** for the customizer canvas in T1–T2 (§ 6.4). Spike it before building our own |
| **Builder.io / Plasmic** | Hosted visual editors over your React components. Plasmic is open source; Builder is commercial (third-party comparisons, 2026; pricing conflicts across sources) | — | **Not taken:** a hosted editor means merchant content lives with a vendor, and it adds a script and a network hop |
| **Webflow** | Template marketplace. Creators get **95%**; Webflow keeps 5% for payments (webflow.com blog, 2025-10-24) | — | Shows what a creator share can be when the platform only takes payments |
| **Wix Studio** | Partner template marketplace; template sales paid with the partner's revenue share (support.wix.com, 2026) | — | — |
| **Squarespace** | First-party templates. Third-party templates are sold off-platform at $99–495 (jpkdesignco, 2026) | No official marketplace found | Shows demand for premium looks without a platform marketplace |
| **Dukaan** | A handful of named themes (Nirvana, Ursa…) applied under Appearance. Counts conflict: 5 vs 21 (dukaan.help.center; reviews, 2026) | — | **Taken:** pick a theme, then tweak colours and fonts, in one screen |
| **Instamojo** | Customize Store has five tabs: Getting started, Themes, Fonts, Colors, Pages. Scripts and favicon sit in the dashboard (Instamojo help centre, storefront v2, undated) | 20+ themes (Shiprocket blog, 2025) | **Taken:** a short, flat customizer for small merchants |
| **Shiprocket, Bikayi** | No current source found for a theme system | — | — |

**The pattern that matters:** every platform that let outside code into the page (WordPress plugins, Shopify script
tags) is now walking it back toward declarative extension points (theme app extensions, web pixels). Frrata can
start where they are heading.

## 3. Light, safe, fast, SEO: the tools (Q1)

### 3.1 Budgets and gates (all automatable, rule 6)

| Gate | What it holds | Status |
|---|---|---|
| `check:storefront-build` | 120 kB gzipped first-load JS per shop page; ISR per path; no shell fonts | **Exists** |
| `check:client-bundle` | No cost field in any browser chunk (ADR-0003) | **Exists** |
| **`check:theme`** (new) | Each theme manifest parses with the Zod schema. Each section has a schema, a preset, defaults and fixtures. Each colour pair in each preset is ≥ 4.5:1 text and ≥ 3:1 UI (reuse `check:contrast`'s maths). Section count ≤ 25 per template, blocks ≤ 50 (Shopify's numbers, good defaults). No section imports a client component without being listed as an "island" with a byte budget. Every image setting has a ratio. Every text setting has a max length | New, T0 |
| **Lighthouse CI** (new, in CI) | Each theme × each preset on a fixture shop with real photos: home, collection, product. **Mobile, slow 4G, Moto-class CPU.** Assert performance ≥ 90, accessibility ≥ 95, SEO ≥ 95, best practices ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.1, total byte weight ≤ 1 MB, LCP image eager with `fetchpriority=high`. Run with `treosh/lighthouse-ci-action` (v12 per 2026 guides; confirm on the repo) or `@lhci/cli` against `next start` | New, T0 |
| **Visual regression** | Playwright screenshots per section × preset × 360/768/1280 px. Guards theme updates against breaking a merchant's page | New, T1 (extends `npm run e2e`) |
| **Field data (RUM)** | `web-vitals` (≈ 2 kB) beacons LCP, INP and CLS to one endpoint, through `webhook_events`-style insert and no third party. Stored per shop and day. Admin sees the shops with p75 over the line. Thresholds: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1** at p75 (web.dev/articles/vitals, last updated 2024-10-31: **no current source**; thresholds unchanged in practice). CrUX only covers origins with enough traffic, so most small shops will have no CrUX data. Own RUM is needed | New, T2 |

### 3.2 Platform rules that themes inherit and cannot change

- **Images:** the 1A ladder (400–1600 WebP) through `srcSet`/`sizes`. Every image setting declares a ratio
  (4:5 cards, 3:4 or 9:16 for heroes on a phone), so space is reserved (CLS). The first hero is eager and
  `fetchpriority=high`, everything else lazy. **No video autoplay above the fold on a phone.** Reels sections show a
  poster and load the video on tap. Merchants upload once; the pipeline makes the sizes. Themes never ship images
  except their demo content.
- **Fonts:** a short, curated list of pairings served by `next/font` (self-hosted, `display: swap`, subset,
  `adjustFontFallback` for CLS). At most 2 families and 3 weights per theme. A **Devanagari pairing** (for example
  Mukta or Noto Serif Devanagari with a Latin display face) for Hindi. No merchant font upload in T1–T3: a bad
  font file is a performance and licence risk. This matches Shopify's "fonts must use `font_picker`".
- **JS:** sections are Server Components. Islands are allowed only for bag, size sheet, gallery swipe and the
  variant picker, each with a byte budget in `check:theme`. No carousel library. Scroll-snap CSS does the job
  (already used on Home).
- **CSS:** Tailwind with tokens as CSS variables under `[data-store-theme]`. A theme is a set of variable values,
  never new CSS files. That keeps per-theme CSS at about 0 kB, like Shopify's per-page CSS (Fall '26).
- **SEO is the platform's, never the theme's:** titles, canonical, `robots` (`noindex` while opening soon), the
  sitemap, JSON-LD. **Merchant listing** needs `name`, `image`, `offers.price` > 0 and `priceCurrency`. It recommends
  `size`, `color`, `isVariantOf`/`ProductGroup`, `shippingDetails` (deliveryTime with handling and transit days),
  `hasMerchantReturnPolicy` (`applicableCountry`, `returnPolicyCategory`, `merchantReturnDays`), ideally once
  site-wide on `Organization` (developers.google.com merchant listing, undated, live). A theme cannot remove or change
  structured data. It can only choose where visible content goes. Breadcrumbs, `ItemList` on collections and
  `aggregateRating` (once Reviews ships) come from the platform.
- **Headings and landmarks** belong to the section library (one h1 per page, the section order sets heading
  levels), so no theme produces a page without an h1 or with three of them.

### 3.3 CSP

- Today there is no `script-src`. That is deliberate: a nonce forces dynamic rendering, and shops must stay cached.
  The Next.js docs confirm it: nonce CSP means "all pages must be dynamically rendered … ISR disabled … PPR
  incompatible" (nextjs.org CSP guide, **lastUpdated 2026-03-20**).
- A route to a strict policy that keeps ISR: **`experimental.sri`** (hash-based, build-time) with `script-src 'self'`.
  It is experimental, and Next's inline RSC payload scripts may still need hashes. **Spike in T0:** build with SRI,
  serve with a report-only `script-src 'self'` on shops, and read the violations before enforcing.
- Whatever the result, **data-only themes add no script origin**, so the CSP never has to widen for a theme. Add
  `form-action 'self'` plus the Razorpay hosts, and `img-src` for our media host, in report-only first.

## 4. The catalogue for fashion: what a merchant can choose (Q2)

### 4.1 The model: themes are presets over one shared section library

| Option | What it is | Verdict |
|---|---|---|
| A. **Presets over a shared section library** (data-only themes) | A theme is a manifest: tokens, variants and templates that reference library sections. New look = new manifest. New capability = a new section in the library, available to every theme | **Recommended.** Everything below is built once; QA, a11y and performance are held per section, not per theme × section |
| B. Code themes (each theme its own components) | Each theme ships its own React or Liquid code | Only for a theme whose look the library cannot express. Even then, add the section to the library instead |
| C. Free-form page builder (Elementor-style) | Any element anywhere, styles per element | Rejected: layout breakage on phones, DOM bloat, and no way to hold a performance bar |

**Layers, each a JSON object of the same shape (WordPress's origins idea):** platform defaults → theme version
manifest → theme preset (a "style", e.g. "Haldi" or "Indigo") → the merchant's customizations. Rendering merges
them top-down in one pure function `resolveTheme()` in `src/domains/themes/`.

### 4.2 Global settings (tokens)

| Group | Settings (each a typed choice, never free CSS) |
|---|---|
| Colour | Colour **schemes** (Shopify's pattern): background, text, muted text, line, accent, accent text, sale. 2–4 schemes per theme. A section picks a scheme, and contrast is checked per scheme |
| Type | A pairing from the curated list (display + body). Scale: compact / regular / large. Display case: as typed / uppercase. Letter spacing: tight / normal / wide |
| Shape | Corner radius: 0 / 4 / 12. Buttons: solid / outline / underline. Borders vs no borders |
| Density | Spacing: airy / regular / dense (sets section padding and grid gaps) |
| Imagery | Card ratio 4:5 / 3:4 / 1:1. Second photo on hover: on/off. Image corners follow the radius |
| Brand | Logo (wide or square variant), favicon, the shop's name style |
| Motion | None / subtle (uses the motion tokens, honours `prefers-reduced-motion`) |

### 4.3 Header and navigation variants

Classic (logo left, links) · centred logo with split nav · minimal (hamburger + search + bag) · mega menu (collections
with an image each) · **story circles** (round category tiles under the header, the Instagram idiom many Indian D2C
shops use) · bottom tab bar on phones (Home, Shop, Search, Bag) · announcement bar (one line, optional link,
rotation only by user tap) · sticky / hide-on-scroll / static · transparent over the hero (needs contrast on the
hero image: the theme forces a scrim).

### 4.4 Footer variants

Compact (one row) · three columns (today's) · with a newsletter or **WhatsApp opt-in** (consent wording from the
platform) · Instagram grid (merchant-uploaded images, no Instagram embed script) · trust strip · policies are
always present (legal; the theme cannot remove the grievance officer or policy links).

### 4.5 Home and landing sections

| Section | Notes for fashion in India |
|---|---|
| Hero: image, split image + text, video poster, two-up | One message, one button. A carousel is not offered: rotating heroes hurt LCP and are rarely seen past slide 1 |
| Collection tiles / category circles / occasion tiles (Festive, Wedding guest, Office, Everyday) | Occasion maps to a product attribute or collection |
| **Product rail or grid with a source** | See § 4.7. 2 columns on a phone, 4 on desktop |
| Price-point tiles ("Under ₹999", "₹1,000–1,999") | Generated from a price source |
| Lookbook / **shop the look** | An editorial photo with product hotspots (tap opens a sheet with sizes) |
| Editorial: image + text, quote, brand story, the maker or craft (handloom, block print) | Long-form text uses the rich-text AST (§ 7) |
| Reels / video strip | Posters only, tap to play; ≤ 6 items |
| UGC / Instagram grid | Uploaded photos (no embed script); later from Reviews |
| Reviews strip | Through the Reviews module slot (§ 7.12) |
| **Trust strip** | Derived from settings, never typed: "Pay on delivery", "Free shipping above ₹1,999", "7-day exchange", "Ships in 2 days". The merchant toggles which; the words come from the facts, so they cannot lie |
| Sale / festive banner with an end date | An honest end date from a real sale. No countdown that resets. The CCPA 2023 dark-pattern guidelines are already in the design language. Shopify bans fake urgency too |
| Drop teaser ("New collection on 12 Nov") | Ends itself when the date passes |
| Gift guide, size and fit promise, FAQ, press logos, newsletter / WhatsApp signup, marquee text, spacer | Small, cheap sections |

### 4.6 Product, collection and card templates

- **Product page:** gallery stacked / swipe / grid-2. Buy box sticky on desktop. The order fixed in the design
  language (gallery → title → price → colour → size → Add to bag → COD, delivery, returns → description) cannot be
  reordered by a theme. Variants: sizes as buttons, swatches. Blocks after the buy box: complete the look (manual),
  similar items (source), recently viewed (client, localStorage, one island), the size chart sheet, **slots for
  Reviews and Size and fit**.
- **Collection page:** banner on/off, grid 2/3/4, filters (size, colour, price, fabric, occasion), sort, quick add
  (an island, off by default), infinite scroll **no**: "Load more" keeps the footer and Back working.
- **Card:** ratio, hover image, swatches, one badge (New, Sale, Bestseller, Pre-order, Made to order), price "From ₹".

### 4.7 Product sources (the "shortcodes")

A source is a pure function `(catalogue, facts, params, now) → productIds` in `src/domains/storefront/sources.ts`,
next to `listing.ts` and `picker.ts`. A section setting picks a source and its params. Resolved on the server,
inside the cached shop read.

| Source | Params | Fact it needs | Note |
|---|---|---|---|
| New in | days, limit | `listed since` | Exists as Home's "New in" |
| A collection (hand-picked or rule-based) | handle | collections | Exists |
| **Best sellers** | window 30/90 days | **delivered units per product** (a server-side count, cached with the catalogue tag) | Ranked by delivered, not placed (the north star). Only the order reaches the page, never the counts |
| Back in stock | days | stock change timestamps | — |
| On sale | — | compare-at > price | — |
| Under ₹X / price band | paise | price | — |
| By attribute (occasion, fabric, colour) | attribute, value | product attributes | — |
| Pre-order / made to order | — | availability | Exists in the catalogue |
| Similar to this | — | category + attributes | Product page only |
| Recently viewed | — | the browser's own list | The only client source |
| **Never a source:** "most profitable", "highest margin" | — | — | A ranking by margin leaks cost order to shoppers (ADR-0003, § 8) |

## 5. Free, paid, trial (Q3)

### 5.1 How it maps onto modules

Themes are **not modules**. A module is a capability with switches, outbox kinds and slots. A theme is a look, and
exactly one is published per shop. They share the **billing shape**:

| Module fact | Theme equivalent | Reuse |
|---|---|---|
| `addon_prices` (versioned, paise) | `theme_prices` (theme, version, kind `free` \| `one_time` \| `monthly`, price paise, trial_days) | Same pattern |
| `tenant_addons` (starts, ends, trial_ends_at, created_by; Admin-written) | `theme_licences` (same columns + theme_id) | Same pattern, same RLS posture |
| `moduleAccess()` | `themeAccess(facts, now)` → `{ licensed, how: 'free' \| 'plan' \| 'bought' \| 'trial', trialEndsAt }` | Pure, tested like `access.ts` |
| `offerFor()` | `themeOfferFor()`: badge "Free", "In Growth", "₹4,999 one-time", "Trial · 5 days left"; one action "Use this theme", "Try free for 14 days", "Buy · ₹4,999" | Copy the shape. Do not overload the module function |

### 5.2 Trials: preview-first, so a shop never breaks

- **Every theme, paid or not, can be customized and previewed in draft for free, with no time limit** (Shopify lets
  merchants preview paid themes in their own admin, per third-party guides 2026). Nothing reaches shoppers.
- **A live trial** (published for N days) is a T3 option, not a default. When it ends, the shop **must not change in
  front of shoppers without warning**. Rule: the console warns at 3 days and at 1 day. At expiry the shop keeps the
  published revision for a 7-day grace with a console banner, then falls back to the last published revision of a
  licensed theme. The draft is kept. `audit_events` records it.
- One-time purchase = a licence with no `ends_at`. It covers updates of that major version. A new major version
  can be free or an upgrade price (a hypothesis).

### 5.3 Prices (hypotheses, unit-economics rule 1)

| Figure | Value | Source · date | Test |
|---|---|---|---|
| Frrata's own themes | Free in every plan (T1–T2) | proposal · 2026-11-07 | Publish rate and conversion vs the default |
| Premium themes | ₹2,999–7,999 one-time ex GST, or "in Growth and up" | Shopify median $315 (shopthemedetector 2026-08-30); Indian merchants are price-sensitive and Dukaan bundles themes in its plan | Smoke test: a "Buy" button on 2 premium themes, count clicks vs previews over 60 days before building billing |
| Partner share of a theme sale | **70% to the author, 30% to Frrata** of the price ex GST, net of refunds | Shopify keeps 15% of gross (shopify.dev, undated, live); Webflow keeps 5% (2025-10-24). Frrata also hosts, reviews, supports and keeps the theme fast | `unit-economics-reviewer` before T4. Do 5 partners author at 70%? |
| Revenue from theme sales | Small next to the delivered-order fee | — | Model: a +0.2 pp conversion lift on a Growth shop is worth more to Frrata (1% of delivered value) than one ₹4,999 sale a year. Check with 3 shops |

Billing runs through Phase 6 (Razorpay subscriptions or one-time orders), like add-ons. Until then Admin grants
licences by hand, as it does for add-ons and trials.
GST on a partner payout and TDS on payments to partners are **open questions for the CA** (no source checked).

## 6. How themes are made (Q4)

### 6.1 Who builds what, by phase

| Phase | Author | Medium | Review |
|---|---|---|---|
| T0–T3 | Frrata's team | **Code in this repo**: sections in `src/components/storefront/sections/<name>/` (component + Zod settings + preset + fixtures); themes as `src/themes/<key>/manifest.ts` (typed data) | PR + `check:theme` + Lighthouse CI + visual regression + `impact-reviewer` |
| T4a (signal-gated) | Partners and designers | **Data only**: a theme package = `manifest.json` + demo images + preview copy, built in a "theme studio" (the customizer in author mode) or pushed with a small CLI (`frrata theme push`, a JSON upload over an authenticated API) | Automatic: schema, contrast, Lighthouse on fixtures. Human: the staff review queue (§ 9) |
| T4b (only by ADR) | Partners | **New sections as code** contributed by **pull request to Frrata's section library** (a public or partner repo); Frrata merges, owns and ships them to every theme | Frrata's own code review. Code never arrives as an upload |

**Zip upload of code: no.** A zip of JS or templates means static analysis of arbitrary code, a sandbox to run it,
signing, and an incident process when one slips through. That is the WordPress plugin problem. A zip or CLI push of
**JSON + images** is fine: it is validated like any form input.

### 6.2 Third-party code on the shop domain vs a declarative format

| Risk | Code on the storefront origin | Declarative (JSON manifest + library) |
|---|---|---|
| XSS / account takeover | Theme JS runs as the shop. It can read the bag, rewrite checkout fields, send phone numbers out | No author code runs. Merchant text is rendered by React |
| ADR-0003 (cost leak) | Code could fetch any endpoint the page can | Sections take only `StoreShop`/`StoreCatalogue`, which have no cost fields. `check:client-bundle` still runs |
| Supply chain | Every author's npm dependencies are ours to vet. Mini Shai-Hulud compromised 639 versions of 323 npm packages in one May 2026 wave (Socket via expertinsights/techradar, 2026-05) | One dependency tree, ours, with the gates we have |
| Performance | Each theme brings its own bundle; the 120 kB budget becomes a negotiation | The budget holds by construction |
| Tenancy | A code theme that reads data needs an API and keys | No new data path. Themes read what the page already loads |
| Updates | Forks of a theme drift; the merchant's edits sit in code | Edits are data, so updates are a migration function (§ 7.3) |
| Review cost | Human code review of every version | Automated checks plus a visual review |

**If arbitrary code is ever needed** (signal: a partner app ecosystem with paying demand), run it the way Shopify runs
checkout UI extensions: in a sandboxed worker or iframe on a **separate origin** (e.g. `frrata-usercontent.com`),
talking to the page only through a typed message API. Never on the shop's origin. That is an ADR of its own.

### 6.3 Signing and versioning

A theme version is **immutable once released**. Its manifest is stored with a sha256 of the canonical JSON, and
Admin's release writes that hash. A shop revision points to a version id, so rollback is to a known hash. Signing
with keys adds nothing while the only publisher is Frrata's own Admin. Reconsider at T4 for CLI pushes (the token
identifies the author; the hash identifies the content).

### 6.4 The customizer: build or adopt

- **Puck** (MIT, React components as `fields` + `render`, RSC opt-in, v0.24 in late Oct): a spike in T1 to see
  whether it can edit our manifest without owning it. The data stays our JSON. Puck becomes the editing canvas only,
  inside the console (not shipped to shops).
- Builder.io / Plasmic: no. They are hosted, merchant content sits with a vendor, and there is an extra script.
- Our own customizer is a sidebar form over the same Zod schemas, plus a live preview iframe of the console-host
  preview route. It is small enough to build if Puck does not fit.

## 7. Should Frrata build its own templating language? (Q5)

| Option | Speed | Safety | Fits Frrata | Verdict |
|---|---|---|---|---|
| **Liquid-like sandboxed templates** (e.g. LiquidJS) | Interpreted at render. Cannot be tree-shaken. The RSC model is lost | A sandbox is a moving target: **LiquidJS CVE-2026-39412 (sort_natural, 2026-04-08), CVE-2026-44646 (render tag), CVE-2026-106120 (array indices)**, all bypasses of `ownPropertyOnly`, fixed by 10.27.2 (GitLab advisories, SentinelOne, vulert, 2026) | A second rendering layer next to `src/components/storefront` breaks "one rendering of a shop" (SSOT). Needs its own linter, LSP, docs and versioning | **No** |
| **Our own DSL** | We would write the compiler, the language server, the docs | We own every bug in the sandbox | Years of work for a problem we do not have until outsiders write themes | **No** |
| **JSON schema + React section library (data-only)** | RSC on the server, ISR, almost no JS | No author code. Validation with Zod at save and at read | Matches the modules registry, the Slot pattern, the existing views | **Yes** |
| WASM / islands for third-party code | Fast once loaded, but a runtime to ship | Strong isolation if on another origin | Only for a future app ecosystem | **Later, by ADR** |
| MDX | Compiles to JS; good for editorial pages | MDX is code (JSX). A merchant's MDX is code execution | Could serve Frrata-authored editorial pages; not merchant input | **No for merchants** |

**Reasons, in one paragraph:** Liquid exists because Shopify had to let strangers write the page. Frrata's themes are
written by its own team for years, and a merchant without a developer never writes templates. A data-only theme gives
the speed (Server Components, cached, one bundle), the safety (no author code, so no sandbox) and the "derive, never
duplicate" rule (one library, many manifests). It also makes the theme's contract **typed**: Zod settings schemas are
the "typed contracts" Shopify is now adding to Liquid (Fall '26). If partners later need logic, add *data* features
(sources, conditions such as "show if the product has a size chart", variants) to the schema, not a language.

## 8. Security (Q6)

| Threat | Control |
|---|---|
| **XSS from merchant content** | Rich text is stored as a small typed AST (paragraph, heading, list, link, bold, italic), validated with Zod and rendered by React, never `dangerouslySetInnerHTML`. Links: `https:`, `mailto:`, `tel:`, `wa.me` and the shop's own paths only. `rel="noopener"` on external links. JSON-LD keeps its `<` escape. No `html` or `liquid` setting type |
| **Custom CSS** | Not offered in T1–T3. If ever, it is parsed (lightningcss) with an allowlist of properties, no `url()`, `@import` or `expression`, and scoped to `[data-store-theme]` |
| **Tracking scripts** (Meta Pixel, GA4) | Integrations, not script fields: Meta CAPI on the server (frata-integrations), GA4 as one Frrata-owned loader if ever. No "paste your script here" box: it is the top source of CSP holes and slowdowns |
| **Supply chain** | Data-only themes add no dependencies. Keep `npm ci` from the lockfile; pin and review new libraries for the section library |
| **ADR-0003** | Sections receive `StoreShop`/`StoreCatalogue` (no cost fields) and nothing else. `check:theme` fails a section whose props type reaches `orderProfit`, cost or fee fields. Sources never rank by margin. Best sellers pass only the order of products. `check:client-bundle` stays the backstop |
| **Tenant isolation of theme data** | Merchant revisions and licences carry `tenant_id` with RLS, grant and policy in one migration. Platform theme tables have no tenant data. A preview renders one tenant's draft, chosen by `requireMember()`, never by a URL id (§ 9.3) |
| **Preview links** | T1: **members only**, on the console host, dynamic, `Cache-Control: private, no-store`, `noindex`. A **shareable preview for people who are not members** (a client, a photographer) would be a third source of a tenant id: it needs an ADR naming the exception (like ADR-0007): an HMAC-signed token of (revision id, tenant id, expiry ≤ 7 days), single purpose, revocable, logged |
| **Who publishes** | Edit draft: `CAN_BUILD` (owner, admin, partner). **Publish: owner and admin** (`CAN_MANAGE`) by default, because publishing changes what shoppers see. A partner building a shop before handover may publish before the shop opens. Each publish writes `audit_events`. Support sessions can edit but publish only with the audit row (as today) |
| **Rollback** | Every publish is a row. "Restore this version" publishes an old revision again (append-only, never an update) |
| **Secrets** | Themes hold none. Integrations keep credentials in their own encrypted tenant tables (frata-architecture) |
| **Uploaded media** | Images go through the existing media pipeline (re-encoded to WebP, EXIF stripped). No SVG upload (SVG can carry script) unless sanitised; logos as PNG/WebP |
| **Theme package from a partner (T4)** | JSON only, a size cap, schema-checked, images re-encoded, a staff review, release by staff. The author's API token is scoped to their own themes |

## 9. Other points the owner should know (Q7)

1. **Mobile first, because of Instagram.** Most visits arrive in Instagram's in-app browser on mid-range Android over
   4G. Design and test at 360 px first. Lighthouse runs on mobile. A sticky Add to bag on the phone product page.
   No hover-only affordances (cards already limit hover to pointer devices). No public dated source was checked for
   the in-app share this time.
2. **Accessibility** is held by the library, not by each theme: focus rings, 44 px targets, landmarks, one h1, alt
   text required on editorial images (the customizer asks), contrast checked per colour scheme, reduced motion.
   Shopify asks for ≥ 90; we hold ≥ 95.
3. **Theme updates without breaking customizations.** Each section's settings schema has a `schemaVersion` and pure
   `migrate(vN → vN+1)` functions with fixture tests (the backfill-test idea from frata-architecture). A new theme
   version lists its migrations. Updating a shop = migrate the merchant's JSON to the new schema in a **new draft
   revision**. The merchant previews it and publishes. Automatic updates apply only to patch versions with no schema
   change.
4. **Moving between themes.** Content (hero images, texts, chosen collections) is keyed by section *type*, so it
   carries over when the new theme has that type. Tokens carry over by role (accent stays accent). The switch
   screen says what carries and what does not before publish.
5. **Draft → preview → publish**, plus scheduled publish for a festive launch (T3). One draft per shop at a time
   keeps it simple (Shopify allows many unpublished themes; most small merchants need one).
6. **A/B tests of themes**: defer. Shopify only added native theme A/B tests in June 2026. A small shop rarely has
   the traffic to read a conversion test. Signal to revisit: shops above about 30k sessions a month.
7. **Caching per tenant:** publish calls `refreshShop(tenantId, 'shop')` (tag `shop:<id>`). The resolved theme is
   part of the cached shop read, so a page render does no extra round trip. Preview is never cached. Theme manifests
   are platform data, cached by a `theme:<versionId>` tag. A release invalidates nothing on its own, because shops
   point at versions explicitly.
8. **i18n and Hindi:** theme strings ("Add to bag", "Pay on delivery") live in the platform's message catalogue, not
   in themes, so a theme never ships untranslated text. A Devanagari font pairing. Merchant text can be bilingual
   later (a `hi` field beside each text setting). RTL is not needed (Shopify added it in Fall '26 for Arabic,
   Hebrew and Urdu; not our market).
9. **Checkout is not themable** beyond the tokens (colour, type, radius, logo). Field order, the 7-field rule,
   COD lines and price changes stay fixed, as Shopify does with its checkout.
10. **Modules in themes (app blocks):** a theme section can declare `slots: ['storefront.product']`, and the
    `<ModuleSlot>` fills it with every usable module's block (Reviews stars, Size finder). The merchant places a slot.
    The module decides what renders in it. Core and themes never import a module (`check:modules`). A per-block JS
    budget (Shopify suggests ≤ 10 KB) goes into the module registry.
11. **Legal content stays visible:** policies, the grievance officer, GST and legal name in the footer, the return
    window in words. A theme cannot hide them.
12. **Honesty rules are part of the library:** no fake countdowns, no invented "12 people are viewing", stock
    shown only from real quantities (CCPA 2023, already in the design language).
13. **Festive peaks:** themes add no request-time work (resolved inside the cached read). Publish waves before a sale
    revalidate per shop, never the whole fleet.

## 10. Theme gallery and Admin theme management (Q8)

### 10.1 Merchant: Console › Look (replaces today's accent and font section in Settings)

| Screen | Contents | States |
|---|---|---|
| **Your theme** | The published theme's card (name, preset, version, "Published 3 Nov"), a phone-sized live thumbnail, buttons **Customize** (primary) and More (Duplicate draft, Restore an earlier version, Theme details). An update banner: "Version 1.3 is ready: new lookbook section. Preview the update" | Fresh shop (default theme, not customized) · draft exists ("You have unpublished changes") · update available · trial ending · paused by Frrata (a version recalled) |
| **Gallery** | Theme cards: a phone screenshot first, name, a one-line job ("Editorial, for designer ethnic wear"), the presets as colour dots, a badge from `themeOfferFor()`. Filter by what you sell (`shop_settings.sells`). Card → details sheet: screenshots, the sections it has, speed score (from Lighthouse CI), price line, one action | Empty is impossible (Frrata's themes always show) · bought · trial · in a higher plan |
| **Customizer** | Left: Theme settings (colours, type, shape, density) and the page's section list (drag to reorder, add from a sheet with previews, hide, remove). Right: a live preview, **phone by default**, with desktop and tablet toggles, and a page picker (Home, a product, a collection). Top: Undo/Redo, "Saved" state, **Preview** (opens the members-only preview), **Publish** (primary; owner/admin) | Autosaved draft · validation errors stay visible (a text too long, an image missing alt) · publish dialog: "Shoppers see this now. Earlier version kept in History." · phone: settings as a bottom sheet over the preview |
| **History** | The revisions list: who, when, published or draft, "Restore" | One · many |

### 10.2 Admin (staff, `requireStaff`, `src/lib/admin/`)

| Screen | Contents |
|---|---|
| **Themes** | Every theme with author (Frrata or a partner), latest version, how many shops use each version, price, status |
| **Theme › Version** | The manifest diff from the previous version, the `check:theme` and Lighthouse report, screenshots per preset, migrations listed, **Release**, **Stage to N shops** (opt-in pilots), **Recall** (shops on it are offered the previous version; a recall pauses new installs and shows "Paused by Frrata") |
| **Review queue** (T4) | Submitted partner versions: automated results, a checklist (brand, honesty, a11y, content rights of the demo images), Approve / Request changes with reasons. Time to decision shown |
| **Merchant › Look** | The shop's theme, version, licence, revisions (names of changed settings only, as in audit rows), "Give a 14-day trial of X", "Grant licence" |
| **Speed** (T2) | Shops whose RUM p75 LCP or INP is over the line, by theme version: a theme regression shows as a cluster |

### 10.3 Data model sketch (to be specified in a spec; names may change)

Platform tables (no tenant data; written by `frata_admin`; read by `frata_app` through a definer, as with plans):

| Table | Columns | Notes |
|---|---|---|
| `themes` | id, key (unique), name, job, author_kind (`frrata` \| `partner`), partner_id null, created_at | — |
| `theme_versions` | id, theme_id, semver, manifest jsonb, manifest_sha256, schema_version, submitted_at, approved_at/by, released_at/by, recalled_at/by, reason | **State is derived from timestamps** (draft, submitted, approved, released, recalled), never a status column. The manifest is immutable content validated by Zod, not state. Immutable after `released_at` (a trigger refuses updates) |
| `theme_prices` | theme_id, version, kind, price (paise), trial_days, created_at | Like `addon_prices` |
| `theme_reviews` (T4) | theme_version_id, reviewer, checks jsonb (report), decision, notes, created_at | `frata_admin` only |

Tenant tables (`tenant_id`, grant to `frata_app`, `revoke` from anon/authenticated, RLS, `tenant_rows` policy, all in
one migration, plus a check in `scripts/verify/tenancy.sql`):

| Table | Columns | Who writes |
|---|---|---|
| `shop_theme_revisions` | id, tenant_id, theme_version_id, settings jsonb (the merchant's layer, validated against that version's schemas), created_at, created_by, based_on_revision_id | App: insert (each save makes a draft or updates the one open draft); select |
| `shop_theme_publishes` | id, tenant_id, revision_id, published_at, published_by | App: insert, select (append-only). **The published theme = the latest row**, derived, no pointer column to drift |
| `theme_licences` | tenant_id, theme_id, theme_price_id, starts_at, ends_at, trial_ends_at, created_by | `frata_admin` inserts; app selects (like `tenant_addons`) |

Indexes: `(tenant_id, published_at desc)` on publishes; `(tenant_id, created_at desc)` on revisions. At 500 shops ×
~50 revisions a year, these are small. Prune drafts older than 90 days that were never published (keep every
published revision).

`shop_settings.accent` and `display_font` move into the default theme's merchant layer in a backfill. The columns
are dropped in a later migration (frata-architecture § additive migrations).

### 10.4 Workflow

```
Frrata author → PR (section/theme code) → gates (check:theme, Lighthouse CI, visual) → merge
  → Admin: version appears as "approved" (from the build) → Release (or stage to pilots)
Merchant → Gallery → Customize (draft revision) → Preview (members) → Publish (owner/admin)
  → shop_theme_publishes row → refreshShop(tenant) → shoppers see it at the next request
Update → Admin releases v1.3 → merchants see "Preview the update" → migrate into a new draft → publish
Recall → Admin recalls v1.3 with a reason → shops on it get a one-click restore to their previous publish
```

## 11. Phased recommendation (Q9)

Each phase opens with its mockup (ADR-0001) and a spec. The review agents (`architecture-reviewer`,
`tenancy-auditor`, `unit-economics-reviewer` for § 5) run on the plan before execution.

| Phase | A merchant can… | Build | Effort (agent-weeks) | Gate / measure |
|---|---|---|---|---|
| **T0 Foundation** (no visible change) | — | Split `storefront/*` views into sections with Zod settings, presets and fixtures; `src/domains/themes/` (`resolveTheme`, manifest types, migrations); the "Classic" manifest that reproduces today's shop exactly; `check:theme`; Lighthouse CI on 3 fixture shops; SRI/CSP report-only spike; a visual regression baseline | 1.5–2 | Screenshots identical before and after. Lighthouse mobile ≥ 90 on fixtures |
| **T1 Customizer** | Pick one of 3–4 Frrata themes (e.g. Classic, Editorial, Bazaar, Minimal) and a preset; set colours, type, shape, density; pick header and footer variants; add, reorder and hide home sections; use product sources (New in, Best sellers by delivered, a collection, Under ₹X, On sale); draft, preview, publish, restore | Tables `shop_theme_revisions`, `shop_theme_publishes`; Console › Look; customizer (Puck spike first); ~12 home sections; backfill of accent and font | 3–4 | % of shops that publish a customized theme in 14 days; conversion (sessions → delivered orders) vs the default |
| **T2 Pages and modules** | Choose product, collection and card layouts; place Reviews and Size and fit through slots; lookbook / shop the look; Hindi strings and a Devanagari pairing | Product and collection templates, module slots in sections, the message catalogue for theme strings, RUM beacon + Admin › Speed | 2–3 | RUM p75 LCP ≤ 2.5 s and INP ≤ 200 ms on ≥ 90% of shops; no theme regression cluster |
| **T3 Gallery, premium, release tooling** | Browse a gallery, try a premium theme in draft, buy or start a trial (Admin-granted until Phase 6), update to a new version with a preview, schedule a publish | `themes`, `theme_versions`, `theme_prices`, `theme_licences`; `themeAccess`, `themeOfferFor`; Admin › Themes (release, stage, recall); migrations runner for updates | 2 | Smoke-test demand for paid themes (clicks on Buy vs previews) before wiring billing |
| **T4 Partners author themes** (signal-gated) | Install a partner's theme | Author mode of the customizer, JSON package push (CLI or upload), review queue, partner payouts (needs Phase 6 and a CA opinion) | 3–4, later | **Signal:** ≥ 10 active partners and ≥ 3 asking to sell looks; premium smoke test positive |
| **Never without an ADR** | — | Arbitrary JS, custom HTML, a template DSL, code uploads, public preview links, custom fonts upload | — | — |

### Risks and how the plan answers them

| Risk | Answer |
|---|---|
| Sliding into a page builder (Elementor bloat) | Sections only, typed settings, no per-element styles; every new section must pass `check:theme` and Lighthouse |
| Merchant JSON drifting across versions | Schema versions + tested pure migrations; updates land as a draft, never in place |
| QA explodes as themes × sections × presets grows | Themes are presets over one library, so QA is per section; visual regression per preset in CI |
| Preview leaking through the CDN, or across tenants | Preview on the console host only, `no-store`, the tenant from `requireMember()` |
| A trial or a recall breaking a live shop | Grace period, fallback to the last licensed publish, console warnings, audit rows |
| Premium themes do not sell in India | Themes free first; a 60-day smoke test before billing; the fee on delivered orders is the real revenue |
| The SRI/CSP route does not work with Next's inline scripts | Keep today's policy (no theme adds script anyway); revisit with Next upgrades |
| Puck does not fit our data model | Fallback: a sidebar form over the same Zod schemas (cheaper than it sounds) |
| `jsonb` treated as state (rule 5) | The manifest and merchant layer are validated content. Publish, licence and review state are rows and timestamps |

## 12. Owner calls

1. **Data-only themes, no DSL, no third-party code** for T0–T3 (recommended).
2. **Themes free in every plan** until the premium smoke test (recommended), or premium themes from T3 at ₹2,999–7,999.
3. **Who publishes:** owner and admin (recommended), or everyone in `CAN_BUILD`.
4. **Which 3–4 launch themes**, by what the first merchants sell: Editorial (designer ethnic), Bazaar (high-SKU,
   festive), Minimal (basics, streetwear), Atelier (made to order).
5. Whether **public preview links** are worth an ADR now (recommended: later; members-only preview first).
6. The **partner share** on theme sales (hypothesis 70/30) before T4. `unit-economics-reviewer` first.

## Repetitive work → agents and scripts

| Chore | Becomes |
|---|---|
| Checking every section has schema, preset, fixtures, contrast, budgets | `check:theme` (script, gate) |
| Speed and a11y of every theme × preset | Lighthouse CI job (script) |
| Visual breakage after a section change | Playwright visual baseline in `npm run e2e` |
| Reviewing a new theme version (diff, honesty, a11y, demo image rights) | A `theme-reviewer` agent (judgement), T3/T4 |
| Migrating merchant settings on an update | Pure `migrate` functions + fixture tests (engine) |

## Facts used (all checked 2026-11-07)

- Shopify JSON templates, 25 sections / 50 blocks / 1,000 templates: https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates (undated, live)
- Shopify theme blocks, `@theme` / `@app`: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks (undated, live)
- Shopify settings input types: https://shopify.dev/docs/storefronts/themes/architecture/settings (undated, live)
- Theme Store requirements (Lighthouse perf ≥ 60, a11y ≥ 90; prohibitions): https://shopify.dev/docs/storefronts/themes/store/requirements (undated, live)
- Theme Store review process (5 stages): https://shopify.dev/docs/storefronts/themes/store/review-process (undated, live)
- Theme Store revenue share 15% of gross, no submission fee: https://shopify.dev/docs/storefronts/themes/store/revenue-share (undated, live)
- Theme app add-ons; ThemeSale email: https://shopify.dev/changelog?filter=themes (2026-10-28)
- Theme app extension limits: https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration (undated, live)
- Theme Check: https://shopify.dev/docs/storefronts/themes/tools/theme-check (undated, live)
- Dawn principles: https://github.com/Shopify/dawn (undated README, live)
- Editions Fall '26 for theme developers (Canvas, typed contracts, per-page CSS, script tags, RTL): https://the4.co/blogs/shopify-themes/shopify-editions-fall-2026-theme-developers (2026-10-29, third-party)
- Summer '26 (A/B, scheduled and gradual publishing): https://shopappy.com/platforms/shopify/shopify-summer-26-editions-ai-merchandising and https://easysellapp.com/blogs/wiki/shopify-summer-2026-edition-updates-that-matter (June 2026, third-party)
- Paid theme prices, $315 median of 306: https://shopthemedetector.com/shopify-statistics/theme-pricing (updated 2026-08-30)
- Hydrogen 2026.4.0: https://askphill.com/blogs/blog/everything-you-need-to-know-about-shopify-hydrogen-and-oxygen (2026, third-party)
- WordPress theme.json v3, presets as CSS variables: https://developer.wordpress.org/block-editor/how-to-guides/themes/global-settings-and-styles/ (updated 2026-10-20)
- Elementor v4 atomic elements: https://elementor.com/products/website-builder/v4-faq/ (2026)
- WordPress vulnerabilities 2025 (Patchstack): https://patchstack.com/whitepaper/state-of-wordpress-security-in-2026/ (2026; figures via secondary reports, primary not opened)
- BigCommerce Makeswift on Stencil: https://www.bigcommerce.com/blog/makeswift-holiday-storefront/ (2026)
- Puck releases v0.24.0 / v0.23.0: https://github.com/puckeditor/puck/releases (Oct / Aug; year not shown, current per puckeditor.com banner)
- Webflow 95% creator commission: https://webflow.com/blog/template-creator-enhancements (2025-10-24)
- Wix Studio template revenue: https://support.wix.com/en/article/wix-studio-request-viewing-eligible-sites-for-revenue-share (2026)
- Squarespace third-party templates $99–495: https://www.jpkdesignco.com/blog/best-squarespace-templates (2026)
- Dukaan themes: https://dukaan.help.center/article/5022-how-to-use-the-nirvana-theme (undated); counts conflict in 2026 reviews
- Instamojo storefront v2 Customize Store: https://instamojo.zendesk.com/hc/en-us/articles/28478948451993-Streamlined-Storefront-Experience-Unveiling-Version-2 (undated)
- Next.js CSP (nonce forces dynamic; experimental SRI): https://nextjs.org/docs/app/guides/content-security-policy (lastUpdated 2026-03-20)
- Next.js revalidating / cache tags: https://nextjs.org/docs/app/getting-started/revalidating (live)
- Google merchant listing structured data: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing (undated, live)
- Core Web Vitals thresholds: https://web.dev/articles/vitals (last updated 2024-10-31: **no current source**)
- Lighthouse CI action: https://github.com/treosh/lighthouse-ci-action (v12 per 2026 guides; confirm)
- LiquidJS CVEs: https://advisories.gitlab.com/npm/liquidjs/CVE-2026-39412/ (2026-04-08), https://www.sentinelone.com/vulnerability-database/cve-2026-44646/ (2026), https://vulert.com/vuln-db/CVE-2026-106120 (2026)
- Mini Shai-Hulud npm wave, May 2026: https://expertinsights.com/news/active-npm-supply-chain-attack-compromises-323-packages and https://www.techradar.com/pro/security/mini-shai-halud-hackers-publish-over-600-compromised-npm-packages-developers-warned-to-be-on-their-guard (2026-05)
- No current source found: Shiprocket and Bikayi theme systems; the share of Indian fashion traffic in the Instagram in-app browser; Shopify Horizon launch details (May 2025, older than 12 months).
