# Site content layer: what a brand edits itself, and how a site's code declares it
Status: draft (for the owner; nothing is built) · Date: 2026-11-14 · Mockup: none yet. Studio v2.5 and the brand's
Content screen are drawn after the owner's decisions (§ Owner decisions). · Approved: — · Evidence:
`docs/research/2026-11-14-studio-findings-verified.md` · Amends: ADR-0014 amendment 8 (proposed, in the ADR) ·
Pairs with: `docs/decisions/0016-site-code-ownership-and-reuse.md` (proposed)

## Goal
Ranked problems (5) a premium storefront built as code, and (7) festive-peak reliability. A code site must not make
every banner, sale date or FAQ typo a credit-paid agent session, a build and a publish. Measures, from the first
handed-over code site (V2): **≥ 90% of a brand's site changes after handover are content edits that need no build**;
a content edit is live on the site within 60 s; **≤ 30% of post-handover chat turns are content-only** (above that, the
site is missing fields); zero agent turns paid by a partner for a banner swap.

## Job
A brand owner changes what their site says (a sale's banner and its end date, the menu, the FAQ, the size help) from
the console on their phone, free and at once, while the partner and the agent own how the site looks and works.

## Research
- **Repository (verified 2026-11-14):** ADR-0014 amendment 3 already says content stays data, but nothing implements
  it. Today the content sits **inside the theme system**: menus and the Contact line in the look's layer
  (`src/domains/themes/layer.ts:63-66`), page words and the FAQ (with answers bound to shop facts) in `shop_pages`
  (`src/lib/db/schema-themes.ts:63`, `src/domains/pages/templates.ts`), edited in the Look customizer that V5 removes;
  the announcement is an offer (`src/lib/queries/announcement.ts:8`). The Storefront API's § 3 has policies and the
  offer announcement, no pages, FAQ, menus or banners. The kit spec defers "the source that replaces the look layer's
  `site`" to a V1.5 spec that does not exist (`docs/specs/2026-11-12-kit-and-fleet.md:105`). The Studio mockup v2.4 puts
  menus, collection pages, a banner and a season's dates through the agent (findings C1–C7).
- **Products** (design patterns only; **no current source checked in this pass**, so unverified until the V1 plan's
  research step dates them, per `frata-planning` § 2):
  - Shopify: theme sections declare their settings in `schema`, and the theme editor draws the merchant's form from
    it, so a developer's code and a merchant's words meet in one contract. **Taken:** the code declares; the console
    draws.
  - Headless CMSs paired with Next.js (Sanity, Contentful, Storyblok): content models are typed fields the editor
    renders, values arrive over an API with webhooks or revalidation. **Taken:** a closed set of field types; content
    purged by tag, never rebuilt.
  - Indian D2C practice: banners run by date for sales and festivals, often ending at midnight. **Taken:** every
    placement can carry a start and an end.
- **Unchanged facts used:** the 3× rule and the credit (₹6.33 measured, ₹19) from ADR-0014 amendment 1; a turn
  measures ₹5–150 (≈ ₹15–450 at 3×).

## Design

### Three layers
| Layer | Examples | Who edits | Where | What it costs | Reaches the shop |
|---|---|---|---|---|---|
| **Content** | Announcements with dates; banners and other placements the site declares; featured collections or products; menus; page words; FAQ; size help; a season's dates and words | The brand (and the partner while building) | Console › **Content**, phone first | Free | Saved, then live within 60 s (tag purge); scheduled ones at their time |
| **Design system** | Colours, fonts, logo, radius, spacing, buttons; a season's tokens | The partner (the brand later) | Studio: chat, or **direct edits on the preview** (V3) | No agent turn; the preview's sandbox seconds and the publish build count against the plan's build allowance | A commit; a person publishes after the checks |
| **Structure** | New page types, layouts, components, sections, apps on the site | The partner with the agent | Studio chat: plan, files, checks | Credits (3×) | A commit; checks; a person publishes |

The brand gets the chat later (ADR-0014 rule 4); the content editor stays theirs either way.

### Content kinds (one source from V1, read by theme shops and code sites alike)
| Kind | Fields | Rules |
|---|---|---|
| Announcement | ≤ 3 messages: text (≤ 120), link (shop path), from, to | The offer bar stays an offer (`offers`); a written message shows first while live |
| Menus | Header and footer, as today's `MenusSchema` | Links only to shop paths (`shopPath`), as today |
| Pages | About, Contact line, size help, any added page: title, handle, plain text blocks | Words only; a code site lays them out; a theme shop renders them with today's templates |
| FAQ | ≤ 12 questions, answers typed or **bound to shop facts** (today's bound answers) | Bound answers come from the shop's facts at read time, so COD and returns never go stale |
| Season | Name, from, to, badge words, on/off | Its **tokens** stay in the site's design system (layer 2); its dates and words are content |
| **Placements** (V2) | What the site's code declares (below) | Only for code sites |

### The editable-fields contract (V2)
- The site declares its placements in **`frrata/fields.json`** (kit), for example
  `{ "version": 1, "placements": [{ "id": "home.hero", "label": "Home · Hero", "max": 3, "fields": [
  { "key": "image", "type": "image", "required": true }, { "key": "heading", "type": "text", "max": 60 },
  { "key": "link", "type": "link" }, { "key": "when", "type": "schedule" } ] }] }`.
- **Field types, a closed set:** `text` (max), `longtext` (plain, max), `image` (a Frrata media id with alt text),
  `link` (a shop path or the shop's own WhatsApp or Instagram), `collection`, `products` (≤ 12), `schedule` (from,
  to), `choice` (values the site declares), `toggle`. A new type is an API version change.
- `frrata check` and the publish gate validate the file (ids, types, caps; ≤ 40 placements, ≤ 12 fields each). The
  gate stores the declaration **with the published version**; the console draws the editor from the version that is
  live. A value for a placement no longer declared is kept and marked "Not on your site now".
- Each placement ships with defaults in the declaration, so a new site shows something before the brand edits.

### Storefront API additions (version `2026-12`, not yet released: additive)
- `content` — announcements live now, menus, the season live now (no tokens), the list of pages (handle, title).
- `pages/{handle}` — a page's words; `faq` — questions with answers (bound answers resolved).
- `placements` (V2) — every declared placement's live entries (schedule applied: a future entry is never served
  before it starts, so a planned sale does not leak), typed by the declaration; plus `nextChangeAt` so the site can
  revalidate at a midnight end.
- Plain text only (SA § 3 rule); images as Frrata media URLs; links as shop paths. Cached 60 s, tagged
  `content:<tenant>` (its own small entry; a save purges only it, never the catalogue entry).

### Console › Content (the brand's editor)
- Phone first. Sections: Announcement · Placements (V2, from the live version's declaration) · Menus · Pages · FAQ ·
  Season. Save is live with **Undo** (§ Feedback); anything with dates shows "Live now", "Starts 15 Nov 10:00" or
  "Ended". A preview shows the item on the live site's page at phone width (signed preview link).
- Who: `CAN_BUILD` (owner, admin, partner) as the Look today; staff read only. Every save audited (support visits as
  today).
- The Look's Menus and Pages panels become links to Console › Content at V1 (one source; themes get no new feature).

### Studio mockup v2.5 (the mockup file is v2.4, `6c8634a7`; these are the changes to draw)
1. **Routines:** remove "Refresh the New in row" (C1) and "Add it to the menu and make its page" (C2): the kit's New
   in section reads the API, menus come from the console, collection pages are one dynamic route. Show real agent
   work instead: a monthly speed and accessibility pass, applying a kit update, a seasonal redesign (each asks before
   publishing).
2. **Inbox (C3):** "Festive banner design · 3 variants" stays agent work; add a quiet activity line "Riya changed the
   hero image and its end date (Content)" so swapping a banner is visibly the brand's own job.
3. **Build › Data (C4):** a group "Content · edited in the console": announcements, placements, menus, page words,
   FAQ, size help, season dates.
4. **Build › Editable** (new rail tab): the placements this version declares, their fields and defaults; a warning
   when a page's words sit in code ("Questions page: words in code; move them to Content").
5. **Hand over (C5):** a step "Riya can change these herself, free" listing the declared placements and content
   kinds, with a small preview of Console › Content.
6. **Seasons (C6):** the season's tokens in the design system; "Dates and words: in Riya's console" with the dates
   shown read-only in Studio.
7. **Pages (C7):** Contact and Questions say "Words: Content › Pages"; the Files tab shows `content.page('questions')`,
   not copy in code.
8. **Hand edits in the chat (A4):** a hand edit adds a line to the chat ("You changed Primary to #8B2E2E · v13"), as
   the shell spec already says.
9. **Wishlist heart:** per the owner's decision (remove, or "Saved on this phone").
10. **Agency starter:** "Atelier · Pixel & Thread · your agency starter" gains "components and layouts only; no brand
    files" (ADR-0016).
11. **New screen:** the brand's Console › Content at phone width (announcement with dates, a placement with three
    rotating entries, menus, FAQ with a bound answer, season dates).

### Where each item falls (phases as in `docs/specs/2026-11-11-agentic-storefront.md`, with the kit spec's V1.5)
| Phase | This plan's items |
|---|---|
| **V1** (Storefront API SA1) | The content store and Console › Content for the fixed kinds; theme shops read it (one source); the `content`, `pages`, `faq` resources; the starter reads them; collection filters by size, colour, price (D2; the facts exist in `listing.ts`); the 600-listing cap written into the docs with its reason (D3) |
| **V1.5** (brand tokens) | Seasons: tokens in the design system, dates and words from content |
| **V2** (hosting) | `frrata/fields.json`, the gate's validation, `placements`, the Placements editor; **gate: Console › Content live before the first code site is handed over**; Hand over shows what the brand edits |
| **V3** (Studio) | Direct edits on Studio's preview as commits with no agent turn, mirrored in the chat; the Editable tab; routines limited to real agent work; brands get the chat later |
| **V4** (gallery) | Agency starters (private) and the gallery, per ADR-0016 |
| **V5** (themes removed) | Nothing left to move for content: the Look's panels already point to Console › Content |
Watch after V2: post-handover chat turns that are content-only (target ≤ 30%).

### Storefront and API gaps found on the way (to fold into SA1's plan)
- D2 filters: `collections/{handle}/page/{n}?size=&colour=&price=` over the cached entry, in memory.
- D3: listings stop at 600 (`MAX_LISTED`, the 2 MB cache entry). A catalogue above 600 needs keyset pages read past
  the cached entry: its own speed review before V1 ships to a large catalogue.
- D4 wishlist: no shopper data on a site; a wishlist "saved on this phone" (local storage, like the bag) is possible.
  A cross-device one needs sign-in, which stays on Frrata (EkCode later).
- D5 reviews: follows the module contract when Reviews leaves `next` (SA § 5), no earlier.
- D6 third-party scripts: deferred by the owner ("a later stage"); if wanted, a reviewed list per script with its own
  CSP and consent text, never a free field.

## Design review
- **UI/UX:** the job is "change what my site says"; one primary action per section (Save, live, with Undo). States:
  empty (defaults from the declaration), scheduled, live, ended, "Not on your site now", no permission (staff), phone.
  Feedback after every save (live within 60 s, said once). Constraints over refusals: links chosen from the shop's own
  paths, images from the media library, dates from a picker. Rule 0: no help text but limits.
- **Tenancy:** one table `site_content (tenant_id, kind, key, value jsonb, starts_at, ends_at, updated_at,
  updated_by)` with grant, RLS and policy in its migration; V2 adds `site_field_declarations (tenant_id, deployment_id,
  declaration jsonb)`. The API reads them by the key's tenant (SA0's third tenant source); the console through
  `requireMember`. `tenancy-auditor` on the migration.
