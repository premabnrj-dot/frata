# Admin decisions: Themes, Plans, Modules
Status: draft · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/JeeEyUsudGYV6NtturRXkq (`docs/mockups/2026-11-11-admin-decisions.html`) · Approved: —

## Goal
North star (7) festive-peak reliability and (6) true profit per order, through Frrata's own operations. A wrong or
stuck staff decision reaches every shop at once: a withdrawn theme, a paused module or a mispriced plan changes what
shops show and pay. Measures: no Admin request reaches Vercel's 60 s limit (`get_runtime_logs`, `level=error`, path
`/admin`); every destructive decision names the shops it touches before it happens; every write is one round trip
with visible progress.

## Job
Frrata staff decide who may use a theme version, what each plan costs and includes, and which modules run. Each
decision must show its reach before it happens, and must answer at once.

## Root causes found (owner, 2026-11-11: "other modules the issue continues")

| What staff saw | Cause | State |
|---|---|---|
| Themes, Offers and the Signal 1.4.0 page time out at 60 s after the Merchants fix | Every timeout since the fix ran on deploy `0bee838` (`dpl_4w7u…`), which has no fix. An Admin tab opened earlier keeps calling the code it loaded with. The fixed deploy `d97c951` (`dpl_AKSa…`) has logged no errors (Vercel runtime logs, 20:11–20:40 UTC) | Fixed in `d97c951`. A hard reload moves a tab onto it |
| A click on Release, Stage, Pause or Give trial looks dead for seconds | A server action and its `redirect()` are two invocations in series (auth, `accessFor`, a fresh connection, the write, then the whole page again), and nothing on screen moved meanwhile | AD·0: pending button + top bar. AD·1: answer in place, one invocation |
| Each Admin page slow before anything shows | The layout asked Supabase Auth and `app_access_for` twice (`requireStaff`, then `requireMember`) | AD·0: one shared lookup per request |
| Give trial holds a lock while opening 3 more connections | `giveTrial` read through `adminDb()` (a new connection outside a render) inside its own transaction | AD·0: reads on the transaction |
| Themes heavier as shops autosave | Every draft revision of every shop read into memory to find each shop's live version | AD·0: publishes joined to revisions in SQL; `liveOf` still decides |
| A bad form or a support click bounces to the list with no word | Actions redirected silently on refusal or a parse failure | AD·0: the page says what went wrong |
| Support could move a shop's plan and set a custom price | `changePlanAction` allowed `ANY_STAFF`; Admin writes are admin-only | AD·0: `ADMIN_ONLY`; support sees the plan, not the form |

Speed at 10× (speed review 2026-11-11): every page renders in 30–215 ms on the server and loads 110 kB of JS. The
pages themselves are fast; the cost is the round trips each action adds.

## Research
- **Stripe dashboard** (Products › Prices): a price is never edited; a new price is added, the old one stays visible
  with its subscriptions, and moving customers is its own step. Taken: versions stay visible with their shops; "Move
  N to vN" is an action on the old version.
- **Shopify admin** (theme library): the live theme, drafts and their publish history; destructive actions sit
  under a menu and confirm with what happens. Taken: More menu for Recall and Withdraw; a dialog that states the reach.
- **LaunchDarkly** (flag rollouts): staged targeting to named contexts before "everyone", and an audit trail on the
  flag. Taken: the version's road (In code → Pilot → Released → Recalled or withdrawn), multi-shop staging, History.
- **Linear** (settings changes): the action answers in place with a toast; nothing reloads. Taken: answer in place.
- Code already has: `liveOf`, `versionState`, `releaseProblems`, `auditStaff` (`audit_events`), `moduleAccess`, `PageHeader`,
  `Dialog`, `Menu`, `Toast`, `NavProgress`. Nothing new is needed below the UI except four reads (see Performance).

## Design (mockup views)
**Across all three (AD·1):** a write answers in place: the action returns `{ ok, message }`, the page revalidates its
path, a toast says what happened and the form keeps its values on an error. A broad or final decision opens a dialog
(a sheet on a phone) titled with the question, showing **who it touches** (a count in mono, the first names linked,
"and N more"), the required reason, and two buttons: the safe one names what stays ("Keep Signal 1.4.0"), the other
names the act and its reach ("Withdraw from 14 shops"). Destructive acts move under More. A shop name links to the
shop. A 404 keeps the Admin frame.

**Themes (AD·2).** The list is one row per theme: shops live, a bar of how they spread over versions, and each
version as a chip with its state. "Needs you" lists a version new in this deploy with "Stage to shops". A version
page shows its road, one primary action for its state (In code: Stage to shops; Pilot: Release to everyone; Released:
none), Release disabled with its refusal as a tip when `releaseProblems` would refuse it, the shops (live on it, on
older versions, pilot), what changed since the previous version, and History from `audit_events`. Staging picks
several shops in one dialog.

