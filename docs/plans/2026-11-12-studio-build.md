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
1. **Migration 0117 (tables, generated + custom):**
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
5. **e2e `76-partner-team`:** owner invites lead@ to shop A only → lead signs in, accepts, sees A not B, opens A;
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

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Proving each partner definer refuses the wrong caller | `verify:tenancy` § 28b |

## Practices recorded in skills
Architecture: `frata-architecture` § Partners (teams). Testing: the partner-team flow.
