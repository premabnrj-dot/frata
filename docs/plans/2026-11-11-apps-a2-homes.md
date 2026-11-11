# Apps A2 — one home for apps that are on, and the featured card
Status: active · Date: 2026-11-11 · Mockup: the approved Apps gallery mockup v1 (owner 2026-11-11), screens "An app that
is on" (EkCode drawn) and the featured card — https://claude.ai/artifact/6Th5A8X4YSXCcyozpzPLEg · Parent plan:
`docs/plans/2026-11-11-apps-gallery.md` (phase A2) · Owner: "go ahead with A2" (2026-11-11)

## Goal
Pricing ladder (owner-approved 2026-11-11) and problem 3 (operations): every app that is on reads the same way — is it
working, its few numbers, what it costs, how to turn it off — and a Launch shop that would pay less on Growth is told
so in its own rupees. Measure: upgrades a month that came from the featured card (`?from=featured` on the billing
link); support asks "how do I turn X off" / "what does X cost".

## What is built (A2) — as revised by the reviews below
1. **`AppHome`** (`apps/_components/app-home.tsx`), one layout for every app that is on: back link · header (tile,
   name, one state chip from `homeState(access)` = "Working", the same function the gallery's Your apps reads; an
   app's own condition is a SECOND badge on the home only: EkCode "Not live yet", Messages "Connected" / "Needs
   attention") · an optional primary button (the app's own) · `ViewTabs` (wraps on a phone, never a sideways strip):
   Overview · the app's own tabs · **Usage and billing** · the body · at the foot, above a rule, **Turn off <app>**
   alone (no explanation on the page, Rule 0): the confirm dialog says what turning it off does (`showcase.ts` gains
   `off: string[]` per app). The foot shows only when `mayTurnOff(membership)` = CAN_MANAGE and not a support visit;
   `setModuleAction` refuses a support visit too (same rule as the interest action; Admin › Modules pauses instead).
   Paused and "Waiting for" never reach a home (a paused app renders `AppAbout`; none of the three has `dependsOn`).
2. **Usage and billing tab** (`?tab=billing`): `AppFacts`, the side column pulled out of `AppAbout` (price box WITHOUT
   its button, Works with, What it uses, Billed by others), one component for both; CAN_MANAGE also gets "Plan and
   billing". Hidden for the accountant (GST and documents only). No per-app bill line: lines carry no module.
3. **EkCode, Messages, GST move onto AppHome.**
   - EkCode: Overview (the four numbers) · Shoppers · Usage and billing. No last-activity line (`ekcodeOverview` has
     no such field; YAGNI).
   - Messages: h1 "Messages". Overview = `NumberHealth` and its needs, or, with no number, `ConnectChoices` under an
     h2 "Connect WhatsApp" (it keeps `canManageWhatsApp`; its Meta listener mounts only there) · Usage and billing.
     Disconnect stays in NumberHealth's menu.
   - GST: Overview = the month · Usage and billing (not for the accountant). The foot needs CAN_MANAGE, never CAN_SEE_GST.
4. **The featured card** (Apps, one at most, between Your apps and the search):
   - Who: CAN_MANAGE and not a support visit (`mayReadMoney`); a shop now on Launch at its LIST price (no custom
     price), with no plan change scheduled (`tenant_plans`, as `billingOverview` reads).
   - Pure `cheapestPlan()` in `src/domains/billing/ladder.ts` (beside bill.ts: it reads bills, it does not make them):
     for each of the last TWO issued, non-test invoices, which each have exactly one plan line for that invoice's month
     at Launch's list price and no `change` line: the fee base is `sum(frrata_invoice_fees.base)` (stored per order),
     each other plan's fee is `deliveredFee(base, bps)` per order (the bill's rounding); credits are restated at that
     plan's bps; add-ons, carry and over lines are the same on both sides. Saving = Launch's (plan + fees − credits) −
     the other plan's. The card names the CHEAPEST of Growth and Scale, and only when that plan saves ≥ ₹500 before
     GST on BOTH invoices (a festive month alone never triggers it).
   - Copy: "On Growth your 1 Dec invoice would have been ₹X less" · "₹A on Launch · ₹B on Growth · both + 18% GST"
     (A = that invoice's taxable total, B = A − X) · **See Growth** (Plan and billing `?from=featured`) · **Not now**.
     Plan and billing already shows what the change adds this month (`planChangeAdds`) and that orders shipped before
     the switch keep 2%; nothing new there.
   - Read: `featuredBillWith(tx, membership)` in `src/lib/queries/billing.ts`, run inside `appsPage`'s one transaction
     (`appsPage` takes the membership; it calls it only when `mayReadMoney`); `check-billing-read.mjs` allows
     `src/lib/queries/modules.ts` with that reason. Fails closed: no card on any error, logged by name.
   - Client: `FeaturedCard` receives the rendered strings as children and the invoice id only (no lines, bps or base:
     ADR-0003); hidden until it has read `localStorage['frrata.featured.dismissed']` (no flash); Not now stores the id.
   - Measure: the billing page reads `from === 'featured'` as a boolean only; `changePlan(code, from?)` takes
     `z.enum(['featured']).optional()` into the audit row's detail. Never rendered, logged raw or price-changing.
5. **Your apps** cards read `homeState` (Working), so the gallery and the home never disagree.

## Out of scope (and what brings it back)
- The 80% meter: no app has a monthly allowance yet (the first metered app brings it).
- A per-app cost line from the bill: an add-on billed through A3 (lines would need a module column).
- RTO Shield's "would have saved" card: RTO Shield shipping, and its own unit-economics review.
- Settings tabs: an app with settings of its own (EkCode P2).
- A 50% holdout of eligible shops (invoice-id parity): **the owner's call** (unit-economics review). Without it the
  ₹-nudge hypothesis is measured before/after only.

## Tasks (each: its test, `npm test`, typecheck, impact-reviewer on its diff)
1. **Regression net first:** e2e 45 (gallery), 46 (Messages), 64 (GST), 67 (EkCode) — green 2026-11-11 (26 of 26).
2. `ladder.ts` `cheapestPlan` + vitest: the three stores (₹599×300 none; ₹4,500×80 none, ₹100 under the floor;
   ₹900×3,000 Scale ₹27,000 cheaper than Launch, never Growth), ₹3.5 L (none) and ₹4 L (₹502), one month above and
   one below (none), a change line or custom price (none), a credit restated, rounding per order, no fee rows (none).
3. `featuredBillWith` + the gate change + `appsPage(membership)`; tenancy-auditor and security-reviewer on the diff.
4. `FeaturedCard` + slot; `changePlan(code, from)` + billing page boolean; e2e: seed two issued Launch invoices with
   fee rows on the e2e shop → the card names the plan and rupees; Not now hides it after reload; staff and a support
   visit never see it; See Growth → the audit row has from: featured.
5. `homeState`, `AppFacts`, `AppHome`, `mayTurnOff`, `setModuleAction` refusing a support visit; `off` lines in
   showcase.ts (test: every module has 1–3); "On" → "Working": offer.test.ts, gallery.tsx, AppAbout's badge,
   e2e 45, visual baselines and 90-ux.
6. EkCode, Messages, GST onto AppHome; e2e 46 (h1 "Messages", h2 "Connect WhatsApp"; Turn off at the foot with its
   confirm), 64 (accountant: the home, no Turn off, no Usage and billing), 67.
7. Skills, reviews on the diff (impact, security, speed), merge, deploy.

## Practices recorded in skills (same commits)
- frata-design-language § Apps gallery: the home as built (one state chip + the app's own badge; Turn off alone at
  the foot, its consequences in the confirm); the featured card's rules (two invoices, cheapest plan, the invoice's
  own rupees, no flash on dismiss).
