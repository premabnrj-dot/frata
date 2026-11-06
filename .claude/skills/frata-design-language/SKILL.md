---
name: frata-design-language
description: Use when building or changing any Frata UI - a console page, table, filter, form, dialog, badge, empty or error state, the storefront, a theme - or when choosing a colour, font, spacing or motion, or how to show money, an order number, a date, a status or COD risk.
metadata:
  version: 1.1.0
  verified: 2026-11-06
  covers: ["src/app/globals.css", "src/components/**"]
---

# Frata design language

Two surfaces, two looks. **The console is neutral, dense and numeric. The
fashion lives in the storefront.** Patterns below are taken from Ekatan's admin
(its `ekatan3d-design-language`) and Shopify's admin, which merchants already know.

## Tokens (`src/app/globals.css` — the only file with a hex; `check:hex`)

- `--primary` (ink) is interaction: buttons, links, focus. `--brand` (oxblood)
  is the Frata mark only. Never wire the brand into a button.
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
· card `text-lg font-medium` · label `text-sm font-medium` · body `text-sm` ·
micro `text-xs text-muted-foreground`.

## Numbers, dates, people

- Every ₹, order number and count in a column: `<Money paise>` / `<Numeric>`
  (mono, tabular), right-aligned. A loss renders in `text-danger-text` with a
  real minus (−₹430).
- Dates only through `src/lib/format-date.ts` (`dayIN`, `dateTimeIN`,
  `sinceIN`) — always IST (`check:dates`).
- Phones `formatPhone` → "+91 98450 12345".

## Console patterns

- **Shell**: navigation grouped by job (`src/components/nav/console-nav.tsx`);
  a row is added when its page exists, never "coming soon". Phone: top bar;
  ≥ 768px: sidebar. Waiting counts as a warn pill.
- **Page header**: `PageHeader` — title and at most one primary action.
- **Lists**: `DataTable` shares chrome, not columns. Default view is a WORK
  QUEUE (to confirm, delivery failed), not history. Filters live in the URL,
  the server filters; 50 rows a page, numbered, never infinite scroll.
- **Order row**: number (mono link) · placed · payment badge · status badge ·
  value · expected profit if delivered · COD risk badge (Low/Medium/High in
  words, never a bare score).
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

## Words a merchant reads

Their words, not ours: order, delivery, return (not RTO in headings — "Returned
to you" with RTO in the detail), payout, customer, product, size. "Delivery
failed" for NDR in lists. Money is "profit", not "contribution". Never claim a
saving we cannot show from their own orders.

## Storefront

- Each merchant gets theme tokens (a small set: ink, paper, accent, display
  font, radius) applied under `data-store-theme`; never hard-coded per page.
- Editorial, type-led, large imagery, few colours. Indian shopper conventions
  built in: pincode delivery check, "Pay on delivery" badge, size chart and
  "find my size", the return window in words, WhatsApp order updates.
- Phone first, touch targets ≥ 44px, images through `next/image` at quality 75.
- Checkout: one page, phone + OTP first, address prefill. No merchant cost ever
  reaches this surface (ADR-0003).
