# Storefront API — a partner's own website on Frrata's catalogue, bag and checkout
Status: draft · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/SKpPx1rfBu48w18HMNUK7u (v1) · Approved: — ·
Research: `docs/research/2026-11-11-claude-builder.md` (and the three reports it summarises, 2026-11-11)

Owner (2026-11-11): skip the in-console Claude builder (P1, P2); go to the Storefront API. Partners first. Claude's
place is the partner's side: the partner's own Claude (Claude Code, the API) builds the client's website against
this API, and Frrata gives that Claude what it needs (OpenAPI, a starter, a skill) — Claude never runs on our servers.

## Goal
North star (5) a premium storefront, through partners (roadmap row P: distribution). An agency with developers can
give a brand a fully custom website while Frrata keeps what makes the brand money: catalogue, offers, COD risk,
checkout, payments to the shop's own Razorpay, orders, shipping, GST.
Measures (90 days after release): partner-built headless shops live; orders placed through a handoff (`channel:
headless`); handoff → order rate vs the same shops' Frrata pages; API error rate < 0.5 %, p95 < 300 ms; **zero**
cross-shop reads and **zero** cost fields in any response (gates, below).
Honest limit: this serves agencies with developers, not the no-developer merchant; it must not slow the core.

## Job
A partner builds a client's website on their own stack (often with Claude), reading the shop's catalogue from Frrata
and sending the shopper to Frrata's checkout, without Frrata giving up a single safety rule.

## Research (dated; full table in the research doc)
- **Shopify Storefront API (2026-10 docs) + Hydrogen (GA 2026-10-14).** Taken: public vs private tokens; the cart
  returns a `checkoutUrl` on a checkout subdomain; buyer traffic not throttled, bots and checkout creation are;
  dated versions supported ≥ 12 months with a header naming the version that answered.
- **BigCommerce (private tokens 2026-06-01).** Taken: browser tokens bound to ≤ 2 origins; server tokens scoped and
  expiring; a published end date for old tokens; no introspection.
- **Medusa v2 (2026-10/11).** Taken: every response built from an explicit field list, anything else dropped — the
  API twin of `check-client-bundle`.
- **Commerce Layer.** Taken: a credential safe in a browser; overlapping tokens on rotation; separate limits for
  cacheable and uncacheable calls; idempotency keys on writes.
- **Saleor (2026-02-23).** Not taken: "anyone who knows this checkout id can modify it" — our handoff is single-use,
  short-lived and bound to the shop.
- **Shopflo (2026-07-10), India.** Confirms the local pattern: server creates a checkout URL, shopper redirected,
  webhook confirms.
- **OWASP API Top 10 (2023 edition; no newer one found — unverified as current):** API1 BOLA, API3 property-level
  authorization, API4 resource consumption, API6 business flows, API7 SSRF, API8 misconfiguration, API9 inventory.
- **AI-built sites (WebAIM Million 2026-03-30; AudioEye 2026-09-30):** most fail WCAG; Frrata can't gate a site it
  doesn't host, so the starter and the partner skill carry the accessibility rules.

## Design

### 1. Shape (the boundary)
```
Partner's website (their hosting, their domain kesarstudio.in)
  ├── reads  ── GET  api.frrata.shop/2026-12/…        catalogue, shop, offers   (public key in a browser, private on a server)
  └── hands off ─ POST api.frrata.shop/2026-12/checkouts  {lines, attribution}  → { checkoutUrl }
                    shopper → checkout.kesarstudio.in/h/<handoff>  (a Frrata host: bag, EkCode, COD rules, Razorpay)
                    order page "Back to kesarstudio.in"; webhooks tell the partner what changed
```
- **Read-only catalogue + a checkout handoff.** No cart API, no order, customer or address reads, no writes to the
  catalogue, no payment API. Checkout, offers, COD risk, EkCode and payments stay Frrata pages: everything built
  there works for headless shops on day one, and Frrata never touches a shopper's money (CLAUDE.md).