- frata-unit-economics § The pricing ladder: the nudge reads stored invoices, never a recomputed bill; hypotheses
  below.
- frata-architecture: a money read outside settings/billing runs in the page's one transaction and is named in
  `check-billing-read`.

## Repetitive work → agents and scripts
| Work | How |
|---|---|
| Is a money read outside billing gated? | `check-billing-read` (exists; one new allowed file with its reason) |
| Does the nudge still tell the truth after a price change? | `ladder.test.ts` fixtures read the plan versions' numbers, not literals |

## Facts used
None from third parties.

## Hypotheses (frata-unit-economics rule 1)
| Figure | Source · date | Test |
|---|---|---|
| A ₹ nudge converts better than a feature list | assumption · 2026-11-11 | holdout if the owner approves; else upgrades `from: featured` per eligible shop, 30 days |
| A Launch shop ≥ ₹4 L base two months running stays ≥ ₹3.5 L next month | unit-economics review · 2026-11-11 | backtest over issued `frrata_invoice_fees` |
| An upgrade from the card is not undone within 60 days | pricing-ladder spec | downgrades within 60 days of a `from: featured` change |

## Design review (frata-planning § 3)
- **UI/UX:** one primary action per screen (the app's own; Turn off alone at the foot). States: working, not live
  (EkCode), no number / needs attention (Messages), load error (Panel), no permission and support visit (no foot, no
  card), accountant (GST without billing), phone (tabs wrap, the foot stacks).
- **Tenancy:** no new table. `featuredBillWith` reads the shop's own invoices, lines and fee rows in `appsPage`'s
  `withTenant`; plan versions are platform rows already read the same way.
- **Modularity / SSOT:** saving once (`cheapestPlan`, from stored per-order bases); state once (`homeState`); price
  once (`offerFor`); the side column once (`AppFacts`).
- **YAGNI / KISS:** no new route, table or dependency.
- **Performance:** CAN_MANAGE's Apps gains reads inside the same transaction (two invoices by tenant, their lines and
  fee sums; indexed by tenant and period).
