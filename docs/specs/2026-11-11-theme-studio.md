# Theme Studio — Frrata staff and partners build themes; owners use them in Look
Status: draft · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/3Mpvh9zHQF6P4kJBihkmTd (v1) · Approved: — ·
Research: `docs/research/2026-11-11-theme-studio.md` · Supersedes for now: `docs/specs/2026-11-11-storefront-api.md` (parked)

Owner (2026-11-11): everything runs on Frrata. **Frrata staff** build gallery themes in an internal studio (Admin).
**Partners** build themes in their portal, **only for their own clients**. **Owners** pick, customize and publish in
Look, as today. A theme covers home and sections, product and collection pages, About / Contact / FAQ pages, and the
header, footer and styles. Building is **from building blocks, no code**; a **Claude assistant comes next**, on the
same blocks.

## Goal
North star (5) a premium-looking storefront, and distribution through partners (roadmap row P). Today a new look
needs a Frrata developer and a release; the studio lets Frrata's team ship themes weekly and lets a partner give a
brand a look of its own, while every shop keeps Frrata's speed, checkout, SEO and safety.
Measures: gallery themes released per month (staff); share of partner-built shops on a partner theme; shops on a
studio theme vs code themes — Lighthouse (performance ≥ 60, accessibility ≥ 90 on home, product, collection),
publish-to-order conversion unchanged or better; **zero** shops broken by a theme update (updates are opt-in).

## Job
Frrata's team and partners design a whole shop — design system, header, footer, home, product, collection and content
pages — from Frrata's blocks, check it, and release it; owners fill it with their words and photos and publish.

## Who does what
| Person | Where | Can |
|---|---|---|
| Frrata staff (theme role) | Admin › Themes › Studio | Create and edit Frrata themes; submit; a second staff member approves; release through today's stage → release flow |
| Partner (approved) | Partner portal › Themes | Create and edit their own themes; release to their own clients; offer an update to all their clients |
| Owner (and admin, partner while building) | Console › Look | Pick a Frrata theme or one made for them; fill content, reorder, hide sections; pages; publish; accept updates |
| Brand staff | Console | As today (no Look changes) |

## Research (summary; table and dates in the research doc)
Taken: presets as the only way into the block picker, hard depth and accepted children (Shopify, Webflow slots);
palette by role, overrides from the palette (Shopify 2026-06-17); opt-in "updated copy" drafts keeping content
(Shopify), per-shop accept with a bulk offer and rollback (Webflow 2026-10-09); layers tree + ⋯ menu + keyboard map +
announced insertions (WordPress 2026-09-09/11-01/08-13); ↑ ↓ beside every drag (WCAG 2.5.7, 2026-08-10); Lighthouse
60/90 floor (Shopify Theme Store, unverified); Baymard's product-page needs as required blocks (2026-03-18).
Not taken: free per-breakpoint styles (Wix breakage), a gallery with no review (Framer), partner code.

## Design

### 1. What a theme becomes (the model)
A theme stays a **manifest**, now **authored data** as well as code:
- **Design system:** today's `ThemeSettings` choices and styles (palette by role — paper / tint / ink schemes, pairing,
  type size, spacing, corners, buttons, cards, photo ratio, motion), each a typed choice, never a free CSS value.
- **Header and footer:** today's variants (`HEADERS`, `FOOTERS`) with their options; not free-composed in v1.
- **Section designs:** new. A design is a **tree of blocks** (≤ 3 levels below the section) with its styling and the
  **fields an owner fills** (heading, text, photo, link, product source). Today's 12 sections stay as built-in designs.
- **Templates:** home (the default sections), product page, collection page, and page templates (About, Contact, FAQ).
- **Allowed lists** (what an owner may add), `made`, `samples`, as today.

Owners never change a design's structure in Look: they fill its fields, reorder, hide and add the designs the theme
offers (Webflow slots, Wix page permissions). Structure is the studio's; content is the owner's.

