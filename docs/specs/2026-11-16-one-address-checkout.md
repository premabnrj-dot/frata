# One address per store: the brand's site and Frrata's checkout at one host, one bag, one brand record
Status: draft for the owner · Date: 2026-11-16 · Mockup: none yet, one per phase (plan
`docs/plans/2026-11-16-one-address-checkout.md`) · Approved: —
Pairs with: ADR-0014 (rule 3, amendments 4, 6, 7, 8, 9), ADR-0017 (rules 3, 4, 6), ADR-0018, ADR-0015, ADR-0009,
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
  orders, policies and its own APIs itself, and passes every other path to the partner's site deployment.
- **The partner's code never holds shopper data.** Phone, address, sign-in, the order's personal details and the
  placement of the order live in a Frrata frame on a hidden sub-address (`secure.<the store's host>`). The page around it
  is Frrata's own code in the brand's design. The partner's pages are cut off from it by the browser.
- **Checkout's design is data.** Logo, colours, type, radius, density, a header and footer variant, trust blocks and three
  short lines. Partners set them in Studio or the console and see them on sample data. Frrata's checkout code draws them.
  Fields, steps, prices, payment and the legal block are Frrata's.
- **One bag.** With one address there is one bag: Frrata's, in the browser, on that address. The site reads and writes it
  through a small Frrata script. The bag link keeps working for links from outside.
- **One brand record.** The logo, its variants, colours and type are saved once per store, made by Frrata's identity step
  or uploaded. The console, checkout, emails, invoices, share images, the Storefront API, the site and Studio all read it.
- **The pilot's bag bug is confirmed.** The pilot store has no Website set, so every hand-off joins the site's bag onto
  Frrata's and nothing the shopper removed on the site leaves Frrata's bag. A small safe fix ships first (P0).
- **No new store domain.** `frrata.store` is dropped. Stores stay on `frrata.shop`, which goes to the Public Suffix List so
  each store is its own site. No security property waits on that listing. One preview domain is still argued for.
- **The owner decides 16 things** (§ Owner decisions). 1–4 unblock everything.

## Goal
Ranked problem (4), mobile checkout conversion, and (5), a premium storefront built as code, without giving up checkout's
safety (ADR-0002, ADR-0003, ADR-0014 rule 3) or (7) festive reliability.
Measures, on the pilot and the first 10 code sites, before and after:
- **Bag to checkout:** of shoppers who tap Checkout, the share whose checkout shows exactly the site's bag (target 100%;
  today the pilot fails every edit after a first hand-off). Read from the e2e matrix and from the beacon's
  `begin_checkout` with a bag fingerprint.
- **Checkout completion:** orders ÷ `begin_checkout` on code sites against theme shops of a like size (hypothesis H-1,
  § Unit economics).
- **One look:** the checkout, order page and emails pass `mockup-parity-reviewer` against the site's own design system.
- **Zero shopper data readable by site code:** the proof suite (§ Security) green on every deploy.
- **One logo:** the logo the console shows, the API answers and the site draws are the same file, by hash.

## Job
A brand's shopper buys on one address in one design with one bag, while the brand's partner shapes how every page looks
and never touches a shopper's details.

## What is wrong today (read in the code, 2026-11-16)
| What | Where | Effect |
|---|---|---|
| Two bags on two origins | The site's `bag.v1` in its own localStorage (`mokobara/lib/bag.ts`); Frrata's `frata.bag.v1` on the checkout host (`src/components/storefront/bag-store.ts`) | They drift apart |
| The hand-off replaces only when the referrer is the store's Website | `src/components/storefront/cart-link.tsx:24` (`fromSite(document.referrer, site)`) | Otherwise it joins the lines onto Frrata's bag (security review L1) |
| The pilot store has no Website | `mokobara/lib/generated/shop-snapshot.json`: `"siteOrigin":null`, `"checkoutOrigin":"https://testing.frrata.shop"` | `site` is null, so every hand-off joins: the **bug the owner hit** |
| A test key works only while no Website is set | ADR-0018 amendment (test keys before a domain, 2026-11-16) | Every site built on a test key hits the same bug: the replace path can never run for it |
| Checkout clears only Frrata's bag | `checkout.tsx` `done()` → `bag.clear()` | After an order the site's bag is still full |
| Checkout lines have no Remove or quantity | `checkout.tsx` "Your order" list | A code-site shopper can fix Frrata's bag only in the old theme's bag drawer |
| Checkout and order pages wear the old theme | `src/app/s/[host]/_frame.tsx` (`shopTheme`, `data-store-theme`) | The owner's point 1 |
| The pilot drew its own logo | `mokobara/docs/design/house-of-ayuda-design-system.md` § 1.1 (the doorway monogram); the store's `logo` is null | The owner's point 3 |
| Policies, checkout and orders leave the brand's address | `mokobara/lib/links.ts` (`checkoutOrigin` + path) | The owner's point 2 |

