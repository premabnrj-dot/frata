---
name: frata-design-language
description: Use when building or changing any Frata UI - a console page, table, filter, form, dialog, badge, empty or error state, the storefront, a theme - or when choosing a colour, font, spacing or motion, or how to show money, an order number, a date, a status or COD risk.
metadata:
  version: 3.1.0
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
- **One primary action per record state** (order: Confirm → Print packing
  slip → none); everything else under "More". Destructive items in red, at
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
   closes, focus stays on the button; 44 px tap target.
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
   2.1.4), kept per person.
7. **Bulk actions skip what needs a person** and say so: "Confirmed 12.
   Skipped 2 high-risk orders — open them to decide." No bulk for destructive
   actions that need a reason.
8. **Views as tabs with counts**, derived from the record's state, one search
   box; every tab has its own empty state that says what lands there.
9. **Documents are print pages** (A4, browser print), not PDFs; the number on
   them is issued once and reprints show the same one.
10. **Shoppers never see internal words:** a state shown to a shopper goes
    through its shopper mapping ("Confirming your order"), never the raw value.



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