- **Modularity:** pure `src/domains/content/` (kinds, field types, schedule rules, validation of a declaration); reads
  in `src/lib/queries/content.ts`; the API's mappers in `src/domains/storefront-api/2026-12/`; the editor under
  `src/app/(console)/console/content/`.
- **SSOT / DRY:** one content source for theme shops and code sites; the bound FAQ answers stay derived from shop
  facts; a placement's shape is the site's declaration, stored once per published version.
- **YAGNI:** no rich text, no HTML, no per-locale copies (Hindi later, as a field), no content drafts beyond schedule
  and Undo, no brand chat, no third-party scripts.
- **KISS:** a closed set of field types in one JSON file; save is live; tag purge, never a build.
- **Scalability / performance:** a few hundred rows a shop; one small cached entry per shop under its own tag; a save
  purges one entry; schedule edges through `nextChangeAt` and the 60 s revalidate, not a cron. `speed-reviewer` on the
  plan.
- **Reliability:** no outbound call; a failed save says nothing changed.
- **Security:** plain text only, capped; links only shop paths and the shop's own social links; images only media ids;
  a future entry never served early; the declaration validated by the gate (it comes from site code); partner edits
  audited and limited by the partner's scope; support visits audited as today.
- **Motion and visuals:** § Feedback toasts; a placement's preview card; no new motion.
- **Unit economics:** content edits run no model, sandbox or build: free and inside the 3× rule. Design-system direct
  edits use sandbox seconds and a build at publish: inside the plan's build allowance or at 3×. `unit-economics-reviewer`
  on the plan.
