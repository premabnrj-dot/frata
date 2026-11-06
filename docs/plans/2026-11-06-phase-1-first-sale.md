# Plan — Phase 1: First sale (1W, 1A, 1S, 1B, 1C, 1D)
Status: active (reviewed 2026-11-06; owner: "go ahead, fix the findings and start 1W") · Spec: docs/specs/2026-11-06-phase-1-first-sale.md
Prototype: https://claude.ai/artifact/QJ3N5knGqGZniMCsZJn7Fu

**Owner, 2026-11-06 (after 1W):** product import from a file is **deferred**
(it needs the per-minute sweep, i.e. Vercel Pro, which waits). Order from
here: **1S Settings → 1A catalogue without import → 1B → 1C → 1D**. Frata's
support WhatsApp is +91 95603 66601 (`src/lib/site.ts`). The sign-in email
sender and the code in the Magic Link template are set by the owner later;
until then the link works and the code entry waits.

Reviewed by `architecture-reviewer`, `tenancy-auditor` and
`unit-economics-reviewer` on 2026-11-06. Every finding is fixed below; the
review table at the end maps each to its fix.

Built in six sub-phases, in order; each ends green (`npm test`,
`npm run typecheck`, `npm run build`, `npm run verify:tenancy` when `drizzle/`
changed), deployed, and checked in the live logs before the next starts.

## Shape

- **Merchant data** is tenant rows behind RLS, read through `src/lib/queries/`
  inside `withTenant`, written by console actions through `asMember`.
- **The storefront's tenant comes from the Host header only**, read by the
  middleware alone, which rewrites a shop host to `/s/<host>/…` and answers
  `/s/…` with 404 on every other host (image paths included; amended
  2026-11-07, `docs/specs/2026-11-07-storefront.md` § Review findings). Pages
  resolve the tenant from `params.host` through one shape-checking helper and
  the cached `tenantForHost`; reading `headers()` in a layout would make every
  shop page uncacheable. Route handlers on a shop host (1C: stock, pincode)
  use `requireShop()`, which reads the Host header.
- **Storefront caching**: one helper, `shopCached(name, fn)` in
  `src/lib/queries/storefront.ts`; the tenant id is ALWAYS the cached function's
  first argument (so it is in the key) and in every tag. Tags are
  tenant-qualified and coarse: `shop:<t>`, `shop:<t>:catalogue`,
  `product:<t>:<id>`. `tenantForHost` is cached under `host:<host>`. Pages read
  no `headers()`/`cookies()`; live stock and the pincode answer are route
  handlers. Stock changes revalidate only when a variant reaches or leaves 0.
  Test: two tenants with the same handle get different results.
- **Settings is one row per tenant**, read by storefront, policies, checkout and
  invoices. Preview components take props only (no fetch, no cache inside).
- **Shop address** = `tenants.slug` + `NEXT_PUBLIC_SHOP_DOMAIN`, derived — the
  domain switch (owner call 1) is an env change. `tenant_domains` holds own
  domains (Phase 6) and, later, retired addresses. YAGNI: the address is
  editable freely until publish; after publish, Frata support changes it in
  Admin until the first merchant asks (then: tombstoned retired rows, a
  `permanentRedirect` from the cached lookup, never reassigned).
- **Pure engines** in `src/domains/`: `signup/slug.ts`, `catalogue/variants.ts`,
  `catalogue/csv.ts`, `settings/schema.ts`, `policies/render.ts`,
  `tax/gst.ts`, `checkout/quote.ts`, `orders/risk.ts`, `counters/fiscal-year.ts`,
  `media/sizes.ts` (one size ladder for browser and server).
- **Words**: what the shopper pays for Pay on delivery is `codCharge`
  (`cod_charge`); `codFee` stays the courier's cost to the merchant
  (`profit.ts`, `cost-sentinels.mjs`).

## Tables (one migration per sub-phase; grant, RLS, `app_current_tenant()` policy, tenancy.sql case; `frata_admin` gets NO grant on any of them unless listed)

Every child table has a composite FK `(tenant_id, parent_id) → parent(tenant_id, id)`
(FK checks ignore RLS — proven by the audit).

