# O2b · The plan chosen at "Open your store", billing from the first opening (task plan)
Status: draft
**Mockup:** https://claude.ai/artifact/PzNfST7bdFvLiQsxy11mQT (`docs/mockups/2026-11-23-merchant-onboarding.html` § 2 Setup, "Open your store?"); money states: addendum to be drawn (O2b·0)
**Approved:** owner, 2026-11-23
**Review:** architecture-reviewer findings from the O2 draft fixed, 2026-11-23
**Review:** tenancy-auditor findings from the O2 draft fixed, 2026-11-23 (it stood in for security-reviewer)
**Review:** speed-reviewer covered by architecture-reviewer, 2026-11-23
**Review:** unit-economics-reviewer 6 findings fixed, 2026-11-23
**Review:** re-review pending on this split plan (billing)
Spec: `docs/specs/2026-11-23-merchant-onboarding.md` § O2, § Stress test, owner call 2; `docs/specs/2026-11-08-trials.md`
rules 1, 3, 4, 5 (amended in O2b·12). Built after O2a (`docs/plans/2026-11-23-o2a-setup-card.md`), which ships the card,
the popups and "Open your store?" without the plan. Replaces, with O2a, `docs/plans/2026-11-23-o2-setup.md`.
**Migrations:** 0168 (`app_open_plan_state`, `app_open_plan`) and 0169 (billing from the first opening, never-opened
drafts removed); O1 holds 0166–0167; renumber with `npm run release:check` if a later merge took them.

**Owner decisions, 2026-11-23 (binding here):**
1. **"Split it"**: O2a ships the Home card and popups with no billing change, and the plan step STAYS in sign-up; O2b is
   plan-at-opening and billing-from-opening with a small mockup for its money states and its own review.
2. **Trial fee**: an order shipped during a trial takes the fee rate of the plan in force when the trial ends (closes
   "pick Scale for the trial, then downgrade").
3. **A store that never opens is deleted after 180 days with two notices to the owner** (mirrors trials rule 5): its own
   small task later (§ Out of scope); not built here.

## The finding this plan fixes (confirmed in the SQL and code, 2026-11-23)
- `app_shops_to_bill(p_before)` (`drizzle/0066_trial_partners.sql:84-89`) lists every owned tenant with a plan row
  before `p_before`: no opening condition. The plan row is written at creation (`0065_trial_signup.sql:97`; partner-built
  `0129_partner_passkeys_access.sql:522`, whose trial starts at creation, `:521`). `runDrafts` (`src/lib/billing/run.ts:20-37`)
  drafts this month and next for each; `computeBill` (`src/domains/billing/bill.ts:164-227`) prices each row from
  `max(startsAt, monthStart)` by paid days. So a never-opened store is billed from creation (or its trial cap).