## Research (current sources only; dated; "no current source found" where none)
| Product | How it does one domain with a hosted checkout | Taken |
|---|---|---|
| **Shopify Hydrogen on Oxygen** (shopify.dev "Go live", undated page, read 2026-11-16) | The storefront on the primary domain; "a subdomain, such as `checkout.example.com`, serves Shopify checkout" | **Skip the split** (the owner rejects it). Take: checkout stays the platform's code whatever runs in front |
| **Shopify online store** (changelog "checkouts will occur at the shop domain", older than 12 months: no current source found for today's path) | Theme code and checkout share the shop's own domain | Take: one domain is normal for a hosted checkout. Skip: Shopify trusts theme code as the merchant's own; Frrata's rule is stricter (a partner never reads shoppers, ADR-0015) |
| **Shopify checkout UI extensions** (shopify.dev, page on `api_version 2026-10`, read 2026-11-16) | Partner code runs "in an isolated sandbox", "inside of a Web Worker which doesn't have access to `window` or the DOM"; 64 KB bundles; no payment data; network only with a granted capability; the information, shipping and payment steps only on Plus | **Take:** partner code never in checkout's document. **Skip for now:** extension slots inside checkout (YAGNI until a partner asks) |
| **Shopify checkout branding API** (shopify.dev "Styling", undated, read 2026-11-16) | Colours and schemes, typography (sizes, fonts, weights), corner radius, header alignment and position, sections, favicon; "You can't currently customize styling for individual pages"; SVG not supported; Plus only | **Take:** design as data with a closed set of tokens; one style for every checkout page. **Skip:** Plus-only gating (every Frrata plan) |
| **BigCommerce Embedded Checkout** (developer.bigcommerce.com, undated, read 2026-11-16) | Checkout in an iframe on the headless site; for Safari "your checkout page must be served from the same domain as your BigCommerce storefront": `www.mystore.com` with `checkout.mystore.com` | **Take:** a frame for checkout works in Safari only when same-site with the page: the secure frame sits on `secure.<the store's host>`. **Skip:** the whole checkout in a frame on the partner's page (the partner's page would surround it) |
| **BigCommerce Catalyst** (Klaviyo community thread, April 2026, [secondary]) | Checkout on a subdomain loses the site's anonymous identity cookies | Take: a split loses state; one address keeps it |
| **Swell** (swell.is help, undated) | "Swell Checkout is included with every Swell store"; styling in the theme editor | Taken: checkout look as theme data. Custom domain for checkout: no current source found |
| **Saleor** (saleor/react-storefront, undated) | The checkout is a Next.js app the merchant deploys | Skip: a checkout the brand runs is the risk Frrata removes. Custom domain: no current source found |
| **Stripe Elements** (docs.stripe.com security guide, undated, read 2026-11-16) | Card fields run in frames on Stripe's own origins (`*.js.stripe.com`); the page's CSP lists them | **Take:** sensitive inputs in frames on the platform's origin, the page stays the merchant's. Stripe "don't support cross-origin isolated sites": Frrata won't ask for COEP either |
| **Vercel, one domain over several projects** (KB guide, updated 2026-10-02) | Microfrontends (`microfrontends.json`), Next.js multi-zones, or a proxy project with `vercel.json` rewrites | Taken: rewrites to another deployment. Microfrontends skipped (below) |
| **Vercel Microfrontends** (vercel.com/microfrontends and docs, read 2026-11-16) | Path → project inside one group in a team; sources conflict on price (one says $250 a project a month past two) [secondary, conflicting] | Skip: a group per store at fleet scale |
| **Vercel project-level routing rules** (docs, updated 2026-08-11) | Rules at the CDN "before your deployment's own routes": match on host, header, cookie, query; rewrite to an external URL; set, append or delete response and request headers; publish instantly through the REST API; no middleware | **Take** as the first router candidate (spike: rule count and host captures unverified; a forum post says 100 rules a project [unverified]) |
| **Vercel external rewrite caching** (changelog 2026-03-30, in force 2026-04-06) | New projects cache external rewrites by upstream `Cache-Control`/`CDN-Cache-Control`; older projects opt in (`x-vercel-enable-rewrite-caching`); purge by `Vercel-Cache-Tag` | Taken: the `frata` project predates it, so it opts in per rule |
| **Next.js multi-zones** (nextjs.org, updated 2026-06-01) | Zones share a domain by rewrites; each zone's assets need their own prefix; moving between zones is a full page load | **Take:** the site builds with an asset prefix (`/_s`) so its `/_next/*` never meets Frrata's |
| **COOP** (MDN, modified 2026-07-12) | "A document with `same-origin` will always open a document with `unsafe-none` in a new BCG"; "any references between the new document and its opener are severed" | **Take:** Frrata's pages send `same-origin`; partner pages never may |
| **Fetch metadata** (MDN `Sec-Fetch-Site`, modified 2026-09-28) | `same-origin`, `same-site`, `cross-site`, `none`; widely available since March 2023 | **Take:** every personal or state-changing route refuses anything but `same-origin` |
| **CSP** (MDN, modified 2026-03-22) | No directive limits top-level navigation (no `navigate-to`); `worker-src` governs ServiceWorker scripts; `form-action`, `frame-ancestors`, `frame-src` | **Take:** `worker-src 'none'` on partner pages; top navigation covered by having no data to send (§ Security) |
| **Service-Worker request header** (MDN, modified 2025-07-04: older than 12 months, unverified) | Sent on a service worker's script fetch | Taken as a second lock only; CSP `worker-src` is the first |
| **WebKit tracking prevention** (webkit.org, undated, read 2026-11-16) | Script-written storage deleted "after 7 days of no user interaction"; "ITP by default blocks all third-party cookies"; third-party storage partitioned and ephemeral | **Take:** the secure frame is same-site with the page, so its cookie is first-party; the bag lives 7 idle days, as today |
| **Safari partitioned cookies** (WebKit bug 306194, 2026-01-24; Google's CHIPS page lists Safari 26.2 [secondary]) | Partitioned cookies dropped after cross-site redirect chains | Skip: no design leans on third-party or partitioned cookies |
| **Public Suffix List** (guidelines wiki, edited 2025-05-23: older than 12 months, unverified; PR template notice 2026-05-06; frata-integrations § Domains, Vercel 2026-09-16, Let's Encrypt 2026-08-05) | A PR from the domain owner, a `_psl` TXT with the PR's URL kept for good, ≥ 2 years of registration left, no review-time promise, "small … projects … serving only a few thousand users or fewer" declined, not for rate limits; Vercel advises it for tenant domains; Let's Encrypt counts 50 certificates a registered domain a week by the PSL | **Take:** submit `frrata.shop` now; design nothing that needs it |
| **How browsers pick up the PSL** | Chrome: compiled into each release (no current source found); Firefox: Remote Settings record in its code (no current dated source found); Safari: with OS updates (2022 mailing list: no current source found) | Taken: months, and old in-app browsers longer. Unverified |
| **Razorpay Checkout inside a frame, UPI intent from a frame** | No current source found | A spike before P3 (`integration-researcher`) |
| **Indian tools** (GoKwik, Shiprocket Fastrr) | Their one-click checkouts open as a layer over the brand's page on their own origin (product pages, live 2026-11-16; no dated source on how they isolate) | Taken: a layer on the platform's origin is what shoppers in India already meet. No current source on their isolation |

**In the codebase:** the bag (`bag-store.ts`), its frozen link (`src/domains/storefront-api/cart-link.ts`), the cart island
(`cart-link.tsx`), host routing (`src/domains/tenancy/host.ts`, `src/middleware.ts`), headers
(`src/lib/security-headers.ts`), `requireShop` (`src/lib/auth/require-shop.ts`, exact-host Origin on POST), EkCode's shop
cookies (`src/lib/ekcode/handshake.ts`: `__Host-shop_s` HttpOnly 30 days, a readable hint cookie), the prefill read
(`/api/shop/ekcode/me` → name, phone, saved address), checkout's tab storage (`frata.checkout.v1`, `frata.pending.v1`),
the one logo (`shop_settings.logo_url`), the paper logo (`doc_logo`), the accent (an enum of five), the display font (an
enum), the contrast rule (`src/domains/themes/contrast.ts`), the API's `shop.logo`, `siteOrigin`, `checkoutOrigin`,
`cart` (`src/domains/storefront-api/2026-12/map.ts:179–199`).

## Design

### 1. One address per store: the options compared
Every option keeps the owner's two facts: one address per store, and Frrata's app runs checkout, payments and orders
in bom1.

| | **A. Frrata at the door** (recommended) | B. The site inside Frrata's app | C1. The site's project holds the address | C2. Checkout sub-address (`checkout.brand.com`) | C3. Whole checkout framed on the site's page | C4. Vercel Microfrontends |
|---|---|---|---|---|---|---|
| What it is | Frrata's `frata` project holds the store's host (it already holds `*.frrata.shop` and connected domains). Reserved paths are Frrata's; every other path is rewritten to the site's deployment | The kit and the partner's code built and served by Frrata's runtime | The site's project holds the domain; reserved paths forwarded to Frrata | Hydrogen's and Catalyst's way | BigCommerce Embedded Checkout | One microfrontends group per store |
| Partner code next to checkout | Same origin in the browser; never in checkout's document, never on its server | Same origin, and partner **server** code in checkout's runtime | Same origin; and checkout behind the partner's infrastructure | Different origin, same site | The partner's page surrounds checkout | Same origin |
| Shopper data | Only in the secure frame (§ 2); none on the brand origin | Same as A, plus a shared runtime | Tenant from a forwarded header (refused by ADR-0002) | Safe | Safe inside the frame; a fake total can sit beside it | Same as A |
| Latency | Site pages: one more hop inside Vercel bom1 (unverified; budget ≤ 30 ms p75 TTFB, spike). Checkout: one navigation fewer for kit sites (no `/cart` stop) | None | One hop on checkout pages | A second navigation and a cold origin | A frame load | Vercel's own routing |
| Cost | A Frrata edge request per site page; bandwidth possibly billed twice (unverified, measured on the pilot) | Builds and functions in Frrata's main team | Same as A, reversed | As today | As today plus frames | $250 a project a month past two [secondary] |
| Vercel feasibility | Project-level routing rules (2026-08-11) with host conditions, external rewrites and header actions; else Routing Middleware with an Edge Config map. Caching of proxied pages by opt-in (2026-03-30) | Native | Possible, with project rules owned by the fleet | Native | Native | Groups inside one team; one default app per group |
| Domain proof, TLS | As today (`shop_domains` TXT, Vercel certificate); one more record and certificate for `secure.` | As today | Moves domains to the sites team | One more record | As today | As today |
| Cookies | Frrata sets none on the brand origin; the secure host keeps `__Host-` cookies, same-site, first-party | Same | Same | Split: identity lost (Catalyst thread) | Third-party in Safari unless same-site | Same as A |
| What breaks | Both apps use `/_next/*`: the site builds with `assetPrefix: '/_s'`; site to checkout is a full page load; a site's own `/api`, route handlers and service workers are refused (already the kit's hard floor) | ADR-0014 rule 2 ("generated code never runs in Frrata's console or checkout runtime"); a bad partner build can break checkout's deploy | Checkout's uptime and headers depend on the partner's project; `requireShop`'s Origin = Host check | The owner's rule | Safari, clickjacking, the legal block beside a partner's page | Fleet scale |
| Verdict | **Take** | Reject | Reject | Reject (owner) | Reject; take its frame, narrowly, in § 2 | Reject |

Also weighed:
- **C5, no partner JavaScript** (server-rendered partner code, Frrata's islands only). It would remove the same-origin
  threat almost wholly, but a designer loses menus, galleries and motion. Kept as the fallback if § 2's spike fails, and
  as a per-store choice later.
- **Cloudflare in front** (ADR-0017's first draft). With one address, whatever holds the host carries checkout. Checkout
  through a third-party router breaks the kit spec § 7 residency rule. If sites ever move to Cloudflare, they sit behind
  Frrata's door as an upstream; the door stays Vercel bom1.

**Why A.** It is the only option where the address is the brand's, Frrata's app answers checkout first-hand, the
partner's server code never runs beside checkout, and the tenant still comes from the Host. Its one hard problem,
partner code in the same origin as checkout, is solved in the browser by § 2 and § 3, not by trust.

**The reserved paths** (Frrata's, never the partner's, exact list in `src/domains/tenancy/reserved.ts`, one pure list read
by the router config, the gate and the tests): `/cart`, `/checkout`, `/orders`, `/orders/*`, `/account`, `/account/*`,
`/policies/*`, `/api/shop/*`, `/_next/*` (Frrata's assets), `/_frrata/*` (Frrata's scripts: the bag), `/fe.js`, `/og/*`,
`/icon/*`, `/email/*`. Everything else, including `/`, `/products/*`, `/collections/*`, `/robots.txt` and
`/sitemap.xml`, is the site's. A path the site's build declares that is reserved fails the gate.

**What changes for each address:**
- **A store with its own domain** (`brand.com` or `www.brand.com`): the brand adds two records at Connect my domain: the
  host, as today, and `secure.<host>` (a CNAME to Vercel). Domain Connect does both at one tap where the registrar
  supports it. The shopper never sees `secure.`.
- **A store with no domain:** `<store>.frrata.shop`, and `secure.<store>.frrata.shop` for its frame.
- **`frrata.com`** is never a store or site host (owner, 2026-11-16). The console moves to `app.frrata.com`.
- **The Storefront API:** `shop.siteOrigin` and `shop.checkoutOrigin` become the same origin once a store serves at one
  address. No field changes meaning (ADR-0018 § 10, `released-api.test.ts`).

### 2. Partner code next to checkout: the security model, threat by threat
**The principle.** The brand origin holds no secret and no shopper data. Frrata's pages there show only what a shopper's
public pages already show (products, prices, the bag, totals, policies) plus the secure frame. Everything personal is
typed, kept, read and sent inside the frame, on `secure.<host>`, a different origin in the same site. The browser's
same-origin policy is the wall; no check depends on telling Frrata's document from the partner's, because on one origin
nothing can.

**What lives where:**
| On the brand origin (Frrata's page, brand's design) | In the secure frame (`secure.<host>`) |
|---|---|
| The bag lines, prices, offers, delivery and Pay on delivery rules, totals, the pay bar, the legal block, the design | Mobile number, email, name, address, PIN code (its value is passed up for pricing), the GST invoice fields |
| The order page's number, items, state and amounts | EkCode sign-in and its saved address; "Not you?"; "Save this address" |
| The bag (`frata.bag.v1`) and the offer code | The typed form surviving a reload (today `frata.checkout.v1`), the pending order (today `frata.pending.v1`), the order token |
| `/api/shop/quote`, `/pincode`, `/delivery`, `/e` (no personal data) | `/api/secure/*`: place, view, pay, retry, switch to Pay on delivery, change, invoice, EkCode, email opt-in |
| The **Place order** button's label and total (drawn by the page) | The button the shopper presses (inside the frame, so a tap there is the only thing that places an order) |

The frame is drawn by Frrata's code with the same brand tokens and fonts as the page, so it reads as one page. It is
same-site with the page, so its `__Host-` cookie is first-party in Safari (BigCommerce's Safari note; WebKit's rules).

**Threats and controls:**
| # | Threat | Control | Proof |
|---|---|---|---|
| T1 | Partner JS reads checkout's DOM by `window.open('/checkout')` or a named window | Frrata's pages send `Cross-Origin-Opener-Policy: same-origin`; the router overwrites any COOP on partner responses to `unsafe-none`: the handle is severed (MDN COOP) | e2e: a partner page opens `/checkout` and reads `w.document` → null or throws |
| T2 | Partner JS frames `/checkout` or `/orders` (same origin) and reads `contentDocument` | `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every Frrata page: a same-origin frame is refused too | e2e: the frame never loads |
| T3 | Partner JS `fetch('/checkout')` or `/orders` with cookies | The HTML is a static shell with no shopper data; the brand origin holds no Frrata cookie | proof: the shell's bytes carry no personal field; a cookie audit gate (P4a) |
| T4 | Partner JS calls Frrata's personal APIs with the shopper's cookie (today `/api/shop/ekcode/me` answers name, phone, address) | Those routes leave the brand origin for `/api/secure/*` on the secure host; cross-origin fetches there get no CORS and are refused unless `Sec-Fetch-Site: same-origin` and the exact Origin; the brand-origin routes left are public data | unit: every `/api/secure/*` refuses `same-site`; e2e: a partner page's fetch to the secure host fails and reads nothing |
| T5 | Partner JS reads storage left by checkout in the same tab (typed form, pending order, order token) | Nothing personal is ever written to brand-origin storage; the frame keeps its own (its origin) | gate: brand-origin checkout code writes only `frata.bag.v1`, the code and attribution keys (`check:storage`, new) |
| T6 | A service worker registered by partner code at scope `/` intercepts `/checkout` | Every partner response carries `worker-src 'none'` (CSP governs ServiceWorker scripts, MDN 2026-03-22); the router refuses a request with `Service-Worker: script` on every path; the kit's hard floor already forbids one. `Clear-Site-Data` is not used: it would also clear the shopper's bag and end their other tabs | e2e: `navigator.serviceWorker.register('/sw.js')` rejects on a partner page; the edge answers 403 to the script fetch |
| T7 | Partner JS overwrites or plants cookies on the brand origin (session fixation) | Frrata keeps no cookie on the brand origin; the secure host's cookies are `__Host-` (no `Domain`, so a cookie the partner sets on `brand.com` with `Domain` can never stand in for one) and Frrata reads only `__Host-` names | unit: the secure host ignores a same-named cookie without the prefix |
| T8 | CSRF: partner JS (or a sibling store) posts to Frrata's routes | `requireShop`'s exact-host Origin stays; every state-changing or personal route also needs `Sec-Fetch-Site: same-origin` (MDN, widely available since March 2023); the frame's actions need a tap inside the frame | unit and e2e per route |
| T9 | Exfiltration from partner pages | Partner pages get, from the router: `connect-src 'self'` and the hosts the live version declared (amendment 9 asks the owner for any new one); `img-src 'self'` and Frrata media; `form-action 'self'` (and only Frrata's paths answer a POST); `frame-src` the secure host and the policy's hosts; `worker-src 'none'`; `object-src 'none'`; `base-uri 'none'`. **Top navigation cannot be limited by CSP** (no `navigate-to`): what covers it is that the partner's pages never hold shopper data to send (T3–T5) | header matrix test on every partner path (`scripts/verify/one-address.mjs`, new) |
| T10 | Phishing: a partner builds a fake checkout form on its own path | The gate refuses inputs for personal data in site code (`autocomplete` of tel, email, name, address, postal-code, cc-*; `type=tel`, `email`, `password`) on the build output and in a headless crawl of every page; synthetic phone crawls at random times (kit spec § 5); CSP reports; the kill switch | gate unit tests; the crawl in the fleet's smoke test |
| T11 | Clickjacking of Frrata's pages | `frame-ancestors 'none'` on Frrata's pages; partner pages also get `frame-ancestors 'none'` | header matrix |
| T12 | Clickjacking of the secure frame (a partner page frames it and hides it under a fake button) | The frame allows only the store's own hosts as ancestors (it must, to sit in checkout), so a partner page on that host can frame it. It shows only the shopper's own details; its one consequential act is Place order, a tap inside it; an order placed is at most a Pay on delivery order the shopper confirms (COD confirmation); Chrome's visibility check (IntersectionObserver v2) where it exists | **residual, low** (§ Residual risk) |
| T13 | Partner JS sends the frame commands by `postMessage` | The frame accepts only: the bag (ids and quantities), the method, the offer code. It never sends a personal field out. It answers with the order number and total only. Same origin can't be told apart, so the commands are limited to what a shopper could do with the page | unit: the frame's message schema is closed (`z.strictObject`); a probe sends every other shape |
| T14 | Open redirects | Frrata's return parameters (EkCode, payment) accept only same-host paths (`shopHref`); the router never redirects by query | unit per parameter |
| T15 | Cache poisoning across stores | Frrata's cached pages are keyed by the rewritten `/s/<host>/…` path (as today); partner pages are cached by host and path at the site's CDN and, when opted in, at Frrata's; a reserved path is never sent to the partner, so a partner response can't be stored under it; partner responses with `Set-Cookie` are impossible (no route handlers, middleware or actions: hard floor) and stripped by the router's header action anyway | `scripts/verify/api-isr.mjs` pattern for two hosts; a test that host B never receives host A's copy |
| T16 | One store attacks another | Each store on its own registrable domain, or `<store>.frrata.shop`. Until `frrata.shop` is on the PSL, sibling stores are same-site: cookie tossing is defeated by `__Host-` only (T7); SameSite bypass is closed by `Sec-Fetch-Site: same-origin` (T8); storage is per origin. **Left until the listing reaches browsers:** a partner of store Y can set large `Domain=frrata.shop` cookies that make requests to store X fail for shoppers who visited Y (a denial of service, attributable) | e2e on two frrata.shop stores; residual named |
| T17 | Spectre-style reads across documents | Partner pages never get COEP (the router removes it), so no `SharedArrayBuffer` for partner code; COOP separates Frrata's pages into their own browsing context group | header matrix |
| T18 | The partner's deployment answers a reserved path, or an old deployment keeps answering after removal | The router decides by path before any upstream; removing a partner flips the host's routing to Frrata's maintenance page through the outbox in the same transaction (ADR-0006) | e2e: remove a partner mid-session |
| T19 | Pixels and outside scripts on checkout or order pages | Never: those pages are Frrata's; conversions go through Frrata's own Conversions API and beacon | gate on Frrata's checkout routes (no third-party script) |

**Residual risk, plainly, and who carries it.**
- **Phishing on the brand's own domain (T10).** A partner set on fraud can draw a fake form on a page of the site and send
  what a shopper types away by navigating the page. CSP cannot stop a top-level navigation. The gate, the crawls and the
  kill switch make it hard and short-lived, not impossible. The partner is the brand's own hired and verified partner
  (PAN or GSTIN, passkeys, ADR-0014 amendment 6); the brand chooses and removes it; the partner carries it under the
  partner terms. Frrata carries the duty to detect and take down.
- **The frame shown on a partner page (T12).** Low: the shopper sees only their own details; the worst act is an
  unwanted Pay on delivery order they then confirm or ignore.
- **Cross-store cookie flooding before the PSL listing reaches browsers (T16).** Medium likelihood only once outside
  partners build `frrata.shop` stores; effect is a store failing to load for some shoppers until cookies are cleared;
  attributable to one partner; ends store by store as browsers ship the listing.
- **What a partner could always do:** change the site's own words, photos and layout on pages that are its job. Prices,
  stock, offers, the legal block and policies are not its (ADR-0014 amendment 9 rule 5, PP1).

### 3. Partners design checkout and order pages; they never touch the data
Checkout's design is **data**, drawn by Frrata's own checkout code. Nothing a partner sets is code.

| A partner may set | A partner may never set |
|---|---|
| The brand record's tokens (§ 5): logo (from the record, never picked here), palette roles, display and body fonts (Frrata's list or font files on Frrata media), radius (a scale of 0, 4, 8, 12, 16 px), density (comfortable or compact) | Which fields are asked, their labels and order, what is required |
| Header variant: logo left or centred; a "Back to <store>" link on or off | The steps and their order; the payment step; Razorpay's own screens |
| Footer variant: the legal block always, plus policy links in one row or two | The legal block's presence and words (`shop.legal`, PP1) |
| Trust and delivery blocks, from the store's own facts, chosen and ordered from a closed set: delivery days, returns, Pay on delivery, secure payment, GST invoice | Prices, totals, offers, the Pay on delivery fee, the pay button's words |
| Three lines, plain text, checked by length: a checkout heading (≤ 24 characters), a delivery note (≤ 80), a thank-you line on the order page (≤ 120) | Consent and privacy words, error words, anything that changes what is collected |
| Language of Frrata's words: English or Hindi (as `shop_language`) | Scripts, pixels, links to outside hosts |

**How a design is checked** (`src/domains/brand/check.ts`, pure, one function for the save, the preview and the render):
- every text and background pair the checkout draws passes 4.5:1, large display text 3:1, control edges 3:1 (the contrast
  rule reused from `src/domains/themes/contrast.ts`); the pair that fails is named in the error;
- inputs at 16 px or more (no zoom on iPhone), body at 14 px or more, line height at least 1.4;
- fonts only from Frrata's list or Frrata media; a font that fails to load falls back to the system stack;
- the three lines: plain text, within their lengths, no links, no markup;
- the legal block and the policy links are drawn by checkout's own layout, so no design can remove them;
- at render time the same check runs on the saved data: a failing record (saved before a rule tightened) renders with
  Frrata's defaults and is listed for the owner, never shown to a shopper.

**Preview:** Studio's pane and Console › Brand show the checkout, the order page, the bag-link page and the emails on
sample data (a sample bag of the store's own products, a sample address, every state: Pay on delivery not offered, a
sold-out line, a changed price, a failed payment, an empty bag), at phone and desktop. The preview runs on the console
host as today's look preview does; no real order, no real shopper.

**Who saves:** owners and Managers; the store's partner members (`CAN_BUILD`), before and after handover, as content is
(amendment 8, owner 2026-11-15); a Builder through a new capability `brand.edit` (sample data only; the capability change
carries the owner's name and date, `capabilities.test.ts`). Every save is an Activity row; a partner's save after handover
is one Notices line an hour (amendment 8). The previous record is kept for one-tap Undo.

### 4. One bag
**Where it lives.** One bag per store, in the shopper's browser, on the store's one address: today's `frata.bag.v1`
(`bag-store.ts`), with its limits (20 lines, 10 a line) and its rules (checkout prices it again; sold-out lines leave on
reconcile). Nothing is reserved while it sits there, as today.

**How the site uses it.** Frrata serves a small script at a reserved path, `/_frrata/v1/bag.js` (≤ 3 kB gzipped,
immutable per version, built from the same `bag-store.ts` core, never a copy): `get`, `add`, `set`, `remove`, `subscribe`,
and `quote()`, which calls the same-origin `/api/shop/quote` for subtotal, delivery, offers, Pay on delivery and sold-out
lines (closing the pilot's gaps G1 and G25 without a key in the browser). The site never computes a total; it shows the
quote's (the pilot's rule 2 holds). The kit's `@frrata/ui` bag button and drawer use it. On load it also captures how the
shopper arrived (`captureAttribution`: `utm_*`, `?code=`), so attribution needs no hand-off.

**Checkout** reads the same bag. Kit sites link straight to `/checkout`. The bag link stays.

**The bag link, a frozen contract** (`cart-link.ts`, ADR-0018 § 11), keeps working forever:
- On one address, a link from the site's own pages arrives with a same-origin referrer and replaces the bag (the site's
  own wish); a link from anywhere else joins it (security L1).
- Links in Instagram DMs, WhatsApp messages, emails and old sites keep opening checkout with their lines.
- Sites not yet moved (own domain, split) keep today's behaviour plus P0's rule.

**Migration of a split site** (the pilot first): (1) P0 ships; (2) the site moves to one address (P5); (3) the site drops
its own bag for `/_frrata/v1/bag.js` (P6): on first load after the move, a site bag left in the old origin's storage is
gone with that origin, so nothing is migrated in the browser; the shopper's Frrata bag is already the truth after P0.

**P0, the pilot's fix now** (small, safe, before any of the above):
- The bag remembers who last filled it: a bag link, or the shopper on the store's own Frrata pages (theme product pages,
  the bag drawer). Checkout's own fixes (reconcile, the gift button) don't change it.
- A bag link **replaces** a bag that only links filled, and **joins** a bag the shopper built on Frrata's own pages. The
  referrer check stays as a second way to replace.
- So for the pilot, every hand-off makes Frrata's bag the site's bag: removals, quantity changes, Back and a second
  hand-off all carry over, whatever the referrer (stripped, or Instagram's and WhatsApp's in-app browsers).
- **What it costs.** About 20 lines in `bag-store.ts` and `cart-link.tsx`, one unit test, two steps in e2e
  `92-storefront-sale`; no migration, no API change. Security L1 narrows: a crafted link can now replace a bag that only
  links made (a shopper could lose items another link put there; no money, no data). Needs `security-reviewer` and the
  owner's yes (decision 2).
- **What it doesn't fix:** the site's own bag stays full after an order (the split site cannot know an order happened).
  P6 closes it.

### 5. One brand record from Frrata's system
**What it is.** Per store, saved once:
- **Logo files:** the primary lockup (today's `shop_settings.logo_url`, kept as the one primary logo), plus a mark (square,
  for icons and small headers), a stacked lockup and a reversed version (each optional). SVG on Frrata media under the
  store's own folder, outline-only (no text elements, rasters or filters, Studio's logo checks), or PNG/WebP within limits.
- **Derived, never stored twice:** the favicon and app icons (`src/lib/seo/icon.ts` already reads `logoUrl`), share-card
  marks, and the paper logo: `doc_logo` stays the documents' PNG, now **rendered from the primary** when the owner hasn't
  uploaded a separate one (a rendition keyed by the source's hash, like photo renditions).
- **Palette roles, type, radius, density:** BT's `brand_tokens` (Studio plan BT·2), one row per store, typed columns, the
  contrast rule reused. `shop_settings.accent` (an enum of five) and `display_font` (an enum) stay for theme shops;
  `accentOf(store)` is the one rule (Studio plan BT·1): the record's accent when present, else the enum's colour. No
  second accent.
- **Seasons:** BT's `brand_seasons`, unchanged.

**Where it comes from.** Frrata's identity step (Studio's `logo_propose` and `tokens_propose`, Studio spec § 4) or an
upload in Console › Brand. A partner working in its own Claude Code (as the pilot was built) proposes nothing in code:
the partner skill says "the logo and the palette are the store's brand record; read `shop.brand`; change them only in
Console › Brand". Planning the identity step's agent call belongs to Studio V3a (and loads `claude-api` there); this spec
only fixes where its output is saved.

**Who reads it, the one record:**
| Reader | Reads | Today |
|---|---|---|
| Console (header, previews, Settings) | the record | `logo_url` |
| Checkout, bag-link page, order pages, policies | the record and § 3's design | the theme's tokens |
| Emails (`src/domains/email/layouts.ts`, `src/lib/email/compose.ts`) | the record | `logo_url` |
| Invoices and slips | `doc_logo`, rendered from the primary when not uploaded | `doc_logo` uploaded |
| Share images (`og`), icons | the record | `logo_url` |
| The Storefront API | `shop.brand` (additive, BT·3): logo files, palette, type, radius, density; `shop.logo` stays the primary's URL | `shop.logo` |
| The partner's site | `shop.brand` through the kit's `<Logo>` and `<BrandStyle>` (CSS variables) | the site's own files |
| Studio's agent | `shop.brand` and the proposals table | — |

**Held by a check, not by hope.** The kit's `npm run check` and the publish gate fail a site that ships its own logo
(`logo*`, `brand*`, `monogram*` image files, or an inline SVG in the header instead of the kit's `<Logo>`) or a hex colour
or font family that isn't from `shop.brand`'s variables (layout and neutrals that the record names are fine). The
pilot's doorway monogram is either uploaded as House of Ayuda's record (decision 8) or replaced by Frrata's identity step.

**A brand with no logo:** every reader shows the store's name in the record's display font (checkout header, emails,
console); invoices print the legal name with no mark; icons use the first letter on the accent; nothing is invented.

### 6. Cross-store isolation and `frrata.shop` on the Public Suffix List
**Why it matters now.** Once partner code serves at `<store>.frrata.shop`, every store is same-site with every other
until `frrata.shop` is a public suffix. Same-site means `Domain=frrata.shop` cookies reach every store, `SameSite` cookies
travel on requests one store's page makes to another, and browsers treat all stores as one site for some privacy
features.

**What doesn't wait for the listing** (P4a, ships before any outside partner's code serves on `frrata.shop`):
- **No `Domain` cookie anywhere under `frrata.shop`**, by a gate (`check:cookies`, new): every cookie Frrata sets is
  host-only and `__Host-` (EkCode's shop cookies already are; the readable EkCode hint cookie moves into the frame with
  P3).
- **Frrata reads only `__Host-` cookie names** on store and secure hosts: a tossed cookie without the prefix is ignored.
- **`Sec-Fetch-Site: same-origin`** on every personal or state-changing route (T8): a sibling store's page is `same-site`
  and is refused.
- **Frrata's own hosts under `frrata.shop`** (`api.`, `notify.` for SES, `secure.*`): set no cookies (the API already
  sets none).
- **The router strips `Set-Cookie` with a `Domain`** from partner responses (belt; partner code can't set one server-side
  anyway).

**The listing (P4b).** The owner (the domain's registrant) opens a PR to `publicsuffix/list` adding `frrata.shop` to the
PRIVATE section under Frrata's company header, with the automated template (notice 2026-05-06), a `_psl.frrata.shop`
TXT record holding the PR's URL (kept for good), and ≥ 2 years left on the registration (renew to 3 years first). The
reason given: brands' and partners' code on per-store subdomains needs cookie and site isolation between stores; not
for rate limits. Review is by volunteers with no promised time; "small … projects … serving only a few thousand users or
fewer" are declined (wiki 2025-05-23, older than 12 months: unverified), so the PR may wait until Frrata has more stores.
**The plan works if it is declined**: every control above holds; only T16's cookie flooding stays.

**What the listing changes** (each checked in P4b before the PR):
| What | Effect | Action |
|---|---|---|
| Existing stores | None functionally: no cookie uses `Domain`; each store becomes its own site | The `check:cookies` gate green |
| EkCode sign-in | Its cookies are host-only per store and on `ekcode.in`; unchanged | None |
| Razorpay | Websites are registered per host today; unchanged | None |
| The apex `frrata.shop` | Becomes a public suffix; it only redirects (`platform_apex`) and its stopgap paths set no cookie | None |
| `notify.frrata.shop` (SES) | DMARC's organisational domain becomes `notify.frrata.shop` itself, so a DMARC record only at `_dmarc.frrata.shop` would stop applying | Confirm `_dmarc.notify.frrata.shop` exists, or move notices to `notify.frrata.com` first (setup.md already plans it) |
| Let's Encrypt | 50 certificates a registered domain a week now counts per store, not for all of `frrata.shop` (frata-integrations, 2026-08-05) | Before the listing, `secure.<store>.frrata.shop` certificates count against one 50 a week: enough for the pilot phase; watch it |
| Analytics referrers | A move between two stores reads as cross-site | None (stored as host already) |
| Search engines | Each store is its own site; no shared reputation [unverified] | None |

**How browsers pick it up:** no current source found for any browser's schedule. The plan assumes months for current
Chrome, Firefox and Safari, and longer for old Android WebViews (Instagram's and WhatsApp's browsers use the system
WebView) and iPhones not updated. That is why nothing in the design depends on it.

### 7. Previews: keep one separate preview domain
Previews run **unreviewed draft code** (the agent's or the partner's, before the gate passes a publish). Three places:
1. **On the store's own host** under a signed path: draft code shares the live store's origin, so it could clear or plant
   the live bag and storage for whoever opens the preview, and a broken draft could stand in for the live site in that
   browser. Reject.
2. **On `preview.frrata.shop` subdomains:** same-site with every store until the PSL listing (and `preview.frrata.shop`
   would need its own entry). Reject while unlisted.
3. **On a separate registrable preview domain** (the Studio plan's `frrata-preview.site`, or another name), listed on the
   PSL from day one, never indexed, framed by the console with a signed URL token (no cookie, so Safari's third-party
   rules don't break the pane). **Recommended.** It is the one new domain this plan keeps, and its reason is that previews
   must be isolated from every live store regardless of the PSL's timing. Checkout on a preview shows the designed
   checkout on sample data and never takes an order.
The checkout design preview (§ 3) is Frrata's own code and runs on the console host; it needs no preview domain.

### 8. Stress tests: scenarios, expected result, how it is guaranteed
"Today" is the split with Website set; "Pilot today" is the split with no Website; "After" is one address with one bag.
| # | Scenario | Pilot today | After P0 (split) | After (one address, one bag) | Guaranteed by | Test |
|---|---|---|---|---|---|---|
| S1 | Remove a line on the site after a hand-off, hand off again | Line stays at checkout (**the bug**) | Removed | Removed: one bag | P0 rule; one bag | e2e `92-storefront-sale` + new `one-bag` |
| S2 | Change a quantity after a hand-off, hand off again | Quantities summed | The site's quantity | The site's quantity | same | same |
| S3 | Back button from checkout to the site, edit, Checkout | Drift | Correct | Correct; the site page restored from bfcache re-reads the bag on `pageshow` | `bag.js` listens to `pageshow` and `storage` | `one-bag` |
| S4 | Two tabs: site in one, checkout in the other | Two bags | Last hand-off wins | One bag; the `storage` event updates both tabs | `bag-store.ts` `subscribe` | `one-bag` (two pages) |
| S5 | Shopper opens `/checkout` directly | Frrata's old bag, or empty | Same | The bag they built on the site | one bag | `one-bag` |
| S6 | Order placed, then back on the site | Site bag still full | Still full (stated) | Empty: checkout cleared the one bag | `done()` → `bag.clear()` on the same origin | `one-bag` |
| S7 | A sold-out line | Checkout drops it; the site keeps showing it | Same | The site's drawer shows "Sold out" from the quote; checkout drops it; reconcile removes it once for both | `quote()` from `/api/shop/quote`; `reconcile` | `one-bag` with a stock-0 fixture |
| S8 | An offer code from a creator link (`?code=`) on the site | Passed in the link only if the site forwards it | Same | Captured on landing by `bag.js`; checkout reads it (tab-scoped, as today: a new tab loses it) | `captureAttribution` | `one-bag`; the tab case written down |
| S9 | Safari: 7 idle days | Both bags deleted at different times | Same | The one bag deleted (WebKit's 7-day rule) | — (accepted, as today) | written down |
| S10 | Safari storage partitioning for the frame | n/a | n/a | The frame is same-site with the page: first-party cookie and storage | `secure.<host>` | e2e on WebKit (Playwright) |
| S11 | Referrer stripped (`no-referrer`) or an in-app browser (Instagram, WhatsApp) | Joins | Replaces a link-made bag | No hand-off at all | P0 doesn't read the referrer for link-made bags | e2e with `referrerPolicy: 'no-referrer'` |
| S12 | Instagram's browser reloads checkout after the UPI app switch | Form restored from tab storage | Same | Restored inside the frame's own storage | the frame keeps `frata.checkout.v1` | e2e reload mid-checkout |
| S13 | Address changed mid-checkout (new PIN code) | Re-priced; state re-filled | Same | The frame passes the new PIN code and state up; the page re-prices; a placed total that differs is a "changed" | `fitted.ts`, the frame's message | e2e |
| S14 | A crafted bag link from another site | Joins (L1) | Joins a shopper-built bag; replaces a link-made one | Joins (cross-origin referrer) | `cart-link.tsx` | unit |
| S15 | Store switching: store X then store Y | Separate bags | Same | Separate bags (storage is per origin, even before the PSL) | browser | e2e two hosts |
| S16 | A partner removed mid-session | Site keeps serving; checkout fine | Same | Partner paths switch to Frrata's maintenance page within the routing push; checkout, orders, the bag keep working | outbox `site.route` in the removal's transaction | e2e |
| S17 | A design that fails contrast | n/a | n/a | Save refused naming the pair; at render a failing record falls back to defaults | `brand/check.ts` | unit + `checkout-design` e2e |
| S18 | A brand with no logo | Store name in the theme's type | Same | Store name in the brand's display font everywhere; invoices name only | § 5 | e2e on a no-logo fixture |
| S19 | The site ships its own logo file | Allowed | Allowed | Refused by `npm run check` and the gate | the kit check | gate unit |
| S20 | Brand connects a domain while a shopper's bag is on `<store>.frrata.shop` | n/a | n/a | The old host redirects to the domain; the bag stays on the old origin (origins differ); the shopper rebuilds it. Accepted, stated in the connect dialog's line | — | e2e `addresses,domains` |
| S21 | Domain DNS fails (main domain failing) | Checkout falls back to the store's name | Same | Site and checkout both fall back to `<store>.frrata.shop` together (`mainDomainIn` already hands back) | one routing table for both | e2e `domains` |
| S22 | Sibling store sets a `Domain=frrata.shop` cookie | n/a | n/a | Ignored (only `__Host-` read); large ones may break loads until the PSL listing (residual) | P4a | e2e two frrata.shop hosts |
| S23 | Sibling store posts to store X's secure routes | n/a | n/a | Refused (`Sec-Fetch-Site: same-site`) | P4a | unit |
| S24 | A partner page registers a service worker | n/a | Allowed on the partner's own origin | Refused by CSP and the edge | P5 | e2e |
| S25 | A partner page opens or frames `/checkout` | n/a | n/a | No access (COOP, `frame-ancestors`) | P5 | e2e |
| S26 | A partner page fetches `/api/shop/ekcode/me` with the shopper signed in | n/a (different origin) | Same | Route gone from the brand origin; the secure host refuses | P3 | e2e |
| S27 | A partner page reads tab storage after checkout | n/a | n/a | Only the bag and the code are there | P3 + `check:storage` | e2e |
| S28 | A partner response tries to cache under a reserved path | n/a | n/a | Impossible: the router never sends a reserved path upstream | `reserved.ts` | unit on the router config |
| S29 | Host A's cached page served for host B | n/a | n/a | Never: cache keys include the host | Vercel; proof script | `one-address.mjs` |
| S30 | The site deployment is down | Site down, checkout up | Same | Site paths show Frrata's "we'll be back" page with the store's name; checkout and orders work for open bags | router fallback on 5xx | e2e with a dead upstream |
| S31 | Frrata's app is down | Checkout down | Same | Everything down on that host (the address is Frrata's); site pages already cached at the site's CDN can't be reached either | accepted: checkout is the business | written down; the kill line in § Reliability |
| S32 | The secure frame fails to load (network) | n/a | n/a | The page says "We couldn't load the secure form. Try again." with Try again; no Place order | the page's frame state | e2e with the frame blocked |
| S33 | A shopper with JavaScript off | Checkout needs JS | Same | Same (checkout needs JS today) | — | written down |
| S34 | Test key, no Website, store never opened (the pilot today) | Bug | Fixed | One address on `<store>.frrata.shop`, still in build mode ("Opening soon" for the public) | ADR-0018 amendment unchanged | e2e |
| S35 | The bag-link page's referrer is the same origin but from a partner page that crafted a link | n/a | n/a | Replaces: it is the brand's own site | by design | unit |

### 9. Phases (the plan has tasks, verify commands and lanes)
| Phase | Gives | Needs first | Mockup |
|---|---|---|---|
| **P0 Bag link fix** | The pilot's bag bug closed | Owner decision 2; `security-reviewer` | none: a bug fix, no new screen |
| **P1 One brand record** (replaces Studio plan BT) | One logo and palette for console, checkout, emails, invoices, cards, API, site; the pilot's logo in the record | Owner decisions 8, 9, 10, 11; G-a not required | **new:** Console › Brand (logo files, palette, type, radius, density, the preview strip) |
| **P2 Checkout and order pages in the brand's design** | The pilot's checkout, bag-link page and order page look like House of Ayuda, on today's hosts | P1 | **new:** checkout, order page and bag-link page in the pilot's design at phone and desktop with every state, plus Console › Brand › Checkout (variants, blocks, three lines); Remove and quantity on checkout lines (decision 13) |
| **P3 The secure frame** | Shopper data off the brand origin; ready for partner code beside checkout | P2; the Razorpay-in-a-frame spike | **new (states only):** frame loading, frame failed, EkCode in a popup, the Safari path |
| **P4a Cross-store hardening** | No `Domain` cookies, `__Host-` only, fetch metadata on every route | none | none (no screen) |
| **P4b PSL listing** | Each `<store>.frrata.shop` its own site | P4a; the owner's PR and renewal | none |
| **P5 One address** | The site and checkout at one host; the pilot on `<store>.frrata.shop` (or its domain) | P2; P4a; the router spike; for outside partners also P3 | **new:** Settings › Website (one address, Connect my domain with two records) |
| **P6 One bag** | The site reads and writes Frrata's bag; the bag link for outside links only | P5 | **pilot's own:** the bag drawer with the quote's subtotal and sold-out lines (a change to the pilot's approved mockup) |
| **P7 Studio designs checkout** | Partners set checkout design in Studio's pane with sample data; agent proposals write the record | P2, V3b | **approved:** the one-screen Studio mockup, plus a Checkout tab redraw |

## Design review
- **UI/UX.** Shoppers: one address, one design, one bag; checkout unchanged in fields and steps; lines gain Remove and a
  stepper (decision 13); the secure frame invisible except while loading or failing (states drawn in P3). Owners and
  partners: Console › Brand (P1) and its Checkout tab (P2), phone first, Rule 0, the preview strip on sample data;
  Settings › Website (P5) says one address and asks for two DNS records. States per screen: empty (no logo), loading,
  saved, refused (a contrast pair named at the field), one, many (logo variants), no permission (Builder without
  `brand.edit`, support visit read-only), phone. Norman: the preview is the signifier (what you set is what a shopper
  sees), constraints over refusals (the radius is a scale, fonts a list, the lines have counters), undo (previous record),
  feedback (toast "Saved." and the preview updates). Mockups per phase; `words-reviewer` and `design-system-reviewer` on
  each.
- **Tenancy.** New tenant tables, each with `tenant_id`, grant, RLS, `tenant_rows` policy with no null branch, in one
  migration, and their `frata_admin` (none) and `frata_builder` (select on `brand_tokens` and `checkout_design` for the
  Builder's preview, through `withActor`) grants stated: `brand_tokens` (BT's, gains the logo variant columns, each with a
  CHECK on the store's own media folder like `doc_logo`'s), `checkout_design` (one row a store: header and footer variant,
  trust blocks as a text array from a closed set, the three lines, `updated_by`, `updated_at`). Proof blocks: § 90 (the
  record, BT's number), § 97 (`checkout_design`). Where each tenant id comes from: console and Studio saves from
  `requireMember`/`requireCapability`; shop pages from the host (`tenantForHost`); **the secure host from its Host** with
  `secure.` stripped and looked up by the same rule (`routeFor` kind `secure`; `requireSecure`, the `requireShop`
  pattern); the API from the key. Never from a frame message, a URL or a body. Routing config rows pushed to the edge
  carry hosts and upstream origins only, no tenant data. `tenancy-auditor` on P1, P3, P5.
- **Modularity.** Pure: `src/domains/brand/` (tokens, check, `accentOf`), `src/domains/tenancy/reserved.ts` (reserved
  paths), `src/domains/checkout/frame-messages.ts` (the frame's closed message schema). Reads: `src/lib/queries/brand.ts`
  (cached, tag `shop:<t>:brand`). Saves: `src/lib/content/save.ts` gains the brand save (the Studio plan's one save, called
  by the console action and Studio's Apply). Rendering: checkout components read tokens from props, never the theme. The
  router config writer in `src/lib/sites/routing.ts` (outbox `site.route`). The frame in `src/app/secure/[host]/` (the
  `s/[host]` pattern).
- **SSOT / DRY.** One logo (`logo_url` primary; `doc_logo` derived when not uploaded); one accent rule (`accentOf`); one
  contrast rule; one bag (`bag-store.ts`, served as `bag.js` from the same source); one reserved-path list; one checkout
  design read by checkout, the preview and Studio; one design check for save, preview and render; `siteOrigin` and
  `checkoutOrigin` derived from the same live host; the frame's words from `src/components/storefront/words.ts`.
- **YAGNI.** No checkout extension slots for partner code (signal: a partner with a paying brand asks for one); no
  server-side cart (signal: cross-device bags asked for by ≥ 3 brands); no per-page checkout styles (Shopify doesn't
  either); no custom fonts beyond Frrata media; no second router vendor; no PSL entry for `secure.frrata.shop`.
- **KISS.** The simplest version: Frrata's project keeps every store host; a host with a live site gets one routing rule
  that sends non-reserved paths to the site and sets headers; checkout's personal part moves into one frame; the bag is
  today's bag. New pieces and why the old ones don't do: the frame (same-origin partner code can read anything on the
  brand origin); the routing rule (no rewrite reaches another team's deployment today); `checkout_design` (the theme's
  `checkout: focused` setting is theme data that retires); `bag.js` (the site's bag is a copy).
- **Scalability.** 500 stores × 10× festive: routing rules are one per hosted site (spike: the per-project limit; else
  Edge Config with middleware, one read per request); proxied pages cached at the site's CDN and, opted in, at Frrata's;
  `brand_tokens` and `checkout_design` one row a store, read through a cached loader; `/api/shop/quote` already carries
  the bag drawer's load on theme shops (its limits unchanged; the bag drawer quotes on open and on change, debounced
  400 ms, never per keystroke); certificates for `secure.` hosts paced under 100 domain additions an hour a team
  (frata-integrations) and, before the listing, Let's Encrypt's 50 a week for `frrata.shop`.
- **Performance and speed.** (a) Checkout page: `shopFor` (cached), `shopBrand` (cached), `shopModules` in one
  `Promise.all`, no new statement per request; the frame page: a cached shell, data fetched inside it after load.
  (b) New queries are by primary key on one row a store; EXPLAIN in proof § 90/§ 97. (c) Brand record entry < 4 kB.
  (d) Checkout HTML + RSC grows < 5 kB. (e) A brand save purges `shop:<t>:brand` only; a checkout design save purges
  `shop:<t>:brand` (checkout reads it) and nothing else; a shopper's action purges nothing. (f) Checkout first-load JS:
  + ≤ 3 kB for the frame bridge; the frame's own JS ≤ 25 kB gzipped; `bag.js` ≤ 3 kB on site pages. (g) One font preload
  (the record's display font) and none in the frame (it inherits by the same files from cache). Router hop budget ≤ 30 ms
  p75 TTFB added on site pages, measured in the spike. `speed-reviewer` on P2, P3, P5, P6.
- **Reliability.** The routing push is an outbox row in the same transaction as the change (site published, partner
  removed, domain moved), drained at once (`drainSoon`), with the 5-minute sweep as the net; a routing failure leaves the
  last good rule (never no rule). Site upstream 5xx → Frrata's "we'll be back" page for site paths; checkout unaffected
  (S30). Frrata down → the store is down (S31): accepted, because checkout is the business; the kill line is any month
  where the site upstream causes more checkout incidents than it saves bag errors. The frame failing → the page says so
  and offers Try again (S32). Every outbound call through `fetchWithTimeout` (the routing API from the fleet with 10 s).
- **Security.** § 2 (threats T1–T19, residuals), § 6 (cross-store), § 7 (previews). For each new route: `/api/secure/*`
  through `requireSecure` (Host-derived tenant, exact Origin, `Sec-Fetch-Site: same-origin`, Zod with caps, named fields
  out, the existing per-IP limits that fail closed); the brand save through `asMember(CAN_BUILD)` or
  `requireCapability('brand.edit')`, Zod with lengths, the design check; merchant content (the three lines) rendered as
  text only; logo files only from Frrata media under the store's folder, SVG outline-only (Studio's checks). PII: moves
  from brand-origin tab storage to the frame's; logs carry error names only. Environments: previews never hold production
  keys (as today). `security-reviewer` on every phase; a person's review of P3 and P5 before outside partners; a pen test
  before outside partners' code serves at one address (kit spec § 7).
- **Motion and visuals.** No new motion: the frame fades in on the toast's entrance (200 ms, `ease-entrance`), reduced
  motion a 120 ms fade; checkout's line Remove uses the bag drawer's existing pattern. Pictures: Console › Brand shows the
  preview strip instead of words; the trust blocks are the store's own icons from the kit, no Unicode glyphs.
- **Unit economics.** What a merchant pays: nothing new. What Frrata pays: the router's edge request on every site page
  and possibly a second bandwidth charge (unverified: measured on the pilot, then priced into hosting's allowances under
  the 3× rule); one more certificate and domain row a store (free); the PSL (free); the preview domain (≈ $12 a year).
  Hypotheses (figure · source · date · test): **H-1** one address and one bag raise checkout completion on code sites by
  ≥ 2 points against the split · this spec · 2026-11-16 · pilot and the next 3 sites, 4 weeks before and after, orders ÷
  `begin_checkout`. **H-2** the router hop costs ≤ ₹0.50 per 1,000 site page views on Vercel bom1 · ADR-0017's prices
  ($2.20 a million requests, $0.20 a GB) · 2026-11-16 · the pilot's 30 days (Studio plan V2a·11). **H-3** the frame adds no
  EkCode codes (same-site cookie kept) · this spec · 2026-11-16 · `ekcode_codes` per order before and after P3.
  `unit-economics-reviewer` on P5.
- **Theme blocks.** n/a: no theme work (ADR-0014 rule 5). Checkout stops reading the theme's tokens for stores with a
  brand record; theme shops without one keep their look until V5.
- **Storefront API.** Additive only on `2026-12`: `shop.brand` (BT·3), and optional `shop.bag` (`script`, `checkout`
  paths) once P6 ships. `siteOrigin` and `checkoutOrigin` keep their meaning; on one address they hold the same origin.
  No cost, shopper or draft field reaches a mapper. Purge tags: `shop:<t>:brand`. `api-contract-reviewer` on P1 and P6.
- **Blast radius.** The middleware and `next.config` rewrites (every shop request), `routeFor` (every request),
  checkout (every order), EkCode (every signed-in shopper), emails and documents (every order), the kit and every code
  site, the Studio plan's V2a and BT, ADR-0014/0017/0018 wording, `security-headers.ts`. Footguns: `/_next/*` collision
  (asset prefix); a middleware header replaces next.config's (frata-gotchas); a routing rule published before its upstream
  is ready (stage, then publish); moving EkCode's shop cookie loses current shoppers' 30-day sessions once (accepted:
  they sign in again); old bags on the split origin are left behind at the move (S20).

### Stress test of the code the plan will call (read 2026-11-16)
| Severity | What | File | Fix |
|---|---|---|---|
| High | A hand-off joins the bag whenever the store has no Website: the owner's bug | `src/components/storefront/cart-link.tsx:24` | P0 |
| High | A test-key site can never have a Website, so the replace path can't run for any site built before a domain | ADR-0018 amendment; `app_storefront_key` | P0, then P5 makes it moot |
| High | The site's bag stays full after an order | `mokobara/lib/bag.ts`; `checkout.tsx` `done()` | P6 (one bag) |
| High (for one address) | `/api/shop/ekcode/me` returns name, phone and saved address on an ambient cookie | `src/app/api/shop/ekcode/me/route.ts`, `src/lib/queries/customers.ts:63` | P3: moves to the secure host |
| High (for one address) | Checkout keeps the typed form and the pending order token in brand-origin tab storage | `checkout.tsx` (`FORM_KEY`, `PENDING_KEY`) | P3 |
| Medium | Checkout lines have no Remove or quantity: a stale line can't be fixed there | `checkout.tsx` "Your order" | P2 (decision 13) |
| Medium | Checkout and order pages draw the theme's tokens | `src/app/s/[host]/_frame.tsx` | P2 |
| Medium | The store's logo is empty while the site draws its own | `shop-snapshot.json`; design system § 1.1 | P1 (decision 8) |
| Medium | EkCode's hint cookie is readable by page script on the shop host | `src/lib/ekcode/handshake.ts:40` | P3 (moves into the frame) |
| Medium | The `frata` project predates default caching of external rewrites | Vercel changelog 2026-03-30 | P5: opt in per rule |
| Medium | Before the PSL listing, `secure.<store>.frrata.shop` certificates share Let's Encrypt's 50 a week | frata-integrations § Domains | P4b; pace in P5 |
| Low | `fromSite()` restates `siteHostKey`'s www rule | `cart-link.tsx` | keep (island size), test both agree |
| Low | The pilot's policy links leave the brand's address | `mokobara/lib/links.ts` | P5 (policies are reserved paths on the one host) |
| Info | The Studio plan names an e2e flow `93-site-hosting`; 93 is `93-owner-only` | `docs/plans/2026-11-12-studio-build.md` V2a·8 | rename at V2a |

## Out of scope
- Checkout extension slots for partner code (signal: a paying brand's partner asks with a use case).
- A server-side cart and cross-device bags (signal: ≥ 3 brands ask, or Instagram-to-Safari bag loss measured above 10%).
- Partner pixels on checkout or order pages (never; conversions are Frrata's).
- Moving the console to `app.frrata.com` (its own task in the rename plan).
- Cloudflare as the sites' host (ADR-0017's switch signals).
- The identity step's agent design (Studio V3a).

## How this changes the Studio plan and its ADRs (edits to make once the owner approves; not made here)
**Studio spec `docs/specs/2026-11-16-studio-agent.md`:**
1. *In short*, "A brand with no domain gets `<slug>.frrata.store`": becomes `<store>.frrata.shop`, one address with checkout.
2. *Do partners deploy*, row "The site's address": `<store>.frrata.shop` from Frrata (Frrata's edge), or the brand's domain.
3. § 12.1: the Frrata address is the store's own `frrata.shop` host, served by Frrata's edge; "Opening soon" is Frrata's
   own page at the edge (as `_frame.tsx` does today), not a site deployment.
4. § 12.3: "on Vercel there is no Frrata router" becomes: Frrata's edge (routing rules or middleware) sets headers and CSP
   on every partner response; the fleet's overlay stays as the second layer.
5. § 12.5: Connect my domain moves the site and checkout together; two records (host and `secure.`); "checkout stays on
   Frrata's host" becomes "checkout is served by Frrata's app at the same address".
6. § 13 replaced: no sites domain; no `shop_domains.serves = 'site'`; no sites-domain trigger, CHECK or apex reader; the
   PSL for `frrata.shop` (this spec § 6). `frrata-preview.site` stays as the preview domain (this spec § 7).
7. Decision 9 (domain names): only the preview domain is bought.
8. § Design review, Tenancy: V2a's § 88 loses the `serves` changes; the risk row "A site row as Main would move checkout"
   is gone.
**Studio plan `docs/plans/2026-11-12-studio-build.md`:**
9. V2a "After it": one address on `<store>.frrata.shop` or the brand's domain.
10. V2a·1: drop `shop_domains.serves` and its trigger and CHECK; add the routing config rows (this plan P5).
11. V2a·2: `OURS` gains only the preview domain; no sites-domain apex rule.
12. V2a·5: the fleet registers each site's upstream with Frrata's edge (outbox `site.route`); headers overlaid at the edge.
13. V2a·6 gate gains: asset prefix `/_s`, no reserved path, no service worker, no personal-data inputs, no own logo,
    colours and fonts from `shop.brand`.
14. V2a·8: rename flow `93-site-hosting` (93 is taken).
15. V2a·11: the pilot moves to one address (this plan P5), not to `frrata-sites` addresses.
16. BT is replaced by this plan's P1 (brand record) and P2 (checkout from the record); its proof § 90 is kept.
17. Studio's `tokens_propose` and `logo_propose` write the brand record through P1's save (unchanged in intent).
**ADRs and the kit spec (amendments for the owner):**
18. ADR-0014 rule 3: "Checkout, payment, sign-in and personal data stay on Frrata's **app**" (served at the store's one
    address); "A site hands the bag over by link" becomes "a site shares the store's one bag".
19. ADR-0014 amendment 4: the router is Frrata's own edge on the store's host. Amendment 7's "code sites live on their own
    registrable domain, never checkout's" is superseded by this spec § 1–2 and § 6.
20. ADR-0017 rule 4: checkout is served first-hand by Frrata's app, which holds the address; site pages are proxied to the
    site's deployment. Rule 6: domains as § 1 here. Rule 3: the router is Frrata's edge on Vercel.
21. ADR-0018: on one address `siteOrigin` equals `checkoutOrigin`; test keys before a domain unchanged.
22. Kit spec § 1 rewritten as § 1–2 here; § 4's hard floor: `form-action` to Frrata's own paths on the same origin, plus
    `worker-src 'none'`, the asset prefix and no personal-data inputs.
23. `docs/setup.md` § Email, "frrata.shop main site, frrata.store shops": stale against the owner's 2026-11-16 call.

## Owner decisions (each with a recommendation)
1. **Adopt A, Frrata at the door,** with the secure frame? **Yes.**
2. **Narrow security L1 now (P0):** a bag link replaces a bag that only links filled? **Yes.**
3. **A hidden `secure.` record** on each connected domain (two DNS records at Connect my domain; shoppers never see it)?
   **Yes.** It is what lets Safari keep the shopper's sign-in.
4. **Submit `frrata.shop` to the Public Suffix List now,** and renew it to 3 years first? **Yes.**
5. **Before the listing reaches browsers,** may an outside partner's code serve an open store at `<store>.frrata.shop`
   (with P4a's controls, the cookie-flooding residual accepted)? **Yes**; the alternative is a required domain.
6. **Keep one separate preview domain** and drop `frrata.store`? **Yes.**
7. **The pilot moves to one address before the secure frame,** because Frrata wrote its code? **Yes**; outside
   partners wait for P3.
8. **The pilot's doorway monogram:** upload it as House of Ayuda's brand record now, or regenerate it through Frrata's
   identity step? **Upload now**; from today a site never ships its own logo.
9. **Who edits checkout design:** owners, Managers and partner members, and Builders on sample data through a new
   capability `brand.edit`? **Yes.**
10. **After handover the owner edits the brand record without the partner** (the partner told)? **Yes.**
11. **Colours and fonts in site code come only from the brand record** (the check fails others)? **Yes.**
12. **No partner pixels or scripts on checkout and order pages,** conversions through Frrata? **Yes.**
13. **Checkout lines gain Remove and a quantity stepper?** **Yes.**
14. **Three short lines only** (heading, delivery note, thank-you)? **Yes.**
15. **Razorpay:** opened from inside the frame if the spike proves UPI works there, else from the page with the contact in
    memory only? **Yes, the spike decides.**
16. **Measure the router's cost on the pilot for 30 days** and price it into hosting before paid stores? **Yes.**

## Facts used (checked 2026-11-16 unless dated)
| Fact | Source · date |
|---|---|
| Hydrogen: storefront on the primary domain, checkout on `checkout.example.com` | shopify.dev Hydrogen "Go live" (undated, read 2026-11-16) |
| Checkout UI extensions in a Web Worker, no DOM, 64 KB, Plus-only steps, `api_version 2026-10` | shopify.dev checkout UI extensions (read 2026-11-16) |
| Checkout branding: colours, typography, radius, header, sections, favicon; no per-page styles; no SVG; Plus only | shopify.dev checkout styling (undated, read 2026-11-16) |
| Embedded checkout needs the same domain for Safari | developer.bigcommerce.com Embedded Checkout (undated, read 2026-11-16) |
| Catalyst's checkout subdomain loses identity cookies | Klaviyo community, April 2026 [secondary] |
| Swell Checkout included with every store | swell.is help (undated); custom checkout domain: no current source found |
| Saleor's checkout is a self-deployed Next.js app | github.com/saleor/react-storefront (undated); custom domain: no current source found |
| Stripe.js frames on Stripe origins; no cross-origin isolation support | docs.stripe.com security guide (undated, read 2026-11-16) |
| Microfrontends, multi-zones, proxy project | Vercel KB, updated 2026-10-02 |
| Microfrontends' price past two projects | vercel.com/microfrontends and docs (2026; sources conflict) [secondary] |
| Project-level routing rules: host conditions, external rewrites, header actions, API, instant publish | Vercel docs, updated 2026-08-11 |
| 100 routing rules a project | Vercel community forum [unverified] |
| External rewrites cached by upstream headers for projects created from 2026-04-06; older opt in | Vercel changelog 2026-03-30 |
| Zones need their own asset prefix; navigation between zones reloads | nextjs.org multi-zones, updated 2026-06-01 |
| COOP `same-origin` vs `unsafe-none` → new browsing context group, references severed | MDN, modified 2026-07-12 |
| `Sec-Fetch-Site` values; widely available since March 2023 | MDN, modified 2026-09-28 |
| No `navigate-to`; `worker-src` governs ServiceWorker scripts | MDN CSP, modified 2026-03-22 |
| `Service-Worker: script` on a worker's script fetch | MDN, modified 2025-07-04 (older than 12 months: unverified) |
| ITP: 7-day cap on script storage; all third-party cookies blocked; third-party storage partitioned and ephemeral | webkit.org tracking prevention (undated, read 2026-11-16) |
| Safari partitioned cookies dropped after cross-site redirects | WebKit bug 306194, 2026-01-24 |
| PSL: owner's PR, `_psl` TXT kept, ≥ 2 years, no SLA, small projects declined, not for rate limits | PSL wiki, edited 2025-05-23 (older than 12 months: unverified); PR template notice 2026-05-06 |
| Vercel advises the PSL for tenant domains; Let's Encrypt 50 certificates a registered domain a week by the PSL | frata-integrations § Domains [V Vercel 2026-09-16, Let's Encrypt 2026-08-05] |
| How and when browsers ship PSL updates | no current source found |
| Razorpay Checkout and UPI intent inside a frame | no current source found (spike) |
| Razorpay accepts live payments only from registered websites | frata-integrations § Razorpay (checked 2026-11-09) |
| Vercel bom1 $0.20 a GB, $2.20 a million requests | ADR-0017 § Options (sources 2026-09-14) |
