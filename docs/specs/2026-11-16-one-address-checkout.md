# One address per store: the brand's site and Frrata's checkout at one host, one bag, one brand record
Status: draft for the owner (revised after five independent reviews, 2026-11-16) · Date: 2026-11-16 · Mockup: none yet,
one per phase (plan `docs/plans/2026-11-16-one-address-checkout.md`) · Approved: — · Decision record: ADR-0019 (proposed,
`docs/decisions/0019-one-address.md`)
Pairs with: ADR-0014 (rules 2 and 3, amendments 4, 6, 7, 8, 9), ADR-0015, ADR-0017 (rules 3, 4, 6), ADR-0018, ADR-0009,
`docs/specs/2026-11-12-kit-and-fleet.md` (§ 1, § 4, § 7), `docs/specs/2026-11-16-studio-agent.md` (§ 12, § 13),
`docs/plans/2026-11-12-studio-build.md` (V2a, BT), `docs/specs/2026-11-14-site-content-layer.md`, the owner's domain call in
`docs/setup.md` § Rename day (2026-11-16).

The owner, 2026-11-16 (verbatim):
1. "with the demo website we created for house of ayuda, checkout, order confirmation page also need to share the design
   language. so please plan how we can plan this while keeping our backend data secure, avoid hacking, issues, security
   issues."
2. "Also the friction of dual subdomain for a store is not feasible at all. Please see a way through this, partners should
   be able to design the checkout, order pages as well, just not the data they should. I experienced an issue while
   working on the mokabara vercel and adding, the items aren't getting deleted from frrata hosted domain. Please stress
   test these scenerios and plan"
3. "Logo and design identity generation should always come from our system and should be saved so they could be used
   across. It won't make sense if we have diffferent logo in the console and different while partner is designing with
   claude"
4. (domains) "frrata.com will be the public domain. .shop will remain the subdomain, frratamail will remain the mailing
   email."

## In short
- **One address.** A shopper stays on the brand's address from the home page to the order page: `brand.com`, or
  `<store>.frrata.shop` when the brand has no domain. Frrata's app holds the address. It serves checkout, the bag link,
  orders, policies and its own APIs itself, and passes every other GET to the partner's site deployment.
