# Passkeys, simpler: one check for a person, no phone calls, a clear way in on a new device
Status: parked by the owner, 2026-11-23 · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/85e3WTLUVDFYjMnJYC2JG4 (`docs/mockups/2026-11-23-passkeys-simpler.html`) · Approved: — ·
Owner (2026-11-23): "Please simplify the process, see the complexities issues with passcodes and make it simpler,
easier. remove redundancies." · Owner (2026-11-23): "there is no calling feature setup, neither we want one." ·
Fits with lane D's Studio entry card (https://claude.ai/artifact/8gL1SMBEUifHiqV6PRPTak, approved).

**Parked** (owner, 2026-11-23): "on passkey, could you please park the plan and just add option in admin to disable passkeys … it's too early for passkeys in the system, let it be just email and password login. I don't understand the need of passkey system … just wish to get started for now". Nothing here is built. The map (§ A, § B), the reviews (§ D) and the mockup stay as they are for when it is picked up again.

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
declined_at is null and expires_at > now()`. P2 closes them and emails each person (§ Phases).

## B. What a person meets, and what each thing protects

| # | What the person meets | What it protects against | Real protection? |
|---|---|---|---|
| B1 | **Two passkeys for one person on one site.** The owner holds two staff passkeys and one partner passkey for `frata.vercel.app`. At /partner Chrome offered nothing: only the partner passkey is allowed there, and it was saved in another Google account. The staff passkeys in this browser did not count. | A passkey approved by a weaker path (a partner owner, an outside company) must never open Admin. A device must not overwrite a staff passkey with a partner one (plan T1b). | The first half is real, **one way only**: a staff passkey is approved by a stricter path than a partner one, so letting it count in the partner workspace weakens nothing. |
| B2 | **Two prompts to open Studio**, on the same sign-in. | Studio must prove a person who is both staff and a partner (ADR-0020). | Proving both roles is real. Two prompts are not: one staff passkey proves the same person; the roles are checked separately anyway. |
| B3 | **"Request a call" / "Read us this code"** for a partner owner's first passkey. Nobody is set up to call, and the person who would take the call and approve it in Frrata Admin was the owner themself, which the database refuses (`own_request`); with no other master admin **no one in the app could approve it**. | A stolen inbox alone must not create the first passkey (partner sign-in spec § Goal). The call reached a second channel (the phone on record), and the approver started the call (Lesson 12). | Partly real, but it never ran: the calling set-up does not exist and will not (owner, 2026-11-23). |
| B4 | **"Ask Pia to call you"** for a Lead's or Builder's first passkey. Pia must phone, ask "Did you start this call yourself?", type a code. | The same, with the partner owner as the second person. | The owner invited this exact email minutes earlier; the invite already proves the inbox. The call adds little and blocks the first hour. |
| B5 | **A lost partner owner's passkey waits 24 hours**, then still needs the call. | A stolen inbox must not quietly replace the owner's passkeys; the wait gives the real owner and Frrata time to see the emails and stop it (plan T1b "can't be talked out of Frrata"). | **Real.** The wait and the emails are the protection; the call after it is what goes. |
| B6 | **The heading says "Frrata approves your first passkey"** to an owner who already has one, until they press the button (`partner-gate.tsx`: the heading reads `opensAt`, which only exists after the request). | — | A wording bug. |
| B7 | **Two gates with different words for one job**: staff "Lost your passkeys?", "Add a passkey"; partner "Can't use your passkey?", "Create a passkey" (`passkey-gate.tsx`, `partner-gate.tsx`). Two passkey lists (Admin › Staff, Partner › Passkeys). Three code-approval boxes (Admin › Staff, Admin › Partners › Passkeys, Partner › Team). | — | Redundancy, no protection. |
| B8 | **When the browser has no matching passkey**, "Use passkey" opens a sheet with nothing in it, or an error, and the gate says only "Not confirmed. Try again". It never says where the person's passkeys are saved. Partner passkeys keep their password manager's name ("Google Password Manager"); staff passkeys do not (no `nameFor` on the staff ceremony). | — | Missing help, not a protection. |
| B9 | **The `passkeys_off` switch** hid every prompt for weeks, with no screen, set and cleared only in the SQL editor, so the owner never made a staff or partner check and found out on the day it mattered. Studio and "Give key" ignore it, so it also made Studio look broken. | Friction while testing (ADR-0007 amendment 2026-11-16). Its own stated risk: "a staff inbox alone opens Admin and support visits". | It removes a protection while on; it protects nothing. |
| B10 | **Checks last 12 hours, money and team actions ask again after 5 minutes.** | Cookie-stealing malware is limited to 12 hours and to no sensitive action without a fresh touch (staff spec § Security). | **Real**, and cheap (a fingerprint). Kept. |
| B11 | **Email code first, then a passkey**, every sign-in. | A passkey cannot start a Supabase session without the service-role key, which is deliberately absent (partner sign-in spec). | Real constraint. Kept. |

## C. The design, after the reviews

Five rules replace today's exceptions. Each says what it gives up. The options the reviews turned down are kept at
the end of each rule, with the reason.

### C1. One person, several roles (question i) — a staff check also makes the partner check, one way
- A staff passkey check, while the person is a live partner member (`app_pm_live`; one live membership a person,
  `partner_members_one_partner`, drizzle/0123), also **writes a `partner_stepups` row** for that membership and sets the
  partner cookie. A partner check never writes a staff row.
- **How:** `partner_stepups.passkey_id` becomes nullable; a new `staff_stepup_id` references `staff_stepups(id)` on
  delete cascade; a CHECK that exactly one is set (`num_nonnulls(...) = 1`); an index on it; its expiry is never later
  than the staff row's. Staff sign-out, expiry, a removed staff passkey or removal from staff ends the partner check and
  any Studio turn (`studio_turn_keys`, drizzle/0166). Same RLS, deny-all policy and no grant; revokes re-run.
- **Where the staff check runs:** only through Frrata Admin's passkey route as `frata_admin` (one definer writes both
  rows; no grant to `frata_app`; security M2). On /partner a staff person is sent to that staff check; everyone else
  gets the partner ceremony. A pure `checkFor(person)` chooses (architecture finding 3: no ceremony across two
  challenge tables).
- **Credential ids are unique across both tables** and the kind of check comes from the table whose public key verified
  the signature, never from the id (security M2).
- **Every reader stays as it is:** `app_partner_live_stepup`, `app_access_for`'s `pconf`, `app_studio_partner`, the
  ~30 workspace definers and `src/lib/studio` read a real partner row. Studio keeps two rows (ADR-0020's rule); only the
  prompt count changes, to one.
- **Give key** (device sign-in, G·3) stays partner-passkey only (it never reads `staff_passkeys` as `frata_app`). A staff
  person with a live partner check made by their staff passkey saves a partner passkey in one tap (the add rule:
  a live check in the last 5 minutes), then gives keys. Call 6.
- A partner owner's "Delete passkeys" for a Lead who is also staff ends the partner rows made from staff; the Lead's
  next staff check makes one again. Team names such a person's passkeys "Frrata staff passkey" (security L1).
- **Its safety depends on C2:** a staff passkey is only ever approved by another master admin or added with an existing
  staff passkey. If staff could save their own first passkey, a partner check made with it would prove only an inbox.
- *Turned down:* keep two separate sets (fixes nothing in B1, B2); one passkey per person for every role (the biggest
  build; a slip in "the strictest role decides" lets a partner-approved passkey into Frrata Admin).

### C2. First passkey, with no call (question ii)
- **Partner owner, Lead, Builder: saved at the first sign-in, nobody approves.** The invite (Lead, Builder) or Frrata's
  approval of the partner (owner) is the approval; the email code proves the inbox; the browser asks for the screen
  lock. Conditions (security M4, tenancy HIGH 4, architecture 9):
  - only while this person has no passkey now AND no `partner.passkey.add` audit row for this user, ever (any role), taken
    under a lock on the person, so a deleted passkey never reopens it;
  - only one passkey is saved this way;
  - only within 7 days of `partner_members.accepted_at` (Lead, Builder) or `partners.approved_at` (owner), or of the
    release day for people already waiting; unpausing never restarts it; after that it is a lost-passkey request (C3);
  - everyone concerned is emailed with the device, the city and the time (the person, the partner owner, every master
    admin for an owner);
  - if two sessions race, the one that lost sees "A passkey was saved for you" with **That wasn't me**: it deletes that
    passkey, ends its checks, emails everyone and moves the person to the approver path.
- **Staff: another master admin allows it** (security H1, architecture 10). The person asks on Frrata Admin's gate; a
  master admin presses **Allow passkey**, which shows a 6-digit code; the approver sends it by a channel they already use
  (WhatsApp, in person); the person types it on the waiting screen; it counts only for that request's browser session.
  The very first admin: `app_staff_bootstrap` in the SQL editor (unchanged).
- *Security cost, stated plainly:* for a partner person, whoever holds the inbox during that first sign-in can make the
  first passkey. A new partner owner has no client stores yet; a new Lead or Builder reaches the stores they were
  assigned in the invite (orders and shoppers for a Lead; the catalogue for a Builder). The partner owner is told at once
  and can delete it. After the first passkey, an inbox alone is no longer enough. It gives up the partner sign-in spec's
  "a second person for the first one" (that spec § Goal is amended).
- *Turned down:* the approver's one click with no code for every first passkey (the session race the code prevented;
  the person still waits); the code read aloud on a call (owner's ruling).

### C3. Lost passkey (question iii)
1. **Another device first.** "Use another device" opens the browser's own sheet (a phone's QR code, a security key).
   After it works: **Save a passkey on this device**, one tap. The owner's case was this.
2. **Ask for a new passkey.** One open request a person; a second request ends both and both screens say "Someone else
   also asked"; Allow is off while more than one exists (security M1, architecture 7). Allow names the request's id.
3. **Who allows it, and how:** the approver presses **Allow passkey**, which shows a 6-digit code; they send it by their
   own channel; the person types it on the waiting screen (it counts for that request's session only). The approver:
   - a Lead or Builder → their partner owner (in Team);
   - a partner owner → any master admin (Frrata Admin › Partners › Passkeys);
   - staff → another master admin (Frrata Admin › Staff).
   Approvers act only on their own partner's people, never their own request (`own_request` stays).
4. **If nobody allows it** (a Lead or Builder only): they save a new passkey themself **24 hours after the warning
   emails were sent** to them and to their partner owner (`staff_notices.sent_at`). No sent email, no self-serve
   (fail closed; architecture 6). A partner owner and staff never self-serve (security H2): an owner's real approver is
   Frrata, who can judge; a Lead's is their owner, who can.
5. **Stop request:** the email opens a page; stopping is a button after sign-in and a check (the approver, or the person
   with a passkey they still have), never a link click (scanners follow links). A stopped request closes self-serve for 7
   days. Any successful check by the person with a passkey they still have ends their open request.
6. **A partner owner's recovered passkey is limited for 72 hours:** it cannot delete other passkeys, hand over a store,
   invite people or give keys. The real owner can delete it; it cannot delete theirs (security H2).
- *Is 24 hours right for everyone?* A Lead with an owner around: no wait. An owner: no wait once a Frrata admin allows,
  and never alone. Staff: another master admin, always. A Lead alone: 24 hours from the emails, which is the protection.
- *Security cost:* the call is gone; the code now travels from the approver by a channel the approver chose, which keeps
  "never act on a call you didn't start" (Lesson 12). A Lead's stolen inbox left unseen by the Lead and their owner for 24
  hours replaces the Lead's passkey.

### C4. How often (question iv)
One check a sign-in for the whole person: a staff passkey makes the staff and the partner check together (C1). A check
lasts 12 hours; money and team actions ask again after 5 minutes (unchanged). Studio: one prompt. `CHECK_MS` and
`FRESH_MS` move into one pure module (`src/domains/auth/passkey-door.ts`), with the SQL's "12 hours" and "5 minutes"
pinned to them by a drift test. Lane D's card 1b keeps its two lines; for a staff person the partner line is Done as soon
as the staff one is, and the button reads "Use passkey" (their files do not change).

### C5. No matching passkey here (question v)
After "Use passkey" is cancelled or finds nothing: **"No passkey on this browser"**, with where the person's passkeys are
saved (password manager, saved, last used) and **Use another device** and **Ask for a new passkey**. After another
device works: **Save a passkey on this device**. Staff passkeys record their password manager's name too (`nameFor`).
WebAuthn cannot tell "none here" from "cancelled", so the help follows either.

### C6. The `passkeys_off` switch (question vi) — removed, last
It hid the prompts for weeks, nobody could see it, and a stolen admin cookie could turn it on for everyone (security L2).
Removed in the last phase, after the no-call path is live and the owner has passed a check on each browser
(architecture 2): delete the live row (the trigger audits it), replace `app_access_for` and `app_partner_need` with the
real check, drop `app_passkeys_off`, the trigger and `platform_switches`, remove `requirePartner`'s empty-step-up path,
turn proof § 88 and § 81's switch block into "no way in without a step-up". E2e seeding stays unreachable in production.
*Turned down:* keep it visible (a screen, a banner, 24 hours).

### C7. What a non-technical partner sees (question vii) — counted on the mockup
| Journey | Today | Proposed |
|---|---|---|
| A Lead, invite to clients | 8 screens · 6 decisions · a call from the owner, who does 4 steps in Team | 6 screens · 5 decisions · nobody else |
| A partner owner, approved to clients | 7 screens · a call from Frrata of unknown wait | 5 screens · 4 decisions |
| A new laptop, passkey on the phone | 4 screens | 4 screens, and the help names where it is |
| Every passkey lost | Lead: a call · Owner: 24 hours, then a call | The approver allows and sends a code (3 screens); a Lead alone, 24 hours |
| Staff and partner, opening Studio | 2 prompts | 1 prompt |

## D. Reviews (2026-11-23, on the proposal; each finding is fixed above or listed here)
| Agent | Verdict | Folded in |
|---|---|---|
| security-reviewer | 2 HIGH, 5 MEDIUM, 2 LOW — all fixed | H1 staff never self-serve (C2) · H2 no owner self-serve, 72-hour limits (C3.4, C3.6) · M1 one open request, code from the approver (C3.2–3) · M2 staff check only as frata_admin, unique credential ids (C1) · M3 the derived row (C1) · M4 "first" decided by user, lock, one passkey, That wasn't me (C2) · M5 Stop is a POST after sign-in (C3.5) · L1 Team label (C1) · L2 remove the switch (C6) |
| tenancy-auditor | No CRITICAL; 4 HIGH, 2 MEDIUM, 1 LOW — all fixed | A row, not a read (C1) · nullable `passkey_id` + `staff_stepup_id` (C1) · Give key's counter in the right table: moot, Give key stays partner-only (C1) · "ever had a passkey" for every role (C2) · Allow and Stop scoped to the partner (C3.3) · recreate readers before dropping the switch (C6) · proofs below · corrected the "same bar as a store owner" claim (C2 cost) |
| architecture-reviewer | 2 BLOCKER, 8 MAJOR — all fixed | the mechanism (C1) · phase order (Phases) · one ceremony per person (C1) · Give key decided (C1, call 6) · one engine `passkey-door.ts` with a drift test (C4) · 24 hours from sent emails (C3.4) · the race (C3.2) · Stop not a link (C3.5) · the window from release day (C2) · staff one rule (C2) |
| words-reviewer | 30 lines on the mockup | rewritten in the mockup; "Master admin" kept (the house term, admin-and-partner.md § 28) |

**Proofs to add to `scripts/verify/tenancy.sql`:** § 79 — a staff check makes a partner row for the live membership
only; after leaving and rejoining the old row counts for nothing; removing staff or staff sign-out removes it; partner
sign-out leaves the staff check; a staff hash passed as the partner hash counts for nothing; a partner check never sets
`staffConfirmedAt`. § 82 — a Builder with a derived check still reaches only builds. § 91 — one staff check binds Studio;
a new staff check or staff sign-out ends `app_turn_actor`. § 81 and § 88 — the switch table and function are gone, no
`prosrc` mentions them. New — deleting a Lead's passkeys never reopens the first-passkey path; another partner's owner
can neither Allow nor Stop.

## Phases (each usable alone; migrations numbered at merge, after lanes C, D and F)
- **P0 · no migration:** the "first passkey" heading bug (B6, `partner-gate.tsx`); C5's "No passkey on this browser";
  staff "Save a passkey on this device"; `nameFor` for staff; one gate body for both surfaces (the frames stay apart);
  the pure `passkey-door.ts`.
- **P1 · migration A:** C1 (the derived partner row, the staff check through Frrata Admin's route, unique credential
  ids); Studio with one prompt; the new proofs. Ends the owner's dead end.
- **P2 · migration B:** C2 and C3 (first passkey at first sign-in; Allow passkey with the approver's code; Lead
  self-serve 24 hours from sent emails; Stop request; the owner's 72-hour limits); one `PasskeyRequestCard` in Frrata
  Admin › Staff, Frrata Admin › Partners and Team; `ReadCode`, the Approval step and "Did you start this call yourself?"
  retired; open requests closed and each person emailed; new email words (`staff-security.ts`, `staff-notices.ts`).
- **P3 · migration C:** C6, after P2 is in production and the owner has passed a check on each browser.
- **Regression net first** (rule 5): e2e 75 (code → Allow with a code), 80 (call, decline and code go), 40 (Frrata Admin
  › Partners › Passkeys), 86 (a Builder's first passkey), 97 (Give key after a staff check); unit tests for
  `passkey-door.ts`; the proofs above.
- **Docs amended with each phase:** ADR-0007 (the one-way rule; the 2026-11-16 switch amendment struck in P3), ADR-0020
  (one prompt, two rows), frata-architecture § Auth (the partner passkeys bullet), the partner sign-in spec § Goal, the
  staff passkeys spec, frata-design-language `reference/admin-and-partner.md` (the request card), the comments in
  drizzle/0167 and `device.ts` that name the switch.

## Design
Mockup: https://claude.ai/artifact/85e3WTLUVDFYjMnJYC2JG4 (`docs/mockups/2026-11-23-passkeys-simpler.html`). Screens 1–3 every day ·
4–6 first time · 7–10 lost · 11–13 approvers · 14–16 Studio and passkeys · the before and after count · the calls.

## Design review
- **UI/UX** — one job a screen, one primary action; states drawn: busy, cancelled, none here, waiting, allowed, stopped,
  someone else also asked, expired invite, signed out; phone and desktop. Focus moves to each new heading (as today).
- **Tenancy** — no new tenant table; the partner check stays bound to one membership; § D's proofs.
- **Modularity** — rules in `src/domains/auth/passkey-door.ts` (pure); the two stores stay apart (frata_admin and
  frata_app, ADR-0007); one gate body; one request card.
- **SSOT/DRY** — 12 hours and 5 minutes in one module, pinned to SQL; "first" from the audit rows, once.
- **YAGNI / KISS** — see Out of scope; no new table but one column and one CHECK.
- **Performance** — the staff confirm writes one more row; no new read on any page (the partner check is still one row).
- **Reliability** — the security emails gate self-serve (sent, or no self-serve).
- **Security** — § D.
- **Motion and visuals** — today's patterns; no new motion.
- **Unit economics** — n/a, no money moves.
- **Storefront API** — n/a; Give key unchanged.
- **Blast radius** — `requireStaff`, `requirePartner`, `accessOf`, `app_access_for`, Studio's door (unchanged), device
  codes (unchanged), e2e 40, 75, 80, 86, 97.

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
