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
| U·0 | **The UX net** (runs as the last flow; its fixture is guarded, see § Review findings). `e2e/flows/90-ux.mjs` (details below). Today's failures are listed in the flow as `KNOWN`, matched exactly: a known failure that stops failing also fails the flow, so each fix must delete its line. | `npm run e2e -- --only ux` green with the KNOWN list = S3–S15 + F1–F7; a planted `overflow-x` on `/console` goes red |
| U·1a | **Tokens.** These live in `globals.css` only:<br>• `--input` → `#8C857F`;<br>• `--field-strong`;<br>• `--{ok,warn,danger,info}-mark`;<br>• `--brand-on-ink`;<br>• `--support`;<br>• focus as 2 px solid `--ring` with a 2 px offset in `@layer base`;<br>• dark values under `:root[data-theme="dark"]`, which nothing sets (written, gated, off). | `check:contrast` green; U·0 KNOWN loses F1, S10 |
| U·1b | **Gates.** Three scripts, each added to `npm test` and run against its own file first ("a gate must not match its own documentation"):<br>• `scripts/check-contrast.mjs`: parses `globals.css` for light and dark; text pairs ≥ 4.5; field, focus and marks ≥ 3.<br>• `scripts/check-scale.mjs`: fails `text-[Npx]` and the inline card frame outside `src/components/`, with an allowlist file for image sizes.<br>• `check-hex`: also fails `oklch(`/`rgb(`/`hsl(` outside `globals.css`. | Each gate fails a planted bad line, passes the tree |
| U·1c | **Type, targets, dimming.**<br>• Noto Sans Devanagari, Tamil, Bengali and Gurmukhi through `next/font` as fallback faces (no `preload`), with line height 1.8 via `:lang`/script runs.<br>• `font-variant-ligatures: none` on mono.<br>• `button`: `h-10 md:h-9`.<br>• `DataTableRow dimmed` uses `text-muted-foreground`, not opacity.<br>• Hit areas ≥ 24 px on the product editor's chip ×, quick-add and photo arrows. | U·0 KNOWN loses S4, S5, F7; `check:storefront-build` unchanged (console only) |
| U·2a | **Shell.** `src/components/shell/`:<br>• `AppShell({ surface })`, with nav items from one config per surface and groups by job;<br>• 224 px sidebar ≥ 768 px; bottom bar and More sheet < 768 px;<br>• active state (bar, weight, `aria-current`) and the count pill;<br>• account block on every width;<br>• skip link, `NavProgress` (after 150 ms) and one polite live region;<br>• `pageTitle()`.<br>Collections joins the nav. **Data stays out of the shell:** `AppShell` takes `count: number | null` and imports nothing from `@/lib/{queries,db,admin,auth}` (gate). The console layout calls `queueCounts(auth.membership.tenantId, now)` with the same `auth` the banner uses. The call is wrapped in React `cache()` per tenant, so the Orders page reuses it. On failure it shows no pill and logs only `err.name`. The Admin layout never calls `queueCounts`. Admin's pill is `needsAttention` (defined in § Review findings), read through `src/lib/admin/` only. The support banner calls `router.refresh()` at `expiresAt`. The support banner sits outside the scroll area, as one line on phones. `ConsoleNav` and `AdminNav` are deleted. | U·0 KNOWN loses F2–F4, F6, S9, S14, S15; `tenancy-auditor` on the count read; e2e all green |
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

## Review findings (rule 3), folded in before execution

**tenancy-auditor (2026-11-07):** c287d16 is safe. Gates clean, and
`verify:tenancy` passed 27 of 27 on a throwaway Postgres. No path to a
cross-merchant leak. Each finding and its fix:

