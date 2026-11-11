# Plan: Theme Studio TS0b — blocks, as designs in Signal 1.4
Status: built 2026-11-11 (as-built below; impact and security reviews on the diff folded in) · board v2 approved by the owner 2026-11-11; scope: two designs · Date: 2026-11-11 · Spec: `docs/specs/2026-11-11-theme-studio.md`
(active; v2 approved by the owner 2026-11-11; § 2 Blocks) · Mockup: https://claude.ai/artifact/DzD84DZsW6eGYQ6QkfJbM4 (v2: date line, not a countdown) · Reviews: architecture, security, tenancy, speed (2026-11-11, folded in below)

## Goal
North star (5) a premium-looking storefront, and (2) size and fit returns (the Size help design). The block catalogue
the studio (TS2) will build with reaches real shops **first as code**: Signal 1.4 offers six **designs** (sections
built from blocks), which owners add, fill and publish in Look like any section. Nothing changes for a shop until its
owner moves to 1.4 and publishes.
Measures: on the one live Signal shop and the e2e seed, home HTML ≤ 300 kB and RSC ≤ 150 kB with every design added;
first-load JS on shop routes unchanged; block CSS ≤ 1.0 kB gz; the largest-allowed-page test holds; e2e `05-shop-look`
0 px and the resolved-looks snapshot byte-identical for every 1.0–1.3 look; no shop changes without its Publish.

## Owner decision (2026-11-11, after the reviews)
**Two designs now: Size help and Made by hand** (8 of the 13 kinds: section, columns, group, heading, text, image,
button, accordion). Product grid, featured product, collection tiles, video and the date block move to **TS1**, with
the small per-source loader, where product and collection templates need them. So TS0b adds no product card, no
video, no date and no commerce read to any page; the decisions below about cards, the loader, video and the date
apply when those blocks arrive in TS1 and are kept here for it. Board v2 approved as drawn (the four other designs on
it are TS1's).

## Decisions taken from the reviews (2026-11-11)
- **Old sections are never cut** (architecture blocker 1): resolve cuts only design blocks; today's Products,
  Collection tiles and Shop the look count toward the page totals only when deciding whether a design block fits; the
  save refuses only a change that adds or grows a design. A 1.0–1.3 look resolves byte-identically (snapshot).
- **Fills are tagged** (architecture 3, security M2, tenancy HIGH): `Fill = z.discriminatedUnion('kind', …)`, each
  variant `.strict()`; the record is keyed by the block-id regex, ≤ 40 entries by refine, read with `Object.hasOwn`,
  built with `Object.fromEntries`; `themeCheck` refuses block ids `constructor`, `prototype`, `__proto__`.
  `cleanImages` maps every fill through `switch (f.kind) … satisfies never`. The save prunes the fill to (design id,
  block id, kind) of the manifest it has; `resolveDesign` reads a fill only on a block of its own kind; a fill's caps equal its block's (keep them equal; a
  block with tighter limits re-parses its fill).
- **No video fill** (tenancy MEDIUM): a design's one video is the section's top-level `video`; `Fill` has no video
  variant. resolve.ts:111's hard-coded `hero || image_text` becomes `VIDEO_KEYS` plus the theme's `videoSections`, and
  `resolveDesign` drops `video` unless the design has exactly one video block (security M1, tenancy LOW). The video
  block's poster is an image fill; readiness says "add a photo or a video".
- **The editor keeps stored shapes** (architecture 2): `ResolvedTheme.home` stays `SectionInstance[]`;
  `ResolvedTheme.designs` holds only the designs in use; the renderer, readiness (server and the editor's in-browser
  copy) and the form each call the pure `resolveDesign(design, fill)`. The Editor gets the designs as props.
- **Sample photos never reach a shop** (architecture 6, security L3): `resolveDesign` on the shop renders nothing for
  an unfilled image or an untouched example block (example words never reach a shop by construction, not only by
  readiness); only the preview's merge (`sample.ts`, which learns designs) shows samples. A test holds that shop HTML
  never contains `/themes/samples/`. The samples-only walker covers the whole `designs` tree.
- **Bytes, not characters** (architecture 5, security L4): the save measures the layer's JSON bytes before
  `saveDraft` and refuses over 60 kB in words ("This look is too long to save; shorten or remove a section");
  `look.int.test` saves Hindi at every cap. Caps agree: accordion 12 × (80 + 600) fits by making the fill total
  ≤ 10,000 characters and `MAX_PER_PAGE.design` 4; the page's owner words are ≤ 24 kB in bytes (`PAGE_LIMITS.textBytes`),
  so Devanagari is refused by bytes, in words.
  runs, run text `min(1)`, link length counted); the runs renderer is pulled out of RichText and shared.
