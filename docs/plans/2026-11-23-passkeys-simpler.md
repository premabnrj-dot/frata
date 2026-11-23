# Passkeys, simpler: the task plan (lane G)
Status: active · Date: 2026-11-23 · Spec: `docs/specs/2026-11-23-passkeys-simpler.md` · P0 building.
**Mockup:** https://claude.ai/artifact/85e3WTLUVDFYjMnJYC2JG4 (`docs/mockups/2026-11-23-passkeys-simpler.html`)
**Approved:** owner, 2026-11-23 (mockup version 2; call 8 reversed, the switch stays)
**Review:** security-reviewer FIX THE SPEC (2 high, 5 medium, 2 low; all folded into the spec), 2026-11-23
**Review:** tenancy-auditor FIX BEFORE BUILD (no leak; 4 high, 2 medium, 1 low; all folded in), 2026-11-23
**Review:** architecture-reviewer CHANGES NEEDED (2 blockers, 8 major; all folded in), 2026-11-23
**Review:** words-reviewer 30 lines rewritten in the mockup, 2026-11-23
**Review:** speed-reviewer not run, parked before it was due, 2026-11-23
**Review:** impact-reviewer P0 FIX BEFORE COMMIT (1 medium, test gaps; fixed in 38cb932), 2026-11-23
**Review:** design-system-reviewer P0 FAIL minor (6; fixed or in Deviations), 2026-11-23
**Review:** mockup-parity-reviewer P0 FAIL on one unlisted row (the browser's own sheet; now in Deviations), 2026-11-23

History: parked by the owner earlier on 2026-11-23 ("on passkey, could you please park the plan and just add option in admin to disable passkeys … it's too early for passkeys in the system, let it be just email and password login. I don't understand the need of passkey system … just wish to get started for now"), then approved the same day (below). The mockup and the reviews stay as they are for when this is picked up again.

**Approved** (owner, 2026-11-23, relayed by the orchestrator): "let's finishup the passkey plan, It's approved but along with it also give me option to switch off passkey when I feel so." The mockup (version 2) and the calls as recommended, with **call 8 reversed**: the passkeys-off switch is NOT removed. Lane D builds its control in Frrata Admin (on and off whenever the owner chooses, no forced end) and releases first; P3 here becomes "every screen behaves while the switch is off". Call 5 stands as drawn.

Owner (2026-11-23): "Please simplify the process … remove redundancies." · "there is no calling feature setup, neither
we want one." Lanes: D owns `src/lib/studio` and the Studio page (its files do not change here); C owns partner credits;
F owns chunking and page budgets. Migrations are numbered at merge (`npm run release:check`).

## Regression net first (rule 5), before P0
| Net | What it pins | Verify |
|---|---|---|
| e2e 75-staff-passkeys | staff confirm, ask, allow with a code, add | `npm run e2e -- 75` |
| e2e 80-partner-team | Lead first passkey, lost, owner Allow | `npm run e2e -- 80` |
| e2e 40-partners | Frrata Admin › Partners › Passkeys | `npm run e2e -- 40` |
| e2e 86-builders | a Builder's first passkey | `npm run e2e -- 86` |
| e2e 97-developer | Give key after a staff check | `npm run e2e -- 97` |
| unit `src/domains/auth/__tests__/passkey-door.test.ts` (P2) | who may add a passkey now, and why; 12 hours, 5 minutes | `npx vitest run src/domains/auth` |
| `scripts/verify/tenancy.sql` §§ 79, 81, 82, 88, 91 + new | spec § D proofs | `npm run verify:tenancy` |

## Tasks
| Phase | Task | Files | Verify |
|---|---|---|---|
| P0 | B6 heading bug; one gate body for both surfaces (frames stay); screens 1–3 (screen 2's saved-passkey list waits for P1's migration); staff `nameFor`; Save a passkey on this device for staff; the drawn words | `src/components/passkeys/*`, `src/domains/auth/passkey-door.ts`, `src/lib/admin/passkeys.ts` | `npm test`, `npm run typecheck`, e2e 75 80 |
| P1 | after lane D's switch is on main · migration A: a definer for screen 2's list (names, dates; no key material) before a check; `partner_stepups.staff_stepup_id`, nullable `passkey_id`, one-of CHECK, index; definer `app_partner_pk_from_staff` (frata_admin only); credential ids unique across both tables; staff confirm writes both rows; /partner sends a staff person to the staff check | `drizzle/<n>_*.sql`, `src/lib/admin/passkeys.ts`, `src/app/(partner)/partner/passkey/route.ts`, `src/lib/auth/require-partner.ts` | `npm run verify:tenancy`, e2e 75 80 86 97, Studio fixture test |
| P2 | migration B: first passkey rules (by user, lock, 7 days from accept/approval or release, one only, That wasn't me); request with Allow + approver's code; one open request; Lead self-serve 24 h from `sent_at`; Stop request (POST after a check); owner 72-hour limits; close open requests and email; `PasskeyRequestCard` in Team, Frrata Admin › Staff, Frrata Admin › Partners; retire `ReadCode`, the Approval step, the call question; email words | `drizzle/<n>_*.sql`, `src/lib/db/partner-passkeys.ts`, `src/lib/admin/partner-passkeys.ts`, `src/lib/admin/passkeys.ts`, `src/components/passkeys/*`, `src/app/(partner)/partner/(workspace)/team/*`, `src/app/(admin)/admin/{staff,partners}/*`, `src/domains/email/staff-security.ts`, `src/lib/admin/staff-notices.ts`, `src/app/join/page.tsx` | `npm test`, `npm run verify:tenancy`, e2e 40 75 80 86 |
| P3 | no removal (call 8 reversed): the switch's off state in every screen and rule here; 7-day and 24-hour clocks count only time with passkeys on | `src/domains/auth/passkey-door.ts`, P2's definers | unit tests with the switch both ways; e2e 75 80 with the switch off |

Each task ends with `impact-reviewer` on its diff; each phase with `security-reviewer` and `tenancy-auditor` on the
definers, `mockup-parity-reviewer` against the mockup, and the docs in spec § Phases amended in the same commit.

## Deviations
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| Screen 2's list of saved passkeys (password manager, saved, used, Partner/Staff tag) | P0: the heading and both actions, no list | The list needs a definer that answers before a check: a migration, which waits for lane D's (P1 adds it) | yes — told the orchestrator 2026-11-23 for the owner; closes in P1 |
| Screen 3's fingerprint tile in Frrata Admin; screens 1–3 in Admin | Admin keeps its key icon above screens 1–3 (its frame since 2026-11-12), no second tile on screen 3 | Admin's frame already draws an icon ("the same card in its own frame") | yes — in P0's report to the orchestrator, 2026-11-23 |
| Screen 1's dark card ("Use a passkey for frata.vercel.app?", the email, the fingerprint, "Use a phone or tablet") | not drawn by the page | It is the browser's own passkey sheet, which appears on "Use passkey"; the mockup shows it for context, as the partner sign-in mockup did (built the same way, 2026-11-15) | yes — in P0's report to the orchestrator, 2026-11-23 |
| A toast "Passkey saved to …" after screen 3 | none | The reload replaces the gate and its toaster; the page that opens is the confirmation (none is drawn after screen 3) | not a deviation (not drawn) |
