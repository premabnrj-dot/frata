# ADR-0018: A storefront key is the third source of a tenant id

Status: **accepted** (owner, 2026-11-15: "all others approved": decisions 1–6 yes; the CLAUDE.md line lands with SA0, as written below) · amends ADR-0002 · Source:
`docs/specs/2026-11-11-storefront-api.md` § 2 (SA0) and § 3–6 · Pairs with: ADR-0014 (Consequences; amendment 8),
`docs/specs/2026-11-14-site-content-layer.md` (Storefront API additions, tenancy review), ADR-0007, ADR-0016 § 2

## Context
- Today a tenant id has two sources: `requireMember()` in the console and the storefront host
  (`tenantForHost`, `src/lib/db/platform.ts`). CLAUDE.md and `frata-architecture` § Tenancy say "only two sources".
  The one form-supplied exception is starting a support session (ADR-0007).
- ADR-0014 makes a shop's website code on the Storefront API. A site holds one read-only public key and no database
  access. The API answers on `api.frrata.shop`, under `/2026-12/k/<key>/…`, whatever host the site runs on, so neither
  of today's sources can name the shop. ADR-0014's Consequences already say ADR-0002 gains a third source, as SA0
  drafts it.
- The content-layer spec's tenancy review (2026-11-15) recorded two findings this record must carry: **SA0 lands
  before any content resource**, and **a preview token binds the tenant, the key id, the entry and ≤ 10 minutes**.
- Nothing of SA0 is built: no `storefront_keys` table, no `apiRequest`, no `check:api`.

## Decision (proposed)
1. **A third source.** On the API host only, the tenant id may come from a storefront key in the request path,
   resolved by `storefrontKeyFor(key)` in `src/lib/db/platform.ts` and nowhere else. The tenant is what the definer
   returns for the key's hash, never an id the request names.
2. **Key shapes.** `frs_pub_` (public) or `frs_test_` (test), then 32 random base62 characters, then a 6-character
   CRC32 checksum. Shape and checksum are checked in code before any database read; a bad shape is a 404 with no
   lookup. The shown prefix (kind + the first 6 random characters) is for display only, never a lookup or limit key.
   Stored is `sha256(key)`, unique across all shops; the key itself is shown once and never stored or logged (logs
   carry the key id). Private keys are SA2 and need this record amended.
3. **The table.** `storefront_keys` (tenant_id, id, kind `public|test`, name ≤ 40, hash bytea, prefix, created_by,
   created_at, expires_at, revoked_at, last_seen_version, last_seen_on). To `frata_app`: `select, insert` and
   `update (name, revoked_at, last_seen_version, last_seen_on)`; no delete; a trigger keeps `revoked_at` write-once;
   `revoke all … from anon, authenticated, service_role`; RLS with a `tenant_rows` policy and no null branch, in the
   same migration. `frata_admin` holds no grant on `hash`; Admin counts keys through an `app_admin_*` definer.
4. **The definer returns three columns and nothing else.** `app_storefront_key(p_hash bytea) returns table (key_id,
   tenant_id, kind)`: a live key (not revoked, not expired) of a shop whose site runs elsewhere
   (`shop_settings.site_origin is not null`). `security definer`, `set search_path = ''`, execute revoked from public,
   anon, authenticated and service_role, granted to `frata_app` only. Switching Website back to Frrata stops it
   answering at once.
5. **`apiRequest` is the only door** (`src/lib/storefront-api/`). It checks the shape, resolves the key, applies the
   limits, and hands the handler `ctx { tenantId, keyId, keyKind, version }`, with no Request object. Handlers read
   only through `src/lib/queries/` inside `withTenant(ctx.tenantId)` with the explicit `where`; they never open
   `withTenant` around a cached loader. Module resources go through `API_RESOURCES[name](ctx, params)`, with
   `moduleAccess` decided for `ctx.tenantId`; not usable is one `404 not_available`.
6. **Revocation.** Owners and admins (and a partner while the shop has never had an owner) create and revoke keys
   (`mayManageApi`, read inside the transaction; refused in a support visit); each create, revoke and Website change
   is an `audit_events` row. Test keys expire after 30 days and are all revoked when the shop opens. Removing a partner
   revokes its keys in the same step (ADR-0014 amendment 6). A revoked key stops within 60 s at most.
