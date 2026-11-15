# V1 · Storefront API — SA0 (keys, the third tenant source) and SA1 (catalogue reads)
Status: approved 2026-11-15 (owner, through the orchestrator), building · reviews folded in (architecture, tenancy,
security, speed, words, unit economics) · Date: 2026-11-15 · Lane A (`docs/plans/2026-11-15-parallel-lanes.md`),
branch `claude/lane-a-storefront-api`
Spec: `docs/specs/2026-11-11-storefront-api.md` (§ 1–3, 6–7, 9) · Decisions: ADR-0018 (accepted 2026-11-15, decisions
1–6 yes), ADR-0014 (and amendment 8), ADR-0002, ADR-0003, ADR-0015 (capabilities, lane C) · Content:
`docs/specs/2026-11-14-site-content-layer.md` § Storefront API additions, § API gaps for SA1 · Earlier mockup:
https://claude.ai/artifact/SKpPx1rfBu48w18HMNUK7u (v2, 2026-11-11) · **Final mockup (this phase):**
`docs/mockups/2026-11-15-storefront-keys.html`, https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm · Approved: owner, 2026-11-15

## Goal
North star (5): a premium storefront built as code by developers, partners or the agent (partners first). No code site
can exist until a key names its shop and the API serves its catalogue. Measures: SA0 — proof block 80 passes,
`check:tenant` § API and `check:api` green and run against their own documents, a `next start` proof (second read
`x-nextjs-cache: HIT`, a revoke turns it into 404); SA1 — a partner reads a shop's whole listed catalogue with one
public key; **zero** cross-shop reads and **zero** cost fields in any response (int test sentinel grep, over
`openapi.json` too); a page of 48 ≤ 150 kB raw; `x-vercel-cache: HIT` on a preview's second read. The spec's 90-day
measures (≥ 3 partner sites) start at SA1b, when the cart link lands.

## Scope
**SA0 (no screen; passes its proof before any resource):** the `api` host and its rewrites; the key format; the
migration (`storefront_keys`, `shop_settings.site_origin` + `site_domain_id`, the definer, the write-once trigger, the
domain-removed trigger); `storefrontKeyRow` (platform.ts) and the cached `storefrontKeyFor` (queries); `apiRequest`;
the limits; `check:tenant` § API, `check:api`, `check:actions` chokepoint; proof block 80; the int test's SA0 half;
the CLAUDE.md line exactly as ADR-0018 writes it, `frata-architecture` § Tenancy "two sources" → three, ADR-0002's
one-line amendment note — all in the SA0 commit.

**SA1:** Console › Settings › **Website** (`/console/settings/website`, as drawn); resources of version `2026-12`:
`shop` (with the legal block), `products/page/{n}`, `products/{handle}`, `collections`, `collections/{handle}/page/{n}`,
`offers`, `search?q=`, `openapi.json`; `released-api.test.ts`; mappers; int test SA1 half; e2e `8x-storefront-api`
(number at merge; `70-` is taken).

**SA1b, its own plan next (owner question 1):** the cart link, the shop's 307s to the site, `classifySource`'s
"Your website" rule, the starter, partner skill and docs site, the Accept dialog's key list, Frrata Admin › Storefront
API, D2 filters, D3 past 600, the module contract (`API_RESOURCES`, `check-modules` paths: no module offers a resource
in SA1, so the contract ships with the first one). **Content resources** wait for SA0's proof and lane B's read seam
(ADR-0018 decisions 6 and 14), coordinated through the orchestrator.

## Regression net first (owner rule 5)
Green before any change: e2e `01-signup`, `05-shop-look` (pixel), `13-paging`, `12-security`, the settings flows
`release:check` lists for `src/middleware.ts`, `next.config.ts`, `host.ts` and settings; `host.test.ts`,
`framing.test.ts`, `catalogue-size.int.test.ts`. New tests land with each task, never after.

## Tasks

