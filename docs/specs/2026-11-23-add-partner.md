# Settings › People: add people by role, and a partner
Status: draft · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/J5gH384tpfF93oDHjCpYpm · Approved: —

## The owner's words (2026-11-23)
- "how do a merchant change his partner? align one? i'm unable to do that. pleaes guide if feature isn't there, please plan and execute."
- "merchant should be able to add other team members as well. staff, partner, accountant (by roles)"
- On the first five calls: "yes, manager also. / owner and manager / email / no revenue share / limit on people - keep modest limit per plan."
  Read as: Manager is offered; the owner and a Manager add people; a partner is named by the partner owner's email; no
  revenue share for a partner the owner adds; a modest people limit per plan.

## Goal
Ranked problem 5 (a website built as code by a partner) and the console's basics: a brand can't run its business
alone. Today a store can't add Staff or a Manager at all, and can't take on a partner. Measure, in Frrata Admin after
30 days: stores with more than one person; invitations sent against accepted, by role; stores that added a partner.

## What exists (read in the code, 2026-11-23)
- Roles: owner, admin (shown "Manager"), staff, partner, accountant, and a partner's Builder (`src/domains/tenancy/roles.ts`).
- `invites` already allows roles owner, admin, staff, accountant (drizzle/0072). `app_claim_invites` (drizzle/0023)
  turns every open, unexpired invite for a confirmed email into a `members` row at sign-in. Only the accountant has
  a way in: `app_invite_accountant` (owner or admin, 14 days, GST app on). **It sends no email**; the person finds the
  store only by signing in.
- A partner joins a store only by creating it (`app_partner_create_shop`, terms from `PARTNER_TERMS`). The owner can
  only remove it (`app_remove_partner`, owner only). One live link per store (`partner_links_one_active`).
- No plan limits people. `plan_versions` holds `monthly_price`, `included_orders`, `fee_bps`, `features`.

## What each role can do (from `CAPABILITIES`, as the code grants today; nothing new)
- **Manager:** everything the owner does, costs and profit included, but removing the partner.
- **Staff:** orders, shoppers, products, sending parcels. Never costs, profit, payments, GST or store settings.
- **Accountant:** GST and documents only. No orders, costs or profit.
- **Partner:** orders, shoppers, products, the look, content and website keys. Costs only before the store has an owner.
No role looks wrong for a brand's own hire. One note: Staff see shoppers' names, phones and addresses (`shop.work`), as
anyone who packs orders must.

## Design (one phase; mockup)
1. **People list:** each person with role chip, "Since <date>", Remove. Open invitations with email, role, "Expires
   <date>", Cancel. The partner's people stay grouped under the partner, as today.
2. **"Add a person"** (owner and Manager): one dialog. Email, then Role: Manager · Staff · Accountant · Partner. One
   line under each role says what it opens (the list above). Accountant is offered when the GST app is on, as today.
3. **Manager, Staff, Accountant** use the existing `invites` path: a generalised definer
   `app_invite_person(p_uid, p_email, p_role)` replaces `app_invite_accountant`. The person gets an email (new) and joins
   at sign-in through `app_claim_invites`, as today.
4. **Partner** stays a two-sided invitation (an organisation with its own people and terms): Role › Partner sends a
   `partner_requests` row naming the email. People shows "Partner invitation · riya@kesarstudio.in · Expires …". The
   partner owner whose sign-in email it is sees it in Partner workspace › Clients › Invitations and accepts or declines.
   The owner learns the partner's name only on accept. Nothing tells the owner whether an email belongs to a partner:
   the reply and the row are the same either way, and the email goes out only when it does.
5. **Remove:** owner and Manager remove Staff and Accountants. Only the owner removes a Manager or the partner (call 1).
   Nobody removes an owner here, so the last owner can't leave.
6. **Change partner** = Remove, then Add. **Change a person's role:** later; remove and add again covers it.
7. **People limit per plan** (call 2): Managers + Staff + Accountants, open invitations included. The owner and the
   partner's people never count. At the limit, "Add a person" opens to "3 of 3 people on Launch" with "Change plan";
   Partner stays available. Checked in the definer at invite and again at claim.

States drawn: one person (the owner alone); many; open invitation; expired invitation; partner invitation sent; partner
accepted; partner declined; partner invitation expired; at the limit; email already on the store; the owner's own email;
Manager's view (no Remove on a Manager or the partner); Staff and a support visit (read only); phone.

## Terms for a partner the owner adds (owner: "no revenue share")
The link stores `share_bps 0`, `share_months 1` and `notice_days 0` (the CHECK needs `share_months > 0`; the migration
says why). The store's bill is unaffected: the share is paid from Frrata's fee, never billed to the brand.
For the record (from `shareExample()`, a Launch brand at 120 orders × ₹1,200): Frrata collects ₹4,379 a month; 20%
would have been ₹875.80 a month, ₹21,019.20 over 24 months. unit-economics-reviewer (2026-11-23) found what reads the
terms wrongly, all taken into the build: `app_partner_clients` carries `share_bps` and `clients.ts` drops its 20%
fallback (else the page says "20% from opening"); a 0 bps link shows no share line (`monthShare(m, 0)` prints "₹0").
Credits never read the share.

