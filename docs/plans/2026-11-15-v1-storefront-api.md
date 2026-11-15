# V1 · Storefront API — SA0 (keys, the third tenant source) and SA1 (catalogue reads)
Status: plan, reviews folded in, awaiting the owner's approval of the final mockup · Date: 2026-11-15 · Lane A
(`docs/plans/2026-11-15-parallel-lanes.md`), branch `claude/lane-a-storefront-api`
Spec: `docs/specs/2026-11-11-storefront-api.md` (§ 1–3, 6–7, 9) · Decisions: ADR-0018 (accepted 2026-11-15, decisions
1–6 yes), ADR-0014 (and amendment 8), ADR-0002, ADR-0003 · Content: `docs/specs/2026-11-14-site-content-layer.md`
§ Storefront API additions, § API gaps for SA1 · Earlier mockup: https://claude.ai/artifact/SKpPx1rfBu48w18HMNUK7u (v2,
2026-11-11) · **Final mockup (this phase):** _link added on publish_ · Approved: —

## Goal
North star (5) a premium storefront built as code by developers, partners or the agent (partners first), and the
ADR-0014 path: no code site can exist until a key names its shop and the API serves its catalogue. Measures: SA0 —
`verify:tenancy` block passes, `check:tenant` API rule and `check:api` green and run against their own docs; SA1 — a
partner reads a shop's whole listed catalogue with one public key, **zero** cross-shop reads and **zero** cost fields
in any response (int test sentinel grep), a page of 48 ≤ 150 kB raw, a CDN hit on the second read. Spec § Goal's
90-day measures (≥ 3 partner sites) start at SA1b, when the cart link lands.

## Scope
**SA0 (no screen; lands and passes its proof before any resource):**
1. `api` route kind on `NEXT_PUBLIC_API_HOST` (`api.frrata.shop`); only `/2026-12/…` answers there; `/api/storefront`
   is 404 on every other host; no cookies read or set on the API host.
2. Key format (pure): `frs_pub_` | `frs_test_` + 32 base62 + 6-char CRC32 checksum; shape and checksum before any read.
3. Migration: `storefront_keys` (ADR-0018 § 3), `shop_settings.site_origin` (nullable; written only by SA1·1's Website
   action), the definer `app_storefront_key`, the `revoked_at` write-once trigger, two revoke triggers (below), RLS,
   grants, `frata_admin` none. Tenancy proof block.
4. `storefrontKeyFor(key)` in `src/lib/db/platform.ts` (cached like `hostFacts`), `apiRequest()` in
   `src/lib/storefront-api/request.ts`, `API_VERSIONS`.
5. Gates: `check:tenant` § API rule; new `check:api`; host tests; `storefront-api.int.test.ts` (SA0 half).
6. **CLAUDE.md** tenancy line exactly as ADR-0018 § "The CLAUDE.md line" (owner approved, decision 2) and
   `frata-architecture` § Tenancy "only two sources" → three, in the SA0 commit.

**SA1 (catalogue reads + the console screen):**
1. Console › Settings › **Website and API** (`/console/settings/website`): Website (Runs on Frrata / Runs elsewhere,
   address from a proved domain), Checkout (read-only: the Main address and its Razorpay chip, a link to Store address),
   Keys (Create, shown once, Revoke), Developer kit (the OpenAPI address only — the docs site, starter and skill don't
   exist yet and are not drawn).
2. Resources, version `2026-12`: `shop` (with the legal block), `products/page/{n}`, `products/{handle}`,
   `collections`, `collections/{handle}/page/{n}`, `offers`, `search?q=`, and `openapi.json`.
3. `released-api.test.ts` (structural old ⊆ new), mapper tests, int test SA1 half, e2e `8x-storefront-api` (number
   taken at merge; `70-` is used).

**Not in this lane (SA1b, its own plan; owner question 1):** the cart link `/cart?l=`, the shop pages' 307 to the site
origin, `classifySource`'s "Your website" rule, the starter repo, the partner skill and docs site, the Accept dialog's
key list, Admin › Storefront API, D2 filters and D3 past 600 (content spec § API gaps). **Content resources**
(`content`, `pages/{handle}`, `faq`) wait for SA0's proof and lane B's read seam (ADR-0018 decision 14, owner decision
6): coordinated through the orchestrator, not built here.

## Regression net first (owner rule 5)
Before any change, run and keep green: e2e `01-signup`, `05-shop-look` (pixel), `13-paging`, the settings flows
(`release:check` lists them for `src/middleware.ts`, `host.ts` and settings), `host.test.ts`, `catalogue-size.int.test.ts`.
New tests land with each task, never after.

