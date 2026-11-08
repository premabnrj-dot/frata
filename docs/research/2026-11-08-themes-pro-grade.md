# Professional-grade themes: a shop design language, a better customizer, motion and errors

Status: research + proposal (draft, awaiting the owner) · Date: 2026-11-08 · Mockup: https://claude.ai/artifact/S2bPoCzyBPKA1NW4BesKfz (`docs/mockups/2026-11-08-themes-pro.html`) ·
Builds on `docs/research/2026-11-07-themes-ecosystem.md` (the model) and `docs/specs/2026-11-08-themes.md` (T0–T3, built).
North star: (5) a premium-looking storefront, with (4) mobile checkout conversion and (2) size and fit returns
(the product page carries fit). Sources: every external fact has its page's date; Shopify's help and dev docs are
undated live pages, read 2026-11-08. "No current source" = nothing found from the last 12 months (frata-planning § 2).

## 0. Summary (what this note recommends)

1. **Keep the model.** Data-only themes over one section library (owner calls of 2026-11-08) hold up against
   everything looked at here. Shopify is moving toward the same thing (typed contracts, presets, blocks), and
   WooCommerce's demo imports show what goes wrong without it. Nothing below reopens a code-theme platform.
2. **What's missing is depth, not themes.** A professional theme is (a) every page a shop needs, designed, with
   (b) sections made of blocks, each block having named presets, (c) a product page that does fit, swatches,
   zoom and sticky add to cart properly, (d) motion that never hurts speed or an Instagram in-app browser, and
   (e) documentation where every setting uses the same words as the customizer. We have about a third of this.
3. **Write a Shop Design Language (SDL).** This is one vocabulary and one contract for every page, region,
   section and block: anatomy, settings, states, phone/desktop behaviour, motion, accessibility and its data
   source. The **section catalogue** is generated from the code: real RSC sections rendered on shared fixtures.
   That same set of fixtures feeds the demo shops, the visual gate and the customizer's thumbnails. One source,
   four uses. No one publishes this today (§ 2.6), so it's an opening.
4. **Customizer v2:** select in the preview itself (hover outline, toolbar, "+" between sections), see changes
   instantly (tokens and text update in the frame at once, with the true server render after save), inline text
   editing, phone and desktop side by side, a review-changes step before Publish, and error states for every
   failure (§ 7).
5. **"Start from a look" instead of a demo import.** A five-step setup (logo → style → type → header → Home)
   that writes only the theme draft, using the shop's own products, and can be undone. Each theme × style gets a
   live demo shop for the gallery.
6. **Motion, done the way Horizon does it, plus our Instagram rule:** card → product image view transition,
   reveal-on-scroll in scroll-driven CSS, a four-switch Motion group, and **cross-document transitions off in
   in-app browsers** (Instagram, Facebook), because Shopify found they freeze or white-screen there (June 2026).
7. **Phases P0–P4, about 9–12 agent-weeks** (§ 9). P0 (the SDL and catalogue) changes nothing shoppers see and
   makes everything after it cheaper.

## 1. Where we are (codebase, read 2026-11-08)

| Have (built T0–T3) | Where | Gap to "professional grade" |
|---|---|---|
| 5 themes (Classic, Editorial, Bazaar, Minimal, Atelier), 1–5 styles each, 3 schemes per style, contrast-gated | `src/domains/themes/catalogue/*` | Styles change colour only; nothing sets a mood across type, shape and density. No live demo shop per style; the gallery shows static screenshots |
| 10 Home sections, flat settings, `MAX_PER_PAGE`, readiness | `src/domains/themes/sections.ts`, `src/components/storefront/sections/index.tsx` | **No blocks**: a Hero can't hold two buttons, a Rich text can't take an image; every new layout means a new section. Sections exist on Home only |
| Product and collection pages: 5 page settings (gallery, details, card, columns, collection top) | `types.ts` `PageSettings` | No sections or blocks on the product page (Shopify requires the main product section to be built from blocks); no zoom, video, sticky add to cart, fit summary, complete-the-look, recently viewed |
| Pages: Home, product, collection, Shop all, bag, checkout, order, policies, 404, error | `src/app/s/[host]/**` | **Missing:** search, an About / brand-story page, Contact, Size guide as a page, Lookbook, FAQ. Closed and opening-soon screens aren't themable |
| Customizer: sidebar forms, autosave 800 ms, undo/redo 50, device toggle, page picker, publish dialog with change list | `src/app/(lookeditor)/console/look/customize/*` | **Messages go one way** (editor → frame): you can't click the preview to select. Each change waits for save then `router.refresh()` (a full RSC round trip). No "+" between sections, no inline text, no duplicate, no side-by-side devices. The change list is text only |
| Errors: save error banner, stale draft, readiness blocks Publish | `editor.tsx`, `readiness.ts` | No per-section error boundary (one bad section breaks the whole preview), no offline queue, no "the preview couldn't load" state, no undo for Remove beyond the session |
| Motion: `data-motion` Subtle/None, motion tokens, drawers | `frata-design-language` § Motion | No page or image transitions, no reveal-on-scroll, no card hover choice. The customizer itself has no motion for select, add or move |
| Docs: `frata-design-language` § Shop themes (rules for agents) | skill | **No merchant-facing docs** and no per-section reference. Words in the customizer, the docs and the code aren't held to one source |