### 2. Blocks (v1 catalogue, 15)
| Kind | Blocks |
|---|---|
| Layout | Section (top level: scheme, width, spacing), Columns (2–4; phone: stack or swipe), Group (vertical stack) |
| Content | Heading, Text (bold, italic, links to shop pages only), Image (alt or decorative; focus point), Video (Mux, poster required), Button, Accordion (+ Item), Quote, Countdown (server clock, hides after), Feature list |
| Commerce | Product grid (a source, ≤ 12), Featured product, Collection tiles |
- Each block: a Zod schema (`src/domains/themes/blocks.ts`, pure), **accepted children**, **presets** (the only way it
  reaches the picker), a server component (`src/components/storefront/blocks/`), and its CSS from `--store-*` tokens
  only. Columns can't hold Columns; commerce blocks sit only under a Section.
- **Limits, checked in the pure validator** (not only the UI): depth 3; ≤ 40 blocks per section; ≤ 25 sections per
  page; ≤ 30 designs per theme.
- **Derived, never set:** heading levels by position (one h1 per page, no skips); only the first section's media
  eager; motion from the theme's motion choice and reduced motion.
- The catalogue changes **additively** (a new optional field, a new block); a breaking change is a new block key;
  snapshot tests as for sections. A new block is code by Frrata's developers — the only way new kinds of content appear.

### 3. Templates and pages
- **Product page:** Frrata's buy box stays one tested block (photos, title, price with prior price and M.R.P., colour
  then size buttons, availability, Add to bag, delivery and COD line, returns summary, size guide). The template
  arranges it with other blocks (stories, pairs, reviews, designs) and the gallery choice; the required parts can't be
  removed (Baymard).
- **Collection page:** title or banner, filters as today, the grid's card style; designs above and below.
- **Pages:** `/pages/<handle>` on the shop (new route; `SHOP_PATH` and menus learn it). Templates: **About**
  (origin, makers, materials, founder photo), **Contact** (WhatsApp first to the shop's own number, then a form; the
  **business details block is fixed**: legal name, address, customer care, grievance officer — India E-Commerce Rules
  2026, in force 2027-01-01, gazette to check), **FAQ** (accordion; returns, sizes, delivery prefilled from settings).
  An owner adds a page from the theme's templates, fills it, and adds it to a menu. ≤ 20 pages per shop.
