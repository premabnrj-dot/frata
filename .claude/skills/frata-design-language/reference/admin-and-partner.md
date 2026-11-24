# frata-design-language — Admin and the partner workspace

Part of `frata-design-language` (SKILL.md holds the rules every screen obeys: Rule 0, Words, tokens, feedback).
These sections are the owner-approved rules of one surface; they are moved here unchanged (practices plan G4).

## Contents

- Frrata Admin, one job at a time
- Frata Admin
- Partner workspace

## Frrata Admin, one job at a time (Neel N4, owner-approved 2026-11-15; mockup https://claude.ai/artifact/YPGo8SV7vqNu9vyCp5vCSQ, `docs/mockups/2026-11-15-neel-admin/`)

The nine rules (board Rules), binding on every Admin screen and mockup:
1. **Today first.** Admin opens on what needs someone, oldest first, one action each (`src/domains/admin/today.ts`,
   filtered by role at the source). The nav counts the same items; a source that can't be read is left out, never 0.
2. **A waiting task leads its page**: one band under the header (`_components/needs-band.tsx`), its one action; it goes
   when the task is done.
3. **One job in view**: a record's other parts are tabs; a list opens on "Needs you" when something waits.
4. **One primary**: the header holds the title, at most one primary and More.
5. **Forms open when asked**: add, edit and change open a dialog from a button (`_components/form-dialog.tsx`). No form
   stands open on a page.