- **REST + JSON, dated versions in the path** (`/2026-12/…`). No GraphQL (no complexity scoring, no introspection
  to switch off). Every response carries `Frrata-Api-Version`.
- **One host** `api.frrata.shop` (middleware: a new surface `api`, its own CSP-free JSON responses), route handlers in
  `src/app/api/storefront/[version]/…`, every handler through one chokepoint `apiRequest` (added to
  `check:actions` CHOKEPOINTS), the way `/api/shop/*` goes through `shopRequest`.

### 2. Keys — where the shop comes from
- **The shop comes from the key, never from the URL or body** (ADR-0002; the key is a third source beside the
  session and the host, so the architecture skill and `check:tenant` list it).
- `storefront_keys`: id, tenant_id, kind (`public` | `private`), name, prefix (first 8 chars, shown), `hash` (sha256 of
  the whole key; the key itself is never stored), origins (public only, ≤ 5 exact `https://` origins), created_by,
  created_at, expires_at (private: optional), revoked_at. Grant select/insert/update to frata_app (revoke only via
  `revoked_at`), RLS + policy, tenancy.sql check.
- Lookup: `app_storefront_key(hash)` — a definer (search_path '', revoked from public/anon/authenticated/
  service_role) returning only `tenant_id, kind, origins, key id` for a live key; then `withTenant`.
- **Public** `frs_pub_…`: browser-safe; CORS answers only its listed origins; read + handoff only; limits per IP.
  **Private** `frs_sec_…`: server only, shown once; may forward the shopper's IP (`Frrata-Buyer-Ip`) for limits; same
  data as public in v1 (so a leaked one exposes nothing a public key wouldn't), higher limits. Rotation: create the
  new key, both work, revoke the old (no forced overlap window to manage).
- **A test key** (`frs_test_…`) on a shop that isn't open: reads the catalogue as the shop will show it; its handoff
  lands on the checkout preview that can't place an order (the theme preview's bag/checkout rule).
- Who manages keys: `CAN_MANAGE` (owner, admin) and a partner **before handover** (their building window); staff and
  support visits see the page read-only. Every create and revoke is an `audit_events` row.

### 3. Resources (v1, version `2026-12`)
| Resource | Notes |
|---|---|
| `GET /shop` | name, logo, language, currency INR, prices include GST, COD on, delivery promises (from shop facts), policies (titles + text), **legal block** (legal name, address, grievance officer, customer care — India E-Commerce Rules 2026, in force 2027-01-01), site origin, checkout origin |
| `GET /products?collection=&page=&q=` | listed only, 48 a page, newest by `since`; search ≤ 60 chars |
| `GET /products/{handle}` | variants (options, price, prior price only within 30 days of a cut, M.R.P., **availability kind**, never an exact count above `LOW_STOCK_AT`), images (base + widths, alt), stories, pairs, size chart, pack declarations, offer lines; a moved handle answers `301` with the new handle |
| `GET /collections`, `GET /collections/{handle}` | rules applied, the shop's order |
| `GET /offers` | the shop's live offer lines (terms only: `liveOffers` → `publicQuote` rules; no id, limit or budget) |
| `GET /pincodes/{pin}` | delivery days and COD, as the shop's own pincode check |
| `GET /reviews/{product}` *(module)* | only while `reviews` is usable for the shop (§ 6) |
| `POST /checkouts` | `{lines: [{variant, qty}] ≤ 50, attribution?, returnPath?}` → validated against this shop's variants and availability, priced by nothing (checkout prices); stores a `checkout_handoffs` row (id 128-bit, tenant, lines, attribution, created_at, expires 30 min, used_at); answers `{checkoutUrl}`. Idempotency-Key header honoured. |

- **Every response is built by a pure mapper** in `src/domains/storefront-api/<version>/` from the cached shop reads
  (`shopCatalogue`, `shopProduct`, `shopSettingsFor` …), validated against a Zod **output** schema per resource; the
  OpenAPI document is generated from those schemas. Nothing serialises a row.