- **Contact form:** name, phone or email, order number (optional), topic, message → a console list ("Messages from your
  website", until Messages' inbox takes it), a 48-hour reply clock, an email to the owner through the outbox; Vercel
  BotID, a per-IP limit (fail closed) and a per-shop daily cap; the message never reaches any AI.
- **Bag and checkout** are not templated (design rule: one tested layout for money pages); a theme styles them.

### 4. Where themes live (data)
- `studio_themes` (platform): id, `owner` (`frrata` | partner id), key `st-<slug>` (unique), name, created_by,
  created_at. `studio_theme_drafts`: one mutable draft per theme (manifest jsonb ≤ 512 kB, version lock, updated_by).
  `studio_theme_versions`: theme, semver, manifest jsonb, notes, checks jsonb, submitted_at/by, approved_at/by,
  created_at — **frozen once created** (trigger), like a released code file.
- **Who reads what:** staff through `frata_admin` (Frrata-owned only); a partner through uid-keyed definers (their own
  themes only; partners have no frata_app grant, as today); **a shop** through one definer
  `app_theme_manifest(key, version)` that returns the manifest only when the theme is Frrata's and released (T3 rows),
  or a partner's theme **and** the shop has an active partner link to that partner **or** already publishes that version
  (so a shop keeps its look if the partner leaves; no updates then).
- `shop_theme_revisions.theme_key` CHECK grows to accept `st-[a-z0-9-]{1,40}`. Code themes stay code; both resolve
  through one `manifestFor(key, version)` (code first, then the cached platform read, tag `themes`; a version never
  changes, so its entry never goes stale).
- One Zod **`ManifestSchema`**: every code manifest passes it (test), every studio save and version is parsed by it.

### 5. Checks (the same bar for everyone)
`themeCheck(manifest)` — pure, run on every save (shown live) and required to submit:
limits and accepted children; contrast for every role pair and scheme (strict 4.5:1 / 3:1; a failing pair offers the
nearest passing shade); heading order (by construction); alt text or decorative on every default photo; image weight
of default photos; at most one video above the fold; motion only from tokens; required product-page parts present;
legal block on Contact; footer links Returns, Shipping, Track order.
**Gallery themes** also pass Lighthouse ≥ 60 / ≥ 90 on home, product and collection with real sample content, run in
CI by staff before approval (the e2e stack renders the version). Partner themes: the pure checks (their output is
still Frrata's components, so speed and safety hold).

### 6. Releasing and updating
- **Frrata themes:** draft → checks pass → Submit → a **second staff member approves** → a `studio_theme_versions` row →
  the existing T3 flow (stage to some shops, release to all, recall, withdraw).
- **Partner themes:** draft → checks pass → Release → available to the partner's clients; **Frrata can withdraw any
  partner version** from Admin with a reason (the shop falls back as T3 does).
- **Updates are opt-in for owners** (Shopify, Webflow): Look says "Update ready" with the notes; Try puts it in a draft
  with the owner's content carried over (`carryOver`), conflicts listed; Publish as today; Undo restores the previous
  look. A partner can **offer an update to all their clients** (a notice each owner accepts). Only fixes that change
  no look apply without asking, and they are logged.

### 7. The studio (screens, mockup boards)
One studio, two frames (Admin's ink frame for staff, the partner portal for partners), desktop only (a phone says
"Open the studio on a computer"; Look stays phone-first).
- **Top bar:** theme name and version, Design system, page picker (Home · Product · Collection · About · Contact · FAQ ·
  Header and footer), Computer / Phone preview, Checks (a count; opens the list, each with Fix), Undo / Redo, Submit
  (staff) or Release (partner).
- **Left:** the layers tree for the page (sections → blocks); select in the tree or the preview; ⋯ menu (Duplicate,
  Copy, Paste, Hide, Rename, Delete, Save as design); ↑ ↓ and Move to… beside drag; "+" between rows opens the
  **block picker** (search, Layout · Content · Commerce, presets as picture cards, greyed at a limit with the count).
- **Centre:** the preview on sample pieces (today's sample sets by what the shop sells) or a chosen client's catalogue.
- **Right:** the selected block's settings (typed choices; colours from the palette's roles only); for a design, which
  fields the owner fills ("Owner fills: heading, photo, link").
- **Design system panel:** palette roles with live contrast chips, pairing, type size, spacing, corners, buttons,
  cards, photo ratio, motion; presets to start from.
- **Keyboard:** WordPress's map (`/` picker, duplicate, insert before/after, move, tree, undo/redo); insertions and moves
  announced.

### 8. Owners in Look
- The gallery shows Frrata themes and, when a partner built one for them, **"Made for you · Arc Studio"** first.
- Page picker gains **Pages** (About, Contact, FAQ, any added): fill, publish with the look.
- Section library shows the theme's designs ("Made for <theme>" first, as Look v3).
- "Update ready" for studio themes as for code themes.

### 9. Claude assistant (next phase, same blocks)
A chat in the studio (and later in Look) that edits the draft only through the studio's own save path: it proposes
blocks, presets and token choices; every result passes `ManifestSchema` and `themeCheck`; it never writes code, HTML or
CSS; product text reaches it as data; usage capped per plan. Its own spec after TS3.

## Phases (each its own plan and mockup sign-off)
| Phase | Who gets what | Notes |
|---|---|---|
| **TS0 Foundations** | Nothing visible: `ManifestSchema`, the block catalogue and renderers, the `design` section, `themeCheck`, `manifestFor`, tables + definers | Regression net first: resolved-looks and released-manifests snapshots unchanged; shop-look 0 px |
| **TS1 Staff studio** | Frrata staff build and release gallery themes (design system, header/footer, home designs) | Admin role for themes; second-person approval |
| **TS2 Templates and pages** | Product and collection templates; About, Contact, FAQ for owners; the contact form | New shop route; legal block |
| **TS3 Partner studio** | Partners build themes for their clients; Made for you; offer updates | Tenancy proof for partner themes |
| **TS4 Claude assistant** | Describe → blocks | Its own spec, unit economics |

## Stress test — adding more later
| Scenario | Risk | Guardrail |
|---|---|---|
| A new block kind | Breaks older themes | Additive catalogue; snapshot; old designs keep rendering |
| A new module wants a block (Reviews, Size & fit) | Core imports module | A module block joins through a hook (like `productExtras`); hidden when the module is off; `check:modules` |
| A new token or setting | Older themes change | Additive with today's value as default (`PAGE_DEFAULTS` pattern); resolved-looks snapshot |
| A partner builds 30 heavy designs | Slow shops | Limits in the validator; one video above the fold; eager media only first section; budgets gate |
| A partner theme with poor contrast | Unreadable shop | `themeCheck` blocks release; contrast on every pair |
| Partner removed / handover | Shop loses its look | The definer keeps every version the shop publishes; no updates after removal |
| A theme update breaks a shop | Lost content | Opt-in drafts with carryOver; Undo; withdraw falls back |
| A partner's theme copied to another brand | Privacy | The definer requires that partner's link or an existing publish; tenancy proof |
| Festive peak | Studio reads on the shop path | Versions are immutable: cached forever per version; shop path unchanged otherwise |
| Claude (TS4) produces something odd | Unsafe output | Only blocks, through `ManifestSchema` + `themeCheck`; no code path exists |

## Guardrails (gates, tests, skills, agents)
- **Gates:** `check:theme` extended to studio manifests (pure `themeCheck`); block catalogue snapshot (additive);
  `ManifestSchema` parity (every code manifest parses); `check:hex` keeps colours in manifests and tokens only;
  `check:motion`, `check:storefront-build` budgets over block components.
- **Tests:** block render tests (each preset, both schemes, reduced motion); `themeCheck` unit tests; studio int tests
  (version frozen, second-person approval, partner sees only own themes, shop reads only allowed manifests); tenancy.sql
  checks for the new tables and definers; e2e: staff builds → approves → releases → a shop publishes it; partner builds →
  releases to a client → owner accepts an update; pages and the contact form.
- **Skills:** `frata-architecture` § Themes (authored manifests, blocks, `manifestFor`); `frata-design-language`
  (studio patterns once approved); a planning heading "Theme Studio: new block or token? additive?".
- **Agents:** `architecture-reviewer`, `tenancy-auditor` (partner scoping), `security-reviewer` (contact form, studio
  actions), `speed-reviewer` (block renderers, manifest cache) on each phase's plan.

## Design review
- **UI/UX:** studio on desktop; Look phone-first; Rule 0; states: empty theme, limit reached, checks failing, submitted
  (waiting for approval), approved, released, withdrawn, partner removed, no permission, phone.
- **Tenancy:** platform tables for themes (no tenant); shops read through one definer gated by link or publish;
  contact messages are tenant rows (RLS, policy, tenancy.sql).
- **Modularity:** `src/domains/themes/blocks.ts`, `manifest-schema.ts`, `check.ts` (pure); `src/lib/themes/studio.ts`
  (reads/writes); `src/components/storefront/blocks/`; Admin and partner routes.
- **SSOT:** a theme's facts live in its manifest; owners' content in their layer; the legal block from Settings.
- **YAGNI:** no free CSS, no per-breakpoint styles, no free header/footer composition, no partner marketplace, no
  partner code, no theme sales.
- **KISS:** a manifest is the same object whether code or data; blocks are server components over tokens.
- **Performance:** manifest per version cached forever; blocks are server-rendered with no client JS unless the block
  needs it (video, countdown already have islands); the shop budget gates hold.
- **Security:** no HTML/CSS/script from data; links are shop paths; images from Frrata's media host; contact form
  limits; studio actions behind staff roles or `requirePartner`; partner sees only own themes.
- **Unit economics:** staff time per theme; partners' value (shares) unchanged; contact form email cost small;
  `unit-economics-reviewer` at TS3 and TS4.
- **Blast radius:** `resolveStored` (one new lookup), `shop_theme_revisions` CHECK, Look's gallery and library, the shop
  routes (pages), Admin › Themes, the partner portal.

## Out of scope
Partner-written code; free CSS or per-breakpoint styles; composing headers and footers from blocks (v1); a partner
theme marketplace or sales; templated bag and checkout; the Storefront API (parked).

## Facts used
Research doc 2026-11-11 (two reports): Shopify (changelog 2026-03-30, 06-17, 07-21; Edition 2026-10-28; docs
undated), Wix (2026-10-05, 10-20, 11-04), Webflow (2026-03-26 … 10-28), Framer (2026-09-15, 10-27), WordPress
(2026-07-02 … 11-01), W3C (2026-08-10, 10-04), Baymard (2026-03-18, 06-12).
