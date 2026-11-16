# Studio and partners: the build
Status: active (owner, 2026-11-12: "build now") for T1a–P2, built; **the remaining phases are a draft for the owner**
(revised 2026-11-16) · Specs: `docs/specs/2026-11-16-studio-agent.md` (the agent, hosting, credits; draft),
`docs/specs/2026-11-16-partner-publishing.md`, `docs/specs/2026-11-15-studio-one-screen.md`,
`docs/specs/2026-11-12-studio-intake-and-team.md`, `docs/specs/2026-11-12-studio-shell-clients-billing.md`,
`docs/specs/2026-11-12-admin-partners.md`, `docs/specs/2026-11-11-frrata-studio.md`, `docs/specs/2026-11-12-kit-and-fleet.md`,
ADR-0014 to ADR-0018 · Mockups: https://claude.ai/artifact/KiqKqrFCx4enB8KUrnh5Du (Studio v2.4),
https://claude.ai/artifact/PaRX2MLsw11JDH6dFdbMCv (Admin), https://claude.ai/artifact/LdA5saPkzt36W1zJsxF1QZ (the one
screen), https://claude.ai/artifact/NfBB7SwJk8chukgJZVhDFr (kit and fleet); new ones per phase below
**Review (remaining phases):** all five run independently as separate agents on 2026-11-16, findings folded into the
spec and this plan · architecture-reviewer CHANGES NEEDED, 2 blockers and 9 majors fixed · security-reviewer FIX BEFORE
MERGE, 2 high and 7 medium fixed · unit-economics-reviewer HURTS AS DRAFTED, 6 findings fixed or put to the owner ·
tenancy-auditor FIX BEFORE MERGE, 9 high and the medium and low gaps fixed · speed-reviewer OVER BUDGET as drafted, 5 high,
5 medium and the low fixed

