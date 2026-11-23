# Passkeys, simpler: the task plan (lane G)
Status: parked by the owner, 2026-11-23 · Date: 2026-11-23 · Spec: `docs/specs/2026-11-23-passkeys-simpler.md` · **Not built**.
**Mockup:** https://claude.ai/artifact/85e3WTLUVDFYjMnJYC2JG4 (`docs/mockups/2026-11-23-passkeys-simpler.html`)
**Approved:** not given — the owner parked the plan, 2026-11-23; nothing below starts until it is picked up again
**Review:** security-reviewer FIX THE SPEC (2 high, 5 medium, 2 low; all folded into the spec), 2026-11-23
**Review:** tenancy-auditor FIX BEFORE BUILD (no leak; 4 high, 2 medium, 1 low; all folded in), 2026-11-23
**Review:** architecture-reviewer CHANGES NEEDED (2 blockers, 8 major; all folded in), 2026-11-23
**Review:** words-reviewer 30 lines rewritten in the mockup, 2026-11-23
**Review:** speed-reviewer not run, parked before it was due, 2026-11-23
**Review:** impact-reviewer not run, runs on each task's diff once picked up, 2026-11-23

**Parked** (owner, 2026-11-23): "on passkey, could you please park the plan and just add option in admin to disable passkeys … it's too early for passkeys in the system, let it be just email and password login. I don't understand the need of passkey system … just wish to get started for now". Lane D builds the switch the owner asked for. The mockup and the reviews stay as they are for when this is picked up again.

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
| unit `src/domains/auth/__tests__/passkey-door.test.ts` | who may add a passkey now, and why; 12 hours, 5 minutes | `npx vitest run src/domains/auth` |
| `scripts/verify/tenancy.sql` §§ 79, 81, 82, 88, 91 + new | spec § D proofs | `npm run verify:tenancy` |

## Tasks
| Phase | Task | Files | Verify |
|---|---|---|---|
| P0 | B6 heading bug; one gate body for both surfaces (frames stay); screens 1–3; staff `nameFor`; `passkey-door.ts` | `src/components/passkeys/*`, `src/domains/auth/passkey-door.ts`, `src/lib/admin/passkeys.ts` | `npm test`, `npm run typecheck`, e2e 75 80 |
| P1 | migration A: `partner_stepups.staff_stepup_id`, nullable `passkey_id`, one-of CHECK, index; definer `app_partner_pk_from_staff` (frata_admin only); credential ids unique across both tables; staff confirm writes both rows; /partner sends a staff person to the staff check | `drizzle/<n>_*.sql`, `src/lib/admin/passkeys.ts`, `src/app/(partner)/partner/passkey/route.ts`, `src/lib/auth/require-partner.ts` | `npm run verify:tenancy`, e2e 75 80 86 97, Studio fixture test |
| P2 | migration B: first passkey rules (by user, lock, 7 days from accept/approval or release, one only, That wasn't me); request with Allow + approver's code; one open request; Lead self-serve 24 h from `sent_at`; Stop request (POST after a check); owner 72-hour limits; close open requests and email; `PasskeyRequestCard` in Team, Frrata Admin › Staff, Frrata Admin › Partners; retire `ReadCode`, the Approval step, the call question; email words | `drizzle/<n>_*.sql`, `src/lib/db/partner-passkeys.ts`, `src/lib/admin/partner-passkeys.ts`, `src/lib/admin/passkeys.ts`, `src/components/passkeys/*`, `src/app/(partner)/partner/(workspace)/team/*`, `src/app/(admin)/admin/{staff,partners}/*`, `src/domains/email/staff-security.ts`, `src/lib/admin/staff-notices.ts`, `src/app/join/page.tsx` | `npm test`, `npm run verify:tenancy`, e2e 40 75 80 86 |
| P3 | migration C: remove `passkeys_off` (after P2 is live and the owner passed a check on each browser) | `drizzle/<n>_*.sql`, `src/lib/db/schema-staff.ts`, `src/lib/auth/require-partner.ts` | `npm run verify:tenancy` (§ 81, § 88 rewritten), e2e all passkey flows |

Each task ends with `impact-reviewer` on its diff; each phase with `security-reviewer` and `tenancy-auditor` on the
definers, `mockup-parity-reviewer` against the mockup, and the docs in spec § Phases amended in the same commit.

## Deviations
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| — | — | — | — |
