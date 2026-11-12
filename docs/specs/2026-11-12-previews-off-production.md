# Previews off production
Status: draft for the owner (security review folded in) · Date: 2026-11-12 · Mockup: none (no screen changes) · Approved: —
Owner, 2026-11-12: "start with … previews off production data". Security review S1 (2026-11-08) and kit-and-fleet S1.

## Goal
Ranked problem (7), safety: a preview build is code from any branch (a teammate's, an agent's, later a partner's). It
must not change production or receive real people's sign-ins. Measure: no production secret in any preview build or
deployment, and the app refusing every secret outside production.

## What a preview has today (Vercel, read 2026-11-12)
- **Production only (fine):** the three database URLs, payment, email, Mux, Vercel API and trial secrets.
- **Also on Preview:** `BLOB_READ_WRITE_TOKEN` (write and delete on the production photo store), `BLOB_STORE_ID`,
  `BLOB_WEBHOOK_PUBLIC_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production sign-in),
  `NEXT_PUBLIC_SHOP_DOMAIN`, `NEXT_PUBLIC_CONSOLE_HOST`.
- **Supabase Auth** allows `https://*-premabnrj-dots-projects.vercel.app/auth/callback`.
- **Vercel Authentication** is on for every deployment except custom domains: only the team can open a preview.
- **Already built previews keep the values they were built with**, so every past branch build has held the photo token.

## Design
1. **Vercel:** `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` become **Production only** (not
   Development either: `vercel env pull` would put a production write token on laptops and in agent sessions).
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` become Production and Development (public values; local
   development signs in). Then **rotate the photo store's token** (owner step in Vercel → Storage; how to rotate is
   confirmed in the dashboard at the time) and **delete old preview deployments**.
2. **Supabase** (owner step): Authentication → URL Configuration → remove the preview wildcard redirect.
3. **The app refuses secrets outside production.** One `secret(name)` reader in `src/lib/env.ts` returns `''` whenever
   `VERCEL === '1'` and `VERCEL_ENV !== 'production'` (read at runtime on the server), so previews, custom environments and
   a missing system variable all fail closed. **Every** secret goes through it, including those read today outside the
   allow-list in this draft: EkCode seal keys and peppers, Meta and WhatsApp tokens, `FRRATA_WA_TOKEN`, billing Razorpay
   keys, `TRIAL_CLAIM_SECRET`, `SEND_EMAIL_HOOK_SECRET`, `EMAIL_KEYS`, `VERCEL_BILLING_TOKEN`, and `CRON_SECRET` (read
   in `src/lib/auth/cron.ts`). `check:config` gains a rule: a secret read anywhere else fails the gate. In the browser,
   `NEXT_PUBLIC_VERCEL_ENV` (set at build, per environment) turns sign-in off on previews.
4. **Kept:** Vercel Authentication on previews; `claude/**` branches never deploy; crons run on production only;
   webhooks point at production URLs; SES trusts `environment:production` (to confirm in AWS).
5. **Owner checks:** "Automatically expose System Environment Variables" is on in Vercel (needed for `VERCEL_ENV`); Meta's
   OAuth redirect list holds production URLs only; multi-factor sign-in on the Supabase and Vercel accounts.
6. **docs/setup.md:** these steps ticked with the date; the open item closed.

## Design review
- **UI/UX:** none (previews show the existing "not connected" states).
- **Tenancy:** a preview reaches no database.
- **Modularity / SSOT:** one `secret()` reader and one "is production" rule in the env modules.
- **YAGNI:** no preview database or seeded preview project (signal: a person needs a flow on a preview that the local
  e2e stack cannot show).
- **KISS:** settings, one rotation, one reader.
- **Scalability / performance:** none.
- **Reliability:** production keeps every variable; `secret()` is unit-tested for production, preview, development, a
  custom environment and a missing `VERCEL_ENV`; a production smoke check (sign-in, a shop page, an upload) after deploy.
- **Security:** what is real and what is defence in depth, said plainly: branch code could delete the guard, and the
  sign-in URL and public key are already in production's pages. The boundary is **Vercel's variable scoping, the rotated
  token, Supabase's redirect list, Vercel Authentication on previews, and staff passkeys** (a preview origin can never pass
  a passkey check). The guard catches mistakes, not attackers.
- **Unit economics:** none.
- **Blast radius:** `src/lib/env.ts` is read everywhere: a guard that misreads production would switch production off.
  Guard: the tests above, and the deploy smoke check.

## Out of scope
A separate preview database and auth project (signal above).

## Review (2026-11-12)
Security: existing deployments keep their values → rotate and delete (1); the guard was a deny-list with gaps → one
`secret()` reader for every secret, failing closed, with a gate (3); the guard cannot stop malicious branch code → said
plainly (Security); Development would put the token on laptops → Production only (1); runtime vs build-time env and other
paths to a preview → (3)–(5).
