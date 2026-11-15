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
   main's next free one; lanes A/B hold 0133–0136). One definer-free update through `frata_admin` in `src/lib/admin/billing.ts`,
   master admin only, the UTR unique, audited; the band goes when refunded. No money moves through Frrata: it records what
   was sent from the bank.
3. **Activity filters and pages** — `listActivity(staff, { tenant?, actor?, kind?, before? })`, keyset pages of 50 over
   `audit_events (at desc)`; an index if EXPLAIN asks.
4. **Master admin / Apps words** — `src/lib/auth/staff-roles.ts` (or the existing label map) owns the role's words.

## Design review
- **UI/UX:** one primary per header; the waiting task as a band; tabs; forms only in dialogs; destructive in More with a
  reason. States: empty Today ("Nothing waits."), a support person sees the band without the action ("A master admin
  decides"), phone (two pages, sheets), error (the shared error page).
- **Tenancy:** Admin is the one cross-tenant surface (ADR-0007) and reads through `frata_admin` in `src/lib/admin/`; Today
  adds no new reach, only gathers existing reads. The refund columns sit on `frrata_payments` (Frrata's own table, admin
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

## Deviations (proposed; owner sees them before ship)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