## 2. How others do it (dated)

### 2.1 Shopify Horizon and the theme editor
- Horizon 4.4.0, 3 Nov 2026 (themes.shopify.com/themes/horizon; release notes in github.com/Shopify/horizon,
  same date). **41 sections, 94 blocks** (unofficial Mintlify mirror of the repo, undated). Free, yet it lists
  quick view, quick buy, slide-out cart, zoom, size charts, video, mega menu, search and back-in-stock. So the
  feature checklist no longer tells paid themes from free ones.
- **Theme blocks** nest. A block can carry several **presets** (e.g. Text → "Text", "Content"; Group → "Column"
  of two Texts) (shopify.dev theme blocks, undated live).
- **Preview inspector**: hover outlines anything selectable, a click opens its settings, a selected section shows
  "+" above and below, and a toolbar has move up/down (disabled at the ends), duplicate, hide and delete. On a
  phone the first tap selects and opens a sheet, the second navigates (help.shopify.com preview inspector,
  undated live).
- **Partial re-render**: the editor swaps one section's HTML in the live DOM, with no reload, and fires
  `shopify:section:load/unload/select/deselect/reorder` and `block:select/deselect` so the theme can re-initialise
  (shopify.dev integrate sections and blocks, undated live).
- **Colour schemes**: up to 21, each section picks one. **No contrast warning** (help.shopify.com colour
  settings, undated live). Ours gates contrast already, which is better.
- **Canvas** (1 Oct 2026, shopify.com/news/introducing-canvas): every template side by side, click to edit, live
  render; "not replacing the existing editor yet".
- **Theme Store rules** (shopify.dev requirements, undated live): every preset has its own demo store with real
  content (no lorem ipsum, no apps); demo imagery does not transfer on install; demo products must include one on
  sale, one sold out and one with many variants. The main product section is built from blocks. Lighthouse
  performance ≥ 60 and accessibility ≥ 90 averaged. **Theme docs must use the same words as the settings**, with
  an FAQ.
- **Editor error states**: no current source.

### 2.2 WooCommerce
- Woo's own free block theme **Purple** (woocommerce.com, 2026-10-13): templates for home, catalogue, product,
  cart, checkout and confirmation, plus whole-page patterns.
- **Customize Your Store** (woocommerce.com docs, undated live): logo → 18 palettes → 8 font pairings → header
  and footer → a Home made of patterns. It still names Twenty Twenty-Four, so it looks unmaintained. **Taken:**
  the order of steps.
- **Demo import** (Astra, Kadence, Blocksy, OceanWP; startertemplates.com docs, undated; 2026 changelogs):
  installs plugins, imports pages, menus and widgets, and overwrites global styles. Common failures are content
  mixing into the existing site, deleted menus, plugin sprawl and imports dying on server limits, and the 2026
  changelogs are mostly import fixes. **Not taken:** any import that writes outside the theme draft.
- WordPress 6.9 **Notes** (Dec 2025): comments attached to a block. **Later**, for partner ↔ owner review.

### 2.3 Premium themes
- Prestige 11.0 (6 Mar 2026) added a preset; it claims "30+ configurable sections" (themes.shopify.com, from the
  version history). Counts for Impulse, Be Yours and Broadcast: no current source.
- Premium themes win on **product-page depth and documentation**: Archetype publishes one help article per
  section and per feature (help.archetypethemes.co, undated).
