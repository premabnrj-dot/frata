# Neel — the console's design language (v6)
Status: draft · Date: 2026-11-13 · Mockup: https://claude.ai/artifact/9WNgk65rAmNQagjTT2xmrx · Approved: — (awaiting the owner)

## Goal
The owner (2026-11-13): "rework colour palettes, typography, the design system altogether", and the words: "tone, clear
messaging that users understand… a good rulebook… fix existing ones". Ranked problems 3 and 5: a console a brand owner
reads at a glance on a phone, and that looks like a product they'd pay for. Measure: time to first live product,
support asks per 100 shops, the owner's own read of each screen against this mockup (parity review).

## What is wrong today (audit of the console, 2026-11-13; screenshots in e2e/.out/90-ux-*)
1. Monotone: stone and ink everywhere. The primary button is near-black, chart bars are black, status pills are pale.
   Nothing says "press here" or "this needs you".
2. Monospace overload: money, order numbers, counts, domains and emails in JetBrains Mono. It reads like a terminal.
3. Pink underlines (the thread) on many links in running content: noisy, and they compete with the brand mark.
4. Flat type: a 24 bold title, 15 semibold cards, 14 body. No step between "this page" and "this field".
5. Every block is the same white card on a beige page: no hierarchy. Forms are radio lists and underlined text buttons.
6. Tables: 56 px rows, oversized checkboxes, long dates ("12 Nov 2026, 10:06 pm").
7. Words: long sentences joined by colons and semicolons, two ideas a line, our words leaking in (variant, readiness).
8. The products editor shipped with its old cards against an approved mockup (BUILT AS DRAWN now guards this).

## Research (brief in the session, 2026-11-13; sources dated)
- Shopify admin's new look (rolling out from 2026-09-15; Polaris 2.0 RC 2026-09-24): a white page, sections not
  cards, Inter 400/500/600 at 13/20 (15/22 on phones), pale status tints, a sticky status/publishing panel in the
  product editor (2026-10-28). Taken: the white page, the weights, the tints, the editor layout.
- Linear UI refresh (2026-03-12): dimmer navigation, warmer grey, fewer separators. Taken: recessive sidebar, warm grey.
- Vercel Geist (undated, read 2026-11-12): colour steps with jobs, tabular numbers, radius pair. Taken: steps with jobs.
- Razorpay Blade 12.131 (2026-11-06): ₹ and paise quieter, row densities 36/48/60. Taken: Money, 48 px rows.
- Baymard checkout guide (updated 2026-11-02): labels above fields, validate when a field is finished, the error
  beside the field. Taken as is.