- **Checkout handoff** (Frrata side): `GET <checkout host>/h/<id>` loads the lines into the bag (single use: `used_at`
  set on first load; a reload shows the bag it made), drops lines no longer buyable with the usual "changed" words,
  then today's checkout. Attribution from the handoff joins `cleanAttribution` (`channel: headless`, the partner's
  landing tags and referrer host).

### 4. Domains, SEO, Razorpay
- Settings gains **Website**: `Runs on Frrata` (default) or `Runs elsewhere` with the site origin. Elsewhere: the
  shop's Frrata pages (home, products, collections) answer 308 to the same path on the site origin; checkout, order
  pages, `/h/…` and policies stay on Frrata (policies also come through `/shop`). Frrata's sitemap lists nothing;
  feeds (Google, Meta) link to the site origin.
- **Checkout address**: a subdomain of the brand's domain (`checkout.kesarstudio.in`) connected through Custom domains
  (own domains v2) and marked "Checkout", or the shop's `frrata.shop` address. Its pages are `noindex`.
- **Razorpay**: payments are taken on the checkout host, but the brand's registered website is the partner's site →
  check with `integration-researcher` which website Razorpay expects before release (rule 75 gates Make main the
  same way).

### 5. Webhooks out (ADR-0006)
- `storefront_webhooks`: tenant, url (`https://`, public host, ≤ 3 per shop), events (`product.changed`,
  `product.removed`, `collection.changed`, `availability.changed`, `offers.changed`, `shop.changed`), secret (sealed,
  shown once), created_by, disabled_at, failing_since.
- A catalogue write that already calls `refreshShop`/`refreshSoldOut` also `enqueue`s one `storefront.webhook` row
  per subscribed shop, deduped per (shop, event, object) in a 30 s window; the sender POSTs `{event, id, at}` only
  (ids, never data: the partner fetches with its key), signed `t=…,v1=HMAC(t.body)`, 5 s timeout, no redirects,
  DNS resolved and private/link-local/metadata addresses refused **at send time**, response body ignored; retries
  with backoff; failing 72 h → disabled, with a console banner.

### 6. Modules and add-ons (the extension contract)
- A module that offers shop data to the API declares it in the registry (`apiResources: ['reviews']`); its handler and
  mapper live in its own folders and join through one map `API_RESOURCES` (like `SENDERS`); core never imports it
  (`check:modules`).
- Served only while `moduleAccess` says usable; otherwise `404 {"error":"not_available"}` — the same for "off", "not
  in plan" and "paused", so a partner site renders without it. The starter shows how.
- A module's resource follows the same rules: output schema, mapper, version snapshot, no shopper PII beyond what its
  shop page already shows (Reviews: first name + initial, as on the shop).

### 7. Limits and caching
- **Reads** use the shop's cached loaders: an API read costs what a shop page costs. Responses are
  `Cache-Control: private` (the shop comes from a header, so a shared CDN must not key on the URL alone); partners
  cache on their side (the starter does ISR + webhooks).
- **Limits** (numbers for the speed review): public key per IP 600/min reads, 30/min handoffs; private key per key
  6,000/min reads, 600/min handoffs, per forwarded buyer IP 30/min handoffs; held by Vercel WAF rate-limit rules on
  `api.frrata.shop` (keyed on the key prefix header and IP) so a read never writes to Postgres; the Postgres limiter
  only for handoffs (fail closed). 429 with `Retry-After`.
- Body ≤ 32 kB, JSON only; `Idempotency-Key` on POST stored on the handoff row.

### 8. Versions
- A released version never changes shape except **additively** (a new optional field, a new resource);
  `released-api.test.ts` snapshots each version's OpenAPI (a removal or a rename fails). A breaking change is a new
  dated version. Each version lives ≥ 12 months after its successor ships; `Deprecation` and `Sunset` headers;
  Console shows which keys still call an old one. One list of live versions (`API_VERSIONS`), nothing else answers.

