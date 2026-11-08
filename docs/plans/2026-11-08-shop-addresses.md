# Plan — Shop addresses: names, own domains, trust and safety
Status: draft (plan review pending) · Date: 2026-11-08 · Spec: `docs/specs/2026-11-08-shop-addresses.md` (approved by the
owner 2026-11-08, with the note "no descriptions or clarifications": spec § Words on screen) · Research:
`docs/research/2026-11-08-shop-addresses.md`. D·0 is live (frrata.shop, main bce936b).

Gates on every task: `npm test`, `npm run typecheck`, int tests with `INT_DB_HOST`, `verify:tenancy` for every
migration, `impact-reviewer` on the task's diff, e2e for the flows it touches. A `claude/**` push never deploys; main
deploys production. Migrations start at **0064** (main holds 0063).

## The regression net, first (before any change)
| Changes | Net |
|---|---|
| Host → shop lookup, redirects | `host.test.ts` (routeFor, shopSlugFromHost, platformHost); e2e `12-security` (bare domain 307, a shop opens); new e2e `52-addresses` written first with the D·1/D·2 steps marked pending |
| The rename path | e2e `40-partners` and `01`/sign-up flows that pick an address; `slug.test.ts` |
| Canonical, sitemap, robots | e2e `05-shop-look` (HTML) gains: canonical and sitemap use the main address |
| Admin merchant pages | `admin.int.test.ts`; e2e `90-ux` (Admin pages measured) |
| Every shop request | e2e `10-checkout`, `13-paging`, `51-analytics` (storefront through the host) |

## D·1 — Names (renames after opening, redirects, the names list)
| Task | What | Verify |
|---|---|---|
| D1·1 | Migration 0064 `shop_names` (name PK, tenant_id, created_at, retired_at; one current per shop: partial unique `(tenant_id) where retired_at is null`), backfilled from `tenants.slug`; `blocked_names` (name PK, kind reserved/protected/offensive/held, reason, by, at) seeded from `RESERVED`; grants, RLS (frata_app reads its own `shop_names`; `blocked_names` readable by definers only), policies; frata_admin select/insert/update with reasons | `verify:tenancy` + new proofs: A can't read B's names; the app can't insert a name; a retired name can't be taken by another shop |
| D1·2 | Pure `src/domains/addresses/names.ts`: `nameProblem(name, {blocked})` (shape via `slugProblem` + blocked + `xn--`), `renamesLeft(history, openedAt)` (free before opening, 2 after), `redirectFor(host, names)`. Tests: table of names, the two-change limit, retired names | vitest |
| D1·3 | `app_change_shop_address` replaced (0064): before opening as today; after opening only if `renamesLeft > 0`; retires the old name (`retired_at`), inserts the new, mirrors `tenants.slug`, audit row; refuses blocked or ever-used names; `app_tenant_for_slug` returns the shop **and whether the name is current** | int test: rename after opening, third rename refused, old name still resolves with `current = false`, another shop can't take it |
| D1·4 | Redirects: the shop lookup (`tenantForHost`, cached 60 s, tag `host:<h>`) returns `{ id, current }`; an old name 308s to the current address with the same path (in the shop layout from the cached lookup, never a DB call per request); `refreshHosts` on rename invalidates both | e2e 52: rename after opening → old address 308s to the new, path kept |
| D1·5 | Settings › Shop address after opening: Change with "N changes left" (spec § Words); staff read-only; support visit disabled | e2e 52 + 90-ux at 390 px |
| D1·6 | Admin › Merchant › Addresses: names (current + old), **Rename Kesar Studio's address** (reason, ignores the limit), **Freeze address changes**; Admin › Names: add/remove blocked, release a held name (reason) | `admin.int.test.ts`; e2e 90 Admin pages |