| Table | Key columns | Notes |
|---|---|---|
| `shop_settings` (1W) | tenant_id pk; store, contact + grievance, brand, policy, pay (cod_on, cod_min, cod_max, cod_charge, blocked_pincodes text[]), ship, tax, pickup_pincode, published_at, version, updated_at | Created by `app_create_shop`; backfilled for existing tenants. |
| `tenant_counters` (1W) | tenant_id, kind ('order','invoice'), period text, next; pk (tenant_id, kind, period) | Order numbers and invoice series: `update … returning` in the same transaction. |
| `pincodes` (1W) | pincode pk, city, district, state | Platform reference (Dept of Posts, OGD licence, attribution shown). `frata_app` select only; RLS with a read-all policy on the allowlist. Loaded by a script, not a migration. |
| `rate_limits` (1W) | key (sha256 of ip/email/phone + action), window_start, n | Platform; upsert returning the count. |
| `shop_policies` (1S) | tenant_id, kind, body, updated_at | Only when edited. |
| `product_types`, `products`, `variants`, `product_images` (1A) | as in the spec; `variants.unit_cost` nullable (unknown ≠ 0), never selected under `src/app/s/**` or `src/lib/queries/storefront.ts` | |
| `import_jobs`, `import_rows` (1A) | job: file_name, file_hash, update_existing, clear_blanks, lease_until, next_row, checked_at, started_at, finished_at, report; rows: job_id, n, handle, cells jsonb | Rows in their own table; chunks cut at Handle boundaries; ≤ 5,000 rows in v1. |
| `orders` (extend, 1C) | + public_token, customer fields, items_total, shipping_charge, cod_charge, total (CHECK = parts), razorpay_order_id, razorpay_payment_id, paid_at, expires_at, cancel_reason, tags, invoice_number, invoiced_at, idempotency_key | `cogs`, `forward_shipping` become nullable = unknown; freight is never filled from what the shopper paid. `net_revenue` = lines + shipping + COD charge, before GST. |
| `order_lines` (1C) | title, variant_label, sku, unit_price, qty, unit_cost (nullable), tax_bps, tax | Snapshot at placement. |
| `order_notes` (1D) | author, body, at | |
| `payment_keys` (1S) | tenant_id pk, key_id, secret_enc, webhook_secret_enc, webhook_key unique, mode | Read only in `src/lib/payments/keys.ts`. AES-256-GCM: version byte, random 96-bit IV, tag, AAD = tenant_id + column. `PAYMENT_KEYS_SECRET` **Production only** (previews share the database). Webhook secret generated by us, shown once. |

Existing-code fixes (1W migration): `app_tenant_for_host` recreated with
`search_path = ''` and re-granted; `frata_app` UPDATE on `tenants` limited to
the columns it edits (`name`); outbox unique `(tenant_id, dedupe_key)`;
`check:tenant` requires `app_current_tenant()` in every policy except an
allowlist (outbox, webhook_events, pincodes, plans, plan_versions, rate_limits).

## Definer functions (owner postgres, `search_path = ''`, revoke from public/anon/authenticated, one grant)

- `app_create_shop(uid, name, slug, pickup_pincode) → tenant_id` (1W, frata_app).
  `uid` only from `requireUser()` (`getUser()`). Confirmed email required.
  `pg_advisory_xact_lock(hashtext(uid))`, then **one shop per user** (Admin can
  add more). Tenant id generated inside; no `on conflict`; members, settings,
  Launch `tenant_plans` row and audit row use only the returned id. Slug: shape
  CHECK + unique index; reserved words live in TS (`signup/slug.ts`).
