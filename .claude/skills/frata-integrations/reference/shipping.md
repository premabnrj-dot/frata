# frata-integrations — Shiprocket and PIN code delivery

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Shiprocket — checked 2026-11-08
- PIN code delivery

## Shiprocket — checked 2026-11-08 (integration-researcher; research `docs/research/2026-11-08-ship.md`)

The API reference (apidocs.shiprocket.in; JSON at documenter.gw.postman.com/api/collections/8407119/SzYW1zB2)
has NO date (publishDate 2020-03-27, version 8.12.12, one sample dated 2026-04-29). Facts from it are primary
but undated: tagged [P/U]. Recheck against the live collection before building. Amounts are RUPEES.

- **Auth**: seller creates an API user, Settings → API → Add New API User; email ≠ main login; pick "Modules to
  Access" and "Buyer's Details Access"; password shown once [P/U]. `POST https://apiv2.shiprocket.in/v1/external/
  auth/login` → Bearer token, "The validity of this token is 10 days" [P/U; help article 2021-09-06 says 240 h].
  (Corrects 2026-11-06 "24 h": no source.) Store the API user's email + password sealed; re-login before day 10
  or on 401.
- **No OAuth, partner token or multi-seller API** in the docs or on /partners (referral-style affiliate/channel/
  incubator) [U, undated]. Terms (undated) say nothing on API use or third parties holding credentials [U]. Ask
  Shiprocket in writing before launch (business track).
- **Custom channel** `POST /channels` (name ≤ 12) is gated: allow-listed per account by Shiprocket [P/U].
- **Order** `POST /orders/create/adhoc`: order_id, order_date, pickup_location (an existing name only), billing_*
  (name, address, city, pincode, state, country, email, phone), shipping_is_billing, order_items[name, sku, units,
  selling_price], payment_method "COD"|"Prepaid", sub_total (₹), length/breadth/height cm > 0.5, weight kg > 0
  [P/U]. Pickup locations `GET /settings/company/pickup`.
- **Rates / serviceability** `GET /courier/serviceability/` pickup_postcode + delivery_postcode required; cod 1/0 and
  weight (kg) conditional; optional order_id, length/breadth/height, declared_value (₹), mode Surface|Air, is_return,
  only_local, qc_check. Per courier in data.available_courier_companies[]: cod (1/0), cod_charges,
  estimated_delivery_days (string), etd ("Jul 01, 2024"), etd_hours, edd/new_edd, cutoff_time, freight_charge, rate,
  rto_charges, cost, zone ("z_e"), metro, region, is_surface, odablock, blocked, suppression_dates;
  data.recommended_courier_company_id, blocked_courier_companies[{block_reason, courier_company_id, postcode}]. Field
  meanings undocumented [P/U, collection undated, read 2026-11-12]. A quote, never the cost; freight_charge, rate,
  cod_charges, rto_charges and cost are the MERCHANT'S cost (ADR-0003): never in a storefront response. Rate limit
  `X-RateLimit-Limit: 180`, window unstated [U]: never a live call per shopper; a per-shop pincode table refreshed
  through the outbox.
- **Blocked PIN codes** `POST https://serviceability.shiprocket.in/v1/external/blocked-pincodes/upload`
  {postcode:{delivery_blocked:[…]}, action:"block"|"unblock"} ("unblock" fails whole if any PIN is invalid);
  `GET …/v1/external/block-pincodes/get` is_download|search|per_page ≤ 15|current_page [P/U, read 2026-11-12].
- **Promise / EDD**: Shiprocket Promise (Shopify) $0.02 per order, 1.5★/19 [V-undated, newest review 2026-08-11]; own page
  "₹1.49 per order" [V-undated, © 2026] — conflict. Fastrr Promise / Smart EDD (2025-09-26) $2.99 / $14.99 / $49.99 /
  $199.99 a month by 0–100 / –1,000 / –5,000 / 5,000+ orders; rules by PIN code, SKU, zone; 2.4★/14 [V-undated, newest
  review 2026-10-09]. Shiprocket Checkout shows EDD; price unpublished [V-undated, 2026-11-12].
