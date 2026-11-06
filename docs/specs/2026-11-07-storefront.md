# Storefront (1B): the shop shoppers see
Status: approved to build without a mockup sign-off (owner, 2026-11-06: "continue with (1B). do not wait for my approval this time … just defer pincode check from the plan") · Date: 2026-11-07 · Review: architecture-reviewer and tenancy-auditor ran 2026-11-07; every finding is taken below (§ Review findings), and those decisions override the text above them

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

## Review findings and decisions (2026-11-07)
Where these differ from the sections above, these win.

**Middleware and host (tenancy HIGH, arch HIGH).** The matcher becomes
`/((?!_next/static|_next/image).*)`: image-looking paths no longer skip it.
`/s/…` is answered 404 FIRST on every host that is not a shop, including
`localhost` in production (only `next dev` passes it); then a shop host's
image paths pass through to `public/`, everything else is rewritten. Every
`[host]` page reads its host through ONE helper (`shopHostParam`) that
refuses anything not already in `surfaceFor`'s normal form. `s/[host]/[...rest]`
calls `notFound()` so a shop's unknown path gets the shop's 404. Unit tests
call `middleware()` per host kind, including `/s/a/b.png` on a shop host, the
console host and `localhost`. (Next 15.5 is patched for the
`x-middleware-subrequest` bypass; recorded in `frata-gotchas`.)

**Static per path (arch BLOCKER).** Every `[host]` segment exports
`generateStaticParams = () => []` (and nested segments too), so Next builds
them as ISR routes. `scripts/check-storefront-build.mjs` (postbuild) fails if
any `/s/[host]/**` page is not in `.next/prerender-manifest.json`
`dynamicRoutes`, and fails if a storefront page's first-load JS is over
120 kB gzipped. (The 100 kB named above was wrong: Next 15 and React 19's
shared script alone is ~103 kB; the product page measures ~110 kB.)

**Time is never cached (arch BLOCKER).** Loaders cache RAW rows
(`publishAt`, `shipsBy`, stock as numbers, dates as ISO strings);
`visibility()` and `availability()` run at render, outside the cache.
`shopCached` has a 60 s `revalidate` backstop besides its tags. `refreshShop`
runs after the console transaction commits.

**Host lookup (both HIGH).** `host:<host>` is cached 60 s and a MISS is never
cached (a wildcard domain lets anyone mint hosts). An address change
revalidates `host:<old>`, `host:<new>` and `shop:<t>` (and the old paths'
layout); a new shop revalidates `host:<slug>`. A freed address is not
re-claimable for 30 days (later, with `tenant_domains`; until then the
address change already needs an unpublished shop, so no shopper has it).

**Preview cannot leak (both HIGH).** `src/lib/queries/storefront.ts` exports
cached `shop*` loaders and separate uncached `preview*` loaders over one
internal core; no exported function takes a "preview" flag. A gate fails if
`src/app/s/**` mentions `preview`, `searchParams`, `cookies(` or `headers(`, or
if `unstable_cache` appears outside `storefront.ts`. The preview route answers
`noindex` and `Cache-Control: private, no-store`; links come from an `href()`
prop. A test opens a draft in preview, then gets 404 for it on the shop host.

**Costs (tenancy HIGH).** Storefront loaders select named columns only; a
bare `.select()` or `getTableColumns` in `storefront.ts` fails `check:tenant`,
and rule 6 covers `src/components/storefront/`, `src/app/s/` and the preview
route with every name in `scripts/cost-sentinels.mjs`. Never selected:
`unit_cost`, `weight_grams`, `preorder_cap` (the cap's effect is computed in
the loader), `hsn`, `pickup_pincode`, `cod_min`/`cod_max`/`cod_blocked_pincodes`
(COD is computed into a yes/no and a reason), `invoice_series`, `default_hsn`.
Stock reaches the page only as the derived availability. `npm run
check:payload` seeds `unit_cost = 4242421` and fetches the HTML and `?_rsc`
payload of home, product, collection and sitemap and fails on the number or
any sentinel.

**One rule for delivery and COD (arch HIGH).** `src/domains/checkout/delivery.ts`
(shipping charge with free-above, COD offered with `codMin`/`codMax` and the
reason) is read by `CheckoutPreview`, the product page and, in 1C, the quote.

**One rendering of a shop (arch HIGH).** The footer and policy body move to
`src/components/storefront/`; Settings' previews wrap them in `Frame`.
`Pieces` has a shopper mode that leaves missing facts out.

**Opening soon (arch MEDIUM)** is a route group: `s/[host]/(shop)/…` checks it
in its layout; `s/[host]/policies/…` sits beside it. Publishing itself lands
in 1C with checkout (the checklist accepts COD alone, so it is not "needs
payments", it is "needs a way to order").

**Archived (arch MEDIUM).** Not a redirect to home (Google reads a redirect
to an unrelated page as a soft 404): the page says "This piece is no longer
available" with New in below it, marked `noindex` so search drops it (Next
cannot render a page's own data with a 404 status: `notFound()` takes no
props). Old handle → 308
(`permanentRedirect`). `visibility().http` says 404/308 and pages read it.

**Next 15 conventions.** `robots.txt` and `sitemap.xml` are `force-static`
route handlers under `[host]` with the 60 s revalidate; every page has
`generateMetadata`; the picker reads `location.search` in an effect (no
`useSearchParams`, which would drop it from the HTML); JSON-LD goes through
one helper that escapes `<`. Canonical URLs, the sitemap and JSON-LD are built
from the shop's own address (`slug` + shop domain), never `params.host`.

**Enumeration (arch MEDIUM).** A cached per-tenant handle index (current and
old handles) answers unknown handles with 404 before any product query.

**Logs** carry the tenant id and the loader name only.

**Unit economics (arch LOW).** The middleware runs on every shop request,
CDN hits included, and each visited path re-renders at most once a minute.
Hypothesis, checked when the first shop publishes (1C) with the
unit-economics-reviewer: well inside Hobby/Pro included edge requests for
the first 50 shops. A host rewrite in `next.config` is the fallback.

**Testing** runs `next start` with `NEXT_PUBLIC_SHOP_DOMAIN=frata.test` and
Chromium's `--host-resolver-rules` (preview deployments are console hosts).

**Header collections**: the first five by title that have products.

## After the build audit (2026-11-07)
- **The shop rewrite moved from the middleware to `next.config`**
  (`shopRewrites` in `src/domains/tenancy/host.ts`, `beforeFiles`). With a
  middleware rewrite Next matched the ORIGINAL path against the ISR routes and
  rendered every shop page per request. Now the middleware only refuses `/s/`
  on non-shop hosts and malformed hosts; on Vercel the rewrite runs in the
  routing layer. Shop pages are `force-static` (they read only params, rule 6c).
  Measured locally: HIT, a console save, one MISS with the new text, HIT.
  `npm run check:payload` now also fails a page that is not served from cache,
  and any listed page that is not a 200 (it had silently tested the console,
  because `fetch` drops a Host header; it uses `node:http` now).
- **robots.txt and sitemap.xml** are dynamic route handlers with their own CDN
  header (5 minutes); an unknown host gets a `no-store` 404.
- **Only root-level files** (favicon.ico, apple-touch-icon.png) skip the shop
  rewrite; `/console/…` on a shop's address is the shop's 404.
- **`codMin`/`codMax` are selected**: they are public (the Shipping policy
  states them) and the product page needs them to say whether Pay on delivery
  is offered. `cod_blocked_pincodes` is still never selected.
- **Draft in preview, 404 on the shop** is checked in the Playwright run
  (frata-verify), not a unit test.
