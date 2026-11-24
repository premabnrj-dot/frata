# frata-architecture — Catalogue, content, photos, delivery, attribution and EkCode

Part of `frata-architecture` (SKILL.md holds the rules every change obeys: layers, tenancy, auth, actions, the outside world). These sections are moved here unchanged (practices plan G4).

## Contents

- A store's content
- Category packs
- Writing products
- Importing products
- Catalogue links
- Search and sharing
- Photos
- Delivery
- Attribution
- EkCode

## A store's content (V1, 2026-11-15; plan docs/plans/2026-11-15-v1-content.md; ADR-0014 amendment 8)

- **The bar, menus and the Contact line are the store's content, not its look.** One row per fact in `site_content`
  (`src/lib/db/schema-content.ts`; kinds `announcement` (≤ 3, dated), `menu` (main, footer, tabs), `contact`). The
  schedule is in the row's columns (`starts_at`, `ends_at`, `stopped_at`), state derived (`src/domains/content/schedule.ts`);
  `previous` keeps the entry before the last save, `version` refuses a stale save. Pages and the FAQ stay in `shop_pages`
  and **save live** (draft = the words, live = what shoppers see, null while hidden); the look's Publish, Undo and Discard
  never touch them. The look's layer, `ResolvedTheme` and `ThemeSettings` carry none of these (`no-layer-readers.test.ts`).
- **One read seam**: `src/lib/queries/content.ts` — `shopContent` (cached, scope `content`, 60 s backstop; rows through
  each kind's tolerant reader), `previewContent` (uncached, the console's previews), `contentEditorData` (Console ›
  Content, one transaction). A store page's frame reads the look, the content and the offer in ONE `Promise.all`, each
  failing quietly; the shell's `content` prop is required (`shellContentOf`). The Storefront API reads the same seam.
- **One bar rule**: `barFor` (`src/domains/content/bar.ts`): a live offer first, else the live written bar that started
  last. The frame, the console's chips and later the API ask it.