7. **Cache tags.** The key lookup is cached like `hostFacts`: `unstable_cache(['skey-v1', hash])`, tags `skey:<id>` and
   `shop:<tenant>`, revalidate 60, inside `cache()`; a miss is never cached. Every API response carries `shop:<tenant>`
   and `skey:<id>` (content adds `shop:<tenant>:<scope>`), so a revoke purges the lookup and the CDN copies by one tag,
   and today's `refreshShop` purges still reach the API.
8. **CORS.** GET only, with no custom header, so no preflight. Public keys answer `Access-Control-Allow-Origin: *`
   without credentials: the data is public, and CORS is not authentication. Test keys answer only the shop's site
   origin and `http://localhost:*`. The API host reads and sets no cookies.
9. **Rate limits.** One per-IP WAF rule on the API host. Search, test keys and preview tokens also pass the app's
   Postgres limiter (`ipBucket` per /64) after the key checks out; test keys at 60 a minute per IP. Limits never key
   on the shown prefix.
10. **What a key may read:** what the shop's own public pages show, and nothing more. Version `2026-12`: `shop` (with
    the legal block), `products/page/{n}`, `products/{handle}`, `collections`, `collections/{handle}/page/{n}`,
    `offers`, `search`; and the content resources of ADR-0014 amendment 8: `content`, `pages/{handle}`, `faq`, and
    `placements` at V2. Listed products only (`visibility()` per request); live content entries only, each with its
    `endsAt`; plain text; every response the output of its Zod schema's `parse()`, with no open schemas.
11. **What a key may never read or do:** orders, shoppers, customers, carts or checkout state; a merchant's costs
    (COGS, freight, fees, Frrata's fee: ADR-0003); drafts, future entries and `updated_by`; members, partners or
    staff; another shop's rows; and any write. A key is never a credential for the console, checkout, EkCode or Admin.
    The cart link is a URL, not a write.
12. **Preview.** A test key reads the uncached preview loaders. A content preview needs a signed token binding the
    tenant, the key id, the entry and ≤ 10 minutes; it is checked by the API, limited per `ipBucket`, served
    `no-store`, never ISR or `shopCached`.
13. **Keys are never in code.** The fleet injects each site's own public key per deployment; no fleet-wide key exists;
    the publish gate refuses `frs_pub_` and `frs_test_` strings in source (ADR-0016 § 2; kit spec § 6).
14. **Order.** SA0 (this record, the table, the definer, `apiRequest`, the gates and the proof) lands before any SA1
    resource and before any content resource.

## Gates and proof
- **`check:tenant` gains a rule for API files** (`src/app/api/storefront/**`, `src/lib/storefront-api/**`,
  `src/lib/modules/*/api.ts`): a handler not wrapped in `apiRequest` fails; a tenant or shop id read from params,
  search params, a body or a header fails; a call to `storefrontKeyFor` outside `apiRequest`, or to
  `app_storefront_key` outside `platform.ts`, fails. The rule is run against this record and the gate's own file
  (CLAUDE.md: a gate must not match its own documentation).
- **`check:api`**: every handler through `apiRequest`; no `z.unknown`, `record`, `passthrough` or `catchall` in output
  schemas; cost sentinels from `scripts/cost-sentinels.mjs`; ISR config on read routes, absent on search and preview.
- **`scripts/verify/tenancy.sql`**, in the next free blocks (79 onward today; the API spec's "63+" predates later
  blocks): `storefront_keys` with no tenant set reads 0 rows; A sees only A; insert with B's tenant raises; update of
  B's row changes 0; updating `hash`, `tenant_id` or `kind`, or a delete, raises insufficient_privilege; `revoked_at`
  is write-once; policies are non-null. The definer: A's live key returns A; revoked, expired, unknown and
  Website-on-Frrata keys return 0 rows; the result is exactly three columns; `prosecdef` and `search_path` set; public,
  anon, authenticated, service_role and `frata_admin` cannot execute it; `frata_admin` cannot read `hash`.
- **Tests:** `storefront-api.int.test.ts` (A's key never reads B; B's handle is "not found" under A's key; sentinel
  grep over every response); the e2e flow `70-storefront-api`.

## The CLAUDE.md line (owner's to approve; not edited by this record)
Today: "The tenant id comes from `requireMember()` or the storefront host — never from a URL, a form or a body (one
named exception: starting a support session, ADR-0007)."

