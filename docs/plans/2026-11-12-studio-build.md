# Studio and partners: the build
Status: active (owner, 2026-11-12: "build now", after the v2.4 Studio and Admin mockups) · Specs:
`docs/specs/2026-11-12-studio-intake-and-team.md`, `docs/specs/2026-11-12-studio-shell-clients-billing.md`,
`docs/specs/2026-11-12-admin-partners.md`, `docs/specs/2026-11-11-frrata-studio.md`, ADR-0015 (proposed) ·
Mockups: https://claude.ai/artifact/KiqKqrFCx4enB8KUrnh5Du, https://claude.ai/artifact/PaRX2MLsw11JDH6dFdbMCv

## Order (each phase ships alone, push to `main` after its gates)
| Phase | What a partner can do after it | Needs first |
|---|---|---|
| **T1a Teams** (built 2026-11-12) | An agency owner invites Leads, gives each the brands they work on, removes them; Admin sees a partner's team and can suspend a partner | nothing (this plan) |
| T1b Partner passkeys | Every partner person signs in with a passkey; publish and hand over ask again | T1a |
| T1c Builders (ADR-0015) | Invite Builders who never see orders, shoppers or costs | T1a, T1b; ADR-0015 accepted |
| P2 Clients | Clients view: stage, next, the partner's own billing records, share | T1a |
| C1 Studio credits | Seat, top-ups by UPI with GST invoices, ledger, budgets, reserve and release | Frrata's own payment account for partners; the owner's sign-off on seat pricing |
| A1 Admin credits and payouts | Admin's credits and payouts screens | C1; payouts also Phase 6 and the CA |
| V0 Decisions | Hosting ADR (amends ADR-0005); ADR-0002 storefront-key amendment | the owner |
| V1 Storefront API SA1 + kit + Starter 0 | A developer builds a site on the API | V0 |
| V2 Hosting | Sites deploy to their own domain; previews; handover | V0, V1 |
| V3 Studio | The one-session chat: intake, brand, design system, pages, build, publish, hand over | V1, V2, C1, T1c |

Studio itself (V3) cannot be built before V1 and V2: a site has nothing to read and nowhere to run. The phases before
it are real work a partner uses today.

## T1a · Teams: Owner and Leads
As built: migrations 0123 (tables) and 0124 (access), proof §77, e2e `80-partner-team`. Review changes folded in before
code: handover stays owner-only until T1b; suspend deletes partner people's shop rows and reinstate rebuilds them from
assignments; the applicant is the owner member from apply; 7-day invites, ≤ 50 people, 20 invites an hour; a
colleague never accepts a handover; create-shop locks per partner.
Spec: intake-and-team § Partner teams (reviews folded in). Builders wait for T1c; passkeys for T1b.

### Regression net (before the change)
- `npm run verify:tenancy` § 28 (partners) passes as is; e2e `40-partners` passes as is. Both stay green after every task.

### Tasks
1. **Migration 0123 (tables, generated) and 0124 (custom; planned as 0117):**
   - `partner_members (id, partner_id → partners, user_id null until accepted, email lowercased, role ∈
     owner|lead|builder (builder refused by every definer until T1c), invited_by, invited_at, accepted_at, removed_at,
     removed_by)`. Unique active `user_id`; unique active `(partner_id, email)`.
   - `partner_assignments (partner_member_id → partner_members, tenant_id → tenants, created_at)`, PK both.
   - `members.partner_member_id` (nullable, FK) and `partners.suspended_at, suspended_by, suspend_reason`.
   - Backfill: each partner's `user_id` becomes an accepted `owner` member; each `members` row with role `partner`
     gets that member's id. Then CHECK `(role = 'partner') = (partner_member_id is not null)`.
   - Grants: none to `frata_app` (definers only); revoked from `anon, authenticated, service_role`; RLS on with a
     `restrictive definer_only using (false)` policy for `frata_app`; `frata_admin` select on both, and update of the
     suspend columns on `partners`.
