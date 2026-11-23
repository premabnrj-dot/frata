# Add a partner to a store (and so change partner)
Status: draft · Date: 2026-11-23 · Mockup: pending (`docs/mockups/2026-11-23-add-partner.html`) · Approved: —

## Goal
Ranked problem 5 (a premium storefront built as code by a partner; partners get the builder first). Today a brand that
started its own store, or removed its partner, can never take one on, so the website-as-code path is shut for it.
Measure: stores with a partner they did not start with (count of `partner_links` on a tenant whose first link is not
the partner who created it), and invitations sent vs accepted, read in Admin after 30 days.

## Job
A store owner wants a partner to build or run their website and has no way to bring one in; the owner asked for this
(2026-11-23: "how do a merchant change his partner? align one? i'm unable to do that").

## What exists (read in the code, 2026-11-23)
- A store gets a partner only when the partner creates it: `app_partner_create_shop` writes the `partner_links` row with
  `share_bps 2000`, `share_months 24`, `notice_days 90` from `PARTNER_TERMS` (`src/domains/partners/terms.ts`).
- One live link per store: `partner_links_one_active` (unique `tenant_id` where `removed_at is null`, drizzle/0022).
- The owner can only remove: Settings › People › "Remove <partner>" → `removeShopPartner` → `app_remove_partner`
  (drizzle/0124), owner only, not in a support session (`page.tsx` `canRemove`). The share keeps running `notice_days`.
- The hand-over is the reverse flow and the pattern to copy: an `invites` row, a definer that re-checks, an hourly limit
  (`LIMITS.partnerInvite`, fail closed), a notice by email.

## Research
- Shopify collaborator request: the partner sends a request; the owner approves in Settings › Users; a 4-digit
  collaborator code the owner can require. Taken: a code the owner gives, and the owner's yes is the last word.
- Stripe Connect / Razorpay partner referral: the platform side sends a link, the account holder accepts. Skip:
  that is our existing hand-over direction.
- Linear workspace invite: an invite row with an expiry, revocable, listed as "Pending". Taken: pending row with Cancel.

## Design (mockup, one phase)
1. **Partner code** (recommended way to name a partner, call C1). Each partner has one code in its workspace
   (Clients › "Your partner code", e.g. `7Q4M-K2XP`: 8 characters from 30, ~39 bits, no name in it) with Copy and "New code".
   The partner gives it to the brand. Codes are never listed or searchable.
2. **Settings › People, owner, no partner:** a row "Add a partner" → dialog: field "Partner code" → "Find" shows the
   partner's business name and city only → "Send invitation". Wrong code: "No partner has this code." (same words for
   a code that does not exist, a partner not approved, or paused). Rate limit: 10 lookups an hour per store and per
   user, fail closed.
3. **Waiting:** People shows "<Partner> · Invitation sent · Expires 30 Nov" with "Cancel invitation". Expires after 7 days.
4. **Partner workspace › Clients › Invitations:** "<Store> asks you to be its partner" → Accept / Decline. Accept dialog
   states the terms (C2) and the access (role partner, like a handed-over store). Only the partner owner accepts.
5. **Accepted:** the `partner_links` row is written in the accepting transaction; People lists the partner as today,
   "Since <date>". The owner is emailed. **Declined or expired:** People shows "<Partner> didn't take this on" /
   "Invitation expired" with "Add a partner" again; no reason is ever shown.
6. **Change partner** = Remove (exists) then Add. Between the two People shows "No partner" with "Add a partner". A one-step
   "Change partner" is left out (YAGNI; signal: owners asking twice, or removals followed by an add within a day).
7. **Emails** (notices path, outbox, ADR-0006): to the partner owner "<Store> asked you to be its partner"; to the store
   owner "<Partner> is now your partner" / "<Partner> didn't take on <Store>".

