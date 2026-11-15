# Site content layer: what a brand edits itself, and how a site's code declares it
Status: draft v2 (reviews folded in 2026-11-15; for the owner; nothing is built) · Date: 2026-11-14 · Mockup: none
yet; Studio v2.5 and the brand's Content screen are drawn after the owner's decisions (§ Owner decisions) · Approved: —
· Evidence: `docs/research/2026-11-14-studio-findings-verified.md` · Amends: ADR-0014 amendment 8 (proposed, in the
ADR) · Pairs with: `docs/decisions/0016-site-code-ownership-and-reuse.md` (proposed) · Reviews (2026-11-15):
architecture, security, tenancy, speed, unit economics (§ Reviews folded in)

## Goal
Ranked problems (5) a premium storefront built as code, and (7) festive-peak reliability. A code site must not make
every banner, sale date or FAQ typo a credit-paid agent session, a build and a publish. Measures, from the first
handed-over code site (V2), counted from `audit_events` (content saves) against the site's published deployments:
**≥ 90% of a brand's site changes after handover need no deployment**; a content save is live on the next visit after
at most 60 s; **≤ 30% of post-handover chat turns are content-only** (a turn whose only changed files are words,
dates, links or images a placement could hold; above 30% the site is missing fields).

## Job
A brand owner changes what their site says (a sale's banner and its end date, the menu, the FAQ, the size help) and
how it is coloured for a season, from the console on their phone, free and at once, while the partner and the agent
own how the site is built.

## Research
- **Repository (verified 2026-11-14/15):** ADR-0014 amendment 3 says content stays data; nothing implements it.
  Today's content sits **inside the theme system**:
  - two announcements: the **written** one in the look's layer (`settings.announcement`, ≤ 80 characters, a shop
    link, `src/domains/themes/layer.ts:20,34`, edited in Look › Header) and the **offer bar**, which takes its place
    while an offer is live ("One bar, never two", `src/app/s/[host]/_frame.tsx:24`);
  - menus and the Contact line in the look's layer (`layer.ts:63-66`, inside its 60 kB cap); menu labels have no
    plain-text check (`src/domains/themes/site.ts:102`);
  - page words and the FAQ (answers bound to shop facts) in `shop_pages`, one row per page with `live`, `previous`
    (Undo) and `version`, tied to the look's publish (`src/lib/db/schema-themes.ts:59-81`); read by the sitemap and
    the photos-in-use check;
  - publishing the look and its pages is `CAN_MANAGE` (owner, admin): **a partner only drafts today**
    (`src/app/(console)/console/look/actions.ts:123`, `src/domains/tenancy/roles.ts:25`).
  - The kit spec makes **brand tokens API data** edited in the console and read by site, checkout, emails and cards
    (`docs/specs/2026-11-12-kit-and-fleet.md:104-105`, V1.5) and defers "the source that replaces the look layer's
    `site`" to a V1.5 spec that does not exist.
  - The Storefront API's § 3 has policies and the offer announcement; no pages, FAQ, menus or placements. No key
    table or `apiRequest` exists yet (SA0 is unbuilt).
  - The Studio mockup v2.4 puts menus, collection pages, a banner and a season's dates through the agent (C1–C7).
- **Products** (design patterns only; **no current source checked in this pass**, unverified until the V1 plan's
  research step dates them, `frata-planning` § 2): Shopify theme sections declare their settings and the editor draws
  the form (**taken:** the code declares, the console draws); headless CMSs pair typed fields with tag revalidation
  (**taken:** a closed set of types, purge never rebuild); Indian D2C sales end at midnight (**taken:** every entry can
  carry an end).

## Design