## People limit (call 2): proposed numbers
| Plan | Price | Orders included | People (proposed) |
|---|---|---|---|
| Launch | ₹1,499 | 150 | 3 |
| Growth | ₹4,999 | 1,500 | 10 |
| Scale | ₹14,999 | 5,000 | 25 |
One new column `plan_versions.people_limit` beside `included_orders`, read through `entitlements.ts`. A store over its
limit after a plan change keeps everyone; it just can't add.

## Design review
- **UI/UX:** one primary action, "Add a person"; one dialog; role chosen by name with its one line. Constraints over
  refusals: roles a caller can't give are not offered; at the limit the dialog says so before the email is typed.
- **Tenancy:** `invites` and new `partner_requests` written only through definers that take the store from
  `app_current_tenant()` and the caller's own `members` row; `frata_app` reads `partner_requests` under the tenant policy
  and writes nothing. The partner side reads only through a definer keyed on the caller's own confirmed email and live
  partner-owner row. New table ships with grant, RLS and policy.
- **Modularity:** `ROLES_GIVEN_BY` (who may give which role) and `peopleLimit()` pure in `src/domains/tenancy/`;
  definers in a custom migration; wrappers in `src/lib/db/people.ts` (accountants.ts folds into it).
- **SSOT:** who-may-give-what lives once in `ROLES_GIVEN_BY`, mirrored by the definer and pinned by a test that compares
  them. Request state derived from stamps and `expires_at`. The limit lives on `plan_versions`.
- **YAGNI:** no role change, no one-step partner change, no partner search, no seat purchase.
- **Reliability:** every email through the notices outbox in the definer's transaction (ADR-0006).
- **Unit economics:** no share on an added partner; the limit nudges plan upgrades but changes no price.
- **Blast radius:** `app_claim_invites` gains the limit check and must still refuse `owner` invites from this path;
  accountant UI and actions fold into the new dialog; `app_remove_partner` also cancels an open partner request.

## Guard rails (security-reviewer to confirm on this version)
1. Roles a person may give: owner → Manager, Staff, Accountant, Partner; Manager → Staff, Accountant. A closed list,
   checked in the definer (never only in the UI). Nobody gives `owner` through this path.
2. A Manager can never add, remove or change an owner, another Manager, or the partner (call 1). Nobody can raise their
   own role: the definer refuses an email already on the store.
3. A support visit sends, cancels and removes nothing (refused in the action and by the definer's `members` check).
4. Rate limits, failing closed: invitations 20 an hour per store and per person; partner requests 5 a day per store.

## Earlier review findings that still hold (2026-11-23, partner part)
security-reviewer and tenancy-auditor on the code version; each still applies to the email version:
- Accept (`app_partner_answer_request`) locks the tenant and the request, requires the request open and unexpired, no
  live link, the sender still owner, `app_partner_need(..., true)`; refuses `already_member` when anyone live in that
  partner's team already holds a store role; writes the link, the partner owner's `members` row and an audit row.
  While `passkeys_off` is live the step-up is email only.
- A re-added partner's old storefront keys must not come back: accept revokes that partner's keys on this store made
  before the new link, then `refreshKeys(tenant)`; the tenancy proof covers remove, re-add, old key refused.
- The send definer stamps expired open rows before inserting, so an expired one frees the slot.
- Each definer writes its own notice; addresses looked up inside, never passed or returned. Names in emails are text.
- The owner is emailed on every partner invitation sent; the Send step says what the partner will see.
- Grants: revoke all from public, anon, authenticated, service_role, frata_builder; RLS on; `tenant_rows` select for
  `frata_app`; `frata_admin` select with `admin_read`; proof rows in `scripts/verify/tenancy.sql`.

## Out of scope
Changing a person's role; one-step change of partner; buying extra seats. Each comes back on owner request.

## Plan, written at sign-off (check:plans admits a plan only once approved)
1. Regression net: int tests for today's accountant invite, claim and `app_remove_partner`; an e2e flow for People.
2. Migrations (next free numbers after 0172, taken at build): `partner_requests`, `plan_versions.people_limit`;
   custom: grants, RLS, policy, the definers. Verify: `npm run verify:tenancy` with the new proof rows.
3. `ROLES_GIVEN_BY`, `peopleLimit()`, `requestState()` with unit tests.
4. Console: People list, "Add a person" dialog, actions. Verify: int test of every refusal in Guard rails.
5. Workspace: Invitations and the accept dialog. Verify: int test (a Lead and a Builder refused; owner accepts).
6. Emails through the notices outbox. Verify: the notice row is in the same transaction.
7. mockup-parity-reviewer, impact-reviewer, words-reviewer, design-system-reviewer.