- Removing never-opened stores from that list alone leaves their unissued drafts (next month's is drafted every day);
  `app_issue_frrata_invoices` refuses the whole month while a draft was drafted before the 1st
  (`drizzle/0139_billing_auto_issue.sql:31-32`) and `issueMonthAuto` skips it as `stale` (`src/lib/admin/billing.ts:112`).
- The opening month's days are lost after IST day 3: a row starting mid-month goes on that month's own draft
  (`bill.ts:104-120,170`), which auto issue never issues (only days 1–3, `0139:24-26`), and the next invoice reads that
  unissued draft as billed (`planBilledIn`, `src/lib/billing/draft.ts:50-53`, counts any invoice of the month).
- **Decided here: where the opening month is billed.** A store's plan starts at the START of its opening's IST day
  (`fromOpening`). Month M is drafted for a store only if its plan started on or before M's 1st; a plan row that starts
  after M's 1st is never on M's invoice; the next 1st makes it up by days, where "billed" means ISSUED invoices only.
  Opened 1 Dec: billed for December on the December invoice (issued 1st–3rd). Opened 2 Dec or 10 Dec: nothing in
  December; 1 Jan bills the December days and January. `firstCharge` (the draft's O2·3) is not built: the popup names
  the date the plan stops being free and its monthly price (§ Words), never a first-charge amount.

## Regression net (O2b·1; on the tree O2a left)
```bash
npm test && npm run typecheck
npx vitest run src/domains/billing src/domains/plans src/domains/setup src/lib/billing src/lib/queries
npm run verify:tenancy
INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx vitest run src/lib/billing src/lib/queries/__tests__/billing.int.test.ts src/lib/queries/__tests__/analytics.int.test.ts src/lib/queries/__tests__/true-profit.int.test.ts
npm run e2e -- --only billing,signup,partners,partner-clients,setup,ux,storefront-api,owner-only,security
```
Pinned now, each named for the task that flips it (frata-verify: a known hazard is a test named "(flipped in <task>)",
flipped in the fixing commit):
| What | Where | Pins today's behaviour |
|---|---|---|
| Billed from creation | `src/domains/billing/__tests__/bill.test.ts` `bills from creation (flipped in O2b·4)` | a row from the 10th, no trial: the 10th–30th by days on that month's invoice |
| Opening-month days lost | same file, `opening month read as billed from a draft (flipped in O2b·4)` | prev month's unissued plan line counted as billed → no make-up |
| Trial order at the trial plan's rate | `src/domains/plans/__tests__/entitlements.test.ts` `trial order at the shipping plan's rate (flipped in O2b·3)` | Scale trial, downgrade to Launch on the 1st: an order shipped in the trial pays 0.5% |
| A never-opened trial store pauses | `src/domains/plans/__tests__/trial.test.ts` `never opened, past the cap: paused (flipped in O2b·2)` | `trialState` → `paused`, `pauseWindow` non-null |
| The stale-draft refusal | `src/lib/billing/__tests__/draft.int.test.ts` (new case) | a draft with `drafted_at` before the 1st → the issue refuses the month (`0139:31-32`) |
| Opening's handover refusal | `src/app/(console)/console/__tests__/open-shop.int.test.ts` (new) | a partner-built store before handover → "The store opens once its owner accepts the handover." (`shop-actions.ts:71`) |
| Proof blocks 44 and 50 | `scripts/verify/tenancy.sql` "-- 44." (`:1993-2050`) and "-- 50." (`:2178-2184`) | unchanged; block 50 gains `if (select first_opened_at from tenants where id = '1111…') is null then raise exception 'FAIL: proof shop A is not open'` so 0169 cannot pass by emptying the list |
| e2e plan pick | `63-signup.mjs` (as O1 left it) | the plan step, Growth preselected; flipped in O2b·10 |

## Tasks
Each task: the test first (watch it fail for the right reason), the change, its verify command run and read, `npm test`
and `npm run typecheck`, then **impact-reviewer on the diff**, then its commit. The tree is green after each. **Every
task after O2b·1 waits for the owner's approval of O2b·0 and for the re-review of this plan.** Migrations reach
production by hand (CLAUDE.md § Migrations) in O2b·13's order: both before the one push that uses them; the app works
on production before and after each (0168 adds functions nothing old calls; 0169 narrows a list old code tolerates and
deletes drafts no run will redraft).

### O2b·0 · Mockup addendum (drawn by the orchestrator; owner approval blocks the build)
**What:** a short addendum to mockup § 2 (same artifact), Rule 0 kept, drawn at 1280 and 390:
1. "Open your store?" with a trial: Launch preselected, the line under the radios following the chosen radio ("Your plan
   is free until 23 Dec. Then ₹1,499 a month + GST.").
2. The same with no trial (refused a trial, or a late opener past its cap): "₹1,499 a month + GST from today."
3. A partner-built store with its trial still running at opening: the same first sentence, its own date.
4. Plan not choosable (a price agreed with Frrata, a change Frrata scheduled, a plan set by Frrata staff, billed already):
   the plan as one `Facts` row and its line, no radios.
5. Reopening after a close: no plan, no line.
6. A refusal in the popup's error slot (the plan changed meanwhile).
7. Plan and billing before opening: the plan's name, "Your plan starts when your store opens.", the trial line, no
   estimate, no Change plan; phone.
**Verify:** `node scripts/check-mockup.mjs docs/mockups/2026-11-23-merchant-onboarding.html` clean; owner's approval in
writing, then the spec's § O2 names the addendum.

### O2b·1 · Regression net
**What:** § Regression net. **Verify:** every command green; each pinned case red when its bug is planted.

### O2b·2 · `fromOpening` and the trial's `opened` fact (pure)
**What:**
- `src/domains/billing/bill.ts`: `fromOpening(rows, firstOpenedAt)`: null → `[]`; `d = istDayStart(firstOpenedAt)`
  (`src/domains/time/day.ts:14`); the row in force at the opening MOMENT starts at `d`; rows that ended before that
  moment drop; rows after it stay. Pure, sorted, no row mutated.
- `src/domains/plans/trial.ts`: `TrialFacts` (`:44-52`) gains `opened: boolean` (`tenants.first_opened_at` is set).
  `trialState` (`:89`): not opened → `'building'` (never grace or paused); `pauseWindow` (`:130`): not opened → null;
  `mayExtend` false. `trialEndsAt` and its cap (`:58-64`) unchanged, so a late opener's trial still ends at the cap.
  `extendsAtHandover` (`:121`) unchanged.
**Test first:** `bill.test.ts`: opened 10 Dec 15:00 IST → the row starts 10 Dec 00:00 IST; a sign-up row from 09:00 the
same day opened at 15:00 → starts 00:00; a row replaced before opening drops; a by-shop downgrade after opening stays;
null → `[]`. `trial.test.ts`: the O2b·1 case flipped to "never opened, past the cap: building, no pause"; opened on day
50 of a 15 + 30 cap → trial ended at the cap; partner-built (started at creation, 30 days): opened on day 20 → still in
trial until `trialEndsAt` (about 10 free days); opened on day 40 → none; handed over on day 25 with 5 days left →
`extendsAtHandover` true, the end moves 7 days, opened day 26 → in trial.
**Verify:** `npx vitest run src/domains/billing src/domains/plans`; `node scripts/check-layers.mjs` clean.

### O2b·3 · The trial-fee rule (pure, and its SQL twin)
**What:** `feeForOrder` (`src/domains/plans/entitlements.ts:66-72`): the rate moment is `rateAt`, unless the row in
force at `rateAt` has `trialEndsAt > rateAt`: then `trialEndsAt` (the first paid moment), and the rate is the plan in
force then (owner decision 2). So a downgrade during the trial gives the downgraded rate, and an upgrade waiting for the
trial's end gives the upgraded rate. A fee once billed is final (credits reverse exactly what was billed). History rows
carry `trialEndsAt` (`PlanRow` already does, `bill.ts:24`). SQL twin: `feeBucketSql(a, changes)`
(`src/lib/db/order-predicates.ts:225-235`) takes `{ startsAt, trialEndsAt }[]` instead of `Date[]`, maps a rate moment
inside a row's `[startsAt, trialEndsAt)` to `trialEndsAt` before its CASE; `feeRateAtSql` (`:216`) is unchanged (the
draft prices in TS). Callers that build `feeChanges` (`order-detail.ts:156-160`, `analytics.ts:99,77`,
`true-profit.ts:74,141,178`, `discounts.ts:159,285`) pass the rows from `planHistoryIn` (O2b·5 adds `trialEndsAt`).
**Test first:** `entitlements.test.ts`: the O2b·1 case flipped (Launch's 2%); Scale trial kept → 0.5%; Launch trial with
a waiting upgrade to Scale → 0.5%; shipped after the trial → as today; billable before any plan → null.
`src/lib/queries/__tests__/fee-bucket-trial.int.test.ts`: for each of those, `feeBucketSql`'s bucket gives the same
rate as `feeForOrder` (parity).
**Verify:** `npx vitest run src/domains/plans`; that int test; `INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx
vitest run src/lib/queries/__tests__/analytics-speed.int.test.ts` within its budget. **unit-economics-reviewer** on the diff.

### O2b·4 · The bill: no mid-month row on its own month, made up from ISSUED invoices (pure)
**What:** in `bill.ts`:
- `planInAdvance(plans, monthStart, nextMonthStart, pause)`: M's plan lines, from rows that started on or before
  `monthStart` only (a row starting after M's 1st is never on M's invoice); empty while a trial runs on the 1st (as
  `:170`). `computeBill` (`:164-172`) reads it for its plan lines.
- The make-up (`:175-177`): `billed = i.prevPlanBilled ?? (prevTrial || startedIn(starts, prevMonthStart, monthStart) ?
  0 : null)`, where `startedIn` = the first row started during M−1 (the store opened then). Its line reads "Your plan
  from opening last month, by days" when `startedIn`.
- `planChangeAdds` (`:152-162`) unchanged; its caller passes `billed` as below.
**Test first:** `bill.test.ts` (Launch ₹1,499, no GST in these figures): the O2b·1 cases flipped; **opened 10 Dec, no
trial → December's draft has no plan line; 1 Jan bills 10–31 Dec (₹1,063.81) + January (₹1,499.00) = ₹2,562.81**;
opened 2 Dec → ₹1,450.65 + ₹1,499.00 = ₹2,949.65 on 1 Jan; opened 1 Dec → ₹1,499.00 on 1 Dec and ₹1,499.00 on 1 Jan;
opened 23 Nov with 30 days (free until 23 Dec) → nothing on 1 Dec, 1 Jan bills 24–31 Dec (₹386.84) + January =
₹1,885.84; an upgrade on IST day 2 before the issue → not on that month's invoice, made up on the next 1st (B4's
`plan-change.int.test.ts` updated in the same commit, open question 1).
**Verify:** `npx vitest run src/domains/billing`. **unit-economics-reviewer** on the diff.

### O2b·5 · `planRowsIn`, the one reader of when a plan starts; the draft and its readers
**What:**
- `src/lib/billing/plan-rows.ts` (server-only): `planRowsIn(tx, t)` → `{ billed: PlanRow[] (fromOpening applied),
  chosen: the row in force now as stored (code, name, price, custom, createdBy), openedAt }`: ONE statement
  (`tenant_plans` ⋈ `plan_versions` ⋈ `plans` ⋈ `tenants` on its key), rows oldest first.
- `draft.ts:57-135`: after the existing lock (`:64-67`), `planRowsIn`; when the store's plan did not start on or before
  `monthStart` (never opened, or opened after M's 1st), delete this month's unissued draft rows (`:70-72`) and the
  invoice row, and return `{ invoiceId: null, notOpen: true }`; else `computeBill` with `billed`. The inline plan select
  (`:79-82`) goes. `planBilledIn` (`:50-53`) counts only an ISSUED invoice (`issued_at is not null`), null otherwise.
  `run.ts`: `RunResult` gains `unopened` (counted for `notOpen`, never as `issued`).
- `billingOverview` (`src/lib/queries/billing.ts:94-161`): history from `planRowsIn` (`:101-104` goes); `opensLater:
  openedAt === null`; `plan` from `chosen` before opening; `forChange.billed = planBilled ?? (this IST month ?
  planInAdvance(billed, monthStart, …) : null)` (the dialog's figure on days 1–3 before the issue); the estimate
  (`:119-134`) returns null for `notOpen`.
- `planHistoryIn` (`src/lib/queries/settings.ts:141-144`) returns `billed` rows' `{ startsAt, trialEndsAt, feeBps }`:
  profit per order, true profit, analytics and discounts take no fee before the opening day (as billing).
- `trialFactsIn` (`src/lib/queries/trial-pause.ts:30-44`) reads `tenants.first_opened_at` into `opened`; `shopTrial`
  (`billing.ts:229-245`) and `shopPauseIn` get it through the facts.
- Features are NOT from `fromOpening`: `currentPlan` for entitlements and `planNowIn` (`billing.ts:248`) read rows as
  stored, so a store in setup has its plan's features.
**Test first:** `src/lib/billing/__tests__/bill-from-opening.int.test.ts` (real Postgres) through `runDrafts` and the
issue: a never-opened store → no draft, `unopened` 1; opened 10 Dec: `runDrafts(10 Dec 12:00 IST)` writes no December
invoice and a January draft; `runDrafts(1 Jan 00:30 IST)` + `issueMonthAuto(1 Jan 00:40 IST)` (or `issueWith(…,
{ system: true })` if the int stack has no seller) issue January at ₹2,562.81 taxable; opened 2 Dec → ₹2,949.65;
opened 1 Dec → a December invoice issued by the 2 Dec run; a December draft of a store that opened on 10 Dec is
deleted by the 10 Dec run. `billing.int.test.ts`: a never-opened store's overview has `opensLater`, its chosen plan,
estimate null. `trial-billing.int.test.ts` and `plan-change.int.test.ts` green.
**Verify:** `INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx vitest run src/lib/billing src/lib/queries`; `npm
run e2e -- --only billing`. **unit-economics-reviewer** on the diff (the built engine).

### O2b·6 · Migration 0168: `app_open_plan_state()` and `app_open_plan(code, by)`
**What:** `npm run db:generate -- --custom --name=open_plan` → `drizzle/0168_open_plan.sql`, `set search_path = ''`,
`security definer`:
- `app_open_plan_state() returns text`, `stable`: the reason the plan cannot be chosen at opening, or null. `t :=
  app_current_tenant()`, null → `'no_shop'`; `first_opened_at is not null` → `'opened'`; no row in force → `'no_plan'`;
  the row in force has `custom_monthly_price` → `'custom'`; created by platform staff (`exists (select 1 from
  public.platform_staff s where s.user_id = cur.created_by)`; Admin writes them, `src/lib/admin/merchants.ts:143`,
  `src/lib/admin/plans.ts:74`) → `'staff'`; any row `starts_at > now() and not by_shop` → `'scheduled'`; any issued
  invoice line of kind `plan` → `'billed'`.
- `app_open_plan(p_code text, p_by uuid) returns table (from_code text, to_code text)`, plpgsql: `t` null →
  `insufficient_privilege` "plan: no_shop"; the caller's own `members` row (`tenant_id = t and user_id = p_by and role in
  ('owner','admin')`, never the role a support visit reports) else `insufficient_privilege` "plan: role"; `perform 1 from
  public.tenants where id = t for update` (as `app_change_plan`, `0063:228`); `r := app_open_plan_state()`, non-null →
  `check_violation` "plan: " || r; target = newest version of `p_code`, unknown → `invalid_parameter_value` "plan:
  unknown"; delete `by_shop` rows still to start; update the row in force in place: `plan_version_id = target, by_shop =
  true, reason = 'Chosen at opening', created_by = p_by`, same `starts_at` and `trial_ends_at` (the publish trigger
  recomputes the trial, `0063:95-104`); same code: no update; audit `billing.plan.open`, target `p_code`, detail
  `{from, to}` always.
- Both: `revoke all … from public, anon, authenticated, service_role, frata_admin, frata_builder; grant execute … to
  frata_app;` (the 0157/0158 pattern, `0158_d0_opening_check.sql:30`).
- `scripts/verify/tenancy.sql`, new § after the last (O1's § 102 → § 103), as `frata_app`: no tenant → refused; **B's
  OWNER with A's tenant set** → refused; A's Staff and Accountant → refused; **A's partner member before and after
  handover** → refused; a support session (staff user, no members row) → refused; **`frata_builder`**: no EXECUTE on
  either (assert, `has_function_privilege`); A's owner Launch→Growth: one row changed, same `starts_at` and
  `trial_ends_at`, one audit row; **then the publish (`published_at = now()`): `trial_ends_at` equals the recompute from
  the opening**; **future `by_shop` rows deleted**; same code: no change, audited; after `first_opened_at` set → state
  `'opened'`, refused; custom price → `'custom'`; **a row created by a `platform_staff` user → `'staff'`, refused**; a
  Frrata-scheduled row → `'scheduled'`; an issued plan line → `'billed'`; B's rows untouched; no EXECUTE for anon,
  authenticated, service_role, frata_admin, frata_builder; EXECUTE for frata_app. The last line reads `tenancy proof —
  all checks passed (through § 103)`. `plan-change.int.test.ts` gains "open plan, then `app_change_plan` after the
  opening" (only the latter works).
**Verify:** `npm run verify:tenancy` fails before the migration (function missing), passes after; plant "any member"
in the role check and watch § 103 fail; `npm run release:check` (no collision); `node scripts/prod-migrate.mjs
drizzle/0168_open_plan.sql` prints the SQL and its drizzle row.

### O2b·7 · Migration 0169: billing from the first opening; never-opened drafts removed
**What:** `drizzle/0169_bill_from_opening.sql` (`--custom`):
1. `create or replace function app_shops_to_bill(p_before timestamptz)` as `0066:84-89` joined to `public.tenants t` with
   `t.first_opened_at is not null and t.first_opened_at < p_before`; `revoke all … from public, anon, authenticated,
   service_role, frata_admin, frata_builder; grant execute … to frata_app` (re-run of `0048:113-115`, widened).
2. Between `-- cleanup:begin` and `-- cleanup:end`: delete, for tenants with `first_opened_at is null`, every unissued
   (`issued_at is null`) invoice's `frrata_fee_credits`, `frrata_invoice_fees`, `frrata_invoice_lines`, then the
   `frrata_invoices` rows (every period, next month's included). Issued rows are never touched.
3. Comment blocks `-- read-before:` and `-- read-after:` holding § Production reads R1 (below); `scripts/prod-migrate.mjs`
   prints them (§ Repetitive work).
`tenancy.sql` block 50: an owned never-opened shop with a 40-day-old plan is not listed; A (open) is; after the change
`has_function_privilege` on `app_shops_to_bill(timestamptz)`: frata_app true, anon, authenticated, service_role,
frata_admin, frata_builder false (extend `:1861`'s list with frata_builder).
**Test first:** `bill-from-opening.int.test.ts` gains: a never-opened store with a December draft drafted 20 Nov; the
month refuses to issue (stale, `0139:31-32`); the test runs the file's cleanup block; the draft and its lines, fees and
credits are gone; `issueMonthAuto(1 Dec)` issues the month for the rest.
**Verify:** `npm run verify:tenancy`; that int test; `node scripts/prod-migrate.mjs drizzle/0169_bill_from_opening.sql`
prints the SQL, the reads and the drizzle row.

### O2b·8 · Opening with the plan
**What:** `src/app/(console)/console/shop-actions.ts`:
- `openShop(input?: unknown)`: Zod `z.object({ plan: z.enum(PLAN_CODES).optional() }).strict().optional()` (bad input →
  "We couldn’t open the store. Nothing was changed."). The server decides whether the plan step applies.
- Inside `asMember` (`:39-61`), after the settings lock (`:45-48`) and before any write: when a plan is given and the
  caller is not on a support visit, `select app_open_plan_state() as r`; a reason → return its sentence (§ Words; nothing
  has been written). A support visit's plan is ignored (no plan step), as today it is audited.
- `select * from app_open_plan(${plan}, ${auth.userId})` **right before the publish update (`:58`), after
  `websiteBlocksOpening` (`:57`)** — never after the lock: `asMember` commits on a return, and `:49`, `:50`, `:54`, `:57`
  return early.
- The catch (`:69-74`): a message (as `createShop` reads it, `src/lib/db/platform.ts:169`) starting `plan:` → its
  reason's sentence; the handover's `23514` (the publish trigger, `0066:120`, message `shop:`) keeps its own sentence;
  `pgCode` alone never decides.
- `loadOpening()` (`requireMember(CAN_MANAGE)`, a support visit → `{ step: false }`) → `openingFor(m, now)` in a new
  `src/lib/queries/opening.ts` (not `billing.ts`, so `check:billing-read` holds): one `withTenant`:
  `app_open_plan_state()`, the row in force (code, name), `shop_trials` by key, `tenants.first_opened_at`; plus
  `publicPlans()` (`platform.ts:181`). Returns `{ step: boolean, choosable: boolean, current, plans: [{ code, name,
  monthlyPrice, feeBps }], freeUntil: Date | null }`: `freeUntil = lastDay(trialEndsAt({ ...facts, startedAt:
  facts.startedAt ?? now, opened: true }))` when that is after today's IST start, else null. No cost, no invoice.
**Test first:** `open-shop.int.test.ts`: owner opens on Growth → the row is Growth, same `starts_at`, `published_at` set,
trial started; Manager may; a support visit opens a no-trial store, plan unchanged; a second opening after a close sends
no plan and works; `app_open_plan` refused (a Frrata change scheduled between the read and the call) → nothing
published, the reason's sentence; the handover refusal keeps its sentence; `{ plan: 'gold' }` refused before any read.
**Verify:** that test green; `npm run verify:tenancy`; `npm test` (check:actions, check:billing-read);
`npm run e2e -- --only setup,ux,storefront-api` (O2a's popup still sends no plan).

### O2b·9 · The plan in "Open your store?", and Plan and billing before opening (BUILT AS DRAWN, with the addendum)
**What:**
- O2a's `open-store.tsx`: on open it calls `loadOpening()`; `choosable` → the plan radio cards (Launch preselected; the
  native radio painted as the mockup's `.radio`, the card's edge `--action` when checked) and the line under them for
  the checked radio (§ Words); not choosable → one `Facts` row and its line; reopening (`step` false or opened before) →
  O2a's popup unchanged. "Open store" sends `{ plan }` only when `choosable`.
- `settings/billing/page.tsx`: `opensLater` → the plan's name, "Your plan starts when your store opens.", the trial
  line, no estimate, Change plan hidden; the `changePlan` action refuses before opening ("Choose your plan when you open
  your store.").
- `e2e/lib.mjs`: `openStore(page, { plan })`. `99-setup.mjs`: owner opens on Growth (DB: Growth, same `starts_at`); a
  support visit sees no radios; a store with a custom price sees the `Facts` row; the line changes with the radio;
  Plan and billing before and after opening; axe; 390 and 1280.
**Test first:** those steps, red.
**Verify:** `npm run e2e -- --only setup,billing,ux,storefront-api`; `mockup-parity-reviewer` (§ 2 and the addendum),
`words-reviewer`, `design-system-reviewer`; § Performance's build line.

### O2b·10 · The plan step leaves sign-up (the same push as O2b·9)
**What:** re-read O1's `src/app/start/*`, `src/domains/signup/steps.ts` first. `signupSteps` drops `plan` (O1·1's order
becomes `name, email, phone, sells`); the plan step's component and its words go from `signup-flow.tsx`; `page.tsx`
stops reading `publicPlans` and `signupTrialDays` if nothing else there does; `createMyShop` drops `plan` from Zod
(`src/app/start/actions.ts`, O1's `Shop`) and `SENTENCES`' `bad_plan`; `createShop` (`src/lib/db/platform.ts:157`) sends
`'launch'` to `app_create_shop_v3` (O1 keeps `p_plan`). Partner-built stores are on Launch already (`0129:506`).
`63-signup.mjs`: no "Choose your plan", dots one fewer, the plan row `launch`.
**Test first:** that `63-signup` change, red. **Verify:** `npm run e2e -- --only signup,partners`; `/start`'s first-load
JS ≤ O1's pin (§ Performance).

### O2b·11 · Admin reads the same start
**What:** Admin reads plan rows as `frata_admin` and applies the same pure `fromOpening` with `tenants.first_opened_at`:
the merchants list (`src/lib/admin/merchants.ts:86`): a never-opened store's plan reads "Launch · Not open yet";
`storesPerVersion` (`src/lib/admin/plans.ts:85-95`) counts opened stores per version and never-opened ones apart ("Not
open yet · 3"). `src/lib/admin/trials.ts:64-67` (`trialView`) gets `opened` in its facts.
**Test first:** `src/lib/admin/__tests__/admin.int.test.ts` (new case): a never-opened store is not counted on its
version and reads "Not open yet". **Verify:** that test; `npm run e2e -- --only neel-admin`.

### O2b·12 · Rules, docs, the trials amendment
**What:** `docs/specs/2026-11-08-trials.md`: under rule 3: "Superseded 2026-11-23 (owner, call 2 of
`docs/specs/2026-11-23-merchant-onboarding.md`): the plan is chosen at Open your store, Launch preselected, the trial on
that plan; a store is not billed before it first opens. Built in `docs/plans/2026-11-23-o2b-plan-at-opening.md`."; rule
1's cap sentence gains "(billing waits for the first opening since O2b; the cap still ends a late opener's trial)"; rule
4 gains owner decision 2's sentence. § Practices recorded in skills with their bumps; the spec's § O2 names the
addendum and both plans. **Verify:** `npm test` (check:skills, check:docs, check:plans).

### O2b·13 · Production, in order (the orchestrator runs reads and applies; aggregate counts only)
1. O1's 0167 has its `__drizzle_migrations` row (O1 § Deploy order).
2. Reads R1–R4 (below), answered: R1 `issued` > 0 and R2 `billed` > 0 go to the owner before the release (open
   questions 2, 3).
3. **Not on IST days 1–3** unless that month's auto issue has run (Admin › Billing, an audit row `billing.issue`): apply
   0168, then its row; apply 0169, then its row (`node scripts/prod-migrate.mjs …`, through the Supabase API).
4. R1 again: `drafts` 0, `next_month_drafts` 0; `select count(*) from app_shops_to_bill(now() + interval '40 days')`
   equals the count of opened owned stores.
5. Push O2b·2–O2b·12 together; wait until the deployment is Ready.
6. Within the hour and the next day: R1 still 0; `get_runtime_errors` for Home, Plan and billing, `/start`, the cron.
7. On the next 1st–3rd: the month issued (audit `billing.issue`), never skipped `stale`.
8. `unit-economics-reviewer` on the built engine and the first real invoice after an opening.

**Production reads (read only):**
- **R1** never-opened stores' invoices: `select count(*) filter (where i.issued_at is not null) issued, count(*) filter
  (where i.issued_at is null) drafts, count(*) filter (where i.issued_at is null and i.period_start > now()) next_month_drafts
  from frrata_invoices i join tenants t on t.id = i.tenant_id where t.first_opened_at is null`.
- **R2** orders billable before their store's opening day: `select count(*) orders, count(f.order_id) billed from orders o
  join tenants t on t.id = o.tenant_id left join frrata_invoice_fees f on f.order_id = o.id where o.rto_initiated_at is
  null and o.shipped_at is not null and (case when o.delivered_at is not null then least(o.delivered_at, o.shipped_at +
  interval '30 days') when o.lost_at is null then o.shipped_at + interval '30 days' end) < coalesce(date_trunc('day',
  t.first_opened_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata', 'infinity')`.
- **R3** stores opened on or after this IST month's 1st holding this month's unissued draft (the new draft removes it).
- **R4** never-opened stores whose plan in force was set by Frrata staff (they see the `Facts` row).

## Performance
- **Home and the popup:** Home unchanged (O2a). `loadOpening`, on the popup's open only: one `withTenant` with
  `app_open_plan_state()` (index lookups on `tenants`, `tenant_plans` by `tenant_id` ≤ 4 rows, `platform_staff` by key,
  `frrata_invoice_lines` exists by `tenant_id`), `tenant_plans`, `shop_trials` by key; `publicPlans()` (3 rows). EXPLAIN
  each in the 10× seed: index scans, under 10 ms.
- **`planRowsIn`** is one statement where each caller had one: Plan and billing, analytics, true profit, discounts and
  order detail run the same number of statements. `feeBucketSql` gains at most 4 arms; `analytics-speed.int.test.ts`
  stays within budget.
- **The billing run:** per shop per month, the plan read moves before the `Promise.all` (`draft.ts:78`): one more round
  trip; never-opened stores leave the list, so fewer drafts. 10×: 500 stores × 2 months × 1 run a day, unchanged batch
  (`run.ts:27`, 4 at a time).
- **First-load JS:** Home's pin from O2a holds (the radios are in the `next/dynamic` popup); `/start` drops the plan step,
  ≤ O1's pin. `npm run build && SHOW_BUDGETS=1 node scripts/check-storefront-build.mjs | grep -E "/\(console\)/console/page:|/start/page:"`.

## States
| State | Drawn | Primitive |
|---|---|---|
| Choose a plan, with a trial | yes (§ 2) + addendum line | `Dialog`, radio cards, the line |
| Choose a plan, no trial | addendum | the same, its line |
| Partner-built, trial still running | addendum | the same, its own date |
| Plan not choosable (custom, staff, scheduled, billed) | addendum | `Facts` row + line |
| Reopening after a close | addendum | O2a's popup |
| A support visit | spec | O2a's popup, no plan |
| A refusal (a race) | addendum | `Dialog` error slot |
| Plan and billing before opening | addendum | the page's plan card, no estimate, no Change plan |
| Trial banner before opening | (today's `building` words) | `trial-ending.tsx` |
| Admin: not open yet | no | text in the merchants list and the plans count |
| Phone | addendum | `Dialog` sheet |

## Words (final; console, `check:words`)
- Radio cards: "Launch" · "₹1,499 a month + GST · 2% per delivered order" (each from `publicPlans`, the fee by
  `formatPercent`); "Growth" · "₹4,999 a month + GST · 1% per delivered order"; "Scale" · "₹14,999 a month + GST · 0.5%
  per delivered order".
- The line, for the checked plan: trial → "Your plan is free until 23 Dec. Then ₹1,499 a month + GST." (the plan is
  free; the per-order fee is charged, so never "everything is free"); no trial → "₹1,499 a month + GST from today.";
  partner-built with a running trial → the trial sentence with its own date.
- Not choosable: "Plan" · "Growth" (`Facts`) and its line.
- Refusals (`openShop`): role → "Only the owner or a Manager can choose the plan." · custom, staff, scheduled → "Your
  plan is set with Frrata. Message Frrata to change it." · opened → "Your store opened before. Change your plan in Plan
  and billing." · billed → "Your plan is billed already. Change it in Plan and billing." · no plan → "Your store has no
  plan yet. Message Frrata." · unknown → "We couldn’t open the store. Nothing was changed."
- Plan and billing before opening: "Your plan starts when your store opens." · "Your 30 days start when you open your
  store." · `changePlan` before opening: "Choose your plan when you open your store."
- Invoice line: "Your plan from opening last month, by days".
- Admin: "Not open yet".
- Removed from sign-up: "Choose your plan", "{n} days free from going live", "{price}/mo + GST · {fee} per delivered
  order", "Continue" (on that step), "Choose a plan."

## Practices recorded in skills (landed in O2b·12; bumps from the versions O2a leaves)
| Practice | Skill file § | Bump |
|---|---|---|
| A store's plan starts at the start of its first opening's IST day (`fromOpening`); `planRowsIn` is the one reader for money (billing, fees, profit, Admin); features read rows as stored | `frata-architecture/reference/money-and-gst.md` § Trials | architecture minor |
| Month M bills only plan rows started by its 1st; the next 1st makes up by days from ISSUED invoices; an unissued draft is never "billed" | same, § Billing | same |
| A definer's refusals come back as a reason: a `_state()` function both the read and the write use, and a `plan:` message prefix the action maps | `frata-architecture` SKILL.md § Definers and platform reads | same |
| An order shipped during a trial takes the rate of the plan in force when the trial ends (decision 2); never-opened stores pay nothing; deletion after 180 days is pending (decision 3) | `frata-unit-economics` SKILL.md (fee rules) | unit-economics minor |
| A known hazard is pinned as a test named "(flipped in <task>)" and flipped in the fixing commit; a billing migration runs its read-before and read-after, never on IST days 1–3 before the month's issue | `frata-verify` SKILL.md | verify minor |

## Repetitive work → agents and scripts
| Chore | Done by hand | Becomes |
|---|---|---|
| Production reads before and after a billing migration | the O2 draft, here | `-- read-before:` / `-- read-after:` blocks in the migration, printed by `scripts/prod-migrate.mjs` (O2b·7) |
| Proving a definer's refusals per role in `tenancy.sql` | 0058, 0063, here | the `proof.*` helpers O1·11 adds take a role list; § 103 uses them |
| A fee rule's TS and SQL twins | O2b·3 | `fee-bucket-trial.int.test.ts` parity, beside the trial parity test |

## Deviations
| Mockup element | What is built | Reason | Owner seen |
|---|---|---|---|
| 1 "Free for 30 days. First charge ₹1,499 + GST on 23 Dec." | "Your plan is free until 23 Dec. Then ₹1,499 a month + GST." | the drawn line was false: the per-order fee is charged during a trial, and the plan is billed on the next 1st, not the trial's last day (`bill.ts:166-177`); redrawn in the addendum | at O2b·0 |

## Out of scope (and the signal that brings each back)
- **Deleting a store that never opens after 180 days, with two notices to the owner** (owner decision 3; mirrors trials
  rule 5): its own small task. Signal: R1's never-opened count has a store older than 150 days.
- Credit notes for invoices already issued to never-opened stores: the owner's call on R1 (open question 2).
- Billing orders that became billable before the opening day: the owner's call on R2 (open question 3).
- A first-charge amount in the popup: not built (the line names the date and the monthly price).

## Open questions for the orchestrator
1. O2b·4 also moves an upgrade made on IST days 1–3, before that month's issue, off that month's invoice (made up on the
   next 1st by days). Accept this change to B4?
2. R1: if never-opened stores hold issued invoices, credit notes or not? (owner, before 0169)
3. R2: orders billable before the opening day are no longer billed and carry no fee in profit. Accept?
4. `app_change_plan` before opening: only the action refuses here; should 0168 also redefine `app_change_plan` to refuse
   (a third copy of that definer)?
5. Partner-built stores spend their trial while being built (it started at creation, `0129:521`); opened on day 40 they
   are billed from opening with no free days. Confirm with the owner.
