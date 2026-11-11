# Theme Studio — Frrata staff and partners build themes; owners use them in Look
Status: active (mockup v2 approved by the owner 2026-11-11) · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/3Mpvh9zHQF6P4kJBihkmTd (v2) ·
Approved: owner, 2026-11-11 · Research: `docs/research/2026-11-11-theme-studio.md` · Reviews (2026-11-11): architecture-reviewer,
tenancy-auditor, security-reviewer, speed-reviewer (§ Review findings) · Storefront API: parked

Owner (2026-11-11): everything runs on Frrata. **Frrata staff** build gallery themes in Admin; **partners** build
themes in their portal **only for their own clients**; **owners** pick, fill and publish in Look. A theme covers home
and sections, product and collection pages, About / Contact / FAQ, and the header, footer and styles. Building is
**from building blocks, no code**; a **Claude assistant comes next**, on the same blocks.
Owner (2026-11-11, after the reviews): **phases reordered** (pages and blocks reach real shops before any studio);
**Contact ships with WhatsApp and the business details**; the form waits for the Messages inbox.

## Goal
North star (5) a premium-looking storefront, and distribution through partners (roadmap row P).
Measures: About/Contact/FAQ live on ≥ 50 % of open shops 60 days after TS1; gallery themes released per month after
TS2; partner-built shops on a partner theme after TS3; every studio theme at Lighthouse ≥ 60 performance and ≥ 90
accessibility (home, product, collection); **zero** shops changed without their own Publish.

## Phases (owner-approved order; each its own plan and mockup board)
| Phase | Who gets what |
|---|---|
| **TS0a Seam** (invisible) | `ManifestSchema` (every code manifest parses it); `manifestsFor(tenant)` in `src/lib/themes/manifests.ts` read before any transaction and passed into the pure functions; every caller of `resolveStored`/`manifestNear`/`latestAvailable` migrated (~20 files) with 0 px proof; the publish-cache fixes below; ADR-0012 |
| **TS0b Blocks** | The `design` section and the layout and content blocks (section, columns, group, heading, text, image, button, accordion), shipped inside **Signal 1.4** as two designs, Size help and Made by hand (owner 2026-11-11; plan `docs/plans/2026-11-11-theme-studio-ts0b.md`) |
| **TS1 Pages and templates (Look)** | About, Contact (WhatsApp + business details), FAQ; product and collection page layouts from blocks; the commerce blocks (product grid, featured product, collection tiles), video and the date block, with the per-source loader; as code themes' features, for owners |
| **TS2 Staff studio (Admin)** | Frrata's team builds and releases gallery themes; second-person approval |
| **TS3 Partner studio** | Partners build themes for chosen clients; Made for you; update offers |
| **TS4 Claude assistant** | Describe → blocks; its own spec |

## Research (summary; dated table in the research doc)
Taken: presets as the only way into the picker, hard depth and accepted children (Shopify; Webflow slots); palette by
role (Shopify 2026-06-17); opt-in update drafts keeping content (Shopify), per-shop accept with a bulk offer (Webflow
2026-10-09); layers tree, ⋯ menu, keyboard map, announced insertions (WordPress 2026-09-09/11-01/08-13); buttons beside
every drag (WCAG 2.5.7, 2026-08-10); Lighthouse 60/90 (Shopify Theme Store, unverified); Baymard's product-page needs as
required parts (2026-03-18). Not taken: free breakpoints (Wix), no review (Framer), partner code.

## Design

### 1. The model (ADR-0012: manifests may be authored data)
A theme is a **manifest**, from code (today) or from the studio (data), with one schema and the same guarantees:
validated, immutable once a version exists, versioned.
- **Design system:** today's typed `ThemeSettings` and styles. **Every colour matches `^#[0-9A-Fa-f]{6}$`** (security H1:
  scheme colours reach a `style` attribute; a test feeds `;`, `}`, `url(` into every token); every other token is a
  closed enum or a bounded integer; `resolveTheme` takes only parsed manifests.
- **Header and footer:** today's variants and options (no free composition in v1).
- **Section designs:** a tree of blocks with styling and the **fields an owner fills**; design ids and field ids are
  **stable** across versions (carry-over by (design, field)).