### 9. The developer kit (where Claude comes in)
- `api.frrata.shop/2026-12/openapi.json` (generated), docs at `frrata.shop/developers` (reference + guides), a typed
  TypeScript client generated from the OpenAPI.
- **Starter** (public repo `frrata-storefront-starter`, Next.js): product, collection, About, Contact (WhatsApp first,
  the legal block from `/shop`), FAQ, bag → handoff; ISR + webhook revalidation; accessibility and speed checks in its
  CI; never a private key in a client file.
- **A Claude skill for partners** (`skills/frrata-storefront/SKILL.md` in the starter, `llms.txt` on the docs): the
  rules their Claude must follow — keys, handoff, caching, the legal block, Indian shopper conventions (COD badge,
  pincode, sizes as buttons), accessibility, and "never invent product facts". A read-only dev MCP server waits for
  demand (signal: partners asking).

### 10. Console (mockup boards)
Settings › **Website and API** (one page, Rule 0): Website (Runs on Frrata / Runs elsewhere + site address);
Checkout address; Keys (table + Create key dialog + shown-once panel); Webhooks (rows with state chips, Send test,
deliveries); Usage (24 h requests, errors, 429s, versions in use); Developer kit (Docs, Starter, Claude skill, OpenAPI).
Partner workspace: a "Headless" badge on the client row; the handover dialog lists the keys the partner made with
"Revoke my private keys at handover" (on). Admin › Storefront API: counts per shop, pause a version for everyone
with a reason.

## Stress test — what if we add more?
| Scenario | What could break | Guardrail |
|---|---|---|
| A new module (Size & fit, Loyalty) wants to show data | Core imports it; data shown when off; a breaking field | § 6 contract; `check:modules`; `released-api` snapshot; the planning review heading below |
| An add-on is switched off or the plan drops | Partner site errors | Uniform `404 not_available`; the starter renders without it; contract test in e2e |
| A new product column (supplier, cost, margin) | It leaks through the API | Mappers build output field by field; `check:api` fails a cost-named field in any output schema; a test fills every column of a product and asserts the output keys equal the schema's |
| A new product feature (S3 stories, pairs) | Partners never get it, or it breaks old sites | Added as an optional field in the current version (additive), documented in the changelog |
| New checkout features (EkCode, prepaid offers, COD rules) | Two checkouts drift | There is one checkout: the handoff lands in it; the API has no checkout logic |
| Theme or Look changes | Partner site unaffected; checkout looks off-brand | Checkout reads Site settings (logo, colours); Look stays usable for that |
| Festive peak, 10× traffic | DB load, cost | Reads hit the cached loaders; WAF limits; partner caching required; handoff = one row per shopper |
| A private key ends up in a browser bundle (AI-written code) | Key misuse | Private has no extra data in v1; `frs_sec_` prefix for secret scanning; usage anomaly alert; one-click rotate; the partner skill forbids it |
| Catalogue scraping | Load | Public data anyway; per-IP limits |
| Handoff spam | Bag rows, inventory | Handoffs reserve nothing; limits; 30-min expiry; nightly prune |
| Partner webhook down or slow | Outbox backlog | Dedupe, backoff, disable after 72 h, never blocks a catalogue write |
| Webhook URL to an internal address | SSRF | § 5: resolved at send time, private ranges refused, no redirects |
| Handover / partner removed | Partner keeps access | Keys belong to the shop; handover revokes the partner's private keys by default; removing a partner offers revoking their keys |
| Back from headless to a Frrata theme | Broken links | Switch Website back; redirects stop; keys may stay |
| An old version must go | Sites break silently | Sunset headers, console list of keys on it, ≥ 12 months |
| Key of shop A with B's product or handle | BOLA | Tenant only from the key; every read and every handoff line inside `withTenant(A)`; B's id is "not found" |
| Partner site lacks the legal block (2027 rules) | Merchant non-compliance | `/shop` serves it; the starter renders it; the console's Website card lists it as "Your site must show" (required legal wording, Rule 0 allows) |
| Price changed between partner cache and checkout | Wrong price shown | Checkout always reprices; "Price updated to ₹…" before payment (existing rule) |