Proposed:
> The tenant id comes from `requireMember()`, the storefront host, or a storefront key resolved by
> `storefrontKeyFor()` inside `apiRequest()` on the API host (ADR-0018) — never from an id in a URL, a form or a body
> (one named exception: starting a support session, ADR-0007). A key reads only what the shop's public pages show.

`frata-architecture` § Tenancy changes "the only two sources" to three in the same SA0 commit.

## Consequences
- ADR-0002's two locks are unchanged: the key only chooses the tenant; RLS and the explicit `where` still hold.
- One new table, one definer, one helper, two gate rules and a proof block. A leak now needs a forged key to pass the
  checksum, the hash lookup and the definer, and a handler to escape `apiRequest`.
- Public data becomes readable by anyone holding a shop's public key, which is the point. Scraping is bounded by the
  CDN and the per-IP rule.

## Owner decisions
1. Accept the storefront key as the third source of a tenant id? Yes or no.
2. Approve the CLAUDE.md line above as written? Yes or no.
3. Public keys answer any website (`*`), since they read only public data, rather than only the shop's own site?
   Yes or no.
4. Test keys last 30 days and all end when the shop opens? Yes or no.
5. A partner may create and revoke keys only while the shop has never had an owner; after that, owners and admins
   only? Yes or no.
6. No content (announcements, pages, FAQ) over the API until SA0 has passed its proof? Yes or no.

## Notes as built (V1 SA0, 2026-11-15; plan docs/plans/2026-11-15-v1-storefront-api.md)
- § 3: the hash is stored as sha256 **lowercase hex** (`text`, CHECK `^[0-9a-f]{64}$`), the same form as the cache key
  and tag; `revoked_by` sits beside `revoked_at` (both written once). § 4: the definer returns four columns (adds
  `expires_at`, checked again on each cached use) and derives every stop: a test key once the store **ever** opened
  (`tenants.first_opened_at`), a key made by a partner whose link to the shop is gone or who is suspended (owner
  decision 4, 2026-11-15), and a Website whose `site_domain_id` row is not live.
- § 5: handlers read through the shop's cached loaders keyed by `ctx.tenantId` (each opens its own `withTenant`), never a
  `withTenant` around a loader. § 7: the lookup is tagged `skey:<hex>`, not `skey:<id>` (a tag must be known before the
  call); a delete purges that tag. § 9: limits per network fail closed (`apiMissIp`, `apiTestIp`, `apiSearchIp`,
  `apiKeyCreateShop`); the WAF path and rate rules are on the API host.
- § 2 "logs carry the key id": our logs do; a key is in the URL path, so Vercel's request logs hold it. A live key is
  public by design; a test key is visible to anyone who sees the developer's browser.


## Amendment (SA1b, owner 2026-11-15; plan docs/plans/2026-11-16-sa1b.md)
- **§ 11 "drafts" → "drafts, except under § 12's token".** A key never reads a hidden page or the FAQ's draft on its
  own. With a preview token the console signed for that store, that key and that one entry, it reads it for at most
  10 minutes: `/2026-12/k/<key>/preview/{pages/<handle>,faq}`, either key kind (a store that has opened has no test key
  left), the token in the `Frrata-Preview` header (never the URL, so never a request log), the store and key bound
  inside the MAC (never in clear), `private, no-store`, no CORS, its own per-network limit, the key looked up uncached.
  The secret is `STOREFRONT_PREVIEW_SECRET`, Production only; without it nothing is signed or accepted.
- **§ 10 grows additively:** `facets` and `filter/page/{n}` (D2), and `shop.cart` (the bag link). A filter's grammar
  error is a `400 {"error":"bad_filter","param"}` after the key checks out: the one answer that is not the 404.
- **§ 6:** removing a partner purges its keys through the drain's key-stop sweep; so does reinstating one (its audit
  row), so a reinstated partner's site reads again within minutes.

