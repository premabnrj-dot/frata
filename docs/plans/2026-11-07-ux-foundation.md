# Plan — U · UX foundation
Status: active · Date: 2026-11-07 · Spec: `docs/specs/2026-11-07-ux-foundation.md` (approved 2026-11-07, calls 1–7 as recommended) · Mockup: https://claude.ai/artifact/QC3ujrncYJYjJMKhe6LvbC

**Order against 1D (owner call 3).** U·0 → U·1 → U·2 land before 1D·3 (primitives) and
1D·4b (queue), which another session is building. **The split, agreed by message on
2026-11-07:**
- This plan touches `globals.css`, `src/components/{shell,nav,layout,data}/`, both layouts,
  class-level fixes on existing pages, `scripts/check-{contrast,scale,hex}.mjs`, and `e2e/flows/90-ux.mjs`.
- 1D owns `src/domains/**`, actions, `order-predicates`, `drizzle/` and the new `src/components/ui`
  primitives.

**Regression net first (rule 5).** U·0 lands before any visible change. Every task ends green on
`npm test`, `npm run typecheck`, `npm run e2e` (all flows), and `impact-reviewer` on its diff.

| Task | What | Verify |
|---|---|---|
| U·S ✅ | **The bug from the stress test (S1).** `queueCounts()` and `listOrders({ tab, page })` share `inTabSql`; "Showing 1–100 of N"; page clamped. | `e2e/flows/20-orders-count.mjs` red without the fix, green with it; checkout green |
| U·0 | **The UX net.** `e2e/flows/90-ux.mjs` (details below). Today's failures are listed in the flow as `KNOWN`, matched exactly: a known failure that stops failing also fails the flow, so each fix must delete its line. | `npm run e2e -- --only ux` green with the KNOWN list = S3–S15 + F1–F7; a planted `overflow-x` on `/console` goes red |
| U·1a | **Tokens.** These live in `globals.css` only:<br>• `--input` → `#8C857F`;<br>• `--field-strong`;<br>• `--{ok,warn,danger,info}-mark`;<br>• `--brand-on-ink`;<br>• `--support`;<br>• focus as 2 px solid `--ring` with a 2 px offset in `@layer base`;<br>• dark values under `:root[data-theme="dark"]`, which nothing sets (written, gated, off). | `check:contrast` green; U·0 KNOWN loses F1, S10 |
| U·1b | **Gates.** Three scripts, each added to `npm test` and run against its own file first ("a gate must not match its own documentation"):<br>• `scripts/check-contrast.mjs`: parses `globals.css` for light and dark; text pairs ≥ 4.5; field, focus and marks ≥ 3.<br>• `scripts/check-scale.mjs`: fails `text-[Npx]` and the inline card frame outside `src/components/`, with an allowlist file for image sizes.<br>• `check-hex`: also fails `oklch(`/`rgb(`/`hsl(` outside `globals.css`. | Each gate fails a planted bad line, passes the tree |
| U·1c | **Type, targets, dimming.**<br>• Noto Sans Devanagari, Tamil, Bengali and Gurmukhi through `next/font` as fallback faces (no `preload`), with line height 1.8 via `:lang`/script runs.<br>• `font-variant-ligatures: none` on mono.<br>• `button`: `h-10 md:h-9`.<br>• `DataTableRow dimmed` uses `text-muted-foreground`, not opacity.<br>• Hit areas ≥ 24 px on the product editor's chip ×, quick-add and photo arrows. | U·0 KNOWN loses S4, S5, F7; `check:storefront-build` unchanged (console only) |
| U·2a | **Shell.** `src/components/shell/`:<br>• `AppShell({ surface })`, with nav items from one config per surface and groups by job;<br>• 224 px sidebar ≥ 768 px; bottom bar and More sheet < 768 px;<br>• active state (bar, weight, `aria-current`) and the count pill;<br>• account block on every width;<br>• skip link, `NavProgress` (after 150 ms) and one polite live region;<br>• `pageTitle()`.<br>Collections joins the nav. The Console count pill reads `queueCounts().to_confirm` in the layout's own `withTenant` call (no extra round trip). Admin's "needs attention" pill reads through `src/lib/admin/`. The support banner sits outside the scroll area, as one line on phones. `ConsoleNav` and `AdminNav` are deleted. | U·0 KNOWN loses F2–F4, F6, S9, S14, S15; `tenancy-auditor` on the count read; e2e all green |
| U·2b | **Page parts.**<br>• `PageHeader`: breadcrumb, badges, meta.<br>• `RecordHeader`: wraps; h1 text = the record's name.<br>• `Section`, `SearchField`, `Pager`.<br>• `DataTable` phone rows (`< md`), whose line 1 and line 2 are given by each table.<br>Pages move onto these:<br>• the 22 inline frames, 6 `text-[15px]`, 3 `text-[11px]`;<br>• Admin: natural sort, the empty-search state, plans numbers right-aligned with real buttons, and the merchant visits list stacking on phones;<br>• Home: "16 active products". | U·0 KNOWN empty; `check:scale` with no allowlist entries for pages; e2e all green; screenshots before/after at 390 and 1280 |
| U·3 | **Motion** for 1D·3's primitives:<br>• `@utility` classes in `globals.css` for enter and exit pairs (`animate-pop`, `animate-sheet`, `animate-toast`, `animate-tip`) built on `@starting-style` and `allow-discrete`;<br>• the reduced-motion words for the Undo countdown.<br>1D·3 uses these; nothing here builds the primitives. | Fixture page in U·0: reduced motion → computed durations 0; e2e green |
| U·4 | **Home "Today"** after 1D·4b, with its own short mockup round first: three tiles from `queueCounts`, plus last 7 days. | Its own mockup approved; e2e step: from Home, one tap reaches the first order to confirm |
| U·C | **Close.** `architecture-reviewer`, `tenancy-auditor`, and `impact-reviewer` on the branch. Skills: `frata-verify` ("run the ux flow for any UI change"), `frata-gotchas` (`check:hex` was blind to `oklch(`; `[hidden]` vs a `display` utility). Spec → built. | All gates, e2e, reviewer reports |

