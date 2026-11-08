# Plan — Analytics A·0 + A·1 (where orders come from, judged on deliveries)
Status: active (reviewed 2026-11-08: architecture, tenancy, security, unit economics, speed; owner answers in) · Date: 2026-11-08 · Spec: `docs/specs/2026-11-08-analytics-a1.md` (approved by the
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

## Plan review (2026-11-08): these override everything below
Reviewers: `architecture-reviewer` (changes needed), `tenancy-auditor` (fix before merge; no cross-tenant path),
`security-reviewer` (fix before merge; no critical or high), `unit-economics-reviewer` (helps the merchant, neutral for
Frrata, once 1–4 are fixed), `speed-reviewer` (over budget as drafted, measured at 10×; fits with 16).
Owner answers (8 Nov): partners see ₹ only before handover ("Once handed over, no"); **partners may also set and confirm
shipping costs before handover**; attribution (utm tags, click ids, referring site) is **kept with the order for good**
(the abandoned-checkout erase stays as the existing DPDP rule). Billing session (8 Nov, proposed in
`docs/specs/2026-11-08-billing.md`, owner yet to approve): the fee for an order is the plan version in force when it
becomes billable (`billableDelivered`'s moment), through `feeForOrder`; ₹ kept by source and campaign stays on every
plan (call B).

**Money (unit economics, architecture blocker 1–2)**
1. **Lost is priced in the engine, not in `kept.ts`:** `orderProfit` gains `ifLost` = −(forward freight + COGS +
   gateway fee if prepaid), no return leg, no COD fee, no Frrata fee; `freightOf` gains outcome `lost` (forward only).
   A courier's claim is not counted until a column records it. `frata-unit-economics` updated in the same commit;
   `unit-economics-reviewer` on that diff (the money rule).
2. **The fee per order:** `kept.ts` takes a `feeFor(order)` function, never reads plans itself. Until billing B0 lands,
   a local `feeForOrder(tenantId, order)` (named as billing's, same signature `(tenantId, order) => bps`, in the caller's
   transaction) picks the plan version at the order's billable moment through entitlements' `startsAt <= at`; billing
   replaces its body. Offers and Analytics both read it.
3. **What Offers and Analytics show:** ₹ kept **after returns** (and lost), the same figure on both pages, with a count of
   orders left out (pending freight, unknown COGS); returns do not need COGS (the `cogs !== null` filter applies to
   delivered and lost only). The second figure per source is **₹ kept per order with an outcome**, never per delivered
   order alone; `judgeable` counts outcomes, and "on the way" shows beside ₹ kept. The page says **"before ads and
   packaging"** (rows from ad clicks: "before ad spend"). Offers' figures change on purpose (≈ ₹27–53 lower per delivered
   order at the reviewer's shapes); its int baseline is updated deliberately.
4. **Windows:** Offers' 30 days and the leak alert's 7/35 days move to IST days, one helper with Analytics'.

**Who sees ₹ (tenancy HIGH, architecture 5, security LOW-9)**
5. `seesCosts(role, hasOwner)` in `src/domains/tenancy/roles.ts`: owner and admin yes (with no read; a support visit has
   role owner and sees them, audited as now); staff no; partner only while the shop has **no owner member** (the one
   fact; `clientStage` and the banner keep their own wording). The read runs **only for a partner**, inside the page's
   transaction (`costsVisibleIn(tx, tenantId, role)`), and **fails closed**: an error or no tenant context means "has an
   owner", no ₹. Offers' two reads move into one `withTenant`. When ₹ is hidden, the ₹ fields are absent from props and
   the RSC payload (an e2e reads a staff page's HTML). Int test: a partner with two client shops, one handed over.
6. **Partners set shipping costs before handover** (owner): `saveShipCosts` runs as a named tuple `CAN_SET_COSTS`
   (owner, admin, partner) whose comment says why, then checks `seesCosts` inside the same `asMember` transaction.

**Attribution (security MED/LOW, tenancy MED, architecture 3–4)**
7. One `ATTRIBUTION_KEYS` and one `cleanAttribution(raw, shopHosts)` in `src/domains/analytics/`, used by the island,
   the route and `erase.ts` (fixes today's drift between them). Keys (integration-researcher, 2026-11-08,
   `frata-integrations` § Attribution signals): utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid,
   gclid, gbraid, wbraid, gad_source (Google ads without gclid), srsltid (Google free listings: organic), ref_host.
   Dropped: `fbc`/`fbp` as URL keys (cookie values Meta never puts in a URL; A·3 derives `fbc` from `fbclid` on the
   server), `igsh` (only on instagram.com links). The order of evidence: creator code > utm > gclid/gbraid/wbraid/
   gad_source (Google ads) > srsltid (Google, free) > fbclid ("Instagram or Facebook", never ads) > referrer host (a hint:
   in-app browsers often send none) > "Direct or unknown". A named `z.object`, each ≤ 200, NFKC, control and bidi
   characters stripped; a 32 kB body cap in `shopRequest` (413).
8. **The referrer:** the island stores only the referring site's hostname (`new URL(document.referrer).hostname`), on
   the tab's first landing; the server re-reduces: `http`, `https`, `android-app` only; no IP literals, `localhost`, the
   console host or any `*.SHOP_DOMAIN`; the shop's own hosts from the request's tenant (`requireShop`: its domains and
   slug), never from the browser. No landing path is kept (nothing reads it).
9. **Previews:** the `capture` prop is off in `/console/preview` and the Look preview, and the island also refuses to
   run on the console host; a test checks neither attribution nor `frrata.code.v1` is stored there. Capture keeps
   filling a creator code from `?code=` with `via='link'` (the leak alert reads it).
10. **Erase:** clears every click id (fbclid, gclid, gbraid, wbraid, gad_source, srsltid, and legacy fbc/fbp) and ref_host on abandoned orders, plus a one-off migration
   for abandoned orders erased before this (`erased_at is not null`). Real orders keep attribution (owner).
11. **Display:** shopper-typed values render as text only, never as an `href`; the source slug is classifier output
   `[a-z0-9-]{1,64}`, compared in TypeScript, unknown → `notFound()` (never echoed); the period accepts 7, 30, 90 only;
   no cache keyed by tenant alone (₹ depends on the viewer). e2e with `<img onerror>` and `javascript:` values.
12. **Referrer-Policy is already sent** (`src/lib/security-headers.ts`): no header task; e2e 12-security asserts it on a
   shop host. The page's one-line rule says a source can be forged within the order rate limits.
13. **Make a link:** built with `URL` + `URLSearchParams` (a name like `x&code=RIYA10` cannot add a code), the name
   normalised to `[a-z0-9-]{1,50}`, products, collections and creators from server lists of the same tenant, the
   result's origin asserted to be the shop's own. One builder shared with Offers' creator link (`offer-codes.tsx`).

**Reuse, regression net, speed, UI (architecture 3, 4, 7, 9; minor)**
14. `judgeable` reuses `JUDGE_MIN_ORDERS`, moved to the domain. The creator-code subquery is a named helper matching
   `od.tenant_id = o.tenant_id and dc.tenant_id = od.tenant_id`; the int test gives tenant B a code with A's text.
15. Regression net before A1·4: an order from `?utm_…&code=X` (attribution saved, `via='link'`); a Look preview that
   stores nothing; flows `05-shop-look` (not 20), `40-partners`, `47-look`, `12-security` join the net. A test holds
   one offer's ₹ kept and creator counts equal on Offers and Analytics.
16. **Speed (measured at 10×: 146k orders in the 180-day read, peak day 7.5k).** As drafted the window read took 1,785 ms
   (2,305 with JIT) and shipped 52.6 MB to Node (1.6 s just to parse): over budget. Built instead:
   - **Group in SQL by the raw inputs**, never per order: period (this / before), utm_source, utm_medium,
     utm_campaign, ref_host, gclid/gbraid/wbraid present, fbclid present, the creator label in use, `stateSql`,
     `currentMethodSql`, the open shipment's provider, which of COGS and each freight figure are null, and the fee
     bucket (plan versions' change times passed in, never a per-row lateral). Money inputs summed per group;
     `kept.ts` takes groups (`orderProfit` is linear; per-order rounding of the fee is the one difference, tested).
     `classifySource` runs over the groups in TypeScript (10 ms). Offers reads the same grouped path. Measured 670 /
     484 / 232 ms at 146k / 85k / 40k rows, 1.4 MB.
   - **Joins, not per-row subqueries:** the open shipment (`shipments_one_open` allows one) and the creator code by
     LEFT JOIN; a join form beside `openShipmentProviderSql`, with a parity test.
   - **In the analytics transaction:** `set local jit = off` (JIT added 535–590 ms; check Supabase's setting) and
     `set local statement_timeout = '3s'` (pool max 10). Default period 30 days.
   - **Pincode:** a partial covering index (one migration, the next free number): `orders (tenant_id, placed_at)
     include (pincode, rto_initiated_at) where cancelled_at is null and (rto_initiated_at is not null or delivered_at is
     not null or lost_at is not null)`: 193 → 40 ms, index-only; placing an order never writes it.
   - **Source page:** the slug's raw tuples come from the grouped read, then one parameterised `LIMIT 50` query.
   - **Offers:** `offerStatsIn(tx, …, role)` reads `costsVisibleIn`, the fee and the costs in its one `Promise.all` (the
     fee and costs are awaited in turn today, P8); its page uses one `withTenant`; nothing calls `withTenant` inside it.
   - **Budgets:** the page under 1 s p95 is the stop rule; the window aggregate is a named exception to 100 ms per
     query (the orders scan alone is 150–220 ms at 10×), recorded in `frata-architecture` § Speed. Never a stored
     classifier output.
   - **The island:** its own `'use client'` file importing only `bag-store` (0.5 kB gz; through `bag.tsx` it would add
     5.8 kB); never `headers()` in a shop page. The page itself is dynamic, no data cache.
17. UI: under 30 orders on the whole page, the tally pictogram (rule 20a); per row, counts; staff see the page without ₹
   (orders and sources lead); "lost" joins the strip (a listed change from the mockup, with the two word changes);
   orders → delivered drawn with `Journey`; Make a link states: shop not open, no products, Copy refused; an unknown
   source's own state. `frata-verify`'s existing 10× seed step is extended, not duplicated.
18. Reviewers run on the plan now (done) and again at A1·7 on the diff; `integration-researcher` runs before A1·2.

**Merged with main (8 Nov, billing B0 and documents):** Analytics' migrations are 0050 (erase the click ids of
abandoned orders erased before) and 0051 (the pincode index), after billing's 0047–0048 and documents' 0049. The fee
per order is billing's one rule: `feeBucketSql` reads `billableAtSql`, the same pick as `feeForOrder`
(domains/plans/entitlements.ts); the local stand-in is gone.

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
