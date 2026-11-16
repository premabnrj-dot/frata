# frata-architecture — Modules, themes and shop websites as code

Part of `frata-architecture` (SKILL.md holds the rules every change obeys: layers, tenancy, auth, actions, the outside world). These sections are moved here unchanged (practices plan G4).

## Contents

- Modules
- Themes
- Shop websites as code: kit and fleet rules

## Modules (M2 foundation, 2026-11-07, `check:modules`)

Spec: `docs/specs/2026-11-07-modules-foundation.md`. A module is a feature a
shop can have or not (Messages, RTO Shield, Reviews…).

- **One registry**: `src/domains/modules/registry.ts` (`MODULE_KEYS`, `MODULES`).
  Billing `core | plan | add_on`; `status: 'next'` until it is built. Plan
  features are `PLAN_GRANTABLE` (the plan_versions CHECK is generated from it).
  A module's own page is its `setup` (`/console/apps/<module>`); while the module is on and usable it is listed
  under Apps in the console nav (`src/app/(console)/console/layout.tsx`, foldable; icons `src/components/modules/icons.ts`).
- **"Usable" is decided once**: `moduleAccess(facts, now)` in
  `src/domains/modules/access.ts` (granted by core, plan, add-on or trial;
  switched on; not paused; dependencies usable). Badges and buttons come from
  `offerFor()` (the gallery card's footer, state and filter, the price box and the ONE action: switch, needs, ask,
  plans, interest). Never test a plan feature or an add-on row anywhere else.
- **A money read outside Plan and billing** (Apps A2): it runs inside the page's one transaction (`featuredBillWith`
  in `appsPage`), refuses outside CAN_MANAGE itself (`mayReadMoney`) and on a support visit, fails closed, and its
  importer is named in `scripts/check-billing-read.mjs` with the reason. Type imports count: take a type from the
  caller's return, never from `@/lib/queries/billing`.
- **Every app has a page** (Apps gallery, 2026-11-11): `/console/apps/[app]` renders `AppAbout` (features drawn from
  `src/domains/modules/showcase.ts`, no screenshots); an app with a home of its own is a static folder that renders the
  same `AppAbout` while not usable (static folders win over `[app]`; `app-pages.test.ts` holds it). The gallery and an
  app's page read `appsPage()`: facts, add-on prices and the member's "Tell me when it's ready" rows in ONE
  transaction. `app_interest` is the member's own (session user id, never a support visit); Admin reads it only
  through `app_admin_interest`.
- **Facts**: `shopModules(tenantId, atIso)` (`src/lib/queries/modules.ts`),
  cached per request. Admin reads the same facts through `merchantModules()`
  (`src/lib/admin/modules.ts`) and still derives through `moduleAccess()`.