## The language (drawn in full in the mockup)
- **Colour.** One warm grey with jobs (0–100 backgrounds, 200–500 lines, 600–950 text). One action colour, **neel**
  (indigo, 600 #3A44C2): buttons, links, focus, selection, charts; nothing else is blue-violet. **Rani** (#D61F69) is
  the brand mark and the loading line only. States are pale tints with a dot and a word (ok, warn, bad, info, neutral);
  facts that aren't states (COD, Prepaid) are outlined tags. Dark mode defined token for token.
- **Type.** Inter 400/500/600 only. Display 30/36, title 22/28, heading 16/24, subhead 14/20, body 14/20 (15/22 on a
  phone), label 13/18, small 12/16. Numbers in tabular figures, never monospace; mono only for codes people copy (SKU,
  AWB, GSTIN). Devanagari falls back to Noto Sans Devanagari.
- **Space, radius, depth.** 4-based spacing (4–48). Radius 6 chip/cell · 8 control · 12 section · 16 dialog. Lines
  for everything on the page; shadows only for what floats (menu, dialog, save bar, toast).
- **Layout.** White page, a recessive warm sidebar, sections with one 1 px line, finished settings as one line with
  Edit, a sticky side panel in editors, the save bar floating at the foot.
- **Components.** Button (primary neel, secondary white, ghost, destructive, link), field (label above, error under,
  input kept), segmented, switch, checkbox (24 px target), tabs with counts, status chip, tag, money, table (48 px rows,
  selected rows in neel 50, bulk bar in neel), menu, toast, save bar, folded row, empty state.
- **Words.** The rulebook in the mockup § Words (11 rules, a swap list, ten live sentences rewritten). It replaces the
  Voice section's style rules and keeps Rule 0.

## Stress test (2026-11-13; four audits of the code and the mockup) and what v2 of the mockup adds
- **Components** (mockup § More components): search picker (four hand-built today), select, date and time, unit inputs
  (₹, %, kg, +91), PIN code with its city, quantity stepper, code input, upload in four states, progress, dialogs
  (confirm, type-the-count, form) and the phone sheet, copy field, steps, facts list, stat tile, activity feed, banners
  (incl. the support visit), empty (first use and filtered), locked, loading. Today: ~25 local field styles, two error
  edge colours, two checkbox sizes, 14 raw tables, ~73 one-off empty panels; N0 replaces them with these.
- **States and feedback** (§ States): one control-state set (default, hover, focus, busy, off, read-only, mistake) and one
  place per problem (field, summary toast, error toast, conflict with Reload, dialog line, banner, page panel). "Something
  went wrong" (7 places) and bare red sentences (11) are banned by a gate. Undo vs dialog listed; instant switches roll back.
- **Motion and charts** (§ Motion): the existing motion tokens carry over; a table of what moves, when and for how long;
  no count-ups, shimmer or press-shrink. Bars, lines, sparkline, share bars, funnel, each with its number in words.
- **Accessibility and widths** (§ Access): ratios computed (fixed: text 3 only for large type; destructive #C42F2F;
  switch off track grey 500; chart neel 400; four dark-mode pairs; focus rings on nav, fields, tabs); targets 24/44 px;
  breakpoints 768 / 1024 / 1280 and the phone patterns (Select mode, sheets, action bar above the nav, side panel as a strip).
- **Glossary** (§ Glossary): surfaces, roles, words, order states across console and shop, short forms (PIN code one spelling,
  M.R.P. dotted, COD only in console tags).

## The owner's calls (2026-11-13)
1. The shop role "Admin" is renamed **Manager**. Decided.
2. **"Store" everywhere, never "shop"**, console, partner workspace, Frrata Admin, emails, the storefront's own words
   ("Store open", "View in store", "your store"). "Shopper" stays for the buyer; "Shop" as a verb on the storefront
   ("Shop all") stays. Code names (`shop*`, tables, routes) keep their spelling (like `frata_app`). Decided.
3. "Shipped" becomes **On the way** in badges and emails. Decided.
4. Words: aim for 12 words; `check:words` warns from 13 and fails at 16. Decided.
5. Inter everywhere in the console; Bricolage Grotesque headings retire there. Decided.

## v3: data, finding things, modules (owner: "more visualizations, charts, analytical components, filters, instant search,
and what else we might need across all modules")
- **Analytics kit** (mockup § Analytics): one period picker per page with a comparison on by default; figures with a
  change coloured by meaning (RTO up is red), a sparkline and a "needs N more" state; trend with a keyboard tooltip and
  dated notes; split bars (COD/prepaid); the true-profit waterfall; ranked tables with share bars and sortable headers;
  an hour × day heat grid; a state tile map with a table beside it (no drawn map); a repeat-shopper cohort table; a usage
  meter (amber at 80%, says what happens at 100%); an order-value histogram. Every chart writes its number in words.
- **Finding things** (§ Finding): instant list search (150 ms, marked matches, numbers, names, any 4 phone digits, SKU, AWB,
  tags); a filter bar of readable chips ("Payment is COD ×"), "+ Filter" with values and counts, money and date ranges,
  "Clear all", the result count; saved views as team tabs; one ⌘K search for orders, products, shoppers, pages and actions
  (Frrata Admin: stores by name, GSTIN, phone); the phone's filter sheet with "Show 9 orders". All of it in the address.
- **Across modules** (§ Modules): an order's journey stepper (the shopper's own steps + the courier's last scan); the
  shopper card (history, risk with its reason, no cost for staff); a rules builder for collections, offers and delivery
  zones with a live match count; a setup checklist with a progress ring; the partner's store cards and share tile;
  Frrata Admin's stores table with sparklines and flags, and activity with before/after. A table maps every surface's
  screens to the kit.
- **Build order:** the kit's primitives land in N0 with the rest; Orders gets the filter bar, saved views and instant
  search in N1; ⌘K and the analytics kit in a new **N1b** (Analytics, True profit, Offers results, Admin infrastructure
  and stores); the partner and Admin pieces in N4. Search and filters run on the server, from the address, behind the
  same indexes the list already uses (speed-reviewer on each); saved views are a new table (tenant, name, query) with RLS.

## v4: brand, voice, layout (owner: "iconography, motifs, visual identity, brand guidelines, logo variations and usage,
voice and microcopy; sidebar, header, breadcrumbs, widths, grid, spacing, density, separation, sticky bars, side panels,
breakpoints")
- **Brand** (mockup § Brand), from the drawn mark (`src/components/brand/mark-paths.ts`): wordmark with the rani thread
  (brand surfaces), plain (working screens, documents), on ink; the rr monogram on ink, rani and paper tiles. Clear space
  = the "a"'s height; smallest wordmark 72 px (48 in a footer), monogram 16 px. Never: recolour, stretch, type the name,
  thread in another colour, over a busy photo, an unruled lockup. Brand palette tied to Neel: rani (mark, thread, loading
  line), haldi (drawings), neel 900 (brand surfaces) and 600 (action) as one ramp. Motifs: the thread, the running stitch
  (drop and add places only), the block print (the website's selvedge only).
- **Icons**: 24 grid, 1.75 px stroke, round, no fill, 16/18/20 px, one colour (text, or neel for the current page);
  a word beside each except Search, Close, More, Copy. This replaces brand rule 36's two-stroke rani tinge in the
  console. **Pictograms** stay drawings (48 grid, 2 px ink, one haldi shape, on their tile), for first-use empties, the
  website and the partner workspace; the 14 in `PICTOGRAMS`.
- **Voice and microcopy** (§ Voice): tone by moment (done, fixable, refused, money, risk, can't undo, empty, waiting,
  the one celebration), with an example and a "not"; patterns for titles, buttons, labels, placeholders, tips, toasts,
  notices, email subjects, WhatsApp; mechanics (sentence case, digits, ₹ grouping, lakh in sentences only, dates, phone,
  full stops, Indian English spelling, "you"/"we"/"your shopper").
- **Layout** (§ Layout): page anatomy; sidebar 232 expanded / 64 rail (768–1279 or by choice, "[" toggles, remembered;
  tooltips, counts become dots) / bottom bar under 768; header order (back or breadcrumb, title, status, meta line,
  More · secondaries · one primary last); breadcrumbs two levels, a phone shows "‹ Products"; widths (lists fluid to
  1440, editors 1120 with a 320 panel, settings 760, dialogs 440/560/720); 12 columns, gutters 24/16, page padding
  32/24/16; four page shapes; the spacing scale with each step's job; separation (soft lines inside, 24 between
  sections, 32 and a heading between groups, never a card in a card); density (cards 20/16 or 16/12; table rows 48 console,
  40 Admin, 56 with a photo; header 36 sticky; fields 36/44); sticky bars (filter bar and table header at top, one action
  bar at the foot, the editor panel at the side); right-side panels (context panel in editors; a 400 px quick look over
  lists with ↑↓ and Esc; a sheet on a phone; dialogs decide, panels look); breakpoints <768, 768–1023, 1024–1279,
  1280–1439, ≥1440 with what each does.

## Skills and agents, optimised (owner: "skills optimization, agent optimization")
- **frata-design-language** becomes a short core (~350 lines: Rule 0, Words, Tokens, Type, Layout, Components index,
  States and feedback, Motion, Accessibility, Glossary) with `references/`: `brand.md`, `voice.md`, `layout.md`,
  `components.md`, `data.md` (analytics, finding), `glossary.md`, one `screens/<area>.md` per approved screen family
  (products, orders, offers, settings, apps, partner, admin, storefront), and `themes-legacy.md` (ADR-0014, no new
  work). History ("As built", provenance in headings) deleted; one index table of approved mockups instead. The same
  split for frata-architecture (themes, money, auth, speed, build notes to references) and frata-integrations (one file
  per provider). Each SKILL.md under 400 lines (`check:skills` warns).
- **Agents** share one preamble (read CLAUDE.md and the area's skill; report worst first; file:line; a verdict line;
  under N words) and one output shape, so a phase's reviews can be read in one pass. Each names the gate it complements so
  it never re-checks what a script already does. New ones: mockup-parity-reviewer, words-reviewer,
  design-system-reviewer (with accessibility and brand use), release-agent. The review cycle that cost 17 "review fixes"
  commits runs plan reviews in parallel (architecture, tenancy, security, speed) and diff reviews in parallel (impact,
  design-system, words) before one commit.

## Also to prepare, so the language holds everywhere
- **A living reference:** `/console/fixtures/ui` (exists) becomes the Neel gallery: every component in every state, both
  themes, phone and desktop; the e2e `ux` flow screenshots it, so a drift shows in review.
- **Tokens as data:** one `tokens.json` generated from base.css for the places CSS can't reach (PDF invoices, emails,
  share cards, app icons), checked equal by a test.
