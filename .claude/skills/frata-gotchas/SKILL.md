---
name: frata-gotchas
description: Use when something in Frata fails in a way that makes no sense - a page that runs behind a layout that refused, npm "Cannot read properties of null (reading 'edgesOut')", "invariant expected layout router to be mounted", a forged session accepted, rows missing or visible across tenants, a migration that drizzle skips, Meta CAPI rejecting a whole batch, a Razorpay signature that never matches, a Tailwind duration class that does nothing, a test that cannot import server-only.
metadata:
  version: 1.10.0
  verified: 2026-11-07
---

# Frata gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `npm install` → `Cannot read properties of null (reading 'edgesOut')` | npm 10's arborist crashes on vitest 4's optional peers | `.npmrc` has `legacy-peer-deps=true`; keep it (Vercel reads it too) |
| "invariant expected layout router to be mounted" | `redirect()` from a layout during render | Redirect in `src/middleware.ts`; a layout renders a `Panel` |
| A page runs (and errors, or reads data) although its layout refused | Next renders layout and page in parallel; a layout's check guards nothing below it | Every page and action calls `requireMember` itself; it never throws |
| A forged auth cookie is accepted | `getSession()` trusts the cookie | `getUser()` only (`check:layers`) |
| A tenant query returns no rows | Not inside `withTenant`, or connected as a role whose policy does not match | Use `src/lib/queries/`; connect as `frata_app` |
| Rows of another tenant visible | Connected as `postgres` (bypasses RLS) or a table missing its policy | `DATABASE_URL` must log in as `frata_app.<ref>`; `npm run verify:tenancy` |
| One request sees another merchant's tenant id | A session-level `SET` on a pooled connection | `set_config(…, true)` — transaction-local — only, in `withTenant` |
| Console: "Something went wrong"; log `TypeError: Invalid URL` | `DATABASE_URL` password has `/`, `+`, `@` or `#` unencoded | Hex password (`openssl rand -hex 24`); `src/lib/db/url.ts` now fails without echoing the value. If a URL was ever logged, rotate the password |
| `[db] DATABASE_URL must log in as frata_app` | User part is `postgres.<ref>` or `postgres.frata_app.<ref>` | Exactly `frata_app.<ref>` |
| Every Admin page: "We could not load this screen"; log `(EAUTHQUERY) unsupported or invalid secret format` | `frata_admin` has no password (only frata_app was set), so Supabase's pooler refuses it | `alter role frata_admin with password '<hex>'`; same value in `ADMIN_DATABASE_URL`; Admin now shows this as a panel (`src/lib/admin/health.ts`) |
| `prepared statement "…" already exists` | Supabase pooler in transaction mode | `postgres(url, { prepare: false })` (already in `src/lib/db/index.ts`) |
| drizzle-kit silently skips a migration | Journal `when` not increasing | Fix `drizzle/meta/_journal.json` order |
| Meta CAPI: every event in a batch rejected | One `event_time` older than 7 days, or in ms | Drop > 7 days before batching; seconds |
| Razorpay signature never matches | Verified a re-serialised body | Verify `await request.text()` exactly as received |
| `duration-200` / `duration-base` does nothing | Tailwind v4 reads `--transition-duration-*`, not `--duration-*` | Use the tokens in `globals.css` |
| vitest: `This module cannot be imported from a Client Component` | `server-only` throws outside Next | `vitest.config.ts` aliases it to its empty build |
| A date reads 5½ hours early | Formatted on Vercel (UTC) without a zone | `src/lib/format-date.ts` only (`check:dates`) |
| `drizzle-kit generate` → "Interactive prompts require a TTY" | It wants to ask whether a dropped column was renamed to a new one | Generate in two steps: the drop alone, then the additions |
| Local Postgres PANIC "could not open … pg_control: Permission denied" | Data directory under the scratchpad, whose parents' permissions get reset | Use `/var/tmp/frata-pg` (frata-verify) |
| A new definer function is callable over Supabase RPC | Postgres grants PUBLIC EXECUTE by default; drop+create resets grants | `revoke all on function … from public, anon, authenticated` every time (proof check 13) |
| A gate flags the comment explaining it | The gate matched its own documentation | Gates skip comment lines; test a new gate on its own docs |
| A count subquery returns 0 (or the wrong rows) | In a ONE-table select, drizzle prints `${table.id}` inside `sql` as a bare `"id"`; inside `(select … from other o where o.x = "id")` that is `o.id` | Write the outer column out in full: `"product_types"."id"` (`src/lib/queries/catalogue.ts`) |
| "Set every price" fills only the last row | Many `onChange` calls in one event each spread the SAME stale state | Update with a function: `setD((x) => …)` |
| Phone page scrolls sideways though every table sits in `overflow-x-auto` | `sr-only` labels are `position: absolute` and escape a scroll box that is not positioned | Every scroll box is `relative overflow-x-auto` |
| React #418 "text" in production, now and then | A client component read `Date.now()`/`new Date()` while rendering; server and browser got different minutes ("just now" vs "1 min ago") | Render from `useNow()` (the page's time); `check:clock`; e2e with `page.clock.install` ahead of the server |
| A form loses its "Saved" message right after saving | The page passed `key={version}`, so `router.refresh()` re-created the form | No `key` from data that a save changes |
| Local run tests an old build after a rebuild | `pkill -f "next start"` misses the `next-server` child; the new server hits EADDRINUSE | `pkill -f "next-server|next start"`, then check the log says Ready |
| A shop page renders on every request though it has `revalidate` | A `[param]` segment with no `generateStaticParams` is a dynamic route in Next 15 | `export const generateStaticParams = () => []` on every segment (`check:storefront-build`) |
| A scheduled drop never appears / a pre-order never ends | `unstable_cache` kept a value computed with the clock | Cache raw rows (ISO dates); run `visibility()`/`availability()` at render |
| `/s/<other shop>/x.png` reaches a shop page | The middleware matcher skipped image-looking paths | Matcher `/((?!_next/static|_next/image).*)`; `routeFor` 404s `/s/` on non-shop hosts (`src/domains/tenancy/host.ts`). Next 15.5 is patched for the `x-middleware-subrequest` bypass (CVE-2025-29927) |
| Shop pages `private, no-store` though ISR and force-static | A MIDDLEWARE rewrite: Next matches the original path against the ISR routes | Rewrite the host in `next.config` (`shopRewrites`); root rule LAST, rules chain in order |
| A check that sends `Host:` with `fetch()` passes on the wrong page | undici drops a Host header silently | `node:http` request (`scripts/check-payload.mjs`), and assert the page names the host |
| `showModal` throws "already open" | The effect that opens a `<dialog>` depended on an `onClose` re-created each render | Open once (`[]` deps), keep the callback in a ref |
| A page with real data cannot answer 404 | `notFound()` renders `not-found.tsx`, which gets no props | Render the page with `robots: noindex` instead (archived products) |
| Local shop host in Playwright | Chromium resolves `*.frata.test` nowhere | `chromium.launch({ args: ['--host-resolver-rules=MAP *.frata.test 127.0.0.1:3077'] })`, build with `NEXT_PUBLIC_SHOP_DOMAIN=frata.test` |
| `The "string" argument must be of type string … Received an instance of Date` | A `Date` inside a drizzle `sql` template goes to postgres.js unserialised (column helpers like `eq()` are fine) | `${d.toISOString()}::timestamptz`. The rate limiter failed OPEN on this for every call until 2026-11-07 (`src/lib/db/rate-limit.ts`) |
| A list page is slow, or a test's `goto` never reaches load | `<Link>` prefetches every row link in view: 50 rows = 50 server renders per visit | Row links (`data-row-link`) take `prefetch={false}` (orders, products, collections; 2026-11-07) |
| React error #418 (hydration) on a page with an (i) tip | A `div` popover inside a `<p>` or label: the HTML parser closes the paragraph | Popovers that sit in text are `span`s (`src/components/ui/info-tip.tsx`) |
| A dialog's safe button does not get focus | React's `autoFocus` runs at mount, and a `<dialog>`'s content mounts while it is closed | Mark it `data-autofocus`; `Dialog` focuses it after `showModal` |
| An e2e build "fails" with no reason | `execSync`'s 1 MB output buffer kills the child | `maxBuffer: 64 MB` and the error's code printed (`e2e/stack.mjs`) |
| A value put in `history.state` is gone after a save, or a `router.push` is undone | Next replaces the entry on a server action or `router.refresh()` without keeping custom state (`preserveCustomHistoryState: false`), and a `history.back()` that lands before a pending push is a traverse, which discards the push | Never push a history entry for a Console dialog: Android's Back already closes a modal `<dialog>` (a close request, `cancel`) — `src/components/ui/dialog.tsx` |
| An opacity or transform read in e2e is "wrong" now and then | It read the first frame of a 120–320 ms transition | `waitForFunction` on the value, or open the context with `reducedMotion: 'reduce'` |
| Every stored Razorpay key stops opening ("not connected") | The key-derivation salt in `src/lib/crypto/secret-box.ts` ('frata') was changed, e.g. by the rename to Frrata | Never rename it; a known-token test pins it, and `check:name` allows it by name |
| Shoppers' bags, saved checkout forms or shortcut settings vanish | A localStorage key (`frata.bag.v1` and the like) was renamed | Keys are internal: they keep the old spelling (`scripts/check-name.allow.json`) |