## Guardrails — keeping additions controlled
- **Gates (scripts):** `check:api` (every API route through `apiRequest`; no cost-named field in any output schema;
  every output schema has a mapper test), `released-api.test.ts` (version snapshots), `check:actions` (the API host's
  routes listed), `check:tenant` (the key as a tenant source).
- **Tests:** mapper unit tests per resource; `storefront-api.int.test.ts` (key A can't read B; revoked and expired keys;
  handoff lines from another shop refused); e2e `70-storefront-api` (create key → read → handoff → place an order →
  attribution `headless`); the starter's build and smoke test against the e2e stack in CI.
- **Skills:** a new `frata-storefront-api` skill (these rules, versions, the module contract); a heading in
  `frata-planning` § 3: **Storefront API** — "does this change what the API returns? which version? any cost or
  shopper field?"; the partner-facing skill in the starter.
- **Agents:** a new `api-contract-reviewer` (any diff touching `domains/storefront-api`, the registry's
  `apiResources` or a mapper's inputs: compatibility with released versions, the field list, docs regenerated) beside
  `security-reviewer`, `tenancy-auditor` and `speed-reviewer`.
- **Kill switches:** per key (revoke), per shop (Website: runs on Frrata / API off), per version for everyone (Admin,
  with a reason, like a theme recall).

## Design review
- **UI/UX:** one Settings page; states: off, on with no key, key created (shown once), revoked (dimmed, no actions),
  webhook failing, old version in use, staff read-only, support read-only, partner building, phone. Buttons name the
  outcome ("Create key", "Revoke key", "Send test"). Revoke confirms (cannot be undone).
- **Tenancy:** two tables (+ handoffs) with RLS; tenant from the key through a definer; tenancy.sql checks for each;
  `tenancy-auditor` on the plan.
- **Modularity:** `src/domains/storefront-api/` (pure mappers, schemas), `src/lib/storefront-api/` (key lookup,
  `apiRequest`, handoff), routes in `src/app/api/storefront/`; modules through `API_RESOURCES`.
- **SSOT:** prices, availability, offers, delivery, legal details are the shop's existing derivations; the API maps
  them, never recomputes.
- **YAGNI:** no cart API, no GraphQL, no shopper accounts (EkCode later), no dev MCP server, no hosting for partners.
- **KISS:** a mapper over cached reads + one handoff table.
- **Scalability:** see § 7; handoff table pruned daily; webhook rows deduped.
- **Performance:** a read = the cached loader + JSON; budgets: p95 < 300 ms, response ≤ 200 kB (lists paged at 48).
- **Reliability:** webhooks through the outbox; the handoff is idempotent.
- **Security:** § 2, 5, 7; key hashing; CORS per key; no cookies on `api.frrata.shop`; `security-reviewer` on the plan.
- **Motion and visuals:** console patterns only; the shown-once key reveal uses the flash once.
- **Unit economics:** included in Growth and Scale? (owner) — Vercel function invocations per read are the new cost;
  `unit-economics-reviewer` before the plan.
- **Blast radius:** middleware (a new host), Settings, own domains (a checkout role), checkout (the `/h/` entry),
  attribution (`channel`), outbox (a sender), the module registry (a field).

## Out of scope
Cart API, order/customer reads, shopper sign-in over the API (EkCode later), catalogue writes, GraphQL, hosting
partner sites, the in-console Claude builder (owner: not now), a dev MCP server (until partners ask).

## Facts used
Research doc 2026-11-11 (Shopify, BigCommerce, Medusa, Saleor, Commerce Layer, Shopflo, OWASP, WebAIM, AudioEye,
India E-Commerce Rules 2026 via law-firm coverage — gazette to check). Razorpay's website rule: to verify.
