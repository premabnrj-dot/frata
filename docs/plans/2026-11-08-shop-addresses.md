# Plan — Shop addresses: names, own domains, trust and safety
Status: active (reviewed 2026-11-08: architecture, tenancy, security; owner calls decided) ·
Date: 2026-11-08 · Spec: `docs/specs/2026-11-08-shop-addresses.md` (approved by the owner 2026-11-08 with the note "no
descriptions or clarifications": spec § Words on screen) · Research: `docs/research/2026-11-08-shop-addresses.md`.
D·0 is live (frrata.shop, main bce936b). D·1 is live: D1·1–D1·6 at main 98de1bb (migrations 0067, 0068), D1·7 Admin
with migration 0069. Migrations were renumbered after the trials work took 0064–0066.

Gates on every task: `npm test`, `npm run typecheck`, int tests with `INT_DB_HOST`, `verify:tenancy` for every
migration, `impact-reviewer` on the task's diff, e2e for the flows it touches. A `claude/**` push never deploys; main
deploys production. Migrations start at **0064**. **Deploy rule (review B3):** a migration never changes what a live
definer returns; a new definer goes in beside the old one, the code switches, the old one goes in a later migration —
so production never runs code against a database it doesn't match. Every new or recreated definer re-revokes from
`public, anon, authenticated, service_role` (S12).

## The regression net, first
| Changes | Net (written before the change) |
|---|---|
| Host → shop, redirects | `host.test.ts`; e2e `12-security` (bare domain 307; a shop opens; **no Set-Cookie on any shop host**); new e2e `52-addresses` with every D·1/D·2 step, pending until built |
| Who can take a name | **New e2e `03-signup`** (sign-up picks a name; a taken one says "Taken"); `40-partners` (partner creates a store); Admin's form refusing a retired name (`admin.int.test.ts`) |
| Canonical, sitemap, robots | e2e `05-shop-look` asserts canonical and sitemap use the main address |
| Checkout through a host | `10-checkout`, `13-paging`, `51-analytics`; e2e 52 adds checkout through an old name and through a non-main domain |

## D1·0 — First, because it takes longest (owner + me)
- **Extend frrata.shop to ≥ 3 years at Hostinger** (owner); then the `_psl` TXT record and the Public Suffix List pull
  request (me, filed by the owner). No review time is promised; cookie and Safe Browsing isolation depend on it.
- Until it is listed: **no cookies on shop hosts** (gate widened from `cookies(` under `src/app/s` to an e2e assertion
  on every shop response) and **no pixels or third-party scripts on shops**.

## D·1 — Names
| Task | What | Verify |
|---|---|---|
| D1·1 | Migration 0064: `shop_names` (name PK, tenant_id, created_at, retired_at, retired_by_frrata bool, **no reuse ever** by the PK); one current per shop (partial unique `(tenant_id) where retired_at is null`); backfill from `tenants.slug`. **One trigger on `tenants` slug insert/update writes `shop_names`** (review B1) — so sign-up (`app_create_shop`), partners (`app_partner_create_shop`) and Admin (`createMerchant`) all hit the name PK; `revoke update (slug) on tenants from frata_admin`; a constraint trigger keeps `tenants.slug` = the current `shop_names` row. `blocked_names` holds only protected brands, offensive words and blocked domains (kind, reason, by); `RESERVED` stays in code (routing words Admin must not delete). `tenants.address_frozen_at`, `tenants.first_opened_at` (set once by the publish writer, never cleared by a close). | `verify:tenancy` new proofs: A can't read B's names; a retired name is refused by all three creators; Admin can't update a slug directly |
| D1·2 | `app_name_check(name)` definer replaces `app_slug_available`: returns ok / taken (taken, retired, blocked and reserved all say **Taken**, so the check can't list protected brands); rate-limited per IP; granted to frata_app and frata_admin. Pure `src/domains/addresses/names.ts`: shape (`slugProblem`) + `xn--` refused | vitest; int |
| D1·3 | `app_rename_shop(tenant, uid, name, by_frrata, reason)` — the one rename (merchant and Admin): owner/admin re-checked from `members` (merchant path); refuses a support visit; refuses when `address_frozen_at`; **before the first opening** a rename deletes the unshared old row; **after it**, at most two (SQL enforces; a parity int test with the TS display); the old row retired (redirecting) — or, when `by_frrata`, retired **without redirect**; audit row | int: rename after opening; third refused; close-reopen doesn't reset; Frrata rename stops redirecting |
| D1·4 | `app_shop_for_host(host)` (new, beside `app_tenant_for_slug/_for_host`): returns **facts only** — tenant id, current name, whether the asked name is current or retired-redirecting, the shop's live domains (≤ 4 rows), frozen/closed. Pure `addressFor(host, facts, now)` → serve · redirect(to) · unavailable. `coreShop.host` and every `shopHost(slug)` caller (Make a link, settings, products, partner, Admin) read the one main address. Cache key `['sf-host-v2', host]`, tags `host:<every name and domain of the shop>`; **every change refreshes all hosts of both shops** (tenancy H5). | int: tags after rename; e2e 52 old name → current |
| D1·5 | **Built as a browser move, not a 307 (2026-11-08, for the owner to confirm):** a shop page can't see its query string without becoming per-request, so a server redirect from an old name would drop `?utm_…` — Instagram links would lose their tags for Analytics. An old name renders the page (canonical = the current address, so search engines move) and the shop layout moves the browser to the same path, query and `#` on the current address (`movedUrl`, pure and tested: `//evil.com` and `/\evil.com` stay on our host; `/orders` never moves). The 307 of owner call 2 applies to D·2's own domains, where the move happens before the page is cached | e2e 52; `names.test.ts` |
| D1·6 | Settings › Shop address (spec § Words): Change with "N changes left"; staff read-only; support visits refused server-side (banner already says why — no per-button reasons) | e2e 52 + 90 at 390 px |
| D1·7 | Admin (aal2 not chosen: owner call 5, accepted risk): Addresses tab (names), **Rename <shop>'s address** (reason ≤ 500, no redirect), **Freeze address changes**; Admin › Names (protected, offensive, blocked domains; release = delete a retired `shop_names` row with a reason, refreshing its host). Close and takedown for the `admin` staff role only | admin int; e2e 90 |

**D1·7 as built (tenancy audit 2026-11-08, safe):** rename, freeze and release are admin-role definers (0069) that
audit themselves; blocked names are Admin rows with an audit row. Accepted, as in 0063: a definer trusts the
`p_staff` uuid the Admin code passes (any frata_admin code could pass an admin's id); a stronger lock would read a
transaction-local `app.staff_id` set by `adminDb`. A release's reason is written to the former holder's audit rows:
staff never name another merchant in it.
Built differently from mockup § 8 (impact review): Admin › Names is three parts (Blocked, Frrata's words read-only,
Held with Release in the row) rather than one table. Telling the shop about Frrata's rename, freeze or release (spec
§ 3, design rule 71: the reason and a Reply) comes with T·1's notices; until then the shop's address page shows
"frozen" and the audit log keeps the reason.

**D1·8 (found by D2·0, before the first live payment):** Settings › "Ready for live payments" gains one item, "Add
<slug>.frrata.shop in Razorpay" (Open Razorpay; the merchant ticks "Added", stored with who and when; no API exists to
check it). A rename (D1) re-asks it for the new name, since the old host stops taking checkout. Razorpay's sub-domain
route is "raise a request with Support": the item links the steps in docs/setup.md, written once with a real account.

## D·2 — Own domains (owner 2026-11-09: build now on Hobby with a once-a-day check; Pro before the first live merchant)
No merchant is live yet, so Hobby's non-commercial terms don't bite (the first live payment on any shop needs Pro);
legacy `crons` run at most once a day on Hobby (Vercel Schedules, beta since 2026-11-05, allow every 15 min within
5,000 runs a period: an option, not a dependency), so the check runs daily and **Check records** runs the same check for one shop on demand. On upgrading to Pro, the schedule in
`vercel.json` moves to the pace in D2·8 (one line) and nothing else changes. Migrations start at **0080**.

**Cross-checked against main 2026-11-09** (themes, SEO, GST, reviews, Signal merged):
- **The main address has one source on the shop:** `StoreShop.host` (`coreShop` in `src/lib/queries/storefront.ts`)
  now feeds canonical and Open Graph (`src/domains/seo/tags.ts`), share cards (`/s/[host]/og`, `src/lib/seo/share*.ts`),
  icons, sitemap and robots. D2·9 changes that one value to the main address (and refreshes `shop:<id>`); the console's
  own `hostFor` callers (Make a link, Share, search, products, analytics `ownHosts`) read the same reader.
- **Connect calls Vercel while the person waits** (ADR-0008, new on main): `domain.add` is an attempt row committed
  before the request, so the records show at once; removal stays an outbox kind (it is days later, D2·7).
- **Screens follow mockup v2** (https://claude.ai/artifact/XrDQj61tSBe4YKvUrH76xt, owner asked 2026-11-09 for ease
  and smooth transitions; awaiting approval): one Addresses list, a dialog/sheet that polls every 15 s while open,
  the DNS provider read from NS (no question), Open <provider> DNS, Send on WhatsApp, Make main as Publish (1.3 s,
  popup, Undo 8 s). **Approved by the owner 2026-11-09**; design rules 72–76.
- **Rename of a shop taking live payments** (owner didn't choose; default taken): the rename confirm gains one line,
  "Card and UPI payments need Razorpay to approve the new address." Renaming is not blocked.
| Task | What | Verify |
|---|---|---|
| D2·0 | **Done 2026-11-09** (frata-integrations 1.15.0 § Razorpay): live payments fail from a website not registered on the shop's own Razorpay account — an own domain AND `<slug>.frrata.shop`. Dashboard › Account & Settings › Business website detail; additional websites only in the e-commerce category, manual review ~24–48 h; no API to read them, so the merchant confirms. → **D1·8** below, and Connect's Connected step shows "Add to Razorpay"; **Make main needs "Razorpay approved it"** while the shop takes live payments | `frata-integrations` |
| D2·1 | **HSTS split** in next.config with `has: host` rules: `includeSubDomains` only for the console host and `*.SHOP_DOMAIN`; the default (own domains) `max-age=31536000` without it. Check Vercel's own default HSTS. Ships before any own domain is attached | e2e 12 per host |
| D2·2 | Migration 0070 `shop_domains`: **id PK**; unique `(tenant_id, host) where removed_at is null`; unique `(host) where proved_at is not null and removed_at is null`; **token = 128 random bits per row**, never derived from the host and never changed by another shop's action; timestamps claimed/proved/added/dns_ok/cert_ok/failing_since/parked/main/removed + removed_reason/by; CHECK host lowercase, no trailing dot, not under `frrata.*`, `frata.*`, `vercel.app`, the console host. frata_app: select own rows only; **every write through definers**; frata_admin: select + `update(removed_*)`. `tenant_domains` rows moved in as **removed** (never as proved); `app_tenant_for_host` dropped one migration later | `verify:tenancy`: A can't read or prove B's row; B's claim on A's live host leaves A resolving and A's token unchanged; checking with A's token value doesn't prove B |
| D2·3 | Pure `src/domains/addresses/domains.ts`: `normaliseDomain` (Zod `.max(253)` first; lowercase; no scheme/path/port/`@ / : \ * _`/space; labels ≤ 63; no all-digit TLD; ASCII only, no `xn--`; not an IP; refuse `*.vercel.app`, console, `frrata.*`, `frata.*`, `.local`, `.internal`, `.test`, `.onion`, blocked domains; PSL-aware: refuse a bare suffix — `tldts`, server-only, one line in the plan on why); `stateOf(row, now)` → one tuple of badges (Main · Connected · Waiting for records · Securing · Not working · Disconnected) used by Words, rule 68 and the stress table alike; the 4-host cap | vitest table |
| D2·4 | `src/lib/connectors/vercel/` (the one owner of the token: Production only, Sensitive, read in `env.ts`; refuse any base URL but `api.vercel.com`; never log a response body): add (with Vercel's own `www` → apex redirect at add time), verify, config, remove, through `fetchWithTimeout`. **Only add and remove are outbox kinds**; `drainSoon()` called after enqueue; config is a direct read. 409 counts as success only for "already on this project"; "in use by another account" shows the `_vercel` TXT and never sets `added_at` | unit with a fake; int: outbox row per add/remove |
| D2·5 | `src/lib/connectors/dns/`: TXT of `_frrata.<apex>` over DoH (Cloudflare and Google must agree); `redirect: 'error'`; 64 kB cap; answer name must equal the query; store yes/no, never the strings; an error or 429 is "unknown" and never starts the 24 h or 15-day clocks | unit with a fake resolver |
| D2·6 | Definers: `app_claim_domain` (owner/admin or partner-before-handover as a named tuple `CAN_MANAGE_ADDRESS`, re-checked in SQL; support visits refused; 10 a day a shop); `app_prove_domain` — a proof matches **only its own row's token**; if another shop holds the host live: moves only when **both resolvers see the new token and neither sees the old one**, and a **main** domain waits **72 h** with its owner told (owner call 3) — then, in one locked statement, the old row gets removed_* and its `main_at` cleared, and the old shop's notice and cache refresh are written as outbox rows under that shop; both tokens visible → a dispute in Admin, no flip-flop; one live owner per apex (`www.` moves with it). `app_make_main` requires `cert_ok_at` | int per rule (squat, real owner, both visible, 72 h hold) |
| D2·7 | **Removal parks first** (security H1): a removed or moved host stays on our project serving nothing (the lookup never serves an unproven/removed row) until the check sees A and CNAME pointing away from Vercel for 3 days in a row; only then `domain.remove` — and the sender re-checks in the database that **no other shop holds that host live** (tenancy C2) | int: B drops its claim on A's live host → Vercel never called |
| D2·8 | The check (on Hobby: daily, plus Check records on demand; on Pro: every 10 min the first day after a claim, hourly after; batch × runs written down against ≤ 500 config reads a minute): a definer returns only `(tenant_id, host)`, writes per shop inside `withTenant`; **redirect only while the last check shows the domain on our project** — A, CNAME or TXT gone → fall back at once; the 24 h grace is for resolver or certificate errors only; detach after 15 days without proof | int with a fixed clock |
| D2·9 | The main address everywhere (via D1·4's one reader): canonical, Open Graph, structured data, sitemap, robots, Make a link, Copy link; analytics `ownHosts` = every host of the shop | e2e 05, 51, 52 |
| D2·10 | Screens (spec § Words, one badge tuple): Your domains, Connect 1–3, Make main, the Not working banner (read in the layout's existing transaction), "Keep these records" (a limit: the 15-day detach), states for 4 of 4 hosts, Vercel down, phone | e2e 52 with `e2e/fakes/vercel.mjs` + `dns.mjs`; 90-ux |
| D2·11 | Admin: domains on the Addresses tab (Disconnect with reason, Retry), Domain health, disputes | admin int; e2e 90 |

## T·1 — Trust and safety (beside D·2, before the first real shop; a lawyer reviews Terms and AUP)
| Task | What | Verify |
|---|---|---|
| T1·1 | Terms, Acceptable Use Policy, Frrata's grievance officer page (from Frrata's own settings), on the console host | e2e |
| T1·2 | `/report` and the rights-holder form: Turnstile (owner call 4: a Cloudflare script on the console origin; `/start` nonce) with Siteverify checking success, hostname and action, failing closed; `ipBucket` rate limit, fail closed; page ≤ 2,048 chars (shown as text, never fetched), details ≤ 5,000; the shop inserted through a definer; **no email to a typed address** (at most one confirmation per address hash a day, if ever); reporter data kept 180 days | e2e with a Turnstile fake |
| T1·3 | `ts_cases` (frata_admin only; `frata_app` reading it fails), `shop_restrictions` (frata_app **select only**; composite FK `(tenant_id, product_id)`); the merchant reads and replies through `app_my_cases()` (reference, kind, Admin's reason, page — never the reporter's text) and `app_case_reply(...)` | `verify:tenancy` proofs |
| T1·4 | Enforcement: hide a product, freeze, close — in the same action invalidate `shop:`, catalogue and `host:` tags; place-order and Razorpay order creation check `shop_restrictions` **uncached** in their transaction; a hidden product's photos and OG image deleted from Blob (a private copy kept 180 days); frozen/closed answers "This shop is unavailable." on **every** name and domain; orders already placed stay fulfillable and refundable (a defined set of console actions, not "read-only") | e2e: freeze → shop page, photo URL 404, an order still ships |
| T1·5 | Admin › Trust and safety queue with clocks (order 3 h, intimate 2 h, unlawful 36 h, other 7 days), Hide · Freeze · Close · Take down now (admin role, reason ≤ 500; aal2 not chosen, owner call 5) | admin int; e2e 90 |
| T1·6 | Signals: new-shop watch (30 days), Web Risk daily per host (price rechecked first), Search Console Domain property (owner); the quarterly advisory (a console notice until messaging E·1) | unit + int |

## Practices recorded in skills (same commits)
- `frata-architecture`: a shop's address comes from one reader (`addressFor` over `app_shop_for_host`); a host is a
  shop's only after its own row's TXT proof; definers change beside, never in place; HSTS includeSubDomains only for
  hosts named by us; removal parks before it removes.
- `frata-design-language`: rules 67–71 (landed), and the one badge tuple from `stateOf`.
- `frata-verify`: e2e fakes for Vercel, DoH and Turnstile; testing hosts on the local stack.
- `frata-integrations`: Vercel token scope, Razorpay website check, Web Risk price.

## Repetitive work → agents and scripts
| Repeated by hand | Becomes |
|---|---|
| Checking a domain from behind the proxy | `scripts/check-domain.mjs <host>` (DoH NS/A/TXT + Vercel config) |
| Production migrations through the Supabase tool | `scripts/prod-migrate.mjs` (built with 0064) |

## Reviews (2026-11-08) — folded in above
- **Tenancy (FIX BEFORE MERGE):** row per claim with its own token (C1); remove re-checks other shops (C2); the move
  as one definer with the old shop's notice and refresh (H3); retired names refused by every creator (H4); refresh
  all hosts of both shops (H5); merchants' case read and reply through definers (H6); grants, check per shop, moved
  rows as removed, Admin release as a definer, short cache on own-domain redirects, `/orders` never cross-host,
  re-revokes, restrictions select-only (M7–M13).
- **Architecture (CHANGES NEEDED):** one trigger for names (B1); id PK (B2); new definers beside old (B3); facts-only
  definer + pure `addressFor` (B4); Vercel Pro and a real schedule (M5); 307 to own domains (M6); park before remove
  (M7); renames counted from the first opening (M8); SQL enforces the limit (M9); Frrata renames don't redirect and a
  freeze column (M10); `RESERVED` stays in code (M11); D1·0, T·1 beside D·2, Razorpay first (M12); defined actions
  for a frozen shop (M13); `/api` on any live host, new cache key (M14); HSTS in next.config, `tldts` justified,
  `connectors/`, the sign-up flow first, one badge tuple, "Keep these records" visible.
- **Security (FIX BEFORE MERGE):** park before remove (H1); id PK and per-row token (H2); Vercel token scope,
  Production-only and Sensitive, S1 first (H3); a 72 h hold and both-resolvers rule for moving a main domain (M1);
  redirect only while on our project, encoded targets, `makeMain` needs the certificate (M2); Frrata renames don't
  redirect, frozen answers unavailable everywhere (M3); takedown reaches caches and photos (M4); aal2 before Admin's
  new powers (M5); PSL before D·2 and no shop cookies or pixels until then (M6); tuples, caps, DoH hygiene, HSTS
  default, Vercel 409, report form limits (L1–L6).

## Owner calls — decided 2026-11-08
1. **Vercel Pro before D·2: yes.** D·1 builds now on Hobby; D·2 waits for Pro and a frequent schedule (`vercel.json`).
2. **307 redirects to an own domain: yes.** Canonical and sitemap carry the SEO.
3. **A 72-hour hold before a main domain moves** to a shop that proves it, the current owner told: yes. A non-main
   domain moves at once (both resolvers, old token gone).
4. **Turnstile on sign-up and /report: yes** (rule 44 exception: one Cloudflare script on those pages).
5. **Admin two-step sign-in (aal2): not chosen.** Accepted risk (owner, 2026-11-08): Admin's rename, freeze,
   disconnect and takedown sit behind the emailed sign-in code (S5 stays open). Mitigations kept: admin staff role only
   for close and takedown, a required reason, Admin › Activity for every action.
6. **Dedicated Vercel token: not chosen.** Accepted risk: the domains token is a team token. Mitigations kept:
   Production only, Sensitive, read in `env.ts`, base URL fixed to `api.vercel.com`, never logged.
