# Passkeys off from Admin › Staff: the task plan (lane D)
Status: active, built on `claude/lane-d-passkeys-off`; released by the orchestrator after the reviews below.
**Mockup:** https://claude.ai/artifact/XgZaLXACLGze8bcv4ZGztn (`docs/mockups/2026-11-23-admin-passkeys-switch.html`, at 4e51273)
**Approved:** owner, 2026-11-23 ("passkey switch mockup approved."; the four calls as recommended)
**Review:** security-reviewer SAFE (1 medium, fixed; 3 low), 2026-11-23
**Review:** tenancy-auditor SAFE, no cross-tenant path (4 medium, 2 low), 2026-11-23
**Review:** words-reviewer 3 rewrites, applied; mockup-parity-reviewer PASS after the phone-row fix (11 present, deviations 1 and 3 covered); impact-reviewer FIX BEFORE COMMIT, fixed (1 high, 3 medium), 2026-11-23
Migrations: `drizzle/0170_passkeys_off.sql` (generated) and `drizzle/0171_passkeys_off_access.sql` (custom). Proof:
`scripts/verify/tenancy.sql` § 88, § 88 (cont.), § 91.

## Why (the owner, 2026-11-23)

"it's too early for passkeys in the system, let it be just email and password login … just wish to get started for now"
and, approving lane G's passkey plan the same day, "give me option to switch off passkey when I feel so". There is no
password sign-in: off means an email code alone (orchestrator rule; no password is added).

## What it amends (owner amendment, 2026-11-23)

While passkeys are off, each rule below is suspended. While they are on, each holds exactly as written:
- **ADR-0007:** the 2026-11-12 amendment (staff passkeys) and the 2026-11-16 amendment (the switch, at most 30 days).
  From Admin › Staff the switch has no end date (`platform_switches.until` null). The 30-day cap stays for a row
  with an end.
- **ADR-0015:** a partner person's check.
- **ADR-0020 § 4–5:** Studio's door and each turn ask for both step-ups.
- **G·3 finding:** Give key needs a passkey made for that one code. While off it is given with none
  (`app_device_code_give_off`). The network check, the Builder refusal and the store's ceiling stay.
- **C1's H1 rule:** credits writes with real money need a real check.

