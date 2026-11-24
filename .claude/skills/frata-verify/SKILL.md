---
name: frata-verify
description: Use before saying a Frata change works - to run the gates, typecheck, tests and production build, run the end-to-end browser flows (npm run e2e), check a mockup, prove tenant isolation on a real Postgres, run the built app locally against that database with storefront and console Host headers, and exercise webhooks and cron with curl.
metadata:
  version: 1.13.1
  owner: owner
  verified: 2026-11-23
  covers: ["scripts/verify/**", "e2e/run.mjs", "e2e/stack.mjs", "scripts/check-mockup.mjs"]
---

# Frata verify

"Should work" is not a result. Run it, read the output, then say it.

## Every change

```bash
npm test            # npm run gates (the list: npm run gates:list), then vitest
npm run typecheck
npm run build       # postbuild: check:client-bundle, check:storefront-build (shop and Console JS budgets), check:pdf-trace
npm run weight -- /console/brand   # after a build: what one page loads first, heaviest first, which components bring each file
```

A gate you added: plant a violation and watch it fail before trusting it. Before every `git commit` the pre-bash hook
(`scripts/hooks/pre-bash.mjs`) runs `npm run gates` and stops the commit on a failure; `Gates: skipped — <why>` in
the message is for a `main` that is already red, not for this commit's own failure.

A skill's or review agent's behaviour changing in meaning (a major version)? Run its evals first and commit the
result: `npm run eval -- <skill-or-agent> --judge --record` (scenarios in the skill's `evals/` or
`.claude/agents/evals/<agent>/`; results in `docs/evals/`). Read-only, two model calls a scenario.

- **A definer gets a parity test against the app-side count** (offers O·4): whatever a SECURITY DEFINER function
  restates (`app_admin_offer_totals` restates the offer-use rule), an int test runs it and the app's own function
  (`discountUses`) on the same rows and asserts they agree. `verify:tenancy` asserts a write changed exactly the rows
  it should (check 36: a stop changes one row).

## A throwaway Postgres (this container has PostgreSQL 16)

Put it in `/var/tmp`, not the scratchpad: the sandbox resets the scratchpad's
parent permissions and Postgres then PANICs on its own data directory.

```bash
D=/var/tmp/frata-pg; B=/usr/lib/postgresql/16/bin
mkdir -p $D && chown postgres $D
su postgres -c "$B/initdb -D $D/data -A trust -U postgres && $B/pg_ctl -D $D/data -o '-p 54330 -k $D' -l $D/log start"
psql -h localhost -p 54330 -U postgres -c "create database frata_proof"
ADMIN_URL=postgres://postgres@localhost:54330/frata_proof npm run verify:tenancy
INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx vitest run src/lib/admin   # Admin library, real roles
```

`verify:tenancy` applies every `drizzle/*.sql` and runs `scripts/verify/tenancy.sql`. It then recreates
`<name>_analytics` on the same server (the URL's user must be able to create databases and reach `<server>/postgres`,
or set `ANALYTICS_ADMIN_URL`), applies `drizzle-analytics/*.sql`, and runs `scripts/verify/analytics-tenancy.sql`. That
proof has 13 catalog-driven checks: RLS everywhere; exact grants; definers; ingest isolation; top-N within a shop; a
fold across midnight; retention. The main proof:
no tenant → no rows; A sees only A; (13 checks, incl. support visits, invites, both roles' reach, no API-role EXECUTE on any app_* function; the setting ends with the transaction; A
cannot write into B (orders, outbox); host and membership lookups; API roles
denied; `frata_app` has no BYPASSRLS. Changed a policy? Also break it on purpose
(e.g. disable RLS on a table) and confirm the proof fails.

## Studio's agent — never the live API (V3a, 2026-11-23)

Every test of Studio's runtime runs against the fake Managed Agents server `e2e/fakes/anthropic.mjs` (vaults, files,
budgets with the pause and the settle-only rule, cursor-listed events, one idle a round; the person's words script the
agent: "accent", "logo", "facts", "preview", "two", "expensive"). Unit tests start it in-process; the e2e stack runs it on
loopback (`PORTS.anthropic`) and sets the Studio settings for `next start`; a flow fails its next call of a path with
`POST /_test/fail`. Its clock follows real time: a turn adopts only a message created no earlier than it was sent.

