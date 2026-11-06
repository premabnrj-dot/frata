# Storefront (1B): the shop shoppers see
Status: approved to build without a mockup sign-off (owner, 2026-11-06: "continue with (1B). do not wait for my approval this time … just defer pincode check from the plan") · Date: 2026-11-07 · Review: architecture-reviewer and tenancy-auditor on this spec, findings below

## Goal
Ranked problems 5 (a shop that looks and reads right, without a developer) and
2 (fewer returns from wrong sizes: the size guide with the model). Every field
the product model (`docs/specs/2026-11-06-product-model.md`) stores is shown
here, as the approved rules in `frata-design-language` § Product page and
§ Storefront say. Measure: a shopper on a phone finds a kurta, picks colour
and size, and reads price, delivery, returns and Pay on delivery without
scrolling past the fold more than twice; Lighthouse mobile ≥ 90 on a product
page; Google's Rich Results test passes on a product with variants.

## Deferred (owner, 2026-11-06, and YAGNI)
- **Pincode check** (owner). The product page says delivery times in words
  ("Ships in 2 days · 4 days to metros, 7 elsewhere"). The route and its rate
  limit come with checkout (1C), where the pincode is typed anyway.
- **Bag and checkout** are 1C. In 1B "Add to bag" checks the size (and points
  at it if none is picked, never greyed out); then it says checkout is being
  set up. Only a merchant previewing can reach it: a shop is "Opening soon"
  until it publishes, and publishing needs payments (1C).
- **Live stock route.** Stock changes only by a console save in 1B, which
  revalidates the shop's catalogue. The route arrives with orders (1C).
- **Filters on collection pages** (colour family, size, details). The data is
  stored; the UI waits until a shop has more than ~40 products.

## Shape
- **Pages** under `src/app/s/[host]/`: home, `products` (all), `products/[handle]`,
  `collections/[handle]`, `policies/[page]`, `sitemap.xml`, `robots.txt`,
  `not-found`. Thin: each resolves the tenant, calls ONE loader in
  `src/lib/queries/storefront.ts`, and renders a VIEW from
  `src/components/storefront/` (props only, no fetch, no cache, no tenant).
- **The tenant comes from the Host header, read once, by the middleware**,
  which rewrites to `/s/<host>/…`. Pages resolve `params.host` with the
  cached `tenantForHost`. Reading `headers()` in the layout (the earlier plan's
  "layout checks Host = params.host") would make every page dynamic and
  uncacheable; instead the middleware makes `/s/` unreachable from outside:
  on a shop host every path is prefixed (so `/s/other/…` becomes
  `/s/this/s/other/…`, a 404), and on every other host `/s/…` is a 404
  except in `next dev`. A test pins both.
- **Caching**: `shopCached(name, fn)` wraps `unstable_cache`; the tenant id is
  the function's first argument (in the key) and in every tag: `shop:<t>`
  (settings, policies, brand) and `shop:<t>:catalogue` (products,
  collections). `host:<host>` for the lookup. Console writes call
  `refreshShop(tenantId, 'catalogue' | 'shop')`. Pages read no `headers()`,
  `cookies()` or `searchParams`, so they are static per path and revalidate
  every 60 s as well (a scheduled drop appears within a minute). A variant
  link (`?colour=rust&size=m`) is read by the picker in the browser; the
  canonical is the bare path.
- **Preview for the merchant**: `/console/preview/[[...path]]` renders the same
  views from the same loaders with the member's tenant and `preview: true`
  (drafts and unlisted included, no cache), under a "Preview — shoppers see
  Opening soon" banner. Links inside are prefixed with the preview base. This
  is how a shop is seen before it has a domain or is published.
- **What a shopper can reach** is `visibility()` (`catalogue/availability.ts`):
  draft or scheduled → 404; unlisted → 200 with `noindex`, not in lists,
  collections or the sitemap; archived → 308 to home; an old handle → 308 to
  the current one. Before the shop publishes, every page but the policies
  shows "Opening soon" (`noindex`); policies are live from the start because
  payment gateways read them during KYC.
