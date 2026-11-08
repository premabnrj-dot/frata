# Plan — Analytics A·0 + A·1 (where orders come from, judged on deliveries)
Status: draft (awaiting plan review) · Date: 2026-11-08 · Spec: `docs/specs/2026-11-08-analytics-a1.md` (approved by the
owner 2026-11-08; mockup https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt as drawn) · Parent: `docs/specs/2026-11-07-analytics.md`

Gates on every task: `npm test`, `npm run typecheck`, int tests with `INT_DB_HOST`, `verify:tenancy` if `drizzle/` or a
policy changes, `impact-reviewer` on the task's diff, e2e for the flows it touches. Pushing to a `claude/**` branch never
deploys (vercel.json); main deploys production.

## What changed since the spec was approved (8 Nov, the same day)
Ship S·0 is built and live (main eaa31b1; `docs/plans/2026-11-08-ship.md`). It built what the spec's calls A, D and E
asked for, in Ship's own design, which this plan reads instead of building again:
1. **Call A (outcomes by hand) is done by Ship:** Mark shipped, Delivered, Came back (with "Put the stock back"), Lost by
   the courier; one writer `src/lib/orders/outcomes.ts`; roles `SHIPPERS` / CAN_MANAGE; Undo within the IST month (and
   Shipped within 30 days). The spec's "Awaiting delivery" tab is Ship's **To ship** and **On the way** tabs.
   Lost is a fourth outcome the spec did not have (`orders.lost_at`; shopper sees "a problem with the delivery").
2. **Call D (shipping costs) is done by Ship with three costs, not two:** delivery, return, COD fee (Settings › Shipping
   costs), through `freightOf` (`src/domains/orders/freight.ts`): Shiprocket actual or pending, else the shop's confirmed
   estimate, else none ("before shipping costs"). Offers' ₹ kept already reads it (`keptBasis`).
3. **Call E guards are done:** `billableDelivered` and `shippedUndoOpen` (`src/domains/orders/outcomes.ts`). The open
   billing calls (never-shipped, Lost without proof, late marks) belong to the billing session, not to A·1.
4. **Roles for ₹ (owner, 8 Nov, this session):** "Once handed over, no": a partner sees ₹ kept and shipping costs while
   the shop has no owner (stage `building` or `invited`, `src/domains/partners/stage.ts`), never after; owners and
   admins always; staff never. This replaces the spec's roles table row ("Partner: yes") and Ship S0·6's
   "owners and admins only" (which hid them from a partner still building). One pure rule, `seesCosts`.
5. **Main moved** (review branch e99dd07): speed rules (§ Speed in `frata-architecture` 2.18.0: one `withTenant`,
   `Promise.all`, EXPLAIN, cached-entry bytes), motion and visuals (pictograms, "too few to judge" shows a pictogram and
   no numbers), the outbox in `src/lib/outbox/drain.ts`, `check:actions` that follows calls. New reviewer agents:
   `speed-reviewer`, `security-reviewer`.
6. **Another session builds billing** (owner, 8 Nov). A·1 reads the plan's fee (`feeBpsIn`, `deliveredFee`) and never
   changes plans, fees or entitlements; any such need is sent to that session first.

The mockup stays as approved; two strips change words only because of 1–2: "Before outcomes exist" links to To ship
and On the way (not a new tab), and the shipping-costs line links to Settings › Shipping costs (three costs).