```bash
# the throwaway Postgres above, its role passwords set (alter role frata_app/frata_admin/frata_builder password 'x')
INT_DB_HOST=localhost:54330 ADMIN_URL=postgres://postgres@localhost:54330/frata_proof npx vitest run src/lib/studio   # or 54340, the e2e stack's cluster
npm run e2e -- --only studio-agent,studio     # the live screen on the fake, and the workbench fixture
```
The int tests share one database: `runStudioCron(…, onlyStore)` keeps a file's cron to its own store, and each file ends
its store's sessions after (the open-session cap is platform-wide). Run them on a **fresh** database: a reused one keeps ended
sessions of earlier runs whose fake is gone, their clean-up fails every minute and fills the cron's 20 a kind, so this
run's sessions are never cleaned (the plan's residual, seen in a test). Live runs happen only in `frata-studio-eval`.

## Live proof on Supabase (nothing kept)

`verify:tenancy` inserts rows, so never run it on a real project. On Supabase,
run this through `execute_sql`: it grants the switch into `frata_app` (Postgres 17
does not give the creator SET), proves the policies, and RAISES at the end so the
grant and the rows roll back. "PROOF PASSED (all rolled back)" as the error is
the pass; then confirm `tenants`/`orders` counts are unchanged.

```sql
do $$ declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n int; begin
  execute 'grant frata_app to postgres with inherit false, set true';
  insert into tenants (id, slug, name) values (a,'proof-a-'||a,'A'), (b,'proof-b-'||b,'B');
  insert into orders (tenant_id, number, payment_method, net_revenue, placed_at) values (a,1,'cod',1,now()), (b,1,'cod',1,now());
  execute 'set local role frata_app';
  select count(*) into n from orders; if n <> 0 then raise exception 'FAIL no-tenant sees %', n; end if;
  perform set_config('app.tenant_id', a::text, true);
  select count(*) into n from orders; if n <> 1 then raise exception 'FAIL A sees %', n; end if;
  begin insert into orders (tenant_id, number, payment_method, net_revenue, placed_at) values (b,9,'cod',1,now());
    raise exception 'FAIL A wrote into B'; exception when insufficient_privilege then null; end;
  raise exception 'PROOF PASSED (all rolled back)';
end $$;
```

Then `get_advisors` security and performance.

## End to end (`npm run e2e`) — before saying a flow works

The browser flows in `e2e/flows/` run against a local stack the runner boots
itself (throwaway Postgres, migrations, `e2e/seed.sql`, fake auth, fake
Razorpay, production build): `e2e/README.md`. CI runs them too. Rules:

- A plan touching a flow adds or extends its flow BEFORE the change (the
  regression net), and proves it by planting the bug and watching it go red.
- Every bug fixed gets a step that fails without the fix.
- Assert on the database as well as the screen when money, stock or state moves.
- Wait on what the page shows, never a sleep; a flaky step is fixed at once
  (2026-11-07: reading a code block before it rendered made one step flaky).
- Staff passkeys (2026-11-12): `signedIn` seeds a passkey step-up for anyone already in `platform_staff` (test data
  in the throwaway database; the app has no switch). `75-staff-passkeys` drives the real check with Chromium's virtual
  authenticator (`WebAuthn.addVirtualAuthenticator` over CDP) — the way to test any passkey change.
- Sign-in by code (O1·9): the fake auth signs in the `USERS` person whose email is sent with code `246810` (any other
  code is refused as expired), so a flow can drive the emailed-code path; the link path stays `e2e-<who>-…`.