- **Templates:** home, product page, collection page, page templates (About, Contact, FAQ).
- **Owners never change structure** in Look: they fill fields, reorder, hide, add the theme's designs and pages.
- **Stored manifests are read part by part** (like `readSettings`): an unknown block or field drops only itself; a
  revert never falls back to Classic.

### 2. Blocks (v1, 13)
| Kind | Blocks |
|---|---|
| Layout | Section (top level), Columns (2–4; phone: stack or swipe), Group |
| Content | Heading, Text (≤ 2,000 chars; bold, italic, links to shop paths only), Image (alt or decorative; focus point; sized), Video (the shop's own `videos` row only; no default video in a theme), Button, Accordion (+ Item), Countdown (reuses `drop_teaser`; bounded date) |
| Commerce | Product grid (reuses `products`' `SourceSchema` and renderer), Featured product, Collection tiles (reuses `collection_tiles`) |
- Quote and Feature list are **not** blocks: trust words come from shop facts (design language). Testimonials come with
  the Reviews module, through its hook.
- Each block: Zod schema (`src/domains/themes/blocks.ts`), accepted children, **presets** (the only way into the
  picker), a server component in `src/components/storefront/blocks/`, styling as a **closed set of data attributes with
  one CSS rule each** (block CSS ≤ 1.0 kB gz).
- **Depth 3 below a Section**, counting Accordion › Item as one level (Section › Columns › Group › leaf).
- **Limits** (pure validator, speed 1): ≤ 20 sections a page (today's `MAX_SECTIONS`), **≤ 100 blocks a page**,
  **≤ 24 product cards a page** (speed review 2026-11-11), **≤ 6 commerce blocks a page**, ≤ 30 designs a theme. Worst case measured by the speed review (2026-11-11) at ≈ 370–480 kB with 36 cards, so the card cap is **≤ 24 a page** with ≤ 24 kB of owner text and ≤ 12 photos outside cards; a
  "largest allowed page" render test on the 600-product seed holds HTML ≤ 300 kB, RSC ≤ 150 kB.
- **Derived:** heading levels by position — the page's h1 is the first Hero's or the page title; every other heading
  steps down, never skips; **≤ 2 eager images a page** in document order (on product pages the buy box photos);
  motion from tokens and reduced motion.
- **Commerce blocks read a small cached loader per source** (≤ 12 cards), never `shopCatalogue`; a block component never
  calls a loader (`check:tenant`).
- **Product template, until the island split:** server-only blocks (no new client script on a route at 120.5 / 121 kB).
- Catalogue changes additively; a breaking change is a new block key; snapshot tests.

### 3. Pages and templates (TS1)
- **Product page:** Frrata's buy box stays one tested block (photos, price, prior price, M.R.P., colour then size
  buttons, availability, Add to bag, delivery and COD, returns summary, size guide); the template places it with other
  blocks; required parts can't be removed.
- **Collection page:** title or banner, filters, cards; designs above and below.
- **Pages** live in their own table, not the look layer (architecture 6): `shop_pages` (tenant_id, id, handle,
  template, title, content jsonb ≤ 64 kB, created_at, updated_at, published content via the look's publish) with
  `shop_page_handle_history` (append-only, like products). They always carry across theme changes (content, like menus).
  Route `/pages/<handle>` (ISR; an unknown handle 404s from the cached list, no query); `SHOP_PATH` gains
  `pages\/[a-z0-9-]{1,60}`; sitemap, `pageTags`, share cards (`parseCardPath`) learn it. ≤ 20 pages a shop.
- **About:** origin, makers, materials, a founder photo.
- **Contact (owner):** "Chat on WhatsApp" to the shop's own number (from Settings, never a field) and the business
  details rendered by `PolicyBody` — one source with `/policies/contact`, one canonical URL (the page; the policy route
  redirects). The form comes with the Messages inbox (M·2), never as a second inbox.
- **FAQ:** an accordion whose returns, sizes and delivery answers are **bound** to settings (like `bound()`), never
  copied text.
- **Bag and checkout:** not templated.
- Legal block source: India E-Commerce (Amendment) Rules 2026 (notified 2026-09-09, in force 2027-01-01) — gazette text
  to check before TS1 (`integration-researcher`).

### 4. Data and access (TS2, TS3)
- `studio_themes` (platform): id, `partner_id uuid null references partners on delete restrict` (null = Frrata), key
  `st-<slug>-<4 random>` (`^st-[a-z0-9-]{1,48}$`, anchored; code keys never start `st-`), name, created_by, created_at.
- `studio_theme_drafts`: one per theme; manifest taken as a string, **byte length checked before `JSON.parse`**, ≤ 512 kB
  (CHECK on jsonb bytes), explicit three-level schemas (no `z.lazy`); version lock.
- `studio_theme_versions`: theme, semver, manifest, notes (capped plain text), created at **submission** and frozen
  (trigger); `approved_at/by` set once, `check (approved_by <> submitted_by)`, approval tied to the sha256 of the row's
  manifest; checks recomputed on the server at approval, never trusted from the row; `withdrawn_at/by/reason`.
- **Entitlement, decided at write time** (tenancy C2, security H2): `shop_studio_versions` (tenant_id, version_id,
  granted_at; frata_app select only, tenant policy) written only by `app_shop_take_studio_version(p_version)` (definer,
  reads `app_current_tenant()`): a Frrata version released or staged to the shop, or a partner version whose partner has
  an **active link** to the shop **and** the shop is in that theme's **audience**. A BEFORE INSERT trigger on
  `shop_theme_revisions` refuses an `st-` key without an entitlement row. A removed partner's shop keeps the versions it
  is entitled to; it can't take newer ones.
- **Manifest content cache** is then safe to share: keyed by the version's uuid, raw jsonb, tag `theme:<id>`, under
  `cache()` and memoized per request; a shop can only ever name an entitled version. No `themes`-wide purge on studio
  actions (speed 7). The gallery reads metadata only, never manifests.
- **Audience** (tenancy H2): `studio_theme_audience(theme_id, tenant_id, added_at, removed_at)`, no frata_app grant,
  written by `app_partner_set_audience(p_uid, p_theme, p_tenants)` which keeps only tenants actively linked to the
  caller's partner. A theme made for brand A is never offered to brand B unless the partner adds B.
- **Partner versions never enter `theme_versions`** (no `released_at` that `availableTo` would offer everyone); the
  shop's studio versions and withdrawals come from `app_shop_studio_versions()` (no arguments).
- **Partner definers** take the uid from `requirePartner()`, find the approved, **not suspended** partner themselves
  (`partners.suspended_at`, new), and are revoked from public, anon, authenticated, service_role, frata_admin:
  `app_partner_themes`, `app_partner_theme`, `app_partner_create_theme`, `app_partner_save_draft`,
  `app_partner_submit` (copies the draft on the server), `app_partner_set_audience`, `app_partner_offer_update` (returns
  a count; offers only to linked, audience, entitled-to-an-earlier-version shops).
- **Admin:** a new staff role `theme_editor` in its own tuple, never in `ANY_STAFF` (which opens support sessions);
  approval needs an approver whose staff row is ≥ 7 days old, or aal2 (S5). frata_admin writes Frrata rows only
  (`partner_id is null`) and may set `withdrawn_*` on partner versions; reads partner manifests to review a withdraw.
- **Media:** a theme's default photos live under `studio/<themeId>/` (a new `PATH_SHAPE` kind checked against the
  theme id); an upload route checks WebP bytes, never SVG, with a per-partner quota failing closed; `cleanImages` walks
  pages, designs and templates exhaustively; the save definer refuses any value containing `tenants/`.
- **Apply to a client** happens in that client's console (`requireMember(CAN_BUILD)` through the store switcher):
  Try creates a draft; Publish stays the owner's. The portal studio previews on **sample pieces only**; Admin likewise.
- **Caps:** ≤ 10 themes a partner, ≤ 20 versions a theme a day, saves per user rate-limited; an owner’s layer ≤ 64 kB (the database check).

### 5. Checks — one function
`themeCheck(manifest, previous?)` (pure) is the one check: the vitest `check:theme` calls it for code manifests, the
studio calls it on save (live) and on submit/approve: limits and accepted children; colours shape and contrast for
every role pair (strict 4.5:1 / 3:1; a failing pair offers the nearest passing shade); headings by construction; alt or
decorative on every default photo; image weight; ≤ 2 eager; required product parts; legal block on Contact; footer
links Returns, Shipping, Track order; **against the previous version, a minor only adds** (stable ids).
**Gallery themes** also pass Lighthouse ≥ 60 / ≥ 90: the approved version is exported to a fixture and rendered by the
seeded e2e stack in CI (no production credentials in CI).

### 6. Releasing and updating
- **Frrata themes:** draft → checks → Submit (the frozen version row) → a second `theme_editor` approves → the T3 flow
  (stage, release, recall, withdraw) as for code versions.
- **Partner themes:** draft → checks → Submit → choose the clients (audience) → available to them; Frrata can withdraw
  any partner version, or suspend a partner, with a reason the partner reads.
- **Updates are always opt-in** (owner Publish; append-only publishes and `liveOf` unchanged): Look shows "Update ready"
  with the notes; Try → a draft with content carried over by (design, field), dropped fields listed in `lost`; Undo
  restores. A partner's "Offer to N clients" is an `studio_update_offers` row each owner sees while the link is active.
  **No silent fixes** (security H3, architecture 12): a Frrata fix to a code theme ships as a release; a studio fix is a
  new version offered like any other.

### 7. Speed fixes that come first (TS0a; existing debt the studio would make worse)
- The shop's look entry (`look-v2`, tag `shop:<t>:look`) caches the candidates and the newest body; other bodies cached by id (immutable); revision ≤ 64 kB (the database check).
- The withdrawn list (`sf-theme-withdrawn`) is withdrawn `key@version` pairs only, under `cache()`.
- `shopTheme(shop)` resolves once per request (as built in TS0a).

### 8. The studio (TS2/TS3 screens; mockup boards)
One studio, two frames (Admin's ink frame; the partner portal), **desktop only** ("Open the studio on a computer" on a
phone). Top bar: theme and version, Design system, page picker, Computer / Phone, Checks (count → list with Fix),
Undo / Redo, Submit. Left: the layers tree (select in tree or preview; ⋯ Duplicate, Copy, Paste, Hide, Rename, Delete,
Save as design; ↑ ↓ and Move to… beside drag; "+" opens the **block picker** — Look v3's section library pattern,
presets as pictures, greyed at a limit with the count). Centre: preview on sample pieces (debounced ≥ 500 ms;
framed route added to `next.config.ts`, the middleware and `framing.test.ts`; Admin views partner versions in
`sandbox="allow-scripts"` without same-origin). Right: the block's settings (typed; colours by role) and "Owner fills".
Keyboard: WordPress's map; insertions and moves announced. **Studio JS ≤ 220 kB gz** with a Console/Admin gate.

### 9. Owners in Look (TS1, TS3)
Gallery: "Made for you · <partner>" first (TS3); page picker gains Pages (TS1); designs in the section library; "Update
ready" for studio themes as for code themes.

### 10. Claude assistant (TS4, its own spec)
Input: the draft and product text as data — never costs, messages or reviews; only tool: the studio's save path; no URL
fetches; output is a proposal a person accepts; every result through `ManifestSchema` and `themeCheck`; caps fail
closed; the key Production only.

## Stress test — adding more later
| Scenario | Risk | Guardrail |
|---|---|---|
| A new block | Older themes break | Additive catalogue; snapshot; part-by-part reads |
| A module wants a block (Reviews, Size & fit) | Core imports a module | A `<ModuleSlot>`-style block hook listed in `check:modules`; hidden when off |
| A new token | Older themes move | Additive with today's value as default; resolved-looks snapshot (studio fixtures included) |
| Heavy partner designs | Slow shops | Page limits, ≤ 2 eager, commerce loaders, largest-page test |
| Unreadable or injected colours | Broken or hijacked page | Hex-only tokens; contrast in `themeCheck` |
| Partner removed / suspended | Shop loses its look / abuse continues | Entitlements kept; suspension stops every studio definer |
| A theme for brand A reaching brand B | Privacy | Audience + active link + entitlement trigger; tenancy proof |
| Update breaks a shop | Lost content | Opt-in drafts, carry-over by stable ids, `lost` list, Undo |
| A revert to an older studio version | Classic fallback | Part-by-part reads; versions never deleted |
| A mass withdraw (bad partner) | Many shops change | Withdraw falls back per shop to its previous publish (T3); per-theme tags, no platform-wide purge |
| Festive peak | Cache churn | Immutable content cache per version; no silent fixes; purges per theme |
| Media deleted | Broken photos | Theme media never deleted while any version names it (in-use check) |
| Claude (TS4) | Unsafe output | Blocks only, same schema and checks |

## Guardrails
- **Gates:** `themeCheck` (one function, vitest + studio); block catalogue snapshot; `ManifestSchema` parity; token
  injection test; `check:hex`; `check:motion`; `check-storefront-build` (CSS ≤ budget, block layer ≤ 1.0 kB); a
  Console/Admin JS gate (studio ≤ 220 kB); `check:tenant` (no loader in a block); `check:actions` (studio actions,
  `requirePartner`, the new staff tuple); framing test.
- **Tests:** block render tests; largest-allowed-page test; `themeCheck` units; studio int tests (frozen versions,
  approver ≠ submitter, partner sees only own, audience, entitlement trigger, offers); tenancy.sql 63+ (below); e2e:
  pages (TS1), staff build → approve → release → shop publishes (TS2), partner → audience → owner accepts update (TS3).
- **tenancy.sql (63+):** frata_app gets insufficient_privilege on studio, audience and draft tables; partner Q can't read
  or save P's themes; shop B (no link, not in audience) gets null and its `st-` revision insert is refused; shop A keeps
  an entitled version after removal but can't take a newer one; no tenant → null; withdrawn versions don't render;
  `set_audience`/`offer_update` with B's tenant write nothing; `shop_pages` cross-tenant checks; approval by the
  submitter refused; a version's manifest can't be updated; `has_function_privilege` false for anon, authenticated,
  service_role on every new definer.
- **Skills:** `frata-architecture` § Themes (ADR-0012, `manifestsFor`, blocks, entitlements); `frata-design-language`
  (studio and pages patterns once approved); a planning heading "Theme Studio: new block or token? additive? stable ids?".
- **Agents:** architecture, tenancy, security, speed reviewers on each phase's plan; `unit-economics-reviewer` at TS3 and
  TS4.

## Design review
- **UI/UX:** studio desktop-only, Look phone-first, Rule 0; states as the mockup's States board.
- **Tenancy:** § 4; contact data none in TS1 (WhatsApp only).
- **Modularity:** pure `blocks.ts`, `manifest-schema.ts`, `check.ts`; `src/lib/themes/manifests.ts` (`manifestsFor`);
  `src/lib/themes/studio.ts`; `src/components/storefront/blocks/`; Admin and partner routes.
- **SSOT:** a theme's facts in its manifest; owners' content in their layer and `shop_pages`; legal details and FAQ
  answers bound to Settings; one check function.
- **YAGNI:** no free CSS, breakpoints, header/footer composition, marketplace, partner code, silent fixes, contact form
  before the inbox.
- **KISS:** a manifest is the same object from code or data; blocks reuse today's section renderers where they overlap.
- **Scalability:** studio tables are platform rows (themes × versions small); entitlements one row per shop per version;
  caches per version, immutable.
- **Performance:** (a) a shop page adds no statement (manifest content cached; entitlement checked at write); (b) new
  queries: entitlement insert, audience lookups — indexed by (tenant_id, version_id), (theme_id, tenant_id); (c) entries:
  manifest ≤ 512 kB, revision ≤ 64 kB (the database check), publishes list ids only; (d) largest page ≤ 300 kB HTML / 150 kB RSC (test);
  (e) studio writes purge `theme:<id>`, a page edit the shop's page tag, never platform-wide; (f) shop JS unchanged
  (product template server-only blocks), studio ≤ 220 kB; (g) ≤ 2 eager images, no new font.
- **Reliability:** no new outbound call in TS0–TS3 (no email until the inbox).
- **Security:** § 1 (hex), § 4 (entitlement, audience, definers, staff role, approval, media, caps, suspension), framing,
  plain-text notes and fields; links shop paths only.
- **Motion and visuals:** blocks use the theme's motion tokens; the studio uses console patterns (tree rows never
  animate; the picker is the section library's sheet).
- **Unit economics:** staff time per theme; partners' share unchanged; `unit-economics-reviewer` at TS3/TS4.
- **Blast radius:** ~20 callers of resolve/manifest functions (TS0a), `shop_theme_revisions` (CHECK + trigger),
  storefront caches (the look entry, the withdrawn list, `shopTheme`), the shop router (pages), sitemap, tags, share cards,
  `PolicyBody`, `next.config.ts` framing, middleware, Admin › Themes, the partner portal, `requirePartner`.

## Review findings (2026-11-11) and where each went
| Finding | Reviewer | Resolution |
|---|---|---|
| Manifest cache bypasses the per-shop check | tenancy C1, security H2, architecture B1, speed 6 | § 4 entitlement at write (table + definer + trigger); content cache by version id |
| "Already publishes" lets a shop grant itself | tenancy C2 | § 4 entitlement written only by a definer |
| Tenant from a form (client preview / apply) | tenancy C3, security H4, architecture 11 | § 4 apply in the client's console; samples in the studio |
| Sync resolve functions; I/O in domains | architecture B2 | TS0a seam, callers migrated |
| Frozen versions vs later approval | architecture B3, tenancy M | § 4 version at submission; approval columns once, sha256 |
| Partner versions in `theme_versions` | tenancy H1 | § 4 never; own withdraw columns |
| A theme for A offered to B | tenancy H2, architecture 11 | § 4 audience |
| Colour CSS injection | security H1 | § 1 hex-only tokens + test |
| Silent fixes bypass Publish | security H3, architecture 12 | § 6 none |
| Page limits break 300 kB | speed 1, architecture 8 | § 2 limits + largest-page test |
| Product route JS headroom | speed 2 | § 2 server-only blocks until the split |
| Publish cache and withdrawn-list growth | speed 3–4 | § 7 (built in TS0a) |
| Commerce blocks pull the catalogue | speed 5 | § 2 small loaders |
| Purges reach every shop | speed 7 | § 4 per-theme tags |
| Eager images | speed 8 | § 2 ≤ 2 |
| Pages as content, SSOT, legal duplication | architecture 6 | § 3 own table, `PolicyBody`, bound FAQ |
| Blocks duplicate sections; trust claims | architecture 7 | § 2 reuse renderers; no Quote/Feature list |
| Contact form infrastructure | architecture 10, security 7, speed 11 | Owner: WhatsApp + details now; form with M·2 |
| Media path and uploads | security 6, tenancy M, architecture 9 | § 4 `studio/<themeId>/` |
| Staff role and approval | security 5 | § 4 own tuple, ≥ 7 days or aal2 |
| Partner suspension | security 9 | § 4 `suspended_at` |
| Size and parse limits | security 8 | § 4 bytes before parse, caps |
| Framing | security 10, architecture 11 | § 8 |
| No ADR | architecture 14 | ADR-0012 in TS0a |
| Phasing | architecture | Owner: reordered |
| Studio JS | speed 10 | § 8 ≤ 220 kB + gate |
| Lighthouse in CI with DB data | architecture 13 | § 5 export → seeded e2e |
| `st-` slug enumeration | tenancy L | § 4 random suffix |

## Out of scope
Partner code; free CSS or breakpoints; header/footer from blocks; partner marketplace or sales; templated bag and
checkout; silent updates; the contact form before Messages' inbox; the Storefront API (parked).

## Facts used
Research doc 2026-11-11. To verify before TS1: the E-Commerce (Amendment) Rules 2026 gazette text.