States drawn: no partner; invitation sent; accepted; declined; expired; code not found (covers not a partner, not
approved, paused); store already has a partner (no Add row; a second invite is refused by the definer); the owner's
own partner (an owner who is also a partner person typing their own code: refused, "This is your own code. Enter your partner's code." — not "You can't be your own store's
partner." — they're already a member); Manager or Staff and a support session (read only: the pending row shows, no
buttons); phone.

## Terms (call C2) — money; unit-economics-reviewer
The share is paid out of Frrata's fee; the brand pays the same either way. Worked from `shareExample()`
(`src/domains/partners/example.ts`; the example brand: 120 delivered orders a month at ₹1,200, ex GST):

| Option | Launch (₹1,499 + 2%) | Growth (₹4,999 + 1%) | Frrata keeps (Launch) |
|---|---|---|---|
| A. Same as a store they built: 20% for 24 months | ₹875.80/mo, ₹21,019.20 over the term | ₹1,287.80/mo, ₹30,907.20 | ₹3,503.20/mo |
| B. Half: 10% for 12 months | ₹437.90/mo, ₹5,254.80 | ₹643.90/mo, ₹7,726.80 | ₹3,941.10/mo |
| C. No share (recommended) | ₹0 | ₹0 | ₹4,379/mo |

Frrata collects ₹4,379 a month from the Launch example (₹1,499 plan + ₹2,880 order fee). Recommendation **C**: the share
pays partners for bringing a brand Frrata did not have; an invited partner did not bring it, and a brand that removes
one partner and adds another would otherwise pay two shares (the old one runs its 90 days of notice). The partner is
paid by the brand directly for the work. The link stores `share_bps 0` with `share_months 1` (the CHECK needs > 0) and
`notice_days 0` (a workaround for the CHECK, said in the migration comment). unit-economics-reviewer (2026-11-23), all
taken into the build: (a) `app_partner_clients` carries `share_bps` and `clients.ts` drops its 20% fallback, else an
invited store reads "20% from opening"; (b) a 0 bps link shows no share line (`monthShare(m, 0)` would print "₹0");
(c) Scale: A pays ₹3,143.80 a month, ₹75,451.20 over the term. Under A or B the accept definer must also set
`share_starts_at` for a store already open (the trigger fires only on first publish, drizzle/0023), and the old
partner's 90-day notice overlaps for up to 4 invoice months. Test of C: ask 5 approved partners before building; if
under half would accept at 0%, revisit B. If the owner picks A or B, the
terms come from a second constant beside `PARTNER_TERMS` (`INVITED_TERMS`), snapshot on the link as today.

## Design review
- **UI/UX** — one primary action per state (Add / Cancel / Accept). Recognition over recall: the owner sees the
  partner's name before sending. Error prevention: the definer refuses a second invite; the Add row is absent when a
  partner is linked. Feedback: the row changes state; a toast on send and cancel. Keyboard: dialog primitives.
- **Tenancy** — new table `partner_requests` (`tenant_id`, `partner_id`, `created_by`, `created_at`, `expires_at`,
  `accepted_at`, `declined_at`, `cancelled_at`), grant, RLS, tenant policy in the same migration. The console side
  writes and reads inside `withTenant` with the tenant from `requireMember(['owner'])`; nothing takes a tenant id from a
  body. The partner side reads and answers only through definers keyed on the caller's own partner
  (`app_partner_requests(uid…)`, `app_partner_answer_request(caller, id, yes)`), which check the request's `partner_id`
  is the caller's partner and the caller is its owner (the partner-step-up check as the other workspace writes).
  The code lookup is a definer that returns name and city only for one exact, approved, unpaused code. One live request
  per store (partial unique index on `tenant_id` where none of the end stamps are set).
- **Modularity** — code alphabet and format in `src/domains/partners/code.ts` (pure); definers in a custom migration;
  `src/lib/db/partners.ts` gains four wrappers; actions in `settings/people/actions.ts` and the workspace `clients/`.
- **SSOT** — state of a request derived from its stamps and `expires_at` (pure `requestState()`), no status column.
  Terms snapshot on the link at accept, as today.
