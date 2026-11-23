# Passkeys, simpler: one check for a person, no phone calls, a clear way in on a new device
Status: draft · Date: 2026-11-23 · Mockup: pending (`docs/mockups/2026-11-23-passkeys-simpler.html`) · Approved: — ·
Owner (2026-11-23): "Please simplify the process, see the complexities issues with passcodes and make it simpler,
easier. remove redundancies." · Owner (2026-11-23): "there is no calling feature setup, neither we want one." ·
Fits with lane D's Studio entry card (https://claude.ai/artifact/8gL1SMBEUifHiqV6PRPTak, approved).

## Goal
Ranked problem (5), a premium storefront built by partners: partners are the builders (ADR-0014), and today the first
hour of a partner is a phone call that nobody is set up to make. Measures: (1) a new Lead or partner owner goes from the
email to their clients in one sitting with nobody else involved (median ≤ 5 minutes over the first 20); (2) zero
"Request a call" or "Read us this code" screens anywhere; (3) the owner opens Studio with one passkey prompt;
(4) the passkey proofs in `scripts/verify/tenancy.sql` still pass, with the new one-way rule added to them.

## Job
A person who works in Frrata as staff, as a partner (owner, Lead, Builder), or as all of them, signs in with the email
code, confirms once with a passkey on that browser, and gets to work; a new device or a lost passkey has one plain path
that needs no call.

---

## A. What exists today (read from the code, 2026-11-23)

Store members (owner, Manager and the rest in the console) hold **no passkey**: email code only (staff passkeys spec
§ Out of scope; ADR-0018 § Give key). Passkeys exist for two kinds of people, in two separate sets of tables, with one
shared ceremony (`src/lib/auth/webauthn.ts`: user verification required, exact origin and site, challenge used once,
counter only rises; the site is the console host, `frata.vercel.app`).

| | Frrata staff (admin, support) | Partner owner | Partner Lead / Builder |
|---|---|---|---|
| Where the prompt appears | Every Admin page (`src/app/(admin)/admin/layout.tsx` → `PasskeyGate`); support visits; Studio | Every partner workspace page (`(partner)/partner/(workspace)/layout.tsx` → `PartnerGate`); client stores opened as partner (`partnerHeld`); Studio | Same as owner (a Builder too, `drizzle/0131` § passkeys) |
| What is stored | `staff_passkeys`, `staff_stepups`, cookie `__Host-frrata_staff`; WebAuthn user handle = the user id (`src/lib/admin/passkeys.ts`) | `partner_passkeys`, `partner_stepups`, cookie `__Host-frrata_partner`; user handle `partner:<membership id>` (`src/lib/db/partner-passkeys.ts`) — bound to ONE partner membership | same |
| Which passkeys the browser is offered | Only this person's staff passkeys (`allowCredentials`) | Only this membership's partner passkeys | same |
| How long a check lasts | 12 hours on this browser session (`app_staff_confirm`, drizzle/0109) | 12 hours (`app_partner_pk_confirm`, drizzle/0129) | same |
| Asked again ("fresh", 5 minutes) | Add or remove staff, approve a request, remove a passkey, money in Admin (Issue, Record payment, Credit note, Refund) (`confirmedRecently`, `FRESH_MS`) | Hand over, invite, approve, delete, set role, credits (`app_partner_need_real(…, true)`) | Delete own passkey |
| First passkey | Ask on the gate → a 6-digit code on screen → **another master admin** types it in Admin › Staff (approval lives 10 minutes, for that browser session only; never one's own) (`app_staff_request`, `app_staff_approve`). Very first admin: `app_staff_bootstrap` in the SQL editor | "Frrata approves your first passkey · We call you on +91 … · Read us this code · **Request a call**" → a Frrata **master admin** phones the number on the partner record, hears the code, types it in Admin › Partners › Passkeys (`admin_partner_pk_approve`; never one's own: `own_request`) | "Ask Pia to call you · Read Pia this code" → the **partner owner** phones, asks "Did you start this call yourself?", types the code in Team (`app_partner_pk_approve`) |
| Lost passkey | "Lost your passkeys?" → the same code, another master admin approves | "Can't use your passkey?" → request **waits 24 hours** (lives 48), every Frrata admin emailed, then the same call and code. Applies to any owner who EVER had a passkey, even after Admin deleted them all (`app_partner_pk_request`, review M1) | Same as first: the owner calls and approves at once |
| New device, passkey on the phone | "Use passkey" → the browser's "use a phone" (QR) | Same, then "Sign in faster on this device · Create a passkey" (mockup screen 14) | same |
| Removing | Own, or anyone's as admin, after a fresh check; never the one in use | Own, after a fresh check. Admin › Partners › Delete passkeys (all of an owner's) | Owner deletes all of a Lead's or Builder's ("lost device") |
| `passkeys_off` switch | While a row is live (≤ 30 days, drizzle/0151–0152), Admin counts as checked without a passkey; adding/approving/removing still need a real one | Same for the workspace (`app_partner_need`) | same |

