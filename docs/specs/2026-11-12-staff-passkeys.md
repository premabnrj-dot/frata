# Staff passkeys for Admin
Status: draft for the owner · Date: 2026-11-12 · Mockup: (published with this spec) · Approved: —
Owner, 2026-11-12: "agreed staff will move from email codes to passkeys"; "start with staff passkeys". ADR-0007
§ Staff 2FA (amended 2026-11-12). Security review S5 and kit-and-fleet H3.

## Goal
Ranked problem (7), reliability and safety at scale: Admin reads across every merchant (ADR-0007), so a phished email
code today opens every shop's data, support sessions, billing and, from V2, kill switches and releases. Measure: every
Admin page and action refused without a passkey check on this browser session within 12 hours (proved by e2e); zero
staff sign-ins with an email code alone.

## Job
A Frrata staff member proves it is really them with a passkey (fingerprint, face or device PIN) before Admin opens, so
a stolen or phished email code is not enough.

## Research (dated)
- **Supabase Auth** (docs read 2026-11-12): MFA factors are an authenticator app (TOTP) and phone codes; a second factor
  raises the session's `aal` to `aal2`. **Passkeys for Supabase Auth are a beta announced 2026-05-28 and documented as
  "experimental … the API may change without notice"**, opted into per client; they are a first sign-in method; the
  docs do not say a passkey session reaches `aal2`; a WebAuthn second factor exists only as experimental work in
  progress. The relying-party id is the bare domain, and changing it makes existing passkeys unusable.
  **Taken:** Admin does not rest on an experimental API. Frrata checks the passkey itself, as a step on top of today's
  email sign-in, with the standard WebAuthn library; Supabase stays the first sign-in.
- **SimpleWebAuthn** (npm, read 2026-11-12): `@simplewebauthn/server` 14.0.3 (published 2026-09-25) and
  `@simplewebauthn/browser` 14.0.0 (2026-09-02), both past the two-week minimum. **Taken:** the one new dependency;
  WebAuthn verification is cryptography we do not write ourselves.
- **Playwright** can add a virtual authenticator through the browser's DevTools protocol (`WebAuthn.addVirtualAuthenticator`),
  so the flow is testable end to end on the local stack. **Taken:** an e2e flow is the regression net.

## Design (mockup)
1. **After the email code**, a staff member opening Admin sees "Confirm it's you" with one button, **Use passkey**.
   The browser asks for the fingerprint, face or PIN (user verification required). Success opens Admin for 12 hours on
   this browser session; signing out, removing the person from staff, or a new sign-in ends it.
2. **Adding a passkey** needs one of: a passkey check already done in this session (a second device), or an
   **allowance** another admin created for this person in the last 30 minutes (two people). Each person keeps at least
   two passkeys (for example phone and laptop), so losing one device locks nobody out.
3. **Admin › Staff** lists each person's passkeys (name, added, last used), **Allow a new passkey** (30 minutes, one
   use, shown to the person in Admin), and **Remove**. Every add, remove, allowance and check is in Admin › Activity.
4. **No passkey and no allowance:** "Ask another admin to allow a passkey." The very first admin's allowance, and the
   recovery when the only admin has lost every device, is one SQL statement the owner runs in Supabase (setup.md),
   because no admin exists to grant it.
5. **The authenticator-app fallback** written into ADR-0007's amendment is **replaced by two passkeys plus another
   admin's allowance** (fewer systems; an app code can be phished, a passkey cannot) — the owner's call at sign-off.

### How it is enforced
- `requireStaff` (the one place ADR-0007 named) adds the check: a staff row **and** a valid step-up for this user and
  this Supabase session. Without it: `{ ok: false, reason: 'needs_passkey' }`; the Admin layout sends the person to the
  check; every Admin action refuses the same way. Support visits inherit it (they start from `requireStaff`).
- The step-up: a random token in a `__Host-` cookie (Secure, HttpOnly, SameSite=Strict, path `/`), its hash in a
  `staff_stepups` row with the user, the Supabase `session_id`, the passkey used, and an expiry 12 hours on. Revoked on
  sign-out and by the definer that removes a staff member.
- WebAuthn challenges are rows written before the browser is asked (ADR-0008), single use, 5 minutes. The relying
  party is the console host (`CONSOLE_HOST`), the origin `https://` + that host exactly; any other host (a preview, a
  shop domain) is refused. When the console moves to `app.frrata.com`, staff add passkeys again through allowances.
- Attempts are rate-limited per person (10 in 10 minutes, failing closed).

## Design review
- **UI/UX:** four screens and phone width in the mockup; Rule 0. States: first visit with an allowance; none; the check
  (waiting for the device, refused, cancelled, too many tries); Staff with zero, one and two passkeys; allowance
  active and expired. Keyboard: one primary button per screen.
- **Tenancy:** no shop data. New platform tables `staff_passkeys`, `staff_passkey_allowances`, `staff_webauthn_challenges`,
  `staff_stepups`: no grant to `frata_app` or `frata_admin`, RLS on with no policy, every read and write through
  `security definer` functions that take the user id the server verified (never a form value) and return only what the
  caller needs (a public key never leaves the server; a challenge is consumed once). `tenancy-auditor` on the migration.
- **Modularity:** `src/domains/auth/stepup.ts` (pure: expiry, which proof may add a passkey); `src/lib/auth/staff-passkey.ts`
  (the one owner module: options, verify, step-up, allowances); route handlers under `src/app/api/admin/passkey/`;
  screens under `src/app/(admin)/admin/passkey/` and Admin › Staff.
- **SSOT:** "is this person past the check" is computed once, in `requireStaff`.
- **YAGNI:** no passkeys for merchants or shoppers here (EkCode and console sign-in are separate decisions); no
  authenticator app; no hardware-key-only policy.
- **KISS:** one library, four small tables, one cookie, one check in the one gate.
- **Scalability:** staff only (a handful of people); every query by primary key or `(user_id)`.
- **Performance:** one indexed lookup added to each Admin request (the step-up by token hash); none on console or shops.
- **Reliability:** no outbound call (WebAuthn is browser ↔ server); if the check fails, Admin stays shut and says why.
- **Security:** user verification required; counter and replay checks by the library; challenge single use; origin and
  relying party exact; cookie `__Host-`; revocation on sign-out and staff removal; rate limit fails closed; two people
  to add a passkey without an existing one; the SQL bootstrap documented and logged; `security-reviewer` on the plan
  and the diff.
- **Motion and visuals:** the existing button pending state while the device asks; no new motion.
- **Unit economics:** none.
- **Blast radius:** every Admin page and action goes through `requireStaff`; e2e flows that use Admin learn to pass the
  check with a virtual authenticator (one helper). A mistake locks staff out of Admin, never merchants out of the
  console: the owner's SQL recovery is the break-glass.

## Out of scope
Passkeys for merchants (signal: owners ask, or a merchant account is phished); GitHub and the package registry (owner
settings, kit-and-fleet § 7, before the first kit release); Supabase's own passkeys (signal: they leave experimental).