- **No cost reaches the shopper** (ADR-0003): storefront loaders select named
  columns only, never a whole variant row. `check:tenant` rule 6 covers
  `src/components/storefront/` too; `check:client-bundle` runs on the build.
- **Images**: the 1A ladder (400/800/1200/1600 WebP on Blob) through
  `srcSet`/`sizes`; the first photo `fetchpriority="high"`, the rest lazy. No
  `next/image` optimiser: the ladder is already made, and the optimiser bills
  per image on Vercel.

## Product page (phone first, top to bottom)
Gallery (scroll-snap, photos of the chosen colour first, a counter) → title →
price, compare-at struck with "Save ₹N" (no percentage) → availability of
the chosen size in words (In stock · Only 2 left · Sold out · Pre-order ships
by 12 Dec · Made to order, ships in 10–14 days) → colours as swatches with the
name written, ring on the chosen one, crossed when sold out in the chosen
size → sizes as buttons (≥ 44 px), sold out crossed but readable, "Size
guide" link → Add to bag → delivery and payment lines: "Pay on delivery
available" (when on and under the shop's limit), shipping charge or "Free
delivery above ₹1,999", dispatch and delivery days, the return window in
words → description → details (fabric, occasion…, names from the taxonomy)
→ the model ("Model is 5 ft 6 in and wears S"). The size guide is a sheet:
the phone's Back closes it (history entry), cm ⇄ inches, the model line.
Desktop: gallery left (sticky), the rest right. JSON-LD `ProductGroup` from
`seo.productJsonLd`; title and description from the overrides or the defaults.

## Home, lists and pages
Header: shop name in its display font (or logo), Shop all, up to 5
collections; footer: policies, contact, Instagram, WhatsApp, grievance
officer. Home: name and tagline, collections as tiles (first product's cover),
"New in" grid (newest 24 listed). Product card: cover (4:5), the second photo
on hover (pointer devices), title, price, swatches (scroll sideways on
phones), one tag at most (Sold out · Pre-order · Made to order). Collection
page: title, description, grid in the collection's order. Sitemap: home,
listed products and collections, policies; robots.txt points at it and
disallows everything while the shop is opening soon. Organization JSON-LD on
home with the return policy and shipping once (`seo.ts`).

## Design review
- **UI/UX**: every state designed: opening soon, empty shop (no listed
  products: "New pieces are on their way"), empty collection, sold-out
  product (still shown, Add to bag says which sizes are back soon? no —
  "Sold out" and the sizes stay readable), pre-order, made to order, no
  photos (a paper-coloured frame with the name), policy with missing facts
  (the shopper sees the page without the gap; the console flags it). Phone
  width 360 without sideways scroll.
- **Tenancy**: tenant from host only; loaders take `tenantId` first and run
  inside `withTenant` with an explicit tenant where; cache key and tags carry
  the tenant; the preview takes the tenant from `requireMember`.
- **Modularity / SSOT**: views are the one rendering of a shop (preview and
  storefront); availability, visibility, SEO, policies, swatches come from
  their engines; nothing computed twice.
- **YAGNI / KISS**: no client state library, one client island per page
  (variant picker + size guide); no search, filters, wishlist or reviews.
- **Performance**: static per path + CDN; one loader = one transaction; under
  100 kB first-load JS on the product page (`check:size`).
- **Reliability**: a loader failure renders the shop's error page (no stack,
  "Try again"), logged with the tenant id only.
- **Security**: no shopper input reaches the database in 1B except the path;
  handles are shape-checked before any query.
- **Unit economics**: none directly; static pages keep Vercel function
  invocations near zero at festive volume.
- **Blast radius**: every shop at once. Ship behind nothing; the shops are
  all "Opening soon" until 1C.

## Build order
1B·1 loaders, `shopCached`, `refreshShop` and the console writes that call it ·
1B·2 layout, theme, header, footer, Opening soon, 404, error · 1B·3 product
page with picker and size guide · 1B·4 home, all products, collections ·
1B·5 policies, sitemap, robots, JSON-LD · 1B·6 console preview. Each: gates,
typecheck, build, a Playwright run on a shop host, then push.
