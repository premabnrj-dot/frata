# Test orders before opening (T1)
Status: draft (for the owner; three reviews folded in 2026-11-22, § Reviews; nothing built) · Date: 2026-11-22 · Mockup: https://claude.ai/artifact/XUp8WAwaCWwxJxnxyHoY9j
(`docs/mockups/2026-11-22-test-orders.html`) · Approved: —
Phase T1 of `docs/plans/2026-11-22-studio-workbench.md` (owner, 2026-11-22: "Yes, test orders before opening").

## In short
- The store's own team places orders on a store that has never opened: real checkout, Razorpay test keys or Pay on
  delivery, the real order page, email and console queue.
- **Every order placed while `tenants.first_opened_at is null` is a test order. No column says so.** One definer deletes
  them, puts their stock back and resets the order numbering; the first-opening trigger calls it in the opening's own
  transaction, and so does **Delete test orders**. After opening none exists, so no reader of `orders` needs an
  exclusion.
- A test order is an ordinary order in every other way (same number series, same stock, same states), which is what
  keeps the change small: the first draft's separate numbering and skipped stock each broke a reader (§ Reviews).
- Only a browser holding a 12-hour pass from the console can price, place or pay. The checkout and order page shells
  of a never-opened store are drawn for anyone; they show the brand's name and nothing else until an API answers.

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
1. **Start testing** (Settings › Website on a store never opened; later Studio's Checkout page): whether Pay online
   has test keys and Pay on delivery is on; **Start testing**; **Place a test order** (checkout with the store's first
   product); **Stop testing** (this browser); "4 placed today".
2. **The pass.** A console server action behind a new capability **`orders.test`** (owner, Manager, staff, the
   partner's people and Builders; never a support visit; limited per member) signs a 60-second token
   `{ host, user, exp }` and redirects to `https://<store host>/api/shop/test/start?p=…` (the pattern of
   `ekcode/start`). That route, on the store's host, checks the signature, that `host` equals the request's Host and
   that the host's tenant has `first_opened_at is null`, then sets its own 12-hour value in `__Host-test` (HttpOnly,
   Secure, SameSite=Lax) and redirects to `/checkout` with `Referrer-Policy: no-referrer` and `Cache-Control:
   no-store`. The tenant always comes from the host; the pass proves the browser and names the member. Its secret is
   Production only, one owner module. No middleware change.
3. **Opening soon gives way on two pages only.** `_frame.tsx:23`'s gate and `(order)/layout.tsx:13` draw the checkout
   and order page shells when the store has never opened (static, as today); every other page stays Opening soon.
   **The APIs are the lock.** One helper beside `requireShop` decides, per route, on a never-opened store:
   - accept only with a valid pass: `orders`, `orders/pay`, `orders/cod`, `orders/retry`, `orders/change`, `quote`,
     `delivery`, `pincode`;
   - accept by the order's own token, pass or not: `orders/view` (so the email's link opens on the tester's phone);
   - refuse: `orders/invoice`, `email-drops`, `ekcode/*`, the beacon `e`.
   Without a pass the checkout shell shows the empty-bag state and prices nothing.
4. **Checkout and the order page** are P2's, with a **Test** tag by the brand's name. The number is the store's own
   series. EkCode is not offered.
5. **Pay online on a test order** needs only that the store's saved keys are `rzp_test_` and Razorpay accepts them
   (`testOnline`, a predicate beside `canTakeOnline`; no webhook seen, no approved host). `startPayment` and the edit
   payments refuse a live key on a never-opened store. `canTakeOnline` and `setupSteps` are unchanged: opening still
   needs live keys.
6. **The order email** goes to the member who started testing (the pass names them), never to the typed address;
   its subject starts "Test order"; it carries no marketing link.
7. **In the console** a never-opened store's Orders, Home and Analytics carry the chip "Test orders · deleted when
   your store opens"; Orders has **Delete N test orders** with a confirm. Confirm and Cancel work. Mark packed, invoices,
   credit notes and refunds through Frrata's fee rows refuse ("After your store opens").
8. **Deleting.** `app_delete_test_orders()` (security definer; the tenant from `app_current_tenant()` when called by a
   member, from the trigger's row at opening; locks the tenant row; raises unless `first_opened_at is null`; refuses a
   Builder and a support visit): puts back stock on every line stamped `stock_taken_at`, deletes the tenant's `orders`
   (cascading `order_lines`, `order_events`, `order_notes`, `order_discounts`, `shipments`, `review_requests`,
   `customer_consents`, `email_messages`, `order_edits`, `order_refunds`), its `outbox` rows by `payload->>'orderId'`,
   Razorpay `webhook_events` of the tenant, every `shop_customers` row of the tenant, and the `order` counter's row.
   It never touches `audit_events`, `email_suppressions`, `rate_limits` or `payment_keys`.
9. **Opening.** The confirm reads "N test orders will be deleted." In `app_shop_first_opened` the definer runs **only
   inside `if found`** after the existing `update … where first_opened_at is null`, so a store that closes and
   reopens deletes nothing. Placing on a never-opened store first takes
   `select first_opened_at from tenants where id = $1 for share` and re-reads the fact under it, so no placement can
   commit across the opening.

### What a test order does (one rule each, where it lives)
| Part | Rule | Where |
|---|---|---|
| Is this a test order | `first_opened_at is null` for the order's tenant: `src/domains/orders/test-order.ts`, read by one `neverOpenedIn(tx)`; `checkoutShop`, `pack()`, the console lists and the email sender read through it | new |
| May place | `shop.open`, or never opened with a valid pass; 50 placements a store a day (`rate_limits`, failing closed) | `place.ts:135`; the route |
| Number, stock, states, offers | as any order; undone by the definer | unchanged |
| Pay online | `testOnline`; a live key refused | `keys.ts`; `place.ts:280-307`; `edit.ts` |
| Email | to the pass's member; "Test order" subject; no drops link; `consentToDrops` refuses | `src/lib/email/enqueue.ts`; `queries/drops.ts:32` |
| EkCode | not offered; its routes refuse | checkout; `ekcode/*` |
| Pack, invoice, credit note, fee rows | refuse on a never-opened store (two foreign keys there are RESTRICT and would abort the opening) | `work.ts:158`; `drizzle/0052:23`; `0047:100` |
| Analytics | the beacon is not loaded on the two shells | `shell.tsx` |
| Billing | nothing ships, so the draft counts nothing | `draft.ts:88-90` |

## Design review
- **UI/UX** — one job: place a test order; one primary action per state on the card. Readers: owner, Manager, staff,
  partner people, Builders (no console Orders). States in the mockup: not started, testing, no test keys, live keys,
  pass ended, limit reached, Builder, support visit, opened once, phone, Razorpay down. Norman: the Test tag and the T
  number are the signifiers on every surface; the limit and the 12 hours are constraints, not refusals to recover
  from; Delete test orders and Stop testing are the undo; the model is the merchant's ("before I open").
- **Tenancy** — no new table; one definer and one capability. The tenant comes from the store's host on every request; the pass is checked against it.
  The trigger's deletes are scoped to `new.id`. Proof block: a pass for store X refused on store Y's host; store Y's
  rows untouched by X's opening; nothing of X's testing left after opening. `tenancy-auditor`.
- **Modularity** — pure: `src/domains/checkout/test-pass.ts` (payload, expiry), `src/domains/orders/test-order.ts`
  (the predicate and the per-route table); server: `src/lib/auth/test-pass.ts` (sign, verify; one owner of the secret);
  the per-route helper joins P3·4's shared handler set, so the secure frame carries the pass without a second design
  (on a one-address host the cookie is set on `secure.<host>`).
- **SSOT / DRY** — "test order" is derived from `first_opened_at`, once (`neverOpened`); the pass's secret has one
  module; no second checkout and no copy of a page.
- **YAGNI** — out: test orders on an open store, packing and shipping a test order, a sandbox courier, per-order marks.
- **KISS** — a signed cookie, one helper on the shop routes, one definer called from two places. No table, no
  column, no middleware change, no reader changed, no second numbering.
- **Scalability** — 50 placements a store a day bound the opening transaction's deletes (a store testing for a
  month could hold more: Delete test orders, and the opening confirm's count, keep it visible).
- **Performance and speed** — (a) `checkoutShop` gains one column already in its join; (b) no new query on
  `orders`; the 50 count is by `tenant_id` on a never-opened store (a handful of rows); (c) no cached entry grows;
  (d) the two shells stay static; no other shop page changes; (e) opening already purges the store;
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
| High | A placement commits across the opening and becomes a real order | `place.ts:135,160`; `0068:82` | the `for share` read in placing (design 9) |
| High | A reopen wipes real orders | `0068:87-88` | deletes only inside `if found` (design 9); a `verify:tenancy` block |
| High | A pass for one's own unopened store used on another store's host | the cookie | the pass carries the host; the route compares it with Host and the host's tenant |
| High | Live keys saved before opening, then a test payment | `online-payments/actions.ts:20` | `testOnline`; `startPayment` refuses |
| Medium | The `?p=` value replayed from a log | the hop | 60 seconds; the cookie's value is separate; no referrer; no store |
| Medium | Test emails sent to strangers from Frrata's sender | checkout's email field | sent to the pass's member only; 50 placements a day |
| Medium | A test email creates a real marketing consent | `queries/drops.ts:32` | no drops link; `consentToDrops` refuses; `shop_customers` deleted |
| Medium | A credit note or fee row blocks the opening | RESTRICT keys | both refuse on a never-opened store |
| Medium | Home, Analytics and Admin's offer totals count test orders before opening | their queries | the chip on Home and Analytics; Admin's totals accepted until opening (staff read) |
| Low | A webhook for a deleted order | `payment.ts:370,339` | confirmed safe: "no such order", marked processed, trimmed |
| Low | Orders already on never-opened stores in production | — | a proof line before the migration: zero |
| Low | A partner store's trial clock runs from creation, not opening | `0063:103` | unchanged; test orders do not move it |

## Reviews (2026-11-22, on the first draft; all folded in above)
| Agent | Verdict | What changed |
|---|---|---|
| `security-reviewer` (also as tenancy auditor) | FIX BEFORE MERGE (4 high, 6 medium, 2 low) | the `for share` read; deletes only on the first opening; the delete definer; the pass bound to the host, 60-second hop; the route table; `orders.test`; emails to the member only; no drops consent; the delete list and the two RESTRICT keys |
| `architecture-reviewer` | CHANGES NEEDED (3 blockers, 4 majors) | stock taken as usual and put back by the definer (a skipped take made paid orders read "refund due"); no middleware rewrite or page copies (shells drawn, the APIs the lock); the store's own number series (a T series touched eight formatters); the predicate in one domain module; `testOnline`; designed into P3·4's handlers |
| `words-reviewer` | 24 rows on the mockup | all rewritten; the Delete confirm drawn |
To run on the revised spec before the plan's tasks are written: `tenancy-auditor` on the definer, `security-reviewer`
on the pass and the route table, `speed-reviewer`.

## Out of scope
| Left out | Signal that brings it back |
|---|---|
| Test orders on an open store | a partner maintaining a live store asks twice; needs a stored mark and every reader filtered |
| Packing and shipping a test order | partners ask to demo the full journey to a brand |
| A test pass for the whole theme storefront | theme stores are retiring (ADR-0014) |

## Owner decisions
1 every order before first opening is a test order, deleted at opening (yes) · 2 no pack or ship (yes) · 3 the order
email is sent, to the member testing (yes) · 4 anyone on the team may test, Builders included, as a new permission
(yes; amends ADR-0015 § 5: a Builder sees the order page of a test order whose link they hold, never the console's
Orders) · 5 50 placements a store a day and a 12-hour pass (yes) · 6 an open store (not now) · 7 the checkout and
order page shells of a never-opened store are drawn for anyone, the brand's name only (yes; the alternative is a
per-request check on every shop page).

## Facts used
Razorpay api-keys page, Stripe keys page, Shopify theme-dev page: read 2026-11-22, undated. The code facts above.
