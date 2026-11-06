---
name: frata-verify
description: Use before saying a Frata change works - to run the gates, typecheck, tests and production build, prove tenant isolation on a real Postgres, run the built app locally against that database with storefront and console Host headers, and exercise webhooks and cron with curl.
metadata:
  version: 1.0.0
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

```bash
S=<scratchpad>/pg; B=/usr/lib/postgresql/16/bin
mkdir -p $S && chown -R postgres $S
su postgres -c "$B/initdb -D $S/data -A trust -U postgres && $B/pg_ctl -D $S/data -o '-p 54329 -k $S' -l $S/log start"
psql -h localhost -p 54329 -U postgres -c "create database frata_proof"
ADMIN_URL=postgres://postgres@localhost:54329/frata_proof npm run verify:tenancy
```

`verify:tenancy` applies every `drizzle/*.sql` and runs `scripts/verify/tenancy.sql`:
no tenant → no rows; A sees only A; the setting ends with the transaction; A
cannot write into B (orders, outbox); host and membership lookups; API roles
denied; `frata_app` has no BYPASSRLS. Changed a policy? Also break it on purpose
(e.g. disable RLS on a table) and confirm the proof fails.

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
