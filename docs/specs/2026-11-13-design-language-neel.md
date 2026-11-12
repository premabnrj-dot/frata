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

## The owner's calls (asked, not decided)
1. Rename the shop role "Admin" to **Manager** (it collides with Frrata Admin and the staff role). Recommended.
2. **"Shop" everywhere**, partner screens too ("client shops"), instead of "store" there. Recommended.
3. Order "Shipped" becomes **On the way** in badges and emails, as the tab already says. Recommended.
4. Words: aim for 12 words a sentence; the `check:words` gate fails at 16 (warns from 13).
5. Brand rule 35 (Bricolage Grotesque for console h1s) retires: Inter everywhere in the console. Recommended.

## Rules Neel retires on approval (frata-design-language, marked "superseded" until N0 lands)
Ink as the action colour; neel as brand-only; "radius 6px"; mono for money, counts, order numbers and addresses (rules
35, 67, 72); the 24 bold / 15 semibold type scale; the rani thread under buttons and links (rule 37); "one card per job";
radio cards for 2–4 choices (segmented instead); payment as a badge (a tag); long dates; voice rule 1's 15 words; the
icon rule 36 (two strokes, rani tinge) for console nav. The brand's `--neel` (#23307A) becomes neel 900, one blue-violet.

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
