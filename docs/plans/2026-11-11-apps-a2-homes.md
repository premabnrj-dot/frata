# Apps A2 — one home for apps that are on, and the featured card
Status: draft · Date: 2026-11-11 · Mockup: the approved Apps gallery mockup v1 (owner 2026-11-11), screens "An app that
is on" (EkCode drawn) and the featured card — https://claude.ai/artifact/6Th5A8X4YSXCcyozpzPLEg · Parent plan:
`docs/plans/2026-11-11-apps-gallery.md` (phase A2) · Owner: "go ahead with A2" (2026-11-11)

## Goal
Pricing ladder (owner-approved 2026-11-11) and problem 3 (operations): every app that is on reads the same way — is it
working, its few numbers, what it costs, how to turn it off — and a Launch shop that would pay less on Growth is told
so in its own rupees. Measure: upgrades a month that came from the featured card (`?from=featured` on the billing
link); support asks "how do I turn X off" / "what does X cost".

## What is built (A2)
1. **`AppHome`** (`apps/_components/app-home.tsx`), one layout for every app that is on: back link · header (tile,
   name, one state chip: "Working" / "Paused by Frrata" / "Waiting for <app>" / "Not live yet", and an optional
   last-activity line the app passes in) · an optional primary button (the app's own) · `ViewTabs`: Overview · the
   app's own tabs · **Usage and billing** · the body · at the foot, above a rule: the app's one line on what turning it
   off does, and **Turn off <app>** (`AppAction` switch with its confirm; CAN_MANAGE only; others see nothing there).
2. **Usage and billing tab** (shared, `?tab=billing`): the price box from `offerFor` (one source with the gallery),
   "Billed by others" from `registry.usage`, "What it uses" from `showcase.ts`, and a link to Plan and billing
   (CAN_MANAGE). No per-app line from the bill: invoice lines carry no module column (an add-on line is matched by
   name only) — YAGNI until an add-on is billed (A3).
3. **EkCode, Messages, GST move onto AppHome.**
   - EkCode: Overview (the four numbers, as today) · Shoppers · Usage and billing. Last activity: the last sign-in
     (a field `ekcodeOverview` already reads, or none).
   - Messages: Overview = `NumberHealth` and its needs, or Connect WhatsApp when no number (the connect page stays a
     setup step inside the home, not a separate page) · Usage and billing. Its badge (Connected / Needs attention)
     becomes the state chip line. Disconnect stays inside NumberHealth's menu (a number, not the app); Turn off at the foot.
   - GST: Overview = the month (as today) · Usage and billing. The accountant sees the home without Turn off.
4. **The featured card** on Apps (one, at most; CAN_MANAGE only; between Your apps and the search):
   - Pure `growthSaving()` in `src/domains/billing/ladder.ts`: from the shop's **last issued Frrata invoice's stored
     lines** (`frrata_invoice_lines`, never recomputed): Launch plan line + fee line (base = taxable × 10,000 ÷ its
     rate_bps) against Growth's current plan price + Growth's fee bps on the same base. A card only when the shop is on
     Launch, the invoice is a full month on Launch (no change, trial or pause lines), and the saving is ≥ ₹500 before GST.
   - Copy: "On Growth you'd have paid ₹X less last month" · one line "Your {month} bill: ₹A on Launch. On Growth: ₹B.
     Both + 18% GST." · **See Growth** (Plan and billing, `?from=featured`) · **Not now**.
   - Not now hides it until the next invoice (localStorage keyed by the invoice id: a convenience; a cleared browser
     shows it again, which is honest).
   - No pop-up, timer, animation or promise of a future saving.
5. **Your apps** cards read the same state chip as the home (`offerFor`), so the gallery and the home never disagree.

## Out of scope (and what brings it back)
- The 80% meter: no app has a monthly allowance yet (the first metered app brings it).
- A per-app cost line from the bill: an add-on billed through A3.
- RTO Shield's "would have saved" card: RTO Shield shipping, and its own unit-economics review.
- Settings tabs: an app with settings of its own (EkCode P2).

## Tasks (each: its test, `npm test`, typecheck, impact-reviewer on its diff)
1. **Regression net first:** e2e 45 (gallery), 46 (Messages), 64 (GST), 67/68 (EkCode) green on main before changes.
2. `ladder.ts` `growthSaving` + vitest: the three stores (₹599 × 300, ₹4,500 × 80, ₹900 × 3,000), the threshold at
   ₹3.5 L, a trial or change line → none, a credit line, rounding (bps × base), Growth price missing → none.
3. Query `featuredBill(m)` in `src/lib/queries/billing.ts`: CAN_MANAGE only (`payingFor`'s gate), the last issued
   invoice's lines and plan code, Growth's current version (price, fee bps); one `withTenant`.
4. `FeaturedCard` (client: dismiss only) + gallery slot; e2e: seed a Launch invoice with a fee line on the e2e shop →
   the card shows the rupees, Not now hides it after reload, a staff member never sees it.
5. `AppHome` + Usage and billing; vitest for the state chip (one function `homeState(access, extras)` in `offer.ts`).
6. EkCode, Messages, GST onto AppHome; e2e 46/64/67 updated (Turn off at the foot with its confirm; the accountant
   sees GST's home without Turn off; Usage and billing shows the price).
7. Skills: frata-design-language § Apps gallery (the home and the card as built), frata-unit-economics (the card's rule
   and its hypothesis: "a ₹ nudge converts better than a feature list" — test: `?from=featured` upgrades in 30 days),
   versions bumped. Reviews on the diff: impact, security, speed (the gallery gains one read for CAN_MANAGE).

## Design review (frata-planning § 3)
- **UI/UX:** one primary action per screen (the app's own; Turn off at the foot, never at the top). States: working,
  paused, waiting for another app, not live, no number (Messages), load error (Panel), no permission (no Turn off),
  accountant (GST only), phone (tabs scroll, foot stacks). Feedback: Turn off confirms, then the about page.
- **Tenancy:** no new table. `featuredBill` reads the shop's own invoice lines through `withTenant`; plan versions are
  platform rows already read the same way by `payingFor`.
- **Modularity / SSOT:** the saving is computed once (`growthSaving`), from stored lines (the bill is the record); the
  state chip once (`homeState` beside `offerFor`); the price once (`offerFor`).
- **YAGNI / KISS:** no new route, table or dependency; three pages adopt one component.
- **Performance:** Apps for CAN_MANAGE gains one indexed read (last invoice by tenant, its lines); homes read nothing new.
- **Reliability:** the card fails closed (no card on any error, logged by name).
- **Security:** the bill is CAN_MANAGE-only, as on Plan and billing; no new action (Turn off is `setModuleAction`).
- **Unit economics:** moves no price; the card only states what the stored bill says. Run `unit-economics-reviewer`.
- **Blast radius:** e2e 46/64/67 selectors; the Messages connect page moves inside the home (its URL stays).

## Review findings
(filled after the agents run)