- **Who saves**: `contentSaver(role, supportSessionId)` (`src/domains/content/who.ts`): whoever holds ADR-0015's
  `content.write` (owner, Manager, the store's partner, before and after handover: owner 2026-11-15); staff, accountants,
  Builders and any later role read; a support visit never saves. A partner's save tells the owner in the Inbox:
  `app_content_partner_notice(table, id)` (drizzle/0137), asked on every save, decides from the rows (the row's
  `updated_by` is a partner member, the store has an owner, no line for that row in the past hour) and words the line
  from the place, never the content. Compare roles through `holds`, never by hand (check:capabilities).
- **Writes**: only `src/app/(console)/console/content/actions.ts` (`write()`: the shop's limit `contentSave` counted first
  and given back on a refusal, fail closed; `asMember`; the saver check; a conditional update on `version`; one
  `memberAudit` row with field names only). Undo is the saver's own last save, within a minute, re-checked like a save,
  with its own limit bucket. A save purges through `refreshContent` (`throttledPurge`, shared with `refreshSoldOut`: the
  first in a window at once, repeats in one trailing purge); a page or FAQ save purges `pages` only.
- **The plain-text rule** is `plainText` (`src/domains/content/plain-text.ts`): NFC; refuses control, format (but ZWNJ and
  ZWJ), private-use, unassigned, line and paragraph separators, and `< > { } \`. Save only; reads are tolerant.
- **A backfill that restates a TS rule in SQL** (the move's `app_move_content`, drizzle/0135): run as the migration's owner,
  it sets `app.tenant_id` per store and names `tenant_id` in every statement; copies verbatim; re-runs reconcile (a row a
  person saved, `updated_by` set, is never touched); one parity int test against the TS rule
  (`site-content-move.int.test.ts`), and a two-store proof in tenancy.sql § 80.

## Category packs (C1a, 2026-11-23; plan docs/plans/2026-11-23-c1-category-packs.md)

- **What a store sells is read through the packs, never by key.** A pack (`src/domains/catalogue/packs/<key>.ts`, typed
  `Pack` in `packs/types.ts`) is pure data: the sell key, its tile (label, order, icon), its starting HSN and rank, `sized`,
  its starting `charts`, `label` (the editor asks what the pack says) and its return line. `packs/list.ts` holds `PACKS`,
  append only (its order is the CHECK's). `packs/registry.ts` is the pure, generic `registry(packs)`; `packs/index.ts`
  applies it and is what readers import: `SELL_KEYS`, `SellKey`, `SELL_TILES`, `startingHsn`, `sellsSized`, `chartKeys`,
  `labelAsked`, `returnLines`. `sell-keys.ts` re-exports them; `starting-charts.ts` holds `presetsFor`.
- **A store's packs are taken in its own order** (`sells.flatMap(k => byKey[k] ?? [])`): `men, women` starts Shirt · Men
  before Kurta set · Women. An empty list is **UNSAID** (`ethnic, women, men`: fashion, HSN 6211, three charts, no
  label); an unknown key is ignored. The starting HSN is the lowest rank among the packs, else `FALLBACK_HSN`.
- **The CHECK is built from the registry.** `schema.ts` renders `shop_settings_sells` with `sqlList(SELL_KEYS)`; a test
  pins its SQL to the migration's byte for byte (`src/lib/db/__tests__/sells-check.test.ts`).
- **Pack data stays out of the browser where it is not used.** Files a client component imports (`label.ts`,
  `size-charts.ts`) never import the packs; readers import `@/domains/catalogue/packs` directly. Webpack keeps a module with a
  top-level object literal wherever it is imported, even for nothing, so each pack, shared line and the list are made
  through `packs/define.ts`'s `/*#__PURE__*/ pure(() => ({ … }) as const satisfies Pack)` and `index.ts` exports only
  functions and pure calls (C1a·3: without it Content's first load grew 227.0 → 231.3 kB through `policies/answers.ts`).
- **`check:packs`** (`scripts/check-packs.mjs`) holds it: one key per pack file, its name (rule 1); every pack in
  `PACKS` (2); the newest `shop_settings_sells` CHECK lists the registry's keys in order (3); `schema.ts` uses
  `SELL_KEYS` (4); **no quoted sell key in `src` outside `packs/` and tests** (5), but its `ALLOW` list, each with its
  reason (`kind.ts` and `new-product-form.tsx`: product kinds; `src/domains/themes/catalogue/**`: frozen theme code).
  A new category fact is a pack field read through an accessor, never `sells.some(…)` in a reader.
- **A refactor starts with a characterization test** of today's values, committed alone and unchanged after:
  `src/domains/catalogue/__tests__/sells-today.test.ts` (19 rows in `sells-today.rows.ts`; rows are only added).
- **Adding a category** (C1c, proven by `src/lib/catalogue/__tests__/add-a-pack.test.ts`: a fixture pack appended to the real
  list flows through every reader, and no reader file changes):
  1. `src/domains/catalogue/packs/<key>.ts`, copied from the nearest pack, in its form:
     `export const <key> = /*#__PURE__*/ pure(() => ({ … }) as const satisfies Pack)`;
  2. append it to `PACKS` in `packs/list.ts`; never reorder;
  3. `npm run db:generate`, which writes `01NN_*.sql` (DROP and ADD `shop_settings_sells`);
  4. apply that migration in production (`scripts/prod-migrate.mjs`, the Supabase API) before the push that adds the pack,
     because the widen comes first;
  5. `check:packs` clean;
  6. add the pack's rows to `sells-today.rows.ts` (new rows only) and its icon to `registry.test.ts`;
  7. date and source every fact the pack holds (HSN with a CA's read, legal lines), `words-reviewer` on its words, and
     `unit-economics-reviewer` when its order values are low (spec 2026-11-23-merchant-onboarding § C3).
- **A registry proves it is modular with a fixture entry in a test, never one shipped**: mock its list, re-import the real
  readers, and assert the entry reaches each while the existing rows stay equal.

## Writing products (PI·0, 2026-11-12; plan docs/plans/2026-11-12-product-import.md)

- **The editor and the import write a product's sizes through `writeProducts`** (`src/lib/catalogue/write.ts`, inside
  the caller's transaction: the editor one draft, the import a chunk): prices, SKUs, barcodes, cost of goods, and
  sizes removed or returning. Its rules live there, set-based (one read each of handles, SKUs and barcodes; one insert
  per table), never a per-product loop; a new rule for those goes into it, pinned by `save-product.int.test.ts` and
  `write.int.test.ts`. (Other writers keep their own narrow writes: `createProduct`'s starting sizes, stock moved by
  orders.) A lock not had in its 1 s is told as "Someone is buying this product right now" (`lockTimedOut`).
- New products' addresses come from `freeHandles` (`src/lib/catalogue/handles.ts`, one read for the batch);
  `handleFor` writes Indian scripts in Latin letters (`src/domains/catalogue/indic.ts`).
- **A SKU is one in a shop in any case at the database too** (`variants_tenant_sku_upper`, drizzle/0119): a unique
  violation on either SKU index means another product took it meanwhile (`skuTaken`, write.ts: the editor and the import
  tell it in words). **A product goes live only through `goLive`** (readiness.ts: Publish and "Publish the N ready").
  **HSN digits for the turnover are `hsnDigitsIn`** (queries/settings.ts) passed to `cleanTax` / `cleanProduct`.
- **What a product still needs before it goes live, for one or many, is `readinessIn`** (`src/lib/catalogue/readiness.ts`:
  one read per table, the rule `readiness` in `src/domains/catalogue/readiness.ts`, re-exported by product-form.ts): Publish (`setStatus`) and the import's Done step both ask
  it. **Before deleting a product photo's files, ask `photosInUse`** (`photos-in-use.ts`: a look, a story or a page may show it).
- **Home's first product (`addFirstProduct`, O2a·6) is not a second writer**: one transaction composes
  `writeProducts`, `attachIn` and `setStatusIn` (Active only through `readiness()`; refused → a draft with its needs).
  Its sizes come from `firstProductShape` (`src/domains/catalogue/first-product.ts`), the rule `createProduct` reads
  too. Photo checks (`photosAreMade`, network) run before the transaction, never inside it.

## Importing products (PI·1, 2026-11-12; plan docs/plans/2026-11-12-product-import.md § Tasks 4–7)

- **The browser reads and groups; the server rules.** The page reads the file (read-excel-file's `universal` build for
  .xlsx — no worker, so the console's CSP is unchanged — and papaparse, both `import()`ed on pick), groups rows into whole
  products and chunks (`group.ts`, `plan.ts fileChunks`: mapped cells only, ≤ 512 kB, a product never split). The rules
  (`domains/catalogue/import/read.ts` → the editor's `cleanProduct`) run only on the server: once per chunk for the
  Check (`checkImport`, writes nothing; SKUs and barcodes carried across chunks in `seen`) and again for the write
  (`importChunk`). Never import `read.ts` or `cleanProduct` into a client component: they name `unitCost`, and
  `check:client-bundle` fails the build. The Check gets `checkedOf` (states and preview lines, never a cost).
- **A job is driven only by its open page, through `asMember`**: no unattended runner (it would have no session, no
  support audit, and outlive a removed member). One running job a shop (`import_jobs_one_running`); the server takes
  only `next_chunk` (an earlier one is a no-op retry, a later one refused); the same file (hash) resumes a running job,
  is refused once imported, and comes again only after its drafts are deleted (the hash is cleared). At most
  `IMPORTS_PER_DAY` starts in 24 h, counted in the transaction. Every chunk re-reads with the job's STORED mapping,
  re-checks the caps (600 products, 1,800 sizes: `limits.ts`) and the shop's matches, then `writeProducts` as drafts with
  costs only if `costsVisibleIn` says so.
- **A chunk is written exactly as the Check read it**: the job's earlier chunks' SKUs and barcodes are rebuilt from their
  rows (`seen`), and its own drafts never count as already in the shop (`existingIn(…, job)`). The rules read no cell
  longer than its cap (`CELL_CAPS`, read.ts: a longer one is a problem on its row), and the cell readers use no
  backtracking pattern (a 480 kB chunk once cost 18 s of CPU; `speed.test.ts` holds it under a second). The Check is
  limited per shop (`LIMITS.importCheckShop`, failing closed). A job that reads a cost column continues only for a member
  who sees costs.
- **`import_rows` hold cells only while the job runs** (they carry costs): ending or stopping a job nulls them
  (`forgetCells`). A job's products are exactly its rows' `product_id` (composite FK, SET NULL on delete): deleting drafts
  and "Publish the N ready" read nothing else. Drafts never reach shoppers, so a chunk revalidates `/console/products`
  only; only a publish purges the catalogue. `import_jobs`/`import_rows`: no frata_admin grant, no delete for anyone,
  column-level updates (tenancy.sql § 72).

## Catalogue links (Signal S3, 2026-11-09; plan docs/plans/2026-11-09-signal-s3.md)

- **A link between two products is a table with composite FKs**, never an id array: `product_pairs` (tenant_id,
  product_id, paired_id) → products (tenant_id, id) on both sides, so the database refuses another shop's product
  (tenancy.sql §62). The save still selects the ids with an explicit tenant and refuses unless every one is found
  (`savePairs`, one message for "not yours" and "missing").
- **Content that belongs to one product lives on it** (`products.stories` jsonb, like `label`): Zod caps by
  characters (`domains/catalogue/stories.ts`), a looser CHECK by bytes in the database.
- **A photo a second place uses joins the in-use check** (`photosInUse`, `src/lib/catalogue/photos-in-use.ts`, asked by
  `editPhoto` and by deleting an import's drafts): the files stay while a look's settings, any product's stories or a page
  mention the base; a new place that shows product photos is added there. A story photo is rebuilt with `acceptedBase(…, 'products')` on every save.
- **The shop reads a page's linked pieces inside its own entry** (`coreProduct`: ≤ 2 pieces, variants, first photo,
  in the same round; drafts never), tagged `catalogue` so a linked piece's change purges the page; which ones show,
  at what price, Add or Choose, is one pure rule (`domains/storefront/pairs.ts`).

## Search and sharing (S·1, 2026-11-09; spec docs/specs/2026-11-09-seo-and-sharing.md)

- **One writer of a shop page's tags**: `pageTags` (`src/domains/seo/tags.ts`, pure), mapped to Next metadata by
  `src/app/s/[host]/_meta.ts` (`shopTags`, `toMetadata`). No shop route builds tags by hand. `description` is always
  set (null clears it): an unset key inherits the root layout's — Frrata's own words on a shop's card.
- **og:type product and product:* tags** render as property= meta in the product page (`ProductTags`); React hoists
  them into the static head only while nothing above the page suspends — no loading.tsx there.
- **The offer** a page and its card state is `offerFor` (`src/domains/seo/tags.ts`): the lowest price a shopper can
  buy at now, with that size's availability; `compareAt` is the struck before-cut price.
- **Share cards** `src/app/s/[host]/og/[...card]/route.ts`: canonical paths only (`parseCardPath`), the host's shop,
  ids found in its cached catalogue (listed products only — a random id costs no query), drawing budgeted per caller
  then per shop, photos only from our store and this shop's folder (PATH_SHAPE), read capped at 1 MB, WebP or JPEG checked by
  sharp, reaching Satori only as data URIs. CDN a day; a stale address shows the current card for 5 minutes. No Blob
  storage (a deleted photo would outlive the product).
- **Old addresses are history rows, append-only** (`product_handle_history`, `collection_handle_history`: select +
  insert for frata_app, cascade with their row). A rename appends the old handle; another row's old handle is refused
  ("uses (or used)"); going back to one's own needs nothing (the current handle is looked up first). Collections'
  old → current map rides in the cached catalogue entry (`movedCollections`); the route 308s before its 404.
- **Identifiers**: `variants.gtin` (check digit in `src/domains/catalogue/gtin.ts`); the MPN in markup is the SKU, never
  a second column. Like the SKU, the gtin is dropped from the cached catalogue entry (only the product page reads it).

## Photos (2026-11-12)

- **One format per photo, said by its stored base** (`src/domains/media/sizes.ts`): WebP (`<id>` → `<id>-<w>.webp`, every
  photo before this date) or JPEG where the browser makes no WebP (Safari: a `.jpg` base, `<id>.jpg` → `<id>-<w>.jpg`).
  No column: `formatOf(base)`. A file's URL is built only by `urlFor` (never `${base}-${w}.webp` by hand); the upload
  path by `blobPath`; the token allows exactly the type the path's extension says, at most `maxBytesFor(width)` (512 kB
  at 400 … 3 MB; the browser lowers quality to fit), for `UPLOAD_TOKEN_MS` (5 minutes); `photosAreMade` reads EVERY
  size's first bytes against its base's format (`headIs`) and refuses a size it cannot read (404, 5xx, no answer).
- **Both token routes answer only the console's own origin** (`fromConsole`, `src/lib/http/same-origin.ts`: Origin's
  host:port is the request's Host, and that host serves the console). A new cookie-authenticated POST route uses it.
- **A product photo's row is written only by `attachIn`** (`src/lib/catalogue/photos.ts`, in the caller's `asMember`
  transaction; the editor's `attachPhotos` and the Photos page's `addPhotos`): the base rebuilt by `acceptedBase(…,
  'products')`, the ladder's widths only, the product looked up in the member's shop and locked FOR NO KEY UPDATE while
  placed (FOR UPDATE would hold up a review or an order line that points at it), a base the product has already
  skipped (Try again never adds a photo twice), a colour kept only if it is the product's own, a `max` counting the
  photos it has (the Photos page: 10). Never insert into `product_images` from an action.
- **Many photos at once go through the import's token route** (`/api/console/upload/import`, PI·2): product paths only,
  counted by `importToken` (`src/lib/media/import-bucket.ts`): a photo's 400 (every photo has one, uploaded first)
  alone writes its start (`importPhotoStart`) and counts once against `importPhotoShop` (500 an hour) and
  `importPhotoShopDay` (2,000); its larger sizes only within the start's window or the next, 3 at most; all failing
  closed. The editor, the look and the logo stay on `/api/console/upload` (`uploadShop`).
- **Frrata's pages under /products/ keep their addresses**: `RESERVED_HANDLES` (`domains/catalogue/variants.ts`):
  `freeHandles` skips them ("photos-2"), `cleanProduct` refuses one typed. A new static folder beside `[handle]` in the
  console or the shop goes on the list (`reserved-handles.test.ts` reads the folders).
- **Photos by file name are matched in the browser** (`src/domains/catalogue/import/photos.ts`, pure); the server
  trusts nothing of the match but the product id, which `attachIn` looks up in the member's shop. A live product's new
  photos purge the catalogue through `refreshSoldOut` (once per 30 s, a trailing one after), never once per product.

## Delivery (Delivery Zones, built 2026-11-12; plan docs/plans/2026-11-12-delivery-zones.md)

- **`resolveDelivery(pin, floor, setup)` (`src/domains/delivery/resolve.ts`) is THE delivery rule**: the charge, free
  above, pay on delivery and the days for a PIN code. Checkout's quote, placement, the switch to COD (`reprice`), an
  address change on a COD order (`src/lib/orders/work.ts` editContact) and the storefront PIN check all read it; nobody
  re-decides COD or a charge. Pay on delivery for a bag is `codOn(amount, terms)`, the charge `chargeOn` (`floor.ts`).
- **The floor** (Settings' one charge, COD rules, no-COD list) always applies; zones and PIN code rules apply only while
  the app is usable. `deliveryIn(tx, tenant, pin, now)` (`src/lib/queries/delivery.ts`) reads them INSIDE the caller's
  transaction and returns `setup: null` when there are no zones or the app isn't usable.
- **Browser code imports `floor.ts`, never `resolve.ts` or `presets.ts`** (the presets stay on the server).
- **Presets match by 3-digit PIN prefix**, never by India Post's district names (`presets.ts`, versioned).
- **Tables** `delivery_zones`, `delivery_zone_pins` (key `(tenant_id, zone_id)` → zones: a foreign-key check skips row
  policies), `delivery_rules`, `shop_holidays`: tenant rows for `frata_app` only (0112–0113, proof 72). ≤ 50 zones,
  ≤ 5,000 PIN codes and ≤ 5,000 rules a shop, counted under the shop's `tenant:delivery` lock.
- **While the app is usable Settings leaves its fields to it** (`HELD_BY_ZONES`, `src/domains/delivery/lists.ts`):
  the form hides them and `saveSection` drops them. Only zone and dispatch writes purge the shop's cache.

## Attribution (Analytics A·1, 2026-11-08)

- **Raw in, classified on read.** The shop shell's capture island (`CaptureAttribution`, never in a console preview or
  the Look preview) keeps the landing's tags and the referrer's hostname; `/api/shop/orders` cleans them
  (`cleanAttribution`) into `orders.checkout.attribution`. Nothing stores a classifier output; the one rule is
  `classifySource` (`src/domains/analytics/source.ts`), so a better classifier re-reads history. A reader of stored
  orders (Analytics, a source's page, the order's "Came from") takes the inputs with `attributionInputsSql`
  (`src/lib/db/attribution-sql.ts`) and the creator with `creatorCodeJoinSql`, and classifies with `sourceOfInputs`:
  one route, so they never disagree (an int test checks the order page against Analytics). A creator's code the order
  uses (a labelled `discount_codes` row) wins over tags.
- **"Your website" (classifier v3, SA1b):** the bag link's page writes `via_site: '1'` into the tab's attribution (never
  from a URL: `landingParams` skips it), and `classifySource(a, creator, site)` reads it, or a referrer equal to the
  store's site host, as "Your website" after every stronger signal (creator, tags, click ids). Readers pass the site
  host (`siteHostIn(tx, tenantId)`, or the order query's own subquery); visits never carry the marker. A change to the
  rule bumps `CLASSIFIER_VERSION`/`CLASSIFIER_SINCE`, and Analytics says "Sources renamed on <date>" for 90 days.
- **Read grouped, never per order:** Analytics groups orders by their raw inputs in SQL (`src/lib/queries/analytics.ts`)
  inside one transaction with `jit off`, `statement_timeout 3s`, `work_mem 64MB`; ₹ kept after returns is
  `keptOf` over the groups (`src/domains/orders/kept.ts`, the one ₹-kept helper for Offers, Analytics and True Profit).
  True Profit (`src/lib/queries/true-profit.ts`) groups LINES: each carries its taxable share of its order's money
  (`share`, which scales a per-parcel estimate) and its own COGS; a credit note that names a line comes off that line,
  one that names none is spread by share; a line's cost counts only when its order's COGS is known (so products add up
  to the order total). PIN codes group orders, with a figure only from 5 orders of that payment kind.
  Its figures are CACHED 15 minutes per shop and period (owner, 2026-11-12; `shopCached`, tag `shop:<tenant>`), worked
  out as the owner sees them; who may see them (`costsVisibleIn`) is checked per viewer outside the cache, and the page
  says when they were worked out ("Updated 10:42"). A product's sizes and colours stay live (one product, ≤ 60 ms).
- **Links with tags** come from `shopLink` (`src/domains/analytics/link.ts`) only: URL + URLSearchParams, the shop's
  own origin.
- Erasing an abandoned order strips the click ids (`ERASED_KEYS`); the utm tags stay (owner: keep everything else).

## EkCode (P1 built 2026-11-09; ADR-0009, ADR-0010; plan docs/plans/2026-11-09-ekcode-p1.md)

- **A second public host.** `NEXT_PUBLIC_EKCODE_HOST` (ekcode.in) is a `routeFor` kind of its own
  (`src/domains/tenancy/host.ts`): only `/`, `/privacy`, `/terms`, `/contact`, `/continue`, `/api/ek/*` and `/_next/*`
  answer there; `/ek` and `/api/ek` are a 404 everywhere else; it is never a shop (`requireShop` refuses it) and never
  the console (no Supabase session). Its pages are `src/app/ek/` reached through the rewrite; `/continue` gets a nonce
  CSP from the middleware's ekcode branch.
- **Platform tables with no door but definers.** The vault (`ekcode_*`, drizzle/0088): `revoke all` from every role, one
  `restrictive` `definer_only` policy `using (false)`, definers pinned to `search_path ''` and executable by exactly one
  role; `check:tenant` fails any table grant on them. Scope always comes from a server-made handle (the shop's own
  request makes the flow), never from an argument a caller chooses. No definer returns an account id; a shop's id for
  a shopper is a random `ekcode_pairs` row.
- **The handshake** is PKCE: the shop keeps `state.verifier` in its own cookie, ekcode.in gets only a random handle,
  the return URL is built from the flow row, the grant is a 60-second one-time code stored as a hash, and redeem
  checks tenant, host and `S256(verifier)` in one update. Copy this for any cross-host return.
- **Keys that rotate**: `src/lib/crypto/key-ring.ts` — rings "id:secret,…" newest first, the key id inside every
  sealed value and keyed hash; new entries go in front, old values still open. Payment secrets stay on secret-box.
- **A module never imported by core**: the checkout gains a slot (`checkout.identity`) and generic window events
  (`shop:prefill`, `shop:placed`); a brand mark ships as server-rendered SVG, never as path data in a client chunk.
- EkCode's own code lives in the module's folders (`src/lib/modules/ekcode/`, `src/components/modules/ekcode/`; an engine
  of its own would go in `src/domains/<key>/`, check:modules); rules shared with core are `src/domains/ekcode-core/`.
