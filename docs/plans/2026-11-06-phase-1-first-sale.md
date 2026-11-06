# Plan — Phase 1: First sale (1W, 1A, 1S, 1B, 1C, 1D)
Status: draft, in review · Spec: docs/specs/2026-11-06-phase-1-first-sale.md (active, approved 2026-11-06)
Prototype: https://claude.ai/artifact/QJ3N5knGqGZniMCsZJn7Fu

Built in six sub-phases, in this order; each ends green (`npm test`,
`npm run typecheck`, `npm run build`, `npm run verify:tenancy` when `drizzle/`
changed), deployed, and checked in the live logs before the next starts.

## Shape

- **Merchant data** is tenant rows behind RLS, read through `src/lib/queries/`
  inside `withTenant`, written by console actions through `asMember`.
- **The storefront** finds its tenant from the host (`app_tenant_for_host`),
  then reads as `frata_app` inside `withTenant(tenantId)` — never a tenant id
  from the URL. Reads are cached per tenant with tags (`shop:<tenantId>`,
  `product:<id>`); a console save revalidates only its tags.
- **Settings is one row per tenant**: the storefront, policy pages, checkout and
  invoices read it. Nothing copies a setting.
- **Pure engines** in `src/domains/`: `catalogue/variants.ts` (options →
  variants, limits), `catalogue/csv.ts` (parse, header map, dry run),
  `settings/schema.ts` (Zod per page, GSTIN, mobile, pincode), `policies/render.ts`
  (template + settings → text, missing tokens), `checkout/quote.ts` (bag →
  lines, shipping, COD fee, COD eligibility with the reason), `orders/risk.ts`
  (level, reasons, next step), `invoices/number.ts` (financial year, series),
  `signup/slug.ts` (name → address, reserved words).

## Tables (one migration per sub-phase; each with grant, RLS, policy, a tenancy.sql case)

| Table | Key columns | Notes |
|---|---|---|
| `shop_settings` | tenant_id pk; store (name, legal_name, address, origin, order_prefix); contact (email, phone, whatsapp, instagram, grievance_name/role/email/phone); brand (accent, display_font, tagline, logo_url); policy (return_days, return_kind); pay (cod_on, cod_min, cod_max, cod_fee paise); ship (flat paise, free_above paise, dispatch_days, metro_days, rest_days); tax (prices_incl_gst, gstin, default_hsn, invoice_series); pickup_pincode; version int; updated_at | One row, created with the shop. `version` for the two-tabs check. CHECKs on GSTIN shape, money ≥ 0. |
| `shop_policies` | tenant_id, kind, body, updated_at; pk (tenant_id, kind) | Only when a merchant edits a page; absent = rendered from settings. |
| `product_types` | id, tenant_id, name, size_chart jsonb ({unit, columns, rows}), unique (tenant_id, name) | Size chart owned by the type. |
| `products` | id, tenant_id, handle, title, description, type_id, options text[] (≤ 3), model_height, model_size, origin, hsn, published_at, archived_at, version, unique (tenant_id, handle) | Hidden while `published_at` is null; state from timestamps. |
| `variants` | id, tenant_id, product_id, option_values text[], sku, price, compare_at, cost (server-only), stock int ≥ 0, weight_g, archived_at; unique (tenant_id, sku) where sku not null; unique (product_id, option_values) | Archived, never deleted, once ordered. |
| `product_images` | id, tenant_id, product_id, position, url, width, height, option_value?, alt, failed_at? | Sizes 400/800/1600 made before upload. |
| `orders` (extend) | + public_token (128-bit, unique), customer_name, phone, address_line, landmark, city, state, pincode, items_total, shipping, cod_fee, total, razorpay_order_id, razorpay_payment_id, paid_at, expires_at (unpaid prepaid), cancel_reason, tags text[], invoice_number, invoiced_at, idempotency_key unique (tenant_id, key) | Existing net_revenue/cogs stay for the profit engine (Phase 3), filled at placement. |
| `order_lines` | id, tenant_id, order_id, variant_id, title, variant_label, sku, unit_price, qty, cost | Snapshot at placement; the live price is never read again. |
| `order_notes` | id, tenant_id, order_id, author_user_id, author_email, body, at | The timeline = timestamps + notes + audit rows. |
| `invoice_counters` | tenant_id, fiscal_year, next int; pk (tenant_id, fiscal_year) | `update … returning` inside the invoice transaction. |
| `payment_keys` | tenant_id pk, key_id, secret_enc, webhook_secret_enc, webhook_key unique, mode test/live, connected_at | Secrets AES-256-GCM with `PAYMENT_KEYS_SECRET`; never selected into a page. |
| `import_jobs` | id, tenant_id, file_name, file_hash, rows jsonb, plan jsonb, update_existing, clear_blanks, offset, created_at, checked_at, started_at, finished_at, report jsonb; unique (tenant_id, file_hash) where finished_at not null | Rows stored once; chunks of 500. |
| `tenant_domains` (extend) | + primary bool, retired_at | Old address 301s to the primary for 30 days. |
| `pincodes` | pincode pk, city, district, state | Platform reference data (Department of Posts, OGD licence), `frata_app` select only. |

