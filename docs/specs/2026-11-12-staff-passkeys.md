# Staff passkeys for Admin
Status: active (approved 2026-11-12: "approved all three, drop the authenticator app") · Date: 2026-11-12 · Mockup:
https://claude.ai/artifact/Xng3BV15YZpDQi9MoYLGsZ (docs/mockups/2026-11-12-staff-passkeys.html) · Approved: owner, 2026-11-12
Owner, 2026-11-12: "agreed staff will move from email codes to passkeys"; "start with staff passkeys". ADR-0007
§ Staff 2FA (amended 2026-11-12). Security review S5 and kit-and-fleet H3.

## Goal
Ranked problem (7), safety at scale: Admin and support visits read across every merchant (ADR-0007), so a phished email
code today opens every shop's data, billing and, from V2, kill switches and releases. Measure: every Admin page and
action, **and every support visit into a merchant's console**, refused without a passkey check on this browser session
within 12 hours (proved by e2e and the tenancy proof); no staff access with an email code alone.

## Job
A Frrata staff member proves it is really them with a passkey (fingerprint, face or device PIN) before Admin or a support
visit opens, so a stolen or phished email code is not enough.

## Research (dated)
- **Supabase Auth** (docs read 2026-11-12): MFA factors are an authenticator app (TOTP) and phone codes, raising the
  session's `aal` to `aal2`. **Passkeys are a beta announced 2026-05-28, documented as "experimental … the API may change
  without notice"**, a first sign-in method; the docs do not say a passkey session reaches `aal2`; a WebAuthn second
  factor exists only as experimental work in progress. The relying-party id is the bare domain; changing it makes
  existing passkeys unusable. **Taken:** Admin does not rest on an experimental API; Frrata checks the passkey itself,
  on top of today's email sign-in, with the standard library.
- **SimpleWebAuthn** (npm, read 2026-11-12): `@simplewebauthn/server` 14.0.3 (2026-09-25), `@simplewebauthn/browser`
  14.0.0 (2026-09-02), past the two-week minimum; `npm audit` on the diff that adds them. **Taken:** the one new
  dependency.
- **Synced passkeys** (Apple, Google) report a signature counter of 0. **Taken:** replay protection rests on the
  single-use challenge; the counter is checked only when it is non-zero.
- **Playwright** adds a virtual authenticator through the DevTools protocol. **Taken:** the e2e regression net; no
  environment switch ever bypasses the check.

## Design (mockup)
1. **After the email code**, opening Admin shows "Confirm it's you" with one button, **Use passkey** (user verification
   required). Success opens Admin and support visits for 12 hours on this browser session.
2. **First passkey or a lost device:** the person's own signed-in session asks to add a passkey and is shown a **6-digit
   code**. They read it to an admin by voice or video. The admin, who must have confirmed with their own passkey in the
   last 5 minutes, types that code in Admin › Staff to approve **that session's** request (10 minutes, one use). The
   person then adds the passkey on that same browser. An admin can never approve their own request.
3. **Each person keeps two passkeys** (for example phone and laptop), so losing one device locks nobody out. A second
   passkey is added after a passkey check in the same session.
4. **Admin › Staff** lists each person's passkeys (name, added, last used), pending requests with **Approve** (enter the
   code), and **Remove**. Adding or removing staff, approving a request and removing a passkey each need a passkey check
   in the last 5 minutes.
5. **Every** staff added, request approved, passkey added or removed sends an email (SES, ADR-0011) to the person and to
   every admin, and is in Admin › Activity.
6. **The very first admin, or an only admin with no device left:** the owner calls one definer in Supabase's SQL editor,
   `app_staff_bootstrap(...)`, which refuses anyone not in `platform_staff`, writes the audit row, and creates an approved
   request for that person's waiting code. Not a raw insert.
7. **No authenticator app:** ADR-0007's amendment named one as the fallback; this plan replaces it with two passkeys plus
   another admin's approval of a code (an app code can be phished, a passkey cannot). ADR-0007 is amended with the
   owner's sign-off.

### How it is enforced
- **Identity before the passkey:** a distinct `StaffIdentity` type (`userId`, `sessionId`), never assignable to `StaffOk`,
  accepted only by the passkey module. The session id comes from verified claims: `getUser()` (the session still exists)
  then `getClaims()` on the same client, requiring `sub === user.id` and a `session_id`; otherwise refused.
- **`requireStaff`** returns `StaffOk` only with a staff row **and** a live step-up for this user and session; else
  `{ ok: false, reason: 'needs_passkey' }`. The **Admin layout renders the check (or the request screen) in place of the
  page** for that reason, so there is no separate check page and nothing under Admin renders without it. A gate fails any
  file under `src/app/(admin)` that does not start with `requireStaff`.
- **Support visits:** `app_access_for` takes the session id and the step-up hash; its support branch returns a visit only
  while a live step-up exists for that user and session (`requireMember` passes them). A phished session elsewhere gets
  no visit. The function's grants are re-run after it is replaced.
- **The step-up:** a random token in a `__Host-` cookie (Secure, HttpOnly, SameSite=Strict); its hash in `staff_stepups`
  with the user, the session id, the passkey used and `expires_at = now() + 12 h` set in the database. Every check joins
  `platform_staff`. Sign-out deletes the row by its cookie hash before anything else. Removing a passkey revokes the
  step-ups made with it. Removing a staff member deletes their rows (`on delete cascade` from `platform_staff` on all four
  tables), and `removeStaff` becomes a revoke definer in one transaction.
