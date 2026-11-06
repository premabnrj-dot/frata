---
name: frata-gotchas
description: Use when something in Frata fails in a way that makes no sense - npm "Cannot read properties of null (reading 'edgesOut')", "invariant expected layout router to be mounted", a forged session accepted, rows missing or visible across tenants, a migration that drizzle skips, Meta CAPI rejecting a whole batch, a Razorpay signature that never matches, a Tailwind duration class that does nothing, a test that cannot import server-only.
metadata:
  version: 1.0.0
  verified: 2026-11-06
---

# Frata gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `npm install` → `Cannot read properties of null (reading 'edgesOut')` | npm 10's arborist crashes on vitest 4's optional peers | `.npmrc` has `legacy-peer-deps=true`; keep it (Vercel reads it too) |
| "invariant expected layout router to be mounted" | `redirect()` from a layout during render | Redirect in `src/middleware.ts`; a layout renders a `Panel` |
| A forged auth cookie is accepted | `getSession()` trusts the cookie | `getUser()` only (`check:layers`) |
| A tenant query returns no rows | Not inside `withTenant`, or connected as a role whose policy does not match | Use `src/lib/queries/`; connect as `frata_app` |
| Rows of another tenant visible | Connected as `postgres` (bypasses RLS) or a table missing its policy | `DATABASE_URL` must log in as `frata_app.<ref>`; `npm run verify:tenancy` |
| One request sees another merchant's tenant id | A session-level `SET` on a pooled connection | `set_config(…, true)` — transaction-local — only, in `withTenant` |
| `prepared statement "…" already exists` | Supabase pooler in transaction mode | `postgres(url, { prepare: false })` (already in `src/lib/db/index.ts`) |
| drizzle-kit silently skips a migration | Journal `when` not increasing | Fix `drizzle/meta/_journal.json` order |
| Meta CAPI: every event in a batch rejected | One `event_time` older than 7 days, or in ms | Drop > 7 days before batching; seconds |
| Razorpay signature never matches | Verified a re-serialised body | Verify `await request.text()` exactly as received |
| `duration-200` / `duration-base` does nothing | Tailwind v4 reads `--transition-duration-*`, not `--duration-*` | Use the tokens in `globals.css` |
| vitest: `This module cannot be imported from a Client Component` | `server-only` throws outside Next | `vitest.config.ts` aliases it to its empty build |
| A date reads 5½ hours early | Formatted on Vercel (UTC) without a zone | `src/lib/format-date.ts` only (`check:dates`) |
| A gate flags the comment explaining it | The gate matched its own documentation | Gates skip comment lines; test a new gate on its own docs |