- **Tables**: `tenant_modules` (the merchant's switch; app inserts and closes),
  `tenant_addons` (app reads; admin inserts and may only set `ends_at`; the shop writes ONLY through the A3 definers
  `app_start_addon_trial` / `app_end_addon_trial` / `app_stop_addon` in `drizzle/0114_addon_trials_access.sql`:
  shop from `app_current_tenant()`, the caller an owner or admin, price the newest and the one shown, times from
  `now()`; `by_shop` marks a self-serve trial and its paid row, one trial per shop and add-on ever), `addon_prices`
  (versions; `(id, module)` keyed so a row's price is its own add-on's), `module_pauses` (platform-wide; one open per
  module). Turn off on a paid add-on stops it (`app_stop_addon`: works to the month's end, never billed after); in the
  shop's own trial it ends both rows. Proof: tenancy checks 29 and 73.
- **A module's server action** goes through `asModule(module, roles, what, work)`
  (a chokepoint in `check:actions`): it refuses in words, then runs as `asMember`.
- **A module's outbox kinds** are listed in its `outboxKinds`. The cron asks
  `outboxDecision()`: paused → the row waits (`deferRow`); off or not granted →
  `markDead`. Switching a module off cancels its queued rows (`cancelQueued`).
- **A module that calls the outside world** (Meta, Shiprocket) asks `moduleGate(module, roles)` first, calls out
  with no transaction open, then writes through `asModule` (which asks again). Example: `connectWhatsAppAction`.
- **One webhook URL per provider for every shop** (`/api/webhooks/whatsapp`): each item is routed by its own
  account id through a definer (`app_tenant_for_wa`, open rows only, digits only), stored one row per item under
  `whatsapp:<tenant>:<id>:<field>:<item>[:<status>]` (`src/domains/communication/webhook.ts`). An item for no
  open connection is not stored.
- **Core never imports a module.** A module's code lives in
  `src/domains/<key>/`, `src/lib/modules/<key>/` (its tables too: `src/lib/modules/reviews/schema.ts`, listed in
  `drizzle.config.ts`), `src/components/modules/<key>/`, `src/app/(console)/console/apps/<key>/`, its shopper API
  `src/app/api/shop/<key>/` and its shop pages in the `src/app/s/[host]/(<key>)/` group; core reaches it only through
  the hooks `check:modules` lists: `<ModuleSlot>` / `<Slot name="order.side" | "home.tile" | "checkout.identity">` (`src/components/modules/slots.tsx`),
  the product page's `productExtras` (`src/components/modules/storefront.tsx`: what goes under a product and its
  rating, from one read; the rating is the markup's `aggregateRating`), the `SENDERS` map (`src/lib/outbox/drain.ts`),
  the console layout, the webhooks. Add a filler, not an import to a core page.
  In the shop's client checkout a module talks through `src/components/storefront/module-events.ts` only: it fills the
  form with a `shop:prefill` event, hears the placed order's address on `shop:placed`, and names the arm it showed in
  sessionStorage `shop:arm:<key>` (EkCode P1).
- **An add-on sold only on some plans** says so in the registry (`addOnFor`, Reviews: Growth and Scale). Off those
  plans an add-on or trial row grants nothing (`addOnAllowed`), Admin offers no trial, and the bill drops it; a plan
  that includes the module stops the add-on's bill too (`addOnBillable`, from the plan at the month's start).
- **A module's cached shop reads** use `moduleCached` (`src/lib/queries/storefront.ts`, still the one wrapper:
  check:tenant 6d) with a scope: `'reviews'` (shop-wide, tag `shop:<t>:reviews`) or `'reviews:product'` (first
  argument the product id, tag `shop:<t>:reviews:<product>`). `refreshReviews(tenant, product, shopWide)` purges:
  a shopper's published review its product only; an owner's action both.
- **One product's cached entry** (`shopProductRow`) uses `shopCached` scope `'catalogue:product'`: tags
  `shop:<t>:catalogue` and `shop:<t>:product:<handle>`. `refreshProduct(tenant, handle)` purges that product only
  (product video, PV·1); a catalogue change still purges them all.
- **Videos** (`videos`, V1) carry `use` (`loop` | `product`), set at insert and never updated (drizzle/0090). Every
  read filters by use: the Look never reads, cancels or releases a product's video. A product's link is
  `product_videos` (one per product, tenant in every key). `mux.rendition.create` (outbox) adds its 720p after the
  checks; the Product video module's `outboxKinds` cancels it when the module is turned off.

## Themes (T0–T3 built 2026-11-08; spec docs/specs/2026-11-08-themes.md, plan docs/plans/2026-11-08-themes.md)

**New values on shared settings (theme Signal, 2026-11-09).** A new value of a setting every theme shares (a card, a
header, a section layout or scheme) ships with a base choice list equal to TODAY's values (`BASE_CHOICES`,
`allowed.productLayouts`, `allowed.sectionSchemes`), so only the theme that lists it can render it; the resolved-looks
snapshot (`__tests__/resolved-looks.test.ts`) fails if any released theme's output moves. A scheme derived from the
merchant's colour (`signal`) is computed at render (`schemeVars`) from the FINAL accent, never stored in a style.
Samples follow what the shop sells (`sampleSetFor`), only in preview routes; every sample file is credited
(`public/themes/samples/CREDITS.json`, `check:credits`). The storefront budget gate sums the layouts above a page.

**A new option on a released version is a new version (Signal 1.1, 1.2, 1.3):** a released manifest never changes
(`released-manifests` snapshot); an optional field (`video`, `script`, `layout: 'spotlight'`) keeps older looks
byte-identical, and resolve drops it where the theme doesn't offer it (`allowed.videoSections`, `imageTextLayouts`,
`heroScript`, `scale`, `productStories`/`pairWith` → `ResolvedTheme.product`). **Section schemas are lenient** (a blank one parses, so autosave never fails); whether it
shows is readiness's, non-blocking for "empty (hidden)". **Two stylesheets (S2-0):** `src/app/shop.css` (Tailwind from
the shop's sources only + `base.css`) is the root's; every non-shop entry adds `globals.css` (the full app sheet)
after it. A class a shop page uses from outside the shop's folders must be added to `shop.css`'s `@source` list;
`check-storefront-build` fails a shop page that loads the app sheet.