Kept while off (the owner's call 4): passkey management keeps the real check. That covers listing your passkeys, adding
one and removing one, so no passkey can be made with an email code alone. Those screens say "Passkeys are off".

## The one function

`app_passkeys_off()` (drizzle/0151, redefined in 0171) is the switch's only meaning, and every gate asks it:
- `app_access_for`;
- `app_partner_need` (`app_partner_need_real` does not ask it);
- `app_staff_list`;
- `app_pc_owner`;
- `app_handover_invite`;
- `app_studio_proved` and `app_studio_partner`;
- `app_device_code_give_off`.

The app reads the state through `passkeys()` (`src/lib/auth/session.ts`, `app_passkeys_state()`), once per request.
Lane G builds on top of it.

## Built

| # | What | Where |
|---|------|-------|
| 1 | `until` nullable; the turn keys' step-up columns nullable | 0170, `schema-staff.ts`, `schema-studio.ts` |
| 2 | The switch: a master admin's own passkey within 5 minutes to turn off, none to turn on; audit names them | 0171 `app_admin_passkeys_set`, `src/lib/admin/passkeys.ts`, `admin/staff/actions.ts` |
| 3 | The Passkeys row on Admin › Staff, the dialog; Support staff see the state only | `admin/staff/passkeys-switch.tsx`, `page.tsx` |
| 4 | The banner on every Admin page; its button for a master admin | `admin/layout.tsx` |
| 5 | Studio: no step-up cookie while off; the entry skips 1b and 1c | `src/lib/studio/with-studio.ts` |
| 6 | Give key while off: one step, no passkey | `developer/actions.ts`, `developer-parts.tsx`, `lib/db/device-codes.ts`, `lib/storefront-api/device.ts` |
| 7 | Credits real-money writes, handover, staff list follow the switch | 0171 |
| 8 | Staff confirm dialogs ask the server first; prompt only on `STAFF_CONFIRM_FIRST` | `admin/staff/staff-passkeys.tsx` |

An open Studio session made while off holds no step-up. When passkeys come back on, it ends at its next tool call
(`app_turn_actor` finds no person). Orchestrator, 2026-11-23: "that is the right direction". Proof § 91 tests it.

## Deviations (for the owner; the orchestrator records "owner seen" at merge)

| # | Mockup | Built | Reason |
|---|--------|-------|--------|
| 1 | The dialog and call 2 say "an Admin" | "a master admin" | The owner's 2026-11-15 rule: the role reads Master admin (check:words W6) |
| 2 | Partner › Passkeys and Admin › Partners › Passkeys are not drawn | While off, each shows the panel "Passkeys are off" (the banner's words) | Without it both fail with "We couldn't load this screen": listing passkeys keeps the real check |
| 3 | Admin › Staff's person panel is not drawn while off | While off, Add passkey, Remove passkey and the request bands are hidden | Call 4: no new passkeys while off, and nothing asks for one |
| 4 | Off state: the banner and the row both offer "Turn passkeys on" on the Staff page | Built as drawn (both) | Open wording question; the owner did not rule (orchestrator 2026-11-23) |
| 5 | Give key's dialog while off is not drawn | The same dialog; Give key needs no passkey and "Add passkey" is gone | "Off" means off everywhere (call 1) |

## Applying

Apply 0170, then 0171, each in its own transaction. They need not share one, but the code needs both, so release only
after both. `scripts/prod-migrate.mjs` prints each file's SQL and drizzle row.

## Reviews

**security-reviewer, SAFE.** Nothing lets anyone skip or make a passkey while passkeys are on.
- MED, fixed: turning passkeys off emailed no one. Off and on now email every master admin (`app_staff_notify`, kinds
  `passkeys_off` and `passkeys_on`; proof § 88b).
- LOW, fixed: the proof read the code instead of calling it. § 88b now calls the Studio and staff-list doors while on.
- LOW, owner informed: a Build key given while off lasts its 24 hours, and a handover invite its 14 days, after passkeys
  are on again.

**tenancy-auditor, SAFE.** A rollback-only probe while off found no path to another store's or partner's rows. That
covered Studio binding, Give key, the staff list and handover.
- MED, owner informed: while off, the database trusts the server's signed-in user and session for a Studio bind, as
  `app_access_for` does for every request while off. Supabase verifies both (`getClaims()`); no step-up row backs
  them. The suggested `auth.sessions` check would make the local proof and e2e stack copy Supabase's session table.
  Not built.
- MED, owner informed (both reviewers): while off, signing out does not end a Studio turn already running. It still
  ends at its next check once passkeys are on, when the person loses their staff place, store or partner, or at its
  ceiling.
- MED, the owner's call: handover follows the switch. The approved mockup's call 1 names handover ("That covers Admin,
  the partner workspace, money and team actions, handover, Studio and Give key").
- MED, fixed: the proof gained Give key while off, an off-made Studio turn, the emails and the while-on refusals.
- LOW, kept: `app_passkeys_state` gives `frata_app` the master admin's email. It is read on the server; only Admin
  renders it.
- LOW, fixed: ADR-0020 § 4–5's text is amended, and so are ADR-0007 and ADR-0015.

**words-reviewer.** Three rewrites applied: the action's error, and both email subjects ("… for all staff and
partners").

**mockup-parity-reviewer.** At phone width, the row's button covered "since … by …". The state text now keeps 12rem, and
the button wraps under it. Flow 100 asserts they don't overlap. Every other drawn element is present.

**impact-reviewer.** Fixed:
- ADR-0018's Give key text is amended.
- "Turn passkeys on" says why when it fails.
- One confirm helper (`confirmWhenAsked`, form-dialog.tsx) and the `STAFF_CONFIRM_FIRST` constant.
- Tests for `setPasskeysAction` and for `passkeysState`'s fail-safe.
- docs/setup.md points here.
- The storefront-api skill is bumped to 2.8.0.

Kept: `passkeys()` is one cached read a request. Folding it into `app_access_for` waits for a speed review that asks.

**e2e.** Flows 75, 80, 97, 98 and 99 run with passkeys on; flow 100 runs the off path end to end: 54 of 54 steps green.
After the phone fix, flow 100 ran again: 6 of 6.
