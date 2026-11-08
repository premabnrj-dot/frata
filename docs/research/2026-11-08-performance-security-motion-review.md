# Whole-codebase review: performance, security, motion and visuals
Date: 2026-11-08 · Status: fixes built 2026-11-08 (see § Outcome); S1, S5, S6 wait for the owner · Proposal mockup: https://claude.ai/artifact/R5rhr3Q1UY27QpnkmEamNS (`docs/mockups/2026-11-08-motion-and-visuals.html`)

Three reviews ran against `main` at 51366ad.

- **Performance:** measured on a 10× seed (600 products × 5 variants, 150k orders) with `log_statement=all` and EXPLAIN ANALYZE.
- **Security:** read every action, route, definer, webhook and header, and ran `npm audit`.
- **Motion and visuals:** read every transition and looked at every e2e screenshot.

I checked each HIGH finding against the code again before writing it here. Nothing below has been fixed yet.

## Security (no critical)

The controls the product depends on hold:

- the tenant comes from requireMember or the host only;
- RLS + `withTenant`;
- definers use `search_path=''`;
- webhooks are checked on the raw body with a timing-safe HMAC;
- sealed tokens are AES-GCM with AAD;
- links are shop paths only;
- shop POSTs check Origin;
- there is no SSRF and no open redirect.

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| S1 | HIGH | Preview builds get the production `DATABASE_URL`. Any pushed branch other than `claude/**` runs unreviewed code with `frata_app`, which sets its own tenant. | `docs/setup.md` ("Production + Preview"), `vercel.json` | Preview gets no DB or a Supabase branch, and Deployment Protection is on. **Owner, in Vercel.** |
| S2 | MED | Auth cookies are script-readable, not `Secure`, and live 400 days (the `@supabase/ssr` defaults). No `script-src` backs this up. | `src/lib/supabase/server.ts:10`, `middleware.ts:19` | `cookieOptions: { httpOnly, secure, sameSite: 'lax', maxAge }`. Nothing reads them in the browser. |
| S3 | MED | The CSP has no `script-src`, `default-src` or `form-action`. | `src/lib/security-headers.ts` | Nonce + `strict-dynamic` on Console and Admin (already dynamic); `form-action 'self'` everywhere; shops unchanged. |
| S4 | MED | Razorpay webhook rows keep shopper PII (email, contact, VPA) forever, readable with no tenant set. | `drizzle/0030:70`, `src/lib/orders/payment.ts:210` | Trim the payload after processing, as WhatsApp does; drop the null-tenant read branch. |
| S5 | MED | Staff sign in with an emailed code only, and a support visit acts as owner. | `require-staff.ts`, `app_access_for` | aal2 in `requireStaff` before outside merchants. Accepted for now (ADR-0007). |
| S6 | MED | Staff members can edit the catalogue (`ANY_MEMBER`), but `CAN_BUILD` says they cannot. | `products/actions.ts`, `collections/actions.ts`, upload route | **Owner: which is meant?** |
| S7 | LOW | `check:actions` counts a chokepoint named in a comment. It is per file, not per export, and skips the look editor and preview pages. | `scripts/check-actions.mjs` | Strip comments, check each export, cover every page. |
| S8 | LOW | The offer-code guess limit is per IP; IPv6 rotates within a /64. | `rate-limit.ts:31` | Count IPv6 per /64. |
| S9 | LOW | The sign-in code limit fails open on a DB error. | `login/actions.ts:35` | Fail closed. |
| S10 | LOW | Raw drizzle errors are logged, which puts owner emails in the logs. | admin new and plan actions, settings pages | Log the name or code only. |
| S11 | LOW | Uploads have no per-shop quota, and the WebP check trusts the declared type. | `api/console/upload` | Quota + magic bytes. |
| S12 | LOW | Early definers may still be executable by `service_role`. | 0001, 0006, 0008, 0010, 0017 | One revoke migration. |
| S13 | LOW | The Razorpay webhook has no body cap. | `webhooks/razorpay/[key]` | 413 over N bytes. |
| S14 | LOW | `npm audit`: 6 issues, all build-time (postcss in next; zod under @vercel/cli-config). | — | Routine upgrades, never `--force`. |