- A shop's look is **data over one section library**: `src/domains/themes/` (types, `resolveTheme` — the ONE merge
  of manifest → style → the merchant's layer — `contrast`, section SAVE schemas, `readinessOf`, `carryOver`,
  `baselineRevision`) and `src/components/storefront/sections/` (server components). Rendering reads
  only `ResolvedTheme`; settings reach CSS as `--store-*` custom properties and `data-*` attributes on the shell.
- **Manifests may be authored data (ADR-0012, Theme Studio TS0a).** A manifest from a file or a row is one object:
  `ManifestSchema` (`manifest-schema.ts`: colours exactly `#RRGGBB`, every token a closed choice, photos only from
  Frrata's samples; every code manifest parses to itself) and `themeCheck` (`check.ts`, the one check: vitest for code,
  the studio for data). **Every reader takes a `ManifestSource`** (`source.ts`: `keys()`, `versions(key)`; pure
  `manifestOf(src,…)`/`manifestNear(src,…)`), from `manifestsFor(tenantId)` (`src/lib/themes/manifests.ts`, `cache()`d)
  read **before any transaction** and passed down. Shop pages use `shopTheme(shop)` (`page-look.ts`, once per request).
  Only `source.ts`, Admin's code-version pages and tests read `CATALOGUE` (`check:layers`). Classic 1.0.0 always comes
  from code. **The shop's look cache** (`look-v2`, tag `shop:<t>:look`) holds the publish candidates (one DISTINCT ON
  query, `publishCandidates`, also the console's rule) and the newest body; other bodies are cached by revision id;
  withdrawn versions are a `string[]`. Publish and Undo purge `shop:<t>:look`, never the catalogue. `look.ts` runs inside
  `asMember`: never a cached loader or a second `withTenant` there (`look-p4.test.ts`).
- **Blocks and designs (Theme Studio TS0b; plan `docs/plans/2026-11-11-theme-studio-ts0b.md`).** A theme's `designs`
  are trees of blocks (`blocks.ts`: explicit three levels, design › columns › group › leaf, never `z.lazy`); the owner's
  section `{ key: 'design', design, fill }` fills the blocks the theme marks, **by stable block id, with kind-tagged
  fills** (`FillSchema`, a discriminated union; the record keyed by the id regex, reserved ids refused, read with
  `Object.hasOwn`). `SectionSchema` stays manifest-free; **`resolveDesign(design, fill, 'shop' | 'preview')`** merges,
  and on the shop never yields a theme's sample photo or an `example` (a claim the owner must write: readiness blocks
  Publish). `ResolvedTheme.home` keeps stored shapes; `ResolvedTheme.designs` holds only the designs in use. The save
  (`saveLookAction`) runs `designProblems` after the manifest is read, prunes fills to (id, kind), and refuses a layer
  over 60 kB of JSON bytes in words. `cleanImages` maps every fill by kind (`satisfies never`). A design carries over
  only within its theme (`carryOver`), else a `lost` line names it. Blocks render in
  `src/components/storefront/blocks/` (server only; `check:tenant` 6e: no loader or db import), styled by `.store-b-*`
  rules (≤ 1.0 kB gz, `check-storefront-build`). The tree walk (`design-tree.ts`) has no Zod, for the customizer's
  bundle (gated at 208 kB).
- **Commerce, video and date blocks (TS1b).** A product grid (4 pieces from a `SourceSchema` source; the theme's default
  never a collection), a featured product, collection tiles (≤ 4, `tilesOf`, shared with the section), a video and a
  drop date. They read the Home page's own catalogue and best-sellers ids (`ctx`): no statement, no loader in a block;
  the per-source loader is TS1c's. A fill never holds a video id: a design's one loop is the section's own `video`,
  kept only where the design has exactly one video block and the theme lists `design` in `videoSections`
  (`keepDesignVideo`, in `designsForSave` and `resolveTheme`; `VIDEO_KEYS` includes `design`). The save
  (`designsForSave(designs, home, { now, videoOk, loopsBefore })`) also refuses a 3rd design with pieces or collections
  (`MAX_COMMERCE_DESIGNS`), a look that grows past `MAX_LOOPS` = 3 loops (one already past keeps them: `loopsBefore` from
  the stored draft), and a drop date over 400 days away or unreadable. themeCheck: what only the owner chooses is
  fill-marked; one video a design; a minor can't add pieces, collections or a video to a design already on shops.