**Plans (AD·3).** One card per plan: the current version's terms, then every version with its shop count, an old
version offering "Move N to vN". A new version is a form beside a live diff ("Orders included 2,000 → 3,000"), a
required reason, and "Save Growth version 3". A shop's Plan tab sits inside the merchant frame with no plan chosen by
default; choosing one shows the diff from today's plan and the last 30 days' delivered orders; the button names the
shop, the plan and the day. Words: "Free trial" (a shop's Frrata trial), "Sign-up trial" (terms for new shops),
"Module trial" (30 days of one module); never "trial" alone.

**Modules (AD·4).** The list adds "Shops using it". Pause opens a dialog with the shops affected and the messages
waiting now. A paused module shows who paused it and why, with Resume as the primary action. A shop's Modules tab
shows a platform pause as a banner, "Usable" with its reason in words ("No · shop turned it off"), and per-row
actions under More that name the shop ("End Kesar Studio's Reviews trial…", with a required reason).

## Phases
| Phase | What | Mockup |
|---|---|---|
| AD·0 | Root-cause fixes above. Bug fixes, no new screens | none (fixes) |
| AD·1 | Answer in place (`useActionState` + `revalidatePath`), `ConfirmDecision` dialog with reach, Admin `not-found` in the frame | this mockup |
| AD·2 | Themes: moved to the themes planning session (owner, 2026-11-11); the mockup's Themes views are input to it, not a plan here | — |
| AD·3 | Plans versions, new-version diff, the shop Plan tab, trial words | this mockup |
| AD·4 | Modules counts, pause dialog, shop Modules tab | this mockup |

## Design review
- **UI/UX:** one primary action per state; destructive acts under More, confirmed with their reach; feedback after
  every action (pending, then a toast); constraints over refusals (Release disabled, not refused afterwards); the
  staff member's model (shops, versions, plans), never table names. States: empty ("Nothing new in this deploy" as
  an empty Needs you, no card), loading (button pending + top bar; lists dim), error (toast stays, values kept), one,
  many ("and N more", paged at 50), no permission (support reads every page, sees no form), phone (stacked rows,
  sheets). Keyboard: a dialog traps focus and Esc keeps the current state.
- **Tenancy:** Admin only, through `frata_admin` in `src/lib/admin/` (ADR-0007). No tenant id from a body except the
  shop an Admin decision is about, as today. No new table.
- **Modularity:** reads in `src/lib/admin/{themes,plans,modules}.ts`; actions in each route's `actions.ts`; the
  dialog in `src/components/ui/`. `liveOf`, `versionState`, `releaseProblems`, `moduleAccess` stay the only rules.
- **SSOT / DRY:** live counts come from `liveOf` (not a second SQL rule); History reads `audit_events`; shops using a
  module derive from `moduleAccess` facts. Nothing new is stored.
- **YAGNI:** no scheduled release, no percentage rollout, no undo of a final decision (a new version is the fix). They
  come back if staff stage more than 20 shops a version.
- **KISS:** one dialog component, one action-result shape, four reads.
- **Scalability:** at 500 shops, a version page lists 50 shops a page; counts are grouped in SQL.
- **Performance:** reads added: shops per version (one grouped query over publishes ⨝ revisions, by tenant), module
  users (one grouped query over `tenant_modules`), waiting messages per module (one count on `outbox` by kind, which
  `frata_admin` cannot read today: AD·4 needs a definer returning the count only, `app_admin_outbox_waiting(kinds)`),
  30-day delivered orders for one shop (existing `app_admin_order_counts`). Writes revalidate their own path only.
  Admin JS stays under 150 kB (the dialog is already in the bundle).
- **Reliability:** no outbound calls. A pause holds outbox rows; none are lost (`outboxDecision`).
- **Security:** every action `ADMIN_ONLY`, Zod-parsed with length caps, audited in the library as today; the shop
  ids in a multi-stage are checked to exist; replies carry a message only. Reasons render as text.
- **Motion and visuals:** dialogs and sheets use the existing enter (320 ms) and exit (200 ms); lists dim while
  pending; reduced motion fades. Pictures: the version road, the spread bar.
- **Unit economics:** none directly; a plan diff shows staff the money a move changes before it happens.
- **Blast radius:** the Admin layout (identity lookup, shared with the console's `requireMember`), `adminDb()`,
  every Admin form (`Submit`). Covered by `role-once.test.ts` and the Admin e2e flows.

## Out of scope
Studio theme versions (TS2 brings its own), billing, Offers and EkCode screens (they get `Submit` and in-place answers
in AD·1 only), Admin roles beyond admin/support.

## Facts used
None third-party. Vercel runtime logs read 2026-11-11 20:39 UTC.