### SA0·1 Host, rewrites and the edge check
- `src/domains/tenancy/host.ts`: `Surface`/`Route` gain `{ kind: 'api' }` for the exact `apiHost` (lower-cased, no
  trailing dot, no `www.`); on it only `/2026-12/…` answers, anything else `not_found`; `/api/storefront*` on any other
  host → `not_found` (like `/api/ek`). The kind never fires on `*.vercel.app` or when `NEXT_PUBLIC_API_HOST` is unset
  (`src/lib/public-env.ts`, `.env.example`). `api` is already a reserved slug.
- **Rewrites in `next.config.ts`, never in the middleware** (a middleware rewrite turns ISR into `private, no-store`;
  frata-gotchas): `beforeFiles`, `has: host = API host`, before the shop rules —
  `/2026-12/k/:key(frs_test_[0-9A-Za-z]{38})/:path*` → `/api/storefront/2026-12/t/:key/:path*` (the dynamic tree) and
  `/2026-12/k/:key/:path*` → `/api/storefront/2026-12/k/:key/:path*` (the ISR tree); `shopRewrites` adds the API host
  to its `missing` list.
- **The API host is out of the middleware's matcher** (unit economics: a middleware run on every CDN hit is a paid
  invocation, and a middleware rewrite breaks ISR): no Supabase client, cookie or nonce CSP ever runs there.
- **Two WAF rules on the API host** (`ops/firewall.json`, owner applies, `docs/setup.md`): (1) a free custom rule that
  denies any path not matching `^/2026-12/(k/frs_(pub|test)_[0-9A-Za-z]{38}/(shop|offers|collections|search|products/page/([1-9]|1[0-3])|products/[a-z0-9-]{1,100}|collections/[a-z0-9-]{1,100}(/page/([1-9]|1[0-3]))?)|openapi\.json)$`,
  so a bad shape starts no function; (2) the per-IP rate rule at ≥ 600 a minute (partner builds share outbound IPs).
  Plus a pre-made, **inactive** rule that denies the whole API host: the kill switch (sites keep their stale pages,
  shops and checkout stay up).
- Verify: `npx vitest run src/domains/tenancy` (both directions, mixed case, trailing dot, `*.vercel.app`);
  `next.config` rewrite unit test; `framing.test.ts`; a test that the WAF path regex accepts every route and refuses the gate's
  bad-shape list.

### SA0·2 The key (pure)
- `src/domains/storefront-api/keys.ts`: `KEY_KINDS`; `keyShape(s) → { kind, body } | null` (shape, then CRC32 of
  `prefix + body` as 6 base62 chars); `shownPrefix(key)`; `newKey(kind, bytes)` — the caller passes
  `crypto.getRandomValues` bytes, mapped to base62 by **rejection sampling** (unbiased; never `Math.random`);
  `hashHex(key)` is not here (I/O-free, but crypto lives in `src/lib`); `TEST_KEY_DAYS = 30`, `MAX_LIVE_KEYS = 20`,
  `KEY_NAME_MAX = 40`; `looksLikeKey(name)` (a pasted key refused as a name). `siteOriginProblem(origin, apex)`
  (`https://` + the apex or `www.` + apex exactly; no path, port or other subdomain).
- **Who may manage keys is the capability `api.manage` in `src/domains/tenancy/roles.ts`, defined by lane C under ADR-0015
  (orchestrator 2026-11-15); this lane reads it and never defines it.** Its meaning, as this plan needs it: `api.manage` = owners and Managers; a partner only while the shop has **never had an owner** (ADR-0018
  decision 5, the same fact `seesCosts` reads), never a support visit. `hasOwnerIn(tx)` is lane B's extraction from `costsVisibleIn` (it lands
  first); this lane uses it after merge.
- Verify: `npx vitest run src/domains/storefront-api src/domains/tenancy` (a flipped char fails; 37/39 chars fail;
  `frs_live_` fails; base62 distribution within 1 % over 10⁶ draws; the capability table incl. staff, Accountant,
  partner with and without an owner ever).

