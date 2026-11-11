# Plan: Theme Studio TS1 — pages and templates in Look
Status: TS1a built 2026-11-11 (as-built below; impact, security and tenancy reviews on the diff folded in) · board v2 approved by the owner 2026-11-11; addresses fixed once published, owner 2026-11-11 · TS1b, TS1c next · Date: 2026-11-11 · Spec: `docs/specs/2026-11-11-theme-studio.md`
(active; § 3 Pages and templates) · Mockup: https://claude.ai/artifact/X2TEDZRd7FyYvbiM6h6Jno (TS1a v2: Contact at /policies/contact; addresses fixed at first publish) · Reviews: architecture, tenancy, security, speed (2026-11-11, folded in below) · Legal: G.S.R. 789(E) read (frata-integrations § Consumer protection) · Builds on TS0b (blocks, designs)

## Goal
North star (5) a premium-looking storefront, (2) size and fit returns (FAQ and size answers in one place), and the
trust a COD-heavy shopper looks for before ordering (who runs this shop, how to reach them).
Measures (spec): About/Contact/FAQ live on ≥ 50 % of open shops 60 days after TS1a; every page at Lighthouse ≥ 60
performance and ≥ 90 accessibility; zero pages that state a fact the shop's Settings don't hold.

## TS1 is three phases (each its own board, reviews and approval)
| Phase | What owners get | Why this order |
|---|---|---|
| **TS1a Pages** | About, Contact and FAQ pages, made in Look from Frrata's page templates, at `/pages/<handle>`, published with the look; Contact = Chat on WhatsApp + the business details from Settings; FAQ answers for returns, delivery and pay on delivery follow Settings | The pages shoppers and the 2026 rules look for; no new read on any existing page |
| **TS1b Commerce blocks** | Product grid, Featured product, Collection tiles, Video and Date blocks; Signal 1.5 adds The drop, One piece, Behind the bench, The edits (board v2, TS0b) | Needs the per-source loader, the ≤ 24-card page cap and the worst-page gate on `next start` (speed review 2026-11-11) |
| **TS1c Templates** | Product and collection pages laid out from blocks around Frrata's buy box (one tested block; required parts can't be removed) | The product page sits at its script ceiling: server-only blocks first, measured |

This plan details **TS1a**; TS1b and TS1c get their own plans when TS1a ships.