| # | Finding | Fix in this plan |
|---|---|---|
| T1 | "the layout's own `withTenant`" does not exist and invites raw SQL in a layout | U·2a: the layout calls `queueCounts()`. New `check:tenant` rule: `src/app/**` imports `@/lib/db/tenant` only from an allowlist (today `src/app/api/shop/orders/view/route.ts`). |
| T2 | A shell that fetches would run `withTenant` under Admin (ADR-0007) | `AppShell` takes `count` as a prop. New rule: `src/components/shell/**` imports nothing from `@/lib/{queries,db,admin,auth}`. |
| T3 | Admin "needs attention" was undefined | It is the merchants with no plan, an owner never signed in, over their included orders this month, or a trial ending within 7 days. These are exactly the facts `listMerchants` already shows. A pure `needsAttention(row, now)` goes in `src/domains/plans/` (or `admin/`), and `merchantsNeedingAttention(staff, now)` in `src/lib/admin/merchants.ts` uses the same row query. No new definer function and no orders read beyond the existing `app_admin_order_counts`. |
| T4 | A kept layout can show shop A's banner, name and count after a visit expires and the page falls back to shop B | `SupportBanner` calls `router.refresh()` at `expiresAt`. Ending a visit from Admin already navigates. U·0 adds a step: let a visit expire, then the pill and name are the staffer's own shop. |
| T5 | The fixture cannot prove the pill is scoped to one shop | U·0 seeds two other shops with different to-confirm counts and makes the staffer a Kesar member who starts a visit to merchant N. The pill must equal merchant N's count from the database, not Kesar's. After "End now", it must equal Kesar's. |
| T6 | `E2E_ADMIN_URL` is accepted for any host, and the run alters role passwords | `e2e/stack.mjs` refuses any host but `localhost` or `127.0.0.1`. `ux-stress.sql`'s first statement raises unless `current_database()` is the throwaway database. (A test-stack change; the 1D session is told.) |
| T7 (low) | The fixture leaves shops, users and staff behind | 90-ux runs last, and its `finally` restores the name and deletes what it added. |

**architecture-reviewer (2026-11-07, at 5489339):** changes needed; the spec's
direction holds. Every finding is taken:

| # | Finding | Fix in this plan |
|---|---|---|
| A1 (blocker) | `queueCounts` on every page is too heavy and not cached; the layout does not re-render on soft navigation | The pill gets its own count: `toConfirmCount(tenantId)` = `count(*) where inTabSql('to_confirm', now())` (`now` taken inside, so React `cache()` is keyed on the tenant id alone). It is streamed in `<Suspense>`, so the shell never waits for it. 1D's actions add `revalidatePath('/console', 'layout')` (asked by message). U·0 step: confirm an order, then the pill drops. `tenancy-auditor` runs on it. |
| A2 (blocker) | The committed stack cannot open Admin | U·0 adds a Frata staffer to `e2e/constants.mjs` (the fake auth reads it), a `platform_staff` row in 90-ux's own fixture (`seed.sql` unchanged), and `ADMIN_DATABASE_URL` plus the `frata_admin` password in `e2e/stack.mjs`. The 1D session is told; these are its 1D·T files. |
| A3 (blocker) | KNOWN keyed by finding id is unsound | One collecting step gathers every failure as `check · page · width` and diffs it against KNOWN, so a fixed line must be deleted. Size tolerances are ±1 px. The finding id is a comment only. U·2b's target is "only lines owned by U4 or 1D remain". |
| A4 | Noto through `html` breaks fonts everywhere, and `subsets` does not limit what downloads | `--font-shell` is set on the AppShell root only. The Noto loaders are imported only in `src/components/shell/fonts.ts`, with `preload: false` and `adjustFontFallback: false`. A pure `scriptOf()` in `src/domains/text/script.ts` and one `<Name>` component set `data-script` (for line height 1.8). U·0 network checks: a Latin page fetches no Noto file, a Devanagari name fetches only Devanagari, and the storefront fetches none. |
| A5 | `--text-card` collides with `--color-card` | Renamed `--text-section` (skill fixed). |
| A6 | The storefront inherits `html` fonts and the base outline rule | The new focus rule and fonts are scoped to `[data-shell]`, so the storefront is unchanged. The `check-hex` extension also covers `rgba(`. The two existing uses are `checkout.tsx:253` and `colours-panel.tsx:86`; they become tokens in U·1b (checkout is storefront: screenshot `/s` before and after). |
| A7 | A banner "outside the scroll area" makes `<main>` the scroller | The document keeps the scroll. The banner is `sticky top-0`. The bottom bar is `fixed` with safe-area insets. `scroll-padding-top` and `-bottom` keep focus visible. All chrome is `print:hidden`. (Skill rule 12 reworded.) |
| A8 | No sign-out exists | U·2a adds `signOutAction`: auth required, covered by `check:actions`. It ends a live support visit first (audited as ended by sign-out), clears `frata_tenant`, and signs out of Supabase. |
| A9 | Admin "needs attention" did not exist | Defined in T3 from facts `listMerchants` already reads. Counted by `merchantsNeedingAttention(staff, now)` in `src/lib/admin/`. |
| A10 | Two DOM copies for phone rows double the HTML and break flows | One DOM: the row is a CSS grid that reflows under `md`. Both navs stay, one `display:none` per width, and U·0 counts only the visible one. Pages inside More mark the More tab as current. |
| A11 | Gaps in the split | `SearchField` and `Pager` go in `src/components/data/` (this plan). The `button.tsx` class change (`h-10 md:h-9`, secondary edge `border-input`) is announced to 1D. **Natural sort is dropped**: in SQL it needs an ICU collation migration (1D's `drizzle/`), and real brand names are rarely numbered. The signal that brings it back is a merchant list sorted wrongly in real data. |
| A12 | NavProgress and the leave guard | One `navigate()` helper (`startTransition` + `router.push`) used by the leave guard. The bar starts on links not `defaultPrevented` and stops on a path or search change, or after 10 s. The More sheet closes on a link tap. |
| A13 | The skip link must come before the banner | The skip link is the first child of `body` in both layouts. |
| A14 | U·0 check details | Contrast uses 3:1 for large text, and disabled controls are exempt. Hit area is the padding box. Shadow-only edges are found in normal mode. Overlap excludes absolute, sr-only and truncated elements. Wait for `document.fonts.ready`. Reduced motion asserts ≤ 0.01 ms. **No axe-core**: the checks above are what we enforce, and a second engine would add dependency weight for overlapping rules. Reconsider if a screen-reader issue slips through. |
| A15 | Secondary buttons use `border-border`; hand-written `h-9` fields | Secondary uses `border-input`. Every hand-written field gets `h-10 md:h-9` (U·1c), and `check:scale` flags a bare `h-9` on `input` or `select`. |
| A16 | Gates | Each takes a path argument. Planted bad lines are vitest fixtures in `scripts/__tests__/`. `check:scale` is scoped to `(console)`, `(admin)` and `src/components/{shell,data,layout,nav}`. Contrast pairs are by naming convention, and a token with no pair fails. CLAUDE.md's gate list is updated. |
| A17 | A `pageTitle()` helper | Next's `title.template` instead: "%s · Kesar Studio" from the console layout's `generateMetadata`, "%s · Frata Admin" in Admin. Each page sets a plain `title`. |
| A18 | Two live regions | U·2a exports `announce(text)` from the shell's single region. 1D·3's Toast calls it. |

**impact-reviewer on U·0 (2026-11-07):** taken.
- Support pages are now measured at their own width; they had been labelled 1280 while measured at 390.
- Overflow falls back to the document's width and checks a scrolling `main`.
- Counted checks carry ceilings (`≤ N`).
- The cleanup is described honestly: the flow runs last, keeps its data, and the next run drops the database.
- The banner is selected by `data-support-banner`.
- Measuring contexts use reduced motion.
- Both guards were proven by planting: a non-local `E2E_ADMIN_URL` is refused, and the fixture is refused in another database.
- README and `e2e-runner` are updated.

**Steps that land with their task, not in U·0:**

| Step | Lands with |
|---|---|
| T5 pill = merchant N's count; T4 visit expiry; A1 confirm, then the pill drops (needs 1D·4b's UI) | U·2a |
| A4 Noto network checks | U·1c |
| A14 sibling-overlap check under text spacing | U·2b, with phone rows |