- **A loop's MP4 (TS1b, owner 2026-11-11).** A loop uploads with no MP4; past the checks the processor asks for a sized
  one (`loopMp4`: 720p, or the largest size a smaller source fills) and records it in `videos.mp4` (0102–0103: set once)
  in the transaction that enqueues `mux.rendition.create`. `mp4Of(row)` is the one rule for which file plays (a V1
  loop's `highest`, a product's 720p).
- **Eager images.** `ProductGrid`'s `lead` is off unless the caller asks; a page asks for ≤ 2 (`74-commerce` counts
  them on Home, Shop all and a collection). `shopCatalogue` is expanded once a request (`cache()`): never sort it in place.
- **Pages (Theme Studio TS1a; plan `docs/plans/2026-11-11-theme-studio-ts1.md`).** About and FAQ live in `shop_pages`
  (0099–0100: RLS, column grants, ≤ 20 a shop and one FAQ, addresses unique per shop, the cap under the `look:<t>` lock);
  their templates are Frrata's (since V1 content they save live from Console › Content, never with the look: § A store's content) (`src/domains/pages/templates.ts`, TS0b blocks + the page-only FAQ block whose items may be
  **bound** to Settings: `boundAnswer` in `domains/policies/answers.ts` gives the policy's own paragraph, or a link when the
  owner rewrote it). A page's `draft` is its words `{ title, handle, fill, hidden }`, `live` what shoppers see (null while
  hidden); a save is live from Console › Content (§ A store's content), never with the look's Publish, Undo or Discard.
  The handle is set when the page is added and never moves (`fixedHandle`). **Contact is not a page row**: it is
  `/policies/contact` (live before a shop opens, for KYC), its line the store's content (`site_content`, kind `contact`).
  The shop reads `shopPages` (cached, tag `shop:<t>:pages`, purged by a page or FAQ save); drafts only through the
  uncached `previewPages`. Page photos go through `cleanFill`.
- **Manifests** are typed files `src/domains/themes/catalogue/<theme>/<semver>.ts`, listed in `catalogue/index.ts`.
  A released file never changes; a new version is a new file. Theme colours live there and nowhere else
  (`check:hex` QUOTED rule).
- **Section schemas change additively only** (a new optional field with a default; never a narrower bound); a
  breaking change is a new section key. `sections-snapshot.test.ts` + `fixtures/stored-sections-v1.json` fail
  anything else. Shape is the save schema; what blocks a publish is `readinessOf` (a separate pure check).
- **Sources** (`src/domains/storefront/sources.ts`) pick a section's products: pure, listed only, newest by `since`,
  Best sellers by **delivered units** (`shopBestSellers`: ids only, cached an hour). Never by cost or margin
  (ADR-0003).
- **Looks: `src/lib/themes/look.ts` is the one module that reads or writes them.** Live = `liveOf` over
  `publishCandidates` (the newest publish of each version, newest first; one DISTINCT ON query) minus withdrawn versions: derived, never
  stored; the shop, Look, Undo and Admin all use it. Draft = the newest revision with no publish row, at most one (replaced under the per-shop advisory
  lock `look:<tenant>`). Publishes are append-only; a published revision is frozen by `app_theme_revision_frozen`.
  Saves and publishes lock the row and check its `version`; Undo names the live revision it saw. The first publish
  of a shop with no publish row records its baseline (`baselineRevision`; migration 0034 is its SQL twin).
- **Writes** are `src/app/(console)/console/look/actions.ts` (all `asMember`, a support visit refused). Every image
  in a layer is rebuilt by `acceptedBase(…, 'theme')` for this shop; uploads go to `tenants/<id>/theme/`.
- **Preview** `/console/theme-preview/<revision>/…` (route group `(lookpreview)`, no-store, noindex) is the ONLY
  framed route: SAMEORIGIN + `frame-ancestors 'self'`, only on the console host (`next.config.ts`,
  `framing.test.ts`). The customizer talks to it by `postMessage`, same origin and `e.source` checked.
- **Page settings** (T2: gallery, details, card, desktop columns, collection top) are additive with today's values
  as `PAGE_DEFAULTS`; a manifest may leave them out. A new setting never edits a released manifest.
- **Released manifests never change**: `released-manifests.test.ts` snapshots each manifest's evaluated content (so a
  change in `kit.ts` or a version it builds on fails too) and the list of versions (so a removal fails); a new
  version adds its snapshot on purpose. A missing version renders the nearest earlier version
  of the same theme (`manifestNear`), never another theme.
