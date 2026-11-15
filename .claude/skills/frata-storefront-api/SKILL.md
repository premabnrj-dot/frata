---
name: frata-storefront-api
description: Use when adding or changing anything the Storefront API answers (api.frrata.shop, src/app/api/storefront, src/lib/storefront-api, src/domains/storefront-api), a storefront key, a module's API resource, the API host's routing, caching or firewall, or a field a partner's website reads - to keep the one door, the two trees, closed schemas, no merchant cost, additive versions and purges by tag.
metadata:
  version: 1.1.0
  verified: 2026-11-15
  decisions: [ADR-0002, ADR-0003, ADR-0014, ADR-0018]
---

# Frrata Storefront API

A brand's own website reads its store through this API with one public key; checkout, payment and personal data stay
on Frrata's host (ADR-0014). Spec `docs/specs/2026-11-11-storefront-api.md`; plan
`docs/plans/2026-11-15-v1-storefront-api.md` (as built); mockup https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm.

## The rules

1. **One door.** Every route is `export const GET = apiRequest({ version, tree, mode, resource, schema, params?, limit?,
   run })` (`src/lib/storefront-api/request.ts`). The shop comes ONLY from the key in the path, through
   `storefrontKeyFor` (`src/lib/queries/storefront-keys.ts`) → `storefrontKeyRow` (`src/lib/db/platform.ts`) → the
   definer `app_storefront_key`. `run` gets `ctx` (shop, key, kind, version, now) and its parsed path params, never the
   Request; params naming a shop are refused. `check:tenant` § 9 and `check:actions` hold it. `openapi.json` is the one
   keyless entry point.
2. **Two trees, never mixed.** next.config's `apiRewrites` (never the middleware: a middleware rewrite uncaches a route,
   and the matcher skips versioned paths so a CDN hit costs no middleware run) send `frs_test_` keys to `t/` (dynamic:
   drafts through the preview loaders, `private, no-store`, CORS only to the shop's website or `http://localhost:<port>`)
   and `frs_pub_` keys to `k/` (cached copies, `revalidate = 3600`, `generateStaticParams = () => []`). **A cached route
   never reads the request** (a header read is a runtime error, and anything per caller would be served to everyone):
   CORS there is a static `*`. Search is the one dynamic live route (varies by `q`; `public, s-maxage=60`). `check:api`
   holds it; `scripts/verify/api-isr.mjs` proves it under `next start`.
3. **Every refusal is one 404 body** (`{"error":"not_found"}`): bad shape, unknown, deleted, expired, wrong tree, a
   product of another shop, a draft under a live key. Limits fail closed (`apiMissIp`, `apiTestIp`, `apiSearchIp`,
   `apiKeyCreateShop`), with the WAF path rule and rate rule in front (`ops/firewall.json`, held by `waf.test.ts`).
4. **Answers are closed.** Output schemas in `src/domains/storefront-api/<version>/schemas.ts` use `z.strictObject` and
   named fields only (no `object`, `record`, `unknown`, `any`, `passthrough`, `catchall`, `loose`: `check:api`). Pure
   mappers (`map.ts`) build each field from the shop's cached reads; nothing is spread from a row. The answer is
   `schema.parse(result)`.
5. **What a key may read is what the shop's pages show** (ADR-0018 § 10–11): listed products only (`isListed` per
   request), their pairs and collection members filtered the same way; never orders, shoppers, carts, drafts (live key),
   costs (ADR-0003: cost sentinels are grepped in the API's files, the answers and `openapi.json`), members or another
   shop's rows. Text is plain text; photos only from Frrata's media store under the shop's own folder; links closed
   (Instagram handle shape, WhatsApp digits).
6. **A released version only grows** (`released-api.test.ts` against `__tests__/released/<version>.json`): a new
   optional field or enum value passes; a removal, rename, narrowing or a field turning optional is a new dated version
   (`API_VERSIONS`, `src/domains/storefront-api/versions.ts`), kept ≥ 12 months after its successor.
7. **Freshness is by purge, not the clock.** The key lookup is cached and tagged by the key's sha256 hex
   (`skey:<hex>`: an `unstable_cache` tag must be known before the call), with the routes' own hour. **A cached route
   takes the shortest period of every cache it reads** (measured under `next start`, 2026-11-15): the live tree reads
   only the `api*` loaders (`apiShop`, `apiCatalogue`, `apiProduct`, `apiAnnouncement` in `src/lib/queries/storefront.ts`:
   the shop's reads with `revalidate: 3600`, the same tags), never the 60 s `shop*` ones. `PERIOD=1
   node scripts/verify/api-isr.mjs` proves a copy is still a HIT 65 s later. Every copy carries `shop:<tenant>` (from the loaders) and `skey:<hex>`. A catalogue
   change purges through today's `refreshShop`/`refreshSoldOut`; a key deleted → `refreshKey(hex)`; any stop the definer
   derives (the store opens, the Website moves or its domain goes, a partner is removed) → `refreshKeys(tenant)`; a
   scheduled moment (a drop, an offer starting or ending) → the 5-minute drain's `app_shops_with_boundary` sweep.
8. **Every stop is the definer's**, never a stored flag: deleted (`revoked_at`), expired, a test key once the store ever
   opened (`tenants.first_opened_at`), a key a partner made once its link is gone or it is suspended, a Website whose
   `site_domain_id` row is not live. Proof: `scripts/verify/tenancy.sql` § 81.
9. **Keys are never stored, shown twice or logged by us.** Stored is the sha256 hex; the key is in the create action's
   reply once; our logs carry the key id. (Vercel's request logs hold the path: a live key is public by design.)

## A change, step by step
- A new field: add it to the schema (optional is additive), map it field by field, run
  `npx vitest run src/domains/storefront-api` (the snapshot passes only if it grew), `npm run check:api`, and the
  `api-contract-reviewer` agent.
- A new resource: a mapper and schema in the domain, a function in `resources.ts`, a route in `k/` and `t/` (generated
  shape: see an existing one), a WAF path in `ops/firewall.json` (the test fails until it is there), a line in
  `openapi.ts`.
- A module's resource: through `API_RESOURCES` (spec § 5, not built yet: the first module that offers one builds it).
