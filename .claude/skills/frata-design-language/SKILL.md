---
name: frata-design-language
description: Use when building or changing any Frata UI - a console page, table, filter, form, dialog, badge, empty or error state, the storefront, a theme - or when choosing a colour, font, spacing or motion, or how to show money, an order number, a date, a status or COD risk.
metadata:
  version: 5.24.0
  verified: 2026-11-13
  covers: ["src/app/base.css", "src/app/globals.css", "src/app/shop.css", "src/components/**"]
---

# Frata design language

## Rule 0 — no explanations (owner, 2026-11-08; binding on every screen AND every mockup)

**Clients and partners already understand their work. A screen never explains anything unless it is required.**
Pages are clean, the layout tight, space used for the work, not for words.

- **Default: no helper text at all.** A screen is labels, values, controls and actions. No intro paragraphs under a
  heading, no "what happens next", no "Not asked now" asides, no "you can change this later", no reassurance ("nothing
  is charged…"), no notes repeating what a label or the layout already shows, no notes for staff on how a feature works.
- **Required, so it stays — and only as short as it can be:** an error and how to fix it; a limit a person must meet
  (a format, a range); money that will be taken, with its date (one line, at the action); legal or GST wording the law
  asks for; a consequence that cannot be undone, in the confirm dialog of that action; a risk reason.
- **Anything else optional goes in an (i) tip** (§ Labels, info tips) — and only if a real person would ask.
- **The cut before shipping** (and before publishing a mockup): read every sentence on the screen and delete it;
  restore it only if the screen is wrong or unsafe without it. A status is a chip or a value ("Trial · 12 days left"),
  never a sentence.
- **Space:** one card per job, no cards that only hold text, dense rows over stacked paragraphs, actions beside what
  they act on.

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
  `--illo-haldi-soft`, `--illo-indigo-soft` (base.css, both themes). Never
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

## Apps and modules (approved mockup v2, 2026-11-07; the gallery and app pages: § Apps gallery below)

- **Console › Apps** (`/console/apps`, Store group; in More on a phone): the gallery in § Apps gallery. Every card and
  app page reads `offerFor()` (`src/domains/modules/offer.ts`) — footer, state chip, filter and the one action.
- Turning a module off asks once: "Turn off X?" · "Keep X" / "Turn off X".
- **Messages setup** (`/console/apps/communication`, from the Apps row's "Set up"): not connected → two path cards
  (Business app, bordered 2 px, "Most brands"; a new number) with an icon tile, the app-changes and other-tool
  notes as (i) tips, and a muted "Next" band. Connected → the number card (mono phone, name · which apps, Quality,
  Limit, Chats from the app; More: Check again, Disconnect) and "Needs you" rows: a badge (Blocks messages / By 31
  Dec / Quality low / In review), the need in words, one action. Meta's raw values never show.
- **Admin**: merchant tabs Overview · Modules · Plan · Addresses. The Modules tab is a table
  (Module, Granted by, Merchant, Usable, action: "Give a 30-day trial of X",
  "End trial"). Admin › Modules pauses a module "for everyone" with a reason;
  the shop sees "Paused by Frrata". Admin writes are admin-role only.
  The Addresses tab lists the shop's names (Current · Old · redirects · Old · no redirect), then "Rename <shop>'s
  address" and "Freeze <shop>'s address", each with a reason. Admin › Names: block a name or domain, unblock or
  release with a reason in the row; Frrata's own words listed, read-only.

## Apps gallery (owner-approved 2026-11-11, mockup https://claude.ai/artifact/6Th5A8X4YSXCcyozpzPLEg; plan `docs/plans/2026-11-11-apps-gallery.md`; supersedes the Apps list rows and the details dialog above)

- **One card for every app**, whatever its state: icon tile, name, "By Frrata", the job in one line, a footer with the
  price or "Included" and one state chip (On · Coming next · a lock with the plan). No ratings or install counts.
- **Your apps first** (compact cards: state "Working" or a meter at 80%, Open), then the gallery grouped by the
  merchant's job: Talk to shoppers · Get paid and ship · Sell more · Run the books. Search and filters with counts.
- **At most one featured card**, chosen from the shop's own numbers (the pricing ladder's nudge), dismissible, staying
  dismissed. Never a pop-up, timer or animated upgrade button; no promised outcome. As built (A2): owners and admins
  only, never a support visit; it names the shop's own invoice ("On Growth your 1 Dec invoice would have been ₹X
  less"), both totals and "both + 18% GST", one link (See <plan>) and Not now; hidden until the browser has read the
  dismissal (no flash); `FeaturedCard` in `src/components/modules/`, the words rendered on the server.
- **An app's page, not a dialog**: a benefit headline, ≤ 3 features each with a drawn 16:10 picture of the app working
  (console tokens, no real shopper), ≤ 3 questions; a side column with the price box (GST, trial, first charge date),
  Works with, What it uses, Billed by others. On a phone the price and button sit in a bar at the bottom.
- **One button that matches the state**: Turn on · Start free trial (an add-on never tried, A3) · Ask Frrata to add (tried
  before) · See Growth with the
  shop's own rupees · Open · Tell me when it's ready. A higher-plan app is shown locked, never a button that fails.
  An app that needs another one off offers "Turn on <that app> first" (a link to its page); one that is on while what
  it needs is off says "Waiting for <that app>" in warn and stays in Your apps.
- **Once on, one home for every app** (A2, `AppHome`): ONE state chip ("Working", `homeState()`, the same one Your apps
  shows) and the app's own condition as a second badge (Not live yet, Connected, Needs attention, Ready); tabs
  Overview · the app's own · Usage and billing (`AppFacts`, the app page's side column without its button; never for
  the accountant); ≤ 4 numbers; a meter only once an app has an allowance; **Turn off <app> alone at the foot**, no
  explanation on the page (Rule 0) — what it does is listed in the confirm (`OFF` in `src/domains/modules/showcase.ts`).
  Owners and admins only, never a support visit (`mayTurnOff`, the same rule as `setModuleAction`).
- **Add-on trials (A3, 2026-11-12)**: the confirm lists, as bullets, "Free until <date>", the monthly price + 18% GST
  with the GST-inclusive figure and on which invoice the first part-month comes, and "End the trial before <date> and
  nothing is charged" (CCPA 2023: no drip pricing, no subscription trap). In a trial the state chip is "Trial · N days
  left" (IST days), Usage and billing says "Then ₹X/month + GST from <date>", and the foot shows **End trial** in place of
  Turn off; a paid add-on's Turn off confirm says billing stops at the month's end. No retention screen anywhere.