- **Back in stock** is the database's fact: one trigger (`app_variant_stock_times`) keeps `variants.sold_out_at` /
  `restocked_at` (sold out ≥ 24 h, stop-when-out only) and replaces whatever the app sends. Never set them in code.
- **Theme versions** (T3): code ships a version; Admin decides who may use it (`theme_versions`, platform;
  `theme_version_stages`, per shop). State is derived from dates; recall and withdraw are final (a trigger) and
  Classic 1.0.0 can never be pulled. THE answers live in `src/domains/themes/release.ts`: `availableTo` /
  `latestAvailable` (may a shop start on it) and `liveOf` (the newest publish not on a withdrawn version). Every
  caller asks them through `themeAccess(tx, tenant)` in look.ts: Try, the gallery, Customize, Restore, Publish,
  Undo; Admin's counts use `liveOf` too. The shop's look is `liveFromEntry(look-v2 entry, withdrawn)`: the
  version rows are one global cache (tag `themes`), so a withdraw is one `refreshThemeVersions()`, not a bust per shop.
- **Shop words** (T2): `shop_settings.shop_language` (en/hi); the words Frrata writes on a shop live in
  `src/components/storefront/words.ts`, **server-only**. An island takes the strings it shows as a prop (`buyWords`),
  never the module (`check-client-bundle` fails a chunk holding its Hindi). Domain functions return kinds and data;
  the view words them. Checkout, bag drawer, emails, invoices and policy pages stay English for now.
- **check:theme** is a vitest (`src/domains/themes/__tests__/check-theme.test.ts`): manifests are TS. It holds
  styles 1–5, allowed sections, sources, ≤ 20 sections and contrast for every scheme.
- **2.0 choices** (plan `docs/plans/2026-11-09-themes-three.md`): `FeelSettings` (button shape/motion, card hover,
  entrance, reveal, buy box, phone bar, footer colours, checkout) are additive with today's look as `FEEL_DEFAULTS`.
  **Which values a theme may use is `choicesFor(m, key)`** (`src/domains/themes/choices.ts`), read by `resolveTheme`
  AND the forms: a manifest lists its values in `allowed.choices`; a key it leaves out gets `BASE_CHOICES` (only what
  every 1.x theme had), so a 1.x theme can never render a 2.0 value. A stored layer is read **key by key**
  (`readSettings`): a value this build can't read drops only itself. `carryOver` brings across only what the
  merchant chose (never the old theme's defaults, never Classic's recorded font).
- **Gallery** = `OFFERED` (Editorial, Bazaar, Studio); `CATALOGUE` holds every theme in the build. Classic stays the
  baseline; Atelier lives on inside Editorial 2.
- **Sample pieces** (`src/lib/themes/sample.ts`, data in `catalogue/samples.ts`, photos in `public/themes/samples/`
  from `scripts/themes/make-samples.mjs`) are merged **only** by the theme-preview route, after the preview read,
  when the shop lists fewer than 4 pieces and the manifest has `samples`. Never in a cached read, never on a shop
  (shop hosts are rewritten, so the files can't be served there; `check-storefront-build` fails a shop chunk naming
  them; `sample.test.ts` pins who imports the module). A real product at a `sample-` handle wins.
- **Checkout** has its own route group `(checkout)` with `ShopFrame` (`src/app/s/[host]/_frame.tsx`, shared with
  `(shop)`): Focused = the shell's `focused` (logo + compact legal footer). `(shop)/template.tsx` is the page
  entrance wrapper (server, reads nothing, `display: contents` when off).
- **A section is guarded**: `Guarded` calls the section's own function (Hero({ s, ctx }) …, never <Hero/>) in try/catch (`unstable_rethrow` first); a throw
  leaves it out of the shop and names it in the preview.