6. **Rare or final actions go in More**, each asking in a dialog with the reason the other side reads.
7. **Reference folds**: tables looked at now and then sit behind Show (Infrastructure's `Fold`); counts that matter stay open.
8. **Your own request says who approves it** ("Another master admin approves it"); never a button that would fail.
9. **On a phone** the list and the record are two pages and dialogs are sheets.

- **The role is "Master admin"** (owner, 2026-11-15) wherever a person reads it; the stored role stays `admin`.
  `STAFF_ROLE_WORDS` and `isMasterAdmin` (`src/domains/tenancy/staff-words.ts`) are the one place for both.
- **Activity says actions in words** (`src/domains/admin/activity-words.ts`), never `module.trial`.

## Frata Admin (owner-approved, 2026-11-06)

- **Admin looks unlike the console**: dark ink navigation with a "STAFF" tag
  (`bg-warn text-warn-text`), so no one mistakes where they are. Same tokens,
  same tables, same Panel; only the frame differs.
- **Support mode** is a full-width banner above every console page: whose
  store, the reason, time left, "Back to Admin", "End now". It cannot be
  dismissed and uses a solid dark amber with white text (≥ 4.5:1).
- **A button that acts on a merchant names them** ("Move Kesar Studio to Scale"), except **"Open console"**, which
  sits on the merchant's own page or row and stays short (owner, 2026-11-15); cancel names the safe outcome
  ("Stay in Frrata Admin", "Keep Growth"). Never "Continue" or "OK".
- **A plan price is shown with its version**, and a change says what moves
  ("orders included go from 1,500 to 5,000") before it is confirmed.
- People who are staff and store members choose where to go after sign-in;
  Admin always links to their own store's console and the console links back.

## Partner workspace (approved mockup 2026-11-07)

- `/partner` uses the console's `AppShell` with `tag="PARTNER"` (info pair).
  Admin keeps ink + STAFF. Nav: Clients, Team (owner), Passkeys, Developer, Your details.
- A store with no owner shows the **building banner** (info pair, sticky, one
  line: "Building for <shop> · No owner yet · Hand over") on every console page. Hand over is a link (a full page
  load) to Clients, where the dialog asks for the passkey (T1b).
- **Partner sign-in** (approved mockup 2026-11-15, `docs/specs/2026-11-15-partner-login.md`): every sign-in screen sits
  on `PartnerFrame` (ink stage, the mark, a PARTNER pill, the selvedge, one card); headings `text-title`. One code box
  (paste and `one-time-code`), never split digit boxes. A code read aloud is `ReadCode` (mono, dashed box, an sr-only
  spaced copy). First time shows `JoinSteps` (Join · Approval · Passkey). Each gate screen moves focus to its heading.
- **Approving someone's passkey**: the approver makes the call. The card shows who, device, where and when; asks "Did you
  start this call yourself?" (Segmented, no default); No turns Approve off and offers Decline with "Hang up and call …
  on a number you know." A passkey is named by its password manager, never a device model.
- **A check that lasts 12 hours** warns 10 minutes before with a warn `Banner`, then asks in a Dialog over the page
  (nothing typed is lost) with Sign out beside Use passkey. A step that needs a fresh check asks only when the last one
  is older than 5 minutes (`freshly`).
- Client stages are derived (`src/domains/partners/stage.ts`) and shown as
  badges with words: Building, Invite sent, With the owner, Open, Removed. A
  removed store is dimmed with colour and has no actions.
- **Builders** (T1c, approved mockup https://claude.ai/artifact/LnwWWrV37oQgbnfmc5bvFP, owner 2026-11-15): a role's
  console shows only what opens for it (nav drawn from its capabilities): a Builder's is Catalogue › Products,
  Collections; Preview store and Partner workspace at the foot; the phone bar Products · Collections · Preview. Its lists
  are the owner's, view only (no selection, Add, Import or More); a row opens the store preview. A page it can't open is
  that page's own panel, "Builders can’t see this page." with a lock tile and Open products. Team's invite asks the
  Role (Lead · Builder) with two lines of what it reaches; each person has a Role select; a Roles card (Partner owner ·
  Lead · Builder) says what each sees in a store. The brand's People shows "Partner · Builder" with an (i).
- **Clients** (P2, owner-approved mockup v2 2026-11-15, https://claude.ai/artifact/5ieqhb31Prax22Xe2UTtPX): one job in view.
  The list is Client (a link to its page, the address under it) · Stage · Next (words: "₹12,000 overdue · 11 days",
  "Waiting 4 days", "Next bill 28 Nov") · the next step's one button beside the link (Hand over, Remind, Record bill) ·
  Your billing (the deal's amount). Tabs (Needs you, only while it holds rows · Waiting on the client · All) and search
  only from 9 clients; below that, one list ordered by who acts. A Lead sees Client · Stage · Next, no money; a Builder
  Client · Stage · Open store. A client is a PAGE (`/partner/clients/<link>`), not a drawer: back to Clients, the next
  step as the header's primary, More (Edit content, Website keys), tabs Your billing · Store (dates and the share as
  `Facts`; the share reads "20% · ends <date>" while `SHARE_IN_RUPEES` is off). Remind opens WhatsApp on the partner's phone with the drafted words and no number; Frrata sends nothing.
  The partner's billing carries one line, "Your client never sees this". A removed client stays last in All, dimmed,
  and its page keeps billing (a final bill may be owed).
- **The Studio workbench** (owner-approved 2026-11-22, `docs/mockups/2026-11-22-studio-workbench.html` screen 1;
  shell built on fixtures, WB·3): three regions, each a named landmark: Chat (340 px, 280–480), Preview, Inspector
  (320 px, 280–440; Design, Code, Checks, Versions). Each side folds to a `PanelRail` and resizes by its `ResizeEdge`; a
  panel never opens by itself (picking a part of the preview or a tab key is asking). The layout is kept in the browser
  only (`src/domains/studio/layout.ts`, read safely; the defaults draw without it); under 900 px the inspector starts
  folded. Keys from one table: `[` chat, `]` inspector, `\` Preview only, F6 the next region, 1–4 a tab, `?` the list
  with the console's one switch for single keys; never in a text box. A phone shows one region from its bar (Chat,
  Website, More: Design, Checks, Versions), no Code tab. The agent's progress goes to one polite region, once a step. Code, Checks and
  Versions load with next/dynamic; no diff or highlight library.
- **Developer** (G·3, four screens § 2, owner-approved 2026-11-22): the person at the terminal confirms their OWN code.
  Two cards: Sign in this computer (one field "Code from your terminal", mono, capitals; Check code) and Your computers
  (store, a Build tag, "Confirmed <momentIN> · ends in 21 hours", Delete key). Mistakes stay at the field ("Type the 8
  characters from your terminal.", "This code has ended. Run the command again for a new one." for ended, used or not a
  client's, "Too many tries. Wait a minute."). The confirm dialog lists Store, Code, Started (with an ok chip "Your
  network" or a warn chip "Another network") and The key, with "Frrata never asks you for a code." From another network,
  or one Frrata can't tell, "Don’t give key" is the primary button and a checkbox "This is my computer" must be ticked
  before Give key turns on (owner, 2026-11-22; the server refuses it too). Give key asks for the passkey there and then; a store at its limit or a person
  with no passkey turns Give key off with its reason. A Builder's page is one panel: "Only a Partner owner or a Lead can
  sign in a computer."
- **F3 store switcher**: in the account block at every width and in More on
  phones, only with two or more places to go; it lists what app_access_for
  returned, current one marked.

Two surfaces, two looks. **The console is neutral, dense and numeric. The
fashion lives in the storefront.** Patterns below are taken from Ekatan's admin
(its `ekatan3d-design-language`) and Shopify's admin, which merchants already know.

## Admin › Costs (owner-approved 2026-11-23; mockup https://claude.ai/artifact/MEoxVFhu7EUHpfzbA8obvA, `docs/mockups/2026-11-23-admin-costs.html`)

- Master admin only; support staff see a panel, never a hidden button. Three tabs (Overview, All costs, Payments), one primary (Add cost) and Export CSV.
- A due or overdue cost leads the page in a `NeedsBand`; every due row has one action, **Mark paid**, opening a prefilled dialog. A cost opens in the shared quick look by `?id=` (a page of its own on a phone), the list stays usable and ↑ ↓ move to the next cost.
- A cost that varies shows "about" and a `varies` tag; its Mark paid opens on the amount. A dollar cost shows dollars, and rupees where a person reads a total.
- Add is one dialog with a Repeats or Once switch. A payment's Undo is a toast action.

## Admin › Cashflow (owner-approved 2026-11-23; `docs/mockups/2026-11-23-admin-cashflow.html`)

- Master admin only. Tabs Overview, Movements, Accounts; one primary (Update balance). The chart shows six months, the last marked "*" for so far, in `bg-chart` and `bg-warn-mark`.
- A typed balance shows "Our books say" and "Difference" in an always-mounted `role="status"`; zero is a "Matches" badge. Planned entries are dimmed and carry their own Mark received or Mark paid.
- Shared by Costs and Cashflow: `admin/_components/field-parts` (Row, Day, Money) and `admin/_components/chip-link` (`aria-current="page"`).
