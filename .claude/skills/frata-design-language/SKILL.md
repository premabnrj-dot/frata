---
name: frata-design-language
description: Use when building or changing any Frata UI - a console page, table, filter, form, dialog, badge, empty or error state, the storefront, a theme - or when choosing a colour, font, spacing or motion, or how to show money, an order number, a date, a status or COD risk.
metadata:
  version: 4.1.0
  verified: 2026-11-07
  covers: ["src/app/globals.css", "src/components/**"]
---

# Frata design language

## Voice (owner, 2026-11-07) — every word on every surface

Clear, effective, short. Frata talks like a good tool: it says what is true and
what to do, then stops. Our readers know their work; partners know how a store
is built. We never explain the obvious.

1. **Fewest words that are still true.** A headline is up to 8 words, a line up
   to 15, a button 1–4 words naming the outcome ("Send invite", "Accept Kesar
   Studio"). Sentence case. No exclamation marks, no emoji.
2. **Lead with the verb or the number.** "Earn 20% for 24 months", not "You
   can earn…". Numbers beat adjectives: ₹, %, days.
3. **One idea per line.** Two ideas are two lines or a list.
4. **Explanation goes in an (i) tip or a dialog, never a passage on the page**
   (§ Labels, info tips). What stays visible: errors, a limit someone must meet,
   money, legal wording, a risk reason.
5. **Filler is banned** (`check:voice` holds the list: simply, easily,
   seamless, powerful, unlock, leverage, robust, hassle-free, kindly…). Say
   what the thing does instead.
6. **The reader's words.** Merchant: order, delivery, payout, profit. Partner:
   store, client, owner, share. Never ours: tenant, link, member row.
7. **Second person, present tense, active.** "You", "we" for Frata. On a
   partner's screens the merchant is "the brand"; on the merchant's, "you".

## Graphic language (owner, 2026-11-07)

Pictures carry the model; words label it. One drawing rule, used everywhere a
graphic appears: the website, the partner workspace, and brand empty states in
the console (§ Brand). Haldi here is `--haldi` (the illustration token derives
from it).

- **Pictograms** (`src/components/brand/pictogram.tsx`): a 48 grid, 4 px margin,
  a **2 px ink line**, round caps and joins, paper inside, **one haldi accent
  shape**, at most one warm fill. 32, 48 or 64 px. Names: store, build,
  handover, earn, delivered, clients, owner, calendar, shield, apply. A new one
  follows the same rule and joins `PICTOGRAMS`.
- **A pictogram always sits on its tile** (`PictoTile`: 64 px, radius 12,
  fill / haldi-soft / indigo-soft). Never loose, never coloured another way.
- **Spot illustrations** (`src/components/brand/illustrations.tsx`) are built
  from pictograms on a haldi-soft field, flat, no perspective, no faces, no
  stock art. One per page at most (the hero).
- **Tokens**: `--illo-line`, `--illo-paper`, `--illo-fill`, `--illo-haldi`,
  `--illo-haldi-soft`, `--illo-indigo-soft` (globals.css, both themes). Never
  rani (rule 6), never on a control, never the only sign of anything:
  every graphic is `aria-hidden` beside words that say the same.
- **UI icons are frrata's own** (§ UX foundation rule 20, § Brand rule 36). Pictograms are not icons.
- **Rule 20's "no illustrations in empty states" is superseded for the website
  and the partner workspace only** (owner, 2026-11-07): an empty state there may
  lead with one `PictoTile`. The console may too, in a brand empty state
  (§ Brand rule 39, owner 2026-11-07).
- A page that sells (the website, /partners) leads with the illustration and a
  numbers strip; steps are pictogram + 1–3 words + one short line; rules and
  details are pictogram + a title + an (i) tip.

## Apps and modules (approved mockup v2, 2026-11-07)

- **Console › Apps** (`/console/apps`, Store group; in More on a phone): modules
  in three groups (Talk, Deliver, Grow), one `Section flush` list
  each. A row: tile (`<Icon>` at 28 on a muted tile, `data-tinge` on the list; no haldi fill), name (a button that opens the details), the job in one
  line, one badge from `offerFor()`, the action.
- Badges: "Next", "In your plan", "Add-on · ₹499/mo", "In Growth and up",
  "Trial · N days left", "Paused by Frrata". The action is a `role="switch"`
  only when the module is usable to switch; otherwise "See details".
- **Details dialog before getting an app**: title and job; "What you get" ✓
  list; "Works with" with On/Off badges; a muted price panel (badge, price in
  mono, "On your monthly Frrata bill · stop any time" for add-ons, the usage
  line). Footer: "Not now" (focused) and the one action — the switch, "Add X ·
  ₹499/mo" (a WhatsApp ask to Frrata, until billing), "See plans", or "Coming next".
- Turning a module off asks once: "Turn off X?" · "Keep X" / "Turn off X".
- **Admin**: merchant tabs Overview · Modules · Plan. The Modules tab is a table
  (Module, Granted by, Merchant, Usable, action: "Give a 30-day trial of X",
  "End trial"). Admin › Modules pauses a module "for everyone" with a reason;
  the shop sees "Paused by Frrata". Admin writes are admin-role only.

## Partner workspace (approved mockup 2026-11-07)

- `/partner` uses the console's `AppShell` with `tag="PARTNER"` (info pair).
  Admin keeps ink + STAFF. Nav: Clients, Your details.
- A store with no owner shows the **building banner** (info pair, sticky, one
  line: "Building for <shop> · No owner yet · Hand over") on every console page.
- Client stages are derived (`src/domains/partners/stage.ts`) and shown as
  badges with words: Building, Invite sent, With the owner, Open, Removed. A
  removed store is dimmed with colour and has no actions.
- **F3 store switcher**: in the account block at every width and in More on
  phones, only with two or more places to go; it lists what app_access_for
  returned, current one marked.

Two surfaces, two looks. **The console is neutral, dense and numeric. The
fashion lives in the storefront.** Patterns below are taken from Ekatan's admin
(its `ekatan3d-design-language`) and Shopify's admin, which merchants already know.

## Tokens (`src/app/globals.css` — the only file with a hex; `check:hex`)

- `--primary` (ink) is interaction: buttons, focus. `--brand` is **rani**
  (#D61F69, the frrata mark; brand spec 2026-11-07): never a button fill, a
  number or a status. Rani as words is `--brand-text` only; on an ink surface,
  `--brand-on-ink`. `--thread` is the 2 px line (§ Brand rules 33–40).
  `--haldi` and `--neel` are for brand surfaces only (sign-in, the website,
  drawings); the illustration haldi derives from `--haldi`.
- `--accent`, `--muted`, `--secondary` are neutral hover surfaces.
- Status pairs, background then text, all ≥ 4.5:1: `ok`, `warn`, `danger`,
  `info`, `neutral` → `bg-ok text-ok-text` …
- **Borders, not shadows.** Shadows are zeroed; only floating things get one.
- Radius 6px. Inter for UI, JetBrains Mono for figures.
- Motion: `duration-fast|base|slow` + `ease-standard|entrance|exit`. Never
  `duration-[…]`. Reduced motion is honoured globally. Lists never animate;
  they dim while loading.

## Type scale

Page title `text-2xl font-bold tracking-tight` · section `text-xl font-semibold`
· card (every `Section` title, Console and Admin) `text-section`
(token `--text-section`, never `--text-card`, which collides with `--color-card`), 15 px semibold (owner, 2026-11-07; replaces 18 px medium) · label
`text-sm font-medium` · body `text-sm` · micro `text-xs text-muted-foreground`.
No other size: `check:scale` fails `text-[Npx]` in app code.

## Numbers, dates, people

- Every ₹, order number and count in a column: `<Money paise>` / `<Numeric>`
  (mono, tabular), right-aligned. A loss renders in `text-danger-text` with a
  real minus (−₹430).
- Dates only through `src/lib/format-date.ts` (`dayIN`, `dateTimeIN`,
  `sinceIN`) — always IST (`check:dates`).
- Phones `formatPhone` → "+91 98450 12345".

## Console patterns

- **Shell**: navigation grouped by job (`AppShell`, § UX foundation); a row is
  added when its page exists, never "coming soon". Phone: bottom bar + More;
  ≥ 768px: sidebar. Waiting counts as a warn pill.
- **Page header**: `PageHeader`: way back, title + badges, a meta line, at most one primary action (+ More). Details in § UX foundation rule 13.
- **Lists**: `DataTable` shares chrome, not columns. Default view is a WORK
  QUEUE (to confirm, delivery failed), not history. Filters live in the URL,
  the server filters; 50 rows a page, numbered, never infinite scroll.
- **Order row**: number (mono link) · placed · payment badge · status badge ·
  value · COD risk badge (Medium/High in words, never a bare score; Low shows
  nothing). Profit per order waits for Phase 3, and staff never see cost.
- **Detail**: breadcrumb, record header with number and badges, main column +
  side column of facts; cards read first, edited in place.
- **Status** is always a `Badge` with words, never a dot alone.
- **Dialogs**: the caller writes the sentences; cancel names the safe outcome
  ("Keep the order").
- **States**: every screen designs empty, loading, error, one, many, no
  permission, phone. Use `Panel` for non-data states: a title that says what is
  true, one sentence why, one way on. Error copy: "We could not load this
  screen · Nothing was changed · Try again" (`error.tsx` per surface, `check:states`).
- No `loading.tsx` in the console (Ekatan: it made search-param navigation commit
  nothing in production); use a top progress bar.

## Frata Admin (owner-approved, 2026-11-06)

- **Admin looks unlike the console**: dark ink navigation with a "STAFF" tag
  (`bg-warn text-warn-text`), so no one mistakes where they are. Same tokens,
  same tables, same Panel; only the frame differs.
- **Support mode** is a full-width banner above every console page: whose
  store, the reason, time left, "Back to Admin", "End now". It cannot be
  dismissed and uses a solid dark amber with white text (≥ 4.5:1).
- **A button that acts on a merchant names them** ("Open Kesar Studio's
  console", "Move Kesar Studio to Scale"); cancel names the safe outcome
  ("Stay in Admin", "Keep Growth"). Never "Continue" or "OK".
- **A plan price is shown with its version**, and a change says what moves
  ("orders included go from 1,500 to 5,000") before it is confirmed.
- People who are staff and store members choose where to go after sign-in;
  Admin always links to their own store's console and the console links back.

## Phase 1 console and website rules (owner-approved, 2026-11-06)

- **Settings**: one list of sections, each a page with ONE explicit save. An
  "Unsaved changes" bar (Save / Discard) appears on the first edit; leaving
  with changes asks "Leave without saving?" with "Keep editing". Never
  autosave what shoppers see or pay. Each page shows a live preview of the
  shop beside the form. A connect action (Razorpay keys) is a button that
  tests first, never a field the save bar saves.
- **Derived pages say where they come from**: policy pages, the Contact page,
  the footer and invoices read Settings; an edited policy stops following and
  says so. A "Ready for live payments" list names what is missing, each item a
  link to the page that fixes it.
- **Legal words**: a shop without a GSTIN prints "Bill of supply", never "Tax
  invoice". The grievance officer is shown wherever contacts are.
- **One primary action per record state** (order: Confirm → Mark packed →
  Print packing slip → none; refund due: Cancel and refund); everything else under "More". Destructive items in red, at
  the bottom of the menu.
- **Risk is a level with reasons and a next step** ("High risk · address is a
  landmark only · Call before confirming"), never a bare score.
- **Imports check before they write**: a summary (new, updated, left alone),
  every problem as row · column · reason in plain words, rows-to-fix as a
  file; a product with one bad row is left out whole. Imported products
  arrive hidden. An empty cell never clears a value unless asked.
- **Sign-up asks only what it uses now**: email (link and 6-digit code in one
  email), shop name (address derived live), pickup pincode, one optional
  question that changes what the merchant sees. A side panel on each step
  says what is not asked yet and where it will be.
- **The Frata website** marks every feature "Now" or "Next"; prices in rupees
  with "+ 18% GST"; the order fee "only on delivered orders". One primary
  action ("Start free"), no video hero, no chat widget at first paint; a
  WhatsApp link instead.
- **Motion**: 120 ms feedback, 200 ms small moves and exits, 320 ms screens
  and sheets entering, nothing over 400 ms; a step moves in from the side it
  came from; changed or autofilled values flash once; reduced motion makes
  every change instant.

## Product page and catalogue (owner-approved, 2026-11-06)

- **Status and availability are two things, never one badge.** Status is who
  can FIND it, set by the merchant: Draft, Active (or Scheduled, with a
  moment), Unlisted (link only), Archived — its own card and its own action,
  not part of Save. Availability is whether a size and colour can be BOUGHT
  now, derived (`src/domains/catalogue/availability.ts`): In stock, Only N
  left (real stock, at 3 or fewer), Sold out, Pre-order · ships by <date>,
  Made to order · ships in N–M days. The merchant sets "When it runs out" per
  size and colour and reads "Shoppers see"; they never type an availability.
- **Product page order**: description, photos, sizes colours and stock (with
  each colour's family and swatch), details for its category, size chart, the
  model, then **Search and sharing — collapsed by default**, its summary line
  showing the address and "Made for you" or "Edited". Side: Status, Summary,
  Organise (category, collections, tags), Ready for (what Google and Meta
  still need, in words). Side cards are not sticky: they are taller than a
  screen.
- **Addresses are words** (`/console/products/linen-kurta-set`,
  `/products/linen-kurta-set` on the shop). Once a product has been live, a
  new address keeps the old one working as a redirect, and the field says so.
- **Swatches**: a circle cut from the product photo (prints) or a plain
  colour; the colour name is always written beside it, the chosen one has a
  ring (never colour alone), a colour sold out in the chosen size is crossed
  through but visible. The family ("Rani pink" files under Pink) is what
  filters and feeds read.
- **Categories come from the standard list** (Shopify's open taxonomy, pinned
  release), searched on the server; the category decides which details are
  asked, fields Google requires are marked "Google asks for this". Frata's
  additions for Indian crafts and fabrics are marked · and map to the nearest
  standard value.
- **Collections**: hand-picked (an order you set) or filled by rules (all or
  any) with a live "N products match now" count; a product shows the
  hand-picked ones as toggles and the rule-based ones it is in, in words.

## Storefront as built (1B, 2026-11-07)

- Views in `src/components/storefront/` are the ONE rendering of a shop: the
  shop pages, `/console/preview` and Settings' previews all use them.
- Product page order: gallery (chosen colour's photos first) → title → price
  (compare-at struck, "Save ₹N", never a percentage) → colour, then size →
  "Shoppers see" line for the choice → Add to bag (never greyed out; "Pick a
  size.") → Pay on delivery, delivery charge, dispatch and arrival days, the
  return window → description → details → the model.
- Cards: 4:5 cover, second photo on hover (pointer devices only), name, "From
  ₹" when prices differ, every colour as a small swatch, one tag at most.
- Before a shop opens every page but the policies is "Opening soon".

## Labels, info tips and help text (owner, 2026-11-07 — overrides any earlier "say it under the field")

The owner's rule: **explanation and detail go in an (i) info tip, never as text
under every field. Cleaner screens.** Research (dated): NN/g "Why So Many Info
Tips Are Bad" 2026-01-23; Polaris and Atlassian tooltip guidance (undated, live);
Carbon toggletip 2026-09-30; WCAG 2.2 SC 1.4.13 (updated 2026-07-12); DWP hint
text 2026-07-15.

1. **Labels first.** Fix the label or the layout before adding anything. A screen
   needing more than 2–3 tips has unclear labels.
2. **(i) for optional detail only:** a definition, why we ask, what happens
   later, an example. One or two sentences, ≤ 288 px wide, at most one link.
3. **Never in a tip:** errors and validation, a required format or limit the
   person must meet, money or anything that cannot be undone, legal or GST
   wording, a risk reason. These stay visible — as the error, or one short line
   only where the action needs it (the button's own confirm, a dialog).
4. **Click or tap to open, not hover** (phones have no hover): `InfoTip`
   (`src/components/ui/info-tip.tsx`) — a button named "About <field>",
   `aria-expanded`, the popover right after it, Esc / outside click / second tap
   closes, focus stays on the button; a 24 px target around the 14 px mark (§ UX
   foundation rule 19). The popover is a `span`: a tip sits inside labels and
   paragraphs, where a `div` ends the paragraph and breaks hydration.
5. Hover/focus tooltips (`role="tooltip"`) only name icon-only buttons and show
   truncated text in full — never on a field, never with links.
6. Never the `title` attribute for anything a person needs.

## Work queues and records (owner-approved with 1D Orders, 2026-11-07)

Research: Shopify Orders, Razorpay RTO review, Shiprocket (2026-08-24), Linear
triage, Gmail, Stripe, NN/g confirmation dialogs (2026-08-07). Spec:
`docs/specs/2026-11-07-orders.md`.

1. **Two axes, two badges.** How something is paid and where it is in its life
   are separate badges, never one merged label ("COD" + "To confirm").
2. **Risk is reasons, not a score:** a level as a word + mark (never colour
   alone), up to three reasons in plain words, ONE next step with its action
   (Call, WhatsApp). Low shows nothing. Risk advises; it never acts.
3. **One primary action per state** in a record's header; everything else under
   More. The button names the outcome ("Mark packed", not "Update").
4. **Undo for routine, a dialog for serious.** Routine, reversible actions
   happen at once with Undo for 8 s and an Undo link left on the record. A
   dialog only for what loses work, money or stock, its buttons naming the
   outcome ("Cancel order", "Keep order"), a reason required where it matters.
5. **Conflicts said in words:** "Already confirmed by Riya at 10:42" — never a
   silent overwrite or a generic error.
6. **Keyboard on queues:** `j`/`k` move, `x` select, `Enter` open, single
   letters for the commonest actions, `z` undo, `/` search, `?` the sheet.
   Never in an input. A key whose action is risky on this row opens the record
   instead. The `?` sheet has a switch to turn single-key shortcuts off (WCAG
   2.1.4), kept on the device (`localStorage`; per person when profiles exist).
   `?` always opens the sheet, so the switch can be found.
7. **Bulk actions skip what needs a person** and say so: "Confirmed 12.
   Skipped 2 high-risk orders — open them to decide." The skip is decided on
   the server (risk is never sent by the page); each failure keeps its own
   words ("KS-1012: Already confirmed by riya@…"), never a generic one. No bulk
   for destructive actions that need a reason. Bulk is a desktop tool: on a
   phone a row is one target, so selection hides.
   - **A queue row with three or more badges** puts them on a full line of
     their own on a phone (DataTable cell `e`), so number and name never squeeze.
   - **Row links never prefetch** (`prefetch={false}`): a page of rows would be
     a page of server renders on every visit.
   - **Risk that cannot be read fails closed:** "Risk unavailable", and the
     confirm key opens the order instead of confirming it.
8. **Views as tabs with counts**, derived from the record's state, one search
   box; every tab has its own empty state that says what lands there.
9. **Documents are print pages** (A4, browser print), not PDFs; the number on
   them is issued once and reprints show the same one.
10. **Shoppers never see internal words:** a state shown to a shopper goes
    through its shopper mapping ("Confirming your order"), never the raw value.


## UX foundation: one Frata (owner-approved 2026-11-07, calls 1–7 as recommended)

Spec `docs/specs/2026-11-07-ux-foundation.md`, mockup
https://claude.ai/artifact/QC3ujrncYJYjJMKhe6LvbC, research (dated)
`docs/research/2026-11-07-ux-foundation.md`. These rules apply to Console AND Admin.

**Colour and contrast (WCAG 2.2 AA is the bar; WCAG 3/APCA is advisory only)**
1. Text pairs ≥ 4.5:1. Field, checkbox and switch edges, focus, and the solid
   status marks ≥ 3:1. Both themes. `check:contrast` holds it from the tokens.
2. `--input` is the **field edge** (3:1). `--border` is for cards and table rules
   only, and is never the only sign that something is a control.
3. Status has a pale pair (`bg-ok text-ok-text`) and a solid **mark**
   (`--ok-mark` …) for the dot or square beside a word, a progress fill, and
   later a chart series. A mark is never text, and never the status on its own.
4. **Dim with colour, never opacity.** A finished or cancelled row uses
   `text-muted-foreground` (≥ 4.5:1). Opacity is only for "loading", which is
   short and marked `aria-busy`.
5. **Focus** is 2 px solid `--ring` with a 2 px offset in Console, Admin and the
   sign-in pages (`[data-shell]`; the shop keeps its own). On ink surfaces
   (`data-surface="ink"`) it is paper-coloured, on the support banner
   `--support-foreground`. Every ring is ≥ 3:1 against what is around it.
6. **Rani is the mark, and a tinge.** The mark (`<Wordmark>`, `<Monogram>`),
   the brand moment, the thread and one detail per icon; never a button fill,
   a focus ring, a status, a number or a chart colour (rules 33–40). On an ink
   surface the monogram is a rani tile with white strokes.
7. Dark tokens are written and gated but **not switched on**. They switch on
   when merchants ask, at no rework.

**One shell (`AppShell`, both surfaces)**
8. Console and Admin share one shell and every page primitive. **Admin differs
   only in chrome**: the ink frame, the rani monogram tile, STAFF, and a yellow
   active bar. Status and semantic colours never change between surfaces.
9. Nav: groups by job. The current item gets a 3 px bar, semibold, and
   `aria-current="page"`, never colour alone. Counts are a warn pill. An account
   block (email, sign out, own store / Admin) shows at every width.
10. **Phone (< 768 px): a bottom bar.** Console has Home, Orders (count),
    Products and More; Admin has Merchants, Plans, Staff and More. Labels always
    show under 22 px icons. Items are 56 px tall. More opens a sheet with
    everything else. Never a sideways-scrolling strip, never a hamburger alone.
11. Every page gets "Skip to content" as its first Tab stop, the top progress
    bar (2 px ink, shown only after 150 ms), one polite live region, and a tab
    title "Orders · Kesar Studio" / "Merchants · Frata Admin".
12. Support mode: the banner is `sticky top-0` (the document keeps the scroll),
    one line on phones ("Support · <shop> · 22 min · End"), not dismissable. The
    bottom bar is `fixed` with safe-area insets; `scroll-padding` keeps focus
    visible above and below; all chrome is `print:hidden`. The skip link comes
    before the banner.

**Pages and tables**
13. Pages open with `PageHeader` (`src/components/layout/page-header.tsx`; on a detail page with `back`, the
    one `BackLink`):
    breadcrumb, title + badges, one meta line, one primary action + More. A
    long title wraps to two lines, never cut mid-word. A title that is an
    input still shows the record's name as the h1's text.
14. Below the header come `Section`s (`src/components/layout/section.tsx`: title, optional action, `p-4 md:p-5`,
    titles `text-section font-semibold`). A form that is a card is a `<Section><form>`.
    No hand-written card frames and no cards inside cards (`check:scale`).
15. **Tables on phones become rows**, never a table that scrolls sideways. Use `DataTable` + `<Td cell>`: `a`
    the link (`data-row-link`, the whole row's target; it never prefetches: `prefetch={false}`, or a 50-row page asks the server for 50 pages, 1D·4b 2026-11-07) and `b` the figure on line 1, `c` who/where and `d` the
    badges on line 2, `e`/`f` full lines, `hide` desktop only. An editor grid (a raw `<table>`, not a
    `DataTable`) carries `data-rows="form"`, explicit table roles, and `data-label` on each `<td>`: a card of
    labelled fields. A button whose label can be long (it names a merchant) is `size: 'wrap'`. A matrix (plans) is one `Section` per column on phones.
    Line 1 holds the link (number or name) and the figure, right-aligned.
    Line 2 holds who, where and the badges. The whole row is one target.
16. Every number column is right-aligned in mono, in both surfaces. Lists
    sort naturally ("Brand 2" before "Brand 12").
17. A list's count comes from its own query over every row, never from a page
    or a capped list. A list longer than a page says "Showing 1–100 of 300".
18. An empty search state says the search found nothing ("No merchant matches
    that search · Clear search"). It never offers "Add the first …".

**Targets and type**
19. Every target is at least 24 × 24 px (WCAG 2.5.8), padded rather than a
    bigger icon; a text button or link is `inline-flex min-h-6 items-center` (a one-letter one also `min-w-6`);
    quick-add words are chips, not comma-separated text. Controls are `h-10` under 768 px and `h-9` above; a button's
    height is its `size` variant (`default`, `lg`), never a className (twMerge
    keeps `md:h-9` against a caller's `h-11`). Rows and the
    bottom bar are 44–56 px on phones.
20. Icons: frrata's own set (`src/components/icons/icon.tsx`, rule 36), 16 px
    in nav (22 px in the bottom bar), `--sub` until active. No coloured icon
    backgrounds. Utility glyphs inside primitives (the back chevron, search,
    info, menu dots) stay lucide until redrawn in the set. A brand empty state
    may lead with one `PictoTile` (§ Graphic language); working lists keep
    plain words.
21. Indian names: Noto Sans (Devanagari, Tamil, …) is a fallback face behind
    Inter in the shell's own stack (`--font-shell` on `[data-shell]`, never on
    `html`), committed files (`next/font/local`, OFL) with `preload: false` and
    each script's unicode-range, downloaded only when a glyph needs it. A name
    renders through `<Name>`, which sets `data-script` from `scriptOf()` for line
    height 1.8. Mono has `font-variant-ligatures: none`.

**Motion (adds to § Phase 1 Motion)**
22. CSS only: transitions with `@starting-style` and
    `transition-behavior: allow-discrete`. No animation library. Animate only
    `opacity` and `transform`.
23. Enter and exit are a pair. Nothing leaves slower than it came. Tips take
    120 ms; dialogs, menus and toasts 200 ms; phone sheets 320 ms.
24. **No page transitions** until Next and React are upgraded to React 19.3's
    `<ViewTransition>`. Then it is used only for a content-reveal crossfade,
    with the header held still, `::view-transition { pointer-events: none }`,
    0 s under reduced motion, and never a sliding list.
25. Reduced motion: every change is instant, and a countdown (the 8 s Undo)
    becomes words ("Undo for 8 seconds").
26. The one brand moment: "Your shop is open", a check drawn once in rani (320
    ms circle, 200 ms tick), its words in the display face. No confetti, no
    sound.
27. A Console, Admin or partner `Dialog` on a phone (< 768 px) is a sheet
    from the bottom (full width, 85 dvh at most, 320 ms, its scrim with it).
    **Android's Back closes it** natively: Back is a close request, the same
    `cancel` as Esc (Chromium, blink-dev intent to ship; Firefox 149+, Mozilla
    bug 1966073; checked 2026-11-07). An iPhone has no Back; its edge swipe
    leaves the page, as on any site. Never push a history entry for a
    `Dialog`: Next replaces the entry on a server action or refresh
    (`preserveCustomHistoryState: false`) and a `back()` racing a
    `router.push` discards the push. (The storefront size guide's own entry
    is the exception: no action or navigation runs while it is open.)
    `Dialog` also answers `close`, for a close request let through without
    `cancel`, so its `onClose` must always set `open` to false.
28. Lists never animate. While a move is on its way (`NavProgress`, after
    150 ms) `main#content` has `aria-busy` and its tables and `[data-list]`
    dim to .55. Mark a list of records that is not a `<table>` with
    `data-list` (activity, people, partner clients, Admin partners do).
29. Progress bars move by `scaleX` on a full-width bar, never by `width`.
    `npm test` runs `check:motion`: a layout transition, `transition-all`, an
    arbitrary `duration-`/`ease-`/`animate-`, keyframes animating anything but
    opacity and transform, or an animation over 400 ms fails, apart from the
    exceptions named in the script, each with its reason.

**Home "Today" (owner-approved mockup 2026-11-07, U·4; spec `docs/specs/2026-11-07-ux-today.md`)**
30. Before the shop opens, Home is the setup checklist. Once it is open, Home is
    the day's work, in this order: the next order to confirm (oldest first,
    one tap to its page), three counts (To confirm, To pack, On hold; each a
    link to its tab; `CountTiles`), the last 7 days (orders placed and their
    value, cancelled left out, one `scaleY` bar per IST day), and one line for
    setup steps still open, or, when none are, "Setup, or close the shop for
    now" (the checklist lives at `/console/setup`; always one tap away). No
    suggestions or feature cards, no change-on-last-week figure, no chart
    library.
31. A Home count is `queueCounts`' and the nav pill's `toConfirmCount` reads the
    same predicate (the pill, the tabs and the tile agree); "N
    high risk" is `risk()` over the whole tab, never a page of it. A count that
    could not be read says "Couldn't count", a risk "Risk unavailable"; never
    0. A tile that is 0 stays in place and says so ("Nothing to confirm").
32. A card that is one link is `CardLink` (`src/components/layout/`); waiting
    counts are `CountTiles` (`src/components/data/`). The brand moment lives
    in `OpenMoment`, which wraps a page whose content changes when the shop
    opens; never in the component that opened it.


Their words, not ours: order, delivery, return (not RTO in headings — "Returned
to you" with RTO in the detail), payout, customer, product, size. "Delivery
failed" for NDR in lists. Money is "profit", not "contribution". Never claim a
saving we cannot show from their own orders.

## Brand: frrata (owner-approved 2026-11-07; spec `docs/specs/2026-11-07-brand-frrata.md`, book https://claude.ai/artifact/S55h8hC9dYNJC2fQghjFvi)

33. **The name** is "Frrata" in a sentence (capital F) and "frrata" in the
    mark, always drawn, never typed. Said aloud it is "frata"; that is fine.
    `check:name` fails the old name in any string, template or JSX text in
    `src/`; internal names that must not change (storage keys, the
    key-derivation salt, taxonomy ids, hosts until B·4) are listed in
    `scripts/check-name.allow.json`, each with its reason.
34. **The mark** is drawn once (`src/components/brand/mark-paths.ts`): A
    "Thread", the first r's arm stopping a 3-unit stitch short of the second.
    `<Wordmark thread>` (rani thread) on brand surfaces (sign-in, the website),
    plain in working screens; `<Monogram>` in the shell (ink tile; rani tile
    on ink). The platform icon is generated from the same paths
    (`/frrata-icon`); a shop's tab never shows it.
35. **Type:** Bricolage Grotesque at **600** (`font-display`, committed, shell
    pages only, never a shop: `check:storefront-build`) for page h1s, the brand
    moment and brand empty states; everything a merchant works with is Inter;
    numbers are mono. 800 was too loud (owner).
36. **Icons** are two strokes: the body in the text colour and one detail, the
    tinge, in `var(--icon-accent, currentColor)`. The tinge is on only inside a
    `[data-tinge]` frame (today: the navs and the More sheet; `--brand-on-ink`
    on ink). A new frame (an Apps tile grid, an icon button) opts in the same way.
    In a table or beside a status badge an icon is one colour. The current
    page's icon is drawn at 2.25.
37. **The thread** (`--thread`, 2 px, ≥ 3:1 on ink and card): a primary button
    carries it a third wide at its foot and the full width on hover or keyboard
    focus (a `scale` transform, 120 ms); a secondary button on hover and focus
    only; destructive, ghost and disabled buttons never, nor a secondary button
    that undoes something (Close shop, Disconnect, Delete: `after:hidden`).
    The line sits inside the corner curve (`inset-x-1.5`); no `overflow-hidden`
    on a button (it would clip a wrapping label). Also the Console's
    active nav bar, the current view tab, the loading bar and a working link's
    underline. Admin's active bar stays yellow (rule 8).
38. **The running stitch**: a dashed edge (`border-dashed`) for a place to drop
    something and for "setup steps left"; never around a card that is content.
39. **The block print** (`block-print` utility): the mark's quarter circle and
    circle as a repeat, a mask over a token at 6%. On the public pages it is the
    `Selvedge` only (paper on ink, under the stage; rule 42), never behind a
    number, a table, a form or a control. Brand empty states use a `PictoTile`.
40. **Haldi and Neel** live on brand surfaces only and are never text or a
    control. Rani as text is `--brand-text`.

## The public pages (owner-approved W·1, 2026-11-07; spec `docs/specs/2026-11-07-website-rework.md`)

41. **Fewer words, more pictures** (owner): each section makes one point, in a
    heading of at most 6 words, a line of at most 12, a card of at most 2 short
    lines (a page's h1, the one promise, may run to 8 words), and shows it in a
    drawing, the product picture or a number. No
    reassurance paragraphs, no notes about how the page is made. These stay
    visible whatever the word count: "+ 18% GST" and "of each delivered order"
    on every plan, "up to N orders a month", the partner's 90-day tail and "24
    months, from opening", "₹0 added to the brand's price", and "Example · ex
    GST · paid monthly once billing starts" beside partner numbers, and the
    sign-up page's "Not asked now" panel (§ Phase 1; it answers the question
    that stops a sign-up). Anything not built carries a Next tag, in the
    product picture too.
42. **The frame** is `src/components/brand/site.tsx`: an ink `SiteStage` with
    `SiteHeader` (skip link, the mark with its thread on ink, the `inverse`
    button), the `Selvedge` (the block print as a woven edge under the stage, the
    only place it appears), a Neel `NumberBand` of terms (paper on Neel, gated),
    and `SiteFooter` with WhatsApp written out. /, /partners, /login and /start.
43. **The product is shown as it is**, drawn (`ConsolePreview`,
    `EarningsPreview`): `inert`, marked "Example", every figure from the engines
    (`exampleOrder()` through `orderProfit()`, `shareExample()`), never typed.
    No invented testimonials or logos.
44. **No new client script on a public page**: a choice is radio chips, with
    one panel per choice in a shared cell, shown by `[data-calc]:has(:checked)`
    and named by `aria-describedby` (the partner calculator over
    `shareTable()`). The shared `InfoTip` and the sign-in form are the only
    islands.
    Large ₹ figures are mono (a ₹ in the display face pulls the Devanagari file).

## Storefront

- Each merchant gets theme tokens (a small set: ink, paper, accent, display
  font, radius) applied under `data-store-theme`; never hard-coded per page.
- Editorial, type-led, large imagery, few colours. Indian shopper conventions
  built in: pincode delivery check, "Pay on delivery" badge, size chart and
  "find my size", the return window in words, WhatsApp order updates.
- Phone first, touch targets ≥ 44px. Photos from the 1A ladder (400–1600 WebP)
  through `srcSet`/`sizes` (`src/components/storefront/photo.tsx`), the largest
  paint eager with `fetchpriority=high`, the rest lazy; no `next/image` optimiser.
- Checkout: one page, at most 7 fields, phone first, pincode fills city and
  state, labels above fields. No shopper OTP until DLT registration (Phase 2);
  COD rules and the To confirm queue carry the risk. No merchant cost ever
  reaches this surface (ADR-0003).
- **Sizes are buttons**, sold-out shown and still readable; Add to bag stays
  usable and points at the missing size instead of greying out. Size guide is
  a sheet the phone's Back closes, in cm and inches, with the model's height.
- **Pincode answers as the sixth digit lands** (COD or not, and why) — deferred
  by the owner 2026-11-06; until it returns in 1C the product page says delivery
  days in words. When it comes, it is on the
  product page, before the bag.
- **Every charge is a line before ordering** (CCPA dark-pattern guidelines,
  2023): shipping, the COD fee. A total that changes says so ("Price updated
  to ₹2,690") before payment, never after.
- A failed payment returns to a filled form, never an empty one.