- **Look v3**: a manifest says what was made for it (`made: { headers, footers, sections }`, each within its own
  allowed lists: check:theme); the forms and the library read it ("Made for <theme>" first). New designs ship in a
  theme's next minor version (2.1: header `panel`, `overlay`; footer `gram`), never by editing a released one. The
  header and footer pictures come from one catalogue read (`shellNeedsCatalogue` / `shellPictures`). "Over the photo"
  is CSS keyed on the page opening with a full-bleed hero photo (`[data-lead] [data-bleed] img`). A layer's photo may
  be the shop's own product photo (`acceptedBase(…, 'products')` as well as `'theme'`, same tenant only); a photo's
  `focus` is additive. Publish holds "Going live" inside the same transition as the action (≥ 1.3 s), so the
  customizer can't re-render under it; the re-render with no draft is the success popup (published.tsx), over the
  live revision's framed preview. Section search is pure (`searchSections` in sections.ts, tested).
- **Look v4** (owner-approved 2026-11-09, research `docs/research/2026-11-09-look-v4.md`; menus moved to the store's content
  in V1, § A store's content): the layer gains `site` (palette of six roles, text styles, icon library + stroke), in
  `src/domains/themes/site.ts` (pure), with the menus' shape and limits (`MenusSchema`, `MENU_LIMITS`, `menusOf`; their
  rows are the store's content). Saved through `layerProblems` (siteProblem first, in the merchant's words; an
  unreadable palette is refused) and stored as parsed; read **part by part** (`readSite`: a bad part drops only itself;
  a stored palette that no longer reads is ignored). Absent = the theme exactly: a text style sets CSS only when set
  (`data-t-<style>` + `--t-*`), the palette paints paper (and the tint's accent and buttons) only when set, the default
  main menu is the collections (`menusOf`). **carryOver:** another theme → site does not come across (owner: "Theme's
  own"); another version of the same major → it does. A layer's old menus, bar and Contact line are dropped (V1).
  Menu links are `shopPath` only (the shop's own pages). **Icons** are data (`src/domains/icons/data.ts`, generated by
  `scripts/icons/build-icons.mjs` from lucide-static (ISC) and @phosphor-icons/core (MIT); NOTICE.md) drawn by the
  server-only `ShopIcon`; client code imports `icons/names.ts` only; a client island gets the rendered element as a
  prop (BagButton `icon`); `check-storefront-build` fails a shop chunk holding icon paths. The theme preview also
  draws `/bag` and `/checkout` (the shop APIs resolve the shop by host, so the console's preview can't place orders).
- **Any storefront change** runs e2e `05-shop-look` (pixel diff against `e2e/baselines/`); an intended change
  regenerates them in the same commit: `UPDATE_BASELINES=1 npm run e2e -- --only shop-look`. Look's state changes:
  `look.int.test.ts` (real Postgres) and e2e `47-look`.

## Shop websites as code: kit and fleet rules (owner-approved 2026-11-12; spec docs/specs/2026-11-12-kit-and-fleet.md)
Nothing here is built yet; these bind every spec and plan for Sites, Studio and the kit.
- **Domains.** Partner or agent code runs only on its own registrable domain on the Public Suffix List (placeholder
  `frrata.site`), previews on another. Never on `frrata.shop` (checkout, sign-in), never on the console's, Admin's or
  Studio's domain. A spec that puts site code beside checkout's origin is a blocker.
- **Build mode.** A shop that has never had an owner (`clientStage`: building or invited) publishes without approval,
  to the signed preview only; its public address stays "Opening soon" with `noindex` until the owner opens it. Handover
  re-runs the checks and binds the owner's accept to a deployment id; a shop that ever had an owner never returns.
- **One record.** Publish, patch, rollback and handover all write `site_deployments`; live, held and drift are derived
  from it. Requests out through the outbox (`site.build`, `site.promote`); results back through `webhook_events`.
- **No fleet key.** Each site builds with its own storefront key; no key, role or token reaches every shop's data.
  The fleet service is deterministic code in the hosting account, never an AI agent with deploy rights.
- **Controls apart from code.** Policies live in their own repository, served as signed JSON by version; the publish
  gate runs Frrata's pinned checks on the build output, never the site's copy; a hard floor (no `unsafe-eval`,
  `connect-src` Frrata only, `form-action` checkout only, no route handlers or server actions in site code) is tested
  in this repo and no policy can lower it.
- **Facts stay in the API.** Money, offers, prior prices, JSON-LD, brand tokens and the legal block's words are served
  by the API, never re-implemented in a kit package.
- **Agents never approve** a release, a policy, a takedown or a publish.
- **Checkout stays home.** Checkout, sign-in and order pages stay on Frrata's own host in Mumbai; a site's router
  carries page requests only.