- **YAGNI** — no one-step change, no search or directory of partners, no email-based invite, no partner-initiated request.
- **KISS** — one table, one code column on `partners`, five definers, two notices.
- **Scalability** — a few rows per store a year; indexes on `tenant_id` and `partner_id`.
- **Performance** — People adds one indexed read in its existing `withTenant`; the workspace Clients one definer call.
- **Reliability** — emails go through `enqueue()` in the same transaction as the request or answer.
- **Security** — code lookups limited (10/h per store and per user, fail closed) and constant words for every miss;
  39-bit codes; "New code" invalidates the old one and any request not yet answered stays (it names the partner, not the
  code). Zod: code `^[A-Z0-9-]{9}$` after upper-casing. Accept needs the partner owner and a step-up, like hand-over.
  Replies name fields only.
- **Motion and visuals** — existing dialog and row patterns; nothing new.
- **Unit economics** — C2 above; with C, Frrata's revenue per invited store is unchanged.
- **Storefront API** — n/a; build keys already follow the partner membership (ADR-0018).
- **Blast radius** — `app_remove_partner` must also cancel an open request; `partner_links_one_active` still guards one
  partner; Clients (`_components/clients.ts`, `clients/[link]/page.tsx`) must read `share_bps 0` as no share line.

## Out of scope
One-step change; a partner asking a store; a partner directory. Each comes back on owner request.

## Review findings taken into the design (2026-11-23)
security-reviewer (code over email confirmed; all fixes taken):
1. HIGH: a support visit cannot send. The action refuses `supportSessionId` (as `removeShopPartner`), and the send
   and cancel definers require the caller's own `members` row with role owner (as `app_remove_partner`).
2. Find returns name and city, never an id. Send re-submits the code; one definer resolves it and inserts the
   request in the same transaction.
3. Limits, all failing closed: lookups 10 an hour per store and per user, plus one across all stores; sends 5 a day
   per store; requests 20 a day per partner; open requests per partner capped in the definer.
4. The store owner is emailed on send too, and the Send dialog says what the partner will see.
5. `app_partner_answer_request` locks the tenant and request rows (`for update`), requires the request open, not
   expired, no live link, the tenant's owner still `created_by`, and `app_partner_need(..., true)` inside it; it
   refuses `already_member` when the partner owner already has a row on the store. While `passkeys_off` is live the
   step-up is email only.
6. Under C there is no share to game; under A or B a re-link to a past partner is refused.
7. The send definer stamps expired open rows (`expired_at`) before it inserts, so an expired one frees the slot.
8. Codes from `crypto.randomInt`, unique index, on `partners` (unreadable by `frata_app`). Input normalised (spaces
   and dashes dropped, O→0, I→1) then `^[<30-char alphabet>]{8}$`. Every miss is one query, one reply. "Make a new
   code" is partner-owner only, limited, audited.
9. Store and partner names in emails are escaped text, never links.

## Plan, written at sign-off (check:plans admits a plan only once approved)
### Tasks (after approval)
1. Regression net first: an int test for `app_remove_partner` and hand-over still passing; e2e flow for People.
2. Migration (generated): `partner_requests`, `partners.code`; custom: grant, RLS, policy, five definers. Verify:
   `npm run verify:tenancy` with new sections (a partner reads only its own requests; a store only its own).
3. `src/domains/partners/code.ts` + `requestState()` with unit tests.
4. Console: People rows and dialog, actions (owner only, limit, Zod). Verify: int test of every refusal.
5. Workspace: code card, Invitations, accept dialog. Verify: int test (Lead and Builder refused; owner accepts).
6. Notices: two emails through `enqueue()`. Verify: outbox row in the same transaction.
7. mockup-parity-reviewer, impact-reviewer, words-reviewer, design-system-reviewer.

### Deviations
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|

Review lines for the plan: tenancy-auditor 3 high, 4 medium, 2 low; security-reviewer 1 high, 5 medium, 3 low; unit-economics-reviewer C; words-reviewer 8 rewrites applied — all 2026-11-23.