- `app_payment_webhook_for(key) → (tenant_id, webhook_secret_enc)` (1C, frata_app).
- `app_order_by_token(tenant_id, token) → shopper columns only` (1C, frata_app);
  `tenant_id` from `requireShop()`; no cost, tags, notes, risk or Razorpay ids;
  page dynamic, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`.

## Background work without a frequent cron

After each commit that enqueues, that tenant's due outbox rows are sent in
`after()`. The safety-net sweep `/api/cron/outbox` also processes stored
webhooks and releases expired reservations; it runs every minute once Vercel
Pro is on (owner call 7, moved earlier: **before 1A.5**). Senders run inside
`withTenant(row.tenant_id)`, never a tenant from the payload.

## Sub-phases

### 1W — Website and sign-up (built 2026-11-06)
1. Migration 0007: existing-code fixes above; `shop_settings`, `tenant_counters`,
   `pincodes`, `rate_limits`; `app_create_shop`. tenancy.sql: A/B on the new
   tables; pincodes write refused; counters A ≠ B; child FK to B refused;
   create_shop: unconfirmed refused, taken slug adds nothing, second shop
   refused. → `npm run verify:tenancy`.
2. Engines: `signup/slug.ts` (name → slug, reserved, shape), email typo hint. →
   unit tests.
3. `requireUser()`; sign-up and sign-in pages: email → `signInWithOtp`
   (`emailRedirectTo` from `CONSOLE_HOST`, not the Host header); the 6-digit
   code → `verifyOtp({ type: 'email' })`; resend after 60 s; per-IP and
   per-email limits via `rate_limits`. A link opened in another browser lands
   on the code entry, not silently on `/login`. → unit + build; live run with a
   real inbox once SMTP is set.
4. "Create your shop": name → slug (live availability via a route handler),
   pickup pincode (from `pincodes`), optional "what do you sell" (stored on
   settings, picks the starting size chart in 1A) → `app_create_shop` → console.
5. Homepage on the console host `/` for signed-out visitors (replacing the
   current `src/app/page.tsx`), static, per the prototype. → build shows it
   static; no client script but the sign-in island.
6. Console Home checklist derived from data (product exists, payments or COD,
   published). → test.

### 1A — Catalogue and import (catalogue built 2026-11-06; import deferred by the owner)
Products, variant engine, editor (version check), photos on **Vercel Blob**
(`handleUpload`: `onBeforeGenerateToken` runs `requireMember`, forces
`tenants/<tenantId>/products/<random>`, content types, size cap; the
`product_images` row is written by our action after checking the prefix;
`onUploadCompleted` unused; `next/image` loader picks the pre-made width,
ladder 400/800/1200/1600 WebP). Import: the CSV is parsed in the browser
(15 MB exceeds the server-action body), rows posted in chunks to
`import_rows`, dry run, then chunks run under a lease
(`lease_until`, `next_row` advanced `where next_row = $old`), each chunk via
`asMember` (stops when a support session ends), images through the outbox.
ADR-0005 amended for Blob.

### 1S — Settings (built 2026-11-06; Razorpay connect waits for PAYMENT_KEYS_SECRET and checkout, 1C)
Nine pages, one save each, version check; policies rendered from settings;
Razorpay connect (keys in a header to Razorpay, never a URL; logs record status
only; owner role only); publish gate (needs a product, and COD on or Razorpay
connected).

### 1B — Storefront
`shopCached` reads, theme tokens, product page, size guide, pincode route,
"Opening soon" until published, policy pages, DPDP notice line at checkout.

### 1C — Checkout and payments
`checkout/quote.ts` (shipping, `codCharge`, eligibility with reason, GST per
line from `tax/gst.ts` — apparel 5% ≤ ₹2,500 a piece, 18% above, to verify
and date in `frata-integrations`). Place order (`requireShop`): insert the
order on its idempotency key first, decrement stock only if inserted; variants
locked in id order; bag ids counted against variants found in this tenant;
`expectedTotal` → "Price updated" before payment; order number from
`tenant_counters`; rate limits per IP and phone (per tenant). Prepaid: Razorpay
Checkout timeout under 15 min (verify); reservations released by the sweep,
the add-to-bag check and checkout (`paid_at is null and cancelled_at is null
and expires_at < now()`); a late capture re-reserves or flags "Paid · out of
stock · refund". Webhook `/api/webhooks/razorpay/[key]`: tenant from
`app_payment_webhook_for`, signature on the raw body with that secret, event
stored with `tenant_id` and key `razorpay:<tenantId>:…`, processed in
`withTenant` matching tenant and `razorpay_order_id`, amount and mode checked;
the old env-secret route retired. Order states gain `awaiting_payment` and
`payment_abandoned` (now passed in), so abandoned prepaid orders never reach
To confirm or plan usage.

### 1D — Orders
Queue and order page as in the spec; notes; cancel with stock back; packing
slip and invoice/bill of supply from `tenant_counters` (FY rollover at IST).

## Money (unit-economics review)

- Frata fee base: order lines before GST, after discounts, **excluding shipping
  and the COD charge**.
- **No fee is billed in Phase 1**: nothing records delivery reliably until
  Shiprocket (Phase 2). From the first order, record the fee that would have
  been charged (derived, shown in Admin), never billed.
- Free live selling is time-boxed and said at publish: free until Frata billing
  starts (Phase 6), with a cap on free live shops support can handle (Admin
  sees the count).
- Cover photo budget holds on 3× screens: 1200 px rung, `sizes` capped.

## Gates added

`check:tenant` (policy shape, new tables, `payment_keys` only from
`src/lib/payments/keys.ts`, `unit_cost` never in storefront code);
`check:actions` (`requireShop`, `requireUser`; every action names its role);
`check:config` (`PAYMENT_KEYS_SECRET`, `BLOB_READ_WRITE_TOKEN`);
cost sentinels `unitCost`, `secretEnc`, `webhookSecretEnc`, checked against
storefront chunks; npm aliases `check:tenant` and `check:actions`.

## For the owner (in the order needed)

1. **Before 1W.3 goes live — a sign-in email sender.** Supabase's built-in
   sender is limited to a few emails an hour (team addresses only); custom
   SMTP in Supabase → Authentication → SMTP. Recommendation: Resend (free tier,
   verified sending domain — the cheap domain from call 1). Sign-in emails only.
2. **The cheap domain** (needed for the email sender's domain and shop addresses).
3. **Supabase Magic Link email template** gains the 6-digit `{{ .Token }}` (text given at the time).
4. **Before 1A.5 — Vercel Pro** (moved earlier: per-minute sweep; Hobby is non-commercial). Then a Blob store (`BLOB_READ_WRITE_TOKEN`).
5. **Before 1S.4 — `PAYMENT_KEYS_SECRET`**, 32-byte hex, **Production only**.
6. **Before a real order — Supabase Pro.**

## Review: findings → fixes

| Finding (reviewer) | Fix above |
|---|---|
| Webhook can be forged across tenants via a merchant's own key (tenancy, CRITICAL) | 1C webhook: tenant-scoped key, stored tenant_id, withTenant match, old route retired |
| Cache keys not bound to tenant (arch BLOCKER, tenancy HIGH) | `shopCached` with tenant as first argument |
| Place-order tenant source unspecified (tenancy HIGH, arch MAJOR) | `requireShop()` from Host; gate credential |
| Domain squatting / retired hosts (tenancy HIGH) | slug-derived address; retired-row tombstones deferred until needed |
| `app_tenant_for_host` search_path=public (both) | 0007 recreates it |
| Order-token page leaks (tenancy HIGH) | `app_order_by_token(tenant, token)`, shopper columns, no-store |
| Photo path from client (tenancy HIGH, arch Q3) | Blob, server-forced prefix, own action writes the row |
| Matcher skips image-like paths (tenancy HIGH) | layout checks Host = params.host |
| `app_create_shop` races and ids (both) | advisory lock, internal id, one shop per user |
| Cross-tenant FK (tenancy MEDIUM, proven) | composite FKs |
| Outbox dedupe global (both) | unique (tenant_id, dedupe_key); senders in withTenant |
| `using(true)` passes the gate (tenancy) | `check:tenant` policy rule + allowlist |
| Unpaid prepaid in To confirm (arch BLOCKER) | new derived states |
| Reservation holes (arch BLOCKER) | release in three places, late-capture rule, lock order, insert-first |
| Webhook can't find its tenant (arch BLOCKER) | `app_payment_webhook_for` |
| Secret in Preview (arch BLOCKER) | Production only; AAD-bound ciphertext |
| `codFee` name clash (both) | `codCharge` |
| SMTP limits (arch MAJOR) | owner step 1 before 1W.3 |
| No cron (arch MAJOR) | `after()` + sweep; Pro before 1A.5 |
| Import chunking (arch MAJOR) | import_rows, lease, Handle boundaries, browser parse |
| GST not computed; fee base (both) | `tax/gst.ts`, per-line snapshot; base excludes shipping and COD charge |
| Order numbers max+1 (arch, tenancy) | `tenant_counters` |
| No delivery truth for the fee (econ) | no billing in Phase 1; would-be fee recorded |
| Unknown cost read as 0 (econ) | nullable `unit_cost`, `cogs`, `forward_shipping` |
| Rate limits nowhere (arch) | `rate_limits` |
| Free tenants uncosted (econ) | time-boxed, capped |
| 3× screens break photo budget; AVIF vs WebP (econ, arch) | 1200 rung; WebP only |
| Middleware 301 on every request (arch) | deferred with retired addresses; page-level `permanentRedirect` when built |
| `tenants` update all columns (arch) | column grant |
| Host header for email redirect (arch) | `CONSOLE_HOST` |
| `npm run check:tenant` missing (tenancy LOW) | npm aliases |
| DPDP (arch) | checkout notice line; processor clause in merchant terms (lawyer review, call 13); abandoned-order data retention 90 days |

## 1S tenancy audit (2026-11-06) — SAFE, findings handled

- Logs carried query parameters (drizzle's message): settings actions now log the database code and reason only.
- Proof case 19 now also refuses cross-tenant update/delete of `shop_policies` and a `staff` member moving the shop.
- A version conflict rolls the transaction back, so no support audit row records a change that never happened.
- The old address's cached storefront page is revalidated on an address change; `checkAddress` is rate limited.
- Recorded here rather than editing an applied migration: `frata_admin` has deliberately NO grant on `shop_policies`
  (Admin reaches a shop's pages through a support visit); `app_change_shop_address`'s `p_uid` must come from
  `getUser()` (its only caller, `changeAddress`, uses `requireMember`); reserved words are checked in
  `src/domains/signup/slug.ts`, as for `app_create_shop`.
