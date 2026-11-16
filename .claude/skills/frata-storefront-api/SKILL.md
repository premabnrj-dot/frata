---
name: frata-storefront-api
description: Use when adding or changing anything the Storefront API answers (api.frrata.shop, src/app/api/storefront, src/lib/storefront-api, src/domains/storefront-api), a storefront key, a module's API resource, the API host's routing, caching or firewall, or a field a partner's website reads - to keep the one door, the two trees, closed schemas, no merchant cost, additive versions and purges by tag.
metadata:
  version: 1.4.0
  owner: owner
  verified: 2026-11-16
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
   Request; params naming a shop are refused. `check:tenant` § 9 and `check:actions` hold it. `openapi.json` and the docs
   (`/docs…`, `/llms.txt`, static pages at the internal `/api-docs`, reached only through `apiRewrites`; `/` redirects to
   `/docs`) are the keyless entry points.
2. **Two trees, never mixed.** next.config's `apiRewrites` (never the middleware: a middleware rewrite uncaches a route,
   and the matcher skips versioned paths so a CDN hit costs no middleware run) send `frs_test_` keys to `t/` (dynamic:
   drafts through the preview loaders, `private, no-store`, CORS only to the shop's website or `http://localhost:<port>`)
   and `frs_pub_` keys to `k/` (cached copies, `revalidate = 3600`, `generateStaticParams = () => []`). **A cached route
   never reads the request** (a header read is a runtime error, and anything per caller would be served to everyone):
   CORS there is a static `*`. Search is the one dynamic live route (varies by `q`; `public, s-maxage=60`). `check:api`
   holds it; `scripts/verify/api-isr.mjs` proves it under `next start`.
3. **Every refusal is one 404 body** (one exception: a filter's grammar error, `400 {"error":"bad_filter","param"}`,
   after the key checks out, through `BadParam`) (`{"error":"not_found"}`): bad shape, unknown, deleted, expired, wrong tree, a
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
   (Instagram handle shape, WhatsApp digits; a menu, bar, button or text link only on the store's own paths,
   `SHOP_PATH`). Content and pages are what a shopper sees: `resolvePage` in **shop** mode (never a sample or an
   example), live bars only (`writtenOrder`), a later bar never (each carries `endsAt`).
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
   derives (the store opens, the Website moves, Settings › People removes the partner) → `refreshKeys(tenant)` (a Website
   move also `refreshShop(tenant, 'settings')`: the `shop:<t>:settings` tag holds `siteOrigin` in `apiShop`); a
   scheduled moment (a drop, an offer starting or ending) → the 5-minute drain's `app_shops_with_boundary` sweep; a stop
   with no write a console action sees (a partner's link ending, Frrata suspending a partner, a domain going, Admin's
   included) → the drain's `app_shops_with_key_stop` (shop ids only: **Admin never reads a key or its hash**); store
   content (a bar starting, a save B's throttle left to the backstop) → the drain's `app_shops_with_content_change`; a
   connected domain gone while it was the Website → `app_shops_with_domain_gone` (purges `settings`). Every sweep pages
   by shop id (`p_after`, `SWEEP_PAGE` 500; `pagedSweep` stops at its deadline and the next run resumes).
   The live tree reads content through `apiContent` (`src/lib/queries/content.ts`, lane B's seam, the hour) and pages
   through `shopPages` (a day, tag `pages`: a longer period doesn't shorten the hour).
8. **Every stop is the definer's**, never a stored flag: deleted (`revoked_at`), expired, a test key once the store ever
   opened (`tenants.first_opened_at`), a key a partner made once its link is gone or it is suspended, a Website whose
   `site_domain_id` row is not live. Proof: `scripts/verify/tenancy.sql` § 81.
9. **Keys are never stored, shown twice or logged by us.** Stored is the sha256 hex; the key is in the create action's
   reply once; our logs carry the key id. (Vercel's request logs hold the path: a live key is public by design.)

10. **Previews (ADR-0018 § 12, SA1b).** A hidden page or the FAQ's draft opens only at `…/k/<key>/preview/…` (mode
   `'preview'` in either tree: its own branch, `private, no-store`, no CORS, `apiPreviewIp`, the key looked up uncached
   by `storefrontKeyNow`) with a token in the `Frrata-Preview` header: `v1.<{e,x}>.<mac>`, the store and key inside the
   MAC (`src/lib/storefront-api/preview-token.ts`), ≤ 10 minutes, one entry. Signed only by Content's
   `previewOnWebsiteAction`. `check:api` holds the preview routes; `STOREFRONT_PREVIEW_SECRET` unset = none.
11. **The bag link is a frozen grammar** (`src/domains/storefront-api/cart-link.ts`): `<checkoutOrigin>/cart?l=<size
   id>:<qty>,…`, the quote's limits (20 lines, 10 a line, lowered not refused), `code` and `utm_*` beside it. Anything
   new is a new parameter. The page (`s/[host]/(cart)/cart`) fills the shopper's own bag (replace when the referrer is
   the site or the bag is empty, else merge), marks `via_site`, opens checkout. The starter's copy is generated
   (`node scripts/kit-sync.mjs`) and held equal by a test.
12. **Filters (D2):** `facets` (cached) and `filter/page/{n}` (dynamic like search) over the same capped, listed set,
   cards from `cardOut` only; one URL per filter (fixed parameter order, defaults left out); a value the store doesn't
   have now is an empty page, never an error. No slim index: a card needs the catalogue entry (owner, 2026-11-15).
13. **The kit** lives in `kit/starter` (outside the root's typecheck; its own Next app on the root's install). Its key
   is server only; its build fails on any `frs_` in `.next/static`. e2e `92-storefront-sale` builds it and reads the
   store through the API host. The partner skill is `kit/starter/.claude/skills/frrata-site/SKILL.md`.
14. **`shop.brand`** (one-address P1·6, 2026-11-16): the code-site store's brand record, additive on `2026-12`, null for
   a theme shop. The live tree reads `apiBrand` (the API's hour, tag `settings`), the test tree `previewBrand` (uncached);
   never the 60 s `shopBrand`. The mapper gets a named pick of the live record (`BrandIn`): never `previous`, who saved,
   or a waiting change; a test pins its keys. Logo files only from the shop's folder, described "through `<img>` only";
   `shop.logo` stays raster (an SVG main logo answers its PNG rendition). A season still to come is never answered; a
   live one is applied to `colours` and carries `until`; its start and end purge `settings` through the boundary sweep.

## A change, step by step
- A new field: add it to the schema (optional is additive), map it field by field, run
  `npx vitest run src/domains/storefront-api` (the snapshot passes only if it grew), `npm run check:api`, and the
  `api-contract-reviewer` agent.
- A new resource: a mapper and schema in the domain, a function in `resources.ts`, a route in `k/` and `t/` (generated
  shape: see an existing one), a WAF path in `ops/firewall.json` (the test fails until it is there), a line in
  `openapi.ts`.
- A module's resource: through `API_RESOURCES` (spec § 5, not built yet: the first module that offers one builds it).