## Performance

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| P1 | HIGH | The cached catalogue is 1.95 MB at 600 products. Next stops caching over 2 MB, so one shop-wide offer tips it over and every shop page then reads Postgres. | `storefront.ts:130` | A slim list projection; offers once per shop; a 1 MB gate. |
| P2 | HIGH | `/products` and collections render every product: 3.9 MB HTML, 1,200 `<img>`, 5.8 MB ISR per regeneration. | `pages.tsx:36` | Page at 48. |
| P3 | HIGH | Parallel cache misses repeat queries: 61 statements on a cold product page, with three connections at once. | `storefront.ts` loaders | `cache()` over `shopCached`. |
| P4 | HIGH (latent) | `showcase()` calls the cached `collectionMembers` (a second connection) inside a transaction, which deadlocks a full pool for up to 30 s. | `storefront.ts:179` | `collectionMembersIn(tx, …)`. |
| P5 | HIGH (latent) | The outbox sends 25 rows a day (daily cron, `claimDue(25)`). The first WhatsApp sender would need about 15k a day at 500 shops. | `vercel.json`, `outbox/index.ts:29` | Drain in `after()`, loop until empty, a frequent schedule. Before the first sender. |
| P6 | MED | Every shop page preloads 4 fonts (163 KB) ahead of the LCP image. | `app/layout.tsx`, `shop-preview/fonts.ts` | Preload the shop's own face only. |
| P7 | MED | Two Supabase auth calls on every console request; `requireMember(tuple)` misses `cache()` for each new array. | `supabase/middleware.ts:30`, `require-member.ts` | `getClaims()` in middleware; argument-free cached access. |
| P8 | MED | Console pages run their queries one after another (Orders about 18 trips; could be about 7). | `orders/page.tsx`, `order-detail.ts`, `today.ts` | One transaction + `Promise.all`. |
| P9 | MED | The "All" count does a seq scan of orders (58 ms at 150k). | `orders.ts:62` | A partial index or a capped count. |
| P10 | MED | Order search with `%…%` takes 167 ms. | `searchSql` | `pg_trgm` GIN. |
| P11 | MED | One sell-out purges the whole shop's cache. | `payment.ts`, `place.ts` | Per-product tags; debounce the catalogue. |
| P12 | MED | The pool has no idle or connect timeout. | `db/index.ts:28` | `idle_timeout`, `connect_timeout`, `attachDatabasePool`. |
| P13 | LOW | The pre-order "owed" subquery takes 146 ms per rebuild. | `order-predicates.ts:121` | A partial index. |
| P14 | LOW | zod (25 kB gz) is in two console page bundles. | `domains/checkout/address.ts`, `themes/sections.ts` | `zod/mini` or server-only. |
| P15 | LOW | 4 `fetchpriority=high` images on home; the logo has no size (CLS). | `sections/index.tsx`, `shell.tsx:43` | One priority image; sized logo. |

These held up: every shop route is ISR, shop JS is 101–111 kB of the 120 kB budget, cost names are absent from HTML and RSC, and the hot indexes exist.

## Motion and visuals

The motion audit agrees with what the code shows:

- **More sheet:** animates in only; its scrim is not `--scrim`.
- **Bag drawer and size guide:** no motion at all, `bg-black/40`.
- **Unsaved bar and leave dialog:** reuse the sideways *step* animation.
- **Switches:** three builds behave three ways.
- **Look gallery:** animates `box-shadow` (rule 22), and shadows are zero.
- **Storefront photos:** broken photos show the browser's glyph.
- **Tooling:** `check:motion` does not cover the storefront.

**Rule 24 (page transitions):**

- Its condition is still unmet: we are on Next 15.5 and React 19.2.8.
- React 19.3 made `<ViewTransition>` stable (2026-09-09).
- Next's guide (2026-10-15) covers the App Router.
- Meeting the condition is a framework upgrade, planned on its own.

