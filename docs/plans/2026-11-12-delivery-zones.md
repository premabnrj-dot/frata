# Delivery Zones — plan (PD·0 the floor, PD·1 the app)
Status: draft (reviews next) · Date: 2026-11-12 · Spec: `docs/specs/2026-11-12-pincode-delivery.md` · Mockup (approved,
owner 2026-11-12): https://claude.ai/artifact/67kHoVDaRX5AFS5vWcWAgR (`docs/mockups/2026-11-12-delivery-zones.html`) ·
Owner calls: name Delivery Zones; in Growth and Scale; Launch ₹999/month + GST; Ship parked.

## Goal
Problems 1 (COD/RTO) and 4 (checkout conversion). Measures: COD RTO rate by zone before/after; product-page check →
checkout rate; orders refused at checkout for "not delivered" (near zero once rules exist).

## Depends on
The India Post directory in `pincodes` — the other session's loader (`scripts/ops/pincodes-sql.mjs`, branch
`claude/elegant-carson-8jygm1`) and the owner's CSV. Until it is loaded, a PIN code with no directory row resolves to
the shop's default (Rest of India) and the check says "Delivers by …" without the place name. Nothing here is blocked.

## The one rule (SSOT)
A pure `resolveDelivery(pincode, place, setup, now)` in `src/domains/delivery/resolve.ts` answers, for one PIN code:
`{ deliverable, zone, charge, freeAbove, cod: { allowed, fee, max } | refusedWhy, days: [min, max], by: date }`.
- `setup` = the shop's zones (ordered; first match wins), PIN code rules (a rule beats its zone), dispatch settings and
  holidays. Without the app (or before it is turned on) `setup` is today's settings as one zone: one delivery charge,
  free-above, COD on/min/max/fee, the "no pay on delivery" list as pay-online-only rules, dispatch/metro/rest days.
- `shippingFor`, `codFor`, `codWhyNot` and `arrivalRange` (src/domains/checkout/delivery.ts, quote.ts) become thin
  readers of it, so checkout, the reprice of an order (`orders/amounts.ts`), the buy box, shop previews and the product
  page can never disagree. Its tests pin today's behaviour first (the regression net), then the zones.
- **Starting zones** are code, not rows: `src/domains/delivery/presets.ts` — Metro (the 8 X-class cities of the
  7th Pay Commission HRA list, as districts), Tier 2 (the Y-class cities, as districts), Special (states/UTs: the North
  East eight, J&K, Ladakh, Andaman & Nicobar, Lakshadweep), Rest of India. A shop's zone row says `preset: 'metro'` or
  holds its own PIN codes/prefixes. The lists carry their source and date (integration-researcher checks the HRA list).
- **The date**: the latest day of the zone's range from dispatch (working days, the cutoff time in IST, ship days,
  holidays); never a countdown. `src/domains/time` for IST days.

## Data (one migration + RLS, its tenancy proof)
- `delivery_zones` (tenant_id, id, position, name, preset text null, pincodes text[] (6-digit or 3-digit prefixes;
  ≤ 5,000), charge paise, free_above paise null, days_min, days_max, cod_on, cod_fee paise, cod_max paise null,
  updated_at) — PK (tenant_id, id); unique (tenant_id, position); CHECK days, money ≥ 0, preset in the list.
- `delivery_rules` (tenant_id, pincode, rule 'no_delivery'|'prepaid_only'|'cod_max', cod_max paise null, note ≤ 120,
  created_at) — PK (tenant_id, pincode).
- `shop_holidays` (tenant_id, day date, name ≤ 60) — PK (tenant_id, day); ≤ 60 a shop.
- `shop_settings` gains `dispatch_cutoff` (time, IST, null = none) and `ship_days` (smallint bitmask, default Mon–Sat).
- Grants: frata_app select/insert/update/delete on the three tables, `tenant_rows` policy; revoked elsewhere.
- Registry: `delivery_zones` module — billing `plan` (Growth and Scale features), `addOnFor: ['launch']`, status
  `now`, group "Get paid and ship"; `addon_prices` row v1 = 99900. MODULE_KEYS-derived CHECKs updated in the same
  migration (tenant_modules, tenant_addons, app_interest, plan_versions features). New Growth and Scale plan versions
  carrying the feature (an Admin step, documented in setup).

## Reads and writes
- Storefront: `GET /api/shop/delivery?pin=302012` (host → tenant; rate-limited like `/api/shop/pincode`) returns only
  `{ place, deliverable, codAllowed, codFee, charge, freeAbove, by }` — public prices the shopper pays, never a cost
  (ADR-0003). Cached per (shop, pin) for 10 minutes with the shop's settings tag; the product page stays static.
  `/api/shop/pincode` folds into it.
- Console: `src/lib/queries/delivery.ts` (one `withTenant`); actions in `apps/delivery_zones/actions.ts`:
  save zone, reorder, delete, add/remove rule, import CSV (≤ 5,000 rows, parsed and validated on the server, a preview
  before save), export CSV, save dispatch + holidays — CAN_MANAGE, Zod-capped, audited, refused on a support visit
  where it changes what shoppers pay (`managesInPerson`), `refreshShop(tenant, 'settings')` after each.
