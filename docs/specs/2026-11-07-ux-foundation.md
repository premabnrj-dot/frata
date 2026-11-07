# UX foundation (U): one shell, brand, colour and motion for Console and Admin
Status: draft (awaiting owner sign-off) · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/QC3ujrncYJYjJMKhe6LvbC · Approved: pending

Research: `docs/research/2026-11-07-ux-foundation.md` (current sources only,
each dated). The phases are U0–U4. Each is usable on its own and gets its own
mockup before code (rule 1). This spec covers all five, with the mockup
covering U1–U3 in full and U4 in outline.

## Goal

This is **enabling work**, and the spec says so plainly (rule 4). It moves
ranked problem **1 (COD/RTO losses)** and **3 (catalogue operations)** by
making the queue and catalogue quicker and safer to work through, above all on
a phone, which is where these merchants are (research 2026-11-06, "phone first
for orders"). It also serves the product promise "without a developer": a
screen that says where you are and what to do next.

Measures:
- Every Console and Admin page is reachable in **≤ 2 taps on a phone**. Today
  3 of 6 Console items are hidden in a sideways strip at 390 px.
- **0 contrast failures** in both themes (`check:contrast`) and **0 controls
  under 24 px** (U0 flow). Today the field edge is 1.72:1.
- A merchant clears 30 COD orders in **under 10 minutes on a phone**. This is
  1D's measure, now taken at 390 px as well as on a desktop.
- **No ad-hoc card frames or off-scale sizes** in app code (`check:scale`).
  Today there are 22 frames and 6 `text-[15px]`.

## Job

A merchant on a mid-range Android phone opens the Console between calls,
always knows where they are, reaches any page in two taps, can see every
field, and gets the same calm feedback after each action. A Frata staffer
moving between Admin and a merchant's console sees the same skeleton and can
never mistake one for the other.

## What the review found (code read and stress test, 2026-11-07)

| # | Severity | What | Measured |
|---|---|---|---|
| F1 | High | `--input` (every field, select and checkbox edge) fails WCAG 1.4.11. Its comment claims "≥ 3:1". | 1.72:1 on card |
| F2 | High | Console nav has no current-page state (no highlight, no `aria-current`); Admin's does | 0 of 6 items |
| F3 | High | Console phone nav is a sideways-scrolling strip with no affordance | 3 of 6 items off-screen at 390 px |
| F4 | Medium | Oxblood mark on Admin's ink is invisible; Admin hides "Your store" and email under 768 px | 1.71:1 |
| F5 | Medium | 22 inline card frames with 4 paddings; 6 `text-[15px]`, 3 `text-[11px]`; the merchant page hand-builds its own header | — |
| F6 | Medium | No skip link, no top progress bar (a rule since Phase 1, never built), no live region; 22 of 37 pages have no `<title>` | 15 of 37 titled |
| F7 | Low | Controls are 36 px tall on phones (passes WCAG 2.5.8's 24 px, below 44–48 px phone guidance) | 36 px |
| F8 | Low | No dark tokens; `lucide-react` installed and unused | 0 |

The live stress test added S1–S15 (§ Stress test), including **one bug that
hides orders to confirm once a shop passes 100 orders** (S1).

## Research (see the research file for every source and date)

- **Shopify admin** (2026-09-24): one frame, a collapsible side nav that holds
  search, notifications and the store picker, fewer nested containers.
  *Taken:* one `AppShell`, `Section` instead of cards inside cards, the
  account block in the nav.
- **Razorpay Blade** (2026-11-06): a neutral primary button separate from the
  brand. *Taken:* ink stays interaction, and oxblood stays the mark.
- **Linear** (2026-03-12): warm greys at low chroma, dimmed chrome, fewer and
  smaller monochrome icons. *Taken:* the stone ramp stays; icons at 16 px,
  `--sub` until active.
- **Atlassian** (2026-02-03): contrast fixed in tokens, borders and focus
  ≥ 3:1. *Taken:* F1 fix plus a gate.
- **Shiprocket** (2026-08-24): a dashboard built from the seller's questions,
  with one click to act. *Taken:* U4 "Today".
- **Platform**: `@starting-style` and `allow-discrete` are Baseline (MDN
  2026-04-20). `<ViewTransition>` is stable only in React 19.3 (2026-09-09),
  and Frata runs 19.2 with Next 15.5. *Taken:* CSS-only motion now, and page
  transitions wait for the upgrade.

## Design (see the mockup)

**U0 · Regression net, before any change (rule 5).** A committed e2e flow,
`e2e/flows/90-ux.mjs`. It seeds stress data (300 orders, 80-character,
Devanagari and Tamil names, ₹99,99,99,999, 60 products, a 45-character shop
name, 60 merchants), then opens every Console and Admin page at 320, 390 and
1280 px plus 1280 at 200 %. It asserts:
- no sideways scroll, except inside a table's own scroller;
- one `aria-current` in the nav;
- a `<title>`;
- a skip link;
- visible focus on the first 15 Tab stops, never hidden behind a sticky bar;
- no control under 24 × 24;
- no element whose only edge is a shadow (forced colours);
- the text-spacing override changes no layout into overlap.

It keeps screenshots. Today's known failures (F1–F7) are listed in the flow as
expected failures, and each phase deletes the ones it fixes.

**U1 · Tokens and type** (`src/app/globals.css`, nothing else coloured)
- `--input` → `#8C857F` (3.64:1). A new `--field-strong` for checkbox and
  switch edges. Card borders keep `--border` (they separate content, not
  controls).
- Status marks: `--ok-mark`, `--warn-mark`, `--danger-mark`, `--info-mark`. These
  are solid colours for the mark beside a word (risk, progress, later chart
  series) and are never text on their pale pair.
- `--brand-on-ink` and the **reversed mark** (paper tile, oxblood letter) for
  Admin and dark surfaces. `--support` names the banner's amber.
- **Dark tokens** written and gated, **not switched on** (call 2).
- Type: the scale enforced by `check:scale`. Section title is 15 px semibold
  (call 4). `font-variant-ligatures: none` on mono. Devanagari and Tamil names
  in Noto Sans via `next/font` with only the subsets needed, applied as a
  fallback face so it downloads only when a page shows such a name. Line
  height 1.8 for those runs.
- Controls are `h-10` under 768 px and `h-9` above (call 6). Nav rows are 44 px on
  phones, and bottom-bar items 56 px.

**U2 · One shell** (`src/components/shell/`)
- `AppShell({ surface: 'console' | 'admin' })` replaces `ConsoleNav`,
  `AdminNav` and the two layouts' frames. Both surfaces get the same parts:
  - a sidebar ≥ 768 px, 224 px wide, with groups by job;
  - the active item marked by a 3 px bar, semibold and `aria-current`;
  - counts as a warn pill (To confirm; Needs attention in Admin);
  - an account block on every width (email, sign out, the staffer's own store
    or Admin);
  - "Skip to content";
  - `NavProgress` (a 2 px ink bar, shown only after 150 ms);
  - one polite live region;
  - tab titles "Orders · Kesar Studio" and "Merchants · Frata Admin".
- Phone: a **bottom bar** with Home, Orders (count), Products and More. More
  opens a sheet with Collections, Settings, Activity, Open my shop, Frata Admin
  and the account (call 1). Admin's bottom bar is Merchants, Plans, Staff and
  More, in ink.
- Admin differs **only in chrome**: the ink frame, the reversed mark, STAFF,
  and a yellow active bar. Status and semantic colours are identical. Support
  mode's banner is unchanged and sits outside the scroll area.
- Shared page parts:
  - `PageHeader` gains `breadcrumb`, `badges` and `meta`;
  - `RecordHeader` for detail pages (Admin merchant, Console product, and
    later the order);
  - `Section` (title, optional action, `p-4 md:p-5`);
  - `SearchField` and `Pager`, which Orders needs in 1D and Admin already
    hand-builds.

**U3 · Motion and feedback** (the motion spec for the 1D·3 primitives)
- CSS only: `transition` with `@starting-style` and `allow-discrete`. No
  animation library. Only `opacity` and `transform` are animated.
- The timings that stay: 120 ms feedback and tips, 200 ms dialogs, menus,
  toasts and exits, 320 ms sheets and steps, nothing over 400 ms. Enter and
  exit are pairs, and nothing leaves slower than it came.
- Toast: rises 12 px with a fade; the 8 s Undo bar becomes the words "Undo for
  8 seconds" under reduced motion. Dialog: scale .97→1 with a fade on desktop,
  a sheet from the bottom on phones that Back closes.
- Lists never animate; they dim (`aria-busy`) after 150 ms. No page
  transitions. The one brand moment, "Your shop is open", is a check drawn
  once.

**U4 · Home becomes "Today"** (after 1D·4b; its own short mockup round)
- Once the shop is open, Home shows three tiles: To confirm (with "N high
  risk"), To pack (oldest), On hold. Each links to its queue tab, and a zero
  tile stays in place saying "Nothing to confirm". Below them, last 7 days:
  orders and value placed.
- Counts come from 1D's `queries/order-predicates.ts`, the same predicates the
  tabs use, never a second count. Before the shop opens, today's checklist
  stays as Home. Profit tiles arrive with Phase 3, read from `profit.ts`.

**Order against 1D (call 3):** U0 → U1 → U2 land before 1D·3 and 1D·4b; U3
is written into 1D·3; U4 follows 1D·4b.

## Design review

- **UI/UX.** The job is to know where you are and reach the work. The one
  primary action stays per page (`PageHeader`). Readers: merchants in Console,
  staff in Admin. Same skeleton, frames that cannot be confused.
  - States: the shell has none of its own. Every page keeps `Panel`. Phone:
    the bottom bar plus the More sheet.
  - Norman's checks:
    - signifiers: the active bar, labels always under the icons;
    - mapping: groups by job;
    - feedback: the progress bar after 150 ms and the live region;
    - recognition over recall: everything is visible, with no hamburger;
    - constraints: unchanged.
  - Keyboard: skip link, then the nav, then main. Built from
    `frata-design-language`, with the new rules added to it on approval.
- **Tenancy.** n/a. No table, query or action changes. The nav counts in U2
  and U4 read through `src/lib/queries/` with `withTenant` (1D's predicates).
  Admin's count reads through `src/lib/admin/` as today. `tenancy-auditor` runs
  on U2's count query and U4.
- **Modularity.** Tokens stay in `globals.css`. The shell goes in
  `src/components/shell/`, and primitives in `src/components/ui/`. No domain
  module changes. Pages lose markup and gain no logic.
- **SSOT / DRY.**
  - The To confirm count is computed once by the 1D predicate and read by the
    nav pill, the queue tab and the Home tile.
  - The page title is built by one helper from the page's own heading.
  - Colour values live only in `globals.css`.
  - Nothing new is stored.
- **YAGNI.**
  - Out: dark mode switched on (signal: merchants ask, or a phone-at-night
    usage pattern).
  - Out: a command palette (signal: more than about 12 destinations, or search
    asked for across records).
  - Out: page transitions (signal: the Next and React upgrade lands).
  - Out: chart palette (Phase 3), empty-state illustrations, collapsible
    sidebar, user-customisable nav, an AI assistant.
  - Out: a nav change behind a flag with a way back. There are no live
    merchants yet; once there are, a nav change ships with one.
- **KISS.** U1 changes tokens and two classes. U2 is one shell component with
  a `surface` prop, and the rest is moved markup. No new dependency:
  `lucide-react` is already installed (the icons are tree-shaken, 16 px for
  nav and 22 px for the bottom bar), and Noto Sans comes through `next/font`.
  No new table. No animation library, because CSS does everything listed.
- **Scalability.** n/a for data. The nav count is one indexed count per page
  load (1D's predicate on `orders(tenant_id, …)`) and must not add a round
  trip: it is read in the same `withTenant` as the layout's membership check,
  or cached for the request.
- **Performance and speed.**
  - Console stays under 1 s.
  - No client JavaScript is added to the storefront: the shell is console and
    admin only, and `check:storefront-build` is unchanged.
  - The shell is a server component except the bottom-bar sheet, the progress
    bar and the active-path hook (small client islands).
  - Noto Sans downloads only when a glyph needs it.
  - U0 measures `/console/orders` with 300 orders on slow 4G and 4× CPU,
    before and after.
- **Reliability.** n/a. No outbound call.
- **Security.**
  - No action or route is added.
  - The shell shows Admin links only when `requireStaff` says so, as today.
  - The account block shows the signed-in email only.
  - Support mode's banner and its non-dismissable rule are unchanged.
- **Unit economics.** n/a. No price, fee or vendor cost changes. Fonts are
  self-hosted by `next/font`.
- **Blast radius.** `globals.css` and both layouts touch **every** Console and
  Admin page.
  - The storefront reads `[data-store-theme]` tokens only and is checked by
    `check:storefront-build`.
  - Changing `--input` restyles every field; U0's screenshots compare before
    and after.
  - Footgun 1: Tailwind v4 reads `duration-*` from `--transition-duration-*`
    (frata-gotchas).
  - Footgun 2: a layout that redirects breaks the App Router, so the shell
    renders refusals as `Panel`s, as today.
  - Footgun 3: `check:hex` does not catch `oklch(`/`rgb(` outside
    `globals.css`. U1 extends it.
  - 1D is mid-flight. U0–U2 must merge before 1D·3 starts, or 1D·3 builds on
    the old tokens (call 3).

## Stress test

Run on the committed e2e stack (production build, throwaway Postgres) on
2026-11-07.

**Seed:**
- the shop renamed to 46 characters;
- 300 orders across every state, with names that are long or in Devanagari,
  Tamil, Gurmukhi and Bengali, and totals of ₹1,23,45,678, ₹99,99,999 and ₹0;
- 60 products with 140-character and Hindi titles, some with no photo;
- 60 merchants;
- a live support session.

**Run:**
- widths 320, 390, 768 and 1280, plus 640 px to emulate 1280 at 200 %;
- dark, forced colours and reduced motion;
- Tab ×15 on three pages;
- CPU 4× with fast 4G and slow 4G.

Screenshots are in the mockup.

| # | Severity | Screen · width | What | Measured | Goes to |
|---|---|---|---|---|---|
| S1 | **High (a bug)** | Orders · all | `listOrders(tenantId, limit = 100)` caps the list, and "to confirm" is counted from the capped list; no pager, no "of N" | **14 shown, 43 real**; 200 orders unreachable | Fix now (call 7); 1D·4b replaces |
| S2 | High | Orders · all | Rows are not links; the keyboard reaches nothing in `<main>` | 0 focusable, 100 rows | 1D·4b |
| S3 | High | Orders · 320–768 | Table scrolls sideways inside itself; Status and Total off-screen first | 286 of 797 px visible at 320 | U2 phone rows |
| S4 | High | Product editor · 390 | Chip ×, quick-add, photo arrows far under 24 px; arrows 1.94:1 when disabled | 8×20, 10×16, 20×16 px | U1 (24 px hit area) |
| S5 | Medium | Orders · all | `DataTableRow dimmed` uses opacity .6 → text below contrast | 2.59–2.73:1 on 51 runs | U1 (dim with `--muted-foreground`) |
| S6 | Medium | Products · 390 | Long title squeezes its column to ~60 px; row ~430 px tall | table 457 in 356 px | U2 phone rows |
| S7 | Medium | Product editor | Title input is the h1; cut mid-word; the h1's text is the label "Product title" | — | U2 `RecordHeader` |
| S8 | Medium | Admin merchant + support · 390 | Page scrolls sideways (visits grid has a fixed 150 px column); long-name button wraps | 397 in 390 | U2 |
| S9 | Medium | Support banner · 390 | Takes 16 % of the screen | 128 of 800 px | U2 one-line banner on phones, still not dismissable |
| S10 | Medium | Focus · all | Visible on 15/15 stops, but 1 px at 50 % ink | ≈ 3:1 | U1: 2 px solid, 2 px offset |
| S11 | Medium | Home · all | 300 orders, Home shows only a finished checklist; "16 products" vs "All 47" | — | U4; label "16 active" |
| S12 | Low | Admin merchants | 20 px name links; "Open console" wraps at 1280; text sort (Brand 12 before Brand 2); a no-match search offers "Add the first merchant" | 35–39 targets < 24 px | U2 |
| S13 | Low | Admin plans | Money and counts left-aligned; 15 px "Edit" links | 56×15 | U2 |
| S14 | Low | Titles | Most pages "Frata"; every product "Product · Frata" | 7 of 10 | U2 |
| S15 | Low | Dark, forced colours | Dark changes nothing; forced colours readable, but badges lose fills and the nav has no current-page cue | 0 rules | U1, U2 |

**Passed:**
- No page-level sideways scroll except S8.
- Reduced motion is honoured.
- Lakh and crore grouping is correct.
- All five Indic scripts render.

**Speed:** `/console/orders` (100 rows, 390 px, CPU 4×) gave first paint at
708 ms on fast 4G and 1.76 s on slow 4G, with 118 kB JS, 180 kB of HTML
decoded and 1,160 DOM nodes. The server and database were local, so U0 keeps
this as the baseline and production will be slower. 1D's 50-row pages cut the
HTML.

**Taken into U1/U2 from this:**
- Dim with colour, not opacity.
- Every target has a 24 px hit area (padding, not a bigger icon), and the U0
  flow asserts it.
- Focus is 2 px solid ink with a 2 px offset (Blade moved to a 4 px ring,
  2026-11-06).
- `DataTable` gains a phone layout under 768 px:
  - line 1 holds the link and the right-aligned figure;
  - line 2 holds who, where and the badges;
  - the whole row is one 56 px target.
- A compact support banner on phones.
- `RecordHeader` wraps a long title to two lines.
- A natural sort and a correct no-match state in Admin.
- Numbers right-aligned everywhere, including Admin plans.

**Proposed for 1D·4b (its plan is not changed until you approve):**
- counts from predicates, never from a capped list;
- 50 rows a page with `Pager` and "1–50 of 300";
- rows as links;
- the phone row layout.

## Owner calls (recommendation first)

1. Phone navigation: **bottom bar, Home · Orders · Products · More**, or keep
   the strip, or a menu button.
2. Dark mode: **design and gate the tokens, not on**, or ship it in U1, or
   never.
3. Order: **U0–U2 before 1D·3 and 1D·4b**, or after 1D.
4. Section title: **one size, 15 px semibold, both surfaces**, or the
   skill's 18 px medium everywhere.
5. Home "Today" once the shop is open: **yes, as U4 after the queue**, or keep
   the checklist.
6. Phone controls: **40 px under 768 px, 36 px above**, or 44 px, or keep 36 px.
7. The orders-count bug (S1): **fix now as its own one-file commit** (a count
   query of its own plus "Showing the newest 100 of N"), or leave it for 1D·4b.

## Practices to record in skills on approval (rule 6)

- `frata-design-language`: field edge 3:1; status marks; reversed mark on ink;
  one shell, chrome-only difference; bottom bar; Section title size; phone
  control height; motion pairs (enter = exit), opacity and transform only, CSS
  only, no page transitions until upgraded; live region; Noto fallback.
- `frata-verify`: run the U0 flow for any UI change; read its screenshots.
- `frata-gotchas`: `check:hex` blind to `oklch(`; `[hidden]` versus
  `display` utilities in mockups.

## Repetitive work → agents and scripts

| Done by hand | Becomes |
|---|---|
| Computing contrast of token pairs (this review) | `scripts/check-contrast.mjs` in `npm test`: parses `globals.css`, text pairs ≥ 4.5, field, focus and marks ≥ 3, light and dark; run against its own file first |
| Spotting off-scale sizes and inline card frames | `scripts/check-scale.mjs`: `text-[Npx]`, `p-[…]` and the inline frame string outside `src/components/` |
| The stress test (boot, seed, 4 widths, zoom, measure) | `e2e/flows/90-ux.mjs` (U0); the `e2e-runner` agent reads its screenshots |
| Comparing screens against the design language | No new agent. `architecture-reviewer` already covers UI/UX, and `impact-reviewer` covers callers. Reconsider if a third reviewer pass repeats the same checks |

## Out of scope

The storefront and its theme tokens, which share nothing with Console and
Admin. Phase 2's inbox and notifications (research noted). Charts. AI assist.
Each item is listed with its signal under YAGNI.

## Facts used

All sources and dates are in `docs/research/2026-11-07-ux-foundation.md`. No
Meta, Google, Razorpay or Shiprocket terms are relied on; the Razorpay Blade
and Shiprocket blog posts are design references only.