### SA0·3 Migration `drizzle/01xx_storefront_keys.sql` + `_access.sql` (`--custom`; renumbered at merge)
- `storefront_keys` (ADR-0018 § 3) + `partner_id uuid null` (the partner whose person made it, set by the action from
  the member row, never from input). `hash bytea not null unique` (sha256); `kind` CHECK; `name` 1–40 CHECK; `prefix`
  CHECK; index `(tenant_id, created_at desc)`; CHECK `(kind = 'test') = (expires_at is not null)`.
- `shop_settings.site_origin text` CHECK `^https://[a-z0-9.-]+$` and `site_domain_id uuid` → `shop_domains(id)`, both
  null or both set (CHECK). The row named is the proof; a trigger (`app_site_origin_check`) refuses an origin that is
  not `siteOriginProblem`-clean against **that row's** apex, or a row of another tenant, or a row not live (proved, not
  removed). A trigger on `shop_domains` clears `site_origin`/`site_domain_id` when that row is removed or parked.
- Grants exactly ADR-0018 § 3; `revoke all … from public, anon, authenticated, service_role`; RLS; `tenant_rows`
  policy, no null branch; no `frata_admin` grant. `app_storefront_key_revoked_once` (BEFORE UPDATE: a set `revoked_at`
  never changes).
- **`app_storefront_key(p_hash bytea)` returns `(key_id, tenant_id, kind, expires_at)` and derives every stop, so no
  stop is a race** (security 4, architecture 4–5, tenancy):
  ```sql
  where k.hash = p_hash and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())
    and s.site_origin is not null and d.id = s.site_domain_id and d.proved_at is not null and d.removed_at is null
    and (k.kind = 'public' or s.published_at is null)                    -- test keys end when the store opens
    and (k.partner_id is null or <the partner's link to this shop is live and the partner approved, not suspended>)
  ```
  The partner condition reuses the link-and-partner part of `app_pm_live` (no copy of the rule). So: the store opens →
  test keys stop; a partner is removed or suspended → its keys stop; reinstated → they answer again (owner note). No
  trigger touches `members` or lane C's definers. `security definer`, `search_path ''`, revoked from public, anon,
  authenticated, service_role, granted to `frata_app` only.
- `scripts/verify/tenancy.sql` block **81** (orchestrator 2026-11-15: lane B takes 80; renumbered at merge): every line of ADR-0018 § Gates and proof
  (result exactly the columns above), plus: a key whose store opened answers 0 rows (test) / 1 (public); A opening
  leaves B's test keys answering; a partner person in A and B removed from A — B's partner key still answers; a removed
  partner link stops only that shop's partner keys; `site_domain_id` of another shop raises; a removed domain clears the
  origin and the key stops; `site_origin` on a subdomain other than `www.` raises; `frata_admin` cannot execute or read
  `hash`.
- Verify: `npm run db:generate` clean; `npm run verify:tenancy`; `npm run check:tenant`.