- **The date block, not a countdown** (architecture 11; design language rule 48: real ends, never a ticking count):
  `date` shows "Drops Fri 14 Nov, 7 pm" as Drop teaser does and hides once passed; the schema keeps only the ISO shape
  (no clock in `domains`, security M3); "≤ 400 days ahead" is checked in the save with `now`.
- **Save order** (architecture 8): `designProblems(m, home)` runs after the manifest is read (actions.ts:84), with
  `pageLimits`; `layerProblems` stays manifest-free.
- **Carry only within the theme** (architecture 9): a design comes across only to the same theme key with that design
  id; every other case writes a `lost` line naming the design (carryOver's key-only rule would drop it silently).
- **Listed pieces only** (tenancy LOW, security L5): featured product and product grid use `lookPieces` /
  `sourceProducts` (`isListed`), tested with a scheduled piece. Readiness reads no handles (no new read): an
  unlisted piece hides at render only.
- **Reuse with an inner list** (architecture 14): Collection tiles and Products split into an inner list taking a
  heading level and an id prefix; Collection tiles' "at least 2 picked collections with products" rule reused.
- **Headings** (architecture 15): heroes keep their h1; a design's first heading is h2, deeper h3.
- **CSS budget** (architecture 16): `CSS_BUDGET_KB` + 1.0 (check-storefront-build.mjs:25), not a separate sheet.
- **No per-block button style** (architecture 17): buttons follow the theme's `buttons` setting.
- **themeCheck(m, previous?)** gains the previous-version argument (a minor only adds) and checks that every design a
  manifest's home names exists (architecture 18).
- **Blast radius named** (architecture 10): sections-panel (`summary`, `blank()` with a design id), the library's
  `onAdd` signature and `SectionThumb`, `section-search.test.ts`, `searchSections`, the Admin version page's "new
  section" line, `sections-snapshot.test.ts` (design and block schemas: the spec's catalogue snapshot).
- **Designs render on home only until TS1**; the spec's gate "no loader in a block" (`check:tenant`) lands with the
  renderers.
- **A minor that adds an example block** blocks a later Publish of a shop that took the update until its owner writes
  the words (said in the update notes).

### Speed review (2026-11-11) — over budget as first written; fixed here
- **The spec's ≈ 298 kB was wrong** (speed 1): measured 5.7–10.8 kB of HTML a card, 2.1 kB a photo; 36 cards alone
  ≈ 210 kB HTML / 104 kB RSC, ≈ 328 / 165 with cut swatches; the worst allowed page ≈ 370–480 kB. Limits become: **≤ 24
  cards a page counted across everything that draws one** (Products incl. hidden tabs, price tiles, featured product,
  tiles) for looks on a version that offers designs, **≤ 24 kB of owner text a page in UTF-8 bytes**, **≤ 12 photos
  outside cards**; the hover photo gets one `src`, not a srcset (≈ 1 kB a card). Looks on 1.0–1.3 are untouched.
- **The worst-page test is a gate on a real `next start`** (curl the HTML, `RSC: 1` as `check:payload` does), with
  5-colour cut swatches, the longest titles and Devanagari at the cap — not `renderToString`.
- **Eager photos** (speed 5): `ProductGrid` defaults `lead = false`; the derived ≤ 2 eager list owns every section and
  block (today's Price tiles emits up to 8 `fetchpriority=high`; fixed with it, P15).
- **One chevron** (speed 6): the accordion's chevron is one CSS mask on `summary`, not an icon per item.
- **Customize is already at 208.2 kB against 190** (speed 4, existing debt): design thumbs are drawn on the server and
  passed as elements (like the icons at page.tsx:76); `pageLimits` lives in a module without Zod; the design form is a
  `dynamic()` chunk; the Console gate the spec names lands at 208.2 + 0 so nothing grows while the debt is paid.
- **CSS** (speed 7): block rules are the `.store-b-*` rules (unlayered, like base.css), gzipped alone by `check-storefront-build` (≤ 1.0 kB);
  `CSS_BUDGET_KB` stays 15.9 so utilities are caught too (supersedes architecture 16).
- **Statements**: +0 on home (one cached Best-sellers window at most when a design is its only reader; never beyond
  today's two). `shopVideos`' key changes once per Publish. No tree crosses into a shop island.
- **The loader deviation** (speed 8, architecture 4): recorded in the spec; `check:tenant` gains "no loader import in
  `components/storefront/blocks/`" now.

## Regression net first (rule 5)
- `05-shop-look`, `47-look`, `48-themes-*`, `65-signal`, `66-video`, `64-seo` green before and after; resolved-looks and
  released-manifests snapshots unchanged; `stored-sections-v*.json` keep parsing (append a v-next fixture with design
  sections, never edit).
- New unit nets before the renderers: `blocks.test.ts` (schemas, depth, accepted children, limits, heading levels,
  eager images, fill carry), `check-theme.test.ts` design rules, `clean-images.test.ts` design case,
  `layer.test.ts` design carry and lost lines, `readiness.test.ts` design issues.

## Design (what the owner sees: mockup board)
- **Look › Add a section:** the library's first group is **Designs** ("Made for Signal"): its designs as pictures **drawn from their
  block tree** (one pure `designThumb(tree)` → the same wireframe SVG the library draws for sections; no image files
  to keep in step). Search covers each design's name, line and tags. A full page greys the card with its limit.
- **A design's form:** the fields the theme marks for the owner, in page order, each with the theme's label
  (Heading, Words, Photo, Button, Pieces, Questions, Date). Questions: a list with ↑ ↓ and Remove beside each item
  (WCAG 2.5.7), Add up to 12. Scheme and Hide as every section.
- **Example words:** a field the theme marks `example` (claims: "Hand-stitched in Agra", size answers) shows its
  example greyed in the form; Publish is blocked until the owner writes their own, and readiness names the field
  ("Size help: write your own answer for 'Between two sizes'"). Headings and button words are plain defaults.
- **The shop:** server components; phone first; Columns stack or swipe (CSS scroll-snap, no script); Accordion is
  `<details>`; the Date block reuses Drop teaser's date line (never ticks; hides once passed); empty photo, unlisted piece or empty
  grid: that block renders nothing, and a design with nothing left renders nothing.
- **Changing theme:** a design comes across only to a theme (or version) that has the same design id; otherwise Try
  lists "Size help isn't in Atelier" (today's `lost` list). A recall from 1.4 to 1.3 says the same.

### The six designs drawn on the board (Signal 1.4 ships the first two; the rest are TS1's)
| Design | Tree | Blocks |
|---|---|---|
| Size help | Columns 2 [Group: Heading, Text·example, Accordion(3 Items·example), Button → /policies/returns] [Image] | Columns, Group, Heading, Text, Accordion, Item, Button, Image |
| Made by hand | Heading; Columns 3 (swipe on phone) of Group [Image, Heading, Text·example] | Columns, Group, Image, Heading, Text |
| The drop | Heading, Date, Product grid (collection, 4), Button | Date, Product grid |
| One piece | Columns 2 [Image] [Featured product, Text·example] | Featured product |
| Behind the bench | Columns 2 [Video (≤ 1 a design; the photo is its poster)] [Heading, Text·example, Button] | Video |
| The edits | Columns 2 [Group: Heading, Text, Button] [Collection tiles (circles, 4)] | Collection tiles |

## Model (pure, `src/domains/themes/blocks.ts`)
- **Block** = `{ id, kind, …its settings, fill?: { label, example? } }`. `id` matches `^[a-z0-9-]{1,40}$`, unique in
  its design and **stable across versions** (carry-over by (design id, block id)). Kinds (13): `section` (the design's
  root, implicit), `columns` (2–4; `phone: stack | swipe`), `group`, `heading` (`size: s|m|l`), `text` (runs, ≤ 2,000
  chars; bold, italic, shop-path links), `image` (`ratio: 4:5|3:4|1:1|16:9`; default from `/themes/samples/` only),
  `video` (≤ 1 a design; no default video), `button` (label ≤ 24, shop path; the theme's button style), `accordion`
  (`items` ≤ 12, q ≤ 80, a ≤ 600), `date` (heading ≤ 60, `at` ISO; ≤ 400 days ahead checked at save), `product_grid`
  (`SourceSchema`, count 4|8|12), `featured_product` (handle), `collection_tiles` (mode/handles/count/shape as the
  section's).
- **Explicit three levels**, no `z.lazy`: `Leaf`, `Group = { kind: 'group', children: Leaf[] }`, `Columns = { kind:
  'columns', children: (Group | Leaf)[] }`, root `children: (Columns | Group | Leaf)[]` — depth 3 below the section by
  construction; Accordion › Item counts as one level.
- **Design** = `{ id, name ≤ 40, line ≤ 80, tags ≤ 8, children }`; `ThemeManifest.designs?: Design[]` (≤ 30);
  `ManifestSchema` gains `designs` (strict; parity holds; every image base from samples).
- **Owner's instance** (stored in the layer like any section): `{ id, key: 'design', hidden, scheme, label, design:
  <design id>, fill: Record<blockId, Fill>, video? }`. `Fill` is one of `{ runs } | { text } | { image } | { button } |
  { source, count } | { handle } | { items } | { at } | { tiles }`, each with the block's caps; `fill` ≤ 40 entries and
  ≤ 6,000 characters in all; **the design's one video lives in the section's top-level `video`**, so `cleanVideos`,
  `referenced()`, `videosFor` and resolve's video rule work unchanged (`VIDEO_KEYS` gains `design`).
- `SectionSchema` stays context-free (shape and caps). **`resolveDesign(design, fill)`** (pure) merges: a fill entry
  whose block is gone, or whose kind no longer matches, drops alone (part by part); an unknown design drops the
  section. The resolved instance carries its merged tree, so renderers never read the manifest.
- **Limits** (pure `pageLimits`): ≤ 20 sections (today), `MAX_PER_PAGE.design` 6, ≤ 100 blocks a page, ≤ 24 cards a
  page (speed review), ≤ 6 commerce blocks a page (product grid, featured product, collection tiles, and today's Products,
  Collection tiles and Shop the look sections count). Checked at save (`saveLookAction`, which has the manifest) with
  the reason in words, and again at resolve (only design blocks are cut, in document order; today's sections never).
- **Derived, never stored:** heading levels (`headingLevels(page)`: the page's h1 stays the first Hero's or the sr-only
  shop name; a design's first heading is h2, deeper ones h3, never skipping); eager images (≤ 2 a page in document
  order; only the lead section's); motion from the theme's tokens (reduced motion as today).
- **`themeCheck`** learns designs: ids unique (designs and blocks), accepted children, ≤ 30 designs, ≤ 40 blocks a
  design, ≤ 1 video, a default image's alt or decorative, `example` only on text and items, buttons' links shop paths,
  and **a minor only adds** against the previous version (no design or block id removed or re-kinded).

## Where things go
| Piece | File |
|---|---|
| Block and design schemas, `resolveDesign`, `pageLimits`, `headingLevels`, `designThumb` data | `src/domains/themes/blocks.ts` (new, pure) |
| `DesignSectionSchema`, `SECTION_KEYS`, `MAX_PER_PAGE`, `VIDEO_KEYS` | `src/domains/themes/sections.ts` |
| Manifest `designs` | `types.ts`, `manifest-schema.ts`, `check.ts` |
| Resolve, carry and lost | `resolve.ts`, `layer.ts` |
| Photos and readiness | `clean-images.ts` (exhaustive `design` case: every image fill), `readiness.ts` |
| Best sellers windows, videos, shell | `src/lib/themes/page-look.ts` (`bestSellerWindows` walks design trees) |
| Renderers | `src/components/storefront/blocks/` (server only; `sections/index.tsx` gains `case 'design'`) |
| Block CSS | the storefront stylesheet, one rule per data attribute; `check-storefront-build` gains the ≤ 1.0 kB gz budget |
| Signal 1.4 | `src/domains/themes/catalogue/signal/1.4.0.ts` (1.3 + `designs`, `allowed.sections` + `design`) |
| Look | `section-library.tsx` (designs group), `design-form.tsx` (new, `dynamic()` like the story forms), editor wiring |

## Design review (frata-planning § 3)
- **UI/UX:** owner in Look (console look), shopper on the shop; one primary action each (Add; fill). States: library
  empty search, full page (greyed with the limit), design with example words (Publish blocked, named), empty photo
  (preview shows the sample greyed; the shop hides the block), unlisted piece, passed date, phone. Keyboard:
  library as today; form fields in page order; item ↑ ↓ buttons beside every drag. Norman: the picture is the
  signifier; constraints (the theme's structure) over refusals; Undo as every edit.
- **Tenancy:** no new table, no migration, no new read. Owner content stays in `shop_theme_revisions.settings`
  (tenant policy). Photos only through `cleanImages` (this shop's theme folder or its product photos); videos only
  through `cleanVideos` (this shop's rows). Tenant from `requireMember` as today.
- **Modularity:** pure engine in `domains/themes`; renderers in `components/storefront/blocks`; no new action — the
  existing save, publish and try actions.
- **SSOT / DRY:** a design's structure in its manifest only; the owner's words in the layer only (by block id); commerce
  blocks reuse `SourceSchema`, `sourceProducts`, `ProductGrid` and the Collection tiles renderer; the Date block reuses
  Drop teaser's date rule; the library thumb is derived from the tree.
- **YAGNI:** no owner structure edits, no free CSS, no new token, no designs on product or collection pages (TS1), no
  small per-source loader yet (home already reads the catalogue once; pages without it arrive in TS1, and the loader
  with them), no Quote or Feature list.
- **KISS:** a design is a section whose shape the theme fixes; the owner fills it like any section form.
- **Scalability:** nothing per tenant beyond the layer's bytes (≤ 64 kB, the database check; the save says so in words
  before the insert fails).
- **Performance:** (a) home adds **no statement** (blocks read `ctx.cat` and the best-sellers ids already read); (b) no
  new query; (c) the look entry grows by the fills only (≤ 6 × 6,000 chars); (d) largest allowed page test on the
  600-product seed: HTML ≤ 300 kB, RSC ≤ 150 kB; (e) writes as today (`shop:<t>:look` on Publish only); (f) shop JS
  unchanged (server components; no new client file on any shop route; the customizer's design form is a dynamic
  chunk); (g) ≤ 2 eager images, no new font.
- **Reliability:** no outbound call.
- **Security:** every Fill capped and plain; links shop paths only; nothing rendered as HTML (runs node by node);
  design and block ids anchored slugs; `fill` key count and total characters capped; manifest images samples only;
  owner photos through `cleanImages`; video through `cleanVideos`; the date bounded at save.
- **Motion and visuals:** the theme's entrance and reveal tokens; swipe is scroll-snap; `<details>` opens without
  animation under reduced motion. No glyph stands in for an icon (Accordion's chevron is the icon set's).
- **Unit economics:** none (no new cost; no outbound call).
- **Blast radius:** every switch over `SectionKey` (typecheck finds them: `sections/index.tsx`, `clean-images.ts`,
  `readiness.ts`, the section form, the library); `SECTION_NAMES` readers (lost lines show the design's name);
  `VIDEO_KEYS` readers; `bestSellerWindows`; resolved-looks and released-manifests snapshots (1.4 appended).

## Tasks
| # | Task | Verify |
|---|---|---|
| TS0b-0 | Regression net: v-next stored fixture, the unit nets above (red first) | `npm test` |
| TS0b-1 | `blocks.ts`: schemas, `resolveDesign`, `pageLimits`, `headingLevels`, thumbs; manifest `designs`; `themeCheck` rules | `npx vitest run src/domains/themes` |
| TS0b-2 | `design` section: sections, resolve, layer carry/lost, cleanImages, readiness, page-look walkers | `npm test`, typecheck |
| TS0b-3 | Renderers + block CSS + budget gate; largest-allowed-page test | `npm test`, `npm run build` budgets |
| TS0b-4 | Signal 1.4.0 with two designs (samples credited) | `check:credits`, parity, `check:theme` |
| TS0b-5 | Look: designs in the library, `design-form.tsx`, example words gate; e2e `72-designs` (add, fill, blocked publish, publish, shop shows it, Try Atelier lists it lost) | `npm run e2e -- --only designs,look,signal,shop-look` |
| TS0b-6 | Release: Admin stages 1.4 to the e2e shop, then released; measure the live Signal shop after its owner opts in; skills, spec, close | full e2e, impact-reviewer |

## Practices recorded in skills
- `frata-architecture` § Themes: blocks, designs, fills by stable ids, explicit three levels, page limits, one video a
  design at the section's top level.
- `frata-design-language`: designs in the library (pictures from the tree), example words never reach a shop.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Every new block kind touching every switch | exhaustive `satisfies never` in `cleanImages`, renderers and the form (typecheck) |
| Block CSS creeping | `check-storefront-build` block budget |

## Out of scope
Designs on product, collection and page templates (TS1); the studio (TS2); partner themes (TS3); Claude (TS4).

## As built (2026-11-11)
- **Engine:** `src/domains/themes/blocks.ts` (schemas, `designsOf`, `resolveDesign`, `pruneFill`, `designsForSave`,
  `designProblems`, `designsCheck`), `design-tree.ts` (no Zod: `blocksOf`, `fillableOf`, `fillFor`, `accordionItems`,
  `thumbOf`), `sections.ts` (`FillSchema`, `DesignSectionSchema`, `fillText`, `sectionName`, `searchDesigns`),
  `layer.ts` (`carryOver` within the theme; `layerBytes` counts jsonb's added spaces; `MAX_LAYER_BYTES` 60,000),
  `readiness.ts`, `clean-images.ts`, `check.ts` (`themeCheck(m, previous)`), `resolve.ts` (`ResolvedTheme.designs`).
- **Limits as built:** a design ≤ 25 blocks and ≤ 3 photos (× 4 a page = the page's 100 and 12, so no mix of designs
  can exceed a page and a later minor can't block a save); ≤ 24 kB of owner words a page in bytes; ≤ 40 fills and
  10,000 characters a section; a layer ≤ 60 kB as jsonb text.
- **Shop:** `src/components/storefront/blocks/index.tsx` (server only); `.store-b-*` rules 0.85 kB gz (gate 1.0);
  shop JS unchanged (home 114.1 kB); the samples and examples show only in the customizer's look preview (`examples`,
  never `?as=shop`, /console/preview or the shop: e2e asserts the shop HTML has no `/themes/samples/` or `data-example`).
- **Look:** designs first in Add a section (pictures drawn on the server), `design-form.tsx` (dynamic), the editor's
  issue line prefers what blocks Publish. Menus and Site settings now load when opened: the customizer is 207.4 kB
  (was 208.2 before TS0b), gated at 208 kB in `check-storefront-build`.
- **Gates and tests:** `check:tenant` 6e (no loader, db, themes or outbox import, no `server-only`, in a block);
  `check-theme` checks each version against the one before; `blocks.test.ts` (30), v4 stored fixture, design and block
  schema snapshots, resolved-looks with designs; `look.int.test` saves Hindi at the byte ceiling on Postgres;
  e2e `72-designs` (add, examples marked, Publish blocked by name, publish, shop shows only the owner's words, Undo).
- **Not done here (named):** the worst-page gate on `next start` arrives with TS1's cards (TS0b adds no card; its page
  bound is the limits above); a test of the Admin version page's design names; the Rich text section's own
  paragraph-typing bug (`section-form.tsx`, same as the design form had) is left for its own fix.
- **Release:** Signal 1.4.0 is in code; releasing it is Admin › Themes › Signal 1.4.0 (stage to a shop, then Release).

