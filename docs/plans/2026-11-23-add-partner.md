# Settings › People: add people by role, and a partner — the task plan (lane H)
Status: active, built on `claude/lane-h-add-partner`; released by the orchestrator after the reviews below.
**Mockup:** https://claude.ai/artifact/J5gH384tpfF93oDHjCpYpm (`docs/mockups/2026-11-23-add-partner.html`, version 2)
**Approved:** owner, 2026-11-23 ("mockup approved." at 18:15 UTC, on version 1; then "redrawn approved" for version 2)
**Review:** tenancy-auditor on the spec, 2 passes, every finding written into the spec and built, 2026-11-23
**Review:** security-reviewer on the spec, 2 passes, every finding written into the spec and built, 2026-11-23
**Review:** unit-economics-reviewer: no share confirmed; 3 build fixes, made, 2026-11-23
**Review:** words-reviewer on the mockup, 2 passes, rewrites applied, 2026-11-23
Spec: `docs/specs/2026-11-23-add-partner.md`. Migrations: `drizzle/0173_people_and_partner_requests.sql` (generated),
`drizzle/0174_people_access.sql` (custom). Proof: `scripts/verify/tenancy.sql` § 103.

## The owner's words (2026-11-23)
"merchant should be able to add other team members as well. staff, partner, accountant (by roles)"; on the calls:
"yes, manager also. / owner and manager / email / no revenue share / limit on people - keep modest limit per plan.";
then "redrawn approved" (orchestrator relayed it with the two recommendations: a Manager adds and removes Staff and
Accountants only; only the owner adds or removes a Manager or the partner; the people limit per plan, open invitations
counting, the partner's people not).

## Tasks
1. Schema and definers (0173, 0174); `verify:tenancy` § 103. Done: passes on a throwaway Postgres 16.
2. `src/domains/tenancy/people.ts` (`ROLES_GIVEN_BY`, `ROLE_LINE`, `requestState`) with `__tests__/people.test.ts`,
   which pins the SQL mirror. Done.
3. `src/lib/db/people.ts` wrappers; `accountants.ts` folded in. Done.
4. Console: People page, Add a person, rows, Partner card; `people-actions.ts`; `people.int.test.ts`. Done.
5. Workspace: Clients › Invitations, accept and decline. Done.
6. Emails: `store_invite` and `store_partner_invite` through `staff_notices` (an address, platform rows); owner
   notices through `notice_write` (source `partner_request`, owners and Managers only). Done.
7. The invited partner's pages say "No share" (`app_partner_clients` carries `share_bps`). Done.
8. Reviews on the diff; mockup parity. Below.

## Limits as built (owner saw the numbers and said "go ahead.", 2026-11-23)
Launch 3 · Growth 10 · Scale 25 people (`plan_versions.people_limit`, 0174). Invitations: 20 an hour per person and per
store, 50 a day per person (failing closed); per recipient at most 3 invitation emails a day across all stores and none
within 10 minutes of the last; partner invitations 5 a day per store. All invitations last 14 days.
A store already over its limit keeps everyone; it adds no one until it is under (an open invitation's claim is skipped
and stays open until it expires; People still lists it). The accountant's old definers (0072) are revoked from the app:
during the deploy window, old code that invites an accountant gets a refusal in words, nothing else.
Left for later (impact review MEDIUM, accepted as debt): the owner-only notice kinds are listed in TS and SQL (both
updated, no pin test yet); `ROLES_GIVEN_BY` sits beside `CAPABILITIES` rather than inside it.

## Deviations
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| People rows show a person's name ("Prem Banerjee") | The person's email | The store holds no names for its people; an email is what the owner typed | no — to show at release |
| Manager's line "Everything you can do, costs and profit included." | "Everything you can do, payments and costs included." | security-reviewer L4: a Manager holds where online payments go; the owner should know | no — to show at release |
| Partner invitation row "From Prem Banerjee" | Store name and expiry only | The partner never receives the owner's email before accept (tenancy review); no names held | no — to show at release |
| Staff seeing People read only (state 3) | Staff can't open People; a support visit reads it | security-reviewer M4: People stays owner and Manager | no — to show at release |
| Decline shown as "<email> declined" | As drawn | A decline is the partner's own act; it tells the owner the address was a partner's, which only that partner chose | yes (drawn) |
| Email to the invited person, button "Sign in to House Of Ayuda" | As drawn, through the staff security pipe's template | The address pipe is the only one that reaches a non-member | yes (drawn) |
