# Neel N4 — Frrata Admin, one job in view at a time
Status: active · Date: 2026-11-15 · Mockup: https://claude.ai/artifact/YPGo8SV7vqNu9vyCp5vCSQ (source
`docs/mockups/2026-11-15-neel-admin/`) · Approved: owner, 2026-11-15 ("mockup approved. please finishup. keep master admin
for frrata admin … It'll be Apps. across the whole ecosystem. remove inconsistencies.") · Hand-over: the orchestrator's
Partners and Staff pass (branch claude/amazing-wright-7irwn3, `docs/mockups/2026-11-15-admin-partners-staff/`), folded in.

## Goal
North star (3) catalogue and (6) true profit run on Frrata staff acting fast: a passkey that waits 24 h, an over-payment
nobody refunds, a domain claim nobody settles, a trial that ends without autopay each cost a merchant money or a day.
Measure: every waiting task reachable from one page (Today) in one click; Admin pages one screen tall at 1280 for the
common case; the owner's "showing everything at once doesn't make sense" closed.

## Owner's words (2026-11-15)
- **Master admin**: the label for the Frrata Admin role everywhere a person reads it (Staff, the gate, emails, Activity).
  The stored role stays `admin`; `support` stays "Support". "Another admin approves it" → "Another master admin approves it."
- **Apps, across the whole ecosystem**: every word a person reads says app, never module (Admin nav "Modules" → "Apps",
  "Asked to be told" → "Waiting list", "add-on" → "paid app"; console, partner workspace, emails, notices). Code names
  (`modules`, `tenant_modules`, `check:modules`) stay; a gate keeps "module" out of UI strings.

## Phases (each its own commit, flows first)
- **N4·1 Shell and Today.** Nav groups Today · Merchants (Merchants, Trials, Offers, Names) · People (Partners, Staff) ·
  Money (Plans, Billing) · Platform (Apps, EkCode, Themes, Notices, Email health, Infrastructure, Activity), each item with
  the count of what waits in it (NavItem.badge, the pill already in the shell). `/admin` becomes Today: one list, oldest
  first, a chip, one line, one action; no count, no list: "Nothing waits." Shared parts in `src/app/(admin)/admin/_components/`:
  `NeedsBand` (a waiting task under a header, its one action), `MoreMenu` (the Menu primitive), `ReasonDialog` (a confirm
  that names the thing, both outcomes, the reason the other side reads).
- **N4·2 Records and lists as drawn.** Merchants (views Needs you · In trial · Live · All, a Needs column), a merchant
  (band, tabs Overview · Plan · Apps · Addresses · Activity, More: Rename address, Freeze address changes, End trial;
  Change plan and the trial in dialogs), Partners and Staff (the hand-over: band, tabs, dialogs, own request with no
  button), Billing (the run as Drafts → Issue → Collect, invoices in views, export in More), an invoice (band for
  over-paid or failed; tabs Payments · Lines · Credit notes; Record payment, Record refund, Credit note in dialogs),
  EkCode (paused codes lead; Overview · Stores · Blocked; Edit limits and Block a number in dialogs), Infrastructure (Needs
  you, the four figures, the rest folded), Names (waiting claims lead with their two actions; Blocked · Recently released ·
  Reserved; Block a name in a dialog), a theme version (Release to every store; Add pilot store; Recall and Withdraw in
  More with dialogs), Plans (a row a plan with Edit; trial terms behind Edit), Apps (Pause for everyone in a row's ⋯;
  Waiting list tab), Offers (a store's offers, Stop in ⋯), Notices (New notice in a dialog), Email health (a band for a
  backlog), Activity (filters by store, person, kind; pages), Trials (views).
- **N4·3 Phone, flows, reviews, ship.** Records and lists two pages; dialogs as sheets (Dialog does this already).

## The new things (beyond moving parts)
1. **Today** — `src/lib/admin/today.ts`: one read that gathers what each page already reads (partner passkey requests,
   staff passkey requests, partners to review, domains waiting, invoices over-paid or failed, codes paused, Now alerts,
   trials ending ≤ 3 days without autopay, owners not signed in after 3 days, a staged version new in this deploy, the run
   to issue). Pure ranking in `src/domains/admin/today.ts` (kind, age → order), unit-tested. The nav counts read the same
   function (one fact, one place).
2. **Record refund** — an over-paid payment gets `refunded_at`, `refund_utr`, `refunded_by` (migration, numbered after
   main's next free one; lanes A/B hold 0133–0136). Through a definer (see the security review below), master admin only, a fresh passkey, the UTR unique, audited; the band goes when refunded. No money moves through Frrata: it records what
   was sent from the bank.
3. **Activity filters and pages** — `listActivity(staff, { tenant?, actor?, kind?, before? })`, keyset pages of 50 over
   `audit_events (at desc)`; an index if EXPLAIN asks.
4. **Master admin / Apps words** — `src/domains/tenancy/staff-words.ts` owns the role's words (done).

## Security and tenancy review on the plan (2026-11-15), folded in
- **H1 Record refund through a definer.** `frata_admin` only reads `frrata_payments` (0055); writes go through definers.
  New `app_record_frrata_refund(p_payment uuid, p_utr text, p_staff uuid)`: `security definer set search_path = ''`, the
  row `for update`; refuses unless captured, `over_paid > 0`, `refunded_at is null` and not test mode; records
  `refund_amount = over_paid`, `refund_utr`, `refunded_at`, `refunded_by`; a partial unique index on
  `upper(btrim(refund_utr))`; revoked from public, anon, authenticated, service_role; granted to `frata_admin`. Called from
  `src/lib/admin/billing.ts` behind `adminOnly()`, `auditStaff` in the same transaction with `tenantId` and
  `{payment, amount, utr}`.
- **H2 Fresh passkey for money.** The refund action calls `confirmedRecently(staff)` on the server (as staff/actions.ts)
  and its dialog runs the passkey step first; Record payment, Credit note and Issue get the same check.
- **H3 Today filters by role at the source.** A source table `{kind, roles}` in `src/domains/admin/today.ts`, unit-tested
  per role; a source the caller may not see is never queried (billing, paused codes, staff passkey requests are master
  admin only; trials read through billing are master admin only); each source catches its own error (`errName`); support
  rows link only to pages support can open; Today never lists the caller's own request. Nav counts come from the same
  filtered list.
- **M1 Partner passkey requests across partners** need a new definer (proof and master admin checked; returns partner id,
  name, age only; revokes service_role). Today's list falls back to the Partners count until it exists.
- **M2 Layout counts** only after `staff.ok` and the health check; a failure shows no counts, never throws; React `cache`
  only (never `unstable_cache` or `'use cache'`). The Today page calls `requireStaff` itself.
- **M3 Activity** selects named fields; `detail` rendered from a whitelist per kind; `billing.*` rows and other staff's
  support reasons to master admins only (filtered on the server); inputs through zod (uuid, enum of kinds, an `(at, id)`
  keyset, 50 a page, no `sql.raw`).
- **L1** The refund audit carries `tenantId`. **L2** `STAFF_ROLE_WORDS` is the one label map; `StaffRole`, `ADMIN_ONLY` and
  `value="admin"` do not change. **L3** Every reason a dialog sends is checked with zod on the server; hiding a button is
  never the control.

## Architecture review on the plan (2026-11-15), folded in
- **Today reads only cheap sources; one function, two shapes.** `todayItems(staff)` (Today's list) and `todayCounts(staff)`
  (the nav: count-only projections of the same sources) live in `src/lib/admin/today.ts`; the source table and ranking in
  `src/domains/admin/today.ts` (pure, tested per role). Each source has its own `.catch` (logged with `errName`): a failed
  source reads "uncounted", never 0, and never takes a page down; the layout's counts race a 1.5 s deadline and show none
  when late. React `cache` only, per request. Counts refresh on a full load and after an action (settle); e2e checks a
  count drops after an action. Sources and their reads:
  | Source | Who | Read |
  |---|---|---|
  | Partner passkey requests | master admin | new definer `admin_waiting_passkeys()` (0138): partner id, name, age; never a code |
  | Staff passkey requests (not your own) | master admin | the same definer: email, age |
  | Partners to review | all staff | `partnerCounts` (exists) |
  | Address claims waiting | all staff | `domainsNeedingFrrata` (exists) |
  | Over-paid, not refunded | master admin | `frrata_payments where over_paid > 0 and refunded_at is null` (frata_admin reads it), partial index (0137) |
  | A month's drafts not issued | master admin | `frrata_invoices` drafted for last month, not issued: one count |
  | Trials ending in 3 days, no autopay | all staff (Trials is ANY_STAFF today) | `trialList` filtered |
  | Owners not signed in after 3 days | all staff | `invites` (role owner, not accepted or revoked, older than 3 days) |
  | A theme version new in this deploy | all staff | `themeVersionsForAdmin` (exists) |
  EkCode's paused codes and Infrastructure's alerts stay on their pages (their reads take seconds: a per-store aggregate,
  pg_stat_statements and table sizes); see Deviations.
- **Record refund (0137 + 0138):** columns `refund_amount`, `refund_utr`, `refunded_at` (the bank's date, typed),
  `refunded_by`; a CHECK that all four are null or all set; a partial unique index on `upper(btrim(refund_utr))`. Definer
  `app_record_frrata_refund(p_payment, p_utr, p_sent_on, p_staff)` checks in the database that `p_staff` is an admin,
  locks the row, requires captured, `over_paid > 0`, not refunded, not test; amount fixed at `over_paid`. `refunded_by`
  copies the audit actor on purpose (as `recorded_by` does). `InvoiceDetail.payments` gains `id`. The dialog: "Record a
  refund of ₹1,180" · UTR · date sent · Keep / Record refund; after: the band goes and the payment row says "refunded 14 Nov".
- **Fresh passkey** on Record refund, Record payment, Credit note and Issue: `confirmedRecently(staff)` on the server; the
  dialog runs the passkey step first (the staff page's `ConfirmFirst`).
- **Activity:** keyset `(at, id) < ($at, $id)`, 50 a page; indexes `audit_events (at desc, id desc)` and
  `(actor_user_id, at desc, id desc)` (0137); "kind" = the action's first word from a fixed list (plan, trial, address,
  partner, billing, app, theme, support, staff, settings, order, offer); actions shown as words through one map in
  `src/domains/admin/activity-words.ts` (no raw `module.on`).
- **Apps:** `/admin/modules` → `/admin/apps`, `/admin/merchants/[id]/modules` → `/apps` (old paths redirect); "Asked to be
  told" → "Waiting list"; Admin joins `check:words` with its own rule set (merchant stays an Admin word; module, add-on and
  bare admin banned); e2e 45 follows.
- **Themes:** only the existing actions move (Release primary, Recall and Withdraw in More); no new theme work (ADR-0014).
- **Flow number:** `91-neel-admin.mjs` (89 is taken).

## Speed review on the plan (2026-11-15, 10× seed: 5k shops, 2M audit rows), folded in

- **H1 no transaction around Today.** The readers call `adminDb()` themselves; a transaction in the layout and another
  in the page would hold both of Admin's two connections and deadlock. Plain parallel reads, one gather per person per
  request (`todayItems`, React cache keyed by user id), shared by the nav counts and the page.
- **H2 themes source reads `theme_versions` only** (21 rows, 0.03 ms) and diffs it against the build's manifests; the
  full read (every shop's publishes, 257 ms) stays on `/admin/themes`.
- **M1 trials source is one join** of open trials without autopay (5.9 ms), never the Trials list (4 statements, 99 ms).
- **M2 Activity indexes ascending** (`(at, id)`, `(actor_user_id, at, id)`, `(split_part(action,'.',1), at, id)`),
  scanned backward; `audit_events_at` dropped (superseded). The keyset uses the row comparison `(at, id) < ($at, $id)`.
- **L1** partial index `partner_passkey_requests_open` for the passkey definer.
- EkCode, Email and Infrastructure have no count slot at all (`TodayArea`), so the nav can never wait on them.
- The layout runs `requireMember` and the counts together.

## Scalability, reliability, motion
- **Scalability:** Today's nine reads are counts or short lists over indexed columns; at 500 merchants each stays under
  20 ms (speed-reviewer EXPLAINs them at 10×). Activity is keyset-paged on indexes.
- **Reliability:** a failed source is "uncounted", never 0 and never a broken page; actions keep their own refusals; the
  refund definer is idempotent on the UTR (a second try with the same UTR is refused at the field).
- **Motion:** the Dialog and sheet primitives as they are; no new motion.

## Out of scope (signal that brings it back)
Assigning, snoozing or marking Today items done (two staff stepping on one task); EkCode and Infrastructure in Today (a
cheap count of paused stores or Now alerts); moving money from Frrata (the CA and the owner).

## Tasks (each ends with its verify)
1. Shared parts, nav, Today (`npm test`, typecheck, flow 91 Today + counts). 2. Migration 0137/0138 (`verify:tenancy` with
new proofs). 3. Records and lists as drawn, screen by screen (flow 91 per screen; the existing Admin flows). 4. Apps and
Master admin words, check:words over Admin (`npm test`). 5. Phone (flow 91 at 390). 6. Reviews, parity, skill, ship.

## Practices recorded in skills
frata-design-language § Neel Admin (the nine rules), the glossary (Master admin; Apps everywhere); frata-architecture (Today
sources and the "uncounted" rule; money actions need a fresh passkey).

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Keeping "module" out of every surface's words | check:words over Admin too |
| A new waiting task reaching Today | one row in the source table, tested per role |

## Design review
- **UI/UX:** one primary per header; the waiting task as a band; tabs; forms only in dialogs; destructive in More with a
  reason. States: empty Today ("Nothing waits."), a support person sees the band without the action ("A master admin
  decides"), phone (two pages, sheets), error (the shared error page).
- **Tenancy:** Admin is the one cross-tenant surface (ADR-0007) and reads through `frata_admin` in `src/lib/admin/`; Today gathers existing reads, except partner
  passkey requests across partners (a new definer, M1 below). The refund columns sit on `frrata_payments` (Frrata's own table, admin
  grants as today). `tenancy-auditor` on the plan and the diff.
- **Modularity:** pages compose; reads in `src/lib/admin/`; the ranking pure; shared parts in `_components`.
- **SSOT:** the Today list and the nav counts come from one function; each waiting fact is computed where it is today.
- **YAGNI:** no assignment, snooze or "done by" on Today; no new roles. Signal: two staff stepping on one task.
- **KISS:** Today is a list of links into existing pages; every action happens where it does today.
- **Performance:** Today runs ~10 small reads in one `frata_admin` transaction, pipelined; nav counts cached per request
  (React `cache`), never across staff. `speed-reviewer` on the diff with EXPLAIN at 10×.
- **Security:** every action keeps its role check (`ADMIN_ONLY` → master admin); Record refund is master admin only,
  passkey-confirmed like other money actions; dialogs never move a check client-side. `security-reviewer` on the diff.
- **Unit economics:** none (no fee or price moves; a refund record only).
- **Blast radius:** every admin page and the layout; e2e flows touching `/admin` (grep), the gate's words, the console's
  Apps words, emails naming modules.

## Regression net first
Flows that open `/admin` (grep `/admin/` in e2e) run before any change; new `89-neel-admin.mjs` (Today, nav counts, a
merchant's band and tabs, a dialog, Record refund, Activity filter, phone) written first.

## Reviews on the diff (2026-11-15), folded in
- **Security** (safe to merge): money dialogs now confirm a passkey when the server asks and send the same form again
  (`confirm: true` on the dialog spec); the refund's audit row carries the store and the bank reference; a malformed
  Activity page link is ignored, not a crash.
- **Impact:** Merchants' In trial and Live come from the derived trial state and the store's first opening
  (`trialAndLiveIds`, one `trialView` mapping for Merchants, Trials and Today); the refund refuses a day before the
  payment arrived, and the proof (83) now holds every refusal; a vitest proves each money action refuses a stale passkey
  check before any money moves; a test invoice is never "paid too much"; Today's items carry a short `need`, the IST
  month comes from `src/domains/time/month.ts`, the counts are dropped when a source failed; a store's Activity keeps
  its tabs; `isMasterAdmin` is the one role test in the pages this phase touched.
- **Speed:** Activity's kind filter reads the stored `audit_events.action_word` (one ordered read per word, merged):
  `split_part` is not leakproof, so its expression index was never used under frata_admin's policy (2.4–3.8 s at 10×).
- **Design system:** a dialog's refusal sits above its buttons (`DialogError`); money and counts in `font-num`; a field
  message under every dialog field; folds padded; Button and Tag primitives; 24 px targets; bands labelled by their own
  fact, radius by role; literal sizes gone.
- **Words:** confirms name what stays and what goes; buttons name their thing; "master admin" everywhere; Rule 0 cuts.

## Deviations (proposed; owner sees them before ship)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Today's "Outbox has 214 waiting" row, and EkCode's paused codes | Not on Today or in the nav counts; each keeps its own "Needs you" on its page | Their reads take seconds (pg_stat_statements, table sizes, a per-store aggregate); on every Admin page they would slow all of Admin | — |
| "Modules" in the nav, Merchant, Merchants and Reference boards | "Apps" | Owner, 2026-11-15: "It'll be Apps. across the whole ecosystem." | Yes, 2026-11-15 |
| Staff role "Admin" | "Master admin" | Owner, 2026-11-15: "keep master admin for frrata admin" | Yes, 2026-11-15 |
| Record refund (no dialog drawn) | A dialog: the amount fixed at what was over-paid, UTR, date sent; Keep / Record refund; a fresh passkey first | The board drew the band's button only; the fields are what a refund record needs | — |
| Names tab "Recently released" | "Held" | The list is names a store's past still holds (released only when a master admin releases one); "Recently released" would say the opposite | — |
| A claim band: "Studio Kaaru uses it as its main address" | "Another store uses it as its main address" | Admin's domain read names the claimant only; naming the holder needs a second read per claim | — |
| Apps row "· in Growth" | "· in plans" | The registry says a plan app is in some plans, not which; naming them needs the plan versions' features per app | — |
| Billing month as a select that changes the page | A select and Show | No client script on Admin's server page for one control | — |
| A partner's passkey band: Approve passkey in the band | Approve passkey opens the Passkeys tab, where the code is typed | The approval needs the owner's code read aloud and a passkey check (the existing panel); the band names the call to make | — |
| Plans as rows (the feature matrix gone) | As drawn: one row a plan, Edit opens its page | Built as drawn; which apps a plan includes is on the plan's own page | — |
| Activity filter chips | Two selects (Person, Kind) and Show; a store chip when a merchant's Activity tab opened it | No client script for the filters | — |
| Trial card "no autopay yet" on a merchant's Plan tab | Not shown | The plan page reads the trial's facts; autopay is on Trials and Today | — |
