---
name: frata-gotchas
description: Use when something in Frata fails in a way that makes no sense - a page that runs behind a layout that refused, npm "Cannot read properties of null (reading 'edgesOut')", "invariant expected layout router to be mounted", a forged session accepted, rows missing or visible across tenants, a migration that drizzle skips, Meta CAPI rejecting a whole batch, a Razorpay signature that never matches, a Tailwind duration class that does nothing, a test that cannot import server-only.
metadata:
  version: 1.3.0
  verified: 2026-11-06
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