- **Delivery Zones** (approved mockup https://claude.ai/artifact/67kHoVDaRX5AFS5vWcWAgR): tabs Zones · PIN code rules ·
  Delivery dates · Usage and billing. Zones is a DataTable (rows on a phone: name + charge, then days · pay on delivery),
  ↑ ↓ to reorder (in place of drag: keyboard first), Edit in a dialog. Rules: search, Import CSV (preview of counts and
  line errors), Export, Add a rule; Settings' no-COD list shows dimmed "From Settings". Dates: dispatch, ship-day
  toggles, holidays, and "Ordered now" with each zone's LATEST day.

## Shop themes (approved mockups 2026-11-08, T0–T2 built)

- The storefront's `--store-*` tokens now come from the shop's theme (`schemeVars(theme, scheme)` on the shell and
  on any section painted in another scheme). Never hard-code a store colour in a component.
- Themes are presets over one section library; a new look is a manifest, a new capability is a section.
- Promise and trust words come from shop facts, never typed claims; a section with nothing to show renders nothing.
- The customizer and Look follow the T1 mockup (https://claude.ai/artifact/9QRkdHHKLAwpj5LmcxYYSU): phone preview
  first, one primary action (Customize / Publish), autosave states, Undo/Redo, counters for limits.
- Storefront tokens a component may read: `--store-bg/text/sub/line/chip/accent/button/on-button/sale/good/bad`,
  `--store-display`, `--store-radius`, `--store-ratio` (photo shape), `--store-cols` (phone columns),
  `--store-h-scale`, `--store-space`. Buttons carry `store-btn` (Outline buttons follow `data-buttons`), a second
  photo on hover `store-hover` (off with `data-hover="off"`); motion obeys `data-motion`.
- Customizer patterns: every change is one Undo step and an autosave 800 ms later ("Saving…" / "Saved" / "Not saved"
  in a `role=status`); a stale draft says who changed it and offers Reload; move up/down buttons beside drag; Add a
  section is the searchable library (Look v3 below); a section that blocks Publish says "needs you" in the list;
  Publish is the one-line confirm, Going live, then the popup over the shop (Look v3 below); a partner or staff sees
  "Ask the owner to publish"; support sees but can't change.
- Pages beyond Home (T2 mockup https://claude.ai/artifact/H9wfYHs6Uq3Vod7rbRvHsM): the customizer's page picker
  opens that page's panel (Product page: photos swipe/with thumbnails, About and details open/folded; Collection
  page: title/banner); cards (standard/centred/framed) and computer columns (4/3) apply to every grid. One tag per
  card: availability first, an offer's badge only where none shows.
- A Hindi shop: `lang="hi"` on the shop, Noto Sans Devanagari after Inter; the shop's own words change, what the
  merchant typed never does. Hindi words get a fluent reader's review before a Hindi shop goes live.
- Theme versions (T3): Look tells the merchant in words, never a status code — an update is ready (and that nothing
  changes until they publish), Frrata recalled the version they're on (with one tap to restore the previous look),
  or withdrew it (their previous look is live, nothing lost). Admin › Themes says every decision is final and names
  the shops it touches; a destructive decision is a red-labelled form with a required reason, not a typed phrase.
- Colours and type live in Look only; Settings › Brand keeps the logo and tagline and previews them in the published look.
- **Three themes, each a job** (owner, 2026-11-08 night; plan `docs/plans/2026-11-09-themes-three.md`):
  **Editorial** — occasion and designer wear: photos stacked large beside a buy box that stays, Cormorant, square,
  a sheen on buttons, photos that grow, pages that fade in, sections that rise, statement footer in ink, focused
  checkout. **Bazaar** — big catalogues and sales: circles, bottom tabs, three across, framed cards that lift,
  thumbnails under the photo, pill buttons that press, a phone Add to bag bar, tinted footer. **Studio** —
  contemporary and basics: split header, uppercase Inter, underlined buttons, two photos across beside a buy box
  that stays, pages that rise, statement footer in black, focused checkout. A new look is a new value a theme
  offers, never a fourth theme without a new job.
- **A theme offers its own choices**; the customizer shows a choice only when the theme offers two or more values
  (one value is no choice). Names merchants read: Photos (Two across, Stacked, Thumbnails under, Thumbnails beside);
  Buttons Style (Solid, Outline, Underlined), Shape (Follows corners, Pill), On hover (Press, Lift, Sheen); Cards on
  hover (Still, Lift, Zoom photo); Pages arrive (At once, Fade, Rise); Checkout (With your menu, Focused).
- **2.0 motion**: transform and opacity only; hover motion inside `(hover: hover)`; a page arrives from opacity 0.6
  (never 0, so the largest paint isn't held), ending on no transform; sections rise with a scroll timeline, never
  the first; `Motion: None` and reduced motion stop all of it. Add to bag stays a filled button in every style.
- **Legal lines never leave**: Statement and the focused checkout keep the policies, legal name, address and
  grievance officer.
- **Sample pieces** fill the customizer's preview of an empty shop, tagged "Sample", drawn (never photographed), and
  never reach a shop; a photo section still needs the merchant's own photo to publish.
- **Look v3** (owner-approved 2026-11-09, mockup https://claude.ai/artifact/N3ATeKr1XxgTvEiPLjN2tq):
  **Frrata Themes** is the tile lockup (`<ThemesLockup>`: monogram + "themes", "by Frrata" under it; `size="sm"` is
  the card badge), never "by Frrata" in words. The preview opens on a **computer**, the shop drawn at 1280 px and
  scaled to fit in a browser frame with the shop's address; Phone is one tap. **Publish is a small confirm** under the
  button (one line, no list of changes; only what blocks it, each with Fix), then the preview says **Going live**
  (a sweep and the header's rani line filling, held ≥ 1.3 s), then a popup over the live shop: its address (Copy),
  Undo, Keep editing, View your shop (a new tab). Never a page of its own.
- **Confirm what loses work or changes the shop**: Discard draft, Undo last publish ("Put Classic back on your
  shop?"), Restore over an open draft, Try a theme over another theme's draft, leaving the customizer before a save
  lands. Removing a section is a toast with Undo, not a dialog; hide, move and style changes ask nothing.
- **Style panel**: groups that open and close, each saying what it is set to; colour styles as colour bars with a
  check; brand colour as swatches plus Any colour; buttons as real buttons that show their hover; header, footer and
  photo layouts as pictures; up to four short choices as a sliding segmented control (`Segmented`).
- **A photo field**: drop, paste or choose, or one of the shop's product photos; the photo shows at once under a
  progress ring while it uploads; tap it to set the point it keeps in view; replace and remove on the photo;
  description suggestions; a failure says what to do (an iPhone HEIC says how to share it as a JPEG).
- **Section library**: search by name, words and tags (`/`), kinds with counts, picture cards, "Fits <theme>" on by
  default, "Made for <theme>" first, a full section greyed with its limit, "Adds below <section>".
- **Look v4** (owner-approved 2026-11-09, mockup https://claude.ai/artifact/MmC6BnAps1XXSWyfy7PfSL): three layers,
  shown apart — **Site settings** behind the gear ("Site" at the top of the panel: Colours, Text styles, Icons,
  Brand), **Style** (the theme's own choices), **page options** (each page in the page picker: Home, a product, a
  collection, Shop all, Bag, Checkout; "Editing: <page>"; opening Style › Products opens a collection). Bag and
  Checkout are one layout for every theme (money pages), styled by Site settings. A palette is checked as it is
  picked ("Reads well" or why, never saved unreadable). The panel folds to a rail of icons on a computer.
  **Shop icons**: Line (Lucide), Duotone, Solid (Phosphor), one stroke (Thin 1, Regular 1.5, Bold 2), inline SVG,
  `currentColor`; an icon sits beside words in menus and tabs, never instead of them (the bag in the header is the
  one icon alone: its name and count are its label). No text glyph as an icon (≡ is gone). **Menus**: Main (3
  levels), Footer (1), Phone tabs (≤ 5, each an icon); moved by Up, Down, Under the one above, Out a level (thumb
  first); every level that opens starts with "View all"; soft warnings past 7 top items or 10 under one.
- **Even rhythm** (2.0 themes): the same space above and below every section but a full-bleed one. Horizontal rails
  snap to their padding (`scroll-px-4`), never past it.

## Theme Studio (owner-approved 2026-11-11; spec `docs/specs/2026-11-11-theme-studio.md`, mockup https://claude.ai/artifact/3Mpvh9zHQF6P4kJBihkmTd)

- **Who builds:** Frrata staff in Admin (ink frame, STAFF tag, "Submit for review"); partners in their portal (their
  name as the tag, "Release to my clients"). Owners never build structure: in Look they fill fields, reorder, hide and
  add the theme's designs and pages.
- **The studio is desktop-only** ("Open the studio on a computer" on a phone); Look stays phone-first.
- **Layout:** top bar (theme · version chip, page picker, Design system, Computer / Phone, Checks count, Undo / Redo,
  the one primary action); left the layers tree (indent per level, ↑ ↓ and ⋯ on hover or selection, "+ Add a block" with
  `/`, the limit as a count); centre the preview on sample pieces (the selected section outlined in the shop's accent
  with its name); right the block's settings and **Owner fills** (which fields the owner edits).
- **Block picker** is the section library's pattern: search, kinds with counts, presets as picture cards; a block at
  its limit is greyed with the count ("100 of 100 blocks on this page").
- **Checks** are a count chip in the top bar (amber "2 to fix" → green "Checks pass"); each failing check is one line
  with a one-tap Fix that names the result ("Use #5A5A55").
- **Design system:** colours by role (Paper, Tint, Ink, Accent, Sale), each with its hex in mono and a chip ("Reads
  well" or the ratio); every other choice a segmented control of Frrata's values. Never a free CSS value.
- **Releasing:** staff Submit (frozen version, notes) → another staff member approves ("Approve Monsoon 1.0.0") →
  Admin › Themes as today. A partner chooses **which clients** get a version (checkbox per client, "Release to Kesar
  Studio"); a theme is never offered to a client the partner didn't pick.
- **Owners:** "Made for you · <partner>" first in Look's themes; "Update ready" as a banner with Try it in a draft;
  pages in the page picker with "+ Add a page".
- **Pages:** About (origin, makers, materials); Contact = "Chat on WhatsApp" to the shop's number + the business
  details from Settings (can't be removed; a form comes with the Messages inbox); FAQ answers follow Settings.
- **States:** no themes yet (pictogram + New theme); limit reached; waiting for review (Withdraw submission); withdrawn
  by Frrata (reason + Reply); partner removed ("No more updates", the look stays); partner paused by Frrata.
- **Designs in Look (TS0b, board https://claude.ai/artifact/DzD84DZsW6eGYQ6QkfJbM4 v2, approved 2026-11-11):** first in
  Add a section as **Designs**, each a picture drawn from its own blocks with "Made for <theme>"; at the page's limit the
  card greys with the count. A design's form lists only the fields the theme marks, in page order, with the theme's
  labels; questions have ↑ ↓ and Remove beside each item and "Add a question" up to 12.
- **Example words never reach a shop:** words that make a claim (how a piece is made, size answers) start as greyed
  placeholders marked **Example** with "Write your own"; Publish names each one still to write. A theme's photo is a
  sample: shown greyed in the customizer's preview only; on the shop an unfilled photo leaves its block out.
- **A drop is a date, never a ticking count** (rule 48): "Drops Fri 14 Nov, 7 pm", hidden once passed.
- **Pages in Look (TS1a, board https://claude.ai/artifact/X2TEDZRd7FyYvbiM6h6Jno v2, approved 2026-11-11):** the page
  picker's **Pages** group: Contact (always, at /policies/contact), each page by title, "Add a page…" (About, FAQ: one;
  pictures drawn from their blocks; the count of 20). What comes from Settings is a read-only box headed "From your
  Settings" with **Change in Settings**, never a field. An FAQ answer from Settings carries a "From your settings" chip.
  A page's address is set while it is a draft and fixed once published; Hide and Remove take effect at Publish.

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

## Tokens (`src/app/base.css` — shared by the app sheet `globals.css` and the shop sheet `shop.css` since Signal S2-0; the only hex; images drawn outside CSS — PDFs, share cards — keep their palette in one allowed file each; `check:hex`)

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
  View tabs (`ViewTabs`) show an exception tab (couldn't deliver, coming back) only while it holds orders; on a phone
  they may scroll sideways inside the page gutter (`scroll`, 2026-11-12) — tabs over a list, not navigation, so
  UX rule 10's "never a sideways strip" (the bottom bar) doesn't apply.
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
- **A server-action form's submit is `<Submit>`** (`src/components/ui/submit.tsx`, 2026-11-11): while the action runs
  it refuses clicks (aria-disabled, keeping focus) and runs the top bar; the label stays, naming the outcome. A GET
  form (search, a month picker) keeps `Button`. A refusal or a form that doesn't parse says so on the page, never a
  silent redirect to a list.

## Settings choices and GST (built 2026-11-09; mockups https://claude.ai/artifact/M4VfNAgqFHYmhCxFwZmepE, https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs)
- **Which control:** one of 2–4 exclusive choices that change what else is asked → **radio cards** (`kind: 'radio'`,
  each with a short note: Registration). A short scale or cadence → a **segmented** control (`kind: 'segmented'`:
  turnover, filing, a unit, months). On/off → a **switch**. A field that only applies to one choice is hidden until it
  does (`showIf`), never shown disabled; a switch that can't apply (B2B at ₹5 crore and above) is shown locked with the
  reason.
- **Segmented, in code:** `role="radiogroup"` of `role="radio"` buttons, `aria-checked`, `min-h-9`, the picked one
  `bg-card shadow-sm` on a `bg-muted` track (tax-panel, label-panel, settings-form).
- **Tax on a product:** the HSN combobox shows the code, its words and its rate chip; the rate at this price is shown,
  never explained; the inclusive-price gap is the one warning, with the price that fits as a button.
- **Console › GST:** period stepper (‹ label ›), three steps (Fix · Check the tables · Send to your CA), five KPI tiles,
  the Fix list with a count badge and one action each, the tables as tabs, the CA files as download rows. Filing (when
  on): username → OTP → Connect; Push; Frrata vs GST portal totals with ✓ / ≠; a tick that says a filed return can't be
  changed (an irreversible consequence: Rule 0 allows it), then the EVC OTP.
- **The pack (beauty, wellness):** "On the pack" section — net quantity with a unit segment, best before in months,
  "Made or packed by" with a one-tap "We pack it"; the product page lists the declarations in the Details table.

## Theme Signal (owner-approved 2026-11-09; spec `docs/specs/2026-11-09-theme-signal.md`, mockup https://claude.ai/artifact/9XNT3KFJziXEyaKyDa48dr)
- **One signal colour as a system:** the merchant's accent is used for section labels (pills), one full-bleed band and
  focus/selection, never for body text or large fills elsewhere; checked readable with `brandColourProblem`.
- **A grotesk voice** (Schibsted Grotesk for headings, labels, buttons and prices; body Inter, the shops' body face);
  headings in sentence case, short, may end with a full stop;
  uppercase only for labels and buttons, with letter-spacing.
- **Products on grey tiles**, edge-to-edge with 2 px gutters; the name left, the price right, under the photo.
- **Floating header:** a dark panel at the top left on a computer, a dark rounded bar on a phone, over the hero; solid
  once scrolled.
- **Rails say where you are:** a thin progress line and "01 / 10"; tabs are pill segments (`aria-pressed`), swipeable.
- **Video in a section** (console): empty (Add a video · or Use a photo), uploading (progress, Cancel), getting ready,
  ready (poster, length, Replace, Remove), didn't work (Choose another); a loop plays muted, only in view, never with
  sound or a player bar on the shop. TS1b (owner 2026-11-11): a loop loads after 400 ms at half in view, one at a time;
  a Home plays at most 3 (at 3, a loop field says "A Home plays at most 3 videos."); loops play a 720p MP4 at most.
- **Designs that sell (TS1b):** a design draws what its board draws (a grid of 4, tiles ≤ 4, one featured piece); the
  library greys a design with pieces or collections once 2 are on the page, saying why. A drop date reads "Drops Sat 14
  Nov, 7 pm" (`dropLineIN`, India time; never a ticking count) and is left out once passed.
- **Theme samples:** realistic photos only (credited in `public/themes/samples/*/CREDITS.json`); the merchant's own
  pieces always first.
- **Story half (1.2, S2):** a Spotlight is Image with text on the tile, words .8fr beside a 2:1 photo or loop; a Story
  fan is 3–7 cards, the middle forward, side cards' photos softened (titles stay full contrast), a swipe row on a phone,
  side by side under reduced motion, a focused card brought forward; a Statement is a full-bleed photo under a ≥ 60 %
  scrim, a small uppercase line and a handwritten wordmark. **One script face (Caveat), used only for a handwritten
  line** (the Hero's, the Statement's), tilted −4° / −6°, never for body or buttons. Section headings 22–34 px, 600,
  −0.02em, balanced. An empty story section shows nothing; it never stops a publish.

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
- **Motion**: 120 ms feedback, 200 ms small moves and exits, 320 ms sheets
  and drawers entering, nothing over 400 ms; a step moves in from the side it
  came from; changed or autofilled values flash once (`--duration-flash`);
  reduced motion fades instead (§ UX foundation rules 22–25a).

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

## Products rework (owner-approved 2026-11-13; spec `docs/specs/2026-11-13-products-rework.md`, mockup https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4)

Rules every products screen keeps (PR·0 built; PR·1–4 follow the mockup):
1. **A draft saves with what it has.** Blank prices save as none; only a live or Unlisted product refuses one, at its cell.
2. **Editing never loses work.** A chip renames in place and carries its cells, swatch and photos. A category change keeps the
   details that still apply. A field never silently reverts what was typed: it keeps it and says what is wrong.
3. **Fill, don't overwrite.** Bulk actions say how many rows they touch ("Apply to 2"), default to empty cells only, and
   are off at 0.
4. **Order the way shoppers read.** Known sizes go to their place (XS before S).
5. **A product starts from what it is.** Its kind and type come from its name (`src/domains/catalogue/kind.ts`) until PR·2's
   "What are you selling?" step. No match means no type, never the shop's first type.
6. **What shoppers see is said once.** The list's stock column comes from `bestOffer` (`src/domains/catalogue/availability.ts`):
   Pre-order, Made to order and Sold out, never "Sold out" for something that sells at 0. Unpriced sizes are counted
   ("2 without a price").
7. **Readiness names the gap.** "Size chart rows for 2–3 Y", not just "a size chart".
8. **The list scales.** Search by name or SKU, 50 a page, "Showing 1–50 of N"; past the last page goes to the last page.
9. **Duplicates are refused where they are made**: the field that holds the clash (a SKU, a barcode, a chip) is marked,
   not a toast alone.
10. **The list acts on many (PR·1).** Filters are tabs with counts (All, Active, Draft, Unlisted, Archived, Low stock),
    search covers name, SKU or a whole tag, Sort is a select, and every one of them is in the address. Selecting rows
    shows the bulk bar above the table: Set status ▾, Add to collection ▾, Duplicate (one), Archive, Delete. As in Work
    queues 7, bulk is a desktop tool, so a phone shows no checkboxes. Menus leave the bar while an action runs.
11. **Undo where it can be undone; ask where it can't.** Status changes, Archive and Duplicate show Undo for 8 s, and an
    Undo that can't put one back names it. Delete asks in a dialog (type the count for 5 or more). It deletes only what
    was never live, ordered or filmed. The rest is named, and Archive is offered for what isn't archived already.

## Import and order edit (owner-approved 2026-11-12; specs `docs/specs/2026-11-11-product-import.md`, `docs/specs/2026-11-11-order-edit.md`, mockup https://claude.ai/artifact/76HjNBCo2xdJyf6Qvwxutx)

- **A bulk write is file → check → write.** Steps in a strip (File, Check, Import); counts first (new, already
  there, left out); every problem as row · column · what to fix, with "Download rows to fix"; a preview of the first
  few as they will look; one primary action naming the count ("Import 58 as drafts"); the safe one names what stays
  ("Keep my shop as it is"). Imported products arrive as drafts. Done lists what each still needs, each with its button.
- **Photos in bulk are matched by file name** (SKU, address or name, a trailing number for order); an unmatched photo
  asks "Which product?" in place.
  As built (PI·2, 2026-11-12; `src/app/(console)/console/products/photos/`): "Add photos" from Done's Need photos tile
  (back: Import) and from Products' header, under More (back: Products); meta "N products need photos", one primary "Choose
  photos", the info callout with two example names from the shop's own products; empty: a drop area with the formats
  and "up to 500 at a time". One card: "126 photos · 37 products" + a warn "4 not matched"; cards as drawn (the file
  name on the photo; the product, then "Photo 2 of 3" or its colour; "Change"); a card that asks has a warn edge, its
  preview, and a search combobox named "Which product is IMG_4021.jpg", offering first the products a name fits when
  they are ≤ 3. Buttons: "Skip the N not matched" and "Add N photos" (only photos with a product and room). While
  sending: one bar for all, one per photo; each card ends "Added", "Not added" or "No room" (a product holds 10). A
  failed photo is ONE error toast (its words, "N photos added" under it, Try again); success one ok toast.
  Leaving while sending asks the browser's own "Leave site?".
- **Editing a placed order is in place, until packed.** Per line: the product's other sizes and colours as chips with
  what is left ("L · 2 left"; the original dashed; sold out crossed through), quantity − / +, Remove with a reason.
  "What changes" beside it, live: each change in words, an offer that now gives less, and the money (COD "Collect
  ₹6,016 → ₹5,207"; paid online: "Refund ₹1,899" with its timing and that the gateway keeps its fee, or "Collect ₹499 on
  delivery"). Save names the order and the money ("Save and refund ₹1,899"); the safe button keeps the order as it was.
  After: a toast with Undo, "Was M" on the line, the change in Activity.
  As built (OE·1, 2026-11-12; `src/app/(console)/console/orders/_components/edit/`): the editor replaces the Items card
  in place and loads its code only then; "Edit items" sits in the card's header, with "Undo the change" beside it while
  the edit can still be undone (10 minutes, before packing). Remove asks its reason as three chips on the line (Out of
  stock, Customer asked, Other; "Keep it"); a removed line is struck through with "Removed · out of stock" and "Put it
  back"; a piece added in the edit comes out without a reason. A line whose product was deleted says "No longer sold":
  no chips, no − / +, Remove only. A size already on the order is not offered again. A refusal (over the COD maximum,
  sold out, a reason missing) is one line in "What changes", in the error colour, and Save waits. The email tick shows
  only when the order has an email ("Email Ananya the new total"). Who sees "Edit items": owners and admins, on an order
  paid on delivery, until packed — never staff, a support visit, a paid order or one that started as an online payment.
  Activity says "emailed" only once the email went ("email waiting" while it is held for the Undo window). Phone: one column, the two buttons
  fixed above the bottom bar.

## Offers (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-coupons.md`, mockup https://claude.ai/artifact/HVFMBJzJoH9tTUh9d1zxHT)

45. **Save, never surcharge.** "Pay online, save ₹50" on the pay-online card and "No ₹50 online
    saving" on the COD card; never "COD costs ₹50 more". Every fee shown before the shopper commits.
46. **The best offer is applied for the shopper.** Checkout lists the shop's offers (applied, or
    what each needs: "Add ₹300 more"); "Have a code?" stays behind a link (Baymard, Jun 2026).
47. **One answer for a code that does not apply**, whether it exists or not: "this code doesn't
    work here". Unlisted codes never appear in a list. One exception (shopper batch 2026-11-12, owner to confirm): a
    real code that would save on this bag but is beaten by a better offer of its class reads "a better offer is
    already applied" (`'beaten'`), and is no wrong guess.
48. **Real ends only.** The bar shows "till 30 Nov" only when the offer has an end; never a
    countdown, never one that restarts per visit (CCPA dark-pattern rules).
49. **Each saving is named** in the bag, checkout, the order page and the invoice; the invoice
    shows value and discount before GST at the line's rate.
50. **The console judges offers on delivered orders:** uses, ₹ given, delivered, ₹ kept per order
    after returns (Analytics' figure: "Delivered, came back or lost · before ads and packaging", with how many were
    left out); a form warns when an offer would mostly reward orders that already qualify.
    Partners draft; owners and admins start, pause and end (ending confirms; it is final). ₹ kept is a profit, so a
    cost: whoever `seesCosts` (owners and admins; a partner only before handover, owner 2026-11-08; never staff);
    beside it, "Shipping
    estimated" or "Before shipping costs (returns count once they are set)" (with a link to set them) whenever freight is not the courier's actual charge.
51. **"Did it make money?" reads a window and says when it is too few** (O·3): the Offers list's strip and an offer's
    page show the last 30 days against the shop's orders without an offer; under 30 orders they say "too few to
    judge" before any number. A creator code flagged "Leak?" says which rule and names the remedy (end the offer);
    it never acts by itself.
52. **Stopped by Frrata** is a danger badge and a line with Frrata's own reason; the shop's only action is End.

## Shipping (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-ship.md`, mockup https://claude.ai/artifact/VfTnw5iJAT3JY7AAjteNC5)

53. **The queue by next step:** Couldn't deliver (first, in danger, when it has any) · To confirm · To pack · To ship ·
    On the way · Coming back. Each tab is a state the order already has; never a stored status.
54. **One button that changes with the step** on a packed order: "Ship ₹62 via Delhivery Surface" → "Print label";
    the courier is pre-chosen, cheapest and fastest one tap away. Staff see the courier and days, never a rupee.
55. **Lists never call the courier:** prices appear when Ship opens on one order.
56. **Shipping it yourself is a peer path,** not a fallback: Mark shipped (courier and tracking number optional), then
    Delivered or Came back, one tap each, with Undo until anything later happens.
57. **A failed delivery is today's work:** the courier's reason, the attempt, the shopper's phone (Call), and one
    action; a re-attempt needs one fix (a date, a phone, or the address with a warning when it lacks a house number).
58. **The shopper's tracking** is on the shop's own order page: the expected date first, then a four-step progress
    (Packed · Shipped · Out for delivery · Delivered), the courier and tracking number, the latest scans, the pieces,
    the way back to the shop. Never a cost.
59. **Settings › Shipping costs** (`seesCosts`: owners and admins; a partner before handover, who may set them too): a delivery, a return, a COD fee, in whole rupees, with
    what a 0.5 kg parcel usually costs offered until confirmed; saving IS confirming ("Confirmed on 8 Nov 2026").
    Until then Settings says "Needs you" and profit on orders shipped another way says "Before shipping costs".
60. **An outcome's Undo outlives the row it was on:** the toast stays when the order leaves its tab or panel. Undo
    closes at the end of the IST month the outcome was marked in; Shipped also once it has been 30 days on its way
    (it counts as delivered then).

## Analytics (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-analytics-a1.md`, mockup https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt; A·1 built)

61. **One question first:** "Where did this period's orders come from, and what did each keep after returns?" The
    period (7 · 30 · 90 IST days, today "so far") is always read against the one before, and the meta line names both.
62. **Pending is never zero and never a return.** Orders not sent yet or on the way are counted as such; a share of
    returns names its denominator ("6% of 54 with an outcome"), and an order joins it only once it has an outcome.
63. **Under 30, counts:** below `JUDGE_MIN` a share is "3 of 12" and a per-order ₹ says "too few to judge"; under 30
    orders on the whole page, the tally pictogram and a count to go replace the four numbers.
64. **"Source known %"** sits in the strip; under half, one info line points to Make a link. A source is what the link
    said: the (i) on "Where orders came from" says how it is decided, once.
65. **₹ kept only where `seesCosts`:** staff (and a partner after handover) see the same page with orders leading and
    no ₹ kept anywhere (column, headline, caption); sales and order totals stay, as on Orders.
66. **Make a link** is the page's one primary action: where it will be shared (lowercase presets; "A creator" goes to
    Offers), which page opens, an optional name; out comes the link, Copy, and "Orders from it show as …". A shop not
    open yet says so instead. A source's own page lists its campaigns and its latest 50 orders, each opening the order;
    the order page says "Came from: <source> · <campaign>" as text, never a link.

## Shop addresses (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-shop-addresses.md`, mockup https://claude.ai/artifact/BStSSZeC35kgWfxQQ6VWNz)

67. **An address is mono, whole and copyable** (`kesar-studio.frrata.shop`), with Copy and Open beside it; a merchant
    types only the name part, the domain shown as a fixed suffix.
68. **A domain's state is a badge in words** (Main · Connected · Waiting for records · Securing · Not working ·
    Disconnected), never a colour or icon alone; a failing record says only the fix ("Points to … · use …").
69. **DNS records are a table to copy** (Type · Name · Value · State, Copy per row), values read from the provider at
    the time, never hard-coded; one **Check records** button with "Checked N min ago".
70. **No explanations on these screens** (Rule 0; the owner's note at approval): what stays visible is the address, the state, an
    error, a limit ("2 changes left"), and one risk line where an action can't be undone ("Bags in progress start
    empty."). Anything else is an (i) tip or not said.
71. **Trust and safety actions** (Admin) name the shop on the button and require a reason the shop will read; the shop
    sees the reason and a **Reply**, never who reported it.

**Own domains v2** (owner-approved 2026-11-09, mockup https://claude.ai/artifact/XrDQj61tSBe4YKvUrH76xt; replaces the
8 Nov mockup's § 5–7):

72. **One address list, titled "Custom domain"** (owner 2026-11-09) on Settings › Shop address: every address a row (mono, its state chip, actions beside it);
    the main one carries a `Main` chip; rows change in place and never animate (rule 28).
73. **Connect is a `Dialog`** (a sheet on a phone, rule 27) of three steps (Domain · Records · Securing) with step dots
    and the step slide; the domain is cleaned as typed (`https://www.KesarStudio.in/` → `kesarstudio.in`, www added),
    the DNS host is read, never asked, and opens with **Open <provider> DNS**.
74. **The dialog checks for itself** every 15 s while open: each record's chip crossfades to Found, "N of 3 found", then
    Securing (a scaleX bar) and Connected (the tick drawn once) with no press; **Check now** stays. Records:
    Copy per row, Copy all, **Send on WhatsApp** (the records written out).
75. **Make main is gated and works like Publish**: the row keeps "Razorpay approved it" (never the dialog: Razorpay's
    review takes 24–48 h) and Make main appears once it is ticked (Razorpay fails live payments from an unregistered
    website); a one-line confirm ("Bags in progress start empty."), the 1.3 s rani
    Going-live line, then a popup with Copy, View your shop and Undo for 8 s.
76. **A problem lives on its row** as a chip and one line with the fix; the red banner on every console page only
    after 24 h of failures; our own failure reads `Checking paused`, never red.

## Storefront as built (1B, 2026-11-07)

- Views in `src/components/storefront/` are the ONE rendering of a shop: the
  shop pages, `/console/preview` and Settings' previews all use them.
- Product page order: gallery (chosen colour's photos first) → title → price
  (the prior price struck only after a real cut in the last 30 days, "Save ₹N", never a
  percentage; M.R.P. on its own line, never struck) → colour, then size →
  "Shoppers see" line for the choice → Add to bag (never greyed out; "Pick a
  size.") → Pay on delivery, delivery charge, dispatch and arrival days, the
  return window → description → details → the model.
- Cards: 4:5 cover, second photo on hover (pointer devices only), name, "From
  ₹" when prices differ, every colour as a small swatch, one tag at most.
- Before a shop opens every page but the policies is "Opening soon".

## Feedback: toasts, popups, field errors (owner-approved 2026-11-12; spec `docs/specs/2026-11-12-feedback.md`, mockup https://claude.ai/artifact/J74M3yUytfbgkMh4UNQbcp) — the default on every surface

1. **A failure after a button is an error toast** (`toast.error(text, { sub?, action? })`, `src/components/ui/toast.tsx`):
   save refused, a conflict ("Already confirmed by Riya at 10:42" + Reload), no connection, a server refusal, Admin's
   result. Ink toast, red mark, one line (+ one short second line), ONE action (Try again / Reload / Show) and ×.
   **It never leaves by itself** (WCAG 2.2.1), `role="alert"`, Esc or × closes it. Never a red line at the top of a
   page, never a `?error=` paragraph.
2. **Success is a toast of kind ok** (green check), 8 s, paused on hover/focus, Undo where reversible (§ Work queues 4).
   No role of its own: spoken through the one polite region (the shell's, or the Toaster's where there is no shell).
3. **Field mistakes stay at the field** (`<FieldError>` + `useFieldErrors`, or `<ActionForm>` + `<FieldMessage>`):
   red edge, one short line with the mark, checked on submit (on blur where a form already does), cleared the moment the field is fixed, nothing typed is ever cleared. On submit,
   focus goes to the first wrong field and ONE error toast says "2 fields need fixing" with **Show**; it counts down
   as they are fixed and leaves at zero. The toast never takes focus and is not an alert (said once, politely); inside
   a Dialog there is no toast (the page behind is inert): the marks and the focus say it.
4. **Popups confirm what loses work, money or stock** (`Dialog`, the phone sheet), with a pictogram from § Graphic
   language. A failure inside a popup is shown in that popup (`Dialog`'s error slot), never a second popup or a toast
   behind it. No other kind of popup for errors.
5. **Stays where it is** (pinned by its own rule): "Pick a size.", a code that doesn't apply, a failed payment's filled
   form and its line above Pay, "Price updated to ₹…", a domain's row problem, "Couldn't count" / "Risk unavailable",
   autosave's "Not saved", Publish's blocking list, `Panel` states, the support-mode and billing banners.
6. **One toast at a time** (a new one replaces the last), bottom centre, clear of a phone's pay or save bar and never
   over the focused control (WCAG 2.4.11). The shop's toast wears the shop's colours.
7. **Motion**: toast in 200 ms (`ease-entrance`, 12 px up), out 200 ms (`ease-exit`); its mark pops once on
   `--ease-snap` (scale .5 → 1); a field's line drops in 4 px over 200 ms; dialogs as § UX foundation 23/25a. **No
   shake.** Reduced motion: a 120 ms fade, nothing travels.
8. **The shop's toast** (`src/components/storefront/store-toast.ts`, built 2026-11-12): the same `ToastApi` in the shop's
   colours, in three parts to fit the shop's script budgets — a server-rendered box and polite region in `ShopShell`
   (the real shop only, never the console's preview), a tiny store the islands call (`useStoreToast()`), and the view,
   loaded lazily into the box. An ok toast leaves after 5 s (no Undo, nothing to pause for); an error stays. If the
   view cannot load, the words show plainly in the box. A state the shopper cannot act on without it (no price at all,
   a failed payment, a changed price) stays on the page, never only in a toast.
9. **By default**: every surface mounts ONE `<Toaster>` in its layout (the shop: its box); `check:feedback` refuses a hand-written error
   line (`role="alert"` paragraph, `text-danger-text` sentence, `?error=` read) outside the primitives and the rule-5
   allow-list.

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
20a. **No Unicode glyph stands in for a control** (owner-approved 2026-11-08): ↑ ↓ ◉ ↶ ↷ × › are drawn
    in `icon.tsx` (`up`, `down`, `eye`/`eyeOff`, `undo`, `redo`, `close`, `chevron`, `drag`). Two nav items
    never share a glyph (Admin: Merchants `merchants`, Themes `themes`, Partners `partners`, Staff `staff`, Names `address`;
    the partner workspace: Your details `details`). A row that opens something ends in a `chevron`; a status
    pill says "Needs you" only when it does. How an order is paid is a neutral badge with its icon (`cod`,
    `prepaid`): only the order's state is coloured. A count that is still going says so ("Today · so far").
    Before a number means anything (an offer under 30 orders) show the one line, the `tally` pictogram and
    a meter, never a grid of zeros. A flow of money or steps is drawn (the payments flow, `Journey`), its
    words still in the page.
21. Indian names: Noto Sans (Devanagari, Tamil, …) is a fallback face behind
    Inter in the shell's own stack (`--font-shell` on `[data-shell]`, never on
    `html`), committed files (`next/font/local`, OFL) with `preload: false` and
    each script's unicode-range, downloaded only when a glyph needs it. A name
    renders through `<Name>`, which sets `data-script` from `scriptOf()` for line
    height 1.8. Mono has `font-variant-ligatures: none`.

**Motion (adds to § Phase 1 Motion)**
22. CSS only: transitions with `@starting-style` and
    `transition-behavior: allow-discrete`. No animation library. Animate only
    `opacity` and `transform` (or `scale`/`translate`) — never `box-shadow`,
    `filter` or a layout property. Durations `fast|base|slow` (120/200/320);
    easings `standard|entrance|exit`, and the two springs written with
    `linear()` (owner-approved 2026-11-08): `ease-spring` (about 4%
    overshoot) for what travels across the screen — a phone sheet, a drawer,
    the bag — and `ease-snap` (no overshoot) for a switch's knob or a count
    that hops. Never a spring on a desktop dialog, a number, or in Admin.
    Mockup https://claude.ai/artifact/R5rhr3Q1UY27QpnkmEamNS has the table of
    every pattern; build from it.
23. Enter and exit are a pair. Nothing leaves slower than it came. Tips take
    120 ms; dialogs, menus and toasts 200 ms; phone sheets 320 ms.
24. **Route changes crossfade; nothing slides.** Once Next ≥ 16.4 and React
    ≥ 19.3 are in `package.json` (not yet: Next 15.5, React 19.2 — the
    upgrade is planned on its own), `<ViewTransition>` wraps each `page.tsx`
    (never a layout) for a 120 ms out / 200 ms in opacity crossfade of
    `main#content`, the shell a named group that does not animate,
    `::view-transition { pointer-events: none }`, 0 s under reduced motion.
    Until then the progress bar alone. The website and the shops may use
    `@view-transition { navigation: auto }` with the same crossfade.
25. **Reduced motion removes movement, not meaning** (owner 2026-11-08):
    nothing travels or scales; what opens and closes (a dialog, sheet,
    drawer, popover, toast) fades in 120 ms; decoration stops; a countdown
    (the 8 s Undo) becomes words ("Undo for 8 seconds"). The e2e flows take
    their screenshots under reduced motion.
25a. **One Switch, one sheet.** A toggle is `ui/switch.tsx`, everywhere.
    Every sheet or drawer — the phone's More, a phone `Dialog`, the shop's
    bag and size guide — enters on the spring in 320 ms and leaves in 200 ms
    over the standard scrim (`data-dialog`; the shop's `data-store-drawer`
    over its ink at 45%). A bar that appears in place (Unsaved changes)
    rises 8 px and fades (`animate-rise`); the step slide (`animate-step-*`)
    is only for a step of a flow.
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
    `npm test` runs `check:motion` (over the shop too, since 2026-11-08): a layout transition, `transition-all`, an
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


Their words, not ours: order, delivery, return (not RTO in headings — "Came back"
or "Coming back" with RTO in the detail; owner, 2026-11-08, Ship mockup), payout, customer, product, size.
"Couldn't deliver" for NDR in lists and tabs. Money is "profit", not "contribution". Never claim a
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
    GST · paid monthly once billing starts" beside partner numbers. Anything not built carries a Next tag, in the
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

- Each merchant's shop wears its published theme (§ Shop themes: the `--store-*` tokens) under
  `data-store-theme`; never hard-coded per page.
- Editorial, type-led, large imagery, few colours. Indian shopper conventions
  built in: pincode delivery check, "Pay on delivery" badge, size chart and
  "find my size", the return window in words, WhatsApp order updates.
- Phone first, touch targets ≥ 44px. Photos from the 1A ladder (400–1600 WebP)
  through `srcSet`/`sizes` (`src/components/storefront/photo.tsx`), the largest
  paint eager with `fetchpriority=high`, the rest lazy; no `next/image` optimiser.
  At most 2 images a page are `priority` (P15; TS1b: `ProductGrid` is off unless its caller opens the page; a lead
  design's photo ≤ 1). A card's cover has empty `alt` (its title names the link); its hover photo has one `src`. No shop
  font is preloaded (P6). A photo that has not painted, or never will, shows the
  shop's chip tile with a small garment drawn on it — never the browser's
  broken-image glyph or its alt text (`img[data-photo]`).
- **Shop motion** uses the console's tokens under the theme's `data-motion`
  (`none` stops it): Add to bag answers in 120 ms (a 0.97 press) and the bag's
  count hops on the snap curve; the bag and the size guide are
  `data-store-drawer` (rule 25a). A list longer than 48 is paged at its own
  addresses (`/products/page/N`), each cached on its own.
- Checkout: one page, at most 7 fields, phone first, pincode fills city and
  state, labels above fields. Shopper sign-in is EkCode only (§ EkCode; no SMS OTP);
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
- **Keyboard and screen readers, every theme** (search and sharing S2·7): "Skip to content" is the first Tab stop
  (the shop's language), the focus ring is 2 px in the shop's own ink (`[data-store-theme] :focus-visible`), and
  every control is ≥ 24 px — e2e 90-ux measures five shop pages at every width, so a theme that breaks one fails.
- **Search and sharing for a collection** is the product's panel (`SeoPanel folder="collections"`), closed by
  default; its address stays under the name, and a changed address says the old one will send shoppers here.
- **Barcode** is an optional column after SKU in the variant grid, digits only; it is never asked for.

## EkCode (owner-approved 2026-11-09; spec `docs/specs/2026-11-09-shopper-login.md`, mockup https://claude.ai/artifact/A33Xi8HVfsAyZqQ2pn7uKu)

- **A brand of its own.** Nothing a shopper sees names Frrata: ekcode.in pages, the notice, WhatsApp (sender
  "EkCode"), email, checkout lines. Merchants meet it as an app in the console.
- **The mark** is drawn, never typed: एक inside one rounded code box with a rani cursor under it, "Code" open beside
  it, Mukta 700 for both scripts. The box alone (filled ink below 48 px; ए alone at 16 px) is the icon. Devanagari
  appears only in the mark: **every word on every screen is English** until the owner plans other languages.
- **The shop's button** is "Continue with" + the mark, ink on light themes and paper on dark, 52 px, full width on a
  phone, never in the shop's colours, above the guest form with an "or" divider. Guest checkout always stays.
- **ekcode.in screens**: a real page (top-level, never a pop-up or iframe); the shop's name and initial top right;
  one field per screen; the number checks itself as typed (10 digits, 6–9); the code field is `one-time-code`, fills
  itself and submits on the sixth digit (no Verify button); "Open WhatsApp" on a phone; email offered only when
  needed; consent is its own tap, never pre-ticked; the shopper sees exactly what the shop gets and picks the
  address; "Not you?" is one tap everywhere; footer Privacy · Terms only.
- **Limits are allowances, never charges** (owner): an order-update meter on the Apps row (amber at 80%); past it,
  "More updates" offers wait until the 1st, move up a plan, or connect your own number.
- **EkCode's colours** are tokens in `src/app/base.css`, the same in both modes and on every shop theme: `--ek-ink`
  (#1C1917) and `--ek-paper` (#FAFAF9) — 17:1 —, `--ek-cursor` (rani, on paper) and `--ek-cursor-on-ink`, `--ek-sub`,
  `--ek-line` (decorative). The mark is `src/components/ekcode/mark.tsx`, drawn from `mark-paths.ts`.
- **Admin › EkCode** shows counts, costs and health, never a list of shoppers or an address; the one way in is "Find
  an account" by exact number with a reason, logged.

## Share cards (search and sharing S1, owner-approved mockup 2026-11-09)

What a link to a shop page shows in WhatsApp, Instagram DMs, Facebook, X, iMessage and Telegram. Drawn by
`src/lib/seo/render-card.tsx`; what each shows is `src/lib/seo/card.ts`.
- **1200×630 JPEG, ≤ 300 KB** (WhatsApp drops larger; JPEG is the only format every app documents). One per page
  version: an edit is a new address.
- **Product**: the photo fills the card; one dark band — shop name, "Pay on delivery" when COD is on, the price in
  large digits; a recent cut struck beside it as the buy box (`compareAt`; the tag's M.R.P. is not drawn); "Sold out"
  replaces the price. **Collection**: one large photo with the name and "From ₹… · N styles", three small. **Shop**
  (also lists and policies): the name on the theme's tint, its promises, three photos. No photo: name, shop, price.
- **Few words, no Devanagari drawn** (Satori cannot shape it; Hindi goes in og:title and og:description). Apple: avoid
  text-heavy images. og:image:alt describes the photo, not a caption.