2. **Definers (0117 custom), each `search_path = ''`, revoked from public/anon/authenticated/service_role:**
   - New: `app_partner_team(uid)`, `app_partner_invite(uid, email, tenants uuid[])` (owner only; role lead; each
     tenant an active link of the caller's partner), `app_partner_my_invites(uid)`, `app_partner_accept(uid, member)`
     (bound to the confirmed email; one active partner per person; a brand where the person is already a member is
     skipped and named), `app_partner_assign(uid, member, tenant)` / `app_partner_unassign(...)` (owner only;
     derive everything), `app_partner_remove_member(uid, member)` (owner only; never the owner row; ends memberships,
     assignments, the shop invites they made, in one transaction), `admin_end_partner(staff, partner, reason)` and
     `admin_reinstate_partner(staff, partner)` (frata_admin only).
   - Rewritten: `app_my_partner` (any active member; returns the member's role; refuses a suspended partner),
     `app_partner_clients` (owner all, lead assigned), `app_partner_create_shop` (owner or lead; the owner always
     gets membership too), `app_handover_invite` (owner, or a lead assigned to that shop), `app_my_handovers` and
     `app_accept_handover_v2` (refuse any active member of the linked partner), `app_shop_people` (label by
     `partner_member_id`), `app_remove_partner` (every partner person's membership), `app_access_for` (a partner row
     counts only while its member is active, the partner approved and not suspended, the link active).
3. **`scripts/verify/tenancy.sql` § 28b:** owner invites a lead to one of two shops; the lead sees one client; another
   partner's owner can't assign or invite into it; the lead can't invite or remove; the owner removes the lead and
   `app_access_for(lead)` has no row; unlinking the brand ends every partner person's access; `admin_end_partner`
   ends access and `app_my_partner` refuses; reinstate restores the owner and assignments; a colleague can't accept
   the handover; a person can't join two partners; `check:tenant` clean.
4. **Code:** `src/lib/db/partners.ts` (team functions, codes → words), `requirePartner` returns the member's role
   (`owner` | `lead`); `src/domains/partners/team.ts` (pure: role labels, what each role may do, read by pages and
   actions); `/partner/team` page (list, invite dialog with field errors in the dialog, assign and unassign, remove
   with its consequences); the invite waiting on the invitee's own `/partner` (Accept); nav item "Team" for owners;
   leads see "Clients" only. Admin › Partners detail: Team section and Suspend / Reinstate (`ADMIN_ONLY`, fresh
   passkey, typed name).
5. **e2e `80-partner-team` (planned as 76):** owner invites lead@ to shop A only → lead signs in, accepts, sees A not B, opens A;
   owner removes lead → lead's `/console` for A refuses; Admin suspends → owner's workspace refuses; reinstate.
6. **Docs:** `frata-architecture` § Partners (teams, the CHECK, who may call each definer), spec statuses.

### Verify (each task)
`npm test`, `npm run typecheck`, `npm run verify:tenancy`, `npm run e2e -- --only partners,partner-team`,
`impact-reviewer` on the diff.

### Design review (T1a)
- **UI/UX:** Team page from the approved mockup (list, roles, brands, invite dialog, remove with consequences);
  states: only the owner (empty), invited, removed; phone width; Rule 0.
- **Tenancy:** no tenant id from a form except the owner's own assignment choice, checked against the partner's
  active links inside the definer; partner tables definer-only; proofs above.
- **Modularity:** pure rules in `src/domains/partners/team.ts`; SQL in definers; pages compose.
- **SSOT / DRY:** who belongs to a partner is `partner_members`; access is a `members` row kept in step by the definers
  only; the role's powers live in one tuple.
- **YAGNI:** no custom roles, no caps until credits (C1), no Builders until T1c, no phone invites.
- **KISS:** invites claimed by the confirmed email on an Accept button (as `/handover`), no token in a URL.
- **Scalability / performance:** a partner has ≤ 50 people and ≤ a few hundred links; every definer is keyed by an
  indexed `user_id` or `partner_id`; `app_access_for` gains two indexed joins per partner row.
- **Reliability:** no outbound calls (the invitee is told by the owner; an email is C1-era).
- **Security:** owner-only writes in the definers; one active partner per person; removal in one transaction;
  Admin's suspend `ADMIN_ONLY` with a fresh passkey; refusals named, never a stack.
- **Motion and visuals:** § Feedback toasts and dialogs; no new motion.
- **Unit economics:** none (no credits yet).
- **Blast radius:** every partner definer; `app_access_for` (every signed-in request); Admin's partner page; e2e
  `40-partners`, `75-staff-passkeys`.

## T1b · Partner passkeys
Status: planned (owner, 2026-11-12: "go ahead, mockup approved"; Studio mockup v2.4 Team: "Passkey for everyone",
"Again on publish", "Adds a passkey before seeing any brand"). Spec: intake-and-team § Sign-in and invites. Pattern:
staff passkeys (docs/specs/2026-11-12-staff-passkeys.md, ADR-0007 amended), the same rules for a partner's people.

### What a partner sees
1. **Confirm it's you.** An approved partner person opening the workspace (or a client store) without a passkey check
   on this browser session in the last 12 hours sees the check in place of the page: **Use passkey**. Partner rows
   in the console count only with a live check; a partner who opens `/console` without one gets a panel linking to
   `/partner` (passkey prompts stay off console pages: the look preview frames merchant content there).
2. **First passkey and a lost device:** the person's own session shows a **6-digit code** (15 minutes). A Lead reads it
   to their **owner**, who types it on that person's row in **Team** (after their own passkey check in the last 5
   minutes); the **owner's** own code is approved by a **Frrata admin** in Admin › Partners (ADMIN_ONLY, staff check
   in the last 5 minutes). Never one's own request. The person then adds the passkey on that same browser (10 minutes,
   once).