- **Zones**: A city, B state/region, C metro–metro, D rest of India, E special. Couriers disagree: Delhivery E = Jammu, HP,
  NE excl. Manipur; F = Kashmir, Manipur, Ladakh, Andaman & Nicobar [V, help.delhivery.com/docs/rate-card 2024-12-20];
  Shiprocket E = NE, J&K, Kerala, HP [V, support 2022-12-13] vs NE + J&K [S, blog 2019-08-30]; aggregators 2025–26 say
  NE + J&K (Shipway 2025-08-07, NimbusPost 2026-05-14), add Andaman (ShipyBox 2026), or "differ between courier partners"
  (RapidShyp 2026-09-22) [S]. Lakshadweep: in no courier's own page [U]. No courier zone page dated in the last 12 months
  (2026-11-12). The serviceability response carries `zone` per courier: read it, never a fixed table; a "Special"
  preset is a merchant default, not a courier fact.
- **HRA city classes** (Delivery Zones presets): DoE OM 2/5/2014-E.II(B) 2015-07-21, Annexure repeated in OM
  2/5/2017-E.II(B) 2017-07-07, + Mathura-Vrindavan Y from 2020-03-01 (OM 2/4/2018-E.II(B) 2020-02-25); no later
  classification OM on doe.gov.in/orders-circulars/32 (newest: compendium 2022-12-30) [V, read 2026-11-12; no source
  from the last 12 months]. X (8): Hyderabad, Delhi, Ahmadabad, Bengaluru, Greater Mumbai, Pune, Chennai, Kolkata.
  Y = 88 Annexure entries + Mathura-Vrindavan = 89 (Faridabad, Gurgaon, Ghaziabad, Noida starred for dependency HRA).
  Classes are by Census-2011 urban agglomeration, not district. 8th CPC constituted 2025-11-03, no report yet [V].
- **Directory district names ≠ city boundaries** [S, api.postalpincode.in, 2026-11-12]: `Mumbai` covers Andheri and
  Kandivali, `Bangalore` includes rural 562157, Hyderabad is split across `Hyderabad` and `K.V.Rangareddy`, Kolkata
  across `Kolkata` and the 24 Parganas. So Delivery Zones' presets match PIN-code PREFIXES (src/domains/delivery/
  presets.ts), never district names; the directory gives only the place name shown to the shopper.
- **AWB** `POST /courier/assign/awb` (shipment_id; courier_id optional, default courier otherwise; `reassign` once
  per 24 h). **Pickup** `POST /courier/generate/pickup`; `/manifests/generate`, `/manifests/print`,
  `/courier/generate/label`, `/orders/print/invoice`; wrapper `/shipments/create/forward-shipment` [P/U].
- **Cancel** `POST /orders/cancel`; a shipment only before "Out for Pickup" [P/U].
- **Track** `GET /courier/track/awb/{awb}`, `POST /courier/track/awbs` (≤ 50) [P/U].
- **NDR** `GET /ndr/all`, `GET /ndr/{awb}`, `POST /ndr/{awb}/action` re-attempt | return | fake-attempt + comments;
  phone, address1/2, deferred_date optional; no re-attempt limit documented [P/U].
- **Actual freight** = `GET /account/details/statement` rows by awb_code (debits, credits, billed weight); weight
  disputes `GET /billing/discrepancy` [P/U]. Forward freight debited at processing and credited on cancel; RTO
  freight charged; COD charge reversed on RTO [U, support 2024-10-16].
- **COD remittance: no API endpoint** [P/U]; panel only, "8-9 days" after delivery [U, 2020]. Cash on Demand
  (Sep 2026), Finances dashboard (Mar 2026) [V, blog 2026-10-05 / 2026-04-01].
- **Rate limit** undocumented; samples show `X-RateLimit-Limit: 180`, window unstated; 429 = exceeded [P/U].
- **Webhook** (tracking only): the merchant sets it in Settings > API > Webhooks, per account, no API; optional
  token sent as `x-api-key`, **no signature** (ADR-0006 exception: Frrata requires the token, constant-time
  compare); the URL must not contain "shiprocket, kartrocket, sr, or kr"; "send only code 200" [P/U]. Retries,
  timeout, ordering, duplicates, event id undocumented [U] → key `shiprocket:awb:shipment_status_id:
  current_timestamp`, order by current_timestamp, drop unknown AWBs (every account event arrives), plus a
  reconciliation sweep (bulk track). One URL per account or several: [U].
- **Payload**: awb, courier_name, current_status(_id), shipment_status(_id), current_timestamp, order_id,
  sr_order_id, etd, scans[], is_return, pod_status, pod. Map on `shipment_status_id` [P/U].