### Three layers
| Layer | Examples | Who edits | Where | Cost | Reaches the shop |
|---|---|---|---|---|---|
| **Content** | Announcements with dates; placements the site declares (banners, featured collections or products); menus; page words; FAQ; size help; Contact line | Owner and admin live; a partner before handover, or with the owner's **content** scope | Console › **Content**, phone first | Free | Saved, then live on the next visit after ≤ 60 s; scheduled entries at their time |
| **Design system** | Colours, type, logo, radius, spacing, buttons; a season's tokens and dates | The partner (proposes after handover; the owner approves, or grants the scope); the brand later | Studio: chat or **direct edits on the preview**, writing the **brand-token data** (kit spec V1.5), never a commit | Free: no model, sandbox or build | Saved as data; read by the site, checkout, emails and share cards from one source |
| **Structure** | Page types, layouts, components, sections, apps on the site | The partner with the agent | Studio chat: plan, files, checks | Credits (3×) | A commit; checks; a person publishes |
The brand gets the chat later (ADR-0014 rule 4); the content editor stays theirs either way.

### Content kinds and where each lives (one source from V1)
| Kind | Store | Rules |
|---|---|---|
| Announcement | `site_content`, kind `announcement`: ≤ 3 entries, text ≤ 120, a shop link | One order rule, written once in `src/domains/content/`: **offer first** (today) or **written first** (owner decision 7). The look's `settings.announcement` moves here; `carryOver` drops it |
| Menus, Contact line | `site_content`, kinds `menu` (header, footer), `contact` | Today's `MenusSchema` and `MENU_LIMITS`, plus the plain-text rule; links only shop paths |
| Pages, FAQ, size help | **`shop_pages`, kept** | Its tie to the look's publish (`shop_pages_live_publish`) is cut: a save is live, `previous` stays the Undo. The fill keeps today's shape (theme-block ids with words and images); a code site reads the words through the API's page mapper. Bound FAQ answers are resolved at render from `shopSettingsFor`, never inside the content transaction |
| Season | Brand-token data (V1.5): its tokens, `starts_at`, `ends_at`, `stopped_at` and badge words | No on/off flag: dates plus a stop time (the `discounts.stopped_at` precedent) |
| Placements (V2) | `site_content`, kind `placement`, key = the placement id; **one row per entry** | Shapes from the site's declaration; references stored as ids (below) |
- **`site_content`:** `id`, `tenant_id`, `kind` (CHECK, a tuple), `key` (`^[a-z0-9.-]{1,40}$`), `value jsonb` (≤ 32 kB,
  CHECK), `starts_at`, `ends_at` (CHECK `ends_at > starts_at`), `stopped_at`, `previous jsonb`, `version`,
  `updated_at`, `updated_by`; `unique (tenant_id, id)`; grant select, insert, delete and a column update on `value`,
  dates, `previous`, `version`, `updated_*` only (never `tenant_id`, `kind`, `key`); RLS with `using` and `with check`;
  revoked from anon, authenticated, service_role; no `frata_admin` grant; a per-shop cap trigger that refuses a foreign
  tenant before its lock (as `app_shop_pages_cap`). The schedule lives in the row's columns, never inside `value`.
