# Partner publishing after handover
Status: active (PP1 built 2026-11-16; PP2, PP3 wait for V2) · Date: 2026-11-16 · Mockup: PP1 https://claude.ai/artifact/Tu2ipYwMJYvM2THSKg5SMT (docs/mockups/2026-11-16-pp1-owner-only.html) · Rule: ADR-0014 amendment 9 (owner,
2026-11-16: "yes. record and plan.")

## Goal
Ranked problem 5, a premium storefront built as code by partners: a brand's website keeps getting better after
handover without the owner reviewing every change. Measures, once V2 hosts sites: median days between a partner's
publishes on handed-over shops (target: no slower than before handover); share of free publishes undone within 7 days
(< 5%; above it, the default turns to "Ask me first"); sensitive changes that shipped without the owner's yes (0).

## Job
After handover the owner picks, per partner, whether that partner publishes freely or asks first, so partners can add
pages and redesign whenever they like while the risky changes always reach the owner.

## The rule (ADR-0014 amendment 9)
| | Before handover | After, "Publishes freely" (default) | After, "Ask me first" |
|---|---|---|---|
| Code publish (pages, layout, redesign) | Partner, checks pass (amendment 6) | Partner, checks pass; owner told with Undo | Waits for the owner's approval of that version |
| Content (words, menus, FAQ, banners) | Partner saves live | Partner saves live; owner told (amendment 8) | Same as freely: content is not a publish |
| An outside script or service | Checks only | **Owner's yes** | **Owner's yes** |
| Policy pages, legal details | Partner | **Owner's yes** | **Owner's yes** |
| The site's domain (Website setting) | Partner (no owner yet) | **Owner or Manager only** (already so: `mayManageApi`) | Same |
| Prices, stock, orders, shoppers, payments, costs | Never through the site | Never | Never |

## What exists today (checked 2026-11-16)
- Policies (`policies` section and the policy texts, `policy.edit`), **Business and GST** and **Contact and grievance
  officer** are `CAN_BUILD` (`src/domains/settings/sections.ts`, `src/app/(console)/console/settings/actions.ts:111`):
  a partner edits them after handover today. **This is the gap PP1 closes.**
- The Website setting and keys: a partner only while the store has no owner (`mayManageApi`,
  `src/domains/storefront-api/keys.ts`). A custom domain is `CAN_MANAGE`. Already matches the rule.
- Code publishing, the publish gate, `site_deployments`, rollback: none yet (V2, kit spec §§ 4–6). A site today is a
  repository its builder deploys (the pilot: Frrata builds House of Ayuda and the owner reviews; unchanged).

## Phases
### PP1 — Policies and legal details after handover (console; can ship before V2)
- After a store has an owner, a partner member cannot save the Policies section, the policy texts, Business and GST,
  or the grievance officer. Before handover, unchanged. Enforced where the section's `editors` are read (page, save,
  upload), through one pure test beside `seesCosts`: `maySaveSensitive(role, hasOwner)`, read with `hasOwnerIn(tx)`
  inside the save's transaction (fails closed).
- The partner sees the section read-only with one line and an **Ask the owner** button: it sends the owner an Inbox
  line naming the section and the partner, with a link to it. (The owner edits it. No queue of proposed text: YAGNI
  until partners ask for it.)
- Mockup: the section as a partner sees it after handover; the owner's Inbox line. Phone and desktop.
- Tests: unit (`maySaveSensitive` against every role × hasOwner); e2e on a handed-over store (partner refused in
  words, owner saves); `check:capabilities` row.

#### PP1 plan (2026-11-16)
Security review on the plan (2026-11-16): FIX BEFORE MERGE, folded in below (M1 race, M2 Contact half-lock, L1–L3).
**Writers held:** only `saveSection` and `savePolicyText` write these columns after a shop exists (sign-up, creation
definers and Admin write them only at creation; the Storefront API and content layer only read; the upload route
checks `invoices` and `store` only and needs no change). Postgres does not stop a missed writer (frata_app holds update
on `shop_settings` and `shop_policies`), so the two actions are the lock.
**What PP1 protects:** what Frrata stores and serves (checkout, order pages, invoices, the policy pages and legal block
the Storefront API serves). It cannot stop a partner's own site code or a Content page from printing other words; the
publish gate (PP3, V2) checks the legal block and policy links on code sites, and Content saves are told to the owner.

**Locked for a partner once the store has an owner** (one pure list, `src/domains/settings/owner-only.ts`):
the Policies page (return kind and days) and every policy page's own text; the whole Business and GST page; the
Grievance officer block of Contact (name, designation, email, phone). Customer care, WhatsApp and Instagram on Contact
stay the partner's. Invoices and slips: the authorised signatory and the series prefix (decision 5). Before an owner exists, nothing is
locked for a partner. Owners and Managers are never locked. A support visit sees every locked page and block
read-only, whether or not the store has an owner (decision 5), with no Ask the owner.