**Studio's door** (`src/lib/studio/with-studio.ts`, `app_studio_partner` drizzle/0167): staff with a live staff check
AND a live partner person with a live partner check, **both on the same browser session**, both REAL step-up rows
(the switch never counts), on the store chosen in the switcher, not a support visit (ADR-0020).

**Device sign-in, G·3** (`src/lib/storefront-api/device.ts`): "Give key" in Partner › Developer needs a passkey check
made for THAT code (its challenge on the code's row; an earlier check and the switch never count), by a partner owner
or an assigned Lead. Only partner passkeys are offered.

**What "Request a call" does today** (orchestrator's question): it writes a `partner_passkey_requests` row (the code's
hash, "Chrome on Mac", the city; a first passkey lives 15 minutes; a recovery opens after 24 hours and lives 48), an
`audit_events` row `partner.passkey.request` (`waits` true or false), and security emails (`staff_notices`) to the
partner owner and **every master admin**: "<email> asked Frrata to approve their first passkey. We'll call the phone on
their record." (or "… can't use their passkey … We can approve a new one after 24 hours."), with a button "Open Frrata
Admin › Partners". In Admin › Partners › <partner> › Passkeys an admin sees "Asked for a new passkey · Waiting" (or
"Waiting 24 hours"), Call +91 …, Device, Where, a box "Code the partner owner reads out" and "Approve passkey" (after
their own passkey). Nothing phones anybody: the call was always a person dialling by hand. A first-passkey request ends
by itself after 15 minutes, so only recoveries (up to 48 hours) can still be waiting. Whoever releases this can count
them read-only: `select count(*) from partner_passkey_requests where used_at is null and approved_at is null and
declined_at is null and expires_at > now()`. The build closes them (§ Design 7).

## B. What a person meets, and what each thing protects

| # | What the person meets | What it protects against | Real protection? |
|---|---|---|---|
| B1 | **Two passkeys for one person on one site.** The owner holds two staff passkeys and one partner passkey for `frata.vercel.app`. At /partner Chrome offered nothing: only the partner passkey is allowed there, and it was saved in another Google account. The staff passkeys in this browser did not count. | A passkey approved by a weaker path (a partner owner, an outside company) must never open Admin. A device must not overwrite a staff passkey with a partner one (plan T1b). | The first half is real, **one way only**: a staff passkey is approved by a stricter path than a partner one, so letting it count in the partner workspace weakens nothing. |
| B2 | **Two prompts to open Studio**, on the same sign-in. | Studio must prove a person who is both staff and a partner (ADR-0020). | Proving both roles is real. Two prompts are not: one staff passkey proves the same person; the roles are checked separately anyway. |
| B3 | **"Request a call" / "Read us this code"** for a partner owner's first passkey. Nobody is set up to call, and the person who would take the call and approve it in Admin was the owner themself, which the database refuses (`own_request`), so in this case **no one in the app could approve it**. | A stolen inbox alone must not create the first passkey (partner sign-in spec § Goal). The call reached a second channel (the phone on record), and the approver started the call (Lesson 12). | Partly real, but it never ran: the calling set-up does not exist and will not (owner, 2026-11-23). |
| B4 | **"Ask Pia to call you"** for a Lead's or Builder's first passkey. Pia must phone, ask "Did you start this call yourself?", type a code. | The same, with the partner owner as the second person. | The owner invited this exact email minutes earlier; the invite already proves the inbox. The call adds little and blocks the first hour. |
| B5 | **A lost partner owner's passkey waits 24 hours**, then still needs the call. | A stolen inbox must not quietly replace the owner's passkeys; the wait gives the real owner and Frrata time to see the emails and stop it (plan T1b "can't be talked out of Frrata"). | **Real.** The wait and the emails are the protection; the call after it is what goes. |
| B6 | **The heading says "Frrata approves your first passkey"** to an owner who already has one, until they press the button (`partner-gate.tsx`: the heading reads `opensAt`, which only exists after the request). | — | A wording bug. |
| B7 | **Two gates with different words for one job**: staff "Lost your passkeys?", "Add a passkey"; partner "Can't use your passkey?", "Create a passkey" (`passkey-gate.tsx`, `partner-gate.tsx`). Two passkey lists (Admin › Staff, Partner › Passkeys). Three code-approval boxes (Admin › Staff, Admin › Partners › Passkeys, Partner › Team). | — | Redundancy, no protection. |
| B8 | **When the browser has no matching passkey**, "Use passkey" opens a sheet with nothing in it, or an error, and the gate says only "Not confirmed. Try again". It never says where the person's passkeys are saved. Partner passkeys keep their password manager's name ("Google Password Manager"); staff passkeys do not (no `nameFor` on the staff ceremony). | — | Missing help, not a protection. |
| B9 | **The `passkeys_off` switch** hid every prompt for weeks, with no screen, set and cleared only in the SQL editor, so the owner never made a staff or partner check and found out on the day it mattered. Studio and "Give key" ignore it, so it also made Studio look broken. | Friction while testing (ADR-0007 amendment 2026-11-16). Its own stated risk: "a staff inbox alone opens Admin and support visits". | It removes a protection while on; it protects nothing. |
| B10 | **Checks last 12 hours, money and team actions ask again after 5 minutes.** | Cookie-stealing malware is limited to 12 hours and to no sensitive action without a fresh touch (staff spec § Security). | **Real**, and cheap (a fingerprint). Kept. |
| B11 | **Email code first, then a passkey**, every sign-in. | A passkey cannot start a Supabase session without the service-role key, which is deliberately absent (partner sign-in spec). | Real constraint. Kept. |