- **WebAuthn:** challenges are rows bound to (user, session, purpose), 5 minutes, consumed with `delete … returning` before
  verification. The passkey is found by **(credential id, user id)**, never the credential alone; `credential_id` is
  unique. `requireUserVerification: true`, `expectedOrigin` and `expectedRPID` explicit; the counter updated only upward.
- **Routes:** handlers under `src/app/(admin)/admin/passkey/**/route.ts`, calling `src/lib/admin/passkeys.ts`. Each first
  checks Host = `CONSOLE_HOST` and Origin = `https://CONSOLE_HOST` exactly (these routes otherwise answer on shop domains),
  caps the body at 16 kB, then Zod. Refused if `NEXT_PUBLIC_CONSOLE_HOST` is unset.
- **Rate limits** counted inside the definers: 5 tries per session in 10 minutes, 20 per person an hour, failing closed.
- **Passkey prompts only where they belong:** `Permissions-Policy: publickey-credentials-get=(), publickey-credentials-create=()`
  on every console page except the Admin screens that ask for a passkey, so merchant content framed on the console
  host (theme preview) cannot request one.
- **Domain move:** passkeys belong to the console host. When the console moves to `app.frrata.com`, staff re-enrol in
  person through the request-and-code flow (no mass allowance window); a dedicated admin host is considered then.

### Tables and definers (tenancy audit)
- `staff_passkeys`, `staff_enrolment_requests`, `staff_webauthn_challenges`, `staff_stepups`: platform tables, `user_id
  references platform_staff on delete cascade`, RLS on with a restrictive deny-all policy, `revoke all` from public, anon,
  authenticated, service_role, `frata_app` and `frata_admin`. `check:tenant`'s no-grant list gains them.
- Definers `app_staff_*`: `security definer`, `search_path = ''`, fully qualified names, EXECUTE revoked from everyone
  and granted to `frata_admin` only; each re-checks `platform_staff` for the caller; each writes its audit row with no
  hash, token or challenge. The list returns `id, name, created_at, last_used_at` only — never a public key, credential id
  or counter; support staff see only their own.
- **The proof** (`scripts/verify/tenancy.sql`) gains: no role holds privileges on the four tables; only `frata_admin`
  may execute the definers; a merchant's user id is refused by every definer; support staff cannot approve; an admin
  cannot approve their own request; one person cannot use another's request or challenge, another session or purpose is
  refused, reuse is refused; the key lookup never returns another person's key; a duplicate credential is refused; a
  step-up from one session fails on another; deleting the staff row kills step-ups at once; a support visit disappears
  without a step-up. Then one check broken on purpose to see the proof fail.

## Design review
- **UI/UX:** screens in the mockup; Rule 0. States: check, waiting for the device, not confirmed, no passkey (request and
  code), request approved, add; Staff with zero, one, two passkeys and a pending request; approve with the code; remove
  with its confirmation; Activity; phone width.
- **Tenancy:** above; `tenancy-auditor` on the migration.
- **Modularity:** `src/domains/auth/stepup.ts` (pure: expiries, freshness, who may approve); `src/lib/admin/passkeys.ts`
  (definers); route handlers under `(admin)/admin/passkey`; the check rendered by the Admin layout.
- **SSOT:** "past the check" is computed once, in `app_access_for` (row 1), read by `requireStaff` and `requireMember`.
- **YAGNI:** no merchant passkeys; no authenticator app; no hardware-key-only policy.
- **KISS:** one library, four tables, one cookie, one check inside the existing access function.
- **Scalability / performance:** a handful of staff; the check rides the query `app_access_for` already runs — no extra
  round trip; results cached per request only (`cache()`, never `unstable_cache`).
- **Reliability:** no outbound call except the notice emails (outbox); a failed check keeps Admin shut and says why.
- **Security:** both reviews' findings above. What remains: anyone with Supabase SQL access (the dashboard, or an agent's
  Supabase connection) could forge a step-up, so the owner turns on multi-factor sign-in for the Supabase and Vercel
  accounts; malware that steals both cookies in the same browser is limited by the 12-hour window and the 5-minute
  re-check on sensitive actions. `security-reviewer` on the diff.
- **Motion and visuals:** the existing pending button; no new motion.
- **Unit economics:** none.
- **Blast radius:** every Admin page and action, and every support visit. E2e flows that use Admin or support visits pass
  the check with a virtual authenticator (one helper). A mistake locks staff out, never merchants: the bootstrap definer is
  the break-glass.

## Out of scope
Passkeys for merchants (signal: owners ask, or a merchant account is phished); GitHub and the registry (owner settings,
kit-and-fleet § 7); Supabase's own passkeys (signal: they leave experimental).

## Reviews (2026-11-12)
- **Security:** a support visit skipped the passkey → checked inside `app_access_for`; an allowance belonged to a
  person, not a session → request-and-code from the person's own session, approved by a freshly checked admin, emails
  to all; passkey found by credential alone → (credential, user); the gate's shape → `StaffIdentity` and the layout
  rendering the check; revocation paths → cascade, sign-out first, revoke definer; session id → `getUser` then `getClaims`;
  host, CSRF and body → exact Host and Origin, 16 kB, Zod; merchant content on the console origin → Permissions-Policy;
  bootstrap → a definer; SQL access → owner MFA on Supabase and Vercel.
- **Tenancy:** no grant plus definers confirmed; support branch → step-up in `app_access_for`; removal → cascade; module
  placement and RLS policy → as above; definer rules and the proof list → as above.