### SA0·4 Lookup, the door and the limits
- `storefrontKeyRow(hashHex)` in `src/lib/db/platform.ts` (raw definer call, like `tenantForHost`).
  `storefrontKeyFor(key)` in `src/lib/queries/storefront.ts` beside `hostFacts` (check:tenant 6d holds):
  `cache(unstable_cache(['skey-v1', hex], …, { tags: ['skey:' + hex], revalidate: 30 }))` — **the cache key and tag are
  the lowercase hex of the sha256** (never decoded bytes), known before the call; a miss throws inside so it is never
  cached; the cached `expires_at` is checked again on each use. `refreshKey(hex)` and `refreshKeys(tenantId)` (reads
  the shop's live hashes, ≤ 20, purges each) live in `src/lib/storefront/refresh.ts`.
- `src/lib/storefront-api/request.ts`: `apiRequest(resource, handler, { tree: 'isr' | 'dynamic' })`. Order: key shape
  (again) → `storefrontKeyFor` → the kind must match the tree (a test key on the ISR tree or a public key on the dynamic
  tree → 404) → on the dynamic tree only, the limiter → `handler(ctx)` with `ctx = { tenantId, keyId, keyKind,
  version, now }` and parsed params only → `schema.parse(result)` → headers.
  - **The ISR tree never touches the request** (a header read there is a 500, measured): CORS `*` is a static header,
    no credentials; Next owns `Cache-Control`; `Frrata-Api-Version`, nosniff. Every 404 entry it writes carries
    `skey:<hex>`.
  - **The dynamic tree** (`force-dynamic`, test keys; public search is ISR-cached, below): reads `Origin` and the client
    IP here only; CORS echoes the shop's `site_origin` or `^http://localhost(:\d{1,5})?$` exactly, never `null`,
    `Vary: Origin`; `private, no-store`.
  - Errors log `[api] <code> key=<keyId>` (never the key, never the path, never the raw error).
- **Limits** (`src/lib/db/rate-limit.ts` `LIMITS`, every call `failClosed = true`, a test that a database error gives
  429): `apiMissIp` (unknown keys per `ipBucket`, counted **after** a definer miss, never in front of a real read; a
  60 s in-memory memo of missed hashes answers repeats without the definer), `apiTestIp` (60 a minute), `apiSearchIp`, `apiKeyCreateShop` (10 an hour). `n` is 1–13 (600 ÷ 48) and a
  handle must match the handle shape before any read. **One Vercel WAF per-IP rule on the API host is required, not
  optional** (above; numbers and Vercel unit prices re-verified by `integration-researcher` and dated in
  `frata-integrations` before SA1 ships).
- **`last_seen`**: written inline during a regeneration (no shopper waits; `after()` does not run on a background
  regeneration, measured), skipped when the definer's cached row already says today (IST), through
  `src/lib/queries/storefront-api.ts` `markKeySeen(ctx)` in `withTenant(ctx.tenantId)` with `where id and tenant_id`.
- Verify: `npx vitest run src/lib/storefront-api` (two keys, two entries; kind/tree mismatch 404; one 404 body);
  `next start` proof script `scripts/verify/api-isr.mjs` (HIT on the second read; revoke → 404; test key never HIT).

### SA0·5 Gates, proof, documents
- `scripts/check-tenant.mjs` § API (`src/app/api/storefront/**`, `src/lib/storefront-api/**`,
  `src/lib/modules/*/api.ts`): every exported method (`GET`, `OPTIONS`, `POST`, default) is `apiRequest(…)` except the
  named `openapi.json` entry point; no `shopIdForHost`, `shopMovedTo`, `tenantForHost`, `requireMember`, `asMember`,
  `cookies()`, `headers()`, `params.tenant*`/`params.shop*`, `request.json()`; `headers.get(` only in `request.ts`;
  a loader's first argument is `ctx.tenantId`; `storefrontKeyFor` only in `request.ts`, `storefrontKeyRow` only in
  `queries/storefront.ts`, `app_storefront_key` only in `platform.ts` and migrations. Rules 6/6b's shopper list gains
  `storefront-api/` and `api/storefront/`. Run against ADR-0018 and the gate's own file.
- `scripts/check-api.mjs` (`npm run check:api`, in `npm test`): no `z.unknown|record|any|passthrough|catchall|loose`
  in `src/domains/storefront-api/**`; no cost sentinel name (`scripts/cost-sentinels.mjs`) in a mapper, schema or the
  generated `openapi.json`; files under `k/` export `revalidate = 3600` and never read `request.`, `headers()`,
  `cookies()`, `connection()` or import `preview*`; files under `t/` export `dynamic = 'force-dynamic'` and no
  `revalidate`; literal `2026-12/` folders; `generateStaticParams = () => []` on every dynamic segment.
- `scripts/check-actions.mjs`: `apiRequest` joins the chokepoints; `openapi.json` is a named entry point.
- Int test SA0 half (real Postgres): A's key resolves A only; revoked, expired, unknown, Website-on-Frrata, store-opened
  (test), partner-removed keys → one 404 body; two keys never share a cache entry.
- CLAUDE.md line verbatim (ADR-0018); `frata-architecture` § Tenancy (three sources, `apiRequest`, the two trees, the
  API host) and § Speed (API rows); ADR-0002 "amended by ADR-0018"; ADR-0018 § 5's "inside `withTenant`" read as
  "through the cached loaders keyed by `ctx.tenantId`" (a note on the ADR, owner told).
- Verify: `npm test`, `npm run typecheck`, `npm run verify:tenancy`, the int test, `scripts/verify/api-isr.mjs`.
  **SA0's proof = these green.** The orchestrator is told, so lane B's content resources may follow.

### SA1·1 Console › Settings › Website (as drawn)
- Page `src/app/(console)/console/settings/website/page.tsx`; reads in `src/lib/queries/website.ts` (`websitePage`):
  one `withTenant(…, { snapshot: true })`, `Promise.all` over `site_origin`/`site_domain_id`, the keys (name, kind,
  prefix, partner name, created_at, expires_at, revoked_at, last_seen_on), `hasOwnerIn`, `published_at`, reusing
  `shopDomainRows`/`mainDomainIn` from `queries/addresses.ts`. Settings list gains one row "Website" (value: the site's
  host in mono, or "Runs on Frrata"); the Accountant does not get the row or the page.
- Actions `website/actions.ts`: `asMember(CAN_BUILD, …)`, then `api.manage` read in the transaction, a support visit
  refused in words; each writes `audit_events` (`target` the key id or `website`, `detail` field names only).
  - `setWebsite({ runs, domainId? })`: the origin is built from the chosen live row (apex or `www.`+apex when
    `with_www`), never typed; confirm when going back to Frrata; purges `refreshKeys(t)` only (not the whole shop).
  - `createKey({ name, kind })`: Zod (1–40, trimmed, `looksLikeKey` refused); reads `shop_settings … for update` first,
    then the open check (test only while `published_at` is null) and the 20-live-keys count; `apiKeyCreateShop`; the key
    is returned **once** in the `ActionResult`, never in a URL, toast, log or later render.
  - `deleteKey({ id })` (the screen says Delete; the column stays `revoked_at`): `where id and tenant_id and revoked_at
    is null returning hash` → `refreshKey(hex)`.
  - `openShop` (`shop-actions.ts`) also calls `refreshKeys(t)` after commit (the definer already refuses test keys).
- Components (existing primitives): `PageHeader`, `Section`, the settings form's radio kind and `SaveBar` (one save),
  `Dialog` (a sheet on a phone), `Badge`, `Tag`, `CopyField` (the reveal), `FieldError`, `toast`. Nothing new.
- Verify: `npm test` (`check:actions`, `check:states`, `check:words`), the e2e flow, `mockup-parity-reviewer`.

### SA1·2 Mappers and schemas (pure)
- `src/domains/storefront-api/2026-12/schemas.ts` (closed objects; `availability.kind` and offer classes `z.enum`,
  documented as "unknown values may appear"; a new value is additive) and `map.ts` (`shopOut`, `cardOut`, `productOut`,
  `collectionOut`, `offerOut`) field by field from `StoreShop`, `StoreCard`, `StoreProduct`, `StoreCollection`; prices
  paise; a count only at ≤ `LOW_STOCK_AT`; images `{ base, widths, alt }` from Frrata's media host only; collections'
  product ids and a product's pairs filtered by `visibility()`; text plain. **URL-ish fields have closed shapes**: the
  Instagram handle `^[A-Za-z0-9._]{1,30}$` or null, WhatsApp digits only, every URL `https:` on an allowlisted host.
  `shop`'s site origin and checkout origin come from `site_origin` and `mainDomainIn` (named, read once).
- `openapi.json` from `toJSONSchema` (zod 4), ISR-cached, a named entry point with no key.
- Verify: `npx vitest run src/domains/storefront-api` (every cost field a sentinel never shows; `javascript:` never
  passes; `released-api.test.ts` structural snapshot).

### SA1·3 Route handlers
- `src/app/api/storefront/2026-12/k/[key]/{shop,products/page/[n],products/[handle],collections,collections/[handle]/page/[n],offers,search}/route.ts`
  (ISR: `revalidate = 3600`, `generateStaticParams = () => []`; freshness comes from tag purges, not the timer) and the same names under `t/[key]/` (dynamic), both
  calling one handler per resource.
- ISR tree reads only cached loaders, never inside a `withTenant`: `shopSettingsFor`, `shopCatalogue`, `shopProduct`
  (moved handle → 200 with the current `handle`), `collectionMembers`, `shopAnnouncement`; `visibility(…, ctx.now)`;
  `pageOf` (48), `total`, `truncated` at 600. **Search**: a slim `shopCached('search-v1', 'catalogue')` entry (handle,
  title, tags, price range, first photo) filtered in memory; public search is ISR-cached per `q` (normalised, 1–60
  chars) so repeats are CDN hits; test-key search is on the dynamic tree with `apiSearchIp`.
- **Time boundaries** (an offer starting or ending, a scheduled product going live) purge nothing today because shop
  pages refresh every 60 s; the API's hour needs them: the existing 5-minute `/api/cron/drain` calls a definer
  `app_shops_with_boundary(since, until)` (ids only, revoked from every role but `frata_app`, block 80) and runs
  `refreshShop(t, 'catalogue')` for each, through the `refreshSoldOut` limiter. Batch: ≤ 500 shops a run.
- Dynamic tree reads the uncached preview loaders (`previewShop`, `previewCatalogue`, `previewProduct`).
- Verify: int test SA1 half (A's key never reads B; B's handle under A's key is `not_found`; sentinels seeded in every
  cost column never appear; a draft never under a public key, does under a test key; a test-key response is
  `no-store` and a second read is not a HIT); `SPEED=1`: bytes at the 10× seed, and 75 parallel reads after a purge
  count `coreCatalogue` runs.

### SA1·4 Docs and skills
- New skill `frata-storefront-api` (one door, two trees, key shape, no tenant from the request, mappers, closed schemas,
  additive versions, purges by hash tag); `frata-planning` § 3 gains the **Storefront API** heading; new agent
  `api-contract-reviewer`. Version bumps.

### e2e `8x-storefront-api` (number at merge)
Owner → Settings › Website → Your own website with the seed shop's proved domain → Create key (Live) → the key shown
once, copied, closed, not shown again → reads through `node:http` with the API host's Host header (undici drops it):
`shop`, `products/page/1`, one product (no cost field) → Delete → the next read is 404 → staff sees View only, no Create
or Delete → a partner before handover makes a test key → phone width. Screenshots at 390 and 1280.

## Speed (speed review, measured on Next 15.5.29 and Postgres 16 at the 10× seed)
- A read route with `revalidate = 60` and empty `generateStaticParams` builds ● and the second read is a HIT;
  `revalidateTag` on a loader's tag or `skey:<hex>` turns the next read into a blocking MISS (measured).
- A regeneration: the key lookup (0 or 1 definer call, index scan, 0.027 ms) + the catalogue loader's 12 statements in
  one transaction (~70 ms; the slowest is the owed subquery on `order_lines` ⋈ `orders`, 54 ms) when its entry is cold;
  0 when warm. No loader inside a `withTenant` (P4). The Settings page: one transaction, 5 statements, the key list a
  bitmap scan (0.075 ms).
- Bytes: the catalogue entry 880 kB raw / 145 kB gz (nothing added); a page of 48 127 kB raw / 12.7 kB gz before
  mapping; one product ≈ 5 kB.
- Purges: every API entry carries `shop:<t>` (from the loaders) and `skey:<hex>`; a catalogue purge (≤ 1 per 30 s per
  shop) now also makes ≤ 1 regeneration per path per 60 s **per live key** (~75 hot paths a key); `setWebsite` and
  `openShop` purge only key tags.
- With `revalidate = 3600`, a regeneration happens on a purge or once an hour per path, not per minute.

## Unit economics (unit-economics review, 2026-11-15; scratch model, ₹88/$, ex GST; prices dated, some hypotheses)
- What Frrata pays a shop a month for API reads, typical traffic, at `revalidate` 60 s → 3,600 s with purges: Launch
  ₹62–503 → ₹34–168; Growth ₹499–3,563 → ₹278–918; Scale ₹1,412–8,853 → ₹868–2,412 (₹0.21–1.49 a delivered order). At
  60 s Growth and Scale fail rule 9a at the high end (3 × cost > the plan's price); at 3,600 s all pass. Hence the hour.
- **Abuse:** a forged request costs ₹0.0007–0.0012; the real risk is the $50 on-demand budget pausing production for
  every shop (3.6–6.1 M forged requests). Bounded by the WAF path rule (no function for a bad shape), the rate rule, the
  miss memo and limiter, and the kill-switch rule; an API-host alert at 3× a normal day.
- **Pricing:** reads are Core, in every plan, never metered (Shopify's Storefront API is free with the plan); a
  fair-use line per plan, measured and alerted, not billed. One live key per site is the recommendation (each key is
  its own set of cached copies).
- **Before SA1 ships:** a ₹70–120 preview test (100 k reads + 100 k unknown keys at the 10× seed; usage page:
  invocations, CPU, ISR units; `x-vercel-cache: HIT`).

## Security (security review folded in)
Test keys never ISR (own tree); minted keys stop at the edge (checksum) or at `apiMissIp`; every limit fails closed;
`createKey` locks `shop_settings` before its checks and the definer refuses test keys on an open store; the site origin
names a live proved row and only its apex or `www.`; `CAN_BUILD` + `api.manage`, support refused, the Accountant off the
page; merchant links and handles closed shapes; keys from `getRandomValues` by rejection sampling. **Correction:** a key
is in the URL path, so Vercel's request logs and Observability store it; our own logs never do. A public key is public
by design; a test key is to be treated as visible to anyone who sees the developer's browser.

## Tenancy (tenancy audit folded in)
The tenant comes only from the definer's row for the key's hash, inside `apiRequest`; the cache key and tag are the
hash's hex; every stop (revoked, expired, store opened, partner gone, domain removed, back to Frrata) is derived in the
definer; triggers touch only their tenant (block 80); `last_seen` writes through a queries reader in `withTenant`; cost
rules cover the API trees.

## Deviations (mockup element · what was built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| _(empty — the goal)_ | | | |

## Practices recorded in skills (same commit as each)
`frata-architecture` § Tenancy (three sources) and § Speed (API rows; "a route handler under ISR never reads the
request"; "an `unstable_cache` tag must be known before the call: tag by the input"); `frata-storefront-api` (new);
`frata-planning` § 3 Storefront API heading; `frata-gotchas`: `after()` does not run on a background regeneration.

## Repetitive work → agents and scripts
| Chore | Automated as |
|---|---|
| Every handler behind the door, two trees kept apart, schemas closed, no cost field | `check:api` |
| A version changed only additively | `released-api.test.ts` |
| ISR really caches and a revoke really purges | `scripts/verify/api-isr.mjs` |
| A diff changes the API contract | `api-contract-reviewer` agent |

## Shared files this lane touches (parallel-lanes rule 4)
`CLAUDE.md` (the one tenancy line); `.claude/skills/frata-architecture/SKILL.md`, `frata-planning/SKILL.md`,
`frata-gotchas/SKILL.md`; new `.claude/skills/frata-storefront-api/`, `.claude/agents/api-contract-reviewer.md`;
(`roles.ts` and `queries/settings.ts` are read only: `api.manage` is lane C's, `hasOwnerIn` lane B's); `next.config.ts` (rewrites); `src/middleware.ts` (the API branch); `src/domains/tenancy/host.ts` (+ tests);
`src/lib/db/schema.ts`; `src/lib/db/platform.ts`; `src/lib/queries/storefront.ts`; `src/lib/storefront/refresh.ts`;
`src/lib/db/rate-limit.ts` (`LIMITS`); `ops/firewall.json` (the API host's rules); `src/app/api/cron/drain/route.ts`
(the boundary purge); `src/lib/public-env.ts`; `.env.example`; `scripts/check-tenant.mjs`,
`scripts/check-actions.mjs`, new `scripts/check-api.mjs`; `package.json`; `scripts/verify/tenancy.sql` (block 80);
`src/app/(console)/console/settings/page.tsx` (one row); `src/app/(console)/console/shop-actions.ts` (`openShop`
purge); `docs/decisions/0002-*.md`, `0018-*.md` (notes); `docs/setup.md` (WAF step).
**Migrations:** `drizzle/01xx_storefront_keys.sql`, `drizzle/01xx_storefront_keys_access.sql` (+ journal, snapshot).
**Not touched:** lane C's partner definers and `members` (partner keys stop by derivation), the console layout and shell.
**After C and B are merged, this branch adds** `refreshKeys(t)` after commit to the partner-removal paths
(`removePartner`, `removePartnerPerson`, `admin_end_partner`) for each shop they touch, so a removed partner's keys stop
at once (orchestrator 2026-11-15); the int test asserts it.

## Release order and merges (orchestrator 2026-11-15)
Lane C (builders, capabilities) ships first, then lane B (content), then this lane. Before building past SA0·2 this
branch merges `main` with C's `api.manage` and B's `hasOwnerIn`; before release it merges both lanes' final state and
takes the next free migration and proof numbers.

## Owner decisions (2026-11-15, relayed by the orchestrator: "all recommended")
The final mockup https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm is **approved**.
1. **Scope: yes.** SA0 + SA1 now; the cart link, the 307s, the order source, starter/skill/docs, the handover key list
   and Frrata Admin › Storefront API move to SA1b.
2. **Words: yes.** "Website" for the brand's own coded site (glossary line added), "Delete" a key, kinds "Live" and
   "Test".
3. **Before a domain: keep as accepted.** Keys answer only once the Website points at a connected domain; revisit at
   the first partner site. No ADR change.
4. **A partner's keys follow the partner: yes.**
5. **The legal date: yes**, `integration-researcher` checks the gazette before SA1 ships.

Status: building. SA0 and the SA1 parts that need neither lane C's `api.manage` nor lane B's `hasOwnerIn` are built on
this branch first; SA1·1 (the Settings page and its actions) waits for C and B on `main`.

## Owner questions (as asked)
1. **Scope:** this lane builds SA0 + SA1 (catalogue reads and Settings › Website); the cart link, the 307s, "Your
   website" as a source, the starter, skill and docs, the Accept dialog's key list and Frrata Admin's page are SA1b,
   planned next. Yes or no.
2. **Words:** the screen says **Website** for the brand's own coded site (the glossary keeps "store" for what shoppers
   use; this needs a glossary line), and **Delete** a key rather than Revoke; key kinds read **Live** and **Test**. Yes
   or no.
3. **Building before a domain:** keys answer only once the shop's Website points at a connected domain, so a partner
   can't start a site before the brand connects one. Keep that (ADR-0018 as accepted), or let **test** keys answer
   before any domain, from localhost only (an ADR-0018 amendment)?
4. **A partner's keys follow the partner:** removed or suspended → its keys stop; reinstated → they answer again. Yes
   or no.
5. **The legal date:** the banner's "From 1 Jan 2027" rests on the spec's reading of the E-Commerce Rules 2026; the
   gazette is to be checked before SA1 ships (`integration-researcher`).