| # | Task | Verify |
|---|---|---|
| 0 | **Done 2026-11-16.** Regression net first: e2e flow `93-owner-only` (built on `89-content.mjs`'s partner-after-handover setup) on a handed-over store (partner sees Policies, Business and GST, Grievance officer read-only; saves refused in words; customer care still saves; owner saves all); unit tests for the list | `npm run e2e -- 93`, `npx vitest run src/domains/settings` |
| 1 | **Done 2026-11-16.** `owner-only.ts`: `lockedFor(role, hasOwner, support)` → pages and fields, written as `hasOwner && !holds(role, 'shop.manage')` (no `role === 'partner'`, check:capabilities); `editors` unchanged so the pages still open | unit tests: every role × hasOwner × support |
| 2 | **Done 2026-11-16.** Server: `saveSection` (`settings/actions.ts:54`) and `savePolicyText` (`:106`, both edit and reset) take `select 1 from tenants … for share` and then `hasOwnerIn(tx)` inside the `asMember` transaction (a handover holds the tenant row, so a save racing it sees the owner; fails closed). A locked whole page is refused in words; on Contact the grievance keys are **dropped** from the columns for a locked caller (as `HELD_BY_ZONES` is), never trusted, so an omitted key cannot blank them; when the sent grievance values differ from the stored ones the save is refused in words ("Only the owner or a Manager can change the grievance officer now.") rather than reporting a silent success | server tests: grievance keys omitted and changed; e2e step; race proof in `verify:tenancy` |
| 3 | **Done 2026-11-16.** Page: a locked page or block renders its values as `Facts` (label and value, as the Website page does for read-only), Content's chip "Only the owner or a Manager can edit" beside the title (or the block's title), **Ask the owner** as the header's one action; no save bar, no Rewrite/Edit/Follow-my-settings links; the policy pages still switch the preview. After asking: an ok toast "Asked the owner." and the button off with "Asked today" for the rest of the India day. A refused stale save: error toast "Only the owner or a Manager can change this now." · "Nothing was changed." · Reload | mockup parity |
| 4 | **Done 2026-11-16.** Ask the owner: the action takes only `page` (`z.enum(['policies','business','contact'])`), uid from `auth.userId`, a `withinLimit` that fails closed. Definer `app_ask_owner(uid, page)`: tenant from `app_current_tenant()` (null → false); caller a live partner (`members` role partner joined to a live `partner_members` and a live `partner_links`); the store has an owner; `pg_advisory_xact_lock` on store+page, then at most one a page a day; title, body and href fixed in SQL, the partner named only through `by`; words "Your partner asks you to update {the grievance officer | your policies | Business and GST}" · "See it in Settings."; `ask_owner` added to the `notices_source` CHECK in the same migration; revoked from public, anon, authenticated, service_role, frata_admin, frata_builder, granted to frata_app only. Shown and emailed to owners and admins only: `listNotices`, `unreadNotices` and `app_notice_members()` gain a role filter for `ask_owner` (today every notice reaches every member). frata_app keeps no insert on `notices`. Logs carry `errName` only | `verify:tenancy` § new; e2e |
| 5 | **Done 2026-11-16.** Reviews on the diff (security, tenancy, impact, words, design system, mockup parity), docs, ship with the migration | release checklist |

**As built (2026-11-16):** `src/domains/settings/owner-only.ts` (`lockedFor`, `lockOf`, `mayAskOwner`, `seesAsks`, the
words); `saveSection`/`savePolicyText`/`askOwnerAction` in `src/app/(console)/console/settings/actions.ts`
(`hasOwnerHeldIn`, `src/lib/queries/settings.ts`); drizzle/0150 (`app_ask_owner`, `ask_owner` in the CHECK,
`app_notice_members(notice)`); proof `tenancy.sql` § 87 (the race on two connections through dblink); server tests
`settings/__tests__/owner-only.int.test.ts`; e2e `93-owner-only`. The Ask the owner action takes `invoices` too (decision
5), worded "Your partner asks you to update your invoice details".

**Deviations from the approved mockup** (the owner sees them in the release report before it ships):

| What | Mockup | Built | Why |
|---|---|---|---|
| Invoices and slips, partner after handover | Not drawn (decision 5 came with the approval) | The signatory and the series prefix as `Facts` under their block's own fields, the chip beside each value; Ask the owner the header's one action | Two blocks are locked in part: a chip by the block title would claim the order prefix and the note too, and two Ask buttons would break "one primary" |
| The invoice refusal | Not drawn | "Only the owner or a Manager can change these invoice details now." · "Nothing was changed." · Reload | The Contact variant's shape, for decision 5's fields |
| An empty locked value | Not drawn | "Not set" in text 2 | A fact needs a value; a blank cell reads as broken |