- **One plain-text rule** `plainText(max)` in `src/domains/content/`, used on save **and** in the API's output schemas:
  NFC; refuses `\p{Cc}` (keeps `\n` in long text), `\p{Cf}` except ZWNJ and ZWJ (Indic scripts), `\p{Co}`, `\p{Cn}`
  and `< > { } \`; caps per field. Today's `PLAIN` misses U+200B, U+2060, U+FEFF, U+061C, U+2028/9, U+00AD and the tag
  characters; migrated menu and page rows are checked again and failures dropped with a list for the owner.
- **References** are stored as ids only and resolved **at read, inside the reading shop**: products and collections
  through `visibility()` over that shop's cached catalogue entry (unlisted or unknown ids drop; nothing launches
  early), images as this shop's raster media checked with `acceptedBase` on save and read (served with width and
  height), WhatsApp and Instagram as symbols resolved from shop settings, links through `SHOP_PATH` (relative only).

### The editable-fields contract (V2)
- The site declares placements in `frrata/fields.json` (the partner's layer; no values): e.g.
  `{ "version": 1, "placements": [{ "id": "home.hero", "label": "Home hero", "component": "Hero", "scheduled": true,
  "max": 3, "fields": [{ "key": "image", "type": "image", "required": true }, { "key": "heading", "type": "text",
  "max": 60 }, { "key": "link", "type": "link" }] }] }`.
- **Field types, a closed set:** `text` (≤ 200), `longtext` (≤ 2,000), `image`, `link`, `collection`, `products`
  (≤ 12), `choice` (values declared), `toggle`. Scheduling is `scheduled: true` on the placement (row dates), not a
  type. A new type is an API version change.
- **Caps and words:** file ≤ 64 kB before parsing; ≤ 40 placements, ≤ 12 fields, `max` ≤ 6 entries; the gate computes
  the declaration's **worst-case bytes ≤ 256 kB** and the save refuses beyond it. Labels, choices and defaults are
  plain text ≤ 40 and may not ask for secrets (key, secret, password, OTP, PIN, PAN, Aadhaar, card, UPI, bank are
  refused); a value shaped like a key (`rzp_`, `frs_`, 12–19 digits) is refused on save. Defaults are text or toggle
  only (an image default is "none"). The editor shows these under "From your site's code".
- **Where it lives:** a column on the **published deployment row** (`site_deployments`, composite FK
  `(tenant_id, deployment_id)`), stored as the gate's Zod output, written only when the gate's result is processed
  under the tenant of the deployment row its outbox job names, select and insert only, frozen per version. The
  console reads the live deployment's declaration under `requireMember`, and parses it again with the same schema. A
  value for a placement no longer declared is kept, marked "Not on your site now", and counts toward the cap.

### Storefront API additions (version `2026-12`, not yet released: additive) · prerequisite **SA0**
- **SA0 first:** the key as a tenant source, `apiRequest` giving `ctx.tenantId` only, and its `check:tenant` rule
  land before any content resource.
- `content` (live announcements with `endsAt`, menus, Contact line, page list); `pages/{handle}`; `faq` (bound answers
  resolved); `placements` (V2). **Future entries are never returned**; each live entry carries `endsAt`, and the kit's
  `@frrata/core` and the theme shell hide an entry once `now ≥ endsAt` (exact ends without a cron). No `nextChangeAt`
  for starts.
- Output schemas are fixed unions of the field types (no `record` or `unknown`); `updated_by` never in an output.
- **Caching:** `shopCached` scope **`content`** (≤ 32 kB: announcements, menus, Contact line, page list; read on every
  page) and scope **`content-pages`** (≤ 128 kB: words and FAQ); placements in their own entry (≤ 256 kB). Raw rows are
  cached and the schedule applied at render, so entries live 86,400 s and refill on a save, not every minute. Tags
  `shop:<t>` and `shop:<t>:<scope>` (so `refreshShop` and check:tenant 6d hold), plus `skey:<id>` on API routes.
- **Purges and saves:** a save purges through a `refreshSoldOut`-style limiter (at most once per 30 s per shop, one
  trailing purge); page words and FAQ purge only `content-pages`, so an FAQ edit never regenerates product pages.
  Saves are limited (30 a minute a shop, the Postgres limiter, failing closed).
- **The frame** starts the content and announcement reads alongside `shopTheme` (no new serial round trip); `/pages/*`
  and the sitemap read `content-pages`, so those routes net zero.

### Console › Content (the brand's editor)
- Phone first. Sections: Announcement · Placements (V2) · Menus · Pages · FAQ · Season (V1.5) · Contact line. Save is
  live, with `previous` and `version` (a stale version refuses) and the 8-second Undo (`frata-design-language` rule
  11). Entries with dates show "Live now", "Starts 15 Nov 10:00", "Ended".
- **Who:** owners and admins save live. A partner saves live **before handover**, or after it only with the owner's
  **content** scope (ADR-0015 capability `content.write`, never `builder`); the owner is told of each partner save in
  the Inbox. Staff read only. **Support visits are refused**, as the Look's publish is.
- **Audit:** each save writes an `audit_events` row and keeps the previous value in `previous` (forensics and Undo).
- **Preview:** a signed token binding the tenant, the key id, the entry and ≤ 10 minutes; checked by the API, limited
  per `ipBucket`; an uncached, `no-store` resource, never ISR or `shopCached`; shown in an iframe with only
  `sandbox="allow-scripts"` on the preview domain.
- The Look's Menus, Header announcement and Pages panels become links to Console › Content in the release that moves
  them; the Look stops writing them in that release.

### The move out of the look (V1, one release)
A per-tenant script inside `withTenant` copies only the **live** publish's announcement, menus and Contact line (the
live look derived as `liveFromEntry` does, withdrawn versions included; joins on `(tenant_id, revision_id)`). Drafts
are not copied: the owner is shown "Your unpublished menu changes were not moved" where a draft differed. `shop_pages`
stays, with its publish tie cut. `readMenus` and `carryOver` stop reading the layer; a test proves no reader of
`layer.menus` or `settings.announcement` remains.

### Studio mockup v2.5 (the file is v2.4, `6c8634a7`; changes to draw)
1. **Routines:** remove "Refresh the New in row" (C1) and "Add it to the menu and make its page" (C2): New in reads
   the API, menus are content, collection pages are one dynamic route. Show agent work instead: a monthly speed and
   accessibility pass, applying a kit update, a seasonal redesign (each asks before publishing).
2. **Inbox (C3):** "Festive banner design · 3 variants" stays agent work; add an activity line "Riya changed the hero
   image and its end date (Content)".
3. **Build › Data (C4):** a group "Content · edited in the console": announcements, placements, menus, page words,
   FAQ, size help, Contact line; and "Brand tokens and seasons · data".
4. **Build › Editable** (new rail tab): this version's placements, fields and defaults; a warning where words sit in
   code ("Questions page: words in code; move them to Content").
5. **Hand over (C5):** a step "Riya can change these herself, free", with the declared placements, the content kinds
   and a small preview of Console › Content; the owner accepts the list of partner-layer files (ADR-0016).
6. **Design system and Seasons (C6):** hand edits save as brand-token data (no version build); the season shows its
   dates and words as data ("Riya can end it early in her console").
7. **Pages (C7):** Contact and Questions say "Words: Content › Pages"; the Files tab shows `content.page('questions')`.
8. **Hand edits in the chat (A4):** each hand edit adds a line ("You changed Primary to #8B2E2E").
9. **Wishlist heart:** per decision 6 (remove, or saved on this phone: product handles only).
10. **Agency starter:** "Atelier · Pixel & Thread · your agency starter · components and layouts only".
11. **New screen:** Console › Content at phone width (announcement with dates, a placement with three entries, menus,
    FAQ with a bound answer, season dates, a partner save in the owner's Inbox).

### Where each item falls
| Phase | Items |
|---|---|
| **V1** (SA0, then SA1) | The read seam `src/lib/queries/content.ts` that theme shops and the API both read; the `content`, `pages`, `faq` resources after SA0; the plain-text rule. The move out of the look and Console › Content may slip to V2 if V1 is tight, but must land before the first code site is handed over |
| **V1.5** (brand tokens) | Tokens and seasons as data; Studio-less editing of them in the console for owners |
| **V2** (hosting) | `frrata/fields.json`, the gate's checks, `placements` and its editor; **gate: Console › Content live before the first code-site handover**; Hand over lists what the brand edits |
| **V3** (Studio) | Direct edits on the preview writing token data, mirrored in the chat; the Editable tab; routines limited to agent work |
| **V4** (gallery) | Agency starters and the gallery, per ADR-0016 |
| **V5** (themes removed) | Nothing left to move for content |

### API gaps for SA1's own plan (not this spec's work)
- **D2 filters:** a dynamic handler with `Cache-Control: public, s-maxage=60`, canonical parameters only (known
  values, one per facet, fixed price bands, else 400), search's IP limit, and `truncated` on filtered pages too.
- **D3 past 600:** a cached index entry (~150 B a product: id, handle, price range, sizes in stock, colour families,
  tags, collection ids; ~750 kB at 5,000) filtered in memory, then the 48 cards read by id per regeneration; EXPLAIN
  the fill at 6,000 products and 30,000 variants before V1 meets a large catalogue.
- **D4 wishlist, D5 reviews, D6 scripts:** see decisions 6, the module contract, decision 5.

## Design review
- **UI/UX:** one primary action per section (Save, live, Undo); states: empty (declared defaults), scheduled, live,
  ended, stopped, "Not on your site now", partner without scope, support visit refused, phone. Constraints over
  refusals: links picked from the shop's paths, images from its media, dates from a picker. Rule 0.
- **Tenancy:** the table above; references resolved inside the reading shop; the declaration bound to the deployment
  row's tenant; the API's tenant only from SA0's key. Proof (`scripts/verify/tenancy.sql`): no tenant set reads 0
  rows; A sees only A; insert with B's tenant raises; update or delete of B's row changes 0; updating `tenant_id`,
  `kind` or `key` raises; anon, authenticated, service_role, frata_admin hold nothing; the cap trigger refuses B; the
  declaration's FK refuses B's deployment and refuses update and delete; `app_storefront_key` returns three columns,
  `prosecdef`, `search_path` set, revoked from public.
- **Modularity:** `src/domains/content/` (kinds, field types, plain text, schedule and order rules, declaration
  schema); `src/lib/queries/content.ts`; API mappers in `src/domains/storefront-api/2026-12/`; the editor under
  `src/app/(console)/console/content/`.
- **SSOT / DRY:** one source per fact: announcement, menus, Contact line in `site_content`; pages in `shop_pages`;
  tokens and seasons in the brand-token data; the schedule in row columns; the order of the two bars in one function;
  bound answers derived from shop facts.
- **YAGNI:** no rich text, no HTML, no per-locale copies, no content drafts beyond schedule and Undo, no brand chat,
  no third-party scripts.
- **KISS:** a closed set of types; save is live; purge, never rebuild; no cron.
- **Scalability / performance** (`frata-planning` § 3): (a) a theme page's frame gains no serial read (content and
  announcement in parallel with the theme); `/pages/*` and the sitemap net zero; (b) EXPLAIN on
  `(tenant_id, kind, key)` before build; (c) entries ≤ 32 kB, ≤ 128 kB, ≤ 256 kB, with a size test at the caps like
  `catalogue-size.int.test.ts`; (d) no shop page grows by more than the menus it already carries; (e) a save purges
  `content` (every page, debounced 30 s) or `content-pages` (pages only); (f) no new browser JS on theme shops beyond a
  small end-time check; (g) nothing preloaded.
- **Reliability:** no outbound call; a failed save says nothing changed; the purge limiter never drops the last save.
- **Security:** the plain-text rule; secrets refused in labels and values; references resolved in the reading shop;
  no early leak; the preview token; partner live write only with the owner's scope; support refused; audit with the
  previous value; save and purge limits. The kit ships a JSON-LD helper that escapes `<`.
- **Motion and visuals:** § Feedback toasts; a placement's preview card; no new motion.
- **Unit economics:** content edits and token edits run no model, sandbox or build: free and inside the 3× rule. A
  post-handover month of 20 content and 2 structural changes costs the partner ₹380–1,140 (structural credits only)
  instead of ₹760–2,280 through chat (assumption: 1–3 credits a content change; to test in the 20-task cost proof).
  Frrata gives up credit margin it was unlikely to earn (Shopify's editor is free).
- **Theme blocks:** none added; content moves out of the Look (not theme work).
- **Blast radius:** the Look customizer (Header announcement, Menus, Pages), `carryOver`, `readMenus`, the frame and
  `shopAnnouncement`, `shop_pages` and its readers (`sitemap.xml/route.ts`, `photos-in-use.ts`), `resolve.ts:54`,
  `thumb.tsx:15`, the Storefront API spec § 3, the kit, Studio's routines, Data and Hand over, ADR-0015's capabilities.

## Reviews folded in (2026-11-15)
- **Architecture:** two announcements today and their order (§ Kinds); tokens are API data, not commits (§ Layers);
  keep `shop_pages`; the migration copies live only; owners save live, partners by scope; schedule in columns; Undo
  and version; `endsAt` hides exactly; the declaration on the deployment row; tags in `shopCached` scopes; the kit
  enforces ADR-0016's layout; D2/D3 belong to SA1; measures defined; blast radius widened; the read seam first in V1.
- **Security:** live write needs the owner or a scope (H1); `fields.json` cannot phish (H2); one plain-text rule
  (H3); agency starters as ADR-0016 now says (H4); references checked on save and read (M5); no early leak and a
  bounded preview (M6); save and purge limits (M7); previous value kept (M8); repository tokens per repository (M9,
  ADR-0016); licences, wishlist, scripts (L10–12, decisions).
- **Tenancy:** SA0 first; the preview's tenant signed; references as ids resolved in the reading shop; the starter
  copy refuses keys and value defaults; the declaration's FK and writer; `site_content`'s shape and grants; scopes and
  tags; the migration per tenant; no start times leaked; `updated_by` never served; the proof list.
- **Speed:** byte caps per entry; purge limiter and a separate pages scope; filters cached at the CDN; parallel reads;
  86,400 s entries with render-time schedules; past 600 via an index entry.
- **Unit economics:** free direct edits fit 3× only as data writes (now so); partner savings above; theme moves cost
  ₹127–317 a shop on Starter 0 (assumed 20–50 credits) or ₹905–2,519 custom; count live theme shops first (free: the
  per-version count in `src/lib/admin/themes.ts`); Launch is ₹922.50 dearer than Shopify Basic before apps (unchanged
  by this plan).

## Out of scope
Rich text and HTML (signal: a brand cannot say what it needs in plain blocks) · copies per language (signal: Hindi
asked for) · a brand's chat (ADR-0014 rule 4) · third-party scripts (owner: later) · a cross-device wishlist (signal:
EkCode sign-in on sites) · SA1's filters and large catalogues (its own plan).

## Owner decisions
1. **Adopt the three layers**, with design tokens and seasons as data (ADR-0014 amendment 8).
2. **Console › Content as a gate** before the first code site is handed over; the move out of the Look in V1 or V2.
3. **Partners bring their own agent before Studio:** V1 plus the kit first; Studio V3 once V1's signal is passed
   comfortably (kill line < 3 external sites in 90 days).
4. **Free direct edits** to tokens and seasons (data writes; no turn, sandbox or build).
5. **Ownership and agency starters** as ADR-0016; partner terms with counsel.
6. **Third-party scripts:** stay deferred, or a reviewed list (pinned, self-hosted, SRI, own CSP and consent, never on
   checkout or sign-in). **Wishlist:** remove, or saved on this phone (product handles only).
7. **The bar's order:** offer first (today) or written announcement first.
8. **A partner's content scope after handover:** offered by default, or owner-granted only.
9. **Themes' move to code free** for every live theme shop (today KF:271 prices shops with no partner in credits);
   cost per shop above, total once the count is run.
10. **Code export:** "any time" (KF:211-212) or "later" (IT:11), one wording for both specs and ADR-0016.

## Facts used
ADR-0014 (amendments 1, 3, 4, 6, 7); Storefront API spec § 2–6, 8; kit and fleet § 2, 4, 7; Studio and intake specs
(credits after handover, owner 2026-11-12); `frata-unit-economics` 3× rule. No third-party fact is relied on.