- **The partner's code never holds shopper data.** Phone, address, sign-in, the order's summary, the Place order button
  and the order's personal details live in a Frrata frame on a hidden sub-address (`secure.<the store's host>`). The page
  around it is Frrata's own code in the brand's design. The browser keeps the partner's pages out of it.
- **The frame comes before the one address.** No store with real shoppers moves to one address before the frame ships.
- **Checkout's design is data.** Logo, colours, type, radius, density, a header and footer variant, trust blocks and two
  short lines. Partners set them in Studio or the console on sample data; on an open store the owner says yes first.
  Frrata's checkout code draws them. Fields, steps, prices, payment and the legal block are Frrata's.
- **One bag.** With one address there is one bag: Frrata's, in the browser, on that address. The site reads and writes it
  through a small Frrata script. The bag link keeps working for links from outside.
- **One brand record** for stores with a code site. The logo, its variants, colours and type are saved once, made by
  Frrata's identity step or uploaded. The console, checkout, emails, invoices, share images, the API, the site and Studio
  read it. Theme shops keep their look until they move (ADR-0014 rule 5).
- **The pilot's bag bug is confirmed.** The pilot store has no Website set, so every hand-off joins the site's bag onto
  Frrata's and nothing removed on the site leaves Frrata's bag. A small safe fix ships first (P0).
- **No new store domain.** `frrata.store` is dropped. Stores stay on `frrata.shop`, which goes to the Public Suffix List.
  No security property waits on that listing. One preview domain is kept, and Frrata's app serves nothing on it.
- **One decision record,** ADR-0019 "One address" (proposed), replaces 23 scattered edits. Studio's runtime record
  becomes ADR-0020.
- **What it costs Frrata.** Nothing new for a merchant. The router bills on the `frata` team: on Vercel's Flat Rate CDN
  about ₹0.21 per 1,000 site page views (document only), on metered pricing ₹1.26–4.57; hosting is priced only on
  measured numbers (§ Unit economics). One address brings Frrata to parity with Shopify, not ahead of it.
- **The owner decides 25 things** (§ Owner decisions); 1–4, 7, 22 and 23 unblock everything.

## Goal
Ranked problem (4), mobile checkout conversion, and (5), a premium storefront built as code, without giving up checkout's
safety (ADR-0002, ADR-0003, ADR-0014 rule 3) or (7) festive reliability.
Measures, on the pilot and the first 10 code sites, before and after:
- **Bag to checkout:** of shoppers who tap Checkout, the share whose checkout shows exactly the site's bag (target 100%;
  today the pilot fails every edit after a first hand-off). From the e2e matrix and the beacon's `begin_checkout`.
- **Checkout completion:** orders ÷ `begin_checkout` on code sites against theme shops of a like size (H-1).
- **One look:** checkout, the order page and emails pass `mockup-parity-reviewer` against the site's design system.
- **Zero shopper data readable by site code:** the proof suites (`secure-frame`, `one-address`) green on every deploy.
- **One logo:** the logo the console shows, the API answers and the site draws are the same file, by hash.

## Job
A brand's shopper buys on one address in one design with one bag, while the brand's partner shapes how every page looks
and never touches a shopper's details.

## What is wrong today (read in the code, 2026-11-16)
| What | Where | Effect |
|---|---|---|
| Two bags on two origins | The site's `bag.v1` (`mokobara/lib/bag.ts`); Frrata's `frata.bag.v1` on the checkout host (`src/components/storefront/bag-store.ts`) | They drift apart |
| The hand-off replaces only when the referrer is the store's Website | `src/components/storefront/cart-link.tsx:24` | Otherwise it joins (security review L1) |
| The pilot store has no Website | `mokobara/lib/generated/shop-snapshot.json`: `"siteOrigin":null`, `"checkoutOrigin":"https://testing.frrata.shop"` | Every hand-off joins: **the bug the owner hit** |
| A test key works only while no Website is set | ADR-0018 amendment (test keys before a domain) | No site built on a test key can ever reach the replace path |
| Checkout clears only Frrata's bag | `checkout.tsx` `done()` | After an order the site's bag is still full |
| Checkout lines have no Remove or quantity | `checkout.tsx` "Your order" | A stale line is fixed only in the old theme's bag drawer |
| Checkout and order pages wear the old theme | `src/app/s/[host]/_frame.tsx` | The owner's point 1 |
| The pilot drew its own logo | `mokobara/docs/design/house-of-ayuda-design-system.md` § 1.1; the store's `logo` is null | The owner's point 3 |
| Policies, checkout and orders leave the brand's address | `mokobara/lib/links.ts` | The owner's point 2 |
| EkCode's prefill answers on an ambient cookie with no Origin check on GET | `src/app/api/shop/ekcode/me/route.ts:16–23` | On one address, partner code could read name, phone and address |
| Checkout keeps the typed form and the pending order token in tab storage | `checkout.tsx:27, 213` | On one address, partner code could read them |
| A public key answers only when `site_origin` is a proved connected domain | `drizzle/0149_test_keys_before_domain.sql:31`, `app_site_origin_check` (0142) | A one-address store on `<store>.frrata.shop` could never get a live key (ADR-0018 must change) |
| "Runs elsewhere" is read from `site_origin` in many places | `siteMove` (`src/app/s/[host]/(shop)/layout.tsx:14`, `_meta.ts`), the sitemap's `elsewhere` (`sitemap.xml/route.ts:24`), the API's `siteOrigin`, `cart-link.tsx`'s `site`, analytics' `own` (`src/domains/analytics/source.ts:133`), `app_storefront_key` | One address needs one predicate, not a fifth copy |
| The logo has two writers in waiting | `settings.brand.logo` (`console/settings/actions.ts:319`) and Studio's `logo_propose` | One writer needed |

## Research (current sources only; dated; "no current source found" where none)
| Product | How it does one domain with a hosted checkout | Taken |
|---|---|---|
| **Shopify Hydrogen on Oxygen** (shopify.dev "Go live", undated, read 2026-11-16) | The storefront on the primary domain; "a subdomain, such as `checkout.example.com`, serves Shopify checkout" | **Skip the split** (the owner rejects it). Take: checkout stays the platform's code whatever runs in front |
| **Shopify online store** (no current source found for today's checkout path) | Theme code and checkout share the shop's domain | Take: one domain is normal for a hosted checkout. Skip: Shopify trusts theme code as the merchant's own; Frrata's rule is stricter (a partner never reads shoppers, ADR-0015) |
| **Shopify checkout UI extensions** (shopify.dev, page on `api_version 2026-10`, read 2026-11-16) | Partner code runs "in an isolated sandbox", "inside of a Web Worker which doesn't have access to `window` or the DOM"; 64 KB; no payment data; network only by a granted capability; the information, shipping and payment steps on Plus only | **Take:** partner code never in checkout's document. **Skip for now:** extension slots (YAGNI) |
| **Shopify checkout branding API** (shopify.dev "Styling", undated, read 2026-11-16) | Colours, typography, corner radius, header alignment and position, sections, favicon; "You can't currently customize styling for individual pages"; SVG not supported; Plus only | **Take:** design as data from a closed set; one style across checkout pages. **Skip:** Plus-only |
| **BigCommerce Embedded Checkout** (developer.bigcommerce.com, undated, read 2026-11-16) | Checkout in an iframe; for Safari "your checkout page must be served from the same domain as your BigCommerce storefront" (`www.mystore.com` with `checkout.mystore.com`) | **Take:** a frame works in Safari only when same-site with the page: the frame sits on `secure.<the store's host>`. **Skip:** the whole checkout framed on the partner's page |
| **BigCommerce Catalyst** (Klaviyo community thread, April 2026, [secondary]) | A checkout subdomain loses the site's identity cookies | Take: a split loses state |
| **Swell** (swell.is help, undated) | Hosted checkout included; styling in the theme editor | Taken: checkout look as data. Custom checkout domain: no current source found |
| **Saleor** (saleor/react-storefront, undated) | The merchant deploys the checkout app | Skip: a checkout the brand runs. Custom domain: no current source found |
| **Stripe Elements** (docs.stripe.com security guide, undated, read 2026-11-16) | Card fields in frames on Stripe's own origins (`*.js.stripe.com`); no support for cross-origin isolated sites | **Take:** sensitive inputs in frames on the platform's origin; no COEP |
| **Vercel, one domain over several projects** (KB guide, updated 2026-10-02) | Microfrontends, Next.js multi-zones, or a proxy with rewrites | Taken: rewrites to another deployment |
| **Vercel Microfrontends** (vercel.com/microfrontends and docs, read 2026-11-16) | Path → project inside one group; sources conflict on price ($250 a project a month past two in one) [secondary, conflicting] | Skip at fleet scale |
| **Vercel project-level routing rules** (docs, updated 2026-08-11) | Before the deployment's routes: match host, header, cookie, query; rewrite to an external URL; set, append or delete request and response headers by name; publish instantly by REST API | **First router candidate.** Unverified: rules a project (a forum says 100), host captures, allowlisting headers (the docs show delete by name only) |
| **Vercel external rewrite caching** (changelog 2026-03-30, in force 2026-04-06) | New projects cache by upstream headers; older projects opt in (`x-vercel-enable-rewrite-caching`); purge by `Vercel-Cache-Tag` | Taken: the `frata` project predates it; caching stays off until the spike proves `Vary` and RSC are honoured |
| **Next.js multi-zones** (nextjs.org, updated 2026-06-01) | Zones share a domain; each zone's assets need their own prefix; moving between zones reloads the page | **Take:** the site's `assetPrefix` is its own deployment's absolute origin, so its assets never pass the router; links into Frrata's paths are plain `<a>` |
| **COOP** (MDN, modified 2026-07-12) | `same-origin` and `unsafe-none` never share a browsing context group; "any references between the new document and its opener are severed" | **Take**, on one-address hosts only; in-app browsers tested in the spike |
| **Fetch metadata** (MDN `Sec-Fetch-Site`, modified 2026-09-28) | `same-origin`, `same-site`, `cross-site`, `none`; widely available since March 2023 | **Take:** refuse when present and not `same-origin` (iOS before 16.4 sends none; `require-ek.ts:26`'s rule) |
| **CSP** (MDN, modified 2026-03-22) | No directive limits top-level navigation; `worker-src` governs ServiceWorker scripts | **Take:** `worker-src 'none'` on partner pages; exfiltration's last door is that there is nothing to send |
| **Service-Worker request header** (MDN, modified 2025-07-04: older than 12 months, unverified) | Sent on a service worker's script fetch | Taken as a second lock only |
| **WebKit tracking prevention** (webkit.org, undated, read 2026-11-16) | Script-written storage deleted "after 7 days of no user interaction"; all third-party cookies blocked; third-party storage partitioned and ephemeral | **Take:** the frame is same-site with the page, so its cookie and storage are first-party |
| **Safari partitioned cookies** (WebKit bug 306194, 2026-01-24; Google lists Safari 26.2 [secondary]) | Partitioned cookies dropped after cross-site redirect chains | Skip: nothing leans on partitioned cookies |
| **Public Suffix List** (guidelines wiki, edited 2025-05-23: older than 12 months, unverified; PR template notice 2026-05-06; frata-integrations § Domains: Vercel 2026-09-16, Let's Encrypt 2026-08-05) | The owner's PR; `_psl` TXT with the PR URL kept for good; ≥ 2 years left; no review-time promise; small projects declined; not for rate limits; Let's Encrypt counts 50 certificates a registered domain a week by the PSL | **Take:** submit `frrata.shop` now; nothing depends on it |
| **How browsers pick up the PSL** | no current source found for any browser | Taken: months; old in-app WebViews longer |
| **Razorpay Checkout and UPI intent inside a frame** | no current source found | A spike before P3, with `integration-researcher` |
| **Indian tools** (GoKwik, Shiprocket Fastrr product pages, live 2026-11-16; no dated source on isolation) | One-click checkouts open as a layer over the brand's page on their own origin | Taken: a layer on the platform's origin is familiar to shoppers in India |

**In the codebase:** the bag, its frozen link, the cart island, host routing (`host.ts`, `middleware.ts`; `/api/*` answers on
shop hosts, `host.ts:140`), headers (`security-headers.ts`: no COOP anywhere today), `requireShop` (exact-host Origin on
POST), EkCode's cookies (`__Host-shop_s`, the readable `shop_in` hint), checkout's tab storage, `shopHref` (the identity
function, `_shop.ts:21`), the logo (`logo_url`, raster renditions only today: PNG, JPEG, WebP), `doc_logo`, the accent and
display font enums, the contrast rule, `shopCached`'s tags (`shop:<t>:settings`), `RESERVED` slugs (`src/domains/signup/slug.ts`),
`checkDomain` (`src/domains/addresses/domains.ts`), `hostFacts` (tag `host:<host>`).

## Design

### 1. One address per store: the options compared
| | **A. Frrata at the door** (recommended) | B. The site inside Frrata's app | C1. The site's project holds the address | C2. Checkout sub-address | C3. Whole checkout framed on the site's page | C4. Vercel Microfrontends |
|---|---|---|---|---|---|---|
| What it is | Frrata's `frata` project holds the store's host. Reserved paths are Frrata's; every other GET goes to the store's one verified site deployment | The kit and partner code built and served by Frrata | The site's project holds the domain and forwards reserved paths | Hydrogen's and Catalyst's way | BigCommerce Embedded Checkout | One group per store |
| Partner code next to checkout | Same origin in the browser; never in checkout's document or runtime | Same origin, plus partner server code in checkout's runtime | Same origin; checkout behind partner infrastructure | Same site, other origin | The partner's page surrounds checkout | Same origin |
| Shopper data | Only in the frame (§ 2) | As A, plus a shared runtime | Tenant from a forwarded header (refused, ADR-0002) | Safe | Safe inside the frame | As A |
| Latency | Site pages: one hop inside Vercel bom1 for the page document only (assets come from the site's own origin); budget ≤ 30 ms p75 TTFB. Checkout: one navigation fewer (no `/cart` stop) | None | One hop on checkout | A second origin, cold | A frame | Vercel's routing |
| Cost | A Frrata edge request and the document's bytes again per site page view, plus RSC navigations and prefetches (H-2; § Unit economics) | Builds and functions in the main team | As A, reversed | As today | Frames | $250 a project a month past two [secondary] |
| Vercel feasibility | Routing rules or Routing Middleware + Edge Config (spike, with a switch point); external rewrites cached only once proven | Native | Rules owned by the fleet | Native | Native | One team, one default app a group |
| Domain proof, TLS | As today, plus `secure.<host>`: its record proved and its certificate issued before one address switches on | As today | Domains move teams | One more record | As today | As today |
| Cookies | None on the brand origin; `__Host-` first-party on the secure host | As A | As A | Split: identity lost | Third-party in Safari | As A |
| What breaks | Next's `/_next/*` is Frrata's on that host (the site's assets live on its own origin); site → Frrata pages are full loads; a site's routes, POSTs, service workers refused | ADR-0014 rule 2; a bad partner build can break checkout's deploy | Checkout's uptime and headers depend on the partner | The owner's rule | Safari, clickjacking, the legal block beside a partner's page | Fleet scale |
| Verdict | **Take** | Reject | Reject | Reject (owner) | Reject; its frame taken narrowly in § 2 | Reject |
Also weighed: **C5, no partner JavaScript** (server-rendered partner code, Frrata's islands only): kept as the fallback if
the frame or COOP fail in the spikes, including for in-app browsers only. **Cloudflare in front:** whatever holds the host
carries checkout, and checkout through a third-party router breaks the kit spec § 7; sites could sit behind Frrata's door
as an upstream later.

**Why A.** The address is the brand's, Frrata's app answers checkout first-hand, the partner's server code never runs
beside checkout, and the tenant still comes from the Host. Its hard problem, partner JavaScript in checkout's origin, is
solved in the browser by § 2. ADR-0014 rule 2 is amended in ADR-0019 to say so: generated code never runs in Frrata's
runtime, and in the browser it shares checkout's origin only under § 2's controls.

**The reserved paths** (one pure list, `src/domains/tenancy/reserved.ts`, read by the routing writer, the gate and the
tests; matched case-insensitively as one prefix rule, a fixed negative match in every routing rule):
`^/(cart|checkout|orders|account|policies|api|_next|_frrata|_vercel|\.well-known|og|icon|email|s|secure)(/|$)`, plus the
exact `/fe.js`. A first segment holding `%` or starting `//` goes to Frrata's 404. Every other path, `/` included, is the
site's, **for GET and HEAD only**; any other method on a site path is Frrata's 405. `/robots.txt` and `/sitemap.xml` are the
site's. `/api/*` already answers on shop hosts (`host.ts:140`), so the whole of `/api` is Frrata's.

**When a host serves one address** (one predicate, § 1a): the store has a live code site (V2a's live deployment), the host
is live and proved for the store, and its `secure.` record is proved with a certificate. Until then the host serves as
today.

**For each address:**
- **Own domain** (`brand.com` or `www.brand.com`): Connect my domain asks for the host and `secure.<host>` (a CNAME to
  Vercel); Domain Connect does both where offered. The shopper never sees `secure.`. A theme shop with no code site needs no
  `secure.` record.
- **No domain:** `<store>.frrata.shop` and `secure.<store>.frrata.shop`. The wildcard certificate covers one label only,
  so each `secure.<store>.frrata.shop` is added to the project as its own host with its own certificate (paced; § 6 on
  Let's Encrypt's count before the listing).
- **`frrata.com`** is never a store or site host (owner, 2026-11-16).
- **The API:** `shop.siteOrigin` and `shop.checkoutOrigin` hold the same origin for a one-address store. No field changes
  meaning.

### 1a. One predicate for "this store's site is code, served here" (architecture B2, B1)
Today "runs elsewhere" is `site_origin`. One address must not add a fifth copy. **One definer, `app_website_of(tenant)`**,
returns `{ kind: 'frrata' | 'elsewhere' | 'one_address', origin }`, derived from:
- `one_address`: V2a's `sites` row with a live `site_deployments` row, and the store's main live host with its `secure.`
  proved (`shop_domains`, or the store's own `frrata.shop` name);
- `elsewhere`: `site_origin` set (a split site hosted outside Frrata, as the pilot is today);
- else `frrata`.
A pure mirror in `src/domains/addresses/website.ts` takes the same facts for tests. **Every reader moves to it:**
`app_storefront_key` (a public key answers for `one_address` too: the ADR-0018 amendment in ADR-0019),
`app_site_origin_check` and its trigger, `siteMove` and `_meta.ts`, the sitemap's `elsewhere`, `apiShop`'s `siteOrigin`
and `checkoutOrigin`, `cart-link.tsx`'s `site`, analytics' `own` (`source.ts`), Settings › Website, Razorpay's website
check, the D2·7 domain sweeps, Admin › Sites. Proofs § 81 and § 86 are rewritten for it. **The edge's routing map is a copy
built at send time** from this predicate (§ 1b), never a source.

### 1b. Routing: written by Frrata's app only, and it fails closed (security H4, tenancy, architecture 4–6)
- **One writer.** Only Frrata's app writes routing rules (or the Edge Config map), with a token that is Production only
  (`secret()`), never in the outbox, the database or a log; the protection-bypass secret for the upstream is the same.
  The fleet never writes them: it reports a deployment (`webhook_events`); the app records it in `site_deployments`.
- **One fixed upstream a store:** the store's own fleet deployment, verified against its `site_deployments` row before a
  rule names it.
- **What triggers a send:** every writer whose change moves the predicate or the state (publish, rollback, kill, partner
  removed or suspended, store opened, domain added, proved, moved, failing or removed, `secure.` proved, handover) marks
  the routing **dirty** in its own transaction (`app_site_routes_dirty()`, a definer setting one platform row's flag and
  time; the row is the request, ADR-0006). No per-store outbox row: one change or five hundred make one send (speed H2).
- **Its own lane, not the shared drain** (the drain sends 25 rows a batch, one at a time, `src/lib/outbox/drain.ts:72`, so
  order emails and payment checks would wait behind it): `drainRoutes()` runs in the writer's `after()` and from its own
  5-minute cron with its own deadline.
- **One sender at a time without holding connections:** `pg_try_advisory_lock`, never a blocking lock (each waiter would
  hold one of the pool's 10 connections). A sender that can't take the lock leaves the flag for the holder, which sends once
  more at its end if the flag was set again meanwhile (one trailing send).
- **One read for all stores:** the definer `app_site_routes(p_after uuid)` pages through every store's host, `secure.`
  host, upstream and state (500 a page; hosts and ids only; `search_path ''`; revoked from public, anon, authenticated,
  service_role). Each upstream is checked against that store's live `site_deployments` row inside the definer.
- **Only differences are published:** the sender reads the live rules back, compares, writes only what differs, and reads
  back again. The 5-minute sweep does the same and deletes strays (an unconditional write every 5 minutes would cost
  ≈ ₹7,603 a month, § Unit economics).
- **Failing closed:** a removal or a kill is never kept as "last good"; until a removal is read back as applied, the host
  can't be proved by another store (the domain flow waits on the read-back); a partner's removal also stops its deployment
  at the fleet (a second lock).
- **States the edge carries,** each a Frrata page for the site's paths when not live: no code site (as today), build mode
  (Opening soon, noindex), live, paused (time-derived through `pauseWindow`: the map carries the pause's from and until;
  rules that can't hold time are flipped by the 5-minute boundary sweep, while checkout's own refusal of orders is the
  lock), killed or partner removed (maintenance), upstream failing (we'll be back). Checkout, orders and policies work in
  every state as today.
- **Request filtering** (security H2): only GET and HEAD reach the upstream; `cookie` and `authorization` are deleted;
  only an allowlist of request headers is forwarded (`accept`, `accept-language`, `accept-encoding`, `user-agent`,
  `if-none-match`, `if-modified-since`, `range`, and Next's `rsc`, `next-router-state-tree`, `next-router-prefetch`,
  `next-router-segment-prefetch`, `next-url`, with the `_rsc` query kept). A proxied copy's cache key holds the host, the
  path, those headers and `_rsc`, and matches the upstream's `Vary`; otherwise caching stays off.
  `scripts/verify/one-address.mjs` asserts it against an echo upstream.
- **RSC prefetch** (speed M1): every `<Link>` prefetch on a site page is a request through the router (up to 48 a view).
  The kit's product and collection cards set `prefetch={false}` (decision 25); the spike counts RSC requests a view.
- **Response filtering** (security M2, tenancy): an allowlist (`content-type`, `content-length`, `content-encoding`,
  `cache-control`, `etag`, `last-modified`, `vary`, `link` for same-origin preloads, `location` only when relative or the
  same host; plus Frrata's own `Link` preconnects to `secure.<host>` and to the site's asset origin). Every `Set-Cookie` is
  dropped (including static ones from build config), and `Clear-Site-Data`, `Refresh`, CSP, COOP, COEP and
  `Service-Worker-Allowed` from the upstream; Frrata's own headers are set (§ 2 T9). Rules delete headers by name; whether
  they can allowlist is a spike pass/fail item. If neither rules nor middleware can, the fallback **runs at the edge** (an
  edge function streaming the response; never a bom1 function in front of every page and prefetch, whose cold start is
  0.3–1 s), or the owner accepts a deny-list plus source controls (decision 21).
- **The site's assets** come from its own origin (absolute `assetPrefix`), at the cost of a cold connection (≈ 240 ms)
  before render-blocking CSS: the router sends a preconnect for it, and the spike measures LCP against proxying the assets
  cached as immutable; the faster wins.
- **Rollout:** headers go Report-Only in waves first, then enforce (kit spec § 4).
- **Vercel limits:** the spike measures rules a project and Edge Config's size (≈ 110 kB at 750 hosts, an estimate), and
  fixes the store count at which the router moves from rules to middleware with Edge Config (reads $3 a million).

### 2. Partner code next to checkout: the security model, threat by threat
**The principle.** The brand origin holds no secret and no shopper data. Frrata's pages there show only what the store's
public pages already show (products, prices, the bag, offers, the delivery rules) plus the frame. Everything personal is
typed, priced, kept, read and sent inside the frame on `secure.<host>`, a different origin in the same site. No check
depends on telling Frrata's document from the partner's: on one origin nothing can.

**What lives where:**
| On the brand origin (Frrata's page, brand's design) | In the frame (`secure.<host>`) |
|---|---|
| The bag lines and their prices, offers, the store's delivery and Pay on delivery rules, the legal block, the design | Mobile number, email, name, address, PIN code, GST invoice fields |
| The order page's number, items and state | EkCode sign-in and its saved address, "Not you?", "Save this address" (EkCode keeps its own look) |
| The bag (`frata.bag.v1`, `frata.bag.by.v1`) and the offer code | The typed form's reload copy, the pending order, the order token |
| `/api/shop/quote` without a PIN code, `/pincode`, `/delivery`, `/e` | `/api/secure/*`: price for the address, place, view, pay, retry, switch to Pay on delivery, change, invoice, EkCode, email opt-in |
| — | The order's summary priced for the address (lines, delivery, the server's total) and **Place order · ₹<amount>**, the only button that places an order |
The frame prices the address itself and sends the page back only a delivery fee or zone name to show (never the PIN code
or state). It is drawn by Frrata's code with the same brand tokens, so it reads as one page.

**How the frame is built** (speed H1: a Next page on `secure.<host>` would download ≈ 122 kB of JS and the 48 kB font again
from a new origin, 0.6–1.0 s on a phone, 1.1–1.5 s with the ready, bag and price round trips):
- a **server-rendered form plus one standalone script** (built like `fe.js`), held by a new gate `check:frame-script` at
  ≤ 25 kB gzipped (decision 24; the alternative is a Next page budgeted honestly at ≈ 120 kB);
- the `<iframe>` is in checkout's **server HTML**, not added by script;
- the bag's ids and quantities ride in the frame's URL in the bag link's own grammar (`?l=<size id>:<qty>,…&code=`, read by
  `parseCartLink`), so the frame prices on its first render; later changes arrive by message;
- checkout's HTML preconnects to `secure.<host>`;
- the font is one absolute Frrata media URL shared by page and frame (one download), with no preload in the frame.

**The one-address checkout gets its own bundle** (checkout plus the bridge is ≈ 121 kB, over its 120 kB budget): the bridge
only, no form code, held by `check:storefront-build`.

**One form, not two** (architecture 9). Theme shops keep today's checkout until V5; one-address stores use the frame. Both
draw the same fields from one field list (`src/domains/checkout/fields.ts`: labels, order, rules, autocomplete) and call
the same handlers (one implementation mounted under `/api/shop` and `/api/secure`;
one EkCode cookie module taking the host kind). `hasFrame(store)` is the predicate's `one_address`.

**Threats and controls:**
| # | Threat | Control | Proof |
|---|---|---|---|
| T1 | Partner JS reads checkout's DOM through `window.open` or a named window | On one-address hosts only (never the global `security-headers.ts`): Frrata's pages send COOP `same-origin` (or `same-origin-allow-popups` where Razorpay or EkCode's popup needs it, the spike decides); partner responses get `unsafe-none`. With the frame, checkout's top document holds no personal data anyway | e2e in Chrome, Safari and the in-app browsers (spike) |
| T2 | Partner JS frames `/checkout` or `/orders` | `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every Frrata page | e2e |
| T3 | Partner JS fetches Frrata's pages | They are shells with no personal data; no Frrata cookie on the brand origin | proof: shell bytes carry no personal field |
| T4 | Partner JS calls personal APIs with the shopper's cookie (today `/api/shop/ekcode/me` answers on GET with no Origin check) | On one-address hosts those routes answer only on the secure host (`/api/shop/*` personal routes 404 there); the secure host gives no CORS, and refuses unless the Origin is exact and `Sec-Fetch-Site` is absent or `same-origin` | unit per route; e2e |
| T5 | Partner JS reads storage left by checkout in the same tab | Nothing personal written to brand-origin storage (`check:storage`) | gate + e2e |
| T6 | A service worker at scope `/` intercepts `/checkout` | `worker-src 'none'` on partner pages; the router answers a `Service-Worker: script` request with a script that unregisters itself (clearing any earlier one); the kit forbids one | e2e: `register('/sw.js')` fails, an old one is gone after a visit |
| T7 | Partner JS plants cookies (session fixation) | No Frrata cookie on the brand origin; the secure host reads only `__Host-` names | unit |
| T8 | CSRF from partner JS or a sibling store | Exact Origin on every non-GET (as today) and `Sec-Fetch-Site` absent or `same-origin` on personal and state-changing routes; logged before enforcing; named exemptions (EkCode's return is a cross-site GET navigation) | unit per route |
| T9 | Exfiltration from partner pages | Partner pages get `default-src 'self'`; `connect-src`, `img-src`, `frame-src`, `font-src` only the site's own asset origin, Frrata media and hosts the live version declared (amendment 9: a new host needs the owner); `form-action 'self'` with only GET reaching the site; `worker-src 'none'`; `object-src 'none'`; `base-uri 'none'`; `frame-ancestors 'none'`. **This only raises the cost**: top navigation can't be limited by CSP and WebRTC sits outside it. What covers it is that partner pages never hold shopper data (T3–T5, T13) | `one-address.mjs` header matrix |
| T10 | Phishing: a fake checkout on a site path | The gate refuses personal-data inputs in site code (build output and a headless crawl: `autocomplete` tel, email, name, address, postal-code, cc-*; `type=tel`, `email`, `password`), refuses `RTCPeerConnection`; synthetic phone crawls at random times; CSP reports; the kill switch | gate tests; the fleet's smoke crawl |
| T11 | Clickjacking Frrata's pages | `frame-ancestors 'none'` on Frrata's and partner pages | header matrix |
| T12 | A partner page frames the secure frame | The frame allows only the store's own host as ancestor (built from the Host string, never a database read), renders nothing when it isn't framed, refuses `Sec-Fetch-Dest: document`. Shown on a partner page it shows the shopper only their own details and the server's total; Place order needs a tap inside it and carries the amount; the worst result is a Pay on delivery order the shopper confirms | **residual, low** |
| T13 | Partner JS sends the frame messages | The frame accepts a message only when `event.source === window.parent` and the origin is exactly the store's address, with a closed schema (bag ids and quantities, method, code); it sends only to that exact origin, never `'*'`; it never sends a personal field, a PIN code or a token; EkCode's popup does the same | unit on the schema; a probe sends every other shape and source |
| T14 | Open redirects | `shopHref` is the identity function today (`_shop.ts:21`), so it is not the guard: return parameters (EkCode, payment) pass a pure `samePath(p)` (starts with one `/`, no `//`, no scheme, no backslash, ≤ 200 characters) | unit |
| T15 | Cache poisoning across stores | Frrata's pages cached by the rewritten `/s/<host>/…` path; the secure host's pages are never cached (§ 2b); a reserved path never reaches the upstream; every upstream `Set-Cookie` dropped; proxied pages cached at Frrata's edge only once the spike proves the key holds the host and `Vary` and RSC are honoured, else caching off | `one-address.mjs`: host B never receives host A's copy |
| T16 | One store attacks another | Each store on its own registrable domain or `<store>.frrata.shop`. Until the PSL listing reaches browsers sibling stores are same-site: tossing defeated by `__Host-` only; SameSite bypass closed by T8. **Left:** a partner of store Y can flood `Domain=frrata.shop` cookies to break loads of store X, or evict X's cookies from the shared jar, for shoppers who visited Y | e2e `cross-store`; residual named |
| T17 | Spectre-style reads | Partner pages never get COEP (no `SharedArrayBuffer`); COOP separates Frrata's pages | header matrix |
| T18 | The partner answers a reserved path, or keeps serving after removal | The routing rule's negative match decides first; removal fails closed (§ 1b) | e2e |
| T19 | Pixels or outside scripts on checkout or order pages | Never; conversions through Frrata's Conversions API and beacon | gate on Frrata's checkout routes |
| T20 | Payment diversion through brand content (a UPI ID, a phone number or a link in the store's words or logo) | The two lines refuse UPI IDs, phone numbers, URLs and runs of 6 or more digits; on an open store a change to the brand record or checkout design by anyone but the owner or a Manager waits for the owner's yes; SVG is cleaned against an allowlist of elements and attributes and only ever shown through `<img>`; emails and documents get a PNG rendition | unit on the line check and the SVG cleaner; e2e on the approval |
| T21 | A connected domain removed while its `secure.` record still points at Vercel (takeover of `secure.brand.com`) | The domain stays parked on Frrata's project until its `secure.` record no longer resolves to Vercel | the D2·7 sweep checks it |

**Residual risk, plainly, and who carries it.**
- **Phishing on the brand's own domain (T10).** A partner set on fraud can draw a fake form on a site page and navigate
  away with what a shopper types. Made hard and short-lived, not impossible. The partner is the brand's own hired,
  verified partner (ADR-0014 amendment 6); the brand chooses and removes it; the partner carries it under the partner
  terms; Frrata detects and takes down.
- **The frame shown on a partner page (T12).** Low.
- **Cross-store cookie flooding and eviction before the listing reaches browsers (T16).** A store failing to load, or a
  shopper signed out of EkCode, for some shoppers until cookies clear; attributable to one partner.
- **In-app browsers** (Instagram, WhatsApp): if the spike shows COOP or the frame's isolation not holding there, those
  browsers get C5, no partner JavaScript (decision 20).

### 2b. The secure host (tenancy H, security M7)
- **Shape:** exactly `secure.<store host>`. `secure` joins `RESERVED` slugs (`src/domains/signup/slug.ts`); `checkDomain`
  and a `shop_domains` CHECK refuse a first label `secure` (checked live 2026-11-16: no store has the slug `secure` and no
  domain starts with `secure.`).
- **`secureHostOf(host)`** (pure, `src/domains/tenancy/host.ts`, with tests): strips `secure.` once; what remains must route
  as kind `shop` (two-label shop hosts are refused by `shopSlugFromHost`, so `secure.` is handled before the slug parse);
  anything else is not found. `routeFor` gains kind `secure`; `secure.*` stays out of `shopRewrites`; the internal path
  `/secure/*` is a 404 on every host (as `/s/*` is).
- **Tenant:** from `hostFacts(stripped host)`, the same cached lookup as the store's, so a `host:<X>` purge covers both.
  The `[host]` route param is only a cache key, checked equal to the Host header.
- **Reads:** the store, brand and module facts through cached loaders read outside any transaction (`shopModules` is only
  React `cache()` today, `src/lib/queries/modules.ts:55`; its facts move into a `shopCached` loader); one `withTenant` for
  the shopper's own reads (EkCode session, prefill). Ceiling: about 4 statements a frame render.
- **Rendering:** per request, with a nonce and a strict CSP (`default-src 'none'`; `script-src 'nonce-…' 'strict-dynamic'`;
  `connect-src 'self'` and Razorpay's hosts when the spike puts Razorpay in the frame; `frame-src` Razorpay; `img-src
  'self'` and Frrata media; `font-src` Frrata media; `style-src 'self'`; `form-action 'self'`; `frame-ancestors` the store's
  host). Never a cached shell. `Cache-Control: private, no-store`.
- **Cookies:** `__Host-` only, `SameSite=Lax`, HttpOnly; EkCode's 30-day session moves here (current shoppers sign in once
  more); the readable `shop_in` hint goes.

### 3. Partners design checkout and order pages; they never touch the data
Checkout's design is **data**, drawn by Frrata's own code.
| May be set | Never set |
|---|---|
| The brand record's tokens (§ 5): logo (from the record), palette roles, display and body fonts (Frrata's list or font files on Frrata media), radius (0, 4, 8, 12, 16 px), density | Which fields are asked, their labels and order |
| Header: logo left or centred; a "Back to <store>" link on or off | The steps and their order; the payment step; Razorpay's screens |
| Footer: the legal block always, policy links in one row or two | The legal block's presence and words (`shop.legal`, PP1) |
| Trust blocks from the store's own facts, chosen and ordered from a closed set: delivery days, returns, Pay on delivery, secure payment, GST invoice. Their words are derived from those facts, never typed | Prices, totals, offers, fees, the pay button's words |
| **Two lines**, plain text: a checkout heading (≤ 24 characters) and a thank-you line on the order page (≤ 120). They refuse UPI IDs, phone numbers, URLs and runs of 6+ digits | Consent, privacy and error words; anything that changes what is collected |
| Frrata's words in English or Hindi (`shop_language`) | Scripts, pixels, outside links |

**The check** (`src/domains/brand/check.ts`, one function for save, preview and render): contrast 4.5:1 for text, 3:1 for
large text and control edges (the rule in `src/domains/themes/contrast.ts`), the failing pair named; inputs ≥ 16 px, body
≥ 14 px, line height ≥ 1.4; fonts from the list or Frrata media, falling back to the system stack; the two lines' rules;
the legal block drawn by checkout's own layout. At render a failing record (saved before a rule tightened) renders with
Frrata's defaults and is listed for the owner.

**Preview:** Console › Brand and Studio's pane show checkout, the order page, the bag-link page and emails on sample data
built from pure fixtures (a sample bag of the store's own products, a sample address, every state), at phone and desktop,
on the console host as today's look preview does.

**Who saves:** owners and Managers; the store's partner people with `CAN_BUILD` (the partner's owner and Leads), as content
is (amendment 8). **On an open store**, a save by anyone but the owner or a Manager waits for the owner's yes (T20), one
tap in Inbox. Builders preview only: they read the record through named-column grants (§ Design review, Tenancy) and never
write; no new capability, ADR-0015 unchanged. Every save is an Activity row; the previous record is kept for Undo.

### 4. One bag
**Where it lives.** One bag per store, in the shopper's browser on the store's one address: today's `frata.bag.v1`
(`bag-store.ts`), its limits (20 lines, 10 a line), its rules (checkout prices again; reconcile drops sold-out lines).

**How the site uses it.** Frrata serves `/_frrata/v1/bag.js` (≤ 3 kB gzipped, measured 1.4 kB; the same bytes on every
host; `Cache-Control: max-age=300, stale-while-revalidate=86400`, or a hashed name, never "immutable" on a fixed URL;
loaded with `defer`; built from `bag-store.ts`'s core): `get`, `add`, `set`, `remove`, `subscribe`, and `quote()`, which calls the
same-origin `/api/shop/quote` (no PIN code) for subtotal, offers and sold-out lines (the pilot's gaps G1 and G25, no key
in the browser; measured 9 statements, 27 ms, 865 bytes a quote). The site never computes a total. The kit's bag button
and drawer use it, and quote **only while the drawer is open**, one request in flight, never on `subscribe` or a `storage`
event. `quoteIp` (300 per 10 minutes a network) is re-sized for many phones behind one Indian 4G address. On load it captures attribution
(`captureAttribution`).

**Analytics on one address** (architecture 13): with no hand-off, `via_site` is never set and same-host referrers are
dropped (`source.ts:133`), which is right: on a one-address store the website is the store. Sources are classified by the
landing page's own tags and the outside referrer, as for theme shops; "Your website" is not a channel there.

**The bag link, a frozen contract** (`cart-link.ts`, ADR-0018 § 11), keeps working: on one address a same-origin referrer
replaces the bag; any other joins it (L1). Links in Instagram DMs, WhatsApp, emails and split sites keep working.

**P0, the pilot's fix now:**
- The bag remembers who last filled it (`frata.bag.by.v1`), written inside `write()` itself: `link` when a bag link fills
  it; `shop` when the shopper adds, sets or removes on the store's own Frrata pages (theme product pages, the bag drawer).
  `shop` stays until `clear`. Checkout's own changes leave it as it is: reconcile, the gift button and, from P2, checkout's
  Remove and stepper. `clear` empties it.
- A bag link **replaces** a bag only links filled and **joins** a bag the shopper built (`shop`). The referrer check stays
  as a second way to replace.
- So for the pilot every hand-off makes Frrata's bag the site's bag, whatever the referrer.
- **Cost:** about 20 lines in `bag-store.ts` and `cart-link.tsx`, a pure `src/domains/checkout/bag-fill.ts`, its tests, two
  steps in e2e `92-storefront-sale`; no migration, no API change. Security L1 narrows: a crafted link can replace a bag only
  links made (items lost, no money, no data). Needs `security-reviewer` and decision 2.
- **Not fixed:** the split site's own bag stays full after an order. P6 closes it.

### 5. One brand record from Frrata's system (for code-site stores)
**Which stores.** A store with a code site, or one being built (architecture 10). Theme shops keep their look and accent
(ADR-0014 rule 5: no theme work); their console, emails and documents read `logo_url` as today.

**What it holds:**
- **Logo files.** The primary stays `shop_settings.logo_url` (gaining a CHECK to the store's media folder); optional mark,
  stacked and reversed files in `brand_tokens`. Raster (PNG, WebP) as today, or SVG cleaned against an allowlist of elements
  and attributes and shown only through `<img>`.
- **Derived, never stored twice:** favicon and icons (`icon.ts` reads `logo_url`), share-card marks, and a PNG rendition of
  the primary (by `sharp`, already installed) at `tenants/<t>/documents/<sha256>.png`, which documents and emails read
  when `doc_logo` is empty. `doc_logo` stays the owner's own upload only.
- **Palette roles, type, radius, density, seasons:** BT's `brand_tokens` and `brand_seasons`, typed columns. `accentOf`
  is the one accent rule (the record's accent, else the enum's colour); the theme shell is not edited.

**One writer.** `saveBrand` in `src/lib/content/save.ts` is the only writer of the record and of `logo_url`; today's
`settings.brand.logo` action becomes a call to it, and so do Studio's Apply and Console › Brand. **One cache tag:**
`shopBrand` is a `shopCached` loader of scope `settings` (`shop:<t>:settings`), the tag `shopFor`'s settings already use.

**Where it comes from.** Frrata's identity step (Studio's `logo_propose` and `tokens_propose`, Studio spec § 4) or an
upload in Console › Brand. A partner in its own Claude Code proposes nothing in code: the partner skill says "read
`shop.brand`; change it only in Console › Brand". The identity step's agent design belongs to Studio V3a.

**Who reads it:**
| Reader | Reads |
|---|---|
| Console (header, previews, Settings) | the record |
| Checkout, bag-link page, order pages, policies (code-site stores) | the record and § 3's design |
| Emails (`layouts.ts`, `compose.ts`) | the record; the PNG rendition |
| Invoices and slips | `doc_logo`, else the PNG rendition |
| Share images, icons | the record |
| The Storefront API | `shop.brand` (additive): logo files, palette, type, radius, density; `shop.logo` stays the primary; `updated_by` never |
| The partner's site | `shop.brand` through the kit's `<Logo>` and `<BrandStyle>` |
| Studio's agent | `shop.brand` and the proposals |

**Held by a check:** the kit's `npm run check` and the publish gate fail a site that ships its own logo (`logo*`, `brand*`,
`monogram*` files, or an inline SVG in the header instead of `<Logo>`) or a hex colour or font family not from
`shop.brand`'s variables. **No logo:** the store's name in the record's display font; invoices print the legal name only;
icons use the first letter on the accent.

### 6. Cross-store isolation and `frrata.shop` on the Public Suffix List
**Before the listing** (P4a, before any outside partner's code serves on `frrata.shop`):
- **`check:cookies`** (new gate, scoped to the shop and secure host code: `src/app/s`, `src/app/secure`, `src/app/api/shop`,
  `src/app/api/secure`, `src/lib/ekcode`): every cookie host-only with a `__Host-` name; the `shop_in` hint is allowed until
  P3 removes it; the console's Supabase cookies are out of scope.
- **Frrata reads only `__Host-` names** on store and secure hosts.
- **`Sec-Fetch-Site`:** refused when present and not `same-origin` on personal and state-changing routes (absent passes:
  iOS before 16.4), logged for a week before enforcing; named exemptions (EkCode's return GET).
- **Frrata's own hosts under `frrata.shop`** (`api.`, `notify.`, `secure.*`) set no cookie but the secure host's own.

**The listing (P4b).** The owner opens a PR to `publicsuffix/list` adding `frrata.shop` to the PRIVATE section with the
automated template (2026-05-06), a `_psl.frrata.shop` TXT holding the PR's URL (kept for good) and ≥ 2 years left (renew to
3 years first). The reason: brands' and partners' code on per-store subdomains needs cookie and site isolation; not rate
limits. It may be declined while Frrata is small. **The plan works if it is declined.**

**What the listing changes:**
| What | Effect | Action |
|---|---|---|
| Existing stores, EkCode, Razorpay | None: no `Domain` cookie; cookies host-only; websites registered per host | `check:cookies` green |
| The apex `frrata.shop` | Becomes a public suffix; it only redirects | None |
| Mail from `notify.frrata.shop` | DMARC's organisational domain becomes `notify.frrata.shop` itself | Confirm `_dmarc.notify.frrata.shop` exists, or move notices to the frratamail domain (the owner's mailing domain) |
| Mail spoofed as `<store>.frrata.shop` | Each store becomes its own organisational domain, outside `_dmarc.frrata.shop` | A `p=reject` DMARC record per store host, or a stated reason none is needed (unconfirmed; P4b·1 checks) |
| Let's Encrypt | 50 certificates a week counts per store, no longer for all of `frrata.shop` | Before the listing, `secure.<store>.frrata.shop` certificates share one 50 a week: paced |
| Analytics referrers | A move between stores reads cross-site | None |
**How browsers pick it up:** no current source found; months assumed, longer for old WebViews and iPhones. Nothing depends
on it.

### 7. Previews: one separate preview domain, and Frrata's app serves nothing there
Previews run unreviewed draft code. On the store's own host they would share the live store's origin; on
`preview.frrata.shop` they would be same-site with every store. So: **a separate registrable preview domain** (the Studio
plan's `frrata-preview.site` or another name), submitted to the PSL at purchase, isolated from every store by being its own
domain whatever the listing does (previews are same-site with each other until it lands; a preview holds no shopper data).
**Frrata's app serves nothing on it** (tenancy H: a token there would be a fourth tenant source): the fleet's preview
deployments answer there, reading the store with a test or build key (the existing third source). The console frames a
preview with `sandbox="allow-scripts allow-same-origin allow-forms"`, `referrerpolicy="no-referrer"` and a per-deployment
token of at most 1 hour in its URL, checked by the fleet's preview gate. A preview's Checkout opens Frrata's sample-data
checkout preview (P2's, on the console host) in the pane; the preview domain never serves checkout.

### 8. Stress tests: scenarios, expected result, how it is guaranteed
"Pilot today" is the split with no Website; "After" is one address with the frame and one bag.
| # | Scenario | Pilot today | After P0 | After | Guaranteed by | Test |
|---|---|---|---|---|---|---|
| S1 | Remove a line on the site after a hand-off, hand off again | Stays (**the bug**) | Removed | Removed | P0; one bag | e2e `92-storefront-sale`, `one-bag` |
| S2 | Change a quantity, hand off again | Summed | The site's | The site's | same | same |
| S3 | Back from checkout, edit, Checkout | Drift | Correct | Correct; bfcache re-read on `pageshow` | `bag.js` | `one-bag` |
| S4 | Two tabs | Two bags | Last hand-off wins | One bag, synced by `storage` | `bag-store.ts` | `one-bag` |
| S5 | Opens `/checkout` directly | Old or empty bag | Same | The site's bag | one bag | `one-bag` |
| S6 | Order placed, back on the site | Full | Full (stated) | Empty | `done()` on the same origin | `one-bag` |
| S7 | A sold-out line | Site shows it | Same | Shown sold out from the quote; reconcile removes it once | `quote()` | `one-bag` |
| S8 | `?code=` on a site page | Only if forwarded | Same | Captured on landing; tab-scoped (a new tab loses it, as today) | `captureAttribution` | `one-bag` |
| S9 | Safari, 7 idle days | Both bags gone at different times | Same | The one bag gone | WebKit's rule (accepted) | written down |
| S10 | Safari and the frame | n/a | n/a | First-party: same-site | `secure.<host>` | e2e on WebKit |
| S11 | Referrer stripped or an in-app browser | Joins | Replaces a link-made bag | No hand-off | P0 | e2e with `no-referrer` |
| S12 | Reload after the UPI app switch | Restored from tab storage | Same | Restored in the frame's own storage | the frame | e2e |
| S13 | New PIN code mid-checkout | Re-priced | Same | Re-priced inside the frame; the page shows the fee only | the frame prices | e2e |
| S14 | A crafted bag link from another site | Joins | Joins a shopper-built bag; replaces a link-made one | Joins | `bag-fill.ts` | unit |
| S15 | Store X then store Y | Separate | Same | Separate (storage per origin) | browser | e2e |
| S16 | Partner removed mid-session | Site keeps serving | Same | Maintenance on site paths within the routing push, and the deployment stopped at the fleet; checkout works | § 1b | e2e |
| S17 | Design fails contrast | n/a | n/a | Refused, pair named; defaults at render | `brand/check.ts` | unit, e2e |
| S18 | No logo | Name in theme type | Same | Name in the brand's display font | § 5 | e2e |
| S19 | The site ships its own logo | Allowed | Allowed | Refused | kit check, gate | gate unit |
| S20 | Brand connects a domain while a bag sits on `<store>.frrata.shop` | n/a | n/a | Old host redirects; that bag stays on the old origin | accepted, said in the connect dialog | e2e `domains` |
| S21 | Main domain failing | Checkout falls back | Same | Site and checkout fall back together | one predicate | e2e `domains` |
| S22 | Sibling store sets `Domain=frrata.shop` cookies | n/a | n/a | Ignored; flooding or eviction may break loads until the listing (residual) | P4a | e2e `cross-store` |
| S23 | Sibling store posts to store X | n/a | n/a | Refused (`Sec-Fetch-Site: same-site`, Origin) | P4a | unit |
| S24 | Partner page registers a service worker | n/a | Allowed on its own origin | Refused; an earlier one unregisters | T6 | e2e |
| S25 | Partner page opens or frames `/checkout` | n/a | n/a | No access | T1, T2 | e2e incl. in-app browsers |
| S26 | Partner page fetches EkCode's prefill | n/a | n/a | Refused on both hosts | T4 | e2e `secure-frame` |
| S27 | Partner page reads tab storage after checkout | n/a | n/a | Only the bag, its `by` and the code | T5 | e2e |
| S28 | Partner response cached under a reserved path | n/a | n/a | Impossible | `reserved.ts` | unit |
| S29 | Host A's page served for host B | n/a | n/a | Never | spike pass/fail; caching off until proven | `one-address.mjs` |
| S30 | Site deployment down | Site down | Same | We'll be back on site paths; checkout works | § 1b | e2e |
| S31 | Frrata's app down | Checkout down | Same | The store is down (the address is Frrata's) | accepted | written down |
| S32 | The frame fails to load | n/a | n/a | "We couldn't load the secure form." with Try again; no Place order | the page state | e2e |
| S33 | JavaScript off | Checkout needs it | Same | Same | — | written down |
| S34 | The pilot today (test key, no Website, never opened) | Bug | Fixed | Build mode on one address only after P3 (decision 7) | ADR-0019 | e2e |
| S35 | A partner page frames the secure host and posts a bag | n/a | n/a | The frame shows the shopper's own details and total; nothing leaves; a placed order needs a tap and is confirmed | T12, T13 | e2e |
| S36 | A partner page uses `history.pushState('/checkout')` then frames the secure host | n/a | n/a | As S35: the frame never trusts the parent's path | T12 | e2e |
| S37 | A store pause starts with no event | n/a | n/a | Site paths show the paused page within 5 minutes; checkout refuses orders at once | § 1b | e2e with a clock |
| S38 | A domain is removed while `secure.` still points at Vercel | n/a | n/a | Kept parked until it doesn't | T21 | sweep test |
| S39 | A partner's design change on an open store | n/a | n/a | Waits for the owner's yes | T20 | e2e |
| S40 | The heading line carries a UPI ID | n/a | n/a | Refused at the field | T20 | unit |
| S41 | 500 stores change at once (a kit release) | n/a | n/a | One dirty flag, one send of the differences; order emails never wait | § 1b | unit on the sender; 500 marks in a test |
| S42 | A shopper on 4G opens checkout cold | Checkout only | Same | The frame prices on its first render from its URL; one font download | § 2 | `95-speed` gains the one-address checkout |
| S43 | A site page's links prefetch | n/a | n/a | Off on the kit's cards; RSC requests counted | § 1b | P5·0, P5·1 |

### 9. Phases (the plan has tasks, verify commands and lanes)
| Phase | Gives | Needs first | Mockup |
|---|---|---|---|
| **P0 Bag link fix** | The pilot's bag bug closed | Decision 2 | none (bug fix) |
| **P1 One brand record** (replaces Studio plan BT) | One logo and palette for code-site stores, one writer, one tag | Decisions 8–11, 17, 19 | **new:** Console › Brand |
| **P2 Checkout and order pages in the brand's design** | The pilot's checkout in House of Ayuda's look, on today's hosts | P1; decisions 13, 14 | **new:** checkout, order, bag-link and policy pages; Console › Brand › Checkout |
| **P3 The secure frame** | Shopper data off the brand origin | P2; P3·1 spike | **new (states)** |
| **P4a Cross-store hardening** | No `Domain` cookies, `__Host-` only, fetch metadata | — | none |
| **P4b PSL listing** | Each store its own site in browsers that have it | P4a; decision 4 | none |
| **P5 One address** | The site and checkout at one host | V2a·1, ·5, ·6; P2; **P3 for any store with real shoppers**; P4a; P5·0 (billing read and the pilot's HAR, an afternoon); P5·1 spike | **new:** Settings › Website, we'll be back |
| **P6 One bag** | The site uses Frrata's bag | P5 | the pilot's own bag drawer |
| **P7 Studio designs checkout** | Checkout design in Studio's pane | P2; Studio V3b | approved one screen + a Checkout tab |

## Design review
- **UI/UX.** Shoppers: one address, one design, one bag; fields and steps unchanged; lines gain Remove and a stepper
  (decision 13); the frame invisible except loading or failing; the frame's summary and **Place order · ₹<amount>** sit at
  the form's foot (P3 mockup). Owners and partners: Console › Brand (P1), its Checkout tab (P2), Settings › Website (P5),
  phone first, Rule 0, the preview on sample data; a partner's save on an open store shows "Waiting for the owner" and the
  owner gets one Inbox line with Approve. States: empty (no logo), loading, saved, refused (pair or line named at the
  field), waiting for the owner, one, many, no permission (Builder sees the preview only; support visit read-only), phone.
  Norman: the preview is the signifier; constraints over refusals (scales, lists, counters); Undo; feedback ("Saved." and
  the preview updates).
- **Tenancy.** New tenant tables, each in one migration with grant, RLS and a `tenant_rows` policy with no null branch:
  - `brand_tokens` and `brand_seasons`: `frata_app` select, insert, update (and delete on `brand_seasons`); `tenant_rows`;
    `frata_admin` none; `frata_builder` select on named columns only (its `builder_rows` and restrictive `builder_only`
    policies); `previous jsonb` holds the last saved record for Undo, never read as state.
  - `checkout_design` (one row a store: header variant, back link, footer variant, trust blocks as a text array CHECKed to a
    closed set, the two lines with length CHECKs, `previous jsonb`, `updated_by`, `updated_at`): the same grants;
    `updated_by` never reaches the API.
  - `shop_settings`: `frata_builder` gains select on `(tenant_id, logo_url, doc_logo, accent, display_font)` only.
  - Routing: one platform row `site_routes_state` (dirty flag, dirty time, last read-back) with no role grant, written only
    by the definer `app_site_routes_dirty()`; the map read only through the paged definer `app_site_routes(p_after uuid)`
    (hosts, `secure.` hosts, verified upstream, state; `search_path ''`; revoked from public, anon, authenticated,
    service_role; granted to `frata_app`). No tenant data beyond hosts.
  - Where each tenant id comes from: console and Studio saves from `requireMember`/`requireCapability`; shop pages from the
    host; the secure host from `hostFacts(secureHostOf(host))`; the API from the key; the routing sender from its outbox
    row's tenant. Never from a frame message, a URL or a body.
  - Proof blocks: § 98 (`brand_tokens`, `brand_seasons`, `shop_settings` Builder columns), § 99 (`checkout_design`), § 100
    (the predicate `app_website_of`, the rewritten `app_storefront_key`, § 81 and § 86 updated). § 87 and § 88 are taken;
    the Studio plan's § 88–96 need renumbering.
  `tenancy-auditor` on P1, P2, P3, P5.
- **Modularity.** Pure: `src/domains/brand/` (tokens, check, lines, `accentOf`), `src/domains/tenancy/reserved.ts`,
  `secureHostOf` in `host.ts`, `src/domains/checkout/frame-messages.ts`, `src/domains/checkout/bag-fill.ts`,
  `src/domains/addresses/website.ts`. Reads: `src/lib/queries/brand.ts`. One save: `src/lib/content/save.ts` (`saveBrand`).
  Routing: `src/lib/sites/routing.ts` (the single-flight sender). The frame: `src/app/secure/[host]/`.
- **SSOT / DRY.** One predicate for "site is code, served here" (§ 1a) with every reader listed; one logo writer; one cache
  tag; the PNG rendition outside `doc_logo`; one accent rule; one contrast rule; one bag served from its own source; one
  reserved list; one design check; one field list and one handler set for page and frame; trust words derived from
  the store's facts; the routing map a copy built at send time.
- **YAGNI.** No checkout extension slots; no server-side cart; no per-page checkout styles; no Builder writes; no frame for
  theme shops; no second router vendor.
- **KISS.** Frrata's project keeps every store host; one rule set built from one predicate; one frame; today's bag. New
  pieces and why: the frame (partner JS shares the origin); the routing writer (nothing reaches another team's deployment
  today); `checkout_design` (the theme's `checkout: focused` retires); `bag.js` (the site's bag is a copy).
- **Scalability.** Rules one per hosted store until the measured ceiling, then middleware with Edge Config (switch point
  set by the spike); proxied documents only (assets from the site's own origin); one-row-a-store tables behind a cached
  loader; the quote from the bag drawer debounced 400 ms; `secure.` certificates paced under 100 domain additions an hour a
  team and, before the listing, Let's Encrypt's 50 a week.
- **Performance and speed** (speed review OVER BUDGET as first planned; folded in). Measured 2026-11-16: `bag.js` 1.4 kB
  gzipped; a bag quote 9 statements, 27 ms, 865 bytes; checkout HTML 27 kB. (a) Checkout: `shopFor`, `shopBrand` (one
  cached loader reading `brand_tokens` and `checkout_design` together, tag `shop:<t>:settings`) and `shopModules` in one
  `Promise.all`. **Pre-existing:** checkout's cold render is 14 statements, already over its 12 budget; the brand loader
  adds 1 cold, 0 warm. The frame: ≈ 4 statements a render (§ 2b). (b) New queries by primary key; EXPLAIN in § 98–100.
  (c) The brand entry < 4 kB. (d) Checkout HTML grows < 5 kB (the iframe tag, the preconnect). (e) `saveBrand` purges
  `shop:<t>:settings` only (today's logo save purges the whole `shop:<t>`); a predicate change purges `settings` only when
  `app_website_of`'s answer changes; seasons switch by the loader's 60 s revalidate (a season starts within a minute); a
  shopper's action purges nothing. (f) The one-address checkout's own bundle: the bridge only, under 120 kB first load; the
  frame's script ≤ 25 kB (`check:frame-script`); `bag.js` ≤ 3 kB, `defer`. (g) One font at one absolute URL, preloaded by
  the page only; preconnects to `secure.<host>` and the site's asset origin. Router hop ≤ 30 ms p75 on the document; the
  spike also records p95 and a cold edge miss, and bfcache across COOP-different pages (S3 relies on `pageshow`).
  `speed-reviewer` on P2, P3, P5, P6.
- **Reliability.** Routing as § 1b (rows before requests, one sender, read-back, sweep, fail closed). Upstream 5xx → we'll be
  back on site paths. Frrata down → the store is down (accepted). The frame failing → Try again. Every outbound call through
  `fetchWithTimeout` (10 s).
- **Security.** § 2, § 2b, § 6, § 7. New routes: `/api/secure/*` through `requireSecure` (tenant from the Host, exact Origin,
  `Sec-Fetch-Site` rule, `Sec-Fetch-Dest` not `document` for the frame page, Zod with caps, named fields out, the existing
  per-IP limits failing closed); `saveBrand` through `asMember(CAN_BUILD)` with the owner's approval on open stores; the two
  lines as text only; logo files from Frrata media under the store's folder, SVG cleaned, `<img>` only. PII moves from
  brand-origin tab storage into the frame's. Previews hold no production keys. `security-reviewer` on every phase; a
  person's review of P3 and P5; a pen test before outside partners' code serves at one address.
- **Motion and visuals.** No new motion: the frame fades in on the toast's entrance (200 ms, `ease-entrance`; reduced
  motion a 120 ms fade); Remove uses the bag drawer's pattern. Console › Brand leads with the preview strip; trust blocks
  use the kit's icons.
- **Unit economics** (review: NEUTRAL for merchants, HURTS Frrata unpriced; folded in). At ₹94 × 1.10 = ₹103.40 a dollar
  (the Studio spec § 8's loaded rate). A merchant pays nothing new. Frrata pays, on the `frata` team's bill, per 1,000 site
  page views:
  | Pricing on `frata` | Document only (1 request, ≈ 50 kB) | With RSC navigations and prefetches (≈ 11 requests, 100 kB) |
  |---|---|---|
  | Metered bom1 ($2.20 a million requests, $0.20 a GB; ADR-0017) | ₹1.26 | ₹4.57 |
  | Flat Rate CDN (≈ $2 a million requests past the tier; bytes inside it) | ₹0.21 | ₹2.27 |
  | Fallback: Routing Middleware with Edge Config | ≈ ₹1.63 | ≈ ₹8.66 |
  | Fallback: a streaming proxy | ≈ ₹2.71 | — |
  (The review's ₹1.39, ₹7.37 and ₹2.31 were at ₹88 unloaded, about 17.5% low.) **Flat Rate CDN** (vercel.com/docs/pricing/
  flat-rate-cdn, updated 2026-09-14): Pro includes 1M requests and 1 TB; then $20 a month for 10M requests and 50 TB, $100 for
  50M, $300 for 150M; Fast Origin Transfer ($0.25 a GB), functions and ISR are not covered. On it Scale's ≈ 399 GB fits the
  tier, which undoes the Studio spec § 8's "fails 3×" for bandwidth (decision 23).
  **A month per store**, document only (ADR-0017's views: Launch 40k, Growth 400k, Scale 1.33M), and at rule 9a's 3× as an
  included allowance against the proposed hosting lines (Launch ₹500, Growth ₹1,500, Scale ₹4,500):
  | | Launch | Growth | Scale |
  |---|---|---|---|
  | Metered, cost | ₹50.46 | ₹504.60 | ₹1,677.80 |
  | Metered, at 3× | ₹151.38 (30% of the line) | ₹1,513.80 (101%) | ₹5,033.40 (112%) |
  | Flat Rate, cost | ₹8.28 | ₹82.80 | ₹275.31 |
  | Flat Rate, at 3× | ₹24.84 | ₹248.40 | ₹825.93 |
  With RSC traffic metered, the router alone crosses the kill line for Growth and Scale. So **the router counts in ADR-0017
  rule 11's kill-line test** (today it shares out only site-host and build-runner invoices), prefetch is off on the kit's
  cards, and hosting is priced only after P5·0 and the pilot's 30 days.
  **Fixed costs** (not per store): `frrata.shop` renews at Hostinger for ₹3,879 a year ex GST (two more years ₹9,154.44 with
  GST); `frrata-preview.site` is $1.49 then $27 a year (three years $101.47), against a `.com` at $12.03 a year (three years
  $36.09), so the preview domain should be a low-renewal name (decision 6).
  **Baseline** (rule 2): Frrata is dearer than Shopify Basic yearly at Launch by ₹353.25 and well under it at Growth and
  Scale; one address is **parity** with Shopify (its checkout is on the shop's domain), not a gain.
  **Hypotheses** (figure · source · date · test): **H-1**, the only route to "helps": one address and one bag raise checkout
  completion on code sites by ≥ 2 points; to pay the router, delivered orders must rise 2.0%, 2.8% and 4.3% (Launch,
  Growth, Scale) document only, or 7.0%, 10.1% and 15.5% with RSC metered · unit-economics review · 2026-11-16 · the pilot
  and the next 3 sites, 4 weeks before and after. **H-2**, the router costs the table above · ADR-0017's prices and Flat Rate
  (2026-09-14) · 2026-11-16 · P5·0's HAR and billing read, then the pilot's 30 days. **H-3**, the frame adds no EkCode codes
  · this spec · 2026-11-16 · codes per order before and after P3. `unit-economics-reviewer` again on P5 with P5·0's numbers.
- **Theme blocks.** n/a: no theme work; theme shops unchanged.
- **Storefront API.** Additive on `2026-12`: `shop.brand`; optional `shop.bag` after P6. `siteOrigin` and `checkoutOrigin`
  keep their meaning, derived from the predicate. No cost, shopper, draft or `updated_by` field. `api-contract-reviewer` on
  P1, P5, P6.
- **Blast radius.** The middleware and `next.config` rewrites, `routeFor`, `app_storefront_key` and its readers, checkout,
  EkCode, emails and documents, the kit and every code site, the Studio plan's V2a and BT, ADR-0014/0017/0018 (through
  ADR-0019). Footguns: `/_next/*` on the host is Frrata's; a middleware header replaces next.config's (frata-gotchas); a rule
  published before its upstream is verified; EkCode's move costs current shoppers one sign-in; bags on an old origin are
  left at a domain move; a site `<Link>` into a reserved path would try a client navigation (the gate refuses it).

### Stress test of the code the plan will call (read 2026-11-16)
| Severity | What | File | Fix |
|---|---|---|---|
| High | A hand-off joins whenever the store has no Website | `cart-link.tsx:24` | P0 |
| High | No test-key site can reach the replace path | ADR-0018 amendment | P0; P5 makes it moot |
| High | The site's bag stays full after an order | `mokobara/lib/bag.ts`; `checkout.tsx` `done()` | P6 |
| High | EkCode's prefill answers GET on an ambient cookie with no Origin check | `api/shop/ekcode/me/route.ts:16–23` | P3 before P5 (decision 7) |
| High | The typed form and the order token sit in tab storage | `checkout.tsx:27, 213` | P3 |
| High | A public key needs a proved connected domain as `site_origin` | `drizzle/0149…sql:31`, `app_site_origin_check` (0142) | P5 migration and ADR-0019 |
| High | Four homes for "site is code" | `site_origin`, routing, V2a's tables, the readers | § 1a predicate |
| Medium | Checkout lines have no Remove or quantity | `checkout.tsx` | P2 |
| Medium | Checkout and order pages draw the theme | `_frame.tsx` | P2 |
| Medium | The store's logo is empty while the site draws its own | `shop-snapshot.json` | P1 (decision 8) |
| Medium | A second logo writer would appear | `settings/actions.ts:319` and Studio | `saveBrand`, one writer |
| Medium | `shopHref` is the identity function, not a redirect guard | `_shop.ts:21` | `samePath` (T14) |
| Medium | No COOP is sent anywhere | `security-headers.ts` | on one-address hosts only (T1) |
| Medium | The readable `shop_in` hint cookie | `handshake.ts:18, 40` | P3; allowed in `check:cookies` until then |
| Medium | The `frata` project predates default caching of external rewrites | Vercel changelog 2026-03-30 | caching off until the spike proves it |
| Medium | `*.frrata.shop` doesn't cover `secure.<store>.frrata.shop`; `shopSlugFromHost` refuses two labels | `host.ts` | per-host certificate; `secureHostOf` before the slug parse |
| Medium | Before the listing, `secure.` certificates share Let's Encrypt's 50 a week | frata-integrations § Domains | paced |
| Low | `fromSite()` restates `siteHostKey`'s www rule | `cart-link.tsx` | a test that both agree |
| Low | Policy links leave the brand's address | `mokobara/lib/links.ts` | P5 |
| High | The shared drain sends 25 rows a batch one at a time; per-store routing rows would queue order emails | `src/lib/outbox/drain.ts:72` | § 1b: a dirty flag, its own lane |
| Medium | `shopModules` is only React `cache()`: every frame render would read module facts | `src/lib/queries/modules.ts:55` | a `shopCached` loader |
| Medium | `quoteIp` allows 300 quotes per 10 minutes a network | `src/lib/db/rate-limit.ts:30` | re-sized for 4G; the drawer quotes only while open |
| Info | Checkout's cold render is already 14 statements (budget 12) | speed review, 2026-11-16 | pre-existing; the brand loader adds 1 |
| Info | Studio's `93-site-hosting` collides with `93-owner-only`; Studio's proof § 88–96 collide with 0151's § 88 | Studio plan | renumber |

## Out of scope
- Checkout extension slots for partner code (signal: a paying brand's partner asks with a use case).
- A server-side cart (signal: ≥ 3 brands ask, or Instagram-to-Safari bag loss measured above 10%).
- Partner pixels on checkout or order pages (never).
- A frame for theme shops (they retire at V5).
- Builder writes (signal: partners ask for Builders to save designs; needs an ADR-0015 amendment).
- Moving the console to `app.frrata.com` (the rename plan).
- Cloudflare as the sites' host (ADR-0017's switch signals).
- The identity step's agent design (Studio V3a).

## The decision record and the edits it replaces
**ADR-0019 "One address"** (proposed, `docs/decisions/0019-one-address.md`) records § 1–2b and § 6–7 once. It supersedes
ADR-0014 amendments 4 and 7, ADR-0017 rules 3, 4 and 6 and the kit spec's § 1; amends ADR-0014 rules 2 and 3 and
ADR-0018 §§ 4, 10 and its test-key amendment; and records the reserved paths, the predicate and the frame. Studio's
proposed runtime record becomes **ADR-0020** (the Studio spec's decision 27 and plan V0·5).
**Left for the Studio files once the owner approves** (a pointer is in each now):
1. Studio spec *In short* and the address row: `<store>.frrata.shop`, one address with checkout.
2. § 12.1: the Frrata address is the store's `frrata.shop` host; Opening soon is Frrata's page at the edge.
3. § 12.3: Frrata's app sets headers on partner responses at the edge; the fleet's overlay is a second layer.
4. § 12.5: Connect my domain moves site and checkout together, two records.
5. § 13: replaced by ADR-0019 (no sites domain, no `shop_domains.serves`); `frrata-preview.site` stays for previews only.
6. Decision 9: only the preview domain is bought. Decision 27: ADR-0020.
7. Plan V2a: one address; V2a·1 drops `serves` and its CHECK and trigger; V2a·2 `OURS` gains only the preview domain; V2a·5
   the fleet reports deployments and never writes routing; V2a·6's gate gains this spec's checks (absolute `assetPrefix`,
   no reserved path, no `<Link>` across the boundary, `images.unoptimized`, no service worker, no personal inputs, no own
   logo, colours and fonts from `shop.brand`); V2a·8's flow renamed; V2a·11 the pilot moves to one address after P3.
8. Plan BT: replaced by P1 and P2; proof numbers § 98–100 here; Studio's § 88–96 renumbered after 0151's § 88.
9. `docs/setup.md` § Email's "frrata.store shops" is stale against the owner's 2026-11-16 call.

## Owner decisions (each with a recommendation; ✱ new or changed after the reviews)
1. **Adopt A, Frrata at the door, with the secure frame** · Yes · P3, P5.
2. **Narrow security L1 now** (a bag link replaces a bag only links filled) · Yes · P0.
3. **A hidden `secure.` record on each connected domain of a code-site store** (theme shops need none) · Yes · P3, P5.
4. **Submit `frrata.shop` to the PSL now, renewed to 3 years** · Yes · P4b.
5. **Before the listing reaches browsers, outside partners' sites may open on `<store>.frrata.shop`** with P4a's
   controls (flooding and eviction accepted) · Yes · P5 for outside partners.
6. ✱ **One separate preview domain with a low renewal price** (a `.com`-priced name, not `.site` at $27 a year);
   `frrata.store` dropped; Frrata's app serves nothing on it · Yes · V2a previews.
7. ✱ **No store with real shoppers moves to one address before the frame;** the pilot may test one address earlier only in
   build mode · Yes · P5.
8. **The pilot's monogram uploaded as House of Ayuda's brand record now** (raster today; SVG once the cleaner ships) · Yes ·
   P1.
9. ✱ **Who saves checkout design:** owners, Managers and the partner's owner and Leads; Builders preview only (no new
   capability, ADR-0015 unchanged) · Yes · P1, P2.
10. **The owner edits the brand record after handover without the partner** (the partner told) · Yes · P1.
11. **Colours and fonts in site code only from the brand record** · Yes · P1.
12. **No partner pixels or scripts on checkout and order pages** · Yes · P2.
13. **Remove and a stepper on checkout lines** · Yes · P2.
14. ✱ **Two short lines only** (heading, thank-you); delivery words derived from the store's facts · Yes · P2.
15. ✱ **Razorpay in the frame or on the page, and COOP `same-origin` or `same-origin-allow-popups`: the spike decides** ·
    Yes · P3.
16. ✱ **Price hosting only on measured numbers:** P5·0's HAR and billing read, then the pilot's 30 days, with the router
    counted in ADR-0017 rule 11's kill line · Yes · P5, paid stores.
17. ✱ **On an open store, a brand or checkout design change by anyone but the owner or a Manager waits for the owner's
    yes** · Yes · P1, P2.
18. ✱ **ADR-0019 "One address" as one record; Studio's runtime record renumbered ADR-0020** · Yes · all.
19. ✱ **Brand records for code-site stores only; theme shops keep their look until V5** · Yes · P1.
20. ✱ **If in-app browsers don't hold COOP or the frame, no partner JavaScript in those browsers (C5)** · Yes, if the spike
    fails · P5.
21. ✱ **If the router can't allowlist response headers, the fallback runs at the edge** (never a bom1 function in front
    of every page), else a deny-list with source controls · Yes · P5.
22. ✱ **P5 waits for V2a's sites, deployments and gate** (one verified upstream a store) · Yes · P5.
23. ✱ **Read Vercel › Settings › Billing for `frata`** (Flat Rate CDN on or off, which tier) before hosting is priced, and
    turn Flat Rate on if it is off · Yes · P5·0, hosting's price.
24. ✱ **The frame is a server-rendered form plus one standalone script (≤ 25 kB)**, not a Next page (≈ 120 kB) · Yes · P3.
25. ✱ **Link prefetch off on the kit's product and collection cards** (each prefetch is a billed request through the
    router) · Yes · P5, P6.

## Facts used (checked 2026-11-16 unless dated)
| Fact | Source · date |
|---|---|
| Hydrogen: storefront on the primary domain, checkout on `checkout.example.com` | shopify.dev Hydrogen "Go live" (undated, read 2026-11-16) |
| Checkout UI extensions in a Web Worker, no DOM, 64 KB, Plus-only steps, `api_version 2026-10` | shopify.dev (read 2026-11-16) |
| Checkout branding: colours, typography, radius, header, sections, favicon; no per-page styles; no SVG; Plus only | shopify.dev (undated, read 2026-11-16) |
| Embedded checkout needs the same domain for Safari | developer.bigcommerce.com (undated, read 2026-11-16) |
| Catalyst's checkout subdomain loses identity cookies | Klaviyo community, April 2026 [secondary] |
| Swell Checkout included with every store | swell.is help (undated); checkout domain: no current source found |
| Saleor's checkout is self-deployed | github.com/saleor/react-storefront (undated); domain: no current source found |
| Stripe.js frames on Stripe origins; no cross-origin isolation | docs.stripe.com security guide (undated, read 2026-11-16) |
| Microfrontends, multi-zones, proxy project | Vercel KB, updated 2026-10-02 |
| Microfrontends' price past two projects | vercel.com (2026; sources conflict) [secondary] |
| Project-level routing rules: host conditions, external rewrites, header set, append and delete, API, instant publish | Vercel docs, updated 2026-08-11 |
| 100 routing rules a project | Vercel community forum [unverified] |
| External rewrites cached from 2026-04-06 for new projects; older opt in | Vercel changelog 2026-03-30 |
| Zones need their own asset prefix; navigation between zones reloads | nextjs.org, updated 2026-06-01 |
| COOP `same-origin` vs `unsafe-none`: new group, references severed | MDN, modified 2026-07-12 |
| `Sec-Fetch-Site` values; widely available since March 2023 | MDN, modified 2026-09-28 |
| No `navigate-to`; `worker-src` governs ServiceWorker scripts | MDN CSP, modified 2026-03-22 |
| `Service-Worker: script` header | MDN, modified 2025-07-04 (older than 12 months: unverified) |
| ITP: 7-day cap; third-party cookies blocked; third-party storage partitioned and ephemeral | webkit.org (undated, read 2026-11-16) |
| Safari partitioned cookies dropped after cross-site redirects | WebKit bug 306194, 2026-01-24 |
| PSL submission rules | PSL wiki, edited 2025-05-23 (older than 12 months: unverified); template notice 2026-05-06 |
| Vercel advises the PSL; Let's Encrypt 50 a registered domain a week | frata-integrations § Domains (Vercel 2026-09-16, LE 2026-08-05) |
| Browsers' PSL schedules | no current source found |
| Razorpay and UPI intent inside a frame | no current source found (spike) |
| Razorpay live payments only from registered websites | frata-integrations § Razorpay (2026-11-09) |
| Vercel bom1 $0.20 a GB, $2.20 a million requests; 5 requests, 0.3 MB a view (a guess) | ADR-0017 § Options (sources 2026-09-14) |
| No store slug `secure`, no domain starting `secure.` | live check by the coordinator, 2026-11-16 |
| Flat Rate CDN tiers; Fast Origin Transfer $0.25 a GB; functions and ISR not covered | vercel.com/docs/pricing/flat-rate-cdn, updated 2026-09-14 (unit-economics review) |
| `frrata.shop` renews ₹3,879 a year ex GST at Hostinger; `.site` $1.49 then $27 a year; `.com` $12.03 a year | unit-economics review, 2026-11-16 |
| A Next page in the frame ≈ 122 kB JS + the 48 kB font; `bag.js` 1.4 kB gz; a quote 9 statements, 27 ms, 865 B; checkout HTML 27 kB; checkout cold 14 statements | speed review, measured 2026-11-16 |
| The drain sends 25 rows a batch, one at a time | `src/lib/outbox/drain.ts:72` (read 2026-11-16) |
| ₹94 a dollar | x-rates.com, 2026-11-16 [secondary], as in the Studio spec § 8 |