## Decisions taken from the reviews (2026-11-11) — these replace what they contradict below
- **Contact stays at `/policies/contact`** (architecture blocker 1, security M2, speed): that address is live before a shop
  opens (Razorpay's KYC reads it; `/pages` sits behind "Opening soon"), and all four footers already link it. Contact is
  not a `/pages` page: it is always in the page picker, has no Title, Hide or Remove, and its template (the owner's line,
  Chat on WhatsApp, `PolicyBody` with the owner's rewrite if any) renders at the policy route. No redirect, no new
  footer link, **no read added to any shell**. Its live fill (one short line) rides the look entry (`look-v3`), which
  Publish and Undo already purge (speed option C). Add a page offers **About** and **FAQ** (one FAQ).
- **Every change reaches the shop only through Publish** (architecture blocker 2, security M1, speed LOW 8): a page's
  `draft` and `live` are each `{ title, handle, fill, hidden }`; Hide and Remove are draft intents applied at Publish
  (removed: `live := null`, `removed_at` stamped; a page never published is deleted outright). Page actions are
  `CAN_BUILD` and edit drafts only; Publish stays `CAN_MANAGE`; every page action refuses a support session. CAN_MANAGE's
  comment (`roles.ts`) names publishing the look and its pages.
- **The handle is fixed at first publish** (architecture minor, KISS): the title can change any time; the address is
  set while the page is a draft and locked once live. So no handle history, no redirects, no history table.
- **Publish and Undo, written out** (architecture blocker 3, tenancy HIGH): `publishRevision` and `undoPublish` return
  their new publish row's id (`returning`). Publish, under the `look:<t>` lock: for every page whose draft differs from
  live (and whose `version` matches what the editor holds), `previous := live`, `live := draft` (or null),
  `live_publish_id := <publish id>`. Undo (a new publish row): every page whose `live_publish_id` is the undone publish
  swaps `live ↔ previous` and takes the Undo's row id, so a second Undo brings the pages back too. Discard sets
  `draft := live` and deletes never-published pages. Page saves take the `look:<t>` lock and a per-page `version`.
  Rows removed in an earlier publish are deleted at the next Publish (Undo reaches only the last one).
- **One source for bound answers** (architecture 4, security PII): `boundAnswer(kind, facts, override)` in
  `domains/policies`: with the owner's rewrite of that policy, the answer links to the policy; without one, it is that
  paragraph of `renderPolicy`. `contact_details` is `PolicyBody` with the rewrite (today's behaviour, kept; the rewrite
  is the owner's own choice). `missingFacts` blocks Publish only when the Contact page is in this publish and its policy
  isn't rewritten. FAQ binds returns, delivery and pay on delivery; not sizes (a size chart belongs to a product type,
  shown on each product page).
- **Page blocks stay out of the theme catalogue** (architecture 8, security M3): a `PageLeaf` union in
  `src/domains/pages/` = TS0b's leaves + `contact_details`, `whatsapp`, and bound FAQ items; the bound kinds hold no data,
  carry no fill mark and never join `FillSchema`. A page's save: `cleanFill(fill, tenantId, host)` (lines 28-34 of
  `clean-images.ts` pulled out, used by both saves, tested cross-shop and outside), then `pruneFill` against the template,
  then the page limits.
- **Templates only add** (architecture 7): a committed snapshot of the three templates and a test (as
  `themeCheck(m, previous)`): no block removed or re-kinded, and no new `example` block in an existing template (that
  would block every shop's next Publish at deploy).
- **Tables (tenancy):** `shop_pages` with `unique (tenant_id, id)`; `(tenant_id, handle)` unique; `(tenant_id) where
  template = 'faq' and removed_at is null` unique (one FAQ); `live_publish_id` FK `(tenant_id, live_publish_id) →
  shop_theme_publishes(tenant_id, id)` (this migration adds `unique (tenant_id, id)` there); `version`; `draft` ≤ 32 kB by
  CHECK; the 20-page trigger (caller's rights, `set search_path = ''`, `pg_advisory_xact_lock(hashtext('look:' ||
  tenant_id))`, counts the tenant's rows, revoked from public/anon/authenticated/service_role); grants `select, insert,
  delete` + `update` on the editable columns only (never tenant_id, id, template); `revoke all` from anon, authenticated,
  service_role; frata_admin none; `tenant_rows` policy with `using` and `with check`. tenancy.sql gains the auditor's nine
  checks.
- **Reads (speed):** `shopPages(tenantId)` (scope `'pages'` in `shopCached` and `refreshShop`; key `['sf','pages-v1',t]`;
  tags `shop:<t>`, `shop:<t>:pages`; revalidate 86,400): live, visible pages only, read by the page route and the
  sitemap; Publish and Undo purge `shop:<t>:pages` with the look. Drafts come only from an uncached
  `previewPages(tenantId)` used by `/console/preview` and the customizer's `theme-preview` (never a draft flag on the
  shop route). Publish's readiness reads through `tx` (`lookFacts`), never a cached loader (P4). The 64 kB of live
  content a shop is checked at Publish, in bytes, under the lock.
- **The page route** (`src/app/s/[host]/(shop)/pages/[handle]/page.tsx`): ISR, unknown or hidden handle → 404 from the
  cached list (`Object.hasOwn`/Map lookups; handles refuse `RESERVED_IDS`); shares the shop card (no new card kind);
  `TIGHT` budget 113 kB; only About's first photo is `priority`; renderers in `src/components/storefront/shop-pages/`.
- **Blast radius named:** `editPhoto` (products/actions.ts) checks `shop_pages` (draft, live, previous) before deleting
  a product photo an About page uses; analytics `pathShape` learns `/pages/*`; the menus link picker lists live pages;
  `check:tenant` 6d; the customizer's Pages group, Add a page and page forms load with `next/dynamic` (the customizer
  stays ≤ 208 kB, thumbs drawn on the server).
- **Titles:** the `word()` rule (no `<>{}\`), no control or bidi characters; the description is the first text the
  owner wrote, never an example.
- **Legal (G.S.R. 789(E), read 2026-11-11):** Contact shows what Settings holds today (legal name, address, customer care
  and grievance officer with designation, email and phone). From 1 Jan 2027 r.4(2) also asks for branch addresses and
  landlines and the website's details: a Settings task before that date, listed in `frata-integrations`, not TS1a.
- **Fixed now, outside TS1a** (security H1, L1; live bugs): shop WhatsApp links carry 91 (`waLink`); `/policies/<x>`
  uses own keys.

## TS1a — design (what the owner sees: board)
- **Look › page picker** gains a **Pages** group: each page by its title, then **+ Add a page**.
- **Add a page:** three templates as pictures drawn from their blocks (TS0b's `thumbOf`): **About** ("Your story, your
  makers, your materials"), **Contact** ("WhatsApp and your business details"), **FAQ** ("Answers that follow your
  settings"). Contact and FAQ: one each (greyed with "Already added" once there). About may repeat (e.g. "Our makers").
  The page opens in the customizer with its form; the preview shows `/pages/<handle>`.
- **A page's form:** Title (→ the handle, editable, shown as the address), then the template's fields in page order, as
  a design's (TS0b form: example words greyed, "Write your own"). **Hide from the shop** and **Remove page**.
- **Contact:** what comes from Settings is shown as read-only rows with **Change in Settings** (shop name, legal name,
  address, customer care email and phone, grievance officer), and **Chat on WhatsApp** when Settings has a WhatsApp
  number (else the row says "Add a WhatsApp number in Settings"). The owner writes only an optional line above.
  A missing legal fact blocks Publish by name (as the Contact policy's "Missing details" already does).
- **FAQ:** questions with answers; the returns, delivery and pay-on-delivery answers are **bound** ("From your
  settings" chip, read-only, Change in Settings); the owner adds their own questions (≤ 12 in all), and their answers
  start as examples where a claim is made.
- **About:** heading, the story (example words), a founder or workshop photo, and three "makers or materials" cards
  (Made by hand's shape). Every claim is an example until written.
- **The shop:** `/pages/<handle>` in the shop's theme; the footer's Contact link goes to the Contact page once it is
  live (the policy route redirects there: one canonical URL); pages join the sitemap, share cards and menus' link
  picker. A page with nothing to show (hidden, removed) is "page not found".

## TS1a — model
- **Templates are Frrata's, not a theme's** (TS1a): `src/domains/pages/templates.ts` holds About, Contact and FAQ as
  designs (TS0b's blocks + two **bound** leaf kinds below); every theme styles them with its tokens. Per-theme page
  templates come with the studio (TS2). So a page's content never depends on the theme: it carries across every
  theme change untouched.
- **Two bound leaf kinds** (never owner-filled; rendered from Settings on the server): `contact_details` (the Contact
  policy's facts, by the same `renderPolicy('contact')` and `PolicyBody`: one source) and `whatsapp` (a button to the
  shop's own number from Settings; absent without one). FAQ items may be `bound: 'returns' | 'delivery' | 'cod'`,
  answered by the policy facts (`renderPolicy` pieces), never copied text.
- **Tables (one migration, with grants, RLS and policies; tenancy.sql rows):**
  - `shop_pages`: tenant_id, id, handle `^[a-z0-9-]{1,60}$` unique per tenant, template (`about | contact | faq`),
    title ≤ 60, `draft` jsonb (the owner's fill, ≤ 32 kB by CHECK), `live` jsonb null, `previous` jsonb null,
    `live_publish_id` uuid null, hidden_at, removed_at, created_at, updated_at. ≤ 20 pages a shop (trigger), one live
    Contact and one FAQ (partial unique indexes).
  - `shop_page_handle_history`: tenant_id, page_id, handle, retired_at (append-only, as products): an old address
    redirects to the new one.
- **Publishing:** the customizer's one **Publish** publishes the look and every page whose draft differs from its live
  content, in the same transaction (live := draft, previous := old live, live_publish_id := the publish). **Undo last
  publish** restores the look and every page whose `live_publish_id` is that publish (live := previous). One button,
  one undo, as today.
- **Reads:** one cached loader `shopPages(tenantId)` (tag `shop:<t>:pages`): the shop's live, visible pages (id, handle,
  template, title, live fill), ≤ 20 rows; the page route, the sitemap, the footer and menus read it. Publish and Undo
  purge `shop:<t>:pages` with `shop:<t>:look`. The Contact and FAQ bound blocks read the shop's settings and policy
  facts the page already has (`shopSettingsFor`), no new statement per block.
- **Route:** `src/app/s/[host]/(shop)/pages/[handle]/page.tsx`, ISR like products (`generateStaticParams = () => []`);
  an unknown handle 404s from the cached list (no query); a retired handle redirects. `SHOP_PATH` gains
  `pages\/[a-z0-9-]{1,60}`; `pageTags`, `parseCardPath` and the sitemap learn it.

## TS1a — design review (frata-planning § 3)
- **UI/UX:** owner in Look (phone-first customizer), shopper on the shop. States: no pages (the Pages group shows
  only "+ Add a page"), Contact with missing legal facts (Publish blocked, named; rows say what's missing), no WhatsApp
  number, hidden page, removed page (the address 404s; its handle can be reused after 30 days? no: kept in history),
  20 pages (Add greyed with the count), phone. Keyboard: as the section form.
- **Tenancy:** two new tables with tenant_id, grant, RLS and policy in one migration; reads through
  `src/lib/queries/` (`shopPages` cached per tenant, `pagesForEdit` in Look); tenant from `requireMember` and the host.
- **Modularity:** pure `src/domains/pages/` (templates, bound answers, handle rules, readiness); reads in
  `src/lib/queries/pages.ts`; actions in Look's `actions.ts` (add, save, rename, hide, remove; publish extends the
  look's); rendering in `src/components/storefront/pages/` reusing TS0b's block renderers.
- **SSOT / DRY:** legal facts only in Settings (rendered by `renderPolicy`); FAQ's bound answers from the same facts;
  page content only in `shop_pages`; the canonical Contact URL is the page when live (the policy route redirects).
- **YAGNI:** no contact form (Messages inbox, M·2), no per-theme page templates (TS2), no free page builder, no
  page-level SEO fields beyond title and the first text (derived description), no scheduling.
- **KISS:** a page is a design with a title and a URL; publishing rides the look's Publish.
- **Scalability:** ≤ 20 rows a shop; the loader's entry ≤ 20 × 32 kB worst (640 kB) — capped instead at **≤ 64 kB of
  live content a shop** (sum CHECK in the save) so the cached entry stays well under 1 MB.
- **Performance:** every shop page's shell reads `shopPages` once (cached, tag `shop:<t>:pages`) for the footer's
  Contact link and the menus: one cached read added to the shell, measured cold and warm (to be confirmed by the
  speed review; the alternative is a `contactLive` boolean on the shop's cached settings row). A page route: the shop
  (cached) + `shopPages` (cached) + settings (cached); HTML ≤ 120 kB; no client script.
- **Reliability:** no outbound call.
- **Security:** page fills are TS0b fills (kind-tagged, capped, plain); handle regex; bound blocks render facts only
  from Settings; no HTML; `cleanImages` covers page photos; Contact never shows a field the owner didn't fill.
- **Motion and visuals:** the theme's tokens; the accordion as TS0b.
- **Unit economics:** none.
- **Blast radius:** the look's publish and undo (`publishLookAction`, `undoPublish`), the footer, menus' targets,
  `SHOP_PATH`, sitemap, share cards, `pageTags`, the policy route (Contact redirect), Look's page picker.

## Legal source
The spec names "India E-Commerce (Amendment) Rules 2026 (notified 2026-09-09, in force 2027-01-01)": its text is being
verified by `integration-researcher` (2026-11-11) before the Contact template is fixed; the result goes into
`frata-integrations` with its date and source.

## Tasks (TS1a)
| # | Task | Verify |
|---|---|---|
| TS1a-0 | Regression net: e2e for the policy pages, footer and sitemap as they are | `npm run e2e -- --only seo,shop-look` |
| TS1a-1 | `src/domains/pages/` (templates, bound leaves, FAQ bound answers, handles, readiness) + tests | `npx vitest run src/domains/pages` |
| TS1a-2 | Migration (tables, RLS, triggers, indexes) + tenancy.sql + `src/lib/queries/pages.ts` | `npm run verify:tenancy`, `check:tenant` |
| TS1a-3 | Route, renderers, sitemap, SHOP_PATH, cards, footer link, policy redirect | `npm test`, build budgets |
| TS1a-4 | Look: page picker, Add a page, page forms, actions; publish and undo carry pages | e2e `73-pages` |
| TS1a-5 | Reviews on the diff, skills, ship | full e2e, impact-reviewer |

## Out of scope (TS1a)
The contact form; commerce blocks (TS1b); product and collection templates (TS1c); per-theme page templates (TS2).

## TS1a — as built (2026-11-11)
- **Data:** `shop_pages` (0099 table; 0100 access: RLS with separate select/insert/update policies and a delete policy
  that refuses a live page, content-column grants, the 20-page cap trigger that refuses another shop's row before
  taking the `look:<t>` lock, addresses unique per shop, one FAQ). Tenancy proof § 70 (cross-shop, no-shop, column
  privileges, policies, cap, FK to the shop's own publish). `shop_theme_publishes` gained `unique (tenant_id, id)`.
- **Domain:** `src/domains/pages/` (templates About and FAQ from TS0b blocks, the page-only FAQ block with items bound to
  Settings; `resolvePage`, `prunePage`, `pageIssues`, `pageDescription`); `src/domains/policies/answers.ts`
  (`boundAnswer`: the policy's own paragraph, or a link when rewritten). Templates only add (snapshot test).
- **Publish with the look:** `src/lib/themes/pages.ts` (`preparePages` inside `publishRevision` after the shop's lock;
  `undoPages` swaps live and previous and puts the draft back to what is live; `discardPages`; drafts compared with
  sorted keys: jsonb reorders them). `src/lib/themes/page-readiness.ts` (an example not written, Contact's missing
  details when its line changes). Publish requires each page's version.
- **Shop:** `/pages/<handle>` (ISR, 404 from the cached list), `PageView`; Contact's line and Chat on WhatsApp at
  `/policies/contact` (the line in the look's layer, carried across themes); sitemap; `SHOP_PATH`; analytics path;
  the Settings preview matches. Pages route 111.2 kB (gate 113).
- **Look:** the page picker's Pages group; `pages-panel.tsx` (dynamic): Contact, About and FAQ forms, Add a page;
  page edits save as drafts (flushed on close and before Publish). The Style tab's form now loads on demand: the
  customizer is 204.2 kB (gate 208).
- **Tests:** `pages.test.ts`, `pages.int.test.ts` (publish, untouched page not republished, Undo twice, Undo restores
  the draft, unparseable draft keeps live, hidden, Discard, remove), `blocks.test.ts` (cleanFill, Contact's line),
  e2e `73-pages`.
- **Fixed now, outside TS1a:** shop WhatsApp links carry 91; `/policies/<x>` own keys only.
- **Not done here (named):** a test of `addPageAction`/`savePageAction`/`removePageAction` through a signed-in member
  (covered by e2e add/save and by the int test's direct rows); the Discard dialog doesn't say a never-published page goes;
  Contact facts read twice (page-readiness and the customizer page) — one reader when Settings gains the 2027 fields.

---

# TS1b — commerce blocks (plan; board: TS0b board v2, approved 2026-11-11 "as drawn", its four TS1 designs)
Status: draft (reviews on this plan; no new board: The drop, One piece, Behind the bench and The edits are drawn on
https://claude.ai/artifact/DzD84DZsW6eGYQ6QkfJbM4 v2) · Date: 2026-11-11

## Goal
North star (5) a premium storefront that sells: the four designs owners asked for on the board put pieces, a drop
date, a workshop video and collections into a design. Measures: on the e2e seed with every design at its caps, home
HTML ≤ 300 kB and RSC ≤ 150 kB on a real `next start` (a gate); shop JS unchanged; block CSS ≤ 1.0 kB gz; 1.0–1.4
looks byte-identical (resolved-looks snapshot).

## Scope
- **Five blocks** (TS0b's catalogue, additive): `product_grid` (`SourceSchema` + count 4 | 8 | 12), `featured_product`
  (a handle), `collection_tiles` (mode, handles ≤ 8, count, shape — Collection tiles' own fields), `video` (≤ 1 a
  design), `date` (a drop date: "Drops Fri 14 Nov, 7 pm", never a ticking count; hidden once passed).
- **Signal 1.5.0** adds the four designs from board v2: The drop (heading, date, product grid, button), One piece
  (photo | featured product, words), Behind the bench (video | heading, words, button), The edits (heading, words,
  button | collection tiles). Designs stay on Home only (product and collection templates are TS1c).

## Decisions carried from the TS0b reviews (kept for TS1 then; they apply now)
- **Reads:** commerce blocks read the Home page's own catalogue (`ctx.cat`, already read) and its best-sellers ids:
  **no new statement**. `bestSellerWindows` walks design product grids with a best-sellers source. No loader in a
  block (`check:tenant` 6e). The small per-source loader waits for TS1c, where a template page has no catalogue read.
- **Listed pieces only:** product grid via `sourceProducts`, featured product via `lookPieces` (`isListed`): a
  scheduled piece never shows early (test).
- **Reuse with an inner list:** `Products` and `CollectionTiles` split into an inner list taking a heading level and
  an id prefix (no `<section>`/H2 of their own inside a design); Collection tiles' "at least 2 picked collections with
  products" rule shared.
- **Cards cap ≤ 24 a page** (speed 1), counted across everything that draws a card (Products incl. hidden tabs, price
  tiles, featured product, design product grids, collection tiles) — **only for looks on a version that offers
  designs**, and the save refuses only a change that adds or grows a design (old sections never cut). Commerce blocks
  ≤ 6 a page (design ones + Products, Collection tiles and Shop the look sections).
- **Video:** a design's one video is the section's top-level `video` (no video fill): `cleanVideos`, `referenced()`,
  `videosFor` work as they are; `VIDEO_KEYS` gains `design`; resolve's video rule reads `VIDEO_KEYS` and the theme's
  `videoSections`, and `resolveDesign`'s caller drops `video` unless the design has exactly one video block. The block's
  poster is its image fill; readiness says "add a photo or a video".
- **Date:** the schema keeps the ISO shape only (no clock in `domains`); "≤ 400 days ahead" is checked in the save
  with `now`; the renderer hides it once `ctx.now` passes.
- **Eager photos:** `ProductGrid` defaults `lead = false`; only the derived ≤ 2 eager list (the lead section's) asks
  for `priority`. The hover photo gets one `src`, not a srcset (≈ 1 kB a card).
- **Worst-page gate:** e2e `74-commerce` publishes a Home with every design at its caps (24 cards, 5-colour swatches,
  the longest titles, Devanagari words) and measures the HTML and `RSC: 1` payload on the real server (as
  `check:payload` does): ≤ 300 kB / ≤ 150 kB, or it fails.
- **Look:** the design form gains a source picker (Products' own control), a product picker, collection picks, the
  video field (`VideoField`) and a date input; all in the design form's dynamic chunk (customizer ≤ 208 kB gate).
- **themeCheck:** a design ≤ 1 video block; a commerce block's fill mark isn't `example`; Signal 1.5 against 1.4 only
  adds.

## Design review (frata-planning § 3)
- **UI/UX:** board v2 (approved). States: a source with nothing listed (the block is left out; readiness says so,
  never blocking), an unlisted featured piece (left out), a passed date (left out), no video yet (the poster photo
  shows), the card cap reached (the library greys the design with "24 product cards on this page already").
- **Tenancy:** no new table, no new read. Handles and collection picks resolve only against this shop's own cached
  catalogue; a video id only through `cleanVideos` (this shop's rows).
- **Modularity:** blocks in `blocks.ts` (+ `FillSchema` variants for source, handle, tiles, date), renderers in
  `components/storefront/blocks/` using the inner lists; no I/O in a block.
- **SSOT / DRY:** `SourceSchema`, `sourceProducts`, `lookPieces`, `ProductGrid`, the tiles list, Drop teaser's date
  rule (`dayIN`) — one each.
- **YAGNI:** no per-source loader (TS1c), no designs on product or collection pages (TS1c), no countdown.
- **Scalability / performance:** +0 statements; HTML/RSC by the gate; card cap; no new client script (server blocks).
- **Reliability:** no outbound call (a video is already uploaded through V1's flow).
- **Security:** fills tagged and capped; handle and source shapes as the sections'; video ownership by `cleanVideos`.
- **Unit economics:** none (Mux minutes already budgeted per shop by V1's caps).
- **Blast radius:** `Products` and `CollectionTiles` split (Home's sections must render byte-identically: e2e
  `05-shop-look` 0 px), `ProductGrid`'s `lead` default (Price tiles and every grid: priority only on the lead section),
  `VIDEO_KEYS`, resolve's video rule, `bestSellerWindows`, `designProblems`, the design form.

## Tasks (TS1b)
| # | Task | Verify |
|---|---|---|
| TS1b-0 | Regression net: shop-look 0 px and resolved-looks before; a "lead only" eager test | `npm run e2e -- --only shop-look` |
| TS1b-1 | Blocks + fills + resolve (video rule, card count), themeCheck rules, Signal 1.5.0 | `npx vitest run src/domains/themes` |
| TS1b-2 | Inner lists, block renderers, eager rule, best-sellers walk | `npm test`, 0 px |
| TS1b-3 | Design form fields (source, product, collections, video, date) | e2e `72-designs` extended |
| TS1b-4 | Worst-page gate `74-commerce`; reviews on the diff; ship; Signal 1.5 for release in Admin | full e2e |