## Tasks

### SA0·1 Host and route kind
- `src/domains/tenancy/host.ts`: `Surface` and `Route` gain `{ kind: 'api' }` when the host equals `apiHost`
  (lower-cased, exact; no `www.`); on it only `^/\d{4}-\d{2}/` answers, everything else `not_found`. `/api/storefront`
  and `/api/storefront/*` on any other host → `not_found` (like `/api/ek`). `shopRewrites` excludes the API host in
  its `missing` list. `NEXT_PUBLIC_API_HOST` read once in `src/lib/public-env.ts`, named in `.env.example`; unset →
  no host matches (the kind never fires).
- `src/middleware.ts`: the `api` branch rewrites `/<version>/…` to `/api/storefront/<version>/…`, runs no Supabase
  client, sets no cookie, adds no nonce CSP; keeps nosniff and HSTS from `next.config.ts`.
- Verify: `npx vitest run src/domains/tenancy` (both directions: API paths 404 on console, shop and EkCode hosts; shop
  and console paths 404 on the API host; a mixed-case and a trailing-dot host).

### SA0·2 The key (pure)
- `src/domains/storefront-api/keys.ts`: `KEY_KINDS = ['public','test']`, `keyShape(s) → { kind, body } | null`
  (regex `^frs_(pub|test)_[0-9A-Za-z]{32}[0-9A-Za-z]{6}$`, then CRC32 of `prefix+body` in base62, constant time compare
  not needed: it is not a secret), `shownPrefix(key)` (kind + 6 body chars), `newKey(kind, random)` (random passed in:
  the domain does no I/O), `mayManageApi(role, hasOwner)` (owner, admin; partner only while `hasOwner` false),
  `TEST_KEY_DAYS = 30`, `MAX_LIVE_KEYS = 20`, `KEY_NAME_MAX = 40`.
- Verify: `npx vitest run src/domains/storefront-api` (a flipped character fails the checksum; 31 and 33 chars fail;
  `frs_live_` fails; `mayManageApi` table incl. staff, accountant, partner with and without owner).