## U·0 in detail

The seed is a SQL fixture applied by the flow and removed after it, in a `finally`:
- the shop renamed to 46 characters;
- 300 orders across every state, with names that are long or in Devanagari, Tamil,
  Gurmukhi and Bengali, and totals of ₹1,23,45,678, ₹99,99,999 and ₹0;
- 60 products with 140-character and Hindi titles, some with no photo;
- 60 merchants;
- a live support session.

The fixture is the stress test's `seed-stress.sql`, committed as `e2e/fixtures/ux-stress.sql`.

The pages are `/console`, orders, products, a product (long title), settings, a settings section,
`/admin/merchants`, a merchant (with a visit), plans, and a support-mode console page. They are
opened at 320, 390 and 1280 px, and at 640 px to stand for 1280 at 200 %.

On each page the flow asserts:
- no page-level sideways scroll;
- exactly one `aria-current="page"` in the nav;
- a `<title>` that is not just "Frata";
- a skip link as the first focusable;
- the first 15 Tab stops each show an outline ≥ 2 px and are not covered by a sticky element;
- no visible control under 24 × 24;
- no text with contrast < 4.5 (computed from styles, opacity included);
- under `forced-colors: active`, no element whose only edge is a `box-shadow`;
- the WCAG text-spacing override makes no element overlap its sibling.

The flow also:
- keeps screenshots;
- records `/console/orders` first paint under CPU 4× and fast 4G as a number in its output, not an assertion (the baseline was 708 ms locally).

## Practices recorded in skills

- **UI/UX:** `frata-design-language` 3.2.0 § UX foundation (landed with the approval).
- **Testing:** `frata-verify` gains the ux flow (U·C).
- **Architecture:** a count comes from its own query over all rows, and a list and its count share one predicate. This is in `frata-design-language` rule 17; U·C also adds it to `frata-architecture` § predicates.
- **Performance:** no animation library, and only opacity and transform are animated (rule 22).

## Repetitive work → agents and scripts

| Done by hand | Becomes |
|---|---|
| Token contrast computed in a shell one-liner | `scripts/check-contrast.mjs` (U·1b) |
| Counting off-scale sizes and inline frames with grep | `scripts/check-scale.mjs` (U·1b) |
| The stress test (boot, seed, widths, zoom, measure) | `e2e/flows/90-ux.mjs` + `e2e/fixtures/ux-stress.sql` (U·0); `e2e-runner` reads its screenshots |
