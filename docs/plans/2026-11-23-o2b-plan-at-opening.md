# O2b · The plan chosen at "Open your store", billing from the first opening (task plan)
Status: active (built after the release of O1, C1a and O2a; first task: merge main and take the next free migration numbers)
**Mockup:** https://claude.ai/artifact/PzNfST7bdFvLiQsxy11mQT (`docs/mockups/2026-11-23-merchant-onboarding.html` § 2 Setup, "Open your store?"); money states: addendum https://claude.ai/artifact/Wcm33KEmZJeCDUZSRrtNzq (`docs/mockups/2026-11-23-o2b-opening-money.html`)
**Approved:** owner, 2026-11-23 (the roadmap mockup); the addendum and its three calls, owner 2026-11-23: "approved go with your recommendations"
**Review:** architecture-reviewer findings from the O2 draft fixed, 2026-11-23
**Review:** tenancy-auditor findings from the O2 draft fixed, 2026-11-23 (it stood in for security-reviewer)
**Review:** speed-reviewer covered by architecture-reviewer, 2026-11-23
**Review:** unit-economics-reviewer 6 findings fixed, 2026-11-23
**Review:** architecture-reviewer re-review: 3 blockers, 7 major, 4 minor fixed, 2026-11-23
**Review:** tenancy-auditor re-audit: 2 high, 3 medium, 6 low fixed, 2026-11-24
Spec: `docs/specs/2026-11-23-merchant-onboarding.md` § O2, § Stress test, owner call 2; `docs/specs/2026-11-08-trials.md` rules
1, 3, 4, 5 (amended in O2b·13). Built after O2a (`docs/plans/2026-11-23-o2a-setup-card.md`); replaces, with it, `2026-11-23-o2-setup.md`.
**Migrations (named, numbered at build):** `<partner-trial>` (a partner-built store's trial at its first opening),
`<open-plan>` (`app_open_plan_state`, `app_open_plan`, `app_change_plan` refusing before opening), `<billing-from-opening>`.
Each takes the next free number after main is merged and O1's two are renumbered (O2b·0b; § Migration numbers).

**Owner decisions, 2026-11-23 (binding here):**
1. **"Split it"**: O2a ships the Home card and popups with no billing change, and the plan step STAYS in sign-up; O2b is
   plan-at-opening and billing-from-opening with a small mockup for its money states and its own review.
2. **Trial fee**: an order shipped during a trial takes the fee rate of the plan in force when the trial ends (closes
   "pick Scale for the trial, then downgrade"). Frozen once billed: O2b·4.
3. **A store that never opens is deleted after 180 days with two notices to the owner** (mirrors trials rule 5): its own
   small task later (§ Out of scope); not built here.
4. **A partner-built store's trial starts at its first opening**, as for a store its owner makes (addendum call 1). It no
   longer runs while the partner builds. Built in O2b·2 (pure) and O2b·3 (migration `<partner-trial>`); the addendum's "Partner-built"
   state reads exactly like "With a trial" (merged in § States and § Words).
5. **A plan that starts after the 1st is billed on the next 1st, by days**; an upgrade made on IST days 1–3 moves with it
   (addendum call 2). Built in O2b·5.
6. **Orders from before a store's opening day carry no Frrata fee** (addendum call 3). Built in O2b·6 (`planRowsIn`).
Production, 2026-11-23: no invoice or draft exists for a never-opened store (R1 = 0, 0); no credit note is needed.
O2b·0 is done. The tenancy-auditor re-audit (2026-11-24: FIX THE PLAN FIRST, 2 high, 3 medium, 6 low, no reachable leak)
is folded in below, each finding marked **(audit H1…L11)** where it lands; O2b·0b is the first task to build.

## The finding this plan fixes (confirmed in the SQL and code, 2026-11-23)
- `app_shops_to_bill(p_before)` (`drizzle/0066_trial_partners.sql:84-89`) lists every owned tenant with a plan row
  before `p_before`: no opening condition. The plan row is written at creation (owner store `0166_signup_without_pickup.sql:51`;
  partner-built `0166:102`, whose trial starts at creation, `0166:101`, O1's redefinition of `0129:521`). `runDrafts`
  (`src/lib/billing/run.ts:20-37`) drafts this month and next for each; `computeBill` (`src/domains/billing/bill.ts:164-228`)
  prices each row from `max(startsAt, monthStart)` by paid days. So a never-opened store is billed from creation (or its cap).
- Removing never-opened stores from that list alone leaves their unissued drafts (next month's is drafted every day);
  `app_issue_frrata_invoices` refuses the whole month while a draft was drafted before the 1st
  (`drizzle/0139_billing_auto_issue.sql:31-32`) and `issueMonthAuto` skips it as `stale` (`src/lib/admin/billing.ts:112`).
- The opening month's days are lost after IST day 3: a row starting mid-month goes on that month's own draft
  (`bill.ts:104-120,170`), which auto issue never issues (only days 1–3, `0139:24-26`), and the next invoice reads that
  unissued draft as billed (`planBilledIn`, `src/lib/billing/draft.ts:50-54`, counts any invoice of the month).
- A partner-built store's trial runs from creation (`0166:101`), its cap counts from `signed_up_at` = creation
  (`app_trial_ends_at`, `drizzle/0063_trials_access.sql:56`; `trialEndsAt`, `src/domains/plans/trial.ts:58-64`), and the
  handover gives the one extension when under 7 days are left (`drizzle/0124_partner_teams_access.sql:253-254`, twin
  `extendsAtHandover`, `trial.ts:121-123`). A partner who builds for more than 45 days leaves the owner no trial.
- **Decided here: where the opening month is billed.** A store's plan starts at the START of its opening's IST day
  (`fromOpening`). Month M is drafted for a store only if its plan started on or before M's 1st; a plan row that starts
  after M's 1st is never on M's invoice; the next 1st makes it up by days, where "billed" means ISSUED invoices only.
  Opened 1 Dec: billed for December on the December invoice (issued 1st–3rd). Opened 2 Dec or 10 Dec: nothing in
  December; 1 Jan bills the December days and January. `firstCharge` (the draft's O2·3) is not built: the popup names
  the date the plan stops being free and its monthly price (§ Words), never a first-charge amount.
- **Decided here: when a trial starts and what it counts from.** Every trial starts at the store's first opening
  (`shop_trials.started_at`, set by the first publish, `0063:94-104`, the same update that sets `tenants.first_opened_at`,
  `drizzle/0068_addresses_access.sql:79-88`). The cap is `signed_up_at + open_window_days + days`, and `signed_up_at` is
  **the moment the store got its owner**: sign-up for a store its owner makes, the handover for a partner-built one (the
  first owner's `members` row writes it through a trigger, O2b·3, so the handover and the sign-in claim of an owner
  invite to a store whose partner link was removed, `app_claim_invites`, anchor it alike). A store that opens after its cap opens with no trial and its 7-day grace starts at the
  opening, never before it (O2b·2).

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
| A never-opened trial store pauses | `src/domains/plans/__tests__/trial.test.ts` `never opened, past the cap: paused (flipped in O2b·2)` | `trialState` → `paused`, `pauseWindow` non-null |
| A late opener pauses days after opening | same file, `opened past the cap: paused 3 days after opening (flipped in O2b·2)` | signed up day 0, 15 + 30 cap, opened day 50: `trialState(day 53)` → `paused` |
| The handover's automatic extension | same file, the case at `:82-85` renamed `handover with under 7 days left extends automatically (flipped in O2b·2)` | `extendsAtHandover` true with 5 days left |
| Partner trial starts at creation | `scripts/verify/tenancy.sql` block 50 (`:2193-2195`), comment renamed `partner trial starts at creation (flipped in O2b·3)`; plus a new assert in the same block: a partner shop handed over with 5 days left gets `extended_at` (`0124:254`) `(flipped in O2b·3)` | `started_at` set before going live; the extension written |
| Trial order at the trial plan's rate | `src/domains/plans/__tests__/entitlements.test.ts` `trial order at the shipping plan's rate (flipped in O2b·4)` | Scale trial, downgrade to Launch on the 1st: an order shipped in the trial pays 0.5% |
| Billed from creation | `src/domains/billing/__tests__/bill.test.ts` `bills from creation (flipped in O2b·5)` | a row from the 10th, no trial: the 10th–30th by days on that month's invoice |
| Opening-month days lost | `src/lib/billing/__tests__/draft.int.test.ts` `opening month read as billed from a draft (flipped in O2b·6)` | `planBilledIn` (`draft.ts:50-54`) returns the plan lines of last month's UNISSUED draft → no make-up (not a `bill.test.ts` case: `computeBill` takes the number, `bill.ts:69`) |
| A never-opened shop is listed for billing | `scripts/verify/tenancy.sql` block 50, `app_shops_to_bill lists a never-opened shop (flipped in O2b·8)` | an owned shop with `first_opened_at` null and a 40-day-old plan is in `app_shops_to_bill(now())` |
| The stale-draft refusal | `draft.int.test.ts` (new case) | a draft with `drafted_at` before the 1st → the issue refuses the month (`0139:31-32`) |
| Opening's handover refusal | `src/app/(console)/console/__tests__/open-shop.int.test.ts` (new) | a partner-built store before handover → "The store opens once its owner accepts the handover." (`shop-actions.ts:71`) |
| Proof blocks 44 and 50 | `scripts/verify/tenancy.sql` "-- 44." (`:1994-2052`) and "-- 50." (`:2179-2198`), checked on this branch 2026-11-24 and unchanged by the merge of main in progress in the working tree (O1's section, § 102 at `:4462` on the branch, renumbered there) **(audit L11)** | as above; block 50 gains `if (select first_opened_at from tenants where id = '1111…') is null then raise exception 'FAIL: proof shop A is not open'` so `<billing-from-opening>` cannot pass by emptying the list |
| A claimed owner leaves the cap at creation | block 50, new: a partner shop whose link is removed, its owner invite claimed by `app_claim_invites` (`drizzle/0023_partners_access.sql:203-220`; main's `0174_people_access.sql:180`) → `signed_up_at` still the creation `(flipped in O2b·3)` | the claim path writes no anchor **(audit L6)** |
| `app_change_plan` before opening | § 44, new: on a never-opened store `app_change_plan('growth', owner)` succeeds `(flipped in O2b·7)` | only the action refuses today **(audit H1)** |
| e2e plan pick | `63-signup.mjs` (as O1 left it) | the plan step, Growth preselected; flipped in O2b·11 |

## Tasks
Each task: the test first (watch it fail for the right reason), the change, its verify command run and read, `npm test`
and `npm run typecheck`, then **impact-reviewer on the diff**, then its commit. The tree is green after each: a task
that changes a signature changes every caller in the same commit. Migrations reach production by hand (CLAUDE.md
§ Migrations) in O2b·14's order, right before the one push that uses them; the app works on production before and after
each. `<partner-trial>` nulls a never-opened partner store's `started_at`: old code reads that as `building` only inside
the open window (`src/domains/plans/trial.ts:96`); past it, old code reads the cap (`trialEndsAt`, `:58-64`) as the trial's
end, so between the migration and the push such a store can show a trial, grace or paused banner in the console while it
is closed (no shopper reaches a closed store, so nothing a shopper sees changes); the push ends it **(audit L10)**.
`<open-plan>` adds functions nothing old calls and makes `app_change_plan` refuse before opening (old code's `changePlan`
maps any `plan: …` message to its sentence, `src/app/(console)/console/settings/billing/actions.ts:209-212`, so a
never-opened store reads "Choose your plan when you open your store." until the push). `<billing-from-opening>`
narrows a list old code tolerates and deletes drafts the new rule never writes.

### O2b·0 · Mockup addendum (done; owner-approved 2026-11-23)
**What:** `docs/mockups/2026-11-23-o2b-opening-money.html`, drawn at 1280 and 390: "Open your store?" in six states
(With a trial, No trial, Partner-built (reads exactly like With a trial), Plan set with Frrata, Reopening, Refused) and
Plan and billing before opening (the "Opening soon" chip, the plan as a `Facts` row with its price-and-fee line, "Your
plan starts when your store opens.", the trial line; no estimate, no invoices, no Change plan).
**Verify:** `node scripts/check-mockup.mjs docs/mockups/2026-11-23-o2b-opening-money.html` clean; the owner's approval
in writing (above); the spec's § O2 names the addendum (O2b·13).

### O2b·0b · Merge main and take the next free migration numbers (first task to build) **(audit H2)**
**What:** once O1, C1a and O2a are released: `git fetch origin main`, merge main into the branch (`scripts/merge-main.mjs`),
and confirm O1's two migrations are on main under their renumbered names (they collide on this branch today with main's
`0166_studio.sql`, `0167_studio_access.sql`; fixed at O1's release, not here). Then `git ls-tree --name-only origin/main
drizzle/ | tail -15` gives the next free number: this plan's three are generated in O2b·3, O2b·7 and O2b·8 as the next
free numbers, in that order, and the names `<partner-trial>`, `<open-plan>`, `<billing-from-opening>` in this plan read
as those files. Re-run the main check of § Migration numbers on the merged tree (no later migration redefines a
function this plan redefines). No schema split is needed first: no task here adds to `src/lib/db/schema.ts` or
`src/lib/db/platform.ts` (§ Open questions 3).
**Verify:** `npm run release:check` (no collision); `node scripts/merge-main.mjs --journal` clean; `npm test`; the
re-check's `grep` (§ Migration numbers) prints nothing.

### O2b·1 · Regression net
**What:** § Regression net. **Verify:** every command green; each pinned case red when its bug is planted.

### O2b·2 · `fromOpening`, and the trial before and at opening (pure, with every caller)
**What:**
- `src/domains/billing/bill.ts`: `fromOpening(rows, firstOpenedAt)`: null → `[]`; `d = istDayStart(firstOpenedAt)`
  (`src/domains/time/day.ts:14`); the row in force at the opening MOMENT starts at `d`; rows that ended before that
  moment drop; rows after it stay. Pure, sorted, no row mutated.
- `src/domains/plans/trial.ts`, with decision 4 one fact: **opened is `startedAt !== null`** (no new field; `TrialFacts`
  at `:44-52` is unchanged, so no caller changes type). The first publish sets `shop_trials.started_at` and
  `tenants.first_opened_at` in the same update (`0063:94-104`, `0068:79-88`); once O2b·3 resets the never-opened
  partner stores, no store has one without the other. Storing `opened` beside `startedAt` would be a second copy.
  - `trialState` (`:89-98`): `startedAt` null → `'building'`, always (today only inside the window, `:96`); never
    trial, grace or paused before opening.
  - `paidFromAt(f) = max(trialEndsAt(f), startedAt)` (null `startedAt` → `trialEndsAt(f)`): the moment the plan is first
    paid. `graceStartsAt` (`:76-78`), `pausesAt` (`:81-83`), `trialState` and `pauseWindow` (`:130-139`) count the
    grace from it instead of `trialEndsAt`, so a store that opens after its cap gets its 7 days from the opening.
    `pauseWindow`: `startedAt` null → null. `mayExtend` (`:111-118`) is false while building (it already follows
    `trialState`). `trialEndsAt` and its cap (`:58-64`) are unchanged: the cap anchor moves in the data (O2b·3).
  - `trialDaysIfOpened(now, f)`: the whole trial days a store gets if it opens now: `f.days` less the days the cap cuts
    off (`round((endOfIstDayAfter(now, f.days) − trialEndsAt({ ...f, startedAt: now })) / DAY)`), 0 when `endedAt` is
    set or the cap has passed. The popup's `freeUntil` and Plan and billing's trial line both read it (§ Words).
  - `extendsAtHandover` (`:120-123`) is deleted: with the trial starting at opening after the handover, its end at the
    handover is the cap, `handover + window + days` ≥ 7 days away (days ≥ 7, `SIGNUP_DAYS`/`SHOP_DAYS`), so the rule
    can never fire; its SQL twin goes in O2b·3.
  - Callers in this commit: `src/lib/queries/billing.ts:243` (`shopTrial`'s `pausesAt(endsAt, money)` →
    `pausesAt(paidFromAt(t), money)`); `src/lib/queries/trial-pause.ts:17-23,30-44` and `src/lib/admin/trials.ts:64-67`
    keep their reads (the facts are unchanged) and gain tests that a never-opened store reads `building` and no pause.
- **No SQL twin of the pause exists**: checkout, the storefront and delivery read it through `shopPauseIn` in TS
  (`src/lib/queries/checkout.ts:76`, `store-shop.ts:43`, `delivery.ts:66`). The building check's SQL twin in
  `app_trial_extend` (`0063:123-124`) follows in O2b·3.
**Test first:** `bill.test.ts`: opened 10 Dec 15:00 IST → the row starts 10 Dec 00:00 IST; a sign-up row from 09:00 the
same day opened at 15:00 → starts 00:00; a row replaced before opening drops; a by-shop downgrade after opening stays;
null → `[]`. `trial.test.ts`: the O2b·1 cases flipped: "never opened, past the cap: building, no pause"; "opened past the
cap (day 50 of a 15 + 30 cap): the trial ended at the cap, grace from the opening, paused on day 57, not day 53";
the handover case deleted with its function. New: **a partner-built store** (`signedUpAt` = its handover on day 60 after
creation, `startedAt` = opening): opened 1 day after the handover → a full 30 days from the opening; opened 50 days
after the handover → no trial (`trialDaysIfOpened` 0), grace from the opening; never opened → building on day 200.
`trialDaysIfOpened`: day 10 of a 15 + 30 cap → 30; day 20 → 25; day 46 → 0; `endedAt` set → 0.
`src/lib/queries/__tests__/billing.int.test.ts`: `shopTrial` of a never-opened store past its window → `building`.
**Verify:** `npx vitest run src/domains/billing src/domains/plans`; `node scripts/check-layers.mjs` clean;
`INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx vitest run src/lib/queries/__tests__/billing.int.test.ts`.

### O2b·3 · Migration `<partner-trial>`: a partner-built store's trial starts at its first opening (owner decision 4)
**What:** `npm run db:generate -- --custom --name=partner_trial_at_opening` → `drizzle/<next free>_partner_trial_at_opening.sql`
(the number from O2b·0b; 0178 is only an example, if O1's two take 0176–0177), `set search_path = ''`:
1. `create or replace function app_partner_create_shop_v2(…)`: `0166:67-109` as O1 leaves it (copied again from O1's
   renumbered file on main), with `shop_trials` inserted WITHOUT `started_at` (`0166:101` → `(tenant_id, days,
   open_window_days, signed_up_at)`, as the owner store's `0166:46`); the first publish starts the clock (`0063:94-104`).
   Grants re-run in full, never "same grants" **(audit M3)**: `revoke all … from public, anon, authenticated,
   service_role, frata_admin, frata_builder; grant execute … to frata_app` (`0166:111-114` already lists `frata_builder`;
   the list is re-run anyway so each redefinition stands alone).
2. `create or replace function app_accept_handover_v2(…)`: `0124:227-261` with one change: `0124:253-254` (`e := …; if
   s.extended_at is null and e - now() < interval '7 days' then … extended_at = now()`) are removed: the handover never
   extends. It writes no anchor itself: its owner insert (`0124:245`) fires the trigger of step 4 before the trial is read
   (`:246`), and `app_trial_recompute` (`:256`) stays. Grants re-run in full **(audit M3)**: `0066:91` (the last revoke on
   this function; 0124 re-ran none) never lists `frata_builder`; `revoke all … from public, anon, authenticated,
   service_role, frata_admin, frata_builder; grant execute … to frata_app`.
3. `create or replace function app_trial_extend(p_by uuid)`: `0063:108-138` with the building check (`:123-124`) as
   `s.started_at is null` (refused: "trial: more days can be taken once the website is live"), the twin of
   `mayExtend` after O2b·2. Grants re-run in full **(audit M3)**: `0063:293-297` revokes from `frata_app` and
   `frata_admin` but never `frata_builder`, then `:301` grants `frata_app`; here `revoke all … from public, anon,
   authenticated, service_role, frata_admin, frata_builder; grant execute … to frata_app`.
4. **The cap anchor, on every path that gives a store its owner (audit L6).** `app_owner_anchors_cap()`, a `security
   definer` trigger function, `after insert on public.members for each row when (new.role = 'owner')`: `update
   public.shop_trials set signed_up_at = now() where tenant_id = new.tenant_id and started_at is null and not exists
   (select 1 from public.members m where m.tenant_id = new.tenant_id and m.role = 'owner' and m.user_id <> new.user_id)`;
   if a row changed, `perform public.app_trial_recompute(new.tenant_id)`. It covers the handover (`0124:245`) and the
   sign-in claim of an owner invite, which inserts an owner with no handover once the store's partner link is removed
   (`drizzle/0023_partners_access.sql:203-220`, skip at `:212`; main's redefinition `0174_people_access.sql:180-211`,
   skip at `:191-192`, insert at `:200`), without a third copy of `app_claim_invites`. An owner's own sign-up inserts its
   `members` row (`0166:42`) before its `shop_trials` row (`0166:46`), so the trigger finds nothing and the anchor stays
   the sign-up; a second owner row never moves it; an opened store's never moves. `revoke all on function
   app_owner_anchors_cap() from public, anon, authenticated, service_role, frata_app, frata_admin, frata_builder`.
   Rejected: copying main's `app_claim_invites` with a `signed_up_at` write (a definer main changed a week ago, and
   any later path would need the same line).
5. **The reset (audit M4),** between `-- reset:begin` and `-- reset:end`, in a `do` block: the stores reset are those with
   `shop_trials.started_at is not null`, `tenants.first_opened_at is null`, **a live `partner_links` row** (`removed_at
   is null`), **`shop_settings.published_at` null** and **no `audit_events` row with `action = 'shop.open'`** (the
   opening's audit, `src/app/(console)/console/shop-actions.ts:59`). So the reset never rests on `0068`'s
   `first_opened_at` backfill (`drizzle/0068_addresses_access.sql:16-21`) being complete. For each: `started_at = null`,
   and `signed_up_at = ` the owner's `members.created_at` (`role = 'owner'`) when the store has an owner, else
   unchanged (the trigger of step 4 writes it at the handover); then `perform public.app_trial_recompute(tenant_id)`
   (`tenant_plans.trial_ends_at` follows, `0063:66-80`). Before any update the block counts, over all stores with
   `started_at` set and `first_opened_at` null, those that **have in fact opened** (`published_at` set or a `shop.open`
   row): **non-zero → `raise exception` and the migration stops** (the backfill missed a store; the orchestrator brings
   it to the owner). After the updates it asserts that no store is left with `started_at` set and `first_opened_at` null
   (O2b·2's "opened is `startedAt !== null`" holds): so a non-zero R5 `no_live_link` share stops the migration too, and
   is settled at O2b·14 step 2 before apply (recommendation to the owner: add those, partner-built stores whose link was
   removed, to the reset). Comment blocks `-- read-before:` / `-- read-after:` hold read **R5** (below), split by those
   conditions: before `reset` n, `no_live_link` 0, `opened_in_fact` 0; after, every share 0.
`tenancy.sql` block 50 (`:2179`): the O2b·1 pins flipped: "a partner shop's trial waits for its first opening"
(`started_at` null after `app_partner_create_shop_v2`); after `app_accept_handover_v2`: `signed_up_at` ≈ `now()`,
`extended_at` null with any days left, and `trial_ends_at` on its plan row = `app_ist_day_end_after(signed_up_at, window +
days)`; the first publish then sets `started_at` and `trial_ends_at` = opening + days. **The claim path (audit L6):** a
partner shop with its link removed, its owner invite claimed by `app_claim_invites` → `signed_up_at` ≈ `now()` and
`trial_ends_at` recomputed; an owner store's sign-up row keeps its `signed_up_at`; a second owner row (seeded) does not
move it. **Grants (audit M3):** `has_function_privilege` for `app_partner_create_shop_v2(…)`,
`app_accept_handover_v2(uuid,uuid,text,smallint)`, `app_trial_extend(uuid)`: false for anon, authenticated,
service_role, frata_admin, frata_builder; true for frata_app; `app_owner_anchors_cap()` false for every app role; the
existing list at `:2185` gains `frata_builder`. § 47 (`:2095`): `app_trial_extend` on a never-opened store past its
window → refused. The reset block, run on seeded stores: a never-opened partner store with `started_at` set → null and
its `signed_up_at` at the owner's row; a seeded store with `started_at` set, `first_opened_at` null and a `shop.open`
audit row → the block raises (run inside `begin … exception` in the proof, then the row removed).
**Test first:** those `tenancy.sql` asserts, red. **Verify:** `npm run verify:tenancy`; `INT_DB_HOST=localhost:54330
INT_DB_NAME=frata_proof npx vitest run src/lib/billing/__tests__/trial-billing.int.test.ts src/lib/billing/__tests__/trial-parity.int.test.ts`;
`npm run e2e -- --only partners,partner-clients`; `npm run release:check`; `node scripts/prod-migrate.mjs
drizzle/<partner-trial>.sql` prints the SQL, R5 and the drizzle row.

### O2b·4 · The trial-fee rule, frozen at billing (pure, and its SQL twin)
**What:** the rate moment of an order is decided once and never moves after the order is billed:
- `feeForOrder` (`src/domains/plans/entitlements.ts:66-72`): `r = max(rateAt, first.startsAt)` (as today); if the row in
  force at `r` has `trialEndsAt > r`, the rate moment is **`min(trialEndsAt, nextMonthStartIST(billableAt))`**: the
  trial's end (owner decision 2), unless the order is billed before it, on the IST 1st after it became billable
  (`src/domains/time/month.ts:12`); then that 1st. The rate is the plan in force at that moment. So a downgrade during the
  trial gives the downgraded rate; an upgrade waiting for the trial's end gives the upgraded rate to orders billed after
  the trial; and a plan change, a waiting upgrade or the +7 extension made after an order was billed never re-derives
  its fee (the draft bills with this rule; every page re-derives with the same moment). History rows carry
  `trialEndsAt` (`PlanRow` already does, `bill.ts:24`).
- SQL twin: `feeBucketSql(a, rows)` (`src/lib/db/order-predicates.ts:225-235`) takes `{ startsAt, trialEndsAt }[]`
  instead of `Date[]`. Its rate moment: `case when rateAt >= s_i and rateAt < s_{i+1} and rateAt < t_i then
  least(t_i, (date_trunc('month', billableAt at time zone 'Asia/Kolkata') + interval '1 month') at time zone
  'Asia/Kolkata') … else rateAt end` (one arm per row with a trial; `least` ignores a null billable moment, so an order
  not billable yet takes `t_i`), then the existing CASE (`:233`) over that moment. `feeRateAtSql` (`:216`) is unchanged.
- Callers in this commit: `planHistoryIn` (`src/lib/queries/settings.ts:150-153`) adds `trialEndsAt` (rows as stored
  here; O2b·6 applies `fromOpening`); `order-detail.ts:158-160`, `analytics.ts:67,77,99`, `true-profit.ts:74,141,178`,
  `discounts.ts:159,285` pass the rows; `src/domains/orders/kept.ts:46` comment follows.
**What a store owner experiences:** an order shipped during the free trial is charged the fee of the plan they are on
when the trial ends, or, if it is billed on a 1st before the trial ends, the plan they are on that 1st; once it is on an
invoice its fee never changes.
**Test first:** `entitlements.test.ts`: the O2b·1 case flipped (Launch's 2%); Scale trial kept → 0.5%; Launch trial
(opened 23 Dec, ends 22 Jan) with an upgrade to Scale waiting for 22 Jan: an order billable 10 Jan → 0.5%; **an order
billable 28 Dec, billed 1 Jan at 2%, then the upgrade scheduled on 5 Jan → still 2%**; the same with the extension taken
on 3 Jan → still 2%; shipped after the trial → as today; billable before any plan → null.
`src/lib/queries/__tests__/fee-bucket-trial.int.test.ts`: for each of those (the change scheduled after billing
included), `feeBucketSql`'s bucket gives the same rate as `feeForOrder` (parity), and both equal the `fee_bps` the draft
wrote to `frrata_invoice_fees` for the billed order.
**Verify:** `npx vitest run src/domains/plans`; that int test; `INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx
vitest run src/lib/queries/__tests__/analytics-speed.int.test.ts` within its budget. **unit-economics-reviewer** on the diff.

### O2b·5 · The bill: no mid-month row on its own month, made up from ISSUED invoices (pure)
**What:** in `bill.ts`:
- `planInAdvance(plans, monthStart, nextMonthStart, pause)`: M's plan lines. It **filters the rows first**, keeping
  only those with `startsAt <= monthStart` (a row starting after M's 1st is never on M's invoice), and passes the kept
  rows to `planDays` (`:104-120`), so the row in force on the 1st runs to the month's end in advance; empty while a trial
  runs on the 1st (as `:170`). `computeBill` (`:164-172`) reads it for its plan lines.
- The make-up (`:175-177`): `billed = i.prevPlanBilled ?? (prevTrial || openedIn ? 0 : null)`, where **`openedIn` =
  the first row (`fromOpening`'s opening-day row) has `startsAt > prevMonthStart && startsAt < monthStart`**: "started
  after M−1's 1st" is strictly after it, so a store opened ON M−1's 1st was billed on M−1's own invoice and is not made
  up. A plan change during M−1 is not `openedIn` (only the first row counts). The line reads "Your plan from opening last
  month, by days" when `openedIn`.
- `planChangeAdds` (`:152-162`) unchanged; its caller passes `billed` as below.
**Test first:** `bill.test.ts` (Launch ₹1,499, no GST in these figures): the O2b·1 case flipped; **opened 10 Dec, no
trial → December's draft has no plan line; 1 Jan bills 10–31 Dec (₹1,063.81) + January (₹1,499.00) = ₹2,562.81**;
opened 2 Dec → ₹1,450.65 + ₹1,499.00 = ₹2,949.65 on 1 Jan; opened 1 Dec → ₹1,499.00 on 1 Dec and ₹1,499.00 on 1 Jan;
**opened 1 Dec, the December draft still unissued on 1 Jan (`prevPlanBilled` null): 1 Jan bills January only; December
issued late by Admin then bills December once; total ₹2,998.00, never ₹4,497.00**; opened 23 Nov with 30 days (free
until 23 Dec) → nothing on 1 Dec, 1 Jan bills 24–31 Dec (₹386.84) + January = ₹1,885.84; an upgrade on IST day 2
before the issue → not on that month's invoice, made up on the next 1st (owner decision 5; B4's
`plan-change.int.test.ts` updated in the same commit).
**Verify:** `npx vitest run src/domains/billing`. **unit-economics-reviewer** on the diff.

### O2b·6 · `planRowsIn`, the one reader of when a plan starts for money; the draft and its readers
**What:**
- `src/lib/billing/plan-rows.ts` (server-only): `planRowsIn(tx, t)` → `{ billed: PlanRow[] (fromOpening applied),
  chosen: the row in force now as stored (code, name, price, custom, createdBy), openedAt }`: ONE statement
  (`tenant_plans` ⋈ `plan_versions` ⋈ `plans` ⋈ `tenants` on its key), rows oldest first.
- `draft.ts:57-135`: after the existing lock (`:64-67`), `planRowsIn`. When the store's plan did not start on or before
  `monthStart` (never opened, or opened after M's 1st) it returns `{ invoiceId: null, notOpen: true }` **and writes and
  deletes nothing** (blocker 2: `frata_app` may not delete an invoice, `drizzle/0048_billing_access.sql:40-50`; § The
  draft never deletes an invoice). Else `computeBill` with `billed`. The inline plan select (`:79-82`) goes.
  `planBilledIn` (`:50-54`) counts only an ISSUED invoice (`issued_at is not null`), null otherwise. `run.ts`:
  `RunResult` (`:14`) gains `unopened`; `:31-32` counts `notOpen` there, never as `issued` or `failed`, so the cron's
  `first.failed === 0` (`src/app/api/cron/outbox/route.ts:47`) still lets the month issue.
- `billingOverview` (`src/lib/queries/billing.ts:94-161`): history from `planRowsIn` (`:101-104` goes); `opensLater:
  openedAt === null`; `plan` from `chosen` before opening (name, price = custom ?? version, fee); `trialDays:
  trialDaysIfOpened(now, facts)` before opening; `forChange.billed = planBilled ?? (this IST month ? planInAdvance(billed,
  monthStart, …) : null)` (the dialog's figure on days 1–3 before the issue); the estimate (`:119-134`) returns null for
  `notOpen`.
- `featuredBillWith` (`billing.ts:271-278`): its `history` from `planRowsIn(...).billed` (it prices a bill; it already
  needs two issued invoices, so a never-opened store reads null).
- `planHistoryIn` (`src/lib/queries/settings.ts:150-153`) returns `billed` rows' `{ startsAt, trialEndsAt, feeBps }`:
  profit per order, true profit, analytics and discounts take no fee before the opening day (owner decision 6).
- **Read as stored, on purpose** (features, not money: a store in setup has its plan's features): `currentPlan` for
  entitlements, `planNowIn` (`billing.ts:251-256`), Studio's plan and trial gate (`src/lib/queries/videos.ts:46-48`) and
  Admin's modules (`src/lib/admin/modules.ts:29-39`, through `tenantPlanHistory`, `src/lib/admin/plans.ts:55-63`). Each
  gains a one-line comment saying so.
**Test first:** `src/lib/billing/__tests__/bill-from-opening.int.test.ts` (real Postgres) through `runDrafts` and the
issue: a never-opened store → no draft, `unopened` 1, `failed` 0; opened 10 Dec: `runDrafts(10 Dec 12:00 IST)` writes no
December invoice and a January draft; `runDrafts(1 Jan 00:30 IST)` + `issueMonthAuto(1 Jan 00:40 IST)` (or `issueWith(…,
{ system: true })` if the int stack has no seller) issue January at ₹2,562.81 taxable; opened 2 Dec → ₹2,949.65;
opened 1 Dec → a December invoice issued by the 2 Dec run; **a December draft left by the old build for a store that
opened on 10 Dec is neither redrafted nor deleted by the 10 Dec run, `failed` stays 0, and January still bills the
December days** (`planBilledIn` ignores the unissued draft). `draft.int.test.ts`: the O2b·1 pin flipped ("an unissued
draft is not billed"). `billing.int.test.ts`: a never-opened store's overview has `opensLater`, its chosen plan, its
`trialDays`, estimate null. `trial-billing.int.test.ts` and `plan-change.int.test.ts` green.
**Verify:** `INT_DB_HOST=localhost:54330 INT_DB_NAME=frata_proof npx vitest run src/lib/billing src/lib/queries`; `npm
run e2e -- --only billing`. **unit-economics-reviewer** on the diff (the built engine).

### O2b·7 · Migration `<open-plan>`: `app_open_plan_state()`, `app_open_plan(code, by)`, `app_change_plan` after opening
**What:** `npm run db:generate -- --custom --name=open_plan` → `drizzle/<next free>_open_plan.sql` (number from O2b·0b),
`set search_path = ''`, `security definer`:
- `app_open_plan_state() returns text`, `stable`: the reason the plan cannot be chosen at opening, or null. `t :=
  app_current_tenant()`, null → `'no_shop'`; `first_opened_at is not null` → `'opened'`; no row in force → `'no_plan'`;
  the row in force has `custom_monthly_price` → `'custom'`; **set by Frrata staff, keyed on who wrote the row, never on
  who calls (audit M5)**: `exists (select 1 from public.platform_staff s where s.user_id = cur.created_by) and not exists
  (select 1 from public.members m where m.tenant_id = t and m.user_id = cur.created_by and m.role in ('owner',
  'admin'))` → `'staff'`. "Chosen by the store" is the writer's own `members` row as owner or Manager: a staffer who is
  also the store's Staff, Accountant or partner member and sets its plan in Admin (`src/lib/admin/merchants.ts:143-145`,
  `src/lib/admin/plans.ts:74-77`) wrote a Frrata row and gets `'staff'`; a staffer who signed up their own store wrote
  its row as its owner (`0166:51`) and keeps the choice. Any row `starts_at > now() and not by_shop` → `'scheduled'`;
  **any issued invoice of the store** (`exists (select 1 from public.frrata_invoices i where i.tenant_id = t and
  i.issued_at is not null)`, not only plan lines: a fee-only invoice counts) → `'billed'` **(audit L8)**.
- `app_open_plan(p_code text, p_by uuid) returns table (from_code text, to_code text)`, plpgsql: `t` null →
  `insufficient_privilege` "plan: no_shop"; the caller's own `members` row (`tenant_id = t and user_id = p_by and role in
  ('owner','admin')`, never the role a support visit reports; a `builder`, `partner`, `staff` or `accountant` row is
  refused) else `insufficient_privilege` "plan: role"; `perform 1 from public.tenants where id = t for update` (as
  `app_change_plan`, `0063:229`); `r := app_open_plan_state()`, non-null → `check_violation` "plan: " || r; `cur` = the
  row in force; target = newest version of `p_code`, unknown → `invalid_parameter_value` "plan: unknown"; delete
  `by_shop` rows still to start; update the row in force in place, **`update public.tenant_plans tp set … where
  tp.tenant_id = t and tp.id = cur.id` (audit L8)**: `plan_version_id = target, by_shop = true, reason = 'Chosen at
  opening', created_by = p_by`, same `starts_at` and `trial_ends_at` (the publish trigger recomputes the trial,
  `0063:94-104`); same code: no update; audit `billing.plan.open`, target `p_code`, detail `{from, to}` always.
- **`create or replace function app_change_plan(p_code text, p_by uuid)` (orchestrator ruling 1; audit H1):** `0063:221-256`
  copied whole (the last definition on this branch and on main: `0058:14` is older, and main's 0166–0175 do not touch it,
  § Migration numbers), with one line added right after the lock (`0063:229`): `if (select first_opened_at from
  public.tenants where id = t) is null then raise exception 'plan: choose your plan when you open your store' using errcode
  = 'check_violation'; end if;`. The refusal is after the role check and the lock, so a non-member still reads
  `insufficient_privilege` first. `changePlan` maps `plan: …` to its sentence (`settings/billing/actions.ts:209-212`):
  "Choose your plan when you open your store." (§ Words), the same words O2b·10's action check gives.
- Grants on all three, re-run in full: `revoke all … from public, anon, authenticated, service_role, frata_admin,
  frata_builder; grant execute … to frata_app;` (the 0157/0158 pattern, `0158_d0_opening_check.sql:30`; for
  `app_change_plan` this widens `0058:76`, which never listed `frata_admin` or `frata_builder`).
- `scripts/verify/tenancy.sql` § 44 (`:1994`) opens proof shop A at its top (`update tenants set first_opened_at =
  coalesce(first_opened_at, now()) where id = '1111…'`, as `:766` does for B): A is first published only at § 46
  (`:2083`), so § 44's `app_change_plan` calls (`:2007`, `:2009`) would otherwise meet the new refusal, and its
  `check_violation` asserts (`:2035`, `:2044`) would pass for the wrong reason. § 45–47 rerun green after it.
- `scripts/verify/tenancy.sql`, a new section numbered the next free § after main is merged (**§ `<open-plan>`** below; main's People section already takes § 103 and the in-progress merge renumbers O1's to § 105, so § 106 at the time of writing, an example only), as `frata_app`: no tenant →
  refused; **B's OWNER with A's tenant set** → refused; A's Staff and Accountant → refused; **a `builder` members row of
  A** → refused (audit L8); **A's partner member before and after handover** → refused; a support session (staff user, no
  members row) → refused; **`frata_builder`**: no EXECUTE on any of the three (assert, `has_function_privilege`); A's
  owner Launch→Growth: one row changed (`cur.id`'s, the others' `plan_version_id` unchanged), same `starts_at` and
  `trial_ends_at`, one audit row; **then the publish (`published_at = now()`): `trial_ends_at` equals the recompute from
  the opening**; **future `by_shop` rows deleted**; same code: no change, audited; after `first_opened_at` set → state
  `'opened'`, refused; custom price → `'custom'`; **a row created by a `platform_staff` user who is not a member →
  `'staff'`; by a `platform_staff` user who is the store's Staff → `'staff'`; by one who is its Accountant → `'staff'`;
  by one who is its partner member → `'staff'` (audit M5); a store whose owner is a `platform_staff` user, on its
  sign-up row → null (choosable)**; a Frrata-scheduled row → `'scheduled'`; **an issued invoice with fee lines and no plan
  line → `'billed'`**; B's rows untouched. **`app_change_plan` (audit H1):** on a never-opened store as its owner →
  `check_violation`, nothing inserted, no `billing.plan.change` audit; the same store after `published_at = now()` →
  the change written. No EXECUTE for anon, authenticated, service_role, frata_admin, frata_builder on
  `app_open_plan_state()`, `app_open_plan(text,uuid)`, `app_change_plan(text,uuid)`; EXECUTE for frata_app. The last
  line reads `tenancy proof — all checks passed (through § <that number>)` (on the branch today `:6111`, "through § 102").
- `plan-change.int.test.ts` and every int test that calls `app_change_plan` (`grep -rln app_change_plan src`) seed an
  opened store (`first_opened_at` set) in the same commit; gains "open plan, then `app_change_plan` after the opening"
  (only the latter works) and "`app_change_plan` before the opening → refused".
**Verify:** `npm run verify:tenancy` fails before the migration (function missing), passes after; plant "any member"
in the role check and watch § `<open-plan>` fail; plant "any members row of the writer" for `'staff'` and watch the staffer-Staff
case fail; plant "plan lines only" for `'billed'` and watch the fee-only case fail; remove the `app_change_plan` line
and watch its § `<open-plan>` row fail; `npm run release:check` (no collision); `node scripts/prod-migrate.mjs
drizzle/<open-plan>.sql` prints the SQL and its drizzle row.

### O2b·8 · Migration `<billing-from-opening>`: billing from the first opening; drafts the new rule never writes removed
**What:** `drizzle/<next free>_bill_from_opening.sql` (`--custom`, number from O2b·0b):
1. `create or replace function app_shops_to_bill(p_before timestamptz)` as `0066:84-89` joined to `public.tenants t` with
   `t.first_opened_at is not null and t.first_opened_at < p_before`; `revoke all … from public, anon, authenticated,
   service_role, frata_admin, frata_builder; grant execute … to frata_app` (re-run of `0048:113-115`, widened).
2. Between `-- cleanup:begin` and `-- cleanup:end`, idempotent and run AGAIN after the push (O2b·14 step 6), **as ONE
   transaction (audit L9)**: the block is `begin; … commit;` and is sent as one request, so a failure on any statement
   (a restrict foreign key) rolls every delete back. It deletes every unissued (`issued_at is null`) invoice the new rule
   never writes, that is, of a tenant with `first_opened_at is null` (every period, next month's included) **or** whose
   opening's IST day start is after the invoice's `period_start` (a month the store opened after the 1st of), first its
   `frrata_fee_credits` (whose fee foreign key is `restrict`, `drizzle/0047_billing.sql:98`), `frrata_invoice_fees`,
   `frrata_invoice_lines`, then the `frrata_invoices` rows. Issued rows are never touched. It runs as `postgres` through
   the Supabase API; `frata_app` keeps no delete on `frrata_invoices`.
3. Comment blocks `-- read-before:` and `-- read-after:` holding R1, R3 and **R6** (below); `scripts/prod-migrate.mjs`
   prints them, and prints the cleanup block on its own with `--cleanup` (§ Repetitive work). R6 counts, over the drafts
   the cleanup targets, their lines, fees and credits, and the targeted drafts or fees still referenced by a `restrict`
   key the block does not delete: `frrata_credit_notes` and `frrata_payments` (`drizzle/0054_billing_issue.sql:44-45`),
   `billing_notices` (`drizzle/0056_billing_autopay.sql:39`), and a `frrata_fee_credits` row on another invoice that
   points at a targeted fee (`0047:98`). Before: those `restrict` counts must be 0 (else stop: the transaction would roll
   back; the orchestrator asks the owner); after: every R6 count 0.
`tenancy.sql` block 50: the O2b·1 pin flipped: an owned never-opened shop with a 40-day-old plan is not listed; A (open)
is; after the change `has_function_privilege` on `app_shops_to_bill(timestamptz)`: frata_app true, anon, authenticated,
service_role, frata_admin, frata_builder false (extend `:1862`'s list with frata_builder); `frata_app` still has no
DELETE on `frrata_invoices` (`has_table_privilege`).
**Test first:** `bill-from-opening.int.test.ts` gains: a never-opened store with a December draft drafted 20 Nov; the
month refuses to issue (stale, `0139:31-32`); the test runs the file's cleanup block; the draft and its lines, fees and
credits are gone; `issueMonthAuto(1 Dec)` issues the month for the rest; a store opened 10 Dec holding a December draft
→ removed by the block; a store opened 1 Dec holding its December draft → kept; running the block twice changes nothing;
**a targeted draft with a `billing_notices` row → the block fails and NOTHING is deleted (the other targeted drafts
included): one transaction**; R6 before and after match the rows seeded.
**Verify:** `npm run verify:tenancy`; that int test; `node scripts/prod-migrate.mjs drizzle/<billing-from-opening>.sql`
prints the SQL, the reads, the cleanup block and the drizzle row.

### O2b·9 · Opening with the plan
**What:** `src/app/(console)/console/shop-actions.ts`:
- `openShop(input?: unknown)` (`:37`): Zod `z.object({ plan: z.enum(PLAN_CODES).optional() }).strict().optional()`
  (bad input → "We couldn’t open the store. Nothing was changed."). The server decides whether the plan step applies.
- The locked read (`:45-48`) adds `firstOpenedAt: tenants.firstOpenedAt`. **The plan is ignored** (no state read, no
  `app_open_plan`) on a support visit (as today, `:41,59`) and **for a store that opened before** (`firstOpenedAt`
  set): a stale popup that sends `{ plan }` on a reopen opens the store with its plan unchanged, never the 'opened'
  refusal.
- Otherwise, when a plan is given, after the lock and before any write: `select app_open_plan_state() as r`; a reason →
  return its sentence (§ Words; nothing has been written).
- `select * from app_open_plan(${plan}, ${auth.userId})` **right before the publish update (`:58`), after
  `websiteBlocksOpening` (`:57`)**, never straight after the lock: `asMember` commits on a return, and `:49`, `:50`,
  `:54`, `:57` return early.
- The catch (`:69-74`): a message (as `createShop` reads it, `src/lib/db/platform.ts:169`) starting `plan:` → its
  reason's sentence; the handover's `23514` (the publish trigger, `0066:120`, message `shop:`) keeps its own sentence;
  `pgCode` (`:32-35`) alone never decides.
- `loadOpening()`: `requireMember(CAN_MANAGE)`; **not ok (Staff, Accountant, a Builder or any role outside owner and
  Manager) or a support visit → `{ step: false }` with no read at all (audit L7)**; else `openingFor(m, now)` in a new
  `src/lib/queries/opening.ts` (not `billing.ts`; it returns a custom price, so it is a money read): `openingFor`
  refuses itself any membership outside owner and admin or with a support session (as `billing.ts`'s exports do), and
  **`scripts/check-billing-read.mjs` gains it**: a second import pattern, `@/lib/queries/opening`, allowed only in
  `src/app/(console)/console/shop-actions.ts` (the popup's action) and `__tests__/` (audit L7); the gate's header comment
  says so, and the gate is run against that comment (CLAUDE.md: a gate must not match its own documentation). One
  `withTenant`:
  `app_open_plan_state()`, the row in force (code, name, custom price), `shop_trials` by key, `tenants.first_opened_at`;
  plus `publicPlans()` (`platform.ts:181`). Returns `{ step: boolean, choosable: boolean, current: { code, name,
  monthlyPrice, feeBps }, plans: [{ code, name, monthlyPrice, feeBps }], freeUntil: Date | null }`: `step` false once
  opened; `freeUntil = lastDay(trialEndsAt({ ...facts, startedAt: now }))` when `trialDaysIfOpened(now, facts) > 0`,
  else null (no trial row, `endedAt` set, or past the cap). No cost, no invoice.
**Test first:** `open-shop.int.test.ts`: owner opens on Growth → the row is Growth, same `starts_at`, `published_at` set,
trial started; Manager may; a support visit opens a no-trial store, plan unchanged; **a reopen after a close that sends
`{ plan: 'scale' }` opens the store, plan unchanged, no `billing.plan.open` audit**; `app_open_plan` refused (a Frrata
change scheduled between the read and the call) → nothing published, the reason's sentence; the handover refusal keeps
its sentence; `{ plan: 'gold' }` refused before any read; a partner-built store after handover opens with a trial from
the opening (decision 4); **`loadOpening()` as Staff, as an Accountant and on a support visit → `{ step: false }`, and
no statement runs (a spy on `withTenant`)**. `scripts/__tests__/` (or the gate's own fixture run): a file outside
`shop-actions.ts` importing `@/lib/queries/opening` fails `check:billing-read`; the gate's own file passes.
**Verify:** that test green; `npm run verify:tenancy`; `npm test` (check:actions, check:billing-read);
`npm run e2e -- --only setup,ux,storefront-api` (O2a's popup still sends no plan).

### O2b·10 · The plan in "Open your store?", and Plan and billing before opening (BUILT AS DRAWN, with the addendum)
**What:**
- O2a's `open-store.tsx`: on open it calls `loadOpening()`:
  - `choosable` → the plan radio cards (Launch preselected; the native radio painted as the addendum's `.radio`, the
    card's edge `--action` when checked) and the line under them for the checked radio (§ Words). With a trial and
    partner-built are one state.
  - not choosable (custom, staff, scheduled, billed) → "Plan set with Frrata": one `Facts` row ("Plan" · the plan's name,
    and under it its price-and-fee line) and the line; no radios.
  - reopening (`step` false) → O2a's popup unchanged: no plan, no line.
  - a refusal → "Refused": the popup calls `loadOpening()` again and shows the `Facts` row of the plan now in force,
    its line, and the refusal's sentence in the `Dialog` error slot (`role="alert"`); "Open store" stays.
  - "Open store" sends `{ plan }` only when `choosable`.
- `settings/billing/page.tsx`, `opensLater` → as drawn: the heading "Plan and billing" with a `warn` `Chip` "Opening
  soon"; one section: the `Facts` row "Plan" · the plan's name with its price-and-fee line under it; "Your plan starts
  when your store opens."; the trial line when `trialDays > 0` (§ Words); no estimate, no invoices, Change plan hidden.
  The `changePlan` action refuses before opening ("Choose your plan when you open your store.").
- `e2e/lib.mjs`: `openStore(page, { plan })`. `99-setup.mjs`: owner opens on Growth (DB: Growth, same `starts_at`); a
  support visit sees no radios; a store with a custom price sees the `Facts` row; a refusal shows the `Facts` row and
  the error; the line changes with the radio; Plan and billing before opening (chip, `Facts` row, both lines) and after;
  axe; 390 and 1280.
**Test first:** those steps, red.
**Verify:** `npm run e2e -- --only setup,billing,ux,storefront-api`; `mockup-parity-reviewer` (§ 2 and the addendum,
every state in its switcher and the Plan and billing frame), `words-reviewer`, `design-system-reviewer`; § Performance's
build line.

### O2b·11 · The plan step leaves sign-up (the same push as O2b·10)
**What:** re-read O1's `src/app/start/*`, `src/domains/signup/steps.ts` first. `signupSteps` drops `plan` (O1·1's order
becomes `name, email, phone, sells`); the plan step's component and its words go from `signup-flow.tsx`; `page.tsx`
stops reading `publicPlans` and `signupTrialDays` if nothing else there does; `createMyShop` drops `plan` from Zod
(`src/app/start/actions.ts`, O1's `Shop`) and `SENTENCES`' `bad_plan`; `createShop` (`src/lib/db/platform.ts:158`) sends
`'launch'` to `app_create_shop_v3` (O1 keeps `p_plan`). Partner-built stores are on Launch already (`0166:85-86`).
`63-signup.mjs`: no "Choose your plan", dots one fewer, the plan row `launch`.
**Test first:** that `63-signup` change, red. **Verify:** `npm run e2e -- --only signup,partners`; `/start`'s first-load
JS ≤ O1's pin (§ Performance).

### O2b·12 · Admin reads the same start
**What:** Admin reads plan rows as `frata_admin` (`tenantPlanHistory`, `src/lib/admin/plans.ts:55-63`) and, for money
and counts, applies the same pure `fromOpening` with `tenants.first_opened_at`: the merchants list
(`src/lib/admin/merchants.ts:81-86`): a never-opened store's plan reads "Launch · Not open yet"; `storesPerVersion`
(`plans.ts:85-95`) counts opened stores per version and never-opened ones apart ("Not open yet · 3"). Admin's modules
(`modules.ts:29-39`) keep the rows as stored (features). `trialView` (`src/lib/admin/trials.ts:64-67`) needs no change
(O2b·2: opened is `startedAt`).
**Test first:** `src/lib/admin/__tests__/admin.int.test.ts` (new case): a never-opened store is not counted on its
version and reads "Not open yet"; its trial reads `building`. **Verify:** that test; `npm run e2e -- --only neel-admin`.

### O2b·13 · Rules, docs, the trials amendment
**What:** `docs/specs/2026-11-08-trials.md`: under rule 3: "Superseded 2026-11-23 (owner, call 2 of
`docs/specs/2026-11-23-merchant-onboarding.md`): the plan is chosen at Open your store, Launch preselected, the trial on
that plan; a store is not billed before it first opens. Built in `docs/plans/2026-11-23-o2b-plan-at-opening.md`."; rule
1's cap sentence gains "(billing waits for the first opening since O2b; the cap still ends a late opener's trial, whose
7-day grace starts at its opening)"; the partner rule: "a partner-built store's trial starts at its first opening, and its
cap counts from the handover; the handover no longer extends a trial (owner decision 4, 2026-11-23)"; rule 4 gains owner
decision 2's sentence and O2b·4's freeze. § Practices recorded in skills with their bumps; the spec's § O2 names the
addendum and both plans. **Verify:** `npm test` (check:skills, check:docs, check:plans).

### O2b·14 · Production, in order (the orchestrator runs reads and applies; aggregate counts only)
1. O1's two migrations, under their renumbered names, have their `__drizzle_migrations` rows (O1 § Deploy order); this
   plan's three are numbered after main's last (O2b·0b, § Migration numbers).
2. Reads R1–R6 (below), answered: R1 `issued` > 0 and R2 `billed` > 0 go to the owner before the release; **R5
   `opened_in_fact` > 0 or `no_live_link` > 0, or any R6 `restrict` count > 0, go to the owner before the release: the
   migrations stop on them (audit M4, L9).**
3. **Previews share the production database (`docs/setup.md:163`; audit L9):** before applying, rebase every open preview
   branch onto this one or close it. An old preview's "Run drafts" (Admin › Billing) after the cleanup writes old-rule
   drafts again; step 6 removes any that slip through.
4. **Never on IST days 1–3 before that month's auto issue has run** (Admin › Billing, an audit row `billing.issue`), and
   **right before the push** (the old build drafts a store that opens mid-month onto that month's own invoice for as long
   as it runs): apply `<partner-trial>`, then its row; apply `<open-plan>`, then its row; apply
   `<billing-from-opening>` (its cleanup is one transaction), then its row (`node scripts/prod-migrate.mjs …`, through
   the Supabase API).
5. R5 again: every share 0. R1 again: `drafts` 0, `next_month_drafts` 0; R6: 0; `select count(*) from
   app_shops_to_bill(now() + interval '40 days')` equals the count of opened owned stores.
6. Push O2b·2–O2b·13 together; wait until the deployment is Ready.
7. Run `<billing-from-opening>`'s cleanup block again (`node scripts/prod-migrate.mjs drizzle/<billing-from-opening>.sql
   --cleanup`, one transaction): it removes any draft the old build, or an old preview, wrote between step 4 and step 6.
   Then R1, R3 and R6: 0.
8. Within the hour and the next day: R1 and R3 still 0; `get_runtime_errors` for Home, Plan and billing, `/start`, the cron.
9. On the next 1st–3rd: the month issued (audit `billing.issue`), never skipped `stale`; the run's `failed` 0.
10. `unit-economics-reviewer` on the built engine and the first real invoice after an opening.

**Production reads (read only):**
- **R1** never-opened stores' invoices: `select count(*) filter (where i.issued_at is not null) issued, count(*) filter
  (where i.issued_at is null) drafts, count(*) filter (where i.issued_at is null and i.period_start > now()) next_month_drafts
  from frrata_invoices i join tenants t on t.id = i.tenant_id where t.first_opened_at is null`.
- **R2** orders billable before their store's opening day: `select count(*) orders, count(f.order_id) billed from orders o
  join tenants t on t.id = o.tenant_id left join frrata_invoice_fees f on f.order_id = o.id where o.rto_initiated_at is
  null and o.shipped_at is not null and (case when o.delivered_at is not null then least(o.delivered_at, o.shipped_at +
  interval '30 days') when o.lost_at is null then o.shipped_at + interval '30 days' end) < coalesce(date_trunc('day',
  t.first_opened_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata', 'infinity')`.
- **R3** unissued drafts of a month its store opened after the 1st of: `select count(*) from frrata_invoices i join tenants t
  on t.id = i.tenant_id where i.issued_at is null and date_trunc('day', t.first_opened_at at time zone 'Asia/Kolkata') at
  time zone 'Asia/Kolkata' > i.period_start`.
- **R4** never-opened stores whose plan in force was set by Frrata staff (they see the `Facts` row).
- **R5** never-opened stores whose trial has started, split as the reset reads them (audit M4): `select count(*) filter
  (where live_link and not opened) reset, count(*) filter (where live_link and not opened and has_owner) reset_with_owner,
  count(*) filter (where live_link and not opened and has_owner and owned_at < now() - interval '45 days')
  reset_handed_over_45d, count(*) filter (where not live_link and not opened) no_live_link, count(*) filter (where opened)
  opened_in_fact from (select exists (select 1 from partner_links l where l.tenant_id = s.tenant_id and l.removed_at is
  null) live_link, (exists (select 1 from shop_settings ss where ss.tenant_id = s.tenant_id and ss.published_at is not
  null) or exists (select 1 from audit_events a where a.tenant_id = s.tenant_id and a.action = 'shop.open')) opened,
  (select min(m.created_at) from members m where m.tenant_id = s.tenant_id and m.role = 'owner') owned_at,
  exists (select 1 from members m where m.tenant_id = s.tenant_id and m.role = 'owner') has_owner from shop_trials s join
  tenants t on t.id = s.tenant_id where s.started_at is not null and t.first_opened_at is null) x`. `opened_in_fact` must
  be 0 and `no_live_link` 0 (or settled by the owner) before apply; after, every share 0.
- **R6** the cleanup's reach (audit L9), over the unissued drafts the cleanup block targets (`d`): `count(d)`, their
  `frrata_invoice_lines`, `frrata_invoice_fees`, `frrata_fee_credits`; and, each of which must be 0 before apply, the
  targeted drafts referenced by `frrata_credit_notes` or `frrata_payments` (`0054:44-45`) or `billing_notices`
  (`0056:39`), and the targeted fees referenced by a `frrata_fee_credits` row on an invoice not targeted (`0047:98`).

## The draft never deletes an invoice (blocker 2)
`frata_app` holds select, insert and update on `frrata_invoices` and no delete (`0048:40-48`); deletes are granted only
on its lines, fees and credits (`0048:50`). Chosen: **the draft path never deletes an invoice row; `<billing-from-opening>`'s cleanup removes
the drafts the new rule never writes, at the migration and once more after the push.** Rejected: granting `delete` with a
`tenant_undraft` policy (`issued_at is null`) and a `tenancy.sql` row. Why: the new build never writes a draft for a month
the store's plan did not start by (O2b·6), so the only such drafts are the old build's, written in the bounded window
between applying `<billing-from-opening>` and the push (and by an old preview, which shares the database: O2b·14 step 3); a permanent delete right on a money table for `frata_app`, kept forever to tidy one
transition, is the larger grant. A leftover draft cannot block an issue meanwhile: it is for a month that began before it
was drafted (not `stale`, `0139:31`), the run counts it `unopened` (not `failed`, so `route.ts:47` still issues), and
`planBilledIn` ignores it (unissued).

## Migration numbers (named here, numbered at build; audit H2)
**Checked 2026-11-24** (`git fetch origin main`; `git ls-tree --name-only origin/main drizzle/ | tail -15`): `origin/main`
already holds `0166_studio.sql` through `0175_admin_cash.sql` (Lane C's Studio credits among them), so the numbers this
plan used to carry (0168–0170) are taken, and O1's `0166_signup_without_pickup.sql` and `0167_signup_drop_old_definers.sql`
on this branch collide with main's 0166 and 0167 (fixed at O1's release, when O1 renumbers its two; not here). A merge of main
is in progress in the working tree as this is written, with O1's two as `0176_signup_without_pickup.sql` and
`0177_signup_drop_old_definers.sql` (only their header comments changed: every `0166:<line>` cited in this plan holds in
`0176` at the same line). Proof sections are numbered the same way: the new one takes the next free § after the merge.
**The rule:** this plan's three migrations are generated in O2b·3, O2b·7 and O2b·8, AFTER the branch has merged main and
O1's two are on main renumbered (O2b·0b), as the next free numbers in that order: `<partner-trial>`, `<open-plan>`,
`<billing-from-opening>`. At the time of writing main's next free number is 0176; with O1's two taking 0176–0177 this
plan's would be 0178–0181 (an example, never hard-coded: whatever main holds at O2b·0b wins). Every name in this plan
(`drizzle/<partner-trial>.sql` and the rest) reads as the file `npm run db:generate` writes then. If another branch merges
first, regenerate: delete this plan's `.sql` and snapshots, take main's journal, `npm run db:generate` again so `idx` and
`when` follow main's last (`scripts/merge-main.mjs:9-11`), and recompute the sha256 and the journal row with
`scripts/prod-migrate.mjs`. Nothing here is applied to production before that.
**Main redefines none of this plan's functions** (checked on `origin/main` 2026-11-24 by grepping 0166–0175 for every
`function app_…`): not `app_partner_create_shop_v2`, `app_accept_handover_v2`, `app_trial_extend`, `app_change_plan`,
`app_shops_to_bill`, `app_trial_recompute`, `app_trial_clock_starts` or any `shop_trials` or `tenant_plans` writer. Main does
redefine `app_claim_invites` (`0174_people_access.sql:180`), which this plan no longer copies (O2b·3 step 4's trigger),
and `app_handover_invite` (`0171_passkeys_off_access.sql:83`), which it never touches. O2b·0b re-runs the check on the
merged tree: `for f in $(git diff --name-only <merge-base> HEAD -- drizzle/*.sql); do grep -nE
"function (public\.)?app_(partner_create_shop_v2|accept_handover_v2|trial_extend|change_plan|shops_to_bill|trial_recompute|claim_invites)\b" $f; done`;
a hit means the body this plan copies is taken from that newer file instead.

## Performance
- **Home and the popup:** Home unchanged (O2a). `loadOpening`, on the popup's open only: one `withTenant` with
  `app_open_plan_state()` (index lookups on `tenants`, `tenant_plans` by `tenant_id` ≤ 4 rows, `platform_staff` and
  `members` by key, `frrata_invoice_lines` exists by `tenant_id`), `tenant_plans`, `shop_trials` by key; `publicPlans()`
  (3 rows). EXPLAIN each in the 10× seed: index scans, under 10 ms. A refusal costs one more `loadOpening`.
- **`planRowsIn`** is one statement where each caller had one: Plan and billing, analytics, true profit, discounts, order
  detail and the featured nudge run the same number of statements. `feeBucketSql` gains at most one arm per row with a
  trial (≤ 4); `analytics-speed.int.test.ts` stays within budget.
- **The billing run:** per shop per month, the plan read moves before the `Promise.all` (`draft.ts:78`): one more round
  trip; never-opened stores leave the list, so fewer drafts. 10×: 500 stores × 2 months × 1 run a day, unchanged batch
  (`run.ts:27`, 4 at a time).
- **`<partner-trial>`'s reset** recomputes one trial per never-opened partner store (R5 `reset`, a handful): one statement
  each, once. Its trigger on `members` runs one indexed update per owner row inserted (rare: sign-up and handover).
- **First-load JS:** Home's pin from O2a holds (the radios are in the `next/dynamic` popup); `/start` drops the plan step,
  ≤ O1's pin. `npm run build && SHOW_BUDGETS=1 node scripts/check-storefront-build.mjs | grep -E "/\(console\)/console/page:|/start/page:"`.

## States
| State | Drawn | Primitive |
|---|---|---|
| With a trial (a store its owner made, or a partner-built one: the same state, decision 4) | addendum "With a trial" / "Partner-built" | `Dialog`, radio cards, the line |
| No trial (refused a trial, or opening after its cap) | addendum "No trial" | the same, its line |
| Plan set with Frrata (custom price, staff-set, Frrata-scheduled, or billed already: one state, one sentence) | addendum "Plan set with Frrata" | `Facts` row with its price-and-fee line, the line |
| Reopening after a close (a stale plan is ignored) | addendum "Reopening" | O2a's popup |
| A support visit | spec | O2a's popup, no plan |
| Refused (the plan changed while the popup was open) | addendum "Refused" | the `Facts` row of the plan now in force, the line, `Dialog` error slot |
| Plan and billing before opening, with a trial | addendum | heading + `warn` `Chip` "Opening soon", `Facts` row with its price-and-fee line, both lines |
| Plan and billing before opening, no trial | no (§ Deviations) | the same without the trial line |
| Trial banner before opening | (today's `building` words) | `trial-ending.tsx` |
| Admin: not open yet | no | text in the merchants list and the plans count |
| Phone | addendum | `Dialog` sheet; the page at 390 |

## Words (final; console, `check:words`)
- Radio cards: "Launch" · "₹1,499 a month + GST · 2% per delivered order" (each from `publicPlans`, the fee by
  `formatPercent`); "Growth" · "₹4,999 a month + GST · 1% per delivered order"; "Scale" · "₹14,999 a month + GST · 0.5%
  per delivered order".
- The line, for the checked (or fixed) plan: a trial (`freeUntil`) → "Your plan is free until 23 Dec. Then ₹1,499 a
  month + GST." (the date from `freeUntil`; the plan is free, the per-order fee is charged, so never "everything is
  free"); no trial → "₹1,499 a month + GST from today." A partner-built store reads the same.
- Plan set with Frrata and Refused: "Plan" · "Growth" (`Facts`), under it "₹4,999 a month + GST · 1% per delivered
  order" (the custom price when there is one), and the line.
- Refusals (`openShop`): role → "Only the owner or a Manager can choose the plan." · custom, staff, scheduled, billed →
  "Your plan is set with Frrata. Message Frrata to change it." · no plan → "Your store has no plan yet. Message Frrata." ·
  unknown → "We couldn’t open the store. Nothing was changed." (No "opened" sentence: the action ignores the plan for a
  store that opened before.)
- Plan and billing before opening: chip "Opening soon" · "Plan" · "Launch" · "₹1,499 a month + GST · 2% per delivered
  order" · "Your plan starts when your store opens." · the trial line **built from `trialDays`** (`trialDaysIfOpened`: the
  shop's own days, Admin's setting 7–45 at sign-up or up to 90 by staff, less any days its cap cuts off): "Your 30 days
  start when you open your store." (n = 1: "Your 1 day starts when you open your store."), **omitted** when `trialDays` is
  0 (refused a trial, ended, or past its cap: with decision 4 a store can still be past its cap before opening, an owner
  store more than window + days after sign-up or a partner-built one that long after its handover; checked,
  `trial.ts:58-64`) · `changePlan` before opening: "Choose your plan when you open your store."
- Invoice line: "Your plan from opening last month, by days".
- Admin: "Not open yet".
- Removed from sign-up: "Choose your plan", "{n} days free from going live", "{price}/mo + GST · {fee} per delivered
  order", "Continue" (on that step), "Choose a plan."

## Practices recorded in skills (landed in O2b·13; bumps from the versions O2a leaves)
| Practice | Skill file § | Bump |
|---|---|---|
| A store's plan starts at the start of its first opening's IST day (`fromOpening`); `planRowsIn` is the one reader for money (billing, fees, profit, the featured nudge, Admin's counts); features read rows as stored | `frata-architecture/reference/money-and-gst.md` § Trials | architecture minor |
| Month M bills only plan rows started by its 1st; the next 1st makes up by days from ISSUED invoices; an unissued draft is never "billed"; the draft never deletes an invoice | same, § Billing | same |
| Every trial starts at the first opening; `signed_up_at` is when the store got its owner (sign-up, or its first owner row on any path, written by one trigger on `members`); a late opener's grace starts at its opening | same, § Trials | same |
| A definer's refusals come back as a reason: a `_state()` function both the read and the write use, and a `plan:` message prefix the action maps; "who set this row" is keyed on the row's writer, never the caller | `frata-architecture` SKILL.md § Definers and platform reads | same |
| An order shipped during a trial takes the rate of the plan in force when the trial ends, frozen at its billing 1st if that is earlier (decision 2); never-opened stores pay nothing; deletion after 180 days is pending (decision 3) | `frata-unit-economics` SKILL.md (fee rules) | unit-economics minor |
| A known hazard is pinned as a test named "(flipped in <task>)" and flipped in the fixing commit; a billing migration runs its read-before and read-after, right before the push, never on IST days 1–3 before the month's issue, its cleanup as one transaction again after the push, previews rebased or closed first (they share the database); a redefined definer re-runs its full revoke list (`frata_builder` included) | `frata-verify` SKILL.md | verify minor |

## Repetitive work → agents and scripts
| Chore | Done by hand | Becomes |
|---|---|---|
| Production reads before and after a billing migration, and a cleanup re-run after the push | the O2 draft, here | `-- read-before:` / `-- read-after:` / `-- cleanup:` blocks in the migration, printed by `scripts/prod-migrate.mjs` (`--cleanup` prints the block alone; O2b·8) |
| Proving a definer's refusals per role in `tenancy.sql` | 0058, 0063, here | the `proof.*` helpers O1·11 adds take a role list; § `<open-plan>` uses them |
| A fee rule's TS and SQL twins | O2b·4 | `fee-bucket-trial.int.test.ts` parity, beside the trial parity test |

## Deviations
| Mockup element | What is built | Reason | Owner seen |
|---|---|---|---|
| 1 "Free for 30 days. First charge ₹1,499 + GST on 23 Dec." | "Your plan is free until 23 Dec. Then ₹1,499 a month + GST." | the drawn line was false: the per-order fee is charged during a trial, and the plan is billed on the next 1st, not the trial's last day (`bill.ts:166-177`); redrawn in the addendum | yes, at O2b·0 |
| Plan and billing before opening: "Your 30 days start when you open your store." on every store | the number from `trialDaysIfOpened`, and the line left out for a store with no trial to come | a fixed "30" is false for a shop with Admin's other length or a cap that cuts days; the line is false for a store refused a trial or past its cap (not drawn) | no: shown with O2b·10's parity screenshots |

The "billed already" reason is not drawn on its own: it is folded into "Plan set with Frrata", whose words fit (after
`<billing-from-opening>` no never-opened store can be billed, R1 = 0, so only a bill Frrata made could put it there).

## Out of scope (and the signal that brings each back)
- **Deleting a store that never opens after 180 days, with two notices to the owner** (owner decision 3; mirrors trials
  rule 5): its own small task. Signal: R1's never-opened count has a store older than 150 days.
- Credit notes for invoices already issued to never-opened stores: none exist (R1 = 0, 2026-11-23); signal: R1 `issued`
  > 0 at step 2 of O2b·14.
- A first-charge amount in the popup: not built (the line names the date and the monthly price).
- A late opener's one extension inside the first 7 days after its cap (`mayExtend` and `app_trial_extend` still allow it,
  unchanged): signal: an extension audit row on a store opened after its cap.

## Open questions for the orchestrator
Closed: the upgrade on IST days 1–3 moving to the next 1st (decision 5); credit notes for never-opened stores (none
exist, R1 = 0); fees on orders before the opening day (decision 6); partner-built trials spent during the build (decision 4).
1. Closed by ruling 1 below: `<open-plan>` redefines `app_change_plan` (O2b·7, § `<open-plan>`).
2. Closed by ruling 2 below: the cap counts from the handover (R5 `reset_handed_over_45d` counts the stores that then open
   with no trial; reported to the owner, not a stop). Still open, for the owner at O2b·14 step 2 only if R5 shows any: a
   never-opened store whose partner link was removed but whose trial started at creation (`no_live_link`): reset it as
   partner-built (recommended) or leave it; the migration stops until it is settled.
3. **Split before O2b adds to either** (the build's impact review, 2026-11-24): `src/lib/db/schema.ts` (393 lines) and
   `src/lib/db/platform.ts` (380) on the branch (396 and 394 in the merge of main now in the working tree) are near the 400-line `check:size` gate; split before this plan adds to either (by area,
   re-exported from the old path, its own task). Checked against the tasks: none adds to them (no new table or column;
   no definer wrapper goes into `platform.ts`: `app_open_plan` is called from `shop-actions.ts`, `opening.ts` is a new
   file, and O2b·11 only shrinks `createShop`, `platform.ts:158`), so no split task is in this plan. If a task's diff
   adds a line to either, it stops and a split task goes in before it (O2b·0b's place, second).

**Orchestrator rulings, 2026-11-23** (built: (1) in O2b·7, (2) in O2b·3): (1) yes: `<open-plan>` also redefines `app_change_plan` to refuse a change before a store first opens, so the rule holds in the database and not only in the action; its proof row joins § `<open-plan>` (the next free §, O2b·7). (2) Never-opened partner stores already handed over: the cap counts from the handover, the rule; no fresh window.
