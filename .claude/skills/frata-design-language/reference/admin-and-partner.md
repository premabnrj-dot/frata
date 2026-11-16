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
  Admin keeps ink + STAFF. Nav: Clients, Team (owner), Passkeys, Your details.
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
- **F3 store switcher**: in the account block at every width and in More on
  phones, only with two or more places to go; it lists what app_access_for
  returned, current one marked.

Two surfaces, two looks. **The console is neutral, dense and numeric. The
fashion lives in the storefront.** Patterns below are taken from Ekatan's admin
(its `ekatan3d-design-language`) and Shopify's admin, which merchants already know.