### PP2 — The choice per partner (lands with V2's publishing)
- Settings › People, on a partner's row: **Publishing** — "Publishes freely" / "Ask me first". Owner or Manager
  (`shop.manage`); a support visit never changes it; audited. Stored as one timestamp on the store's partner link
  (`partner_links.publish_asks_since`, null = freely; derived, never a status column), with `publish_asks_by`.
- Built only when there is something to publish: V2's publish gate and `site_deployments`. Until then the row would
  switch nothing (YAGNI).

### PP3 — Free publishes, told after, with Undo (V2)
- The gate classifies each version against the live one: **ordinary**, or **needs the owner** when the build output
  adds a host to the scripts, connections, frames or images it loads (CSP and the outbound allow-list, kit spec § 4),
  or when the publish would change the domain. A version that needs the owner waits whatever the partner's choice.
- A free publish writes its `site_deployments` row (cause `partner_publish`, approval null, the choice in force) and
  enqueues one Inbox line to the owner (ADR-0006): who, what changed (pages added or removed, from the build's route
  list), a signed preview link, **Undo**. Undo = rollback to the previous kept deployment, owner or Manager, one tap,
  its own row; a rollback never removes a Frrata patch-lane fix (lane 1 lands on the live branch, kit spec § 5).
- "Ask me first": the same line says **Review and publish**; the owner approves that exact deployment id.
- Mockup: Settings › People's Publishing control; the Inbox lines (published, waiting, needs your yes); the review
  screen; Undo's confirm and its result. States: waiting, published, undone, refused by checks, a partner removed
  mid-review (the version is dropped).

## Design review
- **UI/UX:** three moments, each one primary action: Ask the owner (PP1), choose Publishing (PP2), Undo or Review
  (PP3). States as listed per phase. Words: "Publishes freely", "Ask me first", "Undo", no jargon about deployments.
- **Tenancy:** no new table. PP2 adds columns to `partner_links` (tenant table, RLS already on); PP3 uses V2's
  `site_deployments` (its own spec). Tenant id from `requireMember` only. `tenancy-auditor` on each phase's plan.
- **Modularity / SSOT:** the rule is one pure function in `src/domains/partners/` (who may publish what, given role,
  hasOwner, the choice, the version's class); the console, the gate and the e2e read it. The choice lives once on the
  link. "What changed" is derived from the two deployments, never stored as text.
- **YAGNI:** no proposed-text queue for policies, no per-page approval, no per-partner budget. Signals: partners ask
  to suggest policy text; owners undo > 5%.
- **KISS:** one column, one classifier, one Inbox line; Undo reuses rollback.
- **Scalability / speed:** one Inbox line per publish (a partner publishing often is rate-limited to one line an hour
  per partner, collapsed, as content saves are); no page gains a query beyond the link already read.
- **Reliability:** the Inbox line and the rollback go through the outbox; a failed rollback says so and leaves the
  live version serving.
- **Security:** the choice is `shop.manage`, audited; the classifier runs in Frrata's gate on build output, never the
  site's own copy; an outside host can never ship without the owner; removing a partner drops its waiting versions.
  `security-reviewer` on PP1 and PP3 plans.
- **Motion and visuals:** existing toast and dialog patterns; no new motion.
- **Unit economics:** none (no price change; publishes are already in V2's metering).
- **Blast radius:** PP1 changes four settings sections' editors for partners after handover; every caller of
  `editors` (page, save, brand upload) is checked in its plan. Partners on stores already handed over lose those
  saves the day PP1 ships; no notice (decision 4).

## Owner decisions (2026-11-16: "you can build PP1 now. * read only * legal * no. everything is test data as of now.")
1. PP1 is read-only with **Ask the owner**; no queue of proposed text.
2. The grievance officer's details are legal details: owner-only after handover.
3. PP1 is built now, before V2.
4. No notice to partners on stores already handed over: every store is test data today.

5. (2026-11-16, "finish up pp1 as per your recommendation"; mockup https://claude.ai/artifact/Tu2ipYwMJYvM2THSKg5SMT
   approved) Locked values read as `Facts`, not disabled inputs. A locked Policies page hides Rewrite, Edit and Follow my
   settings again; the chip says the page is the owner's. Frrata staff on a support visit see the locked pages and
   blocks read-only too, with no Ask the owner. On Invoices and slips, the authorised signatory and the invoice
   series prefix are locked for a partner after handover; the order prefix, the invoice note, the slip size and the
   invoice logo stay the partner's.

## Out of scope
- Brands publishing with Frrata's agent themselves (ADR-0014 decision 4: later, once partner quality is measured).
- Builders (ADR-0015) publishing: unchanged, never.