## C. The simpler design — options and recommendation

Seven rules replace today's ten screens of exceptions. Each says what it gives up.

### C1. One person, several roles (question i)
- **Option 1 · Keep two separate passkey sets** (today), and only fix the words. Gives up nothing; fixes nothing in B1/B2.
- **Option 2 · A staff passkey counts as the partner check too — one way (recommended).** The partner prompt offers the
  person's partner passkeys AND their staff passkeys. Confirming with a staff passkey makes both checks on this
  session; confirming with a partner passkey makes the partner check only. Studio needs one prompt. A person who is
  staff never needs a partner passkey. *Security cost:* none for the separation ADR-0007 wants: a staff passkey is only
  ever approved by a master admin or added with another staff passkey, so nothing weaker enters Admin, and a partner
  passkey still never opens Admin. What changes: the partner workspace now trusts a staff passkey for the same Supabase
  user; the person must still be a live partner member (`app_pm_live`), so leaving a team, a suspended partner or a
  removal still ends access at once. T1b's proof "a staff hash as partner hash counts for nothing" becomes "a staff
  check counts as a partner check for the same person on the same session; a partner check never counts as staff".
  ADR-0007 and ADR-0020 get an amendment. A partner owner's "Delete passkeys" for a Lead cannot reach that Lead's staff
  passkeys (rare: staff working as someone else's Lead); removing the Lead from the team still ends their access.
- **Option 3 · One passkey per person for every role.** One table, one list. The strictest role a person holds decides
  how a new passkey is approved. Cleanest for the person; the biggest build (every definer, two tables migrated); and
  any slip in "strictest role decides" lets a partner-approved passkey into Admin. Not now.

### C2. First passkey, with no call (question ii)
The call protected against a stolen inbox making the first passkey. What replaces it:
- **Option 1 · Saved at the first sign-in, nobody approves (recommended).** Being invited (Lead, Builder), approved as a
  partner (owner, by Frrata in Admin › Partners) or added to staff (by a master admin) IS the human approval; the email
  code proves the inbox; the browser asks for the screen lock. The first passkey must be saved within **7 days** of that
  approval, after which it is a lost-passkey request (C3), so an account nobody used cannot be taken later by its inbox
  alone. Every new passkey emails the person, the partner owner and (for an owner or staff) every master admin, with
  the device and the city, and appears in Team or Admin with a Delete button. *Security cost:* during the first sign-in
  a stolen inbox is enough to make the first passkey — the same bar every store owner and Manager has today with no
  passkey at all. After the first passkey a stolen inbox is no longer enough. It gives up the partner sign-in spec's
  "a second person for the first one".
- **Option 2 · One click "Allow", no code.** The approver sees the request (device, city, time) and presses Allow: the
  partner owner for a Lead or Builder (in Team), any master admin for a partner owner or staff (in Admin). *Cost:*
  without a code an attacker who asks at the same moment could be the one allowed (the code tied the approval to one
  browser); the person still waits for someone.
- **Option 3 · Keep the code, send it any way.** "Send Pia this code" (WhatsApp, in person); Pia types it. Keeps the tie to
  one browser; still waits for a second person; the code can be phished by message.
- **When the approver would be the same person** (the owner): C1 Option 2 answers it — a staff check lets the owner
  save a partner passkey at once, or need none. The database's `own_request` refusal stays.

### C3. Lost passkey (question iii)
1. **First, another device.** The gate's "Use a passkey on another device" opens the browser's own sheet (phone QR,
   security key). After it works: "Save a passkey on this device" in one tap. Most "lost" passkeys are on a phone or in
   another Google account (the owner's case).
2. **Then "I've lost my passkeys".** Recommended: the approver presses **Allow now** (one click, sees device, city and
   time): partner owner for a Lead or Builder; any other master admin for a partner owner or staff. **If nobody allows,
   a partner person saves a new passkey themself after 24 hours.** The request emails the person, the partner owner and
   every master admin at once, each with **Stop it** (any signed-in approver, or the person with any existing passkey,
   cancels it). Staff keep no self-serve path: another master admin, or the SQL break-glass (`app_staff_bootstrap`).
3. **Is 24 hours right for everyone?** A Lead with an owner around: no wait (Allow now). An owner with a Frrata admin
   around: no wait. Anyone alone: 24 hours, which is the protection (B5). Staff: never self-serve (Admin reads across
   every merchant).
*Security cost:* the call after the wait is gone; a stolen inbox left unnoticed for 24 hours by the person, the partner
owner and every master admin can replace a partner person's passkeys. Option kept for the owner: "no self-serve for a
partner owner either — a Frrata admin must Allow" (today's protection, minus the call).

### C4. How often (question iv)
One check a sign-in for the whole person: a staff passkey covers Admin, the partner workspace and Studio (C1). 12 hours,
and 5 minutes for money and team actions, unchanged. Studio: one prompt, not two. Lane D's card 1b ("Confirm your
passkeys", two lines) becomes one line and one button for a staff person; it keeps its two lines only for someone whose
staff check is missing and partner check made with a partner passkey.

### C5. No matching passkey here (question v)
After "Use passkey" is cancelled or finds nothing, the gate shows **"No passkey on this browser?"** with where the
person's passkeys are saved ("Google Password Manager · saved 16 Nov · used 18 Nov") and two buttons: **Use another
device** (the browser's sheet, which offers a phone's QR code) and **I've lost my passkeys** (C3). After another device
works, **Save a passkey here** (one tap). Staff passkeys also record their password manager's name (`nameFor`).

### C6. The `passkeys_off` switch (question vi)
- **Recommended · Remove it.** It hid the prompts for weeks, nobody could see it, and with C1–C5 there is nothing left to
  turn off: one fingerprint a day. Testing uses the e2e stack's seeded checks. Drop `platform_switches`, restore
  `app_access_for` and `app_partner_need` to the real check only, keep the audit rows.
- **Option · Keep it, visible.** Admin › Staff shows "Passkeys off until 24 Nov, 18:00 · Turn on", every Admin page a
  banner, at most 24 hours, set and ended from that screen by a master admin after a fresh check.

### C7. What a non-technical partner sees (question vii)
| Journey | Today | Proposed |
|---|---|---|
| A Lead, from the invite to their clients | 8 screens · 6 decisions · a phone call from the owner, who also does 4 steps in Team | 6 screens · 5 decisions · nobody else |
| A partner owner, from "approved" to their clients | 7 screens · a call from Frrata of unknown wait, and an admin's 4 steps | 5 screens · 4 decisions · nobody else |
| A partner on a new laptop, passkey on the phone | 4 screens (works today) | 4 screens, and the help names where the passkey is |
| A partner who lost every passkey | Lead: a call · owner: 24 hours, then a call | Allow now by the owner or a Frrata admin, else 24 hours alone |
| The owner (staff + partner) opening Studio | 2 prompts; failed: no partner passkey offered, then "Request a call" nobody can answer | 1 prompt |

## Design
Mockup to follow, after the reviews of this proposal (§ D) and the orchestrator's answers.

## Design review
Pending (§ D: security-reviewer, tenancy-auditor, architecture-reviewer; words-reviewer on the mockup).

## Out of scope
- Passkeys for store members (owners, Managers): signal — an owner asks, or a merchant account is phished.
- A passkey as the first sign-in step (no email code): needs Supabase to mint a session from our check, which needs
  the service-role key that is deliberately absent. Signal: Supabase Auth ships passkeys as stable.
- Recovery codes: "one more secret to lose" (partner sign-in spec). Signal: a partner with no second device is locked
  out twice.
- One passkey per person (C1 Option 3): signal — a third role with passkeys.

## Facts used
Research 2026-11-23 (integration-researcher). Most product help pages carry no date of their own, so under the
12-month rule they are **unverified leads**, not current facts:
- GitHub: adding a passkey needs the password or another sign-in method, no person approves; sudo mode lasts two hours;
  lost 2FA recovery by email code plus a known device, "up to three business days" (docs.github.com, no page date).
- Stripe: a passkey per Stripe account; the first passkey needs an account verification step (support.stripe.com, no
  page date).
- Shopify: a verified email is enough to create a passkey; a lost one is removed after an email-code sign-in
  (help.shopify.com, no page date).
- Google Workspace: an admin removes a user's passkey; no waiting period stated (knowledge.workspace.google.com, last
  updated 2026-11-10) — **current**.
- passkeys.dev: offer a passkey on this device after a sign-in that used another device (page dated 2025-10-31, older
  than 12 months — unverified).
No product found phones a person to approve a first passkey.