- **Fashion evidence:** shoppers use reviews in place of trying clothes on, size and fit are the review content
  most wanted (48%), shoppers want a range of body types on models, and size filters shouldn't depend on a
  "plus" label (Baymard, 1,922 US shoppers, **2026-06-12**). This is our problem (2), returns, showing up on the
  product page.

### 2.4 Motion
- Cross-document view transitions: Chrome/Edge 126+ and Safari 18.2+ (iOS included) support them; Firefox
  144–162 is partial (caniuse, usage data Oct 2026). Scroll-driven animations are Baseline newly available with
  Firefox 159 (web.dev, **2026-10-29**).
- **Horizon 4.4.0** (`assets/view-transitions.js`, 2026-11-03):
  - It opts in only under `prefers-reduced-motion: no-preference`.
  - It holds first paint with `<link rel="expect" blocking="render">` for at most 1,800 ms, and skips that on a
    first visit, a reload or a low-power device.
  - It cancels a transition on pointerdown or keydown, to protect INP.
  - It uses named types (`page-navigation`, `product-image-transition`).
  - It **turns cross-document transitions off in Android in-app WebViews (Facebook, Instagram, TikTok)**, which
    "freeze or white-screen the storefront" in Shopify's June 2026 testing.
- Horizon's settings have an **Animations group** of 4 switches: page transition, transition to main product,
  add-to-cart animation, and card hover (none / lift / scale / subtle zoom).
- Shopify's guidance (shopify.dev, undated live): transitions on product cards, galleries and collection → product
  only; never on forms, checkout, account pages or external links.

### 2.5 Editors
- Webflow shows every breakpoint side by side while you edit (webflow.com, **2026-09-02**).
- Framer's on-page editing (framer.com, **2026-09-15**): click Edit on the live site, editable things highlight,
  click to edit text and images in place, and "Finish editing" asks a publisher to review.
- No NN/g or Baymard study of page builders from the last 12 months: no current source.

### 2.6 Documentation of sections
- Shopify requires per-theme docs that use the settings' words. Vendors publish a page per section and per
  setting group (Archetype, Halo/The4 GitBooks, undated). Horizon's unofficial docs are generated from the repo,
  one page per section and block.
- **Nobody publishes a section catalogue with states, do/don't and responsive behaviour, and no one uses Storybook
  for themes.** No current source. That is where Frrata can lead, and it costs little because our sections are
  already typed.

## 3. The Shop Design Language (SDL)

### 3.1 One vocabulary (the words merchants, docs, code and agents share)
| Word | Means | In code today | Merchant sees |
|---|---|---|---|
| **Look** | the published theme + style + the merchant's layer | `liveOf`, publishes | "Look" (nav) |
| **Theme** | a manifest: what it allows, its starting pages | `ThemeManifest` | "Theme" |
| **Style** | a named mood: schemes + pairing + shape + density (**today colour only**) | `styles[]` | "Style" |
| **Scheme** | a colour set a section paints in: Paper / Tint / Ink | `SchemeKey` | the style's names |
| **Page** | a template: Home, Product, Collection, Shop all, Search, About, Contact, Size guide, Lookbook, Policies, Bag, Order, Not found, Closed | Home + 5 settings | "Page" picker |
| **Region** | the fixed parts of a page: Header, Main, Footer; on Product: Gallery, Buy box, Below | header/footer variants | the list's fixed rows |
| **Section** | a full-width band in Main; ordered, hideable, painted in a scheme | `SectionInstance` | "Section" |
| **Block** | a part inside a section: Heading, Text, Button, Image, Product picker, Size and fit, Swatches… **new** | — | "Block" |
| **Preset** | a named starting arrangement of a section or block ("Split hero", "Sale hero") | — | the Add sheet's cards |
| **Source** | where products come from: New in, Best sellers, a collection… | `sources.ts` | "Show" |
| **Slot** | where an app plugs in (Reviews, Size and fit, Offers) | `<ModuleSlot>` | "From your apps" |

Rule: a word in this table is the only word for that thing on every surface. A new noun needs a row here first.
`check:voice` gains the banned synonyms ("template" for page, "widget" or "element" for block, "theme colours" for
style, "skin").

