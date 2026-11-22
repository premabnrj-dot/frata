# Test orders before opening (T1)
Status: draft (for the owner; reviews pending; nothing built) · Date: 2026-11-22 · Mockup: MOCKUP_LINK
(`docs/mockups/2026-11-22-test-orders.html`) · Approved: —
Phase T1 of `docs/plans/2026-11-22-studio-workbench.md` (owner, 2026-11-22: "Yes, test orders before opening").

## In short
- The store's own team places orders on a store that has never opened: real checkout, Razorpay test keys or Pay on
  delivery, the real order page, email and console queue.
- **Every order placed while `tenants.first_opened_at is null` is a test order. No column says so.** The trigger that
  sets `first_opened_at` deletes them in the same transaction, so after opening none exists and no reader of `orders`
  (about twenty: `src/lib/db/order-predicates.ts`, analytics, True Profit, billing's draft, risk, offers, GST) needs an
  exclusion.
- Only a browser holding a 12-hour pass from the console gets past Opening soon.

## Goal
Ranked problem 4 (mobile checkout conversion) and 5 (a premium storefront as code): a website is tested end to end
before its first shopper. Measure: every code website has a test order placed before opening; zero orders, shoppers or
counters left from testing after opening (a proof line); support messages about "how do I test checkout" at zero.

## Job
A developer, a partner or the owner places and pays an order on a store that has not opened, sees what a shopper and
the team would see, and opens the store clean.

## What is there today (read 2026-11-22)
| Fact | Where |
|---|---|
| An unopened store draws Opening soon on every page, order pages included | `src/app/s/[host]/_frame.tsx:23`, `(order)/layout.tsx:13` |
| Placing and paying refuse while closed | `src/lib/orders/place.ts:135`; `payment.ts:223,284` |
| Shop hosts do no session work; the console preview prices and places nothing | `src/middleware.ts:31`; `console/preview/.../preview-body.tsx:59-62` |
| Paying online needs live keys, a working webhook and an approved host | `src/lib/payments/keys.ts:72`; `src/lib/queries/checkout.ts:81` |
| A key's mode is stored (`payment_keys.mode`) from its prefix; an order records no mode | `keys.ts:36,47`; `razorpay.ts:41` |
| Placing writes: `tenant_counters` (order), `orders`, `customers` link, outbox `email.order` and `payment.check`, `order_lines`, `order_discounts`, stock for COD | `place.ts:160-206` |
| The invoice number is taken at Mark packed and the series must have no gap | `src/lib/orders/work.ts:158-188`; `src/domains/tax/gstr1.ts:147` |
| `first_opened_at` is set once by trigger `app_shop_first_opened` | `drizzle/0068_addresses_access.sql:79-88` |
| No test or demo order exists anywhere; billing's `test_mode` is a stored column filtered in each Admin report | `drizzle/0054:12`; `src/lib/admin/billing.ts:201-203` |

## Research (vendor pages read 2026-11-22; "undated" = live page with no date)
| Product | What it does | Taken |
|---|---|---|
| Razorpay · api-keys, undated | Test keys "without adding a website"; live keys need website details | Test orders pay with the store's own test keys |
| Stripe · keys, undated | A sandbox has its own keys and data | Test data apart from real data; here the line is the first opening. Skipped: a permanent test mode beside live orders |
| Shopify · theme-dev, undated | Local preview "can't preview checkout customizations" | Checkout is tested on the store's own address |
No current source read for Shopify's own test orders.

## Design (screens in the mockup)
1. **Start testing** (Settings › Website on a store never opened; later Studio's Checkout page): shows whether Pay
   online has test keys and Pay on delivery is on; **Start testing** mints a pass and opens the store's address;
   **Place a test order** opens checkout with the store's first product; **Stop testing**; a count "4 of 50".
2. **The pass.** The console action (`requireCapability('preview.read')`, so Builders too; never on a support visit)
   signs `{ tenant, exp ≤ 12 h, nonce }` with a server secret and redirects to
   `https://<store host>/_frrata/test?p=…`; that route, on the store's host, checks the signature, that the host's
   tenant equals the pass's and that `first_opened_at is null`, sets `__Host-test` (HttpOnly, Secure, SameSite=Lax,
   12 h) and redirects to `/checkout`. The tenant always comes from the host; the pass only proves the browser.
3. **Getting past Opening soon without making shop pages dynamic.** The middleware, on a shop host, when
   `__Host-test` is present and verifies, rewrites `/checkout` and `/orders` to an ungated copy of those two routes
   (static, as today's are); every other path and every other browser is unchanged. The APIs (`/api/shop/orders`,
   pay, view, retry, switch) accept a closed-but-never-opened store only with a valid pass, checked on the server.
4. **Checkout and the order page** are P2's, with a **Test** tag by the brand's name and the number's **T** series
   (`T-0005`, counter kind `test_order`). EkCode is not offered. Pay online shows only when the store's saved keys are
   `rzp_test_`; with live keys saved, or none, Pay on delivery only.
5. **In the console** an unopened store's Orders shows its test orders with a **Test** tag, a chip "Test orders ·
   deleted when you open" and **Delete N test orders**. Confirm and Cancel work. Mark packed is absent ("After you
   open").
6. **Opening.** The confirm reads "N test orders will be deleted." The trigger `app_shop_first_opened` deletes, for
   that tenant: `order_discounts`, `order_lines`, `orders`, the `customers` rows those orders made, their outbox rows,
   their `webhook_events`, the `test_order` counter. Passes die by the `first_opened_at` check.

### What a test order does (one rule each, where it lives)
| Part | Rule | Where |
|---|---|---|
| Is this a test order | `first_opened_at is null` for the order's tenant, read with the shop (`checkoutShop` gains `neverOpened`) | `src/lib/queries/checkout.ts` |
| May place | `shop.open`, or `neverOpened` with a valid pass; at most 50 unerased orders | `place.ts:135`; the route |
| Number | counter kind `test_order`, shown `T-0000` | `place.ts:160` |
| Stock | `takeStock` is skipped when `neverOpened` | `src/lib/orders/stock.ts` |
| Pay online | offered only with `payment_keys.mode = 'test'`; `startPayment` refuses a live key on a never-opened store | `checkout.ts:81`; `place.ts:280-307` |
| Email | `email.order` queued, subject prefixed "Test order" | `src/lib/email/enqueue.ts` |
| WhatsApp, courier, Conversions API | never queued for a never-opened store (one guard where order messages are enqueued) | the enqueue call sites |
| EkCode | not offered; `/api/shop/ekcode/*` refuses under a pass | checkout; the routes |
| Pack, invoice, ship | `pack()` refuses on a never-opened store | `src/lib/orders/work.ts:158` |
| Billing | nothing ships, so `draft.ts:88-90` counts nothing; the trial clock starts at opening as today | — |
| Analytics | the beacon is not loaded on the ungated routes | `shell.tsx` |

## Design review
- **UI/UX** — one job: place a test order; one primary action per state on the card. Readers: owner, Manager, staff,
  partner people, Builders (no console Orders). States in the mockup: not started, testing, no test keys, live keys,
  pass ended, limit reached, Builder, support visit, opened once, phone, Razorpay down. Norman: the Test tag and the T
  number are the signifiers on every surface; the limit and the 12 hours are constraints, not refusals to recover
  from; Delete test orders and Stop testing are the undo; the model is the merchant's ("before I open").
- **Tenancy** — no new table. The tenant comes from the store's host on every request; the pass is checked against it.
  The trigger's deletes are scoped to `new.id`. Proof block: a pass for store X refused on store Y's host; store Y's
  rows untouched by X's opening; nothing of X's testing left after opening. `tenancy-auditor`.
- **Modularity** — pure: `src/domains/checkout/test-pass.ts` (payload, expiry), `src/domains/orders/test-order.ts`
  (what a never-opened store may do); server: `src/lib/auth/test-pass.ts` (sign, verify; one owner of the secret).
- **SSOT / DRY** — "test order" is derived from `first_opened_at`, once (`neverOpened`); the pass's secret has one
  module; the ungated routes re-export the gated pages' components, no second checkout.
- **YAGNI** — out: test orders on an open store, packing and shipping a test order, a sandbox courier, per-order marks.
- **KISS** — a signed cookie, a middleware rewrite for two paths, a handful of `neverOpened` branches, deletes in an
  existing trigger. No table, no column, no reader changed.
- **Scalability** — at most 50 test orders a store, so the opening transaction deletes ≤ 50 orders and their rows.
  The middleware check runs only when the cookie is present.
- **Performance and speed** — (a) `checkoutShop` gains one column already in its join; (b) no new query on
  `orders`; the 50 count is by `tenant_id` on a never-opened store (a handful of rows); (c) no cached entry grows;
  (d) no shop page changes for the public; the two ungated routes stay static; (e) opening already purges the store;
  (f) no first-load JS added for shoppers (the Test tag is server-drawn); (g) nothing preloaded.
- **Reliability** — Razorpay through the existing `fetchWithTimeout` path; a miss reads as today. The deletes are in
  the opening transaction: opening and the clean-up succeed or fail together.
- **Security** — the pass: HMAC with a server-only secret, ≤ 12 h, bound to the tenant, useless once
  `first_opened_at` is set, `__Host-` cookie, never in a log; the mint is a server action behind
  `requireCapability('preview.read')`, refused on a support visit, rate-limited per member. The `?p=` value is dropped
  by the redirect. Under a pass the store is still not indexed and still closed to everyone else. Live keys are never
  used: checked at offer and again at `startPayment`. A test order's personal fields are whatever the tester typed;
  they are deleted at opening and by Delete test orders. EkCode stays off so no real saved address appears.
  `security-reviewer`.
- **Motion and visuals** — nothing new; the confirm dialog is the console's.
- **Unit economics** — a test order costs one email (SES) and the Razorpay test call; no fee, no courier, no WhatsApp.
  The 50 cap bounds it. `unit-economics-reviewer` only if the cap changes.
- **Theme blocks** — n/a.
- **Storefront API** — unchanged. The bag link from a website built on a Test key lands on the same checkout.
- **Blast radius** — `middleware.ts` (every request: the branch runs only with the cookie); `place.ts`, `payment.ts`,
  `stock.ts`, `work.ts`, `checkout.ts` (each gains one `neverOpened` branch); `app_shop_first_opened` (every opening);
  `openShop`'s confirm.

### Stress test
| Severity | What | Where | Fix |
|---|---|---|---|
| High | A pass leaks (shared screenshot, a forwarded link) | the `?p=` hop | single hop, dropped at once; the cookie is HttpOnly; 12 h; dies at opening; it places test orders only |
| High | Live keys saved before opening, then a test payment | `online-payments/actions.ts:20` accepts live keys early | Pay online absent; `startPayment` refuses |
| High | An order survives opening and reaches a report | the trigger | proof line: zero rows of every listed table after opening; a second open after a close deletes nothing |
| Medium | A test order's email goes to a real stranger's address | checkout's email field | the subject says Test order; at most 50 a store |
| Medium | A webhook for a deleted test order arrives after opening | `webhooks/razorpay` | the event finds no order and is stored as unmatched, as an unknown order is today (to confirm in review) |
| Medium | Offers with a use limit consumed by tests | `discountUses` | `order_discounts` deleted at opening restores the count |
| Medium | Stock looks untouched after a test, confusing a tester | `stock.ts` | the Test tag; the rules table in the docs' Start guide |
| Low | A store opened once and closed wants to test | — | out of scope; orders are real from first opening |
| Low | The pilot (open) wants test orders | — | out of scope (call 6) |

## Out of scope
| Left out | Signal that brings it back |
|---|---|
| Test orders on an open store | a partner maintaining a live store asks twice; needs a stored mark and every reader filtered |
| Packing and shipping a test order | partners ask to demo the full journey to a brand |
| A test pass for the whole theme storefront | theme stores are retiring (ADR-0014) |

## Owner decisions
1 every order before first opening is a test order, deleted at opening (yes) · 2 no pack or ship (yes) · 3 the order
email is sent (yes) · 4 anyone who can preview may start testing, Builders included (yes) · 5 50 orders and a 12-hour
pass (yes) · 6 an open store (not now).

## Facts used
Razorpay api-keys page, Stripe keys page, Shopify theme-dev page: read 2026-11-22, undated. The code facts above.