## D·2 — Own domains (connect, check, main, fallback, detach)
| Task | What | Verify |
|---|---|---|
| D2·0 | **Fix first:** HSTS split — `max-age` with `includeSubDomains` only on the console host and `*.SHOP_DOMAIN`; own domains get `max-age=31536000` without it (headers chosen per host in the middleware for shop hosts) | e2e 12: a shop on frrata.shop keeps includeSubDomains; an own-domain host (fake) doesn't |
| D2·1 | Migration 0065 `shop_domains` (host PK, tenant_id, apex, token, claimed_at, proved_at, added_at, dns_ok_at, cert_ok_at, failing_since, main_at, removed_at, removed_reason, removed_by); one main per shop (partial unique); `tenant_domains` rows moved in, then dropped; `app_tenant_for_host` reads `shop_domains` (proved, added, not removed) and returns `{ id, main_host }` | `verify:tenancy`: A can't read or claim B's domain; a claimed-but-unproved host resolves to nothing |
| D2·2 | Pure `src/domains/addresses/domains.ts`: `normaliseDomain` (lowercase, no scheme/path/port, ASCII only, no `xn--`, not an IP, not frrata.*, PSL-aware: refuse a bare suffix like `co.in`), `stateOf(row, now)` from timestamps, `mainHostFor(shop, domains)`, `shouldFallBack(now)` (24 h), `shouldDetach(now)` (15 days without proof), the 4-host cap | vitest table |
| D2·3 | `src/lib/domains/vercel.ts` (the one owner of `VERCEL_DOMAINS_TOKEN`, team-scoped): add, verify, config, remove through `fetchWithTimeout`; outbox kinds `domain.add`, `domain.remove`, `domain.check` (ADR-0006); 409 "already on this project" = success | unit with a fake; int: an outbox row per call |
| D2·4 | `src/lib/domains/dns.ts`: TXT lookup of `_frrata.<apex>` over DNS-over-HTTPS (Cloudflare and Google; both must agree), `fetchWithTimeout`, no caching across shops | unit with a fake resolver |
| D2·5 | Actions: `connectDomain` (owner/admin/partner-before-handover; Zod; 10 a day a shop), `checkDomain` (one per 30 s), `makeMain`, `removeDomain`; the proof wins rule (a fresh proof from another shop moves the domain; the previous shop's row gets `removed_reason = 'proved elsewhere'`) | int tests per rule; `security-reviewer` |
| D2·6 | The daily check (cron after the outbox drain): config + TXT for every connected domain at ≤ 500 config reads a minute; fallback after 24 h failing; detach after 15 days without proof; each change refreshes `host:` tags | int test with a fixed clock |
| D2·7 | The main address everywhere: canonical, Open Graph, structured data, sitemap.xml, robots.txt, Make a link, Copy link read `mainHostFor`; non-main hosts 308 to the main one (same path); analytics `ownHosts` = all the shop's hosts | e2e 05 (canonical), 51 (attribution ignores own hosts), 52 |
| D2·8 | Settings screens (spec § Words): Your domains, Connect 1–3, Make main dialog, the Not working banner on every console page for owners/admins | e2e 52 with a fake Vercel and a fake DNS (`e2e/fakes/vercel.mjs`, `dns.mjs`); 90-ux |
| D2·9 | Admin: Addresses tab domains (Disconnect with reason, Retry), Admin › Domain health | e2e 90; admin int |
| D2·10 | Razorpay check: confirm whether a merchant's registered website domain matters for Standard Checkout on an own domain (integration-researcher) | recorded in `frata-integrations` |

## T·1 — Trust and safety (needs a lawyer's review of the Terms and AUP before the first public shop)
| Task | What | Verify |
|---|---|---|
| T1·1 | Pages on the console host: Terms, Acceptable Use Policy, Frrata's grievance officer (from Settings of Frrata itself, not hard-coded), `/report` (Turnstile, Siteverify on the server, rate-limited by IP; no email to a typed address until confirmed), the rights-holder form | e2e: report filed → reference shown; Turnstile fake |
| T1·2 | Migration `ts_cases` (platform table, `frata_admin` only; tenant_id nullable for unknown hosts; kind, clock_due_at by kind: order 3 h, intimate 2 h, unlawful 36 h, other 7 days; events), `shop_restrictions` (tenant_id, product_id null, kind hide/freeze/close, reason, by, at, lifted_at) readable by the shop | `verify:tenancy`: a shop reads its own restrictions only, never cases or reporters |
| T1·3 | Enforcement: a hidden product 404s on the shop and shows "Hidden by Frrata: <reason>" in the console; a frozen shop renders "This shop is unavailable." (orders already placed still work; console read-only with Reply); closed = frozen + domains removed | e2e: freeze → shop page; console banner; an order page still works |
| T1·4 | Admin › Trust and safety: the queue with clocks, actions (Hide · Freeze · Close · Take down now) each with a reason; the merchant's Reply reopens the case | admin int; e2e 90 |
| T1·5 | Signals: new-shop watch (30 days) with words (protected-name distance, product words "first copy / replica / 7A / master copy", price far below, many shops from one email domain/IP, disposable email, no Razorpay, no GSTIN); Web Risk daily per shop host (outbox kind `webrisk.check`); Search Console Domain property on frrata.shop (owner step) | unit (signals); int (watch list) |
| T1·6 | The quarterly advisory to merchants (a notice; until messaging E·1, a console banner logged as sent) | int |

## Practices recorded in skills (in the same commits)
- `frata-architecture`: a shop's address is built by `platformHost`/`shopHost` only; a host becomes a shop's only
  after its TXT proof; the main address comes from `mainHostFor`; HSTS includeSubDomains never on an own domain.
- `frata-design-language`: rules 67–71 (landed with the approval).
- `frata-verify`: e2e fakes for Vercel and DNS; how to test a host on the local stack.
- `frata-integrations`: Vercel domains (done), Razorpay website check (D2·10), Web Risk price.

## Repetitive work → agents and scripts
| Repeated by hand | Becomes |
|---|---|
| Checking a domain's DNS and certificate from a session behind the proxy | `scripts/check-domain.mjs <host>` (DoH for NS/A/TXT, Vercel config through the API) |
| Production migrations through the Supabase tool | `scripts/prod-migrate.mjs` (listed since Analytics; built with 0064) |

## Questions for the plan review
1. Redirect for an old name or a non-main domain: in the shop layout from the cached lookup (a cached 308 page per
   path) or in the middleware (needs a host → main map without a DB call). Proposal: layout, measured by
   `speed-reviewer`.
2. `blocked_names` readable by the app only through a definer (`app_name_problem(name)`), so the list never ships to
   a browser.
3. The Vercel token's scope: team token restricted to project `frata` if Vercel allows; else a separate team member.