### SA0·3 Migration `drizzle/01xx_storefront_keys.sql` (+ `_access.sql`, `--custom`; renumbered at merge)
- Schema in `src/lib/db/schema.ts` (`storefrontKeys`; `shopSettings.siteOrigin`). Columns as ADR-0018 § 3; `hash
  bytea not null unique`; `kind text check in ('public','test')`; `name` 1–40 chars CHECK; `prefix` CHECK shape;
  index `(tenant_id, created_at desc)`; `expires_at` CHECK (`kind = 'test') = (expires_at is not null)`.
- `site_origin text` CHECK `^https://[a-z0-9.-]+$` (no path, no port, lower case). Its domain check (on a proved
  `shop_domains` row's apex) is in the action; a trigger `app_site_origin_proved` refuses a value whose host is not
  on a live proved apex of the same tenant (defence in depth; the action's words come first).
- Grants exactly ADR-0018 § 3; `revoke all … from public, anon, authenticated, service_role`; RLS; `tenant_rows`
  policy, no null branch; no `frata_admin` grant. Trigger `app_storefront_key_revoked_once` (BEFORE UPDATE: an
  existing `revoked_at` never changes).
- `app_storefront_key(p_hash bytea)` as spec § 2 (three columns; `security definer`, `search_path ''`, revoked from
  public, anon, authenticated, service_role; granted to `frata_app` only). It is the one platform read with no tenant
  set, so it filters by the hash's unique index (EXPLAIN in the proof).
- **Revoke triggers** (ADR-0018 § 6, keep lane C's definers untouched): (a) AFTER UPDATE OF `published_at` on the
  shop's row, null → not null: revoke every live `test` key of that tenant; (b) AFTER DELETE on `members` where
  `role = 'partner'`: revoke live keys of that tenant `created_by` that user. Both `security definer`, `search_path ''`,
  revoked from every role (a trigger function needs no execute grant).
- `scripts/verify/tenancy.sql` block **80** (next free; renumbered at merge): ADR-0018 § Gates and proof, every line,
  plus: the two revoke triggers fire and touch only their tenant; `site_origin` on another shop's apex raises.
- Verify: `npm run db:generate` clean; `npm run verify:tenancy` (throwaway Postgres, frata-verify); `npm run check:tenant`.

### SA0·4 Lookup and the one door
- `storefrontKeyFor(key)` (`src/lib/db/platform.ts`): `keyShape` first (null → null, no read); `sha256` → definer;
  wrapped `cache(unstable_cache(['skey-v1', hash], …, { tags: ['skey:<id>', 'shop:<tenant>'], revalidate: 60 }))`; a
  miss throws inside the inner function so nothing is cached for it (the `hostFacts` pattern), caught outside.
- `src/lib/storefront-api/request.ts`: `apiRequest(version, handler, opts)` returns a route handler. Order: version in
  `API_VERSIONS` (else 404 `unknown_version`) → key shape → `storefrontKeyFor` (else 404 `not_found`, the same body for
  bad shape, unknown, revoked, expired and Website-on-Frrata) → for search, test keys and (later) preview: the
  Postgres limiter by `ipBucket` (fail closed: 429) → `handler(ctx)` with `ctx = { tenantId, keyId, keyKind,
  version, now }` and parsed params only (never the `Request`) → the body is `schema.parse(result)` → headers:
  `Frrata-Api-Version`, `Cache-Control` (read routes `public, s-maxage=60, stale-while-revalidate=300`; test keys,
  search: `private, no-store`), CORS (public `*`, no credentials; test: the shop's `site_origin` or
  `http://localhost:<port>` echoed, `Vary: Origin`), `X-Content-Type-Options: nosniff`, no `Set-Cookie`. Errors log
  `[api] <code> key=<keyId>` (never the key, never the raw error).
- `last_seen_version` / `last_seen_on`: written at most once per key per IST day, after the response (`after()`),
  through a guarded update (`where last_seen_on is distinct from today`).
- Verify: `npx vitest run src/lib/storefront-api` (a handler receives no Request; every failure is the one 404 body);
  int test SA0 half below.

### SA0·5 Gates, proof, documents
- `scripts/check-tenant.mjs` § API (files `src/app/api/storefront/**`, `src/lib/storefront-api/**`,
  `src/lib/modules/*/api.ts`): every exported `GET` is `apiRequest(…)`; no `params.tenant*`, `searchParams.get('shop'|
  'tenant')`, `request.json()`, `headers.get(` in handlers; `storefrontKeyFor` only in `request.ts`;
  `app_storefront_key` only in `platform.ts` and migrations. Run against ADR-0018 and the gate's own file.
- `scripts/check-api.mjs` (`npm run check:api`, in `npm test`): the chokepoint; no `z.unknown`, `z.record`,
  `.passthrough`, `.catchall`, `z.any`, `.loose` in `src/domains/storefront-api/**/schemas*.ts`; no cost sentinel name
  (`scripts/cost-sentinels.mjs`) in a mapper or schema; read routes export `revalidate = 60`, search does not.
- `storefront-api.int.test.ts` (real Postgres): A's key resolves A only; revoked, expired, unknown, Website-on-Frrata
  keys → 404 with one body; a test key after opening is revoked by the trigger; a removed partner's key stops.
- CLAUDE.md line (verbatim, ADR-0018) and `frata-architecture` § Tenancy (three sources, `apiRequest`, the API host);
  ADR-0002 gets a one-line "amended by ADR-0018".
- Verify: `npm test`, `npm run typecheck`, `npm run verify:tenancy`, `npx vitest run --project int storefront-api`.
  **SA0's proof = these green; SA1 starts only after.** The orchestrator is told, so lane B's content resources can
  follow (ADR-0018 decision 14).

### SA1·1 Console › Settings › Website and API (as drawn)
- Page `src/app/(console)/console/settings/website/page.tsx`, one `withTenant(…, { snapshot: true })` reading in
  `Promise.all`: `site_origin`, live proved domains (`host`, `apex`, `main_at`, `razorpay_ok_at`), keys (name, kind,
  prefix, created_by's display, created_at, expires_at, revoked_at), `hasOwner`, `published_at`. Settings index gains
  one Row "Website and API" (summary "Runs on Frrata" / the site address).
- Actions `website/actions.ts`, all `asMember(ANY_MEMBER, …)` then `mayManageApi(role, hasOwner)` read in the
  transaction, refused in a support visit (in words), each writing an `audit_events` row (`actor_kind 'member'`,
  `target` the key id or `website`, `detail` field names only):
  - `setWebsite({ runs: 'frrata' | 'elsewhere', origin? })`: origin must be `https://` + a live proved host of this
    shop (www. allowed when `with_www`); refuses otherwise in words; purges `skey:*` of this shop's keys and
    `shop:<t>` (the definer's join changes).
  - `createKey({ name, kind })`: Zod (`name` 1–40, trimmed); test only while `published_at` is null; ≤ 20 live keys;
    ≤ 10 creates an hour a shop (Postgres limiter, fail closed); returns the key **once** in the `ActionResult` (never in
    a URL, a toast, a log or the page's later renders).
  - `revokeKey({ id })`: `where id and tenant_id and revoked_at is null`; purges `skey:<id>`.
- Components as drawn: `ActionForm`, the design-language primitives (Card, RadioCard, Select, Chip, Dialog/Sheet,
  Toast); the key reveal is a client island receiving the key from the action result only; Copy uses the clipboard.
- Verify: `npm test` (`check:actions`, `check:states`, `check:words`), the e2e flow (below), `mockup-parity-reviewer`.

### SA1·2 Mappers and schemas (pure)
- `src/domains/storefront-api/2026-12/` : `schemas.ts` (Zod output per resource, closed objects; open enums such as
  `availability.kind` and offer classes are `z.enum([...])` in our output, documented to partners as "unknown values
  may appear", and a new value is an additive change `released-api.test.ts` allows), `map.ts` (`shopOut`, `cardOut`, `productOut`, `collectionOut`, `offerOut`) field by field from
  `StoreShop`, `StoreCard`, `StoreProduct`, `StoreCollection`; prices paise; availability count only at ≤ 3; images
  `{ base, widths, alt }` from Frrata's media host only; text plain (merchant HTML stripped by the existing policy text
  helpers, never passed through).
- `toJSONSchema` (zod 4) → `openapi.json` built at request time from the schemas, cached like a read route.
- Verify: `npx vitest run src/domains/storefront-api` (each mapper on fixtures; a fixture with every cost field set to a
  sentinel never shows one; `released-api.test.ts` snapshot of the structure).

### SA1·3 Route handlers
- `src/app/api/storefront/[version]/k/[key]/…/route.ts`: `shop`, `products/page/[n]`, `products/[handle]`,
  `collections`, `collections/[handle]/page/[n]`, `offers`, `search`, and `src/app/api/storefront/[version]/openapi.json`.
  Each `export const revalidate = 60` (search: `dynamic = 'force-dynamic'`), `generateStaticParams` empty.
- Reads only through existing cached loaders, never inside a `withTenant`: `shopSettingsFor`, `shopCatalogue`,
  `shopProduct` (moved handle → 200 with the current `handle`), `collectionMembers`, `shopAnnouncement`; listed only
  via `visibility(status, publishAt, ctx.now)` per request; paging `pageOf` (48), `total`, `truncated` at 600.
  Search: `q` 1–60 chars, filters the cached entry in memory, ≤ 48 results, the IP limit.
- Test keys read the uncached preview loaders (`previewShop`, `previewCatalogue`, `previewProduct`), `no-store`.
- Verify: int test SA1 half (A's key never reads B; B's handle under A's key is `not_found`; every response grepped for
  the sentinels seeded in every cost column; a draft never appears under a public key, does under a test key),
  `SPEED=1` bytes at the 10× seed, e2e.

### SA1·4 Docs and skills
- New skill `frata-storefront-api` (the rules of this plan: one door, key shape, no tenant from the request, mappers,
  closed schemas, additive versions, purges by tag); `frata-planning` § 3 gains the **Storefront API** heading (spec
  § Guardrails); `frata-architecture` § Speed table gains the API rows. Version bumps.
- Verify: `npm test`; words-reviewer on the diff.

### e2e `8x-storefront-api` (number at merge)
Owner signs in → Settings › Website and API → Runs elsewhere with the seed shop's proved domain → Create key (public)
→ the key shown once, copied, closed, not shown again → `GET` with a Host header of the API host: `shop`,
`products/page/1`, one product (200, no cost field) → Revoke → within the test's purge the next read is 404 → a staff
member sees View only, no Create or Revoke → phone width. Screenshots at 390 and 1280.

## Speed (spec § Performance at the 10× seed; folded from speed-reviewer)
- Statements: a cached read route runs **0** on a CDN hit; on a regeneration, the key lookup (cached 60 s: 0 or 1
  definer call, 0.03 ms) plus the loaders' own cached entries (0 when warm). No route opens a `withTenant` around a
  loader (P4). The Settings page: one transaction, 5 statements in `Promise.all`.
- EXPLAIN: `app_storefront_key` by `storefront_keys_hash_unique` (index scan); the page's key list by
  `(tenant_id, created_at desc)`. No query on `orders`.
- Bytes: products page of 48 ≈ 125 kB raw / 13 kB gz; one product ≈ 5 kB; `shop` ≈ 3 kB; nothing added to the cached
  catalogue entry (926 kB of 1 MB headroom: a field that grows it is a finding).
- Tags: every API response carries `shop:<t>` and `skey:<id>`; today's `refreshShop` / `refreshSoldOut` reach it; a
  revoke purges one `skey:<id>`; `setWebsite` purges `shop:<t>` (rare, owner-driven).
- First-load JS: the settings page adds the reveal/copy island only (< 3 kB gz).
- Cost: reads are CDN hits; regenerations ≤ 1 per path per 60 s per key; one WAF per-IP rule on the API host is an
  owner step in `docs/setup.md` (numbers re-verified by `integration-researcher` before SA1 ships: the 2026-11-11 facts
  are dated, < 90 days).

## Security (folded from security-reviewer)
- Who: create/revoke/Website = `mayManageApi` inside the transaction; staff, Accountant, support = read only (no
  buttons, and the actions refuse). Row: every write matches `id` and `tenant_id`. Zod caps on name, kind, origin.
- The key: shown once in the action reply, never logged (`[api] … key=<keyId>`), never in a URL of the console, never
  stored; hash `sha256`; a key-shaped string is refused in the merchant-visible `name` (so a pasted key never lands in
  a stored field).
- API host: no cookies, no Supabase client, no CSP nonce; responses JSON with nosniff; CORS public `*` without
  credentials, test origin-bound; GET only (`OPTIONS` answers 204 with the same CORS, no preflight needed).
- Merchant text in responses is plain text; HTML in policy bodies is never passed through.
- Limits: key create 10 an hour a shop; search and test keys by `ipBucket` (/64), failing closed.
- Open redirect: none in SA0/SA1 (the 307s are SA1b).

## Tenancy (folded from tenancy-auditor)
- The tenant comes only from the definer's row for the key's hash, inside `apiRequest`; handlers get `ctx.tenantId`.
- The definer returns three columns; `frata_admin` cannot execute it or read `hash`.
- Cached lookup keyed by the hash (never the shown prefix); a miss is not cached; tags include the tenant.
- Preview loaders under a test key are uncached (no cross-key entry). Shared caches (`shopCatalogue`) are keyed by
  tenant already.
- Triggers revoke only rows of the triggering tenant (proved in block 80).

## Deviations (mockup element · what was built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| _(empty — the goal)_ | | | |

## Practices recorded in skills (same commit as each)
- `frata-architecture` § Tenancy: three sources; § Speed: API rows. `frata-storefront-api` (new). `frata-planning`
  § 3: Storefront API heading.

## Repetitive work → agents and scripts
| Chore | Automated as |
|---|---|
| Is every API handler behind the door, schemas closed, no cost field? | `check:api` (script) |
| Did a version change only additively? | `released-api.test.ts` |
| Did a diff change the API contract (fields, enums, docs)? | `api-contract-reviewer` agent (spec § Guardrails), SA1·4 |

## Shared files this lane touches (parallel-lanes rule 4)
`CLAUDE.md` (the one tenancy line), `.claude/skills/frata-architecture/SKILL.md`, `.claude/skills/frata-planning/SKILL.md`,
new `.claude/skills/frata-storefront-api/`, new `.claude/agents/api-contract-reviewer.md`, `src/middleware.ts`,
`src/domains/tenancy/host.ts` (+ tests), `next.config.ts` (only if `shopRewrites`' call needs the API host),
`src/lib/db/schema.ts`, `src/lib/db/platform.ts`, `src/lib/public-env.ts`, `.env.example`, `scripts/check-tenant.mjs`,
new `scripts/check-api.mjs`, `package.json` (`check:api` in `npm test`), `scripts/verify/tenancy.sql` (block 80),
`src/app/(console)/console/settings/page.tsx` (one Row), `docs/decisions/0002-tenant-isolation.md` (one line).
**Migrations:** `drizzle/01xx_storefront_keys.sql`, `drizzle/01xx_storefront_keys_access.sql` (+ journal, snapshot).
Not touched: `src/domains/tenancy/roles.ts` (`mayManageApi` lives in the API domain), the partner definers (triggers
instead), the console layout and shell.

## Owner questions
1. **Scope split:** this lane builds SA0 + SA1 as catalogue reads and the Website and API screen; the cart link, the
   shop's 307s to the site, "Your website" as a source, the starter, skill and docs, the Accept dialog's key list and
   Admin › Storefront API become **SA1b**, planned next. Yes or no.
2. **Test keys are drawn but can be made only before the store opens** (after opening the choice is disabled with
   "Only before the store opens"). Yes or no.