- **Status ids**: 6 Shipped, 7 Delivered, 8 Canceled, 9 RTO Initiated, 10 RTO Delivered, 12 Lost, 13 Pickup Error,
  15 Pickup Rescheduled, 17 Out For Delivery, 18 In Transit, 19 Out For Pickup, 20 Pickup Exception, 21
  Undelivered, 22 Delayed, 24 Destroyed, 25 Damaged, 27 Pickup Booked, 38 Reached Destination Hub, 40 RTO_NDR,
  41 RTO_OFD, 42 Picked Up, 45 Cancelled Before Dispatched, 46 RTO In Intransit, 76 Untraceable, 77 Issue
  Related To The Recipient, 78 Reached Back At Seller City [P/U].
- **Pricing**: Lite free (≤ 5 orders a month), Business ₹199, Advanced ₹499, Pro ₹799 a month, refunded at
  100/500/1000 shipments [U, pricing page undated, read 2026-11-08]; "from Rs.20/500gms"; COD "₹36 fixed OR
  1.5–2.5%", whichever higher [S, 2026-05-07]. Never hard-code a rate.
- **2026**: Address Update API lat/long, Order API `box_name`; old NDR report deprecated May 2026 [V, blog
  2026-05-01]. No API v2 deprecation found [U].
- **Competes with Frrata**: Fastrr (10 Jul 2026): checkout, ads on "True Delivered ROAS", RTO risk on profiles,
  WhatsApp [S]; Engage Instagram channel and WhatsApp templates [V, blog 2026-08-24]. Listed 19 Aug 2026 [S].
  Shiprocket sees every order shipped through it.
- **Alternatives** (no current dated API page): Delhivery One (token, Settings > API Setup), iThink (access token
  + secret from iThink), Shipway (username + licence key) [U].

## PIN code delivery (competitors, data, RTO) — checked 2026-11-12 (integration-researcher)
- GoKwik: gokwik.co/pricing Emerging ₹3,000/month, 0–2,000 orders, "COD 3.5% Applicable on all transactions", PA charges
  extra; Enterprise custom [V-undated]. Shopify listing: Emerging $35/month + 3.5% on PA transactions, "Blocking COD for
  unlimited pincodes", RTO Intelligence, custom COD fees, prepaid incentives; 4.7★/399 [V-undated, newest review
  2026-10-30]. The two prices conflict; what the 3.5% is charged on: [U].
- Pindrop (Shopify, 2026-06-18): Free 500 PIN codes; $2.99 Growth (COD rules, 10 zones); $9.99 Pro; Metro / Tier 2 / rest
  zones, COD vs prepaid windows, blackout dates, a cutoff countdown (false urgency: never copy) [V-undated, review 2026-09-26].
- Delhivery `track.delhivery.com/c/api/pin-codes/json/` flags prepaid + COD, "NSZ" = not serviceable; params undocumented
  [U, undated]. Shadowfax: no public PIN code API found [U].
- India Post directory (data.gov.in, GODL-India): unreachable 2026-11-12 (403/503) [U]. Mirror: CircleName, RegionName,
  DivisionName, OfficeName, Pincode, OfficeType, Delivery, District, StateName, Latitude, Longitude; 157,087 rows; 9,260 rows
  with unusable coordinates [S, datahub.io 2026-10-03]. Never trust a row's lat/long without a check. Frrata's `pincodes`
  table is EMPTY: its loader (scripts/data/load-pincodes.mjs) was never written (2026-11-12).
- RTO by tier (all modes): metro 6.60%, T1 8.10%, T2 11.50%, T3+ 12.00% (Oct–Nov 2025, 35.8M orders); COD 37.51% vs
  prepaid 5.28% (FY26); fashion COD RTO 21–32% [S, ClickPost 2026-11-09]. No official national rate.
- Law: total price with a break-up incl. delivery (r.7(1)(e)) [S, indialaw 2026-08-24]; from 1 Jan 2027 r.7(1)(a) "delivery
  and shipment, cost of return shipping, mode of payments" [V gazette 2026-11-11]; Zepto ₹7 lakh for a handling charge
  added at checkout, FirstCry ₹2 lakh to disclose extra costs upfront [S, PolicyEdge 2026-08-04]. Show the delivery charge
  and COD fee before checkout. No rule requiring a delivery date found [U].