## Definer functions (owner postgres, `search_path = ''`, revoke from public/anon/authenticated)

- `app_create_shop(uid, name, slug, pickup_pincode) → tenant_id` — EXECUTE
  frata_app. Requires a confirmed email; slug shape + reserved list + unique;
  at most 3 shops a user; inserts tenant, owner member, primary domain,
  settings row (defaults), Launch v-current `tenant_plans` row, audit row; one
  transaction.
- `app_order_by_token(token) → one order's shopper view` — EXECUTE frata_app;
  the order page needs no session and no tenant guess.

## Sub-phases, tasks and their checks

### 1W — Website and sign-up
1. `src/app/(marketing)/page.tsx` on the console host: static homepage per the
   prototype (Now/Next marks, ₹ + GST, FAQ, WhatsApp link). No client script
   but the sign-up island. → `npm run build` shows the route static; Lighthouse
   mobile LCP < 2 s on the preview.
2. Sign-up and sign-in: email → `signInWithOtp`; the code path `verifyOtp({ type:
   'email' })`; the email template carries `{{ .Token }}` and the link (owner
   step). Typo check, resend after 30 s, per-IP/email limit (Supabase's own +
   a check in the action). → unit tests for the typo hint; Playwright run of
   the code path against a local Supabase-less stub is not possible, so a live
   preview run with a real inbox.
3. `src/domains/signup/slug.ts` + `app_create_shop` + the shop-name step and the
   pincode step (`pincodes` table, loaded by `scripts/data/load-pincodes.mjs`
   from the OGD CSV into a migration). → slug tests; tenancy.sql cases for
   app_create_shop (unconfirmed email refused, reserved slug refused, fourth
   shop refused, everything in one transaction).
4. Console Home checklist derived from data. → `npm test`.

### 1A — Catalogue and import
1. Migration: product_types, products, variants, product_images. → verify:tenancy.
2. `src/domains/catalogue/variants.ts`: generate, group, limits (3 options, 100
   variants), archive-not-delete. → unit tests.
3. Product list + editor (options, grid grouped by colour, set every price,
   size chart by type, model height/size, photos). Save checks `version`. →
   Playwright: 6 × 8 grid saves in one transaction; second editor sees conflict.
4. Photos: resized in the browser (400/800/1600 WebP) and uploaded straight to
   storage under `tenants/<tenantId>/` with a short-lived signed URL issued by
   a console action (owner call: storage — see "For the owner"). → bundle
   check; an upload of a 20 MB JPEG sends ≤ 3 MB.
5. Import: `src/domains/catalogue/csv.ts` (RFC 4180 parse, BOM, Shopify old/new
   headers, Woo later), dry run, per-product all-or-nothing, blank-never-clears,
   formula escaping in rows-to-fix. `import_jobs`; chunks run by a console
   action the page calls until done, and by `after()` so leaving the page does
   not stop it; image copy is an outbox kind with retries. → unit tests on the
   sample file from the prototype (3 errors, 3 new, 1 left alone); a 20,000-row
   fixture runs to completion; the same file twice is a no-op.

### 1S — Settings
1. Migration: shop_settings (+ backfill for existing tenants), shop_policies. →
   verify:tenancy.
2. `src/domains/settings/schema.ts`, `src/domains/policies/render.ts`. → unit
   tests (GSTIN normalise/checksum, missing tokens).