## Regression net first (rule 5)
- e2e that covers what A·1 changes: `10-checkout` (placement; attribution rides on it), `47-offers` (₹ kept; moves to
  `kept.ts` and IST days), `49-ship` (outcomes the page reads), `50-order-page` (the "Came from" line), `90-ux`
  (a new nav item at 390 px), `20-shop-look` (capture moves into the shell: every shop page's baseline).
- **New, written before the code (A1·0):** `e2e/flows/51-analytics.mjs`: a shopper lands on `?utm_source=instagram&
  utm_medium=bio&utm_campaign=diwali-drop`, orders COD; the order page says "Came from: Instagram bio · diwali-drop";
  the owner marks it Delivered; Analytics shows the source with 1 order, 1 delivered; staff see no ₹; Make a link
  copies a tagged URL. It fails until A1·6; earlier steps are added with the tasks that build them.
- **Int baselines before moving maths (A1·0):** `offer-stats.int.test.ts` already pins ₹ kept on none / estimate /
  pending / actual; add one Offers figure computed over a window that crosses IST midnight, so the move to IST days
  shows as a deliberate test change, not a silent one.

## A·1 · Tasks
| Task | What | Verify |
|---|---|---|
| A1·0 | **Regression net:** e2e 51 (first step only: `/console/analytics` exists, fails today); the IST-midnight Offers baseline. | e2e 51 red as expected; int green |
| A1·1 | **Who sees ₹:** `seesCosts(role, hasOwner)` in `src/domains/tenancy/roles.ts` (owner, admin: yes; partner: only while the shop has no owner; staff: no), with a table test. One server read `costsVisible(auth)` (`src/lib/queries/members.ts`: exists an owner member, inside the page's `withTenant`). Applied to: Offers list and offer page (`offerStats(..., { costs })`), Settings › Shipping costs (page gate and the Settings row), and later Analytics. `saveShipCosts` takes the same rule (asMember with the role set, then the owner check). | vitest; e2e 47 (partner on a building shop sees ₹ kept; after an owner joins, not); e2e 49 costs page |
| A1·2 | **Attribution domain** `src/domains/analytics/`: `attributionOf(unknown)` (reads `checkout` null or `{}`; caps 10 keys); `classifySource(attr, creator)` → `{ channel, source, campaign }` (creator code > UTM > gclid "Google ads" > fbclid "Instagram or Facebook", never ads by itself > referrer host > "Direct or unknown"), `CLASSIFIER_VERSION` and its dated line; channel names and the "Other" fold; `linkFor(shopUrl, preset, page, name)` (lowercase, one separator); `judgeable(n)` (≥ 30). **Before building:** `integration-researcher` confirms with a dated source whether Meta adds `fbclid` to ordinary (non-ad) link taps, and how Instagram's in-app browser sends a referrer. | vitest table (each rule, typos, empty, hostile values) |
| A1·3 | **Kept after returns** `src/domains/orders/kept.ts` (pure, out of `offerStats`): per order, `orderProfit` with `freightOf` for its outcome (`delivered` → `ifDelivered`; `rto` → `ifRto`; **lost** → see unit-economics question U1), the fee in force at placement; sums, counts, how many had costs, `keptBasis`. `offerStats` reads it (one helper, no second copy); Offers' windows become IST days. | vitest; int offer-stats (unchanged figures, the IST baseline updated on purpose) |
| A1·4 | **Capture:** out of `BagButton` into a `CaptureAttribution` island in the shop shell with an explicit `capture` prop, off in `/console/preview` and the Look preview; records `document.referrer` only on the tab's first landing as `ref_host`; a new tagged landing replaces the whole touch; landing path without its query; 10 keys. Server (`/api/shop/orders`): allow-list gains `ref_host`, reduced to a hostname (`new URL().hostname`, `^[a-z0-9.-]{1,253}$`, `android-app://` to its package), the shop's own hosts and payment pages dropped. Storefront responses send `Referrer-Policy: strict-origin-when-cross-origin`. `erase.ts` also clears `fbclid`, `gclid`, `ref_host` on abandoned orders. | vitest (reducer); e2e 10 (an order carries `utm_*` and `ref_host`), e2e 20 (baselines unchanged), a preview places nothing in sessionStorage |
| A1·5 | **Reads** `src/lib/queries/analytics.ts`, one `withTenant` (snapshot): the window and the period before (`orders_tenant_placed`), only `checkout->'attribution'`, state columns, profit and freight inputs, the open shipment's provider (`openShipmentProviderSql`), the order's creator code (`useOfRowSql`); classified and summed in TypeScript through A1·2/A1·3. Source page: a classifier slug from the URL, re-read and filtered in TypeScript, its last 50 orders. Returns by pincode: counts, rate from 30. **Before the page:** seed 150k orders in one shop (10×), EXPLAIN each read (< 100 ms, no seq scan); if the window read passes 1 s, stop and propose a typed `source_channel` at placement. | int test (classification and sums against hand-made orders; tenant B invisible); EXPLAIN output in the commit message |
| A1·6 | **Console:** nav item Analytics under Orders (core; call B: every plan); the page as drawn (period 7/30/90 IST against the period before, "so far" when it includes today; ₹ kept after returns first, then orders → delivered · came back · lost · on the way · not sent yet; strip of four; sources as rows, cards on a phone; under 30, counts; "Before outcomes exist" → To ship / On the way; costs line → Settings › Shipping costs); the source page; returns by pincode; **Make a link** dialog (presets, page, name, Copy); the order page's "Came from" line. ₹ only where `seesCosts`. Motion from § Motion, pictograms where the mockup has them, states: no orders, no sources, no outcomes, too few, error, phone. | e2e 51 (all steps), e2e 90 (390 px, no sideways scroll), e2e 50 |
| A1·7 | **Close:** `tenancy-auditor`, `security-reviewer` (capture, referrer, header, link builder), `speed-reviewer` (the page at 10×), `impact-reviewer` on the branch; full e2e; skills (below); merge main; push main; spec status built, plan done. | all green |

## Questions for the plan review
- **U1 (unit economics, a money rule):** what a **lost** parcel leaves in ₹ kept after returns. Proposal: forward
  freight spent and the goods gone (−(forward freight + COGS + gateway fee if prepaid)); a courier's claim is not counted
  until received (no column for it yet). Until the reviewer agrees, lost orders are counted (as "lost") but left out of
  ₹ kept, and the page says so.
- **U2:** Offers' ₹ kept moves to IST-day windows and to the fee in force at placement; both change Offers' figures
  slightly. Acceptable, or keep Offers on rolling 30×24 h?
- **S1 (speed):** read-time classification of up to 180 days (about 30k rows for a large shop at 10× festive) vs a typed
  column at placement now.

## Out of scope (unchanged from the spec)
Visitors, funnel, Web Vitals, consent and forwarding (A·2–A·4); CSV; an orders-list filter by source; editing a source.
Billing's open calls (Ship plan § unit-economics) are the billing session's.

## Practices recorded in skills (closing the phase)
- `frata-design-language`: Analytics rules (one question first; pending never zero or RTO; counts under 30; every rate
  names its denominator; "source known %"; Make a link presets lowercase); the ₹ roles rule replaced by `seesCosts`.
- `frata-architecture`: attribution is raw in `checkout.attribution`, classified on read by one `classifySource`;
  `kept.ts` is the one ₹-kept helper (Offers and Analytics); capture never runs in a preview.
- `frata-verify`: the 10× seed and EXPLAIN step for any page that reads a window of orders.

## Repetitive work → agents and scripts
| Repeated by hand | Becomes |
|---|---|
| Applying a migration to production through the Supabase tool (fourth time) | `scripts/prod-migrate.mjs`: prints one transaction with each file's sha256 and journal `when` (A1·7 if a migration lands; else the next plan that has one) |
| Seeding 10× orders for EXPLAIN | `scripts/verify/seed-10x.sql` (A1·5), reused by `speed-reviewer` |
