# Partner sign-in: email code, then a passkey, and a second person for the first one
Status: active (owner 2026-11-15: "approved, go ahead and build T1b") · Date: 2026-11-15 · Mockup: https://claude.ai/artifact/Cway5SSahPgQeuCo2UmdTJ
`docs/mockups/2026-11-15-partner-login.html` · Approved: owner, 2026-11-15 · Owner (2026-11-15): "I would like to redesign the whole
login ui/ux for the partner." · Research: `docs/research/2026-11-15-partner-login.md` · Database: T1b (drizzle/0127,
0128; not applied to production).

## Goal
Ranked problem (5), a premium storefront built by partners: a partner's workspace holds many brands' sites and the
hand-over of each, so one stolen inbox must not be enough to take them. Measures: no partner workspace write without a
live passkey check (the proof in `scripts/verify/tenancy.sql` § 79); a new Lead from invite to first client in one
sitting (median ≤ 10 minutes, from the first 20 invites); zero support tickets for "can't sign in" that need a database
change.

## Job
A partner's owner and team sign in from any device, join a team from an invite, and get a passkey approved by someone
who knows them, without a password and without a way round it.

## Design (the mockup, 22 screens)
- **Sign in (1–5):** Work email → "Continue with email" → one code box (paste and `one-time-code`), Resend after 30 s,
  "Use a different email"; the email carries the code in its subject and a link that opens "Sign in on this device?"
  (never signs in on load); then "Confirm it's you" with the passkey prompt. The email code lasts the session (30 days,
  `SESSION_COOKIE`); the passkey check lasts 12 hours.
- **First time (6–12):** Join (who invited, the clients, the email locked, Accept invite; a wrong signed-in account gets
  "Switch account") → "Ask Pia to call you · Read Pia this code" (15 minutes, "Get a new code") → "Sign in faster next
  time" → Create a passkey → "Passkey saved to Google Password Manager". The approver's card: who, device, where,
  asked; "Did you start this call yourself?" (No disables Approve, says "Hang up and call Arjun on a number you know",
  offers Decline request); the code; "Approve Arjun" with the passkey icon. A partner's owner gets "Frrata approves your
  first passkey": Frrata calls the phone on file and the owner reads the code.
- **Every day (13–16):** another device uses the phone's passkey (QR), then offers a passkey for this laptop; a warning
  10 minutes before the 12-hour check, the check in place with the work kept; "You've been signed out" returns to the
  same page.
- **Safety (17–22):** hand over asks for the passkey again (5-minute freshness; never an email code); Passkeys (named by
  the password manager, "This device", Delete, a backup prompt with one passkey); "Can't use your passkey?" → "Ask Pia
  for a new passkey", then delete the lost one; the owner's own recovery opens after 24 hours; Pia's Team shows Active,
  waiting for your approval, Invited · days left, Invite ended, and Delete passkeys with its confirm.

## Deviations from the research (with reasons)
| Research | Drawn | Why |
|---|---|---|
| 1, 2: passkey in the email field's autofill; a passkey signs in without an email | Email code first, passkey after | A passkey cannot start a Supabase session without the service-role key, which is deliberately absent (CLAUDE.md). The passkey is a second step on a 30-day session; the 12-hour check is where people meet it daily |
| Flow 8: "Your old passkeys will stop working" | Old passkeys stay until deleted; the screen says to delete the lost one | T1b's recovery adds a passkey and wipes nothing; Pia or Frrata can delete all of a person's passkeys |
| Flow 4: the locked-out person calls | The approver calls | Lesson 12: "never act on a call you didn't start" |
| Lesson 9: WhatsApp codes | None | Vendor claims only; EkCode's number is not for this |

## Changes this needs in T1b's database layer (before 0128 reaches production)
1. **Decline:** `app_partner_pk_decline(uid, session, stepup, member)`: the owner ends a member's open request; the
   member's screen says it was declined. Proof in § 79.
2. **Context on the request:** `partner_passkey_requests.device` (text, ≤ 60, from the user agent, e.g. "Chrome on
   Android") and `city` (text, ≤ 60, from Vercel's `x-vercel-ip-city`), shown only to the approver and Admin, deleted
   with the request. PII note: a city, kept for the request's 15 minutes (48 hours for an owner's).
3. **Partner sign-in page:** `/partner/sign-in` with the PARTNER tag, the same email-code action as `/login`; `/login`
   keeps the brand's words. Invite links land on Join.

## Design review (short; the full review runs on the build plan)
- **UI/UX:** one primary action per screen; the code box takes paste; no dead end on a wrong account; approvals carry
  context; the hand-over check keeps typed work; phone drawn at 390 px.
- **Tenancy:** unchanged from T1b: every partner table has no grant (definers only); the approver must own the same
  partner; Admin reads through `admin_partner_pk_*`.
- **Security:** the request code is hashed with a prefix; tries are limited per session; the owner's recovery waits 24
  hours and emails Frrata's admins; an approval needs the approver's fresh passkey check.
- **Unit economics:** none (email codes run on the existing sender).
- **Blast radius:** `/login` (unchanged words), `requirePartner`, `app_access_for`, the partner workspace's actions,
  Admin › Partners.

## Out of scope
Passkey-only sign-in (needs a session minted from a passkey; returns if Supabase supports it without a service key) ·
SMS (owner, 2026-11-09) · recovery codes (one more secret to lose; returns if support tickets show the teammate route
fails).
