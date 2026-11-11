# Plan: Theme Studio TS0b — blocks, as designs in Signal 1.4
Status: draft (mockup board for the owner; reviews on this plan) · Date: 2026-11-11 · Spec: `docs/specs/2026-11-11-theme-studio.md`
(active; v2 approved by the owner 2026-11-11; § 2 Blocks) · Mockup: https://claude.ai/artifact/DzD84DZsW6eGYQ6QkfJbM4 (v1) · Reviews: pending

## Goal
North star (5) a premium-looking storefront, and (2) size and fit returns (the Size help design). The block catalogue
the studio (TS2) will build with reaches real shops **first as code**: Signal 1.4 offers six **designs** (sections
built from blocks), which owners add, fill and publish in Look like any section. Nothing changes for a shop until its
owner moves to 1.4 and publishes.
Measures: on the one live Signal shop and the e2e seed, home HTML ≤ 300 kB and RSC ≤ 150 kB with every design added;
first-load JS on shop routes unchanged; block CSS ≤ 1.0 kB gz; the largest-allowed-page test holds; e2e `05-shop-look`
0 px and the resolved-looks snapshot byte-identical for every 1.0–1.3 look; no shop changes without its Publish.

## Regression net first (rule 5)
- `05-shop-look`, `47-look`, `48-themes-*`, `65-signal`, `66-video`, `64-seo` green before and after; resolved-looks and
  released-manifests snapshots unchanged; `stored-sections-v*.json` keep parsing (append a v-next fixture with design
  sections, never edit).
- New unit nets before the renderers: `blocks.test.ts` (schemas, depth, accepted children, limits, heading levels,
  eager images, fill carry), `check-theme.test.ts` design rules, `clean-images.test.ts` design case,
  `layer.test.ts` design carry and lost lines, `readiness.test.ts` design issues.

## Design (what the owner sees: mockup board)
- **Look › Add a section:** the library's first group is **Made for Signal**: six designs as pictures **drawn from their
  block tree** (one pure `designThumb(tree)` → the same wireframe SVG the library draws for sections; no image files
  to keep in step). Search covers each design's name, line and tags. A full page greys the card with its limit.
- **A design's form:** the fields the theme marks for the owner, in page order, each with the theme's label
  (Heading, Words, Photo, Button, Pieces, Questions, Date). Questions: a list with ↑ ↓ and Remove beside each item
  (WCAG 2.5.7), Add up to 12. Scheme and Hide as every section.
- **Example words:** a field the theme marks `example` (claims: "Hand-stitched in Agra", size answers) shows its
  example greyed in the form; Publish is blocked until the owner writes their own, and readiness names the field
  ("Size help: write your own answer for 'Between two sizes'"). Headings and button words are plain defaults.
- **The shop:** server components; phone first; Columns stack or swipe (CSS scroll-snap, no script); Accordion is
  `<details>`; Countdown reuses Drop teaser's date line (hides once passed); empty photo, unlisted piece or empty
  grid: that block renders nothing, and a design with nothing left renders nothing.
- **Changing theme:** a design comes across only to a theme (or version) that has the same design id; otherwise Try
  lists "Size help isn't in Atelier" (today's `lost` list). A recall from 1.4 to 1.3 says the same.

### The six designs (Signal 1.4) and the blocks each exercises
| Design | Tree | Blocks |
|---|---|---|
| Size help | Columns 2 [Group: Heading, Text·example, Accordion(3 Items·example), Button → /policies/returns] [Image] | Columns, Group, Heading, Text, Accordion, Item, Button, Image |
| Made by hand | Heading; Columns 3 (swipe on phone) of Group [Image, Heading, Text·example] | Columns, Group, Image, Heading, Text |
| The drop | Heading, Countdown, Product grid (collection, 4), Button | Countdown, Product grid |
| One piece | Columns 2 [Image] [Featured product, Text·example] | Featured product |
| Behind the bench | Columns 2 [Video (≤ 1 a design; the photo is its poster)] [Heading, Text·example, Button] | Video |
| The edits | Columns 2 [Group: Heading, Text, Button] [Collection tiles (circles, 4)] | Collection tiles |

## Model (pure, `src/domains/themes/blocks.ts`)
- **Block** = `{ id, kind, …its settings, fill?: { label, example? } }`. `id` matches `^[a-z0-9-]{1,40}$`, unique in
  its design and **stable across versions** (carry-over by (design id, block id)). Kinds (13): `section` (the design's
  root, implicit), `columns` (2–4; `phone: stack | swipe`), `group`, `heading` (`size: s|m|l`), `text` (runs, ≤ 2,000
  chars; bold, italic, shop-path links), `image` (`ratio: 4:5|3:4|1:1|16:9`; default from `/themes/samples/` only),
  `video` (≤ 1 a design; no default video), `button` (label ≤ 24, shop path; `style: solid|outline`), `accordion`
  (`items` ≤ 12, q ≤ 80, a ≤ 600), `countdown` (heading ≤ 60, `at` bounded ≤ 400 days ahead), `product_grid`
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
- **Limits** (pure `pageLimits`): ≤ 20 sections (today), `MAX_PER_PAGE.design` 6, ≤ 100 blocks a page, ≤ 36 product
  cards a page, ≤ 6 commerce blocks a page (product grid, featured product, collection tiles, and today's Products,
  Collection tiles and Shop the look sections count). Checked at save (`saveLookAction`, which has the manifest) with
  the reason in words, and again at resolve (blocks beyond a limit are cut in document order).
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
| Signal 1.4 | `src/domains/themes/catalogue/signal/1.4.0.ts` (1.3 + `designs`, `allowed.sections` + `design`, `videoSections` + `design`) |
| Look | `section-library.tsx` (designs group), `design-form.tsx` (new, `dynamic()` like the story forms), editor wiring |

## Design review (frata-planning § 3)
- **UI/UX:** owner in Look (console look), shopper on the shop; one primary action each (Add; fill). States: library
  empty search, full page (greyed with the limit), design with example words (Publish blocked, named), empty photo
  (preview shows the sample greyed; the shop hides the block), unlisted piece, passed countdown, phone. Keyboard:
  library as today; form fields in page order; item ↑ ↓ buttons beside every drag. Norman: the picture is the
  signifier; constraints (the theme's structure) over refusals; Undo as every edit.
- **Tenancy:** no new table, no migration, no new read. Owner content stays in `shop_theme_revisions.settings`
  (tenant policy). Photos only through `cleanImages` (this shop's theme folder or its product photos); videos only
  through `cleanVideos` (this shop's rows). Tenant from `requireMember` as today.
- **Modularity:** pure engine in `domains/themes`; renderers in `components/storefront/blocks`; no new action — the
  existing save, publish and try actions.
- **SSOT / DRY:** a design's structure in its manifest only; the owner's words in the layer only (by block id); commerce
  blocks reuse `SourceSchema`, `sourceProducts`, `ProductGrid` and the Collection tiles renderer; Countdown reuses
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
  owner photos through `cleanImages`; video through `cleanVideos`; countdown date bounded.
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
| TS0b-4 | Signal 1.4.0 with six designs (samples credited) | `check:credits`, parity, `check:theme` |
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
