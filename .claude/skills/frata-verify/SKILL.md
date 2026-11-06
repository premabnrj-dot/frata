---
name: frata-verify
description: Use before saying a Frata change works - to run the gates, typecheck, tests and production build, prove tenant isolation on a real Postgres, run the built app locally against that database with storefront and console Host headers, and exercise webhooks and cron with curl.
metadata:
  version: 1.2.0
  verified: 2026-11-06
  covers: ["scripts/verify/**"]
---

# Frata verify

"Should work" is not a result. Run it, read the output, then say it.

## Every change

```bash
npm test            # all gates, then vitest
npm run typecheck
npm run build       # postbuild: check:client-bundle
```

A gate you added: plant a violation and watch it fail before trusting it.

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

`verify:tenancy` applies every `drizzle/*.sql` and runs `scripts/verify/tenancy.sql`:
no tenant → no rows; A sees only A; (13 checks, incl. support visits, invites, both roles' reach, no API-role EXECUTE on any app_* function; the setting ends with the transaction; A
cannot write into B (orders, outbox); host and membership lookups; API roles
denied; `frata_app` has no BYPASSRLS. Changed a policy? Also break it on purpose
(e.g. disable RLS on a table) and confirm the proof fails.

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

## The built app, locally

```bash
DATABASE_URL=postgres://frata_app@localhost:54329/frata_proof NEXT_PUBLIC_CONSOLE_HOST=app.frata.in npx next start -p 3123
curl -H 'Host: proof-a.frata.test' localhost:3123/            # storefront by host
curl -o /dev/null -w '%{http_code}' -H 'Host: nobody.example' localhost:3123/   # 404
curl -o /dev/null -w '%{http_code}' -H 'Host: app.frata.in' localhost:3123/s/x  # 404
```

Webhook with a real signature (twice — one row expected):

```bash
B='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}'
SIG=$(printf '%s' "$B" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST -H "x-razorpay-signature: $SIG" --data-raw "$B" localhost:3123/api/webhooks/razorpay
```

## In a browser

Playwright is pre-installed in cloud sessions (`require('playwright')`). Signed-in
console flows need a Supabase project; until then, verify panels and storefront
pages, and screenshot at phone width (390px) as well as desktop.

## After deploy

Check the Vercel deployment's build log and runtime errors (Vercel MCP:
`get_deployment`, `get_runtime_errors`) — not just that it went green.
