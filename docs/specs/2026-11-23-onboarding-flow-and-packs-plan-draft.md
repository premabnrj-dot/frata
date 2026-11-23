# Onboarding flow and category packs
Status: draft (held in docs/specs/ until sign-off, then moved to docs/plans/ with its Approved line; `check:plans` refuses an unapproved plan)  · Date: 2026-11-23 · Spec: docs/specs/2026-11-23-onboarding-website-and-categories.md
**Mockup:** pending (docs/mockups/2026-11-23-onboarding-flow.html), publish link added at sign-off
**Approved:** pending, owner
**Review:** architecture-reviewer pending, 2026-11-23
**Review:** unit-economics-reviewer pending, 2026-11-23
**Review:** words-reviewer pending, 2026-11-23
**Review:** design-system-reviewer pending, 2026-11-23
**Review:** speed-reviewer pending (runs after sign-off, on the cut plan)
**Review:** security-reviewer pending (runs after sign-off)
**Review:** tenancy-auditor n/a for P0 to P2; runs before any task that adds a table (M1) or a merchant Studio actor (M2)

Moves ranked problems 3, 5, 4 (and 1 and 6 through the packs). Measures in the spec § Goal.
Nothing below is built before the owner approves the phase's mockup (ADR-0001). Phases P0 and P1 are the flow; P2 onward
are the packs. M1 and M2 (the website ladder) are not planned here: they need Your calls 1 to 4, then their own specs.

## Phases

| Phase | Name | A merchant can… | Depends on | Mockup |
|---|---|---|---|---|
| P0 | Instrument and clean | (Frrata) see time to first product, open rate and where shops stall | nothing | none, Admin table; words only |
| P1 | The one-question flow | set up and open a store, one question at a time, on a phone | P0 | docs/mockups/2026-11-23-onboarding-flow.html |
| P2 | Pack scaffold | (no change visible) one category list instead of four | P1 optional | none, refactor |
| P3 | Beauty and wellness finished | sell shades, volumes and ingredients with the right defaults | P2, owner mockup | own mockup, before build |
| P4 | Home and kitchen | sell weight and dimensions; damage returns | P2, CA on HSN | own mockup |
| P5 | Food | declarations and no-returns defaults | P2, CA and counsel | own mockup |
| P6 | Electronics | BIS, serial, warranty, COD caps | P2, CA and counsel | own mockup |

## Regression net (first, before any change)

- `e2e/flows/63-signup.mjs` (sign-up) extended to the new step order; a new flow `98-onboarding` that runs name, category,
  brand, first product, pay, open at phone and desktop and reads the sketch.
- A handover flow: the partner path (`40-partners`, `80-partner-team`) must still land the owner on the right step. Add the
  step assertion to the existing handover flow if one exists; if none does, write it first and run it red against today.
