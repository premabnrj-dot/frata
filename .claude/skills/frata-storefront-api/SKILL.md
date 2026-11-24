---
name: frata-storefront-api
description: Use when adding or changing anything the Storefront API answers (api.frrata.shop, src/app/api/storefront, src/lib/storefront-api, src/domains/storefront-api), a storefront key, a module's API resource, the API host's routing, caching or firewall, or a field a partner's website reads - to keep the one door, the two trees, closed schemas, no merchant cost, additive versions and purges by tag.
metadata:
  version: 2.8.1
  owner: owner
  verified: 2026-11-22
  decisions: [ADR-0002, ADR-0003, ADR-0014, ADR-0018]
---

# Frrata Storefront API

A brand's own website reads its store through this API with one public key; checkout, payment and personal data stay
on Frrata's host (ADR-0014). Spec `docs/specs/2026-11-11-storefront-api.md`; plan
`docs/plans/2026-11-15-v1-storefront-api.md` (as built); mockup https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm.

## The rules

1. **One door.** Every route is `export const GET = apiRequest({ version, tree, mode, resource, schema, params?, limit?,
   run })` (`src/lib/storefront-api/request.ts`). The shop comes ONLY from the key (in the path; a build key in the
   `Frrata-Key` header, rule 2), through
   `storefrontKeyFor` (`src/lib/queries/storefront-keys.ts`) → `storefrontKeyRow` (`src/lib/db/platform.ts`) → the
   definer `app_storefront_key`. `run` gets `ctx` (shop, key, kind, version, now) and its parsed path params, never the
   Request; params naming a shop are refused. `check:tenant` § 9 and `check:actions` hold it. `openapi.json` and the docs
   (`/docs…`, `/llms.txt`, static pages at the internal `/api-docs`, reached only through `apiRewrites`; `/` redirects to
   `/docs`) are the keyless entry points.