3. **Passkeys page** (`/partner/passkeys`, every partner person): your passkeys (name, added, last used), **Add
   another** (after a check in the last 5 minutes), **Remove** (after a check; never the one this session used).
4. **Hand over asks again.** Hand over moves into the workspace (Clients row, owner only): sending checks the passkey
   again and the definer refuses without a check in the last 5 minutes. The console's building banner links there.
   Studio's publish (V3) uses the same 5-minute rule; a theme Look publish is out of scope (themes are retiring).
5. **Emails** (SES, the staff security-email pipe): a passkey added or removed, and a request approved, email the
   person and the partner's owner.

### Data (migration 0125 generated + 0126 custom)
- `partner_passkeys (id, partner_member_id → partner_members on delete cascade, user_id, credential_id unique,
  public_key, counter, transports, name 1–40, created_at, last_used_at)`; `partner_passkey_requests (id,
  partner_member_id → cascade, user_id, session_id, code_hash, created_at, expires_at, approved_by, approved_kind ∈
  owner|staff, approved_at, used_at)`; `partner_webauthn_challenges (user_id, session_id, purpose ∈ confirm|add,
  challenge, expires_at, used_at)`; `partner_stepups (partner_member_id → cascade, user_id, session_id, passkey_id →
  partner_passkeys cascade, token_hash unique, created_at, expires_at)`; `partner_passkey_tries (user_id, session_id,
  kind, at)`.