## Order (each phase ships alone, push to `main` after its gates)
Revised 2026-11-16 for the owner ("revise the studio plan to keep it fully agentic and use our own claude api as planned
and let's finishup the remaining of the partner/studio work"): `docs/specs/2026-11-16-studio-agent.md` (draft) holds the
design and the 29 owner decisions; this section holds the order. Nothing below is built before its phase's mockup and
the owner's decisions it names.

### Built
| Phase | What it gave | Done |
|---|---|---|
| T1a Teams | Owner and Leads, assignments, Admin suspend and reinstate | 2026-11-12 |
| T1b Partner passkeys | Every partner person on a passkey; hand over asks again | 2026-11-15 |
| T1c Builders (ADR-0015) | Builders who never see orders, shoppers or costs | 2026-11-15 |
| V1 Storefront API SA0, SA1, SA1b; content layer | Keys, catalogue reads, content, previews, the bag link, the starter | 2026-11-15/16 |
| P2 Clients | The Clients view, the partner's own billing records, the share | 2026-11-16 |
| PP1 Policies after handover | (being built now; takes proof § 87) a partner can't change policies or legal details after handover | — |

### Remaining, with lanes
Lanes: **A** hosting, **B** API and data, **C** money, **D** the agent. After V0 the first phase of each lane runs at
once (lane D starts with the spike only); the orchestrator releases one lane at a time
(`docs/plans/2026-11-15-parallel-lanes.md`). Partners get value from G-a and V2a (sites on Frrata's account, built with
their own Claude Code as the pilot was) long before Studio opens. Proof blocks: PP1 § 87; V2a § 88, C1 § 89, BT § 90,
V3a § 91, V2b § 92, A1a § 93, V2c § 94, V3c § 95, V3d § 96; G-a grows § 81. Every table states its `frata_admin` and
`frata_builder` grants (by default none); every rewritten definer re-runs its grants.
| Step | Phase | Lane | A partner or brand can, after it | Needs first | Mockup |
|---|---|---|---|---|---|
| 1 | **V0 Decisions** | all | — (every later phase knows its terms; the owner's accounts exist) | the owner | none — decisions and ADR text, no screen |
| 2 | **G-a API gaps that block sites and the agent** | B | the pilot and every code site get templates that fit a drawn design, a product's collection, collection images, JSON-LD, the media host, the compliance link, previews that don't fail under load; build keys exist | V0 (10, 11) | **new:** Console › Content's page templates; Settings › Website's key list with build keys |
| 2 | **V2a Sites on Frrata's account** | A | a partner never deploys: New site makes the repository, project and Frrata address; previews, publish and hand over from the workspace; the brand opens on `<slug>.frrata.store` and can connect its own domain. **Build-mode shops and the pilot only until hosting is priced** (decision 18) | V0 (1, 8, 9, 14, 18, 22, 23, 26); G·2 | **new:** Settings › Website, Clients › New site and site actions, the handover's version accept · **approved:** Admin › Sites (kit-and-fleet), Content › Placements (content mockup) |
| 2 | **C1 Studio credits** | C | a partner buys a seat or packs by UPI with GST invoices, sees the ledger, sets client budgets and per-person caps | V0 (5, 6, 7, 19, 20); Frrata's seller real (billing R2); the CA on decision 19 | **approved:** Studio v2.4 Credits & billing (owner's Q1–Q6, 2026-11-12) with the new prices; a final phase mockup |
| 2 | **V3a·1 The spike** | D | — (answers every unconfirmed item, dated) | V0 (2, 3, 12) | none |
| 3 | **BT Brand tokens (V1.5)** | B | a brand's palette, type, radius and seasons are data; the owner ends a season in the console; site, checkout, emails and cards read one source | G-a | **new:** Console › Brand and Season |
| 3 | **V2b Publishing after handover (PP2, PP3)** | A | the owner picks Publishes freely or Ask me first per partner; partners publish after handover; the owner gets Undo | V2a, PP1 | **new:** partner-publishing spec § PP3's list |
| 3 | **A1a Admin credits** | C | Frrata staff see every partner's ledger, grant or return credits, refund a purchase, see farming signals | C1 | **approved:** Admin mockup (2026-11-12) |
| 4 | **V2c Fleet care** (V2c·3 first) | A | Frrata's security and legal fixes on every hosted site within 24 h; kit updates as drafts; kill switches; the package mirror | V2a | **approved:** kit-and-fleet mockup |
| 5 | **V3a Agent runtime and the 20-task proof** | D | Frrata staff build sites with Frrata's agent; the proof prices credits on measurement and says go or no-go | V3a·1; V0 (4, 5, 13, 15, 17, 25, 27); BT; C1·2 and C1·5; V2a·5–7; V2c·3; PP1 merged (V3a·6) | **approved:** Admin › Agent (kit-and-fleet) · the report is a page for the owner |
| 6 | **V3b Studio, the one screen** | D | a partner builds and keeps a site end to end with Frrata's agent in chat, phone included | V3a's proof passed; V2a; C1; BT; G-a | **approved:** the one screen (2026-11-15) · **redraw first:** the spec's § 14 deviations and added states |
| 7 | **V3c Intake link** | D | the brand sends its logo, guide, photos and words through one link (the fetch and extractor already exist from V3a) | V3b; S1 closed | **approved:** Studio v2.2/v2.4 intake, re-drawn where the one screen differs |
| 8 | **V3d Routines** | D | a saved ask runs on a schedule and leaves a draft for a person | V3b, V2b | **new:** content-layer spec § Studio v2.5 item 1 |
| later | **G-b API gaps that make sites better** | B | a bag that shows its total and delivery, live availability, a PIN check, multi-select filters, best sellers | G-a | none — API only |
| later | **A1b Payouts** | C | the partner share paid monthly | A1a; Phase 6; the CA | **approved:** Admin mockup |
Studio (V3b) cannot open before V2a and C1: a site would have nowhere to run and turns nothing to pay with.

### Deviations (BUILT AS DRAWN; for the owner before V3b ships)
| Mockup element | What will be built | Reason | Owner seen |
|---|---|---|---|
| One screen: pages priced 2–10 credits (`docs/mockups/2026-11-15-studio-one-screen.html:317`) | ≈ 19 credits a page | measured token profile, 3× (spec § 8) | no |
| One screen: no Publish step | A Publish card before Hand over; Apply on each content card | ADR-0014 rule 4, amendment 8.1 | no |
| One screen: the site changes instantly | Data instantly; a code change after a build (≈ 1–2 min) | Managed Agents has no open port (spec § 2) | no |
| Studio v2.4: pack ₹1,900 for 100; 10 free credits | ₹1,999 for 100; 20 free | 3× after payment fees; the first preview needs 11–16 (spec § 8) | no |

## T1a · Teams: Owner and Leads
As built: migrations 0123 (tables) and 0124 (access), proof §77, e2e `80-partner-team`. Review changes folded in before
code: handover is owner-only (with a passkey check from T1b); suspend deletes partner people's shop rows and reinstate rebuilds them from
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
Status: built on branch `claude/amazing-wright-7irwn3` (2026-11-15; the partner sign-in mockup approved 2026-11-15, `docs/specs/2026-11-15-partner-login.md`, deviations listed there); planned (owner, 2026-11-12: "go ahead, mockup approved"; Studio mockup v2.4 Team: "Passkey for everyone",
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

### Data (migration 0128 generated + 0129 custom; as built: one 4-argument `app_access_for`, the 3-argument one dropped; requests carry `declined_at`, `device`, `city`; `app_partner_pk_decline`)
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
**Progress (2026-11-15):** done and live — 0128/0129 in production, code on main (af80f733); next, an admin approves the live owner's first passkey. Tasks 1–4 were built on branch `claude/amazing-wright-7irwn3` (migrations 0128/0129, proof § 79,
the screens as drawn in the partner sign-in mockup, flows 40, 71, 75, 80 green, reviews folded in). Task 5 (production)
is next.
1. Shared WebAuthn module and gate component; Admin on them (flow 75 green before and after). Commit.
2. Migration 0128 (tables, generated) + 0129 (custom: access, definers, rewritten partner definers, hand over,
   emails), proof § 78 and § 77 helper, `check:tenant` rules. `verify:tenancy`.
3. Partner side: cookie, `session.ts`, `requireMember`/`requirePartner`, route, gate, Team (approve, remove passkeys),
   `/partner/passkeys`, Clients hand over, console and `/start` panels, sign-out, headers. Admin › Partners approve and
   remove. Emails' words.
4. e2e helpers and flows 40, 75, 80; unit tests. `impact-reviewer` and `security-reviewer` on the diff.
5. Apply 0128/0129 to production and push at once; an admin approves the live owner's code.

### Regression net and verify
Before: flows 40, 75, 80 and `verify:tenancy` green on main. Each task: `npm test`, `npm run typecheck`,
`verify:tenancy` (task 2 on), `npm run e2e -- --only partners,staff-passkeys,partner-team,look,offers,ship`.

## V0 · Decisions (all lanes; documents only)
- **After it:** every phase below has its terms; the owner's accounts exist.
- **Needs first:** the owner's answers to `docs/specs/2026-11-16-studio-agent.md` § Owner decisions 1–29.
- **Mockup:** none — decisions, no screen.
- **Regression net:** none (no code); `npm run check:docs` and `npm run check:skills` stay green.
| # | Task | Verify |
|---|---|---|
| V0·1 | ADR-0017: status accepted as revised, **its Decision rewritten for Vercel** (not only its status), Cloudflare kept as the second adapter and decision 18's test; ADR-0005's consequence line | `npm run check:docs`; the ADR read with the owner |
| V0·2 | ADR-0014 amendment 4: for code sites on Vercel, the fleet overlays headers and CSP from the signed policy at build in place of a Frrata router (decision 26) | `npm run check:docs` |
| V0·3 | ADR-0018 amendment: the build key (header only, dynamic tree, no CORS; per session, per preview, per developer; one minting path), per-key limits, decision 5 for linked partners after opening; **the CLAUDE.md line shown to the owner word for word** ("A key reads only what the shop's public pages show" gains the build key's drafts); the CLAUDE.md edit is the owner's | `npm run check:docs`; the owner's yes on the line |
| V0·4 | ADR-0015 § 5 amended: Builder turns through `asTurn` (the second Actor maker), Builders propose and apply nothing (decision 25) | `npm run check:docs` |
| V0·5 | ADR-0019 "Studio's agent": Managed Agents, the runtime adapter, Frrata's Claude account, `asTurn` with its turn id from our own open-turn row and its own short transaction, the third Postgres setting `app.partner_id`, held by `check:studio`; the switch signals | `npm run check:docs` |
| V0·6 | ADR-0016 § 2: the `frrata-sites` organisation, two GitHub Apps, rulesets per repository, Actions off | `npm run check:docs` |
| V0·7 | `frata-unit-economics`: the credit at 1.10, ₹94, the prices, the site figures and sensitivities, the hosting figures, the hypotheses; `frata-integrations` § Anthropic (Managed Agents, Agent SDK terms, each dated); `frata-architecture` § Studio; version bumps | `npm run check:skills` |
| V0·8 | **The owner sets up:** an Anthropic Console organisation in the company's name with billing, workspaces `studio` and `studio-eval`, the Managed Agents webhook endpoint registered in its Console (no API for it), the signing secret in Vercel Production; the GitHub organisation `frrata-sites` on Team (passkeys required, Actions off) and a separate home for `frrata-fleet`; Vercel teams `frrata-sites` (Pro, Deployment Protection on), `frrata-fleet` and `frrata-sites-staging`; the two domains for three years with Vercel nameservers, submitted to the PSL | `node scripts/ops/hosting-preflight.mjs` (new: reads each account's plan, team, protection and token scopes, writes nothing) prints all green |
- **Reviews:** `architecture-reviewer`, `security-reviewer`, `unit-economics-reviewer` on the ADR text.
- **Owner decisions:** 1–29; 1–5 unblock lanes A and D, 6–7 and 19–20 lane C, 8–11, 14, 18, 22–23, 26 and 28 lane A,
  10–11 lane B, 29 lane D.

## G-a · API gaps that block sites and the agent (lane B)
From the pilot (`mokobara/docs/design/api-gaps.md`, 2026-11-16). Each is additive to `2026-12` (a released version only
grows). G22 (Home placements) needs `site_deployments` and moves to V2a.
- **After it:** the pilot's deviations that wait on the API close as the site picks each up; previews and test-key sites
  stop answering 500 under load; build keys exist and the owner sees them.
- **Needs first:** V0·3.
- **Mockup:** new, for Console › Content's page templates (Contact, About blocks, FAQ topics, title emphasis) and Settings ›
  Website's key list with build keys, phone and desktop.
- **Regression net:** e2e `91-storefront-api`, `92-storefront-sale`, `89-content`, `73-pages`, `88-announcement`;
  `npx vitest run src/domains/storefront-api` (the released snapshot); `node scripts/verify/api-isr.mjs`; proof § 81, § 86.
| # | Task | Verify |
|---|---|---|
| G·1 | G27 (one rule with spec § 5, speed 4): test and build keys limited per key only (`apiTestKey`), failing closed; misses counted per network and per key hash, so one stale preview can't block every site; live keys keep the per-network limits; the starter caches a test key's reads 15 s when deployed and doesn't prefetch nav links (the pilot's fix, through `node scripts/kit-sync.mjs`) | `npx vitest run src/lib/storefront-api`; `npm run e2e -- --only storefront-api,storefront-sale` |
| G·2 | The build key: kind `build` in `storefront_keys` (CHECK on its end, its maker and its purpose: session, preview or developer), **one minting path** (`mintBuildKey`, inside the shop's tenant, `api.manage` or a linked partner per decision 11, audited, limited per shop); the `Frrata-Key` header tree (dynamic, `private, no-store`, no CORS headers, 300 reads a minute a key) looking the key up **uncached** (`storefrontKeyNow`), never through the live keys' one-hour cache; the raw draft entry cached 15 s **per shop**, tagged with the shop's catalogue and content tags, purged on Apply, never shared with `k/`, and added to `catalogue-size.int.test.ts`; `app_storefront_key` (grants re-run) answers a build key after opening only with `partner_id` set, the maker live (`app_pm_live`) and still a member, and assigned for a Lead or Builder; expired build keys deleted daily; Settings › Website lists build keys with maker and end and deletes them; the starter sends the header only with `FRRATA_KEY_MODE=header` | `npm run verify:tenancy` (§ 81 grows: a removed or unassigned maker's key stops); `npm run check:api`; `npm run check:tenant`; `npx vitest run src/lib/storefront-api`; `SPEED=1 npx vitest run catalogue-size`; `npm run e2e -- --only storefront-api` |
| G·3 | The developer's device sign-in for a build key: `requireCapability`, a passkey check in the last 5 minutes, a single-use code good for 10 minutes bound to device and site (definer-only `build_key_device_codes`), choosing only among the caller's own stores, a limit per person, an audit row, 24 hours | `npx vitest run src/lib/storefront-api`; `security-reviewer` on the diff |
| G·4 | G26 `shop.mediaOrigin`; G11 `image` on a collection; G6 `collection` on a product (its first collection in the store's order); G14 the compliance certificate as a `policies` kind; G15 `jsonLd` on shop, product and collection (`<` escaped) | `npx vitest run src/domains/storefront-api`; `npm run check:api` |
| G·5 | G20 a topic per FAQ question; G21 emphasis runs in page titles; G23 a Contact page template; G24 About as free blocks (text, image, quote, a button to a shop path); the console's editors as drawn | `npm test`; `npm run e2e -- --only content,pages` |
| G·6 | The starter and the pilot read each new field; the pilot's deviations table updated | `cd kit/starter && npm run check && npm run build`; `npm run e2e -- --only storefront-sale` |
- **Reviews:** `api-contract-reviewer`, `security-reviewer` (the header tree, device sign-in, JSON-LD, templates),
  `speed-reviewer`, `tenancy-auditor` (G·2), `words-reviewer`, `design-system-reviewer`, `mockup-parity-reviewer`,
  `impact-reviewer` per task.
- **Owner decisions:** 10, 11; a product's home collection = the first in the store's order (recommended); JSON-LD now.

## V2a · Sites on Frrata's account (lane A)
- **After it:** a partner never deploys: New site makes the repository in `frrata-sites`, the Vercel project and the Frrata
  address; Preview, Publish and Hand over sit on the client's row; the brand accepts that deployment, opens on
  `<slug>.frrata.store` and may connect its own domain. The pilot moves in. **No paid store is hosted until hosting is
  priced** (decision 18): until then V2a hosts build-mode shops and the pilot, and measures them.
- **Needs first:** V0 (1, 8, 9, 14, 18, 22, 23, 26) and V0·8's accounts; G·2.
- **Mockup:** new: Settings › Website (the Frrata address, Connect my domain, Opening soon, keys), Clients › New site and
  the site's actions, the handover's accept of a version; approved: Admin › Sites (kit-and-fleet), Content › Placements.
- **Regression net:** e2e `40-partners`, `52-addresses`, `53-domains`, `87-partner-clients`, `89-content`,
  `91-storefront-api`, `92-storefront-sale`, `12-security`; `npm run verify:tenancy`; `node scripts/verify/api-isr.mjs`.
| # | Task | Verify |
|---|---|---|
| V2a·1 | Migrations: `sites` (one per shop, site id), `site_deployments` (cause, commit SHA, kit and policy versions, approval, checks verdict columns, the declaration's id, `live_from`, `rolled_back_at`; live and held derived; index `(site_id, live_from desc)` where live), `site_field_declarations` (each distinct parsed `fields` once, by hash); `shop_domains.serves` (`shop` \| `site`), written as `site` only by a definer taking the label from the shop's slug or name history; a trigger refusing a sites-domain host for another shop; one sites-domain row per shop; the host CHECK relaxed only for `<label>.<sites domain>` with `serves = 'site'`; `check (serves <> 'site' or main_at is null)`; the preview domain never in `shop_domains`; grants stated for frata_admin and frata_builder (none); proof § 88 with EXPLAIN of the live-deployment read | `npm run verify:tenancy`; `npm test` |
| V2a·2 | `src/domains/addresses`: the apex reader treats the sites domain as a public suffix; `OURS` gains `frrata.store` and `frrata-preview.site`; "made by Frrata" derived from the host; `MAX_HOSTS_A_SHOP` skips Frrata's address; a store rename moves the address (new row, 90-day redirect). A test per reader: Settings › Address, `mainDomainIn`, the cap, the D2·7 sweeps, Razorpay's website check, `app_site_origin_check` | `npx vitest run src/domains/addresses`; `npm run e2e -- --only addresses,domains` |
| V2a·3 | Outbox kinds `site.create`, `site.build`, `site.promote`, `site.domain`, `site.key`, each sender resolving the project with `sites where tenant_id = row.tenant and id = …`; `/api/webhooks/fleet` (raw-body HMAC, size cap, key `fleet:<deployment>:<event>`, 200 at once) in ENTRY_POINTS, processed in `after()` by a definer that takes the shop from the `site_deployments` row and cross-checks the site, swept by `/api/cron/drain` | `npm test`; `npx vitest run src/lib/sites` |
| V2a·4 | Keys to the fleet with no inbound endpoint: the `site.key` sender mints at send time inside the row's tenant (G·2's path), sends it in one HMAC-signed request body, deletes it if the call fails, audits it; Preview gets a key per preview, Production the public key only | `npx vitest run src/lib/sites`; `security-reviewer` on the diff |
| V2a·5 | The fleet service (`frrata-fleet`, its own repository and Vercel team; the only holder of the host token and the fleet App): repository from Starter 0 with rulesets; project in bom1 without Git builds, Deployment Protection on; the Frrata address with the Opening soon page (words from `words.ts`); one build path: the recorded SHA built in a Vercel Sandbox with no secrets, `--ignore-scripts`, the lockfile compared with the policy → Frrata's pinned checks → prebuilt deploy to the preview domain, or promote; one build in flight per site, a newer commit replacing a queued one, 30% of Vercel's 1,000 an hour kept for publishes, rollbacks and patches; repositories made from the template, never forked; each project's owning shop recorded and a mismatched request refused; headers and CSP overlaid from the policy; per-deployment share links; previews that never went live deleted after 30 days; rollback; domains after the store's TXT proof; a site's kill switch | its own tests; `node scripts/verify/fleet-smoke.mjs` (new) against `frrata-sites-staging` |
| V2a·6 | The gate on build output: the hard floor (kit spec § 4), no key-shaped string, no `document.cookie` with a `Domain`, the legal block on every page, the bag link, `frrata/fields.json` parsed and capped, the outside-host classifier PP3 reads; the speed floor: ≤ 150 kB gz first-load script on the product page, at most 1 preloaded font and 2 high-priority images (decision 28) | `npx vitest run src/domains/sites` |
| V2a·7 | G22 placements: the `placements` resource and Content › Placements drawn from the live deployment's declaration | `npm run check:api`; `npm run e2e -- --only content` |
| V2a·8 | Console and workspace as drawn: Settings › Website, Connect my domain (`serves: site`), **Open my store** promotes the opening version, Clients › New site and actions, the handover accepts a deployment id (`app_accept_handover_v2` matches the deployment's shop, grants re-run); build mode publishes to the signed preview only; the console's `frame-src` is the fixed `https://*.frrata-preview.site` | `npm run e2e -- --only partners,domains,partner-clients,site-hosting` (new flow `93-site-hosting` on a fake fleet) |
| V2a·9 | A partner's developer added to one repository through the session App (owner or assigned Lead), removed with the person or the partner (`app_remove_partner`, `app_partner_remove_member`, `app_partner_unassign` and `admin_end_partner` gain it, grants re-run); previews before handover capped at 20 a site a day until C1 charges 1 credit | `npm run verify:tenancy`; `npm run e2e -- --only partner-team` |
| V2a·10 | Admin › Sites (kit version, checks, build mode or owned, partner, kill switch) | `npm run e2e -- --only neel-admin` |
| V2a·11 | The pilot moves: repository into the organisation, project into `frrata-sites`, its domain re-pointed, its key re-minted, the owner told; the old project removed after a week; **30 days of its Vercel usage** (bytes, requests, builds per view, first views apart from repeat views, plus Blob transfer for product images) recorded for decision 18; its two extra font preloads cut first (decision 28) | `curl -sI https://<pilot domain>/` answers 200 from `frrata-sites`; `npm run e2e -- --only storefront-sale`; the usage table read by `unit-economics-reviewer` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer`, `speed-reviewer`, `unit-economics-reviewer`
  (hosting priced on the pilot's 30 days), `api-contract-reviewer`, `words-reviewer`, `design-system-reviewer`,
  `mockup-parity-reviewer`, `e2e-runner`, `impact-reviewer` per task.
- **Owner decisions:** 1, 8, 9, 14, 18, 22, 23, 26, 28; Vercel's written word on hosting sites inside Frrata's plans (ADR-0017
  revised 2); a person's security review of a partner's first handover (kit spec § Handover).

## C1 · Studio credits (lane C)
- **After it:** a partner buys Studio (₹2,999, 150 credits), Studio Plus (₹9,999, 500), packs (₹1,999, 100) or typed
  credits (₹20 each) by UPI, card or netbanking, with GST invoices on its GSTIN; sees balance and usage by client and
  person; sets client budgets (warn 80%, pause 100%) and per-person monthly caps (new: T1a built none). Credits pay V2a's
  previews before handover, then V3's turns.
- **Needs first:** V0 (5, 6, 7, 19, 20); the CA's answer on decision 19; Frrata's seller real (billing rework R2);
  Frrata's own Razorpay account (provider `frrata_razorpay`).
- **Mockup:** approved (Studio v2.4 Credits & billing) with the new prices (Deviations above); one final phase mockup.
- **Regression net:** e2e `62-billing`, `87-partner-clients`, `40-partners`; `npx vitest run src/lib/billing`;
  `npm run verify:tenancy`.
| # | Task | Verify |
|---|---|---|
| C1·1 | `src/domains/studio/credits.ts`: credits from loaded cost (⌈cost × 1.10 ÷ ₹6.33⌉ at the stored rate), reserve and settle (never above the reserve), the session budget formula (spend + ceiling − largest request − builds), the expiry order (soonest first; seat 2 months, packs 12), budgets and caps | `npx vitest run src/domains/studio` |
| C1·2 | Platform tables, definers only, no role grant (P2's pattern): `partner_credit_entries` (append-only: grant, purchase, reserve, settle, release, return, expire; each turn's rupee rate stored here), `partner_seats`, `partner_credit_purchases` (attempt rows, no tenant), `partner_client_budgets`, `partner_member_caps`, `partner_credit_events`, `partner_credit_tries`; every write counted first; every definer matches the caller's partner, and a budget naming a shop re-checks the link and, for a Lead, the assignment; proof § 89 | `npm run verify:tenancy`; `npm run check:tenant` |
| C1·3 | Purchases: an attempt row committed before Razorpay's order (ADR-0008; no outbox row, since a purchase has no tenant); the seat on a UPI AutoPay mandate with the RBI pre-debit notice; the webhook stored by one definer in `partner_credit_events` (the `billing_events` / `app_store_billing_event` pattern, never `webhook_events`, whose insert policy refuses a row with no tenant), matching the gateway's order to the attempt row and checking the amount, never a partner id from the payload; GST invoices from billing's engine | `npx vitest run src/lib/billing`; `npm run e2e -- --only billing` |
| C1·4 | The workspace's Credits & billing page as drawn (the owner sees money; Leads see the budgets of clients they are assigned) | `npm run e2e -- --only partner-clients` (flow `87-partner-clients` gains the page); `mockup-parity-reviewer` |
| C1·5 | One reserve-and-settle door for V2a previews and V3 turns, Frrata-side failures returned, read by cards at render (no figure stored in a tenant row) | `npx vitest run src/lib/studio` |
| C1·6 | Emails at 80% of a budget and low balance (SES, the security-email pipe's pattern) | `npm run e2e -- --only email` |
- **Reviews:** `unit-economics-reviewer`, `security-reviewer`, `tenancy-auditor`, `architecture-reviewer`,
  `speed-reviewer`, `words-reviewer`, `design-system-reviewer`, `mockup-parity-reviewer`.
- **Owner decisions:** 5, 6, 7, 19, 20; Frrata's GSTIN on partner invoices.

## BT · Brand tokens (V1.5, lane B)
- **After it:** a brand's palette, type, radius and seasons are data in the console, read by the site (API), checkout,
  emails and share cards from one source; theme shops keep their look until V5.
- **Needs first:** G-a.
- **Mockup:** new: Console › Brand and Season (owner, phone first).
- **Regression net:** e2e `05-shop-look` (theme shops' baselines unchanged), `10-checkout`, `71-email`, `64-seo`,
  `91-storefront-api`.
| # | Task | Verify |
|---|---|---|
| BT·1 | `src/domains/brand/`: palette roles, type, radius, seasons by dates with a stop time, plain text; the contrast check **reused** from `src/domains/themes/contrast.ts`; one accent rule (`accentOf`: a code site's palette, else `shop_settings.accent`) | `npx vitest run src/domains/brand src/domains/themes` |
| BT·2 | `brand_tokens` and `brand_seasons` hold only what doesn't exist: **no second logo** (`shop_settings.logo_url` stays the one logo, `doc_logo` the documents'), no second accent; grants, RLS, proof § 90 | `npm run verify:tenancy` |
| BT·3 | `shop.brand` in the API (additive; a future season never served), preview through the token | `npm run check:api`; `npx vitest run src/domains/storefront-api` |
| BT·4 | Checkout, emails and cards read `accentOf` and the one logo | `npm run e2e -- --only checkout,email,seo,shop-look` |
| BT·5 | Console › Brand and Season as drawn; the one save Apply and hand edits call | `npm run e2e -- --only content`; `mockup-parity-reviewer` |
- **Reviews:** `architecture-reviewer`, `tenancy-auditor`, `security-reviewer`, `speed-reviewer`, `api-contract-reviewer`,
  `design-system-reviewer`, `words-reviewer`, `mockup-parity-reviewer`.
- **Owner decisions:** the owner may edit tokens after handover without the partner (recommended: yes; the partner is told).

## V2b · Publishing after handover: PP2 and PP3 (lane A)
As `docs/specs/2026-11-16-partner-publishing.md` § PP2–PP3.
- **After it:** the owner sets Publishing per partner; ordinary versions go live with an Inbox line and Undo; a new
  outside host or a domain change waits for the owner; under Ask me first every version waits.
- **Needs first:** V2a, PP1. **Mockup:** new (the spec's PP3 list).
- **Regression net:** e2e `40-partners`, `87-partner-clients`, `93-site-hosting`; proof § 92.
| # | Task | Verify |
|---|---|---|
| V2b·1 | The pure rule in `src/domains/partners/` (role, has an owner, the choice, the version's class) and its table test | `npx vitest run src/domains/partners` |
| V2b·2 | `partner_links.publish_asks_since`, `publish_asks_by` (owner or Manager, audited, never a support visit) | `npm run verify:tenancy` |
| V2b·3 | The gate's class on promote; a free publish's row, Inbox line (one an hour per partner, collapsed) and Undo as a rollback row; Ask me first bound to the deployment id; removing a partner drops its waiting versions | `npm run e2e -- --only site-hosting,partners` |
- **Reviews:** `security-reviewer`, `tenancy-auditor`, `architecture-reviewer`, `words-reviewer`, `mockup-parity-reviewer`.
- **Owner decisions:** the partner-publishing spec's open ones.

## A1a · Admin credits (lane C)
- **After it:** Frrata staff see each partner's ledger and spend by client, grant credits (a reason, a fresh passkey; two
  people above 500), return a turn, refund a purchase, see farming signals (one free grant per PAN or GSTIN, device and
  payout account).
- **Needs first:** C1. **Mockup:** approved (Admin mockup 2026-11-12).
- **Regression net:** e2e `91-neel-admin`, `75-staff-passkeys`; proof § 93.
| # | Task | Verify |
|---|---|---|
| A1a·1 | `admin_partner_credits_*` definers (aggregates and the partner's own rows by partner id, staff only, `confirmedRecently` for money) | `npm run verify:tenancy` |
| A1a·2 | Admin › Partners › Credits as drawn; grants, returns and refunds audited | `npm run e2e -- --only neel-admin` |
- **Reviews:** `security-reviewer`, `tenancy-auditor`, `unit-economics-reviewer`, `mockup-parity-reviewer`.
- **Owner decisions:** the two-person threshold (recommended 500 credits).

## V2c · Fleet care (lane A; V2c·3 first, lane D waits on it)
- **After it:** Frrata's security and legal fixes reach every hosted site within 24 h; kit updates arrive as drafts; kill
  switches for a partner, a starter and a kit version; the package mirror.
- **Needs first:** V2a. **Mockup:** approved (kit-and-fleet).
- **Regression net:** `93-site-hosting`; the fleet's smoke suite on `frrata-sites-staging` and every hosted site;
  `92-storefront-sale`; proof § 94 (the definer-only `studio_switches` and the kit and starter switches).
| # | Task | Verify |
|---|---|---|
| V2c·1 | `frrata-policies` served as signed JSON by version; the gate, the fleet and Admin read one version; widening waits 24 h | the fleet's tests; `npm test` |
| V2c·2 | Lane 1 patches: attested, per-site bill of materials, waves with bake times, smoke tests, automatic rollback never below the minimum | `node scripts/verify/fleet-smoke.mjs` on staging, 20 sites |
| V2c·3 | Lanes 2 and 3 as drafts ("Update available"; a codemod and a migration skill) | `npm run e2e -- --only site-hosting` |
| V2c·4 | The package mirror with the 7-day wait; then the session's allowed hosts add it and the gate allows packages the policy lists | the fleet's tests; proof task 18 re-run |
| V2c·5 | Kill switches for a partner, a starter and a kit version (two people); the festive freeze | `npm run e2e -- --only neel-admin` |
| V2c·6 | Admin › Kit, Controls, Rollouts as drawn | `npm run e2e -- --only neel-admin`; `mockup-parity-reviewer` |
| V2c·7 | The external pen test before V3b reaches partners | the report filed in `docs/research/`; every finding fixed or accepted by the owner in writing |
- **Reviews:** `security-reviewer`, `architecture-reviewer`, `speed-reviewer`, `release-agent`.
- **Owner decisions:** the security owner and the second approver named; the pen test's vendor.

## V3a · Agent runtime and the 20-task proof (lane D)
- **After it:** Frrata's staff build sites with Frrata's agent on the demo shop and the pilot's copy; the proof's report
  gives the owner measured credits per page and per site, failure rates and go or no-go for V3b.
- **Needs first:** V3a·1 (the spike) answered; V0 (2, 3, 4, 5, 12, 13, 15, 17, 25, 27); **BT** (tokens to propose);
  **C1·2 and C1·5** (the ledger and the reserve); **V2a·5–7** (the fleet's build path, the gate, placements); **V2c·3** (proof
  task 18); **PP1 merged** (V3a·6 moves the content save PP1 changes); G·2.
- **Mockup:** approved: Admin › Agent (kit-and-fleet); the report is a page for the owner.
- **Regression net:** e2e `89-content`, `73-pages`, `86-builders`, `91-storefront-api`; proof § 80, § 82.
| # | Task | Verify |
|---|---|---|
| V3a·1 | **The spike** (one week, `studio-eval`, can start right after V0): a Managed Agents session on Starter 0 for Kesar; the session App's token as the repository token; mount by commit SHA; whether `CLAUDE.md`, `AGENTS.md`, `.mcp.json` or hooks load as instructions; `limited` hosts and DNS; the build key in a vault header; whether each custom tool call raises a webhook (else the partner's poll may trigger one event read for its own session at most every 5 s, with `/api/cron/studio` every minute; never the shared 5-minute drain); whether the share link's cookie survives in a cross-site iframe in Safari; `next build` time and memory; concurrency and rate limits; cache shares; retention and `inference_geo`; Vercel OIDC to Anthropic; a ruleset bypass naming one App; share links through Deployment Protection | `node scripts/studio/spike.mjs` (new) writes its report; each answer dated in `frata-integrations`; `npm run check:skills` |
| V3a·2 | `src/domains/studio/` pure rules: a turn's state from timestamps, the tool allow-list per role (Builders: read tools, sandbox, `preview_build` only; every read tool as frata_builder whatever the role), proposal shapes and their refusals (UPI ids, phone numbers, URLs not a shop path or the legal block's own) | `npx vitest run src/domains/studio` |
| V3a·3 | Migrations: `studio_sessions` (`partner_id`, `partner_member_id`), `studio_turns` (ids and times only; the partner's send attempt, ADR-0008; **one open turn per session**, a unique partial index), `studio_proposals`, `studio_messages` (card kinds and ids only; index `(session_id, id)`; 180 days after unlink and ≤ 5,000 lines a site), `studio_review_notes` (capped, plain text); the setting `app.partner_id`, set only by `requireMember`/`requireCapability` from `app_access_for` and carried in the Actor; on every `studio_*` table a restrictive policy `tenant_id = app_current_tenant() and partner_id = <the setting>` and composite foreign keys `(tenant_id, partner_id, session_id) → studio_sessions`; frata_builder select on its own partner's sessions and messages, frata_admin none; definers `app_turn_actor` (membership, link, assignment, the partner step-up), `app_studio_session_for` (ids only) and the frata_app writers keyed on the turn (each checks `turn.tenant_id = app_current_tenant()`, the turn open, the actor live; settle capped at the reserve; EXECUTE revoked from public, anon, authenticated, service_role, frata_builder, frata_admin); proof § 91 | `npm run verify:tenancy`; `npm run check:capabilities`; `npm run check:tenant` |
| V3a·4 | `src/lib/studio/runtime.ts` with the Managed Agents implementation (SDK client 30 s timeout, 1 retry; events 15 s); the agent and environment as files synced by `ant apply` (pinned model, toolset, custom tools, web tools off, hosts from the policy; the vault with `injection_location: {header: true}` and exactly `api.frrata.shop`) | `npx vitest run src/lib/studio` |
| V3a·5 | `/api/webhooks/anthropic` (the SDK's Standard Webhooks check on the raw body, size cap, key `anthropic:<session>:<event>`, 200 at once, the tenant from `app_studio_session_for`; rows trimmed to ids once processed, deleted in batches after 30 days) in ENTRY_POINTS; **each custom tool run in that webhook's `after()`**, once per `custom_tool_use` id, accepted only after the open turn's `user.message` event id and before it closes, its tenant equal to the session's, never through the shared outbox; `/api/cron/studio` every minute with its own deadline and `eachLimited(8)` as the net (the shared drain carries about 2,300 rows a day); **`asTurn(turn, cap, work)`**: the turn from our own open-turn row, the person checked in its own short transaction that then closes, reads outside any transaction, writes `*In(tx)` in their own `withTenant`, the audit row; listed in `check:actions` and pinned in `check:capabilities` as the second Actor maker | `npm test`; `npx vitest run src/lib/studio`; a deadlock test: 20 tool calls at once with the pool at `max` finish |
| V3a·6 | **After PP1 merges:** the content and token saves move from the console's actions into `src/lib/content/save.ts` (a transaction and an actor; it asserts the capability), both the console action and Apply calling it; then the tool executors in `src/lib/studio/tools/` and Apply cards | `npm run e2e -- --only content,pages` green before and after |
| V3a·7 | The instruction-file check at the mounted SHA; the session App's token minted, rotated and revoked; the lockfile compared with the policy and installs with `--ignore-scripts`; partner skills attached from a partner-level repository holding no brand content; `preview_build` reads the branch head's SHA itself, never from the model | `npx vitest run src/lib/studio` |
| V3a·8 | `read_brand_site` and the no-tool Haiku 5.5 extractor (moved here from V3c so proof tasks 2 and 16 can run), both metered into the turn | `npx vitest run src/lib/studio`; proof tasks 2 and 16 |
| V3a·9 | Admin › Agent: sessions, today's spend, the agent version, kill switches (one person stops, two resume; stopping deletes build keys, archives vault credentials, revokes repository tokens); sessions deleted at Anthropic 30 days after they end | `npm run e2e -- --only neel-admin` |
| V3a·10 | `check:studio` (new gate): tool executors import only the allowed save and query modules and run through `asTurn`, never `db()`; no cached loader or read tool inside a transaction; every id in a tool's input matched with `where tenant_id = turn.tenant`; the agent file pins a model id, web tools off, hosts equal to the policy | `npm test` (the gate run against its own description, CLAUDE.md) |
| V3a·11 | The proof: `scripts/studio/eval.mjs` runs the 20 tasks × 3 trials on `studio-eval`, with real pauses in tasks 1 and 13, and writes the report (credits, pass rates, failures, change-to-preview, speed and accessibility against Starter 0) | `node scripts/studio/eval.mjs --report` prints every threshold in spec § 9 against its measure; `unit-economics-reviewer` on the report |
- **Reviews:** `architecture-reviewer`, `security-reviewer`, `tenancy-auditor`, `unit-economics-reviewer` (the report),
  `speed-reviewer` (the webhook-to-tool round trip), `impact-reviewer` per task.
- **Owner decisions:** 2, 3, 4, 5, 12, 13, 15, 17, 25, 27, 29; then go or no-go on the report.

## V3b · Studio, the one screen (lane D)
- **After it:** a partner builds a site in one sitting with Frrata's agent: start cards, voices, looks, logo, pages,
  building with Apply cards, ready, send, the brand's notes, publish and hand over cards; the preview beside the chat
  (phone: a sheet); versions and the brand book drawers; credits before every run. Builders build and preview; only an
  Owner or Lead applies, sends, publishes or hands over.
- **Needs first:** V3a's proof passed; V2a; C1; BT; G-a; T1c (built).
- **Mockup:** approved (the one screen); **first a redraw** of the Deviations rows and the added states (a turn paused at
  its reserve, a returned turn, a kill switch, changed agent instructions, proposals waiting, publish outcomes after
  handover, a developer's branch in Versions).
- **Regression net:** e2e `80-partner-team`, `86-builders`, `87-partner-clients`, `40-partners`, `89-content`,
  `93-site-hosting`; the proof's suite on every agent-version change.
| # | Task | Verify |
|---|---|---|
| V3b·1 | The redraw of the four deviations and the added states, for the owner | `node scripts/check-mockup.mjs docs/mockups/<the redraw>.html`; the owner's yes |
| V3b·2 | The screen as drawn, Neel primitives only, under the bare `(partner)` layout (101 kB; the `(workspace)` layouts already ship 136.1 kB); only drawers, Versions and late cards through `next/dynamic`; it polls new `studio_messages` rows by keyset on `(session_id, id)` (a GET rows route, `private, no-store`, ≥ 40 a minute per member): every 1.5 s for 20 s after any change, then 3 s, then 6 s, stopped while the tab is hidden or no turn runs; the pane's reads skip the cache, Apply purges the draft entry, hand edits save on release at most every 2 s under a `brand` tag; the pane framed with `sandbox="allow-scripts allow-same-origin"` | `npm run e2e -- --only studio` (new flow `94-studio` on a fake runtime measures the bytes before the first card works, ≤ 150 kB); `npm run build` (the budget gate, `APP_BUDGET_KB` unchanged) |
| V3b·3 | Credits on every card drawn at render from C1's definer; reserve before, settle after; budget and low-balance states in the chat | `npx vitest run src/lib/studio`; `npm run e2e -- --only studio` |
| V3b·4 | Apply cards (the exact value, a passkey check after handover, a batch when every value is on screen); hand edits saved as the person's data writes, each a chat line and a version | `npm run e2e -- --only studio,content` |
| V3b·5 | Publish and Hand over cards call V2a and V2b's actions (passkey within 5 minutes); Builders refused in words | `npm run e2e -- --only studio,builders` |
| V3b·6 | Sessions at once per seat and a global queue of at most 70 sessions at once (decision 29); builds only at a turn's end; open to five partners, then all approved partners | `npm run e2e -- --only studio` (a queued session waits with its line); Admin › Agent shows the queue in `npm run e2e -- --only neel-admin` |
- **Reviews:** `architecture-reviewer`, `security-reviewer`, `tenancy-auditor`, `speed-reviewer`, `unit-economics-reviewer`,
  `words-reviewer`, `design-system-reviewer`, `mockup-parity-reviewer`, `e2e-runner`.
- **Owner decisions:** 16, 24, 29; what a seat includes beyond credits (sessions at once; shell spec Q7).

## V3c · Intake link (lane D)
`docs/specs/2026-11-12-studio-intake-and-team.md` § Intake; the fetch and the extractor already exist (V3a·8).
- **After it:** the brand sends its logo, guide, photos and words through one link; the agent reads them as data.
- **Needs first:** V3b; S1 closed for intake files. **Mockup:** approved (v2.2/v2.4), the brand's link page re-drawn where
  the one screen differs. **Regression net:** `94-studio`, `12-security`.
| # | Task | Verify |
|---|---|---|
| V3c·1 | The link: 128-bit token stored as sha256, 14 days, the token-only definer (the ADR-0002 exception in the intake spec), GET changes nothing, `no-store`, `no-referrer`, `noindex`; limits per link and /64, failing closed; the intake tables with grant, RLS, policy and their frata_admin and frata_builder grants | `npm run verify:tenancy` (proof § 95); `npm run e2e -- --only intake` (new flow) |
| V3c·2 | Files: private storage, magic-byte check, photos re-encoded, SVG and PDF rasterised in a sandbox with caps, originals deleted 30 days after approval | `npx vitest run src/lib/studio` |
| V3c·3 | The brand's page as drawn (phone, Skip on every step); `read_intake` reads only the processed files | `npm run e2e -- --only intake`; `mockup-parity-reviewer` |
| V3c·4 | Instagram once Meta's review clears (Q3), its own read-only connection | `integration-researcher` first (older than 90 days); then `npm run e2e -- --only intake` |
- **Reviews:** `security-reviewer`, `tenancy-auditor`, `integration-researcher`, `words-reviewer`.
- **Owner decisions:** intake Q3 (Instagram).

## V3d · Routines (lane D)
- **After it:** a saved ask runs on a schedule (hourly at most) or on a Frrata event and leaves a draft and an Inbox line;
  never publishing after handover; stopped when the partner or person is removed.
- **Needs first:** V3b, V2b. **Mockup:** new. **Regression net:** `94-studio`.
| # | Task | Verify |
|---|---|---|
| V3d·1 | `studio_routines` (tenant row, `partner_id` under the same restrictive policy and composite keys, the saved ask's hash, the schedule), proof § 96; removal stops them | `npm run verify:tenancy` |
| V3d·2 | The scheduler through the outbox (`notBefore`), each run a turn with its reserve, a draft and a line; a routine's proposals wait for a person | `npx vitest run src/lib/studio`; `npm run e2e -- --only studio` |
| V3d·3 | The screens as drawn | `mockup-parity-reviewer` |
- **Reviews:** `security-reviewer`, `unit-economics-reviewer`, `speed-reviewer`.
- **Owner decisions:** whether a routine may publish before handover (recommended: no; a person always publishes).

## G-b · API gaps that make sites better (lane B, later)
G1 a bag quote; G25 a keyless availability read by size id; G7 delivery by PIN code; G8 `arrivesBy`; G2 several values per
filter; G3 facets per collection, fabric and occasion; G4 best sellers; G9 search suggestions; G10 sizes in the store's
order; G16 renditions per ratio; G17 payment methods; G18 hours. Each additive, verified by
`npx vitest run src/domains/storefront-api` and `npm run check:api`, with `api-contract-reviewer` and `speed-reviewer`;
G1 and G25 also `security-reviewer` (a keyless read). Signal: a site asks, or the proof's task 8 shows it.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Proving each partner definer refuses the wrong caller | `verify:tenancy` § 28b |
| Seeding a passkey step-up for a signed-in test person | e2e `signedIn` (staff and partner) |
| Running the 20 tasks before every model or agent-version change | `scripts/studio/eval.mjs` (V3a·11), its report gating the switch |
| Checking that a custom tool runs inside `asTurn`, calls only an existing save, and the agent file pins its model, hosts and web tools | `check:studio` (V3a·10) |
| Proving a hosted site still loads, shows the legal block and reaches checkout after any deploy | `scripts/verify/fleet-smoke.mjs` (V2a·5), run by `release-agent` after each production push |
| Pricing a turn and a site from measured usage | the proof's report (V3a·11), read by `unit-economics-reviewer` |
| Checking every account's plan, protection and token scopes before V2a | `scripts/ops/hosting-preflight.mjs` (V0·8) |

## Practices recorded in skills
Architecture: `frata-architecture` § Partners (teams); § Studio (V0·7: the runtime adapter, tools through existing saves,
`asTurn`, the build key). Unit economics: `frata-unit-economics` (V0·7: the credit at 1.10, the hosting figures).
Integrations: `frata-integrations` § Anthropic (V0·7, V3a·1). Testing: the partner-team flow; `93-site-hosting`,
`94-studio`, the 20-task proof.