- **Theme blocks:** none added; the Look loses its Menus and Pages panels to Console › Content at V1 (themes frozen:
  this is moving content out, not theme work).
- **Blast radius:** the Look customizer (menus, pages panels), the shop's renderers for menus, pages and FAQ,
  `shopAnnouncement`, the Storefront API spec § 3, the kit (`@frrata/core`, the starter), Studio's routines, Data and
  Hand over, the partner's handover flow.

## Out of scope
Rich text and HTML (signal: a brand cannot say what it needs in plain blocks) · content in languages beyond the
shop's (signal: Hindi asked for) · a brand's chat (ADR-0014 rule 4) · third-party scripts (owner: later) · a
cross-device wishlist (signal: EkCode sign-in on sites).

## Owner decisions
1. **Adopt the three layers** (content, design system, structure) as ADR-0014 amendment 8 words them.
2. **Console › Content as a gate** before the first code site is handed over (V2), and as V1 work for theme shops too
   (one source).
3. **Partners bring their own agent before Studio:** V1 plus the kit first; build Studio V3 only once V1's signal is
   passed comfortably (the kill line is < 3 external sites in 90 days).
4. **Free direct edits** to the design system in Studio (no agent turn; sandbox and build inside the plan allowance).
5. **Ownership and agency starters** as ADR-0016 proposes; partner terms updated with counsel.
6. **Third-party scripts:** stay deferred, or a reviewed list (which first: analytics, chat, reviews widgets).
7. **The wishlist heart:** remove, or "saved on this phone".
8. **Themes' move to code:** write down that live looks keep working and that Frrata moves them free (today the kit
   spec prices migrations for shops with no partner in credits, KF:271).
9. **Code export:** the kit spec says "any time" (KF:211-212), the owner's later answer says "later" (IT:11); one
   wording for both.

## Facts used
ADR-0014 (amendments 1, 3, 4, 6, 7); Storefront API spec § 3–5, 8 (`2026-12`, 60 s, 48 a page, 600 cap); kit and fleet
§ 2, 4, 7; Studio and intake specs (credits after handover, owner 2026-11-12); `frata-unit-economics` 3× rule. No
third-party fact is relied on; the Shopify, CMS and festival-banner notes are unverified until dated.