- All five: RLS on, restrictive `definer_only` deny-all, `revoke all` from public, anon, authenticated, service_role,
  frata_app, frata_admin (check:tenant's no-grant list). Every read and write through definers.
- **The live check** `app_partner_live_stepup(uid, session, hash)`: a step-up row for this user, session and hash, not
  expired, whose member is live (`app_pm_live`: accepted, not removed, partner approved, not declined, not suspended).
  So removing a person, unlinking, Admin suspending and the partner being declined each end it at once, with no
  cleanup needed. Removal also deletes the person's passkeys and step-ups (`app_partner_remove_member`).
- **Access:** `app_access_for_v2(user, session, staff_hash, partner_hash)` holds the one body; a `members` row with a
  `partner_member_id` counts only with a live partner step-up; it answers `partnerConfirmedAt`.
  `app_access_for(user, session, staff_hash)` becomes a one-line wrapper (partner hash null) for old code between
  apply and push; a later migration drops it.
- **Definers** (`search_path ''`, revoked from everyone; frata_app for the partner side, frata_admin for Admin's
  approve and the email drain): `app_partner_pk_state`, `app_partner_pk_credentials`, `app_partner_pk_challenge`,
  `app_partner_pk_take_challenge`, `app_partner_pk_confirm`, `app_partner_pk_add`, `app_partner_pk_request`,
  `app_partner_pk_approve` (owner approves a Lead of their own partner), `admin_partner_pk_approve` (admin approves an
  owner), `app_partner_pk_remove`, `app_partner_pk_list` (own passkeys; never a key, credential id or counter),
  `app_partner_pk_signout`, `app_partner_try`. Rates as staff: checks 20 a session in 10 minutes, 60 an hour; codes 5
  and 10, failing closed. `app_handover_invite(tenant, uid, email, session, hash)` needs a partner check within 5 min.
- **Emails:** `staff_notices` becomes the platform's security-email queue: kinds gain `partner_passkey_added`,
  `partner_passkey_removed`, `partner_request_approved`; `app_partner_notify` writes one row for the person and one for
  the partner's owner; the existing drain sends them with words from `src/domains/email/staff-security.ts`.

### Code
- Shared, not copied: `src/lib/auth/webauthn.ts` (the site check moved from `staff-cookie.ts`, challenge from
  clientDataJSON, code hash with a prefix, the route's body schema and 16 kB reader); `src/components/passkeys/`
  (browser client taking its endpoint; the check/request/add gate taking its words). Admin switches to them unchanged.
- `src/lib/auth/partner-cookie.ts` (`__Host-frrata_partner`; plain `frrata_partner` on the local e2e stack);
  `session.ts` `partnerProof`; `accessOf` passes both proofs to `app_access_for_v2`.
- `requirePartner` → `needs_passkey` with a `PartnerIdentity` (a separate type, accepted only by
  `src/lib/db/partner-passkeys.ts`) while the partner is approved and live but unchecked; the partner layout renders
  the gate in place of any page. `routeAfterSignIn`: a live partner person with no store visible lands on `/partner`.
- Route `src/app/(partner)/partner/passkey/route.ts` (Host and Origin exact, 16 kB, Zod, ops as Admin's plus the
  owner's `approve`). `next.config` gives `/partner` the passkey Permissions-Policy (`self`).
- Team: each Lead's passkey count, an open request with **Approve** (code). Admin › Partners detail: the owner's open
  request with **Approve** (code). `/partner/passkeys`. Hand over dialog on Clients.

### Proof (§ 78) and tests
- No role holds a privilege on the five tables; definers' EXECUTE as listed; a Lead without a step-up has no partner
  membership; a step-up from another session or another hash fails; removal, suspension and unlinking end it; an owner
  approves only their own partner's Lead, never their own request, a Lead never approves; an admin approves an owner's
  request, support staff cannot; a wrong code is counted; hand over refuses without a check in 5 minutes. §77's access
  checks seed a step-up through a proof-only helper dropped at the end.
- e2e: `signedIn` seeds a partner step-up for a live partner person (as staff); flow `80-partner-team` enrols the Lead
  with a virtual authenticator (code → owner approves → add → in), and hand over asks again; `routeAfterSignIn` and
  the pure step-up rules unit-tested.

### Design review (T1b)
- **UI/UX:** the approved Team screen; gate states (check, waiting for the device, not confirmed, no passkey → code,
  approved → add); Team row states (no passkey, request open, passkeys); phone width; Rule 0.
- **Tenancy:** platform tables, definers only; the tenant still comes from `requireMember`; a partner row needs a live
  step-up inside `app_access_for_v2`; `tenancy-auditor` on the migration.
- **Modularity / DRY:** one WebAuthn module and one gate component for staff and partners; SQL rules in the definers.
- **YAGNI:** no partner-wide "require hardware keys"; no authenticator app; no SMS; no Look-publish re-ask.
- **KISS:** the staff design, the same numbers; one more cookie; one more access argument.
- **Scalability / performance:** ≤ 50 people a partner; the check rides `app_access_for` (one more indexed lookup by
  token hash), no extra round trip.
- **Reliability:** no outbound call but the emails (queued in the transaction, drained).
- **Security:** a phished email code no longer opens any client store; enrolment needs a second person; sessions are
  bound; 5-minute re-check on hand over, approving and removing; Permissions-Policy only on `/admin` and `/partner`.
  `security-reviewer` on the plan and the diff.
- **Motion and visuals:** the staff gate's look; no new motion.
- **Unit economics:** none.
- **Blast radius:** every signed-in request (`app_access_for`), every partner page and partner console visit, the
  hand-over flow, Admin's passkey screens (shared code), e2e flows using partners (40, 47, 49, 80) and staff (75).
  Rollout: the one live partner owner asks Frrata for approval on first visit after deploy.

### Reviews folded in (2026-11-12: security, tenancy, architecture on this plan). These override the text above.
1. **One access function, not a v2.** `drop function app_access_for(uuid, uuid, text)` and create
   `app_access_for(uuid, uuid default null, text default null, text default null)` (partner hash last) in the same
   transaction, grants re-run. Old code's 3-argument call lands on it with no partner hash: partner rows are withheld
   (fails closed). It also answers `partnerConfirmedAt` and **`partnerHeld`** (tenant ids withheld for want of a
   check), so `requireMember` returns `needs_partner_check` when the wanted store is held or nothing else is visible,
   and the console layout and `/start` show the panel linking to `/partner` instead of "Start your shop" or the wrong
   store.
2. **A passkey belongs to one membership.** Every lookup (live check, challenge, take, confirm, add, request,
   approve, list) is bound to `partner_member_id = (app_pm_live(uid)).member_id`, and `app_access_for` also requires
   the members row's `partner_member_id` to equal the step-up's. Every path that ends a membership (remove; accept's
   clean-up of a declined applicant's row) deletes that person's passkeys, requests, challenges and step-ups. Suspend
   keeps them (reinstating resumes within the 12 hours; said here on purpose).
3. **The database checks the passkey on every workspace call.** `app_partner_clients`, `app_partner_team`,
   `app_partner_invite`, `app_partner_assign`, `app_partner_remove_member`, `app_partner_create_shop` take
   `(session, hash)` and refuse without a live check; invite, assign, remove and every approve or remove-passkey need
   one within 5 minutes. Old signatures are dropped (old code fails closed for the minutes between apply and push).
   `requirePartner` reads the check from the same cached `accessOf` and returns `needs_passkey` otherwise.
4. **Hand over:** one `HandOverDialog` on the Clients row (owner only); `handOverAction` and the banner's dialog are
   deleted; the banner links to `/partner` for owners only. `app_handover_invite(uuid, uuid, text)` is dropped; the new
   one takes `(tenant, uid, email, session, hash)` and needs a check within 5 minutes. **Named exception:** its tenant
   id comes from the form, like assign's; the definer re-checks the active link, the owner's members row and the check.
   `frata-design-language` § Partner workspace updated (version bump).
5. **Approvals:** `app_partner_pk_approve` (a live owner checked within 5 minutes; the target a live Lead of the same
   partner, not the caller; matched by member id; the try counted first; a wrong code returns null so the count
   stays). `admin_partner_pk_state(staff, session, staff_hash, partner)` (`createdAt`, `approved`, `waitUntil` only;
   never the code hash) and `admin_partner_pk_approve(staff, session, staff_hash, partner, code_hash)` (admin, staff
   check within 5 minutes, the target that partner's owner, not the admin; tries in `staff_passkey_tries`).
   **Owner recovery can't be talked out of Frrata:** Admin calls back the phone on the partner's record, never the
   caller (shown with the owner's passkey count and last use); when the owner already has a passkey, the request
   lives 48 hours and can be approved only after 24, and the owner is emailed when it is made; every admin is emailed
   on approval. Code hashes use the prefix `partner-enrol:`; step-up tokens are hashed with `partner:`.
6. **A lost device:** **Remove passkeys** on a Lead's Team row (owner, check within 5 minutes) and on the owner in
   Admin › Partners (ADMIN_ONLY, staff check within 5 minutes): deletes their passkeys and step-ups; emails.
7. **EXECUTE:** none for `app_partner_live_stepup`, `app_partner_try`, `app_partner_notify` (the addresses come from
   `partner_members`, never an argument); `frata_admin` for `admin_partner_pk_*` and the email drain; `frata_app`
   for the rest. One `audit_events` row per change (never a hash, code or challenge).
8. **Shared code at the right seam:** `src/lib/auth/webauthn.ts` holds the ceremony (options, user verification,
   origin and site, take-before-verify, counter, transports as a `text[]` parameter, never `sql.raw`) with `rpName`,
   the code prefix and a store of five SQL calls per side; `GateState` and the gate move to `src/components/passkeys/`
   with Admin's exact words as defaults. Shipped as its own commit with flow 75 green before and after. The WebAuthn
   `userID` for a partner is sha256(`partner:` + member id), so one device never overwrites a staff passkey.
9. **Emails** wait for the 5-minute drain (a partner route can't import `src/lib/admin`); the drain picks the button
   and footer by kind; passkey names allow letters, digits, spaces and `-'` only (they are emailed to the owner).
10. **Headers and sign-out:** the passkey Permissions-Policy on `/partner` and `/partner/:path*`, console host only
    (`/partners` untouched); nothing under `/partner` renders or frames merchant HTML (framing test). Sign-out deletes
    the partner step-up by its cookie hash before Supabase's sign-out and clears both cookies.
11. **Gate:** rendered bare like Admin's (no shell, no store list); the owner's request screen says how to reach
    Frrata (WhatsApp); Admin › Partners marks an open request. Leads can't be approved until the owner has a passkey
    (Team sits behind the gate): the rollout says so.
12. **Gates:** `check:tenant`'s no-grant list covers the five new tables; a `proof_` function in `drizzle/` fails it.
13. **Proof § 78 adds:** privileges on the five tables for every role and the EXECUTE matrix; `prosecdef` and
    `search_path=''` on every new function; another person's credential id returns null; the list never carries
    `publicKey`, `credentialId` or `counter`; another user's or an old membership's step-up counts for nothing; decline,
    unlink, unassign, suspend end it; a staff hash as partner hash and the reverse count for nothing; a non-partner row
    still counts without one; only the 5-argument hand over exists; removal deletes passkeys, step-ups, requests,
    challenges; partner B's owner can't approve partner A's Lead. **§ 77** moves to a proof-only helper that inserts
    only the passkey row (the real challenge, take and confirm run as `frata_app`), shows each removal, suspend and
    unlink check passing first, and is dropped (asserted gone).
14. **e2e:** an explicit `seedPartnerStepup(ctx, who)` after `partnerOn` or approval (not inside `signedIn`); flow 75's
    virtual authenticator moves to `lib.mjs` with a real key, so hand over (which asks again) works in flows 40 and
    80; flow 40's hand over moves to the Clients row; `routeAfterSignIn` tests for an approved partner with no visible
    store (→ `/partner`) and staff who are partners (→ `/choose`).
15. **Not changed, recorded:** console notice emails still reach partner people (`app_notice_members`); partners
    re-enrol when the console host moves, as staff do.

### Tasks (T1b)
**Progress (2026-11-12, paused by the owner at a safe point):** task 1 done on branch `claude/amazing-wright-7irwn3`,
not on main (`src/lib/auth/webauthn.ts`, `src/components/passkeys/`; Admin runs on them; `npm test`, typecheck and
flow 75 green). Resume at task 2 (migrations 0125/0126; re-check main's newest migration number first). Nothing of
T1b is applied to production.
1. Shared WebAuthn module and gate component; Admin on them (flow 75 green before and after). Commit.
2. Migration 0125 (tables, generated) + 0126 (custom: access, definers, rewritten partner definers, hand over,
   emails), proof § 78 and § 77 helper, `check:tenant` rules. `verify:tenancy`.
3. Partner side: cookie, `session.ts`, `requireMember`/`requirePartner`, route, gate, Team (approve, remove passkeys),
   `/partner/passkeys`, Clients hand over, console and `/start` panels, sign-out, headers. Admin › Partners approve and
   remove. Emails' words.
4. e2e helpers and flows 40, 75, 80; unit tests. `impact-reviewer` and `security-reviewer` on the diff.
5. Apply 0125/0126 to production and push at once; an admin approves the live owner's code.

### Regression net and verify
Before: flows 40, 75, 80 and `verify:tenancy` green on main. Each task: `npm test`, `npm run typecheck`,
`verify:tenancy` (task 2 on), `npm run e2e -- --only partners,staff-passkeys,partner-team,look,offers,ship`.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Proving each partner definer refuses the wrong caller | `verify:tenancy` § 28b |
| Seeding a passkey step-up for a signed-in test person | e2e `signedIn` (staff and partner) |

## Practices recorded in skills
Architecture: `frata-architecture` § Partners (teams). Testing: the partner-team flow.