- The `e2e-runner` agent runs it and reads the screenshots (phone and desktop).
- Before publishing a mockup: `node scripts/check-mockup.mjs <file>`.

## The built app, locally

```bash
DATABASE_URL=postgres://frata_app@localhost:54329/frata_proof NEXT_PUBLIC_CONSOLE_HOST=app.frata.in npx next start -p 3123
curl -H 'Host: proof-a.frata.test' localhost:3123/            # storefront by host
curl -o /dev/null -w '%{http_code}' -H 'Host: nobody.example' localhost:3123/   # 404
curl -o /dev/null -w '%{http_code}' -H 'Host: app.frata.in' localhost:3123/s/x  # 404
```

Webhook with a real signature (twice — one row expected). Each shop has its own
URL and secret (Settings → Online payments shows both until the first event):

```bash
B='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_x","status":"captured","amount":249000,"currency":"INR"}}}}'
SIG=$(printf '%s' "$B" | openssl dgst -sha256 -hmac "$SHOP_WEBHOOK_SECRET" | awk '{print $2}')
curl -X POST -H "x-razorpay-signature: $SIG" --data-raw "$B" localhost:3123/api/webhooks/razorpay/$WEBHOOK_KEY
```

Checkout end to end (1C): run the app with `PAYMENT_KEYS_SECRET=<any>` and
`RAZORPAY_API_BASE` pointing at a local stand-in for Razorpay's API (keys check,
orders, an order's payments), serve a stand-in `checkout.js` with
`context.route('https://checkout.razorpay.com/v1/checkout.js', …)`, and reach the
shop host with Chromium's `--host-resolver-rules`. Cover: COD, paid online, a
dismissed payment switched to COD, a late capture after the switch (paid wins,
stock taken once), a price change mid-checkout, a double submit. Then
`SHOP_HOST=… PATHS="/ /checkout /bag /orders" npm run check:payload`.

## Speed proof — before saying a change is fast enough (2026-11-08)

1. Seed one shop at 10× (600 products × 5 variants × 5 images, 150k orders and
   lines) in the throwaway Postgres: `scripts/verify/seed-10x.sql` into a fresh `frata_speed` database (apply the
   migrations, `alter role frata_app password 'x'`). A page that reads a window of orders also runs its timing test
   there (`SPEED=1 INT_DB_HOST=localhost:54330 npx vitest run analytics-speed --silent=false`) and EXPLAINs its reads.
2. `ALTER SYSTEM SET log_statement='all'; select pg_reload_conf();`
3. Kill the server (`pkill -f next-server`; a pkill on "next start" misses it),
   then clear `.next/cache/fetch-cache` and `.next/server/route-cache`.
4. Curl each changed shop page twice with its Host header, and record:
   - the statements on the cold visit, and any that repeat;
   - TTFB, cold and warm;
   - the HTML and `.rsc` bytes;
   - the largest file in `fetch-cache`.
5. Compare every number with `frata-architecture` § Speed. EXPLAIN ANALYZE each
   query the change adds.
6. Write the numbers in the commit or the spec.

## Header and cookie proof — before claiming a security fix

- `curl -sI` a console page, a shop page, `/console/theme-preview/*` and `/console/preview` (both SAMEORIGIN on the
  console host only). Read the
  CSP, X-Frame-Options and the `Set-Cookie` flags (HttpOnly, Secure, SameSite,
  Max-Age).
- Send a POST from another Origin to each changed route: expect 403.
- Send an oversized webhook body: expect 413.
- Run the action as each role the tuple excludes: expect a refusal.

## In a browser

Playwright is pre-installed in cloud sessions (`require('playwright')`). Signed-in
console flows need a Supabase project; until then, verify panels and storefront
pages, and screenshot at phone width (390px) as well as desktop.

## After deploy

Check the Vercel deployment's build log and runtime errors (Vercel MCP:
`get_deployment`, `get_runtime_errors`) — not just that it went green.