## Amendment (test keys before a domain, owner 2026-11-16)
The owner: "partners should be able to create a website without adding custom domain" (choosing option B for the first
site). **§ 4 and § 5 change for test keys only:** a test key answers while the store has **no Website set**, on a store
that has never opened, so a site is built from localhost or a preview before the brand owns or connects a domain.
Unchanged: a public key needs the Website on a live connected domain (going live still needs one); a test key stops for
good once the store opens, after 30 days, on deletion, and with its partner's link or suspension; CORS for a test key
is still localhost or the Website's origin (a server-side render sends no Origin). **§ 4's "switching Website back to
Frrata stops it at once" now holds by deleting:** Run on Frrata deletes the store's test keys (audited); a domain
removed or parked clears the Website (0142), after which a test key on a store never opened answers again, so Settings ›
Website lists the store's keys whenever it has any (security review 2026-11-16). The Accept screen lists keys with no
Website too. Migration `0149_test_keys_before_domain`; proof in `tenancy.sql` § 81 and § 86.

## Amendment (build keys, owner 2026-11-16: "approve all"; Studio spec § 5 and decisions 10–11; Studio plan V0·3 and G·2)
Studio's agent and a partner's developer must read a store's drafts without ever holding a key: a vault fills a header
or a body, never a URL path. So a third key kind.
1. **Shape and table.** `frs_build_`, then § 2's 32 base62 characters and checksum. Kind `build` in `storefront_keys`,
   with a CHECK on its end, its maker and its purpose: `session` (a Studio session, 24 hours, made at its start and
   deleted at its end), `preview` (one key per preview deployment, Preview environment only, deleted with the preview,
   ≤ 30 days) or `developer` (a partner's CLI, 24 hours, through the device sign-in: `requireCapability`, a passkey check
   in the last 5 minutes, a single-use code good for 10 minutes bound to the device and the site). Production holds the
   public key only. Stored as its hash only (§ 2).
2. **One minting path**, `mintBuildKey`, inside the store's tenant: a person holding `api.manage`, or a partner under
   point 7; audited; limited per store. No inbound endpoint hands out keys: the plain key goes once into the session's
   vault, the preview's sensitive variable or the developer's CLI.
3. **Header only, one dynamic tree.** The key travels in the `Frrata-Key` header, to its own route folder `h/`:
   dynamic, `private, no-store`, `Vary: Frrata-Key`; `check:api` refuses `revalidate` and `generateStaticParams` there;
   `apiRewrites` sends any request carrying `Frrata-Key` to `h/` only and never matches a header-tree path to a cached
   route. **No CORS headers at all** (§ 8 does not apply): it is read from a server only. The API never echoes a request
   header. The starter sends the header only with `FRRATA_KEY_MODE=header`.
4. **What it reads:** what a test key reads, drafts included (§ 11's "drafts" gains this kind beside § 12's token).
   Never orders, shoppers, carts, costs, members or a write (§ 11 otherwise unchanged).
5. **Looked up uncached** (`storefrontKeyNow`, as preview tokens are), never through the live keys' one-hour cache
   (`src/lib/queries/storefront-keys.ts`) or `refreshKeys`, so a deleted key stops at once. Expired build keys are
   deleted daily. The draft data behind it is one raw entry per store, cached 15 s per store (never per key, never shared
   with `k/`), tagged with the store's catalogue and content tags and purged on every Apply.
6. **Limits** (§ 9 amended for test and build keys): per key only, 300 reads a minute a build key, failing closed,
   because every session and preview leaves from shared addresses. Misses (an unknown, deleted or dead key) are counted
   per network and per key hash. Live keys keep today's per-network limits.
7. **After the store opens** (decision 5 amended): `app_storefront_key` answers a build key only while its `partner_id`
   is set, its maker is live (`app_pm_live`), still holds a `members` row on that store and, for a Lead or a Builder, is
   assigned to it. Unassigning or removing the person ends their keys at once. Before opening a build key answers as a
   test key does (the test-key amendment above).
8. **The owner sees and deletes them.** Settings › Website lists every build key with its maker and its end; the owner
   or a Manager deletes one there. A kill switch, removing a partner or a person (ADR-0014 amendment 6), and a stopped
   session delete their build keys.
9. **Proof:** `scripts/verify/tenancy.sql` § 81 grows (a removed or unassigned maker's key stops; a build key on
   another store reads nothing); `catalogue-size.int.test.ts` gains the raw draft entry.

### CLAUDE.md line, for the owner's yes
Not edited by this record; the CLAUDE.md edit is the owner's.

Today: "A key reads only what the shop's public pages show."

Proposed:
> A key reads only what the shop's public pages show; a build key (ADR-0018) also reads the shop's drafts, from a
> server only, and after the shop opens only while the partner person who made it is live, still a member of the shop
> and, for a Lead or a Builder, assigned to it.
