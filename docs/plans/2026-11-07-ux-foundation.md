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
| U·0 ✅ | **The UX net** (runs as the last flow; its fixture is guarded, see § Review findings). `e2e/flows/90-ux.mjs` (details below). Today's failures are listed in the flow as `KNOWN`, matched exactly: a known failure that stops failing also fails the flow, so each fix must delete its line. | `npm run e2e -- --only ux` green with the KNOWN list = S3–S15 + F1–F7; a planted `overflow-x` on `/console` goes red |
| U·1a ✅ | **Tokens.** These live in `globals.css` only:<br>• `--input` → `#8C857F`;<br>• `--field-strong`;<br>• `--{ok,warn,danger,info}-mark`;<br>• `--brand-on-ink`;<br>• `--support`;<br>• focus as 2 px solid `--ring` with a 2 px offset in `@layer base`;<br>• dark values under `:root[data-theme="dark"]`, which nothing sets (written, gated, off). | `check:contrast` green; U·0 KNOWN loses F1, S10 |
| U·1b ✅ | **Gates.** Three scripts, each added to `npm test` and run against its own file first ("a gate must not match its own documentation"):<br>• `scripts/check-contrast.mjs`: parses `globals.css` for light and dark; text pairs ≥ 4.5; field, focus and marks ≥ 3.<br>• `scripts/check-scale.mjs`: fails `text-[Npx]` and the inline card frame outside `src/components/`, with an allowlist file for image sizes.<br>• `check-hex`: also fails `oklch(`/`rgb(`/`hsl(` outside `globals.css`. | Each gate fails a planted bad line, passes the tree |
| U·1c ✅ | **Type, targets, dimming.**<br>• Noto Sans Devanagari, Tamil, Bengali and Gurmukhi through `next/font` as fallback faces (no `preload`), with line height 1.8 via `:lang`/script runs.<br>• `font-variant-ligatures: none` on mono.<br>• `button`: `h-10 md:h-9`.<br>• `DataTableRow dimmed` uses `text-muted-foreground`, not opacity.<br>• Hit areas ≥ 24 px on the product editor's chip ×, quick-add and photo arrows. | U·0 KNOWN loses S4, S5, F7; `check:storefront-build` unchanged (console only) |
| U·2a ✅ | **Shell** (as built: see § U·2a as built). `src/components/shell/`:<br>• `AppShell({ surface })`, with nav items from one config per surface and groups by job;<br>• 224 px sidebar ≥ 768 px; bottom bar and More sheet < 768 px;<br>• active state (bar, weight, `aria-current`) and the count pill;<br>• account block on every width;<br>• skip link, `NavProgress` (after 150 ms) and one polite live region;<br>• `pageTitle()`.<br>Collections joins the nav. **Data stays out of the shell:** `AppShell` takes `count: number | null` and imports nothing from `@/lib/{queries,db,admin,auth}` (gate). The console layout calls `queueCounts(auth.membership.tenantId, now)` with the same `auth` the banner uses. The call is wrapped in React `cache()` per tenant, so the Orders page reuses it. On failure it shows no pill and logs only `err.name`. The Admin layout never calls `queueCounts`. Admin's pill is `needsAttention` (defined in § Review findings), read through `src/lib/admin/` only. The support banner calls `router.refresh()` at `expiresAt`. The support banner sits outside the scroll area, as one line on phones. `ConsoleNav` and `AdminNav` are deleted. | U·0 KNOWN loses F2–F4, F6, S9, S14, S15; `tenancy-auditor` on the count read; e2e all green |
| U·2b ✅ | **Page parts** (built 2026-11-07: the ux flow's KNOWN list is empty, from 157. As built, see § U·2b as built: `RecordHeader` is `PageHeader` with `back`/`titleSlot`; natural sort was dropped (A11)).<br>• `PageHeader`: breadcrumb, badges, meta.<br>• `RecordHeader`: wraps; h1 text = the record's name.<br>• `Section`, `SearchField`, `Pager`.<br>• `DataTable` phone rows (`< md`), whose line 1 and line 2 are given by each table.<br>Pages move onto these:<br>• the 22 inline frames, 6 `text-[15px]`, 3 `text-[11px]`;<br>• Admin: natural sort, the empty-search state, plans numbers right-aligned with real buttons, and the merchant visits list stacking on phones;<br>• Home: "16 active products". | U·0 KNOWN empty; `check:scale` with no allowlist entries for pages; e2e all green; screenshots before/after at 390 and 1280 |
| U·3 ✅ | **Motion.** 1D·3 built the mechanism in `globals.css` (`[data-pop]` 120/200 ms, `dialog[data-dialog]` 200 ms scale .97, `[data-toast]`, `animate-undo-window`; `@starting-style` + `allow-discrete`, opacity and transform only, the tokens). U·3 closed the gaps (built 2026-11-07):<br>• the three progress bars that animated `width` (Home checklist, photo upload, shop creation) now scale a full-width bar (`scaleX`, `origin-left`);<br>• a phone dialog (< 768 px) is a sheet from the bottom, 320 ms, and Back closes it natively (Android's Back is a close request, the same `cancel` as Esc). A history entry of our own was built and dropped: Next replaces the entry on a server action or refresh, and a `back()` racing a `router.push` discards the push. `Dialog` also answers `close`, for a close request let through without `cancel`;<br>• lists never animate: `NavProgress` sets `aria-busy` on `main#content` while a move is on its way (after 150 ms) and tables and `[data-list]` under it dim to .55;<br>• the brand moment in `open-shop.tsx`: "Your shop is open" with a check drawn once (`draw`, 320 ms circle, 200 ms tick), only in the session that opened it;<br>• `scripts/check-motion.mjs` in `npm test`: layout transitions, `transition-all`, arbitrary `duration-`/`ease-`/`animate-`, keyframes animating anything but opacity/transform, animations over 400 ms, with four named exceptions. | `check:motion` red on the old bars, green on the tree; ux flow step "motion (U·3)" (sheet at 390, `requestClose()` and a bare `close()` both sync, dim at 900 ms latency, the check once); `30-primitives` asserts the phone sheet |
| U·4 | **Home "Today"** after 1D·4b, with its own short mockup round first: three tiles from `queueCounts`, plus last 7 days. Spec `docs/specs/2026-11-07-ux-today.md`, mockup https://claude.ai/artifact/L5qYPvRitAarnX4DxJvdSd (2026-11-07, awaiting the owner's four calls; nothing built before sign-off). | Its own mockup approved; e2e step: from Home, one tap reaches the first order to confirm |
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
| A18 | Two live regions | U·2a exports `announce(text)` from the shell's single region (`@/components/shell/announce`). 1D·3's Toast does not call it yet; **1D·4b wires it**, now that U·2a is on main. |

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

**impact-reviewer on U·1 (2026-11-07):** taken before merge.
- Button height is a `size` variant (`default` is h-10 md:h-9, `lg` is h-11): twMerge had kept `md:h-9` against callers' `h-11`, which shrank sign-in, sign-up and the website's main button on desktop.
- The SaveBar is marked `data-surface="ink"`, and the support banner's ring and End now use `--support-foreground`. Its first ring was 1.00:1 and 2.69:1 (2.87:1 in dark); the contrast gate caught the dark case.
- `check:scale` reads each field element across lines. Its line pattern had found 0 of 17 bare `h-9` fields, all now `h-10 md:h-9`.
- Frames inside `src/components/**` (the primitives) are exempt; pages must use them.
- Gates compare their own URL with `pathToFileURL` and refuse a missing path.
- `check:hex` also catches `hwb(`, `color-mix(`, a hex inside an arbitrary `-[…]` class, and skips `{/*` comments.
- `scriptOf` skips combining accents, Vietnamese, ₹ and ™.
- Ligatures-off is scoped to the shell.
- The UX flow's focus check measures the ring's colour at ≥ 3:1, not just its width.
- Noto is served from committed files (`next/font/local`, OFL, `src/components/shell/noto/`), so builds fetch nothing for it.
- The sign-in pages (`/login`, `/start`, `/choose`) join `[data-shell]` for focus and Noto.
- Deferred, with reasons:
  - `--field-strong`: checkbox and switch edges use `--input`, which is already 3:1, so a second token would be the same value.
  - `--brand-on-ink`: the reversed mark is `--brand` on `--card`, a pair the gate holds.
  - The Admin "needs attention" pill (T3/A9) is dropped: computing it on every Admin page means reading every merchant's plan, owner and orders, and the merchants list already shows those facts. Signal to bring it back: more than about 50 merchants.

**U·2a as built (2026-11-07), after tenancy-auditor (SAFE) and impact-reviewer:**
- `AppShell({ ink, title, tag, places, groups, tabs, more, foot, email, tenantId, banner })` (`tag`: STAFF or PARTNER, replaced `staffTag` 2026-11-07) in `src/components/shell/`.
- The client islands are `nav.tsx` (SidebarNav, and BottomBar with a native modal `<dialog>` More sheet), `nav-progress.tsx`, `tenant-check.tsx` and `announce.ts`.
- The pill is `toConfirmCount` (cached per tenant, streamed in Suspense). The Admin pill is dropped.
- Sign out lives in `src/app/(admin)/admin/sign-out/actions.ts`. It ends a visit with audit detail `{ by: 'sign-out' }`, signs out this device only (`scope: 'local'`), and nothing in it can stop the sign-out.
- Titles come from layout templates; Home sets its own absolute title, because a template does not apply to the page beside its layout.
- `--shell-top` (the banner's height) places the sidebar and the SaveBar.

Findings taken:
- The progress bar no longer tests `defaultPrevented`, which Next's `<Link>` sets on every local click.
- The More sheet: `data-surface` moved off the sheet (its ring was 1:1), and the sheet is now a native modal dialog. Focus stays in, the page behind is inert, focus returns to More, and the page doesn't scroll behind it.
- The SaveBar sits under the banner.
- The expiry timer uses the server's time left and re-arms on refresh.
- Title lookups are cached.
- `button-h` skips comments and matches only inside class strings.
- The root title template is "%s · Frata".
- Scroll padding includes the safe area.
- An in-app move after a visit ended elsewhere now refreshes the shell. The audit's MEDIUM 1: `TenantCheck` asks the server after each move (now `GET /api/console/tenant`), for staff only. A template does not re-render on the server for a page-only move; this was found by the new e2e step.
- `check:tenant` resolves relative imports before matching. ~~It had read files as an array of lines, so its cost-sentinel rule never fired~~: **this claim was wrong**. The old `code()` already joined the comment-stripped lines into one string, and rule 6 worked; the re-review proved it by planting. My first change dropped comment-skipping (weakening rules 2 and 4) and was corrected the same day: resolution now runs on the comment-stripped code. Both are proven by planting.
- The shell may import only SHELL_ACTIONS from `src/app`.
- New e2e steps: the progress bar on a slow move, the More sheet's focus, sign-out ending a visit, an in-app move after an end elsewhere.

Deferred:
- A vitest for check:tenant rule 7: the gate walks `src` itself. It is proven by planting files in the session, and a path argument comes with U·C.
- Sign out and End now skip the leave guard (they are forms). Signal to revisit: a lost edit reported.
- The `collections/[handle]` tab title.

**Re-review of U·2a (2026-11-07):** taken.
- The check:tenant regression is fixed, with the claim corrected above.
- The storefront keeps its own tabs: `s/[host]/layout.tsx` sets a pass-through template, so the root template does not reach it.
- The More sheet's scroll lock is a CSS rule (`html:has(dialog[data-more][open])`), so no close path can leave `<html>` locked. Turning the phone past 768 px closes the sheet, and a tap on the sheet's own padding no longer closes it.
- TenantCheck reads `GET /api/console/tenant` (no-store), not a server action, and skips the first render.
- The banner's height and `--shell-top` are one value.
- The progress bar animates transform only.
- The expiry timer never re-arms faster than every 5 s.
- e2e covers the page scrolling again after the sheet closes, closing by scrim and by link, and no "· Frata" on the shop's bag or checkout tabs.

**Final check of U·2a (2026-11-07):** MERGE after one fix, which is taken. The progress bar animated `transform` while Tailwind's `scale-x-*` sets `scale`, so it crept to 64 % and then snapped; both now use `scale`. The shell rule also catches a dynamic `import()`. Shop pages with no title of their own (not-found, error) now read "Shop" instead of "Frata": accepted, since Frata stays off a shop's tabs.

**U·2b as built (2026-11-07):**
- `PageHeader` (with `back`, `badges`, `meta` and `titleSlot`), `BackLink`, `Section`, `SearchField`, `Pager`, and `DataTable`/`Td` with phone rows (`list` and `form`). These are in `src/components/{layout,data}`.
- Hand-written frames are converted, flush list cards included (`Section flush`; `Section as="nav"` for Settings' list). The gate's pattern no longer needs a padding class. The only frame left is the SEO `<details>` disclosure, which the gate skips by name. `check:scale.allow` is empty.
- Admin plans: one card per plan on phones; numbers right-aligned; "Edit" is a button.
- The merchant page uses `PageHeader`. Its Facts card is folded into the meta line, so no fact is shown twice. Visits stack on phones.
- The product title is a wrapping field, and the h1 names the product.
- Quick-add sizes are chips; underlined text buttons are 24 px.
- Home says "16 active products".
- The ux flow adds an overlap check under text spacing (A14) and a reduced-motion check (U·3). The nav-current check counts only the shell's navs, because view tabs are pages' own.
- e2e/ux-known.mjs is empty.

**impact-reviewer on U·2b (2026-11-07):** taken before merge.
- The merchant button has a `wrap` size; the header's actions may wrap. A long-name merchant page is in the ux flow.
- `button-h` reads each element's className value (quoted, or the whole `{…}` expression). It flags a height beside `button(…)` (`` `${button()} h-11` ``, `cn(button(), 'h-11')`), a height inside `button({ className })`, and a height on `<Button>`. *(An earlier version claimed this and did not do it; the re-review proved it by planting. Every form is now a test in `ux-gates.test.ts`.)*
- Header cells are `columnheader` and bodies `rowgroup` (`DataTableBody`); the variant grid has explicit roles.
- The plan's untrue claims are corrected above: natural sort, RecordHeader, and "every frame".
- The flush frames are converted, and the gate catches them.
- The title field: its script runs only without `field-sizing`, it re-fits on resize, and Enter passes while an input method is composing. The editor opens with `PageHeader` (`titleSlot`).
- The five editors (settings, address, online payments, collection, new product) open with `PageHeader` too.
- FOCUS measures a wrapper's ring against the wrapper's surroundings, and only when the wrapper holds focus.
- OVERLAP includes `main`'s own children; its limit is written in the code.
- The ux flow now measures every page U·2b converted, plus a step that taps "Open console" over a phone row's link.
- The row overlay lifts fields, selects, summaries and labels.
- Phone plan cards say "across N versions".

**Re-review of U·2b (2026-11-07):** taken. Both gate rules now test the element's own class value: card-frame's skips are per element, and every form of button-h is planted in vitest. The title field re-fits on every title change (Discard included) before paint, in browsers without `field-sizing`. The skill is at 3.3.2.

**Final check of U·2b (2026-11-07):** taken. HEIGHT now also catches `h-auto`, `h-full`, `h-fit` and `h-[…]`. The tag lookup ignores `<` in a handler. The template form (`` `${button()} h-11` ``) and `<Button disabled={n < 1} className="h-[44px]">` are planted in vitest, so the claim above is now true.
