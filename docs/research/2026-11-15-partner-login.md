# Partner sign-in: research (checked 2026-11-15)
For the partner login redesign (owner, 2026-11-15: "redesign the whole login ui/ux for the partner"). Most vendor help
pages carry no date: marked "undated (live 15 Nov)". FIDO's design guidelines (passkeycentral.org) are undated and
consumer-aimed (2024 material): not relied on.

## Products
| Product · date | Steps | Wording | Recovery | Invite |
|---|---|---|---|---|
| Shopify · undated | Passkey in the email field (autofill), a passkey button, or email then passkey; QR for a phone | "Sign in with passkey", "Continue with email", "Log in using a different method" | Email code; last resort an ID check that wipes every passkey | — |
| Stripe · undated | Passkey button, then the browser prompt | "Sign in with passkey" | not documented | Team › Add member |
| GitHub · undated | Passkey button; phone by QR; sudo mode re-checks before sensitive actions | "Sign in with a passkey" | Recovery codes, or email plus a known factor, reviewed by a person | — |
| Vercel · 2026-08-28, 2026-05-08 | Passkey button; a passkey counts as 2FA | — | One-time recovery codes | 7-day invites; "Pending Invitations" marks expired |
| Linear · undated | "Continue with Email", then the link or "Enter code" | "Enter code" | Admins can use any method | Pending invite count in the workspace menu |
| Notion · undated | Passkey button | "Continue with Passkey" | "use another sign in method" | — |
| Razorpay · undated | Email plus OTP; no dashboard passkey found | — | Owner resets a member's 2FA | — |
| Zoho · undated | Passkey, a OneAuth push with number match, or QR | — | — | — |
| Google Workspace · undated | Admin turns on "skip passwords" | — | Admin generates backup codes for a locked-out user | — |

## Taken
1. Passkeys in the email field's autofill (`username webauthn`); Chrome 149 "immediate mode" can show saved accounts at
   once (Chrome I/O, 2026-05-21, https://developer.chrome.com/blog/io26-web-identity).
2. Immediate check for returning users and re-checks, quiet fallback without a passkey; Signal API so deleted passkeys
   stop appearing (Authsignal, 2026-07-02).
3. No passwords at Frrata, so automatic passkey upgrade does not apply: our own "Create a passkey" screen (Chrome, as 1).
4. Words: "Sign in with a passkey", "Create a passkey", "Delete"; name the password manager that holds it, not the
   device; lead with the benefit (Android passkey guidance, undated).
5. Offer a passkey after email sign-in, after recovery and after a re-check; say anyone who can unlock the device can
   sign in (passkeys.dev bootstrapping, 2025-10-31, two weeks outside the window; Google user journeys, undated).
6. On phones a code beats a link; send both in one email (2026-05-06).
7. Email scanners open links and use the token: the link opens a page with a button that signs in, never on load
   (Supabase troubleshooting, undated).
8. One code box that accepts paste and `one-time-code`; split digit boxes that refuse paste fail WCAG 2.2 SC 3.3.8;
   recovery without memory tests (W3C Understanding, 2026-09-06).
9. India is 93.89% Android (StatCounter, September 2026). Gmail OTP autofill in Chrome Android is an experiment. Put the
   code in the email subject (our inference). WhatsApp codes: vendor claims only.
10. Apple's recovery contact only reads a 6-digit code to the locked-out person and gets no access (Apple, 2026-09-14).
11. 1Password: the member starts recovery, an admin finishes it; no one recovers themselves; keep two or more with that
    right (1Password, undated).
12. Social engineering of help desks for new MFA registrations (Health-ISAC via Paubox, August 2026): an approver needs
    context and the rule "never act on a call you didn't start".
13. After a session ends, sign in again without losing work (WCAG 2.2.5, W3C 2025-11-17).
14. Recovery that wipes passkeys says so before the person commits (Shopify).

## Recommended flow (to draw)
1. **Sign in:** "Sign in to Frrata"; email with passkey autofill; Continue; "Sign in with a passkey". An email with a
   passkey on file goes straight to the prompt, with "Send me a code instead".
2. **Check your email:** "We sent a code to a•••@studio.in"; one code box; "Resend code" after 30 s; "Use a different
   email"; subject "482913 is your Frrata code"; the link opens "Sign in on this device?" + Sign in.
3. **Create a passkey:** "Sign in faster next time"; "Anyone who can unlock this device can sign in"; then "Passkey saved
   to Google Password Manager".
4. **Ask a teammate:** first passkey or lost devices: read the code by phone; the approver sees a "Review request" card
   (name, email, device, city, time), "Did you start this call yourself?", types the code, Approve; the owner and the
   team are emailed.
5. **Join a team:** one screen: "Join Studio Kiln", who invited, the email locked, "Accept invite"; then 2–4 with
   "Step 2 of 3"; a different signed-in email gets "Switch account". The inviter sees Invited · days left → Waiting
   for your approval → Joined, or Expired · Resend.
6. **New device:** passkey with the phone QR option; else "No passkey here? Use your phone, or get an email code".
7. **Second passkey:** Settings › Sign-in rows ("Google Password Manager · added 3 Nov · used today · Delete"); one
   passkey only → "Add a backup passkey on another device".
8. **Lost every device:** "Can't use your passkey?" → email code → teammate approval (an owner → Frrata, with a wait);
   "Your old passkeys will stop working" before it starts.
9. **Re-check before hand over:** a dialog "Confirm it's you", "Use passkey"; no email-code fallback; typed work kept.
10. **Signed out:** "You've been signed out", "Sign in again" back to the same page; warn before the 12-hour check.

## Failures to avoid
Links that sign in on load; split digit boxes; a passkey prompt with no words; every method at once; an email code as
the hand-over re-check; recovery weaker than sign-in; approvals with no context; wiping passkeys without warning; a
dead end on the wrong signed-in email; invites that expire silently; work lost at sign-out.