2. **Two trees, never mixed.** next.config's `apiRewrites` (never the middleware: a middleware rewrite uncaches a route,
   and the matcher skips versioned paths so a CDN hit costs no middleware run) send `frs_test_` keys to `t/` (dynamic:
   drafts through the preview loaders (the shop through its purged 60 s settings entry), the catalogue from the shared 15 s draft entry (`draftCatalogue`), `private, no-store`, CORS only to the shop's website or `http://localhost:<port>`)
   and `frs_pub_` keys to `k/` (cached copies, `revalidate = 3600`, `generateStaticParams = () => []`). **A cached route
   never reads the request** (a header read is a runtime error, and anything per caller would be served to everyone):
   CORS there is a static `*`. Search is the one dynamic live route (varies by `q`; `public, s-maxage=60`). `check:api`
   holds it; `scripts/verify/api-isr.mjs` proves it under `next start`. **The third tree, `h/`** (G·2; ADR-0018's
   build-key amendment): a `frs_build_` key in the `Frrata-Key` header, never a path. The first versioned rewrite sends
   ANY request carrying the header to `h/` (keyless paths, `/<v>/<resource>`), and every other versioned rewrite has
   `missing: [header]`, so it never reaches a cached route (`host.test.ts`). `tree: 'header'`, dynamic, `private,
   no-store`, `Vary: Frrata-Key`, **no CORS header at all** (read from a server only), the key looked up uncached
   (`storefrontKeyNow`), limited per key (`apiTestKey`), drafts included (`resources.ts`: the one raw draft catalogue per
   store, `draftCatalogue`, 15 s, catalogue tags; pages and FAQ as they stand, hidden ones too). Minted ONLY by
   `mintBuildKey` (`src/lib/storefront-api/build-keys.ts`, inside the store's tenant transaction, `api.manage`, audited,
   `apiBuildKeyShop` checked first by `buildKeyLimitOk`, outside the transaction, at most 50 live a store), deleted daily once ended (`app_delete_ended_build_keys`, the daily cron).
   The starter sends the header only with `FRRATA_KEY_MODE=header`.
3. **Every refusal is one 404 body** (one exception: a filter's grammar error, `400 {"error":"bad_filter","param"}`,
   after the key checks out, through `BadParam`) (`{"error":"not_found"}`): bad shape, unknown, deleted, expired, wrong tree, a
   product of another shop, a draft under a live key. Limits fail closed (`apiMissIp` and `apiMissKey`: misses per
   network and per key hash; `apiTestKey`: test and build keys per key only, never per network, G·1; `apiSearchIp`: a
   live key's search; `apiKeyCreateShop`), with the WAF path rule and rate rule in front (`ops/firewall.json`, held by `waf.test.ts`).
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
   `site_domain_id` row is not live; a build key after opening unless a partner's, and a partner person's build key once
   that person leaves the partner, loses the store's members row or (a Lead or a Builder) its assignment
   (`app_build_key_maker_live`, called only inside the definers; Settings › Website reads the same answer through
   `app_build_key_makers`). Opening refuses (the setup card's **Open store**, then the **Open your store?** popup's
   **Open store**) while a store never opened has a Test or Build key that still answers and no Website
   (D0·3: `app_store_building_keys`, the same rules, in `openShop`'s first select; `websiteBlocksOpening` beside
   `setupSteps`). Proof: `scripts/verify/tenancy.sql` § 81.
9. **Keys are never stored, shown twice or logged by us.** Stored is the sha256 hex; the key is in the create action's
   reply once; our logs carry the key id. (Vercel's request logs hold the path: a live key is public by design.)

10. **Previews (ADR-0018 § 12, SA1b).** A hidden page or the FAQ's draft opens only at `…/k/<key>/preview/…` (mode
   `'preview'` in either tree: its own branch, `private, no-store`, no CORS, `apiPreviewIp`, the key looked up uncached
   by `storefrontKeyNow`) with a token in the `Frrata-Preview` header: `v1.<{e,x}>.<mac>`, the store and key inside the
   MAC (`src/lib/storefront-api/preview-token.ts`), ≤ 10 minutes, one entry. Signed only by Content's
   `previewOnWebsiteAction`. `check:api` holds the preview routes; `STOREFRONT_PREVIEW_SECRET` unset = none.
11. **The bag link is a frozen grammar** (`src/domains/storefront-api/cart-link.ts`): `<checkoutOrigin>/cart?l=<size
   id>:<qty>,…`, the quote's limits (20 lines, 10 a line, lowered not refused), `code` and `utm_*` beside it. Anything
   new is a new parameter. The page (`s/[host]/(cart)/cart`) fills the shopper's own bag by `fillMode`
   (`src/domains/checkout/bag-fill.ts`): replace when the bag is empty, the referrer is the site, or only bag links filled
   it (the `frrata.bag.by.v1` marker, every bag writer naming its kind); else join, so no other site empties a bag the
   shopper built on the store's pages. It marks `via_site`, opens checkout. The starter's copy is generated
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

15. **G·4 (2026-11-22), additive on `2026-12`:** `shop.mediaOrigin` (Frrata's media store); `collection.image` (the
   store tiles' own cover rule, `collectionCover` in `src/domains/storefront/sources.ts`; the list's covers in one pass,
   `collectionCovers`); `product.collection` (the
   first collection, in the store's order, holding it); `jsonLd` on shop, product and a collection page: the store
   pages' own builders (`src/domains/seo/defaults.ts`) on `websiteOrigin(site, checkout)`
   (`src/domains/storefront-api/origin.ts`, the one rule P5·2 moves behind `app_website_of`), serialised with every `<`
   escaped (`structured.ts`). The product and collection routes read `apiShop` too, so their copies carry `settings`.
   G14 (a compliance certificate as a policy kind) waits: Frrata holds no such record.

16. **G·3 (2026-11-22), a developer's device sign-in** (four screens § 2, owner-approved; ADR-0018 build-key amendment,
   "As built (G·3 page)"): the CLI POSTs `/api/dev/device/start` (a store slug; no shop read, the same answer for any
   slug, `deviceStartIp`) and gets a device secret, an 8-character code, `verify` (Partner workspace › Developer,
   `DEVICE_VERIFY_PATH`) and `message` (the terminal's words, `DEVICE_TERMINAL`); only sha256s are stored in
   `build_key_device_codes` (the secret, the code and the network's /64 or /24; no grant to any role; the
   `app_device_code_*` definers, `src/lib/db/device-codes.ts`), for 10 minutes. The person at the terminal confirms
   their OWN code on the partner page: `checkDeviceCode` (the store, when and from which network it started, room,
   a passkey; `deviceCheckPerson`) and Give key (`giveOptions`/`giveVerify`: the shared passkey ceremony over a store
   bound to that code, `deviceGivePerson`; while passkeys are off from Admin, `giveOff` with no passkey, drizzle/0171); the definers allow a Partner owner or an assigned Lead of the store's
   partner only (never the store's own people, a Builder or a support visit) and approve with the store's audit row
   under the ceiling. `/api/dev/device/poll` (per network, then per device) claims a confirmed code ONCE and mints
   through `mintBuildKey` as that person (developer, 24 hours, named "<email>’s computer"); a mint that fails for a
   passing reason gives it back (409 `full` for the ceiling, 429 `busy` otherwise), a refusal keeps it spent. Your
   computers (`app_partner_developer_keys`, `…_key_delete`) lists and deletes the person's own developer keys.

## A change, step by step
- A new field: add it to the schema (optional is additive), map it field by field, run
  `npx vitest run src/domains/storefront-api` (the snapshot passes only if it grew), `npm run check:api`, and the
  `api-contract-reviewer` agent.
- A new resource: a mapper and schema in the domain, a function in `resources.ts`, a route in `k/` and `t/` (generated
  shape: see an existing one), a WAF path in `ops/firewall.json` (the test fails until it is there), a line in
  `openapi.ts`.
- A module's resource: through `API_RESOURCES` (spec § 5, not built yet: the first module that offers one builds it).