- **Reliability:** the card fails closed.
- **Security:** money read gated twice (mayReadMoney, check-billing-read); support visits see no bill and turn nothing
  off; `from` is an enum into the audit detail only.
- **Unit economics:** reviewed (below); moves no price.
- **Blast radius:** e2e 45, 46, 64, 67, baselines, 90-ux; `setModuleAction` now refuses support visits.

## Review findings (2026-11-11)
| Agent / finding | Fix in the plan |
|---|---|
| Security MED1 / Arch BLOCKER1: check-billing-read | § 4 Read: gate names modules.ts; read only when mayReadMoney |
| Security MED2: support visits | No card; no foot; setModuleAction refuses support visits |
| Security MED3 / Arch MAJOR5: ?from unread | Boolean on the billing page; enum into changePlan's audit detail |
| Security LOW4, Arch MINOR15/16: client props, flash | Strings as children, invoice id only; hidden until storage read |
| Security LOW5: connect inside the home | ConnectChoices keeps canManageWhatsApp; mounted only with no number |
| Security LOW6: accountant | Foot on CAN_MANAGE; Usage and billing hidden for the accountant |
| Security LOW7 / Arch MAJOR3 / UE4: base by arithmetic, null bps | sum(frrata_invoice_fees.base), deliveredFee per order |
| Security LOW8 / Arch MINOR13: last activity | Dropped |
| Arch BLOCKER2 / UE3: plan code not on the invoice; custom price | tenant_plans at the invoice month and now; one plan line at Launch's list price |
| Arch MAJOR4 / UE5–6: periods, credits, A not matching | Credits restated; add-ons/carry/over equal both sides; A = invoice taxable; "your 1 Dec invoice" |
| Arch MAJOR6: chip vs Your apps | homeState(access) only; app's own condition a second badge on the home |
| Arch MAJOR7: unreachable states | Dropped from the home |
| Arch MAJOR8: second transaction | featuredBillWith inside appsPage's withTenant |
| Arch MAJOR9: Usage tab duplicating AppAbout | AppFacts shared; no button in the tab |
| Arch MAJOR10: wrong flows, "On" rename | Lists corrected (68 is Product video, not touched) |
| Arch MINOR11: Rule 0 | Consequences only in the confirm (showcase.ts `off`) |
| Arch MINOR12: phone tabs | ViewTabs wrap |
| Arch MINOR14: thin billing tab | Kept (owner-approved in the mockup); accepted |
| Arch MINOR17: housekeeping | ladder.ts beside bill.ts; practices, repetitive work, facts sections added |
| UE1: first invoice after upgrading is dearer; festive months | Two invoices both ≥ ₹500; Plan and billing shows what the change adds |
| UE2: Scale never offered | cheapestPlan names Growth or Scale |
| UE7: floor | ₹500 over two invoices, kept |
| UE hypotheses / holdout | Hypotheses table; holdout left to the owner |