The proposed motion system, the illustration and icon opportunities, and the rule changes are in the proposal artifact. They are **not** in `frata-design-language` until the owner approves them (ADR-0001).

## What changed in the skills with this review

- `frata-planning` 2.3.0: Scalability, Performance and Security now ask for numbers and named checks; a new "Motion and visuals" heading.
- `frata-architecture` 2.15.0: a new § Speed (budgets, loader rules, pool, fonts); § Auth, § Tenancy and § Outside world gain the security rules above, each marked where the code does not hold it yet.
- `frata-verify` 1.6.0: a speed proof and a header and cookie proof.
- New agents `speed-reviewer` and `security-reviewer`, so these reviews run the same way every time.

## Outcome (built 2026-11-08, owner: "fix the speed and security issues first")

| # | Outcome |
|---|---|
| S1 | **Owner, in Vercel**: Preview still has the production `DATABASE_URL` |
| S2 | Fixed: `sessionCookieOptions` (httpOnly, Secure, lax, 30 days) |
| S3 | Fixed: per-request nonce + `strict-dynamic` + `form-action 'self'` on signed-in pages (middleware); e2e 12-security |
| S4 | Fixed: drizzle/0043 (no no-shop webhook rows; stored payloads trimmed); `trimRazorpayEvent` after processing; proof 37 |
| S5 | Accepted (ADR-0007): aal2 before outside merchants |
| S6 | **Owner**: may staff edit the catalogue? (code says yes, the role notes say no) |
| S7 | Fixed: check:actions per export, comments ignored, look editor and preview pages covered |
| S8 | Fixed: `ipBucket` (IPv6 per /64) |
| S9 | Fixed: the sign-in code limit fails closed |
| S10 | Fixed: `errName`, new gate check:logs |
| S11 | Fixed for product photos (WebP bytes checked before attaching); 800 upload tokens per shop an hour. The look's and the logo's uploads are not byte-checked yet |
| S12 | Fixed: drizzle/0043 revokes service_role from every public function; proof 37 |
| S13 | Fixed: 256 kB cap, 413 before any lookup; e2e 12-security |
| S14 | Left for routine upgrades (build-time only) |
| P1 | Fixed: offers by index, list photos only, blanks dropped: 880 kB at 600 products with an offer (`catalogue-size.int.test.ts`) |
| P2 | Fixed: 48 a page, `/products/page/N`, `/collections/<h>/page/N`; e2e 13-paging |
| P3 | Fixed: every shop loader `cache()`d |
| P4 | Fixed: `collectionMembersIn(tx, …)` |
| P5 | Fixed in code (`drainOutbox` loops, `eachLimited`); `drainSoon` is ready for the first sender, which calls it; the cron stays daily until a sender needs Pro |
| P6 | Fixed: no font preloaded on a shop |
| P7 | Fixed: middleware `getClaims`; `currentAccess`/`currentStaff` once per request |
| P8 | Fixed: Orders, the order page and Home read in parallel |
| P9 | Index `orders_tenant_placed_only`: index-only count, 58 → 39 ms at 150k |
| P10 | Measured, kept: row security keeps Postgres off any index for ILIKE; 100 ms at 150k |
| P11 | Fixed: `refreshSoldOut`, at most once per 30 s per shop and instance |
| P12 | Timeouts added; `attachDatabasePool` waits (a new dependency) |
| P13 | Index `order_lines_preorder_owed` |
| P14 | Fixed for the order page (147.5 → 125 kB); the look editor keeps zod (it validates there) |
| P15 | Fixed: `priority` only in the first section; the logo is sized |

**Tenancy audit of the fixes (2026-11-08): SAFE.** Its gaps were closed in the proof (a processed event keeps no
shopper field; inside shop A, B's webhook rows are unreadable and unwritable) and in the outbox (`last_error` keeps
an error's name, not its message). One stays open on purpose: the `outbox` policies keep their no-shop branch
(drizzle/0017, 0018) because the cron claims across shops. **Before the first sender enqueues a shopper's phone**, the
claim moves to a definer that returns rows for the sweep and the null branch goes (§ Definers and platform reads).