- `src/domains/setup/__tests__` for `setupSteps()` (all combinations of data to steps; the "name is always done" row
  changes here, so pin today's behaviour first).
- Snapshot of `startingHsn`, `sellsSized`, `presetsFor`, `labelAsked`, `kindOf` for all nine keys and the empty list, before P2.
- `check:motion`, `check:words`, `check:states`, `check:scale` stay green.

## P0 · Instrument and clean (no mockup, words only)

| Task | Verify |
|---|---|
| 0.1 Derive `timeToFirstProduct`, `timeToOpen`, `timeToFirstOrder` as one pure function in `src/domains/setup/` from `audit_events` `shop.created`, first `products.published_at`, `tenants.first_opened_at`, first order `placed_at` | unit test with six dated cases |
| 0.2 A query in `src/lib/admin/` (through `frata_admin`) returning the cohort, and a table in Admin › Trials (TR3 if unbuilt) | `npm run verify:tenancy`; one e2e step in the admin flow |
| 0.3 Remove `BuiltPages` and the "Products open in the next release" copy | `npm test`; grep shows no `BuiltPages` |
| 0.4 Progress counts from the first real action (the always-done row stops counting) | unit test; flow 63 reads "0 of 5" on arrival |

Gate to P1: a week of timing on real sign-ups, or on the seed, so P1's effect has a before.

## P1 · The guided flow (mockup first)

1. **Mockup** published, owner approves, approved rules go into `frata-design-language` (§ Console patterns) with a version bump.
2. **Review agents** run on this plan (header lines above), findings fixed or accepted in writing.
3. Tasks:

| Task | Verify |
|---|---|
| 1.1 `/console/setup?q=` shell: one page, the question id in the URL, a client state using `animate-step-forward/back`, progress by `scaleX` with `role=progressbar`, focus moves to the new question's heading, a polite live region says "Question 3 of 18" | e2e 98 order; `check:motion`; axe |
| 1.2 Questions Name and Address (reuses `checkAddress`); the address is filled from the name. **No pickup PIN code** (owner, 2026-11-23) | e2e; unit for slug |
| 1.3 Pickup PIN code optional at sign-up: a definer version without it (migration 0169 or later, after reading main), `createMyShop` optional, readers in `queries/catalogue.ts:183` and `queries/delivery.ts:97` and any shipping estimate show "Add your pickup PIN code" until set | `verify:tenancy`; unit; e2e: a store with none opens and shows no error |
| 1.4 Question What you sell: radio cards with `PictoTile` (nine keys now, the pack list after P2) | e2e; axe at phone |
| 1.5 Store sketch (SVG and CSS, opacity and transform only, three staggered rises, reduced-motion fade); colour and font crossfade as two layers on opacity | `check:motion`; flow 90-ux at 320, 390, 1280 and 200% |
| 1.6 Questions Logo, Colour, Font: logo through the existing upload checks; eight colours with white-text contrast checked (the hero text flips by luminance); three pairings; saved by one action to `accent` and `display_font` | security-reviewer; e2e; contrast gate |
| 1.7 Questions Photo, Title, Price, then the pack's questions (one each); Undo on publish; Import link | e2e; flow 74-commerce unchanged |
| 1.8 Questions Pay on delivery, UPI and cards | e2e; Razorpay attempt-row pattern (ADR-0008) |
| 1.9 Questions Plan (Growth preselected), GSTIN, grievance officer name and email; a pre-open "set plan" replacing the plan row, so the trial and `planChangeStarts` rule holds; what `grievanceComplete` needs decides the questions | billing unit tests (a pre-open plan change keeps the trial); trials flow unchanged; TR3 cohort breaks at the plan-set date |
| 1.10 Question Open: preview frame, `openShop`, the existing `OpenMoment` (reused, not rebuilt), Share with a status toast, the waiting card | e2e 98; flow 05-shop-look unchanged |
| 1.11 Partner handover lands on the same flow, starting at what is done | handover e2e |
| 1.12 Home shows the checklist for what remains and links back to the flow; the flow is the Home of a store that has not opened | e2e; states drawn |
| 1.13 Words: every string through `words-reviewer`; `check:words` | `npm run check:words` |
| 1.14 First-load JS for the flow under the console budget | `check:bundle`; `speed-reviewer` |

After each task: `impact-reviewer` on its diff before commit. After P1: `mockup-parity-reviewer`, then `design-system-reviewer`.

## P2 · Pack scaffold (no visible change)

| Task | Verify |
|---|---|
| 2.1 `src/domains/catalogue/packs/` with the Zod schema, `packCheck`, the nine current keys as packs carrying today's values exactly | the pre-change snapshots match byte for byte |
| 2.2 Replace `SELL_KEYS`, `SELL_LABELS`, `startingHsn`, `sellsSized`, `presetsFor`, `labelAsked`, `kindOf` word hints and the sample-set switch with pack reads | `check:layers`; snapshots; flows 74, 92 |
| 2.3 `check:packs`: code list, latest migration CHECK and `app_create_shop_v2` agree. Gate run against the doc that describes it | the gate fails on a planted mismatch; passes on main |
| 2.4 Migration to take the CHECK and definer from one generated list (take 0169 or later after reading main; lane D holds 0166 to 0167, lane C 0168) | `npm run verify:tenancy`; apply path in CLAUDE.md |

## P3 to P6 · one pack each

Each opens with its own spec and mockup, its own owner and CA gate, and these shared tasks: pack data and `packCheck`
tests; the editor fields; the store's wording through the pack's noun set; Storefront API additive fields
(`api-contract-reviewer`); an e2e flow with a seed shop in that category (the first non-apparel seed is a P3 task if none exists);
`unit-economics-reviewer` for any COD cap, resale rate or fee change.

## Primitives the build adds (design-system review, 2026-11-23)

A question shell (top bar with Back, progress bar, body, sticky footer); a `role=progressbar` bar; a radio card grid for
single choice (categories, nine tiles; `Segmented` stops at four words); a colour swatch radio group; a font specimen radio
group; an interactive chip toggle group; a file drop with a preview; a suffix input group (`rangrez` + `.frrata.shop`);
the decorative store sketch (shop tokens, `aria-hidden`); a waiting card. Reuse `ui/switch`, `ui/button`, `Section`,
`FIELD`, `FieldError`, the toast and `OpenMoment`. `PictoTile` is 64 px; the 40 px tile needs a `size` prop or a
Deviations row.

Open points from that review to settle at build, not drawn in the mockup: the switch knob uses the existing `ease-snap`
(no overshoot) and a 24 px minimum target; field borders use the real Neel field token (3:1); every control has a visible
focus ring; the Open check's `stroke-dashoffset` animation is the existing rule-26 moment (confirm its named exception in
`check:motion`); all states beyond the happy path and the step-1 error are drawn in the build's own review.

## Deviations (mockup element · what was built · reason · owner seen)

| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| (none yet) | | | |

## Practices recorded in skills (same commit as each phase)

- **UI/UX** (`frata-design-language`, § Console patterns): the guided flow as a pass over a derived checklist; the store
  sketch pattern (a picture that builds as answers land); one step per screen on a phone, the sketch as a strip.
- **Performance** (`frata-architecture` § Speed): the flow's first-load budget; setup read as one `withTenant`.
- **Architecture** (`frata-architecture`): a category is a pack, one list, one gate; a new category never adds a fifth copy.
- **Testing** (`frata-verify`): the onboarding flow and the pack snapshot as the regression net for sign-up changes.
- **Planning** (`frata-planning`): the onboarding timing as a standing measure in every spec that touches sign-up.

## Repetitive work → agents and scripts

| Chore | Becomes |
|---|---|
| Keep category lists in step across code, CHECK and definer | `check:packs` (P2.3) |
| Check a flow's time to first product after a change | the Admin cohort table (P0.2) |
| Read a mockup's words against the Words rulebook | `words-reviewer` (existing) |

## Not in this plan

M1 (Starter website), M2 (Ask Frrata), M4 (retire themes): the spec's ladder and gates. They wait for Your calls 1 to 4 and
for V2 hosting, V3a and the merchant wallet. The Studio orchestrator session owns those lanes; this plan touches none of
`console/brand/**`, `domains/brand/**`, `(partner)/partner/**`, `middleware.ts` or `vercel.json`.
