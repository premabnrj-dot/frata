# Previews off production
Status: draft for the owner · Date: 2026-11-12 · Mockup: none (no screen changes) · Approved: —
Owner, 2026-11-12: "start with … previews off production data". Security review S1 (2026-11-08) and kit-and-fleet S1.

## Goal
Ranked problem (7), reliability and safety: a preview build is code from any branch (a teammate's, an agent's, later a
partner's). It must not be able to change production or receive real people's sign-ins. Measure: no production secret
or production sign-in on any preview (checked in Vercel and by the app's own guard).

## What a preview has today (Vercel, read 2026-11-12)
- **Production only (fine):** `DATABASE_URL`, `ADMIN_DATABASE_URL`, `ANALYTICS_DATABASE_URL`, payment, email, Mux,
  Vercel API and trial secrets.
- **Also on Preview:** `BLOB_READ_WRITE_TOKEN` (write and delete on the production photo store), `BLOB_STORE_ID`,
  `BLOB_WEBHOOK_PUBLIC_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production sign-in),
  `NEXT_PUBLIC_SHOP_DOMAIN`, `NEXT_PUBLIC_CONSOLE_HOST`.
- **Supabase Auth** allows `https://*-premabnrj-dots-projects.vercel.app/auth/callback`, so a real sign-in can finish on
  any preview.
- **Vercel Authentication** is on for every deployment except custom domains: only the team can open a preview.

## Design
1. **Vercel** (owner action, or done for the owner through the Vercel connection on sign-off): `BLOB_READ_WRITE_TOKEN`,
   `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` become
   **Production (and Development) only**. Uploads on a preview already answer "Photo storage is not connected"; sign-in
   already shows "not connected".
2. **Supabase** (owner action): Authentication → URL Configuration → remove the preview wildcard redirect.
3. **A guard in the app**, so a variable added to Preview by mistake still does nothing: when `VERCEL_ENV` (server) or
   `NEXT_PUBLIC_VERCEL_ENV` (browser) is `preview`, the app treats the database, admin database, analytics database,
   photo storage, sign-in, payments, email, Mux and the Vercel API as **not configured**, whatever is set. One function
   in `src/lib/env.ts` and `src/lib/public-env.ts`, unit-tested, and a gate (`check:config`) that every secret reader
   goes through it.
4. **Kept:** Vercel Authentication on previews; `claude/**` branches never deploy (`vercel.json`).
5. **docs/setup.md:** the two owner steps ticked with the date; the open item closed.

## Design review
- **UI/UX:** none (previews show the existing "not connected" states).
- **Tenancy:** a preview reaches no database at all.
- **Modularity / SSOT:** one "is this a preview" rule in the two env modules; every reader asks it.
- **YAGNI:** no preview database or seeded preview project (signal: a person needs to test a flow on a preview the
  local e2e stack cannot show).
- **KISS:** settings plus one guard.
- **Scalability / performance:** none.
- **Reliability:** production unchanged: production keeps every variable; the guard is false there (tested).
- **Security:** closes write access to production photos and real sign-ins on preview code; defence in depth by the
  guard; `security-reviewer` on the diff.
- **Unit economics:** none.
- **Blast radius:** `src/lib/env.ts` and `src/lib/public-env.ts` are read everywhere: a guard that misreads production as
  a preview would turn production off. Guard: production and development values are unit-tested; a production smoke
  check (sign-in page, a shop page, an upload) after the deploy.

## Out of scope
A separate preview database and auth project (signal above).
