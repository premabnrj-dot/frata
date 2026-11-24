# frata-design-language — UX foundation: shell, layout, motion and the console-wide rules

Part of `frata-design-language` (SKILL.md holds the rules every screen obeys: Rule 0, Words, tokens, feedback).
These sections are the owner-approved rules of one surface; they are moved here unchanged (practices plan G4).

## Contents

- UX foundation: one Frata

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
9. Nav (Neel N1, § Layout · Sidebar): groups by job, their names an overline (`text-overline`, capitals). The
   current item is white with e1 and a line edge, its icon neel, and `aria-current="page"`, never colour alone
   (Frrata Admin's ink frame keeps its warn bar). Counts are a warn pill; on the rail a dot that keeps its words. The
   sidebar is 232 px from 1280 and a 64 px rail from 768 to 1279, either one by choice (`rail` cookie, `railFrom`,
   "[" or the button at its foot). On the rail each label is a tooltip on the bar (still the link's name; hoverable,
   Esc closes it) and the account's ways out (sign out, switch store) are icons. The store's name and address sit at the top.
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
    breadcrumb (two levels, a phone shows "‹ Products"), title 22/28 (20/26 on a phone) + its chip, one meta line of
    facts, then More, secondaries and the one primary last. A long title wraps to two lines, then ends in "…" with
    the full name on hover (supersedes "never cut", Neel N1). A title that is an input still shows the record's name
    as the h1's text.
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
    quick-add words are chips, not comma-separated text. Controls are `h-11` (44 px) under 768 px and `h-9` above in Neel (`h-10` outside it); a field is `FIELD` from
    `src/components/ui/field.ts`, its focus and mistake drawn once in neel.css; a button's
    height is its `size` variant (`default`, `lg`), never a className (twMerge
    keeps `md:h-9` against a caller's `h-11`). Rows and the
    bottom bar are 44–56 px on phones.
20. Icons: frrata's own set (`src/components/icons/icon.tsx`, rule 36), 18 px
    in nav (`size-4.5`; 22 px in the bottom bar), `--sub` until active. No coloured icon
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
    `html`), committed files (`next/font/local`, OFL; a shop's `--font-store-deva` is the generated `store-fonts.css`) with `preload: false` and
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
27b. A setup popup (Feedback rule 4) keeps what was typed when it closes (✕, Esc, Back, the backdrop) until it
    saves or the page reloads: the values live in the page's island, not the popup. Its first field takes focus
    (`data-autofocus`), and focus goes back to the button that opened it. Its script loads on first open
    (next/dynamic), and it reads its values then.
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
30. Before the store opens, Home is the setup card: the next step, then the four steps (O2a, mockup
    2026-11-23 § 2). The session that opens the store sees the open card until it hides it. Once it is open, Home is
    the day's work, as Neel § Screens · Home draws it: "Today" and the day, Store open (a link to `/console/setup`,
    where the store closes for now; always one tap away) and Share store; three counts in one card (To confirm, To
    pack, On hold; 30/36 figures, a chip each: "Oldest 8 d", "Nothing waiting", "N high risk"; each a link to its
    tab); "Next to confirm", the oldest five with Confirm and Undo (a high-risk, unknown-risk or refund-due order
    says Open: applies + confirmKey, decided on the server); the last 7 days as bars in `--chart` (today
    `--chart-now`), the count and ₹ in the header; and a line for setup steps still open. No
    suggestions or feature cards, no change-on-last-week figure, no chart
    library.
31. A Home count is `queueCounts`' and the nav pill's `toConfirmCount` reads the
    same predicate (the pill, the tabs and the tile agree); "N
    high risk" is `risk()` over the whole tab, never a page of it. A count that
    could not be read says "Couldn't count", a risk "Risk unavailable"; never
    0. A tile that is 0 stays in place and says so ("Nothing to confirm").
32. A card that is one link is `CardLink` (`src/components/layout/`); a list's picked rows act through `BulkBar`
    (`src/components/data/`, neel 50, small buttons, Clear last). The brand moment lives
    in `OpenMoment`, which wraps a page whose content changes when the shop
    opens; never in the component that opened it.


Their words, not ours: order, delivery, return (not RTO in headings — "Came back"
or "Coming back" with RTO in the detail; owner, 2026-11-08, Ship mockup), payout, customer, product, size.
"Couldn't deliver" for NDR in lists and tabs. Money is "profit", not "contribution". Never claim a
saving we cannot show from their own orders.