- **Emails and documents** in Neel: the email layout (header wordmark, one button, footer), invoice and slip PDFs (plain
  wordmark, type scale, money), notices.
- **Message templates:** WhatsApp and email order updates under the voice guide (one per order state, both scripts).
- **Hindi readiness:** strings out of components into one place per surface before any translation; Noto Devanagari;
  the words rulebook keeps sentences translatable.
- **Data-viz beyond three series** (a muted categorical set derived from neel, warm grey and the status dots) for Admin.
- **Empty-state set:** one first-use empty state per module with its pictogram (orders, products, offers, collections,
  messages, analytics, partner stores), so none is improvised.

## Rules Neel retires on approval (frata-design-language, marked "superseded" until N0 lands)
Ink as the action colour; neel as brand-only; "radius 6px"; mono for money, counts, order numbers and addresses (rules
35, 67, 72); the 24 bold / 15 semibold type scale; the rani thread under buttons and links (rule 37); "one card per job";
radio cards for 2–4 choices (segmented instead); payment as a badge (a tag); long dates; voice rule 1's 15 words; the
icon rule 36 (two strokes, rani tinge) for the console (Neel's icon rule replaces it); brand rule 37's thread on console buttons, tabs and links (the thread stays in the mark, the loading line and the website). The brand's `--neel` (#23307A) becomes neel 900, one blue-violet.

## Tooling added with this spec (owner: "turn repeated tasks into agents")
- Agents: `mockup-parity-reviewer` (built as drawn), `words-reviewer` (the rulebook and glossary on every diff and
  mockup), `design-system-reviewer` (tokens, primitives, states, accessibility), `release-agent` (merge main, renumber,
  gates, affected flows, push, deploy watch; prints production migrations, never applies them).
- Scripts: `npm run release:check` (`scripts/merge-main.mjs --check` for migration collisions, `scripts/affected-flows.mjs`
  for the e2e flows a change touches); `scripts/prod-migrate.mjs` (prints a migration's production SQL and drizzle row).
- With N0: `check:words`, `check:skills` (a changed skill bumps its version; warns over 400 lines), `check:plans` (a plan
  with a mockup has a Deviations table), budget headroom report; frata-design-language split to ~350 lines with one
  reference file per screen area, history deleted, themes moved to a legacy reference (ADR-0014).

## Phases (each with its own plan and reviews; BUILT AS DRAWN with mockup-parity-reviewer)
- **N0 Tokens and primitives:** the new tokens in the console sheet only (the shop keeps its theme tokens), Inter weights,
  tabular numbers, Button/Field/Badge/Tabs/Table/Section/SaveBar/Toast rebuilt to the mockup; gates updated
  (check:hex, check:scale, check:contrast, check:motion).
- **N1 Shell and lists:** sidebar, page header, Home, Orders, Products list, Settings, as drawn.
- **N2 Editors and forms:** the product editor as drawn (the PR·2 redo), then order detail, offers, settings forms.
- **N3 Words:** a `check:words` gate (warns over 12 words, fails over 16, a colon or semicolon joining clauses in UI copy, the swap
  list), then every console string rewritten to the rulebook, screen by screen; Admin after.
- **N4 Admin and the partner workspace** in the same language.

## Design review
- **UI/UX:** every state drawn (empty, loading, error, one, many, phone); keyboard focus in neel, 2 px.
- **Accessibility:** text 2 on white 6.0:1; field edge 3.4:1; white on neel 600 6.9:1; chips' text ≥ 4.5:1 on their tint.
- **SSOT:** tokens in one file (`src/app/base.css` console layer); components are the only place a colour is chosen.
- **Blast radius:** the storefront shares base.css. Shop tokens stay unchanged (N0 scopes the new tokens to the console
  and Admin). The e2e visual baselines for console screens are retaken in N1. PDFs and share cards keep their own palette.
- **YAGNI:** no theme switcher for merchants, no density setting yet (48 px rows; signal: merchants with 500+ orders a day).

## Out of scope
The storefront and its themes (they have their own design language); PDFs; the brand book (rani, haldi, neel stay).
