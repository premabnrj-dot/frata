# Partner sign-in: email code, then a passkey, and a second person for the first one
Status: built and live 2026-11-15 (owner: "approved, go ahead and build T1b"; migrations 0128/0129 in production) · Date: 2026-11-15 · Mockup: https://claude.ai/artifact/Cway5SSahPgQeuCo2UmdTJ
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

## Deviations in the build (BUILT AS DRAWN; shown to the owner before it ships)
| Screen | Drawn | Built | Why |
|---|---|---|---|
| 4 (email) | Subject "482913 is your Frrata code" | "482913 is your Frrata sign-in code", body unchanged | One email template for every sign-in (brands too); its words are the brand sign-in's |
| 4 (link page) | Partner frame with the PARTNER tag | The public frame, no tag | /auth/confirm serves every sign-in's link, so it can't say PARTNER |
| 9 | "Amber Looms · Basil Prints" under "You're in" | Left out | The stores are read only after the check; "Open your clients" shows them one tap later |
| 12 | "This invite is for arjun@…" | "No invite for this email" + the signed-in address | The page finds an invite by the signed-in email; another account can't learn which address an invite was for |
| 16 | "Back to Clients › Kesar Studio" | "Back to Team" (the page's name only) | The path is known, the store a page was showing is not |
| 17 | "Hand Kesar Studio to Riya?" · "Hand over to Riya" | "Hand Kesar Studio to its owner?" · "Hand over" | The owner's name isn't known before the invite; the body reads "It's theirs once the invite is accepted." |
| 10, 17, 22 | The passkey icon on Approve, Hand over, Delete | The passkey is asked for when the last check is older than 5 minutes | The database's rule (5 minutes); asking every time added a prompt with no gain |
| 20 | "Invite ended" with "Invite again" | "Invite ended" with Withdraw | An ended invite can't be sent again until it's withdrawn (one row per address) |
| — | (not drawn) | "Pia declined the request" + "Get a new code" on the Lead's gate | The state after Decline (screen 10) needs a screen |
| all | A dashed haldi stripe under the stage | The brand's woven edge (`Selvedge`, as on /login) | The mockup's stripe stood for the selvedge; the real one is the brand's single block-print element |
| 2 | "Resend in 0:24" (30 s) | "Resend in 1:00" (60 s) | Supabase refuses a second email to one address within a minute |
| 3 | The email's big code and "Sign in on this device" | The sign-in email's own layout and words ("Sign in") | One template for every sign-in (row above) |
| 6 | "Pia invited you as Lead" | "pia@pixelthread.in invited you as Lead" | The invite records the inviter's email, not a name |
| 10 | The card inline on Team, Yes pre-chosen, Not now left | A dialog from "Approve Arjun" on the row; neither answer chosen; the dialog's button order | A default answer would let the approver skip the one question that stops a social-engineering call; the dialog is the house pattern |
| 14 | "on this laptop" | "on this device" | The app can't tell a laptop from a phone |
| 15 | A full-width "Use passkey" | The dialog's button, with "Sign out" beside it | The Dialog primitive; a way out when no passkey is to hand |
| 18 | Title and Add inside one card | The page header carries "Passkeys" and "Add a passkey"; the backup line below the list | The workspace's page pattern (PageHeader) |
| 20 | "Delete passkeys" on one "lost phone" row | On every Lead with a passkey | Frrata can't know which phone is lost; the owner chooses |
| 20 | Team rows only | Also the T1a controls (stores, Remove/Withdraw, Invite, the owner's own row) | Approved in the Studio mockup's Team (T1a) and still needed |
| all gates | — | "Sign out" under each gate screen | A shared device must be able to leave the gate |
| 24 | Dates without a year | Dates without a year on Join; with it on the owner's 24-hour line | The opening time can cross a year |

## Changes this needs in T1b's database layer (before 0129 reaches production)
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