### 3.2 The section contract (every section and block ships with all of it)
1. **Anatomy**: its named parts (eyebrow, heading, text, buttons, media) and their order on phone and desktop.
2. **Settings**: the Zod schema, which already exists. Each field gains a `label`, an optional `tip` and a
   `group`, so the customizer form and the docs are **generated from one place**.
3. **Presets**: 1–4 named starting arrangements, each with a fixture-rendered thumbnail.
4. **States**: one fixture per state: full, empty (renders nothing, and the customizer says why), one item, long
   text at every limit, missing image, sold-out products, Hindi, every scheme.
5. **Responsive**: 360, 768 and 1280 px, from the fixture; the rules in words (e.g. "Split stacks image first on a
   phone").
6. **Motion**: which pattern from § Motion it uses (enter, hover), and what reduced motion shows.
7. **Accessibility**: heading level, landmark, alt rule, keyboard path, contrast (already gated).
8. **Data**: which shop facts it reads (types prove no cost field, ADR-0003), its cache tag, and its share of the
   page's bytes.
9. **Do / don't**: two to four lines, with a picture each.

### 3.3 The catalogue (generated, not written)
- `/console/look/sections` (for merchants and partners, behind `requireMember`) and a staff copy in Admin. Each
  entry is the real section rendered on the shared fixtures (`e2e/fixtures/themes/`) at three widths, plus its
  states, settings table, presets and do/don't. The prose lives beside the schema in
  `src/domains/themes/sections/<key>.doc.ts` (pure data).
- **One fixture set, four uses:** catalogue entries, demo shops per theme × style, the visual gate
  (`themes:shots`), and the Add sheet's preset thumbnails.
- A gate (`check:theme` extended): every section and block has a doc, every preset a thumbnail, every setting a
  label, and every state a fixture. A section with no doc fails the build.
- The `frata-design-language` skill keeps the **rules**; the catalogue holds the **reference**. That follows
  CLAUDE.md: rules in skills, checkable facts in gates.

### 3.4 Pages a shop needs (the target set)
| Page | Today | Proposal | Phase |
|---|---|---|---|
| Home | sections | + blocks | P1 |
| Product | 5 settings | **Regions (Gallery, Buy box, Below) with blocks**: Swatches, Sizes, Size and fit summary (from returns/reviews when Reviews ships), Delivery and COD line, Offers, Details, Complete the look, Recently viewed; zoom, video poster, sticky Add to bag on phones | P2 |
| Collection, Shop all | settings | banner/title presets; filters (size, colour, price) placement; card style | P2 |
| **Search** | absent (tab opens Shop all) | a results page and the header box; predictive suggestions as a server route, no third party | P2 |
| **About, Contact, Size guide, FAQ, Lookbook** | absent | "Pages" made of the same sections; Size guide reads the size charts, so there's one source | P3 |
| Bag, Checkout, Order | platform | tokens only (checkout is never themable beyond colour and type: speed, COD rules, ADR-0003) | — |
| Not found, Closed, Opening soon | fixed | tokens + one Hero preset | P3 |

## 4. Customizer v2

| Pattern | Taken from | Our version |
|---|---|---|
| Select in the preview | Shopify inspector | The bridge posts `hover`/`select` **back** to the editor; outline + a floating toolbar: move up, move down (disabled at the ends), duplicate, hide, remove. On a phone, the first tap selects (opens the sheet), the second navigates |
| "+" between sections | Shopify inspector | A "+" on the outline's top and bottom edges opens the Add sheet with "Adds here" |
| Instant change | Shopify partial render | **Two speeds.** (1) At once, in the frame: tokens (`--store-*`) and plain text are patched by the bridge from the editor's layer (`{type:'patch'}`), with no server call. (2) After the 800 ms autosave: the true server render, swapped without a flash (the old frame stays until the new one is ready, then a 200 ms cross-fade). Spike first: re-render one section via a route or keep `router.refresh()` (measured at 8–10 ms locally in T1·0; check at 10× catalogue) |
| Inline text | Framer | Headings, text and button labels editable in the frame (`contenteditable="plaintext-only"`), bound to the field and the same Zod limits (a counter appears at the caret) |
| Side by side | Webflow | Phone + desktop together on wide screens (≥ 1440 px), phone alone otherwise; phone first |
| Review before Publish | Framer, WP Notes | The publish dialog becomes a review: changes grouped by page → section, each with a before/after thumbnail; blockers on top with "Fix" jumping to the field |
| Outline / tree | Shopify sidebar | Page ▸ Header / Main sections ▸ blocks / Footer, collapsible; a badge for "needs you" |
| Motion in the editor | our motion tokens | select outline 120 ms; add slides in from where it lands (200 ms); move animates the swap (FLIP, transform only); remove collapses with Undo in a toast |

## 5. "Start from a look" (setup instead of demo import)
- **Five steps**, each a full-width choice with the live phone preview built from the shop's **own** products:
  logo → style → type pairing → header → Home preset (e.g. "Festive sale", "New drop", "Made to order").
- **Writes only the draft.** Nothing touches products, pages or settings, Back works at every step, and leaving
  keeps the draft. It ends in the customizer, never with a publish.
- **Demo shops**: one per theme × style, public at `demo-<theme>-<style>.frrata.shop` (our seeded fixture shop,
  `noindex`), linked from the gallery as "See it live". Demo photos never copy into a merchant's shop, as on
  Shopify, and the dialog says so in one line.
- **Styles become moods**: a style sets schemes + pairing + corners + density + card style. Changing it still keeps
  everything the merchant set by hand (the layer wins, as today).

## 6. Motion (storefront)
- **Motion group** (Theme settings): Page transitions on/off · Product photo follows the tap on/off · Add to bag
  animation on/off · Card hover: None / Lift / Zoom. `Motion: None` still turns everything off, and reduced
  motion always wins.
- **Cross-document view transitions**: `@view-transition { navigation: auto }` inside
  `prefers-reduced-motion: no-preference`, only from a card to its product page (`view-transition-name` on the
  card's photo and the gallery's first photo), plus the page fade. **Off in Instagram and Facebook in-app
  browsers** (server-side, by user agent: the page simply doesn't carry the opt-in) and on Save-Data. Cancelled
  on pointerdown or keydown. No render-blocking `expect` link in the first release: our ISR pages paint fast, so
  we take no INP or LCP risk for a nicer handoff.
- **Reveal on scroll**: `animation-timeline: view()` behind `@supports`, opacity + translate only, sections below
  the fold only, **never the LCP image**. No JS.
- A budget line in `check:storefront-build`: motion adds 0 kB of JS.

## 7. Error handling (every failure has a designed state)
| Failure | Merchant sees (customizer) | Shopper sees |
|---|---|---|
| Autosave fails (network) | "Not saved · Retrying" chip; changes queue locally (sessionStorage), sent in order on reconnect; Publish waits | nothing |
| Stale draft (two editors) | who and when, "Reload to see their changes"; their unsaved change listed so it isn't lost | nothing |
| One section throws while rendering | **an error boundary per section**: in preview, a hatched band "This section couldn't be shown" + "Hide it" / "Undo last change" | the section is left out; the page renders; the error goes to logs (name/code only) |
| Linked collection or product deleted | a "needs you" badge on the section, the field outlined | the link renders nothing |
| Image missing alt / not uploaded | blocks Publish, named in the review | — |
| Upload too big / wrong type | inline under the field, before upload (size and type checked in the browser, then on the server) | — |
| Preview frame fails to load | the frame swaps to "Preview didn't load · Try again", with the editor still usable | — |
| Publish fails | "We couldn't publish. Your draft is safe." + Try again; the live look is unchanged | the old look |
| Version recalled while editing | (exists, T3) | — |
| Text over limit | a counter at the caret turns red at the limit; typing stops (constraint over refusal) | — |

## 8. Design review (frata-planning § 3, short form; full review per phase spec)
- **UI/UX**: one primary action per screen holds (Customize / Publish / Continue). The inspector keeps the sidebar
  as the keyboard path, so the frame is never the only way. Phone: tap to select → sheet.
- **Tenancy**: no new tenant data in P0–P1, except blocks inside the existing `shop_theme_revisions.settings` (a
  schema version with an additive migration). Demo shops are Frrata-owned tenants. The preview bridge keeps its
  origin + `source` checks; inline edits travel as the same `saveLookAction` input.
- **Modularity**: block schemas and docs are pure (`src/domains/themes/blocks/`), and renderers are RSC in
  `src/components/storefront/blocks/`. The bridge is the only client code inside the frame.
- **SSOT**: labels and tips live once, in the schema, read by the form, the docs and the review list. Fixtures
  live once and serve four uses. Size guide page = the size charts.
- **YAGNI**: out are AI editing (Canvas), notes on blocks, shareable public preview links (needs an ADR: a third
  tenant-id source), free nesting deeper than section → block, custom CSS, and the render-blocking transition hold.
- **KISS**: blocks are one level (section → blocks), never a tree. The instant patch covers tokens and plain
  text only; everything else waits for the true render.
- **Performance**: blocks are RSC, so 0 kB more shop JS. View transitions and reveal are CSS. Search suggestions
  are a cached server route. Catalogue pages are console-only. Lighthouse becomes a real gate (`themes:speed`)
  because P2 adds video posters and zoom: performance ≥ 90 mobile, accessibility ≥ 95.
- **Reliability**: an error boundary per section on the shop, so one bad section never takes the page down.
- **Security**: `contenteditable` text still goes through Zod, renders as text only, and is never set as HTML.
  The bridge's messages are typed and origin-checked both ways. Demo shops hold no real PII.
- **Unit economics**: themes stay free. CI minutes rise (shots + Lighthouse per PR). The upside comes through
  conversion and fewer fit returns: unit-economics-reviewer to run on P2.
- **Blast radius**: the section schema gains `blocks` (additive; the stored-section fixtures guard it), the shell
  (motion attributes), every product page (P2), and `check:theme` and `check:voice`.

## 9. Phases (each opens with its own mockup and spec, ADR-0001)
| Phase | A merchant can | Size |
|---|---|---|
| **P0 SDL + catalogue** | read a Sections guide in Look; nothing changes for shoppers | 1.5–2 agent-weeks: vocabulary, per-section docs, fixtures per state, generated catalogue, `check:theme` + `check:voice` extensions, labels moved into schemas |
| **P1 Customizer v2** | click to select in the preview, add between sections, edit text in place, see changes at once, review before publish; every error state in § 7; blocks inside Hero, Image with text, Rich text | 2.5–3 |
| **P2 Product page and search** | product page regions with blocks (fit, swatches, zoom, video, sticky add, complete the look), search page, collection filters placement, the Motion group and view transitions | 3–4 |
| **P3 Pages and setup** | About, Contact, Size guide, FAQ, Lookbook pages; "Start from a look"; styles as moods; demo shops per style | 2–3 |
| P4 Later (signal-gated) | notes on sections (partner ↔ owner), shareable preview links (ADR), AI suggestions | — |

## 10. Owner calls
1. Approve the **vocabulary** in § 3.1 as the only words (Look, Theme, Style, Scheme, Page, Region, Section, Block,
   Preset, Source, Slot). *Recommended.*
2. **Blocks one level deep** (section → blocks), not Shopify's nesting. *Recommended* (KISS; covers every layout
   in the five themes).
3. The **section catalogue visible to merchants and partners** in Look, not only to staff. *Recommended*
   (Shopify requires docs; ours are generated, so they can't go stale).
4. **View transitions off in Instagram and Facebook in-app browsers.** *Recommended* (Horizon's finding; most of
   our traffic arrives this way).
5. **Demo shops** on public `demo-*` addresses (Frrata-owned, `noindex`). *Recommended*; alternative: screenshots only.
6. Order of phases: P0 → P1 → P2 → P3. *Recommended*; P2 first if fit returns matter more than editing feel right now.

## Facts used (checked 2026-11-08)
- Shopify: Horizon listing and release notes 4.4.0 (2026-11-03); theme blocks, preview inspector, section events,
  colour schemes, Theme Store requirements, view-transition guidance (shopify.dev / help.shopify.com, undated live);
  Canvas (shopify.com/news, 2026-10-01); Horizon `view-transitions.js` and `settings_schema.json` (v4.4.0).
- WooCommerce Purple (2026-10-13); Customize Your Store docs (undated live); Starter Templates / Kadence import
  docs and 2026 changelogs.
- Baymard apparel quantitative UX insights (2026-06-12). caniuse cross-document view transitions (Oct 2026 data);
  web.dev web platform October 2026 (2026-10-29). Webflow breakpoint canvas (2026-09-02); Framer page edit (2026-09-15).
- Not verified (no current source): Shopify editor error states; section counts for Impulse, Be Yours, Broadcast;
  Twenty Twenty-Five counts; NN/g or Baymard research on page builders; Horizon's nesting depth.