- Turning the app on copies nothing: with no zone rows, `setup` is today's settings (call 2: nothing changes for
  shoppers until the brand edits). The first save writes the four starting zones from today's numbers.

## Screens (as approved)
- Storefront (PD·0): the PIN code check under the buy box (all themes' product sections, behind one `<DeliveryCheck>`;
  the PIN code remembered in the shopper's own browser); the bag/checkout show delivery, the pay-on-delivery fee and
  both totals before paying, and "Arrives by …".
- Console (PD·1): AppHome "Delivery Zones" — Zones (table, Add a zone, edit dialog, reorder), PIN code rules (search,
  Add, Import CSV with preview, Export), Delivery dates (dispatch, cutoff, ship days, holidays, the per-zone preview),
  Usage and billing. Settings › Shipping and delivery and Pay on delivery link here when the app is on (one place to
  edit; never two).
- Launch: the app's page with ₹999/month; until A3 its button is "Ask Frrata to add" (A3 brings the trial).

## Tasks (each: tests first, `npm test`, typecheck, impact-reviewer on its diff)
1. **Regression net:** vitest pinning today's `shippingFor`/`codFor`/`arrivalRange` results across their branches;
   e2e checkout flows (orders, checkout) green on main.
2. `resolve.ts` + `presets.ts` + dates (pure) with tests: first-match, rule beats zone, prefix vs exact, no directory
   row, cutoff before/after, Sunday, holidays, made-to-order and pre-order lines, COD max with the fee.
3. checkout/quote/amounts/buy-box read `resolveDelivery` (no behaviour change without zones: task 1's tests stay green).
4. Migration + RLS + proof + registry + addon price; verify:tenancy.
5. `/api/shop/delivery` + `<DeliveryCheck>` + bag/checkout lines (PD·0); e2e: check three PIN codes, the bag totals.
6. Console app: queries, actions, the three tabs, CSV import/export; e2e: add a zone, a rule, a holiday → the product
   page and checkout follow; Launch sees ₹999 and Ask; staff see no edit.
7. Skills (design-language: the check and the zone screens; architecture: resolveDelivery as the one rule;
   unit-economics: ₹999 on Launch and the hypotheses), reviews on the diff, merge, migrate, deploy.

## Design review (frata-planning § 3)
- **UI/UX:** states — no PIN code typed, invalid, not in directory, delivered, pay online only, not delivered, COD over
  the limit; console: no zones yet (today's settings shown as one zone), many zones, CSV errors with line numbers,
  phone. One primary action per tab. No countdown.
- **Tenancy:** three tables with RLS and proof; the storefront endpoint resolves the tenant from the host only.
- **SSOT:** `resolveDelivery` is the only place delivery charge, COD and the date are decided.
- **YAGNI/KISS:** presets in code; no per-product rules; no weight; no courier calls (Ship parked).
- **Performance:** the check is a cached small response; zones ≤ 50, rules ≤ 5,000 read once per quote by indexed
  tenant; prefix match in memory.
- **Reliability:** no outbound call; a missing directory row degrades to the default zone.
- **Security:** costs never in the endpoint; CSV parsed server-side with caps; actions CAN_MANAGE + audited.
- **Unit economics:** ₹999/month on Launch (owner); in Growth/Scale. Run unit-economics-reviewer on the price and on
  what zone charges do to a shop's free-delivery economics.
- **Blast radius:** every caller of shippingFor/codFor/arrivalRange; the storefront product sections; e2e 5x checkout.

## Out of scope
PD·2 (prepaid-only suggestions, numbers by zone, with True Profit + A3), PD·3 (courier serviceability with Ship),
partial COD, same-day, weight-based charges.

## Review findings
(filled after the agents run)

## Review findings (2026-11-12) — folded in; these override the sections above where they differ
| Agent / finding | Fix |
|---|---|
| Arch B1: `billing: 'plan'` + `addOnFor` cannot work (ADD_ONS CHECK, offerFor says See Growth) | `billing: 'add_on'`, `addOnFor: ['launch']`; the migration appends `delivery_zones` to the CURRENT Growth and Scale versions' features (as 0075/0078) and regenerates every MODULE_KEYS CHECK incl. `module_pauses_module`, `addon_prices_module` |
| Arch B1 (consequence) + mockup: Launch shows "Start free trial" | Delivery Zones is now the FIRST built add-on, so A3 (self-serve trials, designed and reviewed in `2026-11-12-true-profit-a3.md`, all its findings) ships with PD·1 for Launch; True Profit reuses it later |
| Speed H1: zone PIN arrays → 2.2 MB a shop, no index under RLS | `delivery_zone_pins (tenant_id, pin, zone_id)` PK (tenant_id, pin), pin = 6 digits or a 3-digit prefix (CHECK); ≤ 5,000 pins a shop across zones and ≤ 5,000 rules, counted under a row lock; matched with `pin in ($pin, left($pin,3))` |
| Speed H2 / Arch M4 / Sec H1: what checkout reads | `deliveryIn(tx, tenantId, pin)` reads ≤ 50 zones (no pins), the rule by PK, the zone pin by PK, holidays from today, the `pincodes` row, and module access via `moduleAccessIn(tx)` — inside `quoteData`'s existing Promise.all and beside `checkoutShop` in `place.ts`; place = the directory row, never the typed address (a mismatch is a COD risk reason); never `placeForPincode` or a cached loader inside the tx (P4) |
| Arch M4: callers and contract | `quote(..., delivery)` signature; callers `api/shop/quote`, `place.ts` (incl. `fitOffers`), `payment.ts` (switch to COD), `orders/amounts.ts` reprice (keeps the order's stored shipping in its COD limit test); "Don't deliver" is a `Quote` field, a named refusal at placement and a state in `publicQuote`, the bag and checkout; the promised date written to `orders.arrives_to` at placement |
| Arch M2: other places that state delivery | The shipping policy page, Google shipping structured data, the product page's ships-in line, the free-shipping promise and readiness check, the Settings summary all read the setup (by zone, or "from ₹X"); the client copy `codWhyNotText` is deleted (the server sends the words) |
| Speed H3 / Arch M6: the product page | The buy box keeps the default zone's public numbers; per-PIN answers come only from the endpoint, which returns the zone's terms (charge, free above, COD on/fee/min/max, days) so the buy box applies them to the price and product (pre-order/made-to-order dates via the handle); `presets.ts` is server-only and listed in `check-client-bundle` |
| Speed M4 / Arch M5 / Sec M1: caching | No per-PIN cache: one `shopCached('delivery')` per shop (compiled setup ≤ 150 kB, a size test) + a global per-PIN directory entry (1 day); resolve with `now` per request |
| Speed M5 / Arch M5: tags | A new `'delivery'` scope (`shop:<t>:delivery`) in `shopCached`/`refreshShop`; `'shop'` purged only when the default zone's numbers change |
| Sec L1 / Arch M5: the endpoint | POST through `shopRequest` (host → shop, Origin, 32 kB, per-/64 limit) with its own `LIMITS.deliveryIp`, fails open (public data), the shop-open check; replies with named fields only (no note, rule kind, zone id, cost); harvesting a shop's public delivery terms is accepted. It is the Storefront API's delivery resource (ADR-0014) |
| Sec M2 / Arch M7: who edits | One rule on both paths: today's `CAN_BUILD` (owners, admins, partners before handover), support visits allowed and audited as today; writes through `asModule('delivery_zones', …)`; while the app is usable `saveSection` refuses the delivery and COD fields on the server (one editor) |
| Arch M3: today's settings | The floor stays in `shop_settings` and always applies (every plan): flat charge, free-above, COD on/min/max/fee, the no-COD list (shown read-only in Rules as "from Settings"). Zones and rules apply on top only while the app is usable; when it is off, paused, lapsed or downgraded the shop falls back to the floor and the console says so on its home and in Settings |
| Sec M3 / Speed M6: sizes and CSV | Byte cap 256 kB before parsing; strict parser (fixed columns, PIN regex, rule enum, note ≤ 120, control chars stripped); preview returns counts and errors only; save re-validates the file server-side and writes with one `unnest` insert in one transaction; totals per shop enforced under a lock |
| Sec M4: record of what was shown | `checkout.shown` stores the resolved delivery charge and COD fee |
| Sec L2: export | The existing CSV cell helper (`src/domains/tax/gstr1-files.ts`), attachment, no-store, `requireMember` |
| Sec L3: audit | Each action writes a member audit row in its transaction; detail = counts or the one PIN changed |
| Sec L4: the remembered PIN | `localStorage` on the shop's own host, never a cookie; never in pixels, attribution or EkCode |
| Speed L7: console | Rules paged at 100 with server-side search; each tab loads its own data; export streams |
| Arch minor | Position unique `DEFERRABLE`; `cod_max is not null ⇔ rule='cod_max'`; "COD only above an amount" stays the floor's `cod_min` (zones carry `cod_min` too); an int test that every preset district matches the loaded directory; presets versioned; tenancy proof cases named for all four tables; e2e 10, 47-offers, 50, 60, 64, 05-shop-look baselines and the 95-speed budget in the blast radius |
| UE: ₹999 on Launch | Recorded as a hypothesis against Pindrop Pro (≈₹879) and the 500-PIN floor list; the case rests on zone charges (a ₹60 far-zone charge keeps ~₹2,763/month on a ₹599 × 300 shop before lost conversion); tests: a backtest of Launch shops' pincodes above COD break-even, and alternate-week far-zone charges at 2–3 partners |
| **UE: the plan nudge ignores add-ons a higher plan includes** (`src/domains/billing/ladder.ts`) | Fixed before PD·1 ships: `wouldBeOn` drops an add-on the target plan includes (a ₹4,500 × 80 shop on Launch + Delivery Zones is ₹649 cheaper on Growth); a test |