3. Nine pages with the save bar, leave guard, live preview component shared
   with the storefront's own components (the preview IS the storefront piece,
   not a drawing of it). → Playwright: edit → bar → save → preview; leave
   guard; two-tabs version conflict.
4. Razorpay connect: test keys server-side (`GET /v1/payments?count=1` with the
   keys, through fetchWithTimeout), encrypt, store; webhook URL with the shop's
   `webhook_key`. → unit test of encrypt/decrypt; a wrong key is refused before
   saving.
5. Shop address change: new primary domain row, old one `retired_at`; middleware
   301 for 30 days. → host tests.

### 1B — Storefront
1. Theme tokens from settings under `data-store-theme`; header, footer, home,
   collection, product page (size buttons, sold-out, guide sheet, model line,
   pincode answer), policy pages, Contact. Cached by tag. → build; CWV budgets
   on a throttled mid-Android profile; check:client-bundle (no cost field).
2. Bag in the browser (localStorage, ids and quantities only); live stock check
   on add. → Playwright shop path from the prototype.

### 1C — Checkout and payments
1. `src/domains/checkout/quote.ts`: lines, shipping, COD fee, COD eligibility
   with the reason (limit, min, pincode, off). The browser's total is never
   trusted. → unit tests incl. the price-changed case.
2. Place order action: idempotency key; release this variant's expired
   reservations first (no frequent cron needed); conditional stock decrement;
   order + lines + outbox in one transaction; prepaid gets `expires_at` = +15 min
   and a Razorpay order created with the merchant's keys. → tests: double tap,
   last unit race (two transactions), price change.
3. Payment: verify the checkout signature server-side against our order id;
   webhook at `/api/webhooks/razorpay/[key]`: tenant from the key, signature on
   the raw body with that shop's webhook secret, stored in webhook_events,
   processed by one conditional update shared with the browser path. → replayed
   webhook is a no-op; webhook-before-browser converges.
4. Order page at `/o/[token]` via `app_order_by_token`. → guessing a number opens
   nothing.
5. Rate limits on place-order per IP and per phone; repeat-COD flag derived. →
   test.

### 1D — Orders
1. Queue: tabs from derived state, search, j/k/c/o, bulk confirm skipping
   flagged, optimistic confirm with a 5 s undo that is a real reversal. →
   Playwright; two confirms → one wins.
2. Order page: one primary action per state, More menu, risk
   (`src/domains/orders/risk.ts`), call/WhatsApp, address edit until shipped
   (logged), tags, notes, cancel with reason + stock back. → unit + Playwright.
3. Packing slip and invoice/bill of supply (print CSS), number from
   `invoice_counters` in the same transaction; FY rollover. → unit tests at
   31 Mar 23:59 / 1 Apr 00:01 IST.

## Gates added

- `check:tenant`: every new tenant table listed with its policy; `payment_keys`
  read only from `src/lib/payments/keys.ts`; `variants.cost` never selected in
  `src/app/s/**`.
- `check:config`: `PAYMENT_KEYS_SECRET` (and the storage token) owned by `src/lib/env.ts`.
- `check:client-bundle` sentinels: cost, secret_enc, webhook_secret.

## For the owner (needed before the step named)

1. **Auth email sender (before 1W goes public).** Supabase's built-in mail
   server allows only a few emails an hour, fine for testing, not for sign-ups.
   Connect a custom SMTP sender in Supabase (sign-in emails only; merchant
   notification email still waits). Recommendation in review.
2. **Email template (1W).** Add `{{ .Token }}` to Supabase's Magic Link template
   (exact text given at the time).
3. **Photo storage (1A).** Recommendation in review: Vercel Blob (no service-role
   key, signed uploads from a server action) vs Supabase Storage with policies.
4. **`PAYMENT_KEYS_SECRET` (1S).** A 32-byte hex secret in Vercel, Production and
   Preview, set by you.
5. **Shop domain (1B).** The cheap domain, pointed at Vercel; then
   `NEXT_PUBLIC_SHOP_DOMAIN`.
6. **Vercel Pro + Supabase Pro (before a real order).**

## Review

To be filled from `architecture-reviewer`, `tenancy-auditor` and
`unit-economics-reviewer` before task 1W.1.
