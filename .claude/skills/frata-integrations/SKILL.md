---
name: frata-integrations
description: Use when building, planning or answering questions about a Frata connector - Razorpay (partner, sub-merchants, Route, webhooks), Shiprocket (API, rate shopping, NDR, COD remittance), Meta (Tech Provider, WhatsApp Cloud API, pricing, Conversions API, Instagram), Google (Merchant API, Ads, GA4, OAuth verification) or email - and for which facts about them are verified, when, and where from.
metadata:
  version: 1.15.0
  verified: 2026-11-09
  decisions: [ADR-0006]
---

# Frata integrations

**Facts here expire.** Each carries the date it was checked and a tag: [V]
primary source or several independent ones · [S] vendor/affiliate only · [U]
unverified. Older than 90 days or [S]/[U] and you are about to build on it →
run the `integration-researcher` agent first, then update this file and bump
the version. Full research: `docs/research/2026-11-06-market-ux-and-stack.md`.

## Rules for every connector

1. Outbound calls are `outbox` rows (ADR-0006), sent by a sender registered for
   the row's `kind`; every request through `fetchWithTimeout`.
2. Inbound webhooks: verify on the raw body, store under our key, answer 200,
   process later. Route listed in `scripts/check-actions.mjs` ENTRY_POINTS.
3. Per-merchant credentials live in a tenant table, encrypted; never in env,
   never logged, never sent to a browser.
4. A connector's state is shown to the merchant in words on the Channels hub:
   connected · needs attention (with the one action) · not connected.
5. Everything the platform must apply for (Meta app review, Google OAuth
   verification, Razorpay Aggregator) is in the **legal entity's** name — a Pvt
   Ltd before the first application (re-verifying later means downtime).

## Razorpay — checked 2026-11-07

Razorpay doc pages carry no date of their own; dates are each page's `lastmod`
in razorpay.com/docs/sitemap.xml (most read 2026-10-08, a bulk rebuild).

- Partner Program → request the **Aggregator** partner type → sub-merchant
  onboarding APIs; sub-merchants must be activated before collecting [V, 2026-11-06].
- Aggregator partners have owner access to sub-merchant dashboards and earn a
  share of the platform fee when the partner key is used; rates unpublished [V/U, 2026-11-06].
- Route linked accounts (split settlements) only after Razorpay reviews the
  partner's documents [V, 2026-11-06].
- Webhooks: `X-Razorpay-Signature` = HMAC-SHA256 of the RAW body with the
  per-webhook secret (the secret is optional in the dashboard — require one);
  2xx within 5 s or it is retried, exponential backoff for 24 h from event
  creation; disabled after 24 h of failures, re-enabled by hand; dedupe on
  `x-razorpay-event-id` (at-least-once); public URL, ports 80/443, ≤ 30 URLs an
  account [V, docs/webhooks/best-practices + validate-test, lastmod 2026-10-08].
  Implemented: `src/lib/webhooks/razorpay.ts`.
- Webhooks by API exist only for partners (`POST /v2/accounts/{id}/webhooks`,
  access token). With merchant-pasted keys the MERCHANT creates the webhook in
  their own dashboard and gives us its secret [V partner API; own-account API
  not documented, U; 2026-11-07]. A path segment per shop is not forbidden [U].
- Standard Checkout events to enable: `payment.captured`, `payment.failed`,
  `order.paid` (the only order event) [V, standard/best-practices, 2026-10-08].
- Orders API: `amount` (paise, min 100) and `currency` required; `receipt` ≤ 40
  chars, unique; `notes` ≤ 15 pairs × 256 chars; `partial_payment` default
  false; one successful payment per order, a late authorised one is refunded;
  **no documented order expiry** [V, docs/api/orders/create lastmod 2026-11-04;
  payments/orders 2026-10-29].
- Payment signature: `hmac_sha256(OUR order_id + "|" + razorpay_payment_id,
  key_secret)` — never the order id Checkout returns [V, standard/integration-steps, 2026-10-08].
- Checkout `timeout` is in seconds, no documented min/max, and may overrun in a
  background tab: the server never relies on it [V, 2026-10-08]. (Our earlier
  "timeout under 15 min" note had no source — removed.)
- Prefill `name`, `email`, `contact` (optional, `+91…`); `readonly`/`hidden`
  booleans; with `callback_url` the handler is bypassed [V, 2026-10-08].
- Capture: automatic by default; per-order `payment: { capture, capture_options:
  { automatic_expiry_period (min 12 min) … } }` overrides the dashboard; window
  12 min – 3 days; uncaptured payments auto-refund at normal speed (5–7 working
  days) [V, payments/capture-settings lastmod 2026-10-29].
- Keys: `rzp_test_` / `rzp_live_` prefixes (live needs KYC); Basic auth
  `KEY_ID:KEY_SECRET`; a read-only check is `GET /v1/payments?count=1`; the HTTP
  status for a wrong key is not documented [V/U, 2026-10-08].
- Refund: `POST /v1/payments/:id/refund` (no amount = full); `speed` normal
  (default, 5–7 working days) or optimum [V, api/refunds/create-normal, 2026-10-08].
- UPI Collect deprecated for P2M from 28 Feb 2026; UPI Intent is the default on
  mobile web, QR on desktop [V Razorpay / S NPCI, 2026-11-07].
- UPI MDR 0.4% on P2M UPI above ₹2,000 (cap ₹300 at ≥ ₹75,000) was due 15 Oct
  2026; NPCI deferred it on 13 Oct to "post Diwali", date to be notified;
  small-merchant zero MDR is defined on UPI **QR** receipts ≤ ₹1 lakh/month and
  may not cover online checkout [S, PayU 2026-10-15, Medianama 2026-10-13; NPCI
  text not read]. (Corrects the 2026-11-06 note, which said "from 15 Oct 2026 [V]".)
- Magic Checkout ~0.65–0.75% per order (competitor reference) [S, 2026-11-06].
- No RBI/NPCI rule on cash on delivery found [U, 2026-11-07].

## Commerce law and checkout references (offers) — checked 2026-11-08 (research `docs/research/2026-11-08-coupons.md`)

- Apparel GST 5% ≤ ₹2,500 a piece, 18% above, from 22 Sep 2025 [V PIB 2025-09-17; S LS Q2509 2025-12-15]; the slab is on
  the post-discount pre-GST value per piece [S] (decision 1, plan 2026-11-08-offers).
- s.15(3)(b) substituted from 1 Nov 2026 (N 03/2026-CT): a post-supply discount needs a credit note and ITC reversal [V by
  two sources, gazette unread]. BOGO = two supplies at one price, rate per s.8 (Circular 92/11/2019) [V].
- E-Commerce (Amendment) Rules 2026, GSR 789(E), from 1 Jan 2027: a price cut shows the prior price = the lowest in 30
  days; yearly dark-pattern self-audit and certificate [V TaxHeal 2026-09-16 / Bar & Bench 2026-09-28; gazette unread].
- No sale above MRP including taxes (Legal Metrology r.18(2), r.2(m)) [V, consolidated to 2026-02-13].
- A purchase-linked contest or game of chance is an unfair trade practice unless prescribed (CPA s.2(47)(iii)(b)) [S].
- CCPA: recurring countdowns treated as false urgency; fees added at checkout as drip pricing; penalties ₹1–7 lakh so far
  [S Bar & Bench 2026-09-01; LS Q5415 2026-03-25].
- Razorpay Magic Checkout: auto-apply best coupon; "unavailable" coupons shown disabled until eligible; prepaid-only
  coupons remove COD; budget, total and per-customer limits; prepaid discount on COD orders excludes shipping and COD fee
  [V magic-checkout/shopify/features lastmod 2026-10-23; order-settings/prepay-cod lastmod 2026-10-08].
- Baymard: collapse the promo field and auto-apply (83% of sites don't) [V 2026-06-01]; show free-shipping qualification
  in the cart summary [V 2026-11-02].

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
- **Rates** `GET /courier/serviceability/` pickup_postcode, delivery_postcode, cod 1/0, weight (or order_id); per
  courier courier_company_id, freight_charge, cod_charges, rate, rating, estimated_delivery_days, etd, rto_charges;
  top-level recommended_courier_company_id. Field meanings undocumented [P/U]. A quote, never the cost.
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

## Meta — checked 2026-11-07 (WhatsApp: integration-researcher; spec docs/specs/2026-11-07-communication.md; templates, sends, errors, webhooks, opt-in rechecked 2026-11-09 — docs moved to developers.facebook.com/documentation/business-messaging/whatsapp/, pages undated)

- **Tech Provider**: business verification, App Review (two screencasts: a message sent and received,
  template creation), access verification. Onboarding limit **10 new customers per rolling 7 days by
  default; 200 after the three** [V, embedded-signup/overview]. Tech Partner upgrade: ≥2,500 average daily
  messages, ≥10 active clients, ≥90% quality [V].
- **No credit line**: customers add their own payment method in WhatsApp Manager; Meta bills them [V,
  solution-providers/overview]. India accounts must bill in **INR by 31 Dec 2026**, else delivery stops 1 Jan 2027 [V].
- **Embedded Signup**: v4 (8 Oct 2025) is the default; v2/v3 were deprecated 15 Oct 2026 and are served as v4. **v5 released 20 Oct 2026**
  (`extras:{version:"v5"}`): coexistence on by default, session data has NO `waba_id` (`messaging_account_ids`, `primary_waac_ids`,
  `is_on_biz_app` instead) [V, embedded-signup/versions + version-5, 2026-11-07]. Frrata builds on v4 and reads ids on the server.
  SDK `https://connect.facebook.net/en_US/sdk.js`; Graph **v27.0** is latest (undated [U]), Frrata calls **v26.0** (29 Jul 2026).
  `FB.login(cb,{config_id, response_type:'code', override_default_response_type:true, extras:{setup:{}}})`; coexistence on v4 adds
  `featureType:'whatsapp_business_app_onboarding'`, `sessionInfoVersion:'3'` [V].
- Event `message`, `data.type==='WA_EMBEDDED_SIGNUP'`, Meta's check `event.origin.endsWith('facebook.com')`; events FINISH,
  FINISH_ONLY_WABA, FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING, FINISH_GRANT_ONLY_API_ACCESS, CANCEL (`current_step`), ERROR
  (`error_message, error_code, session_id, timestamp`); v4 data `phone_number_id, waba_id, business_id` [V, implementation, 2026-11-07].
- Code lives **30 s**. `GET /oauth/access_token?client_id&client_secret&code` (no redirect_uri documented) →
  `{access_token, token_type:"bearer"}`, a business integration system user token per customer; lifetime not stated [V/U, 2026-11-07].
- Never trust the browser's ids: `GET /debug_token?input_token=<token>` (app token `APPID|SECRET`, server only) →
  `granular_scopes[scope=whatsapp_business_management].target_ids`, newest first; fallback
  `GET /{portfolio}/client_whatsapp_business_accounts` [V, solution-providers/manage-accounts + reference/debug_token, 2026-11-07].
- Number health on `/{phone_number_id}?fields=` (and the `/{waba}/phone_numbers` edge): `display_phone_number, verified_name,
  quality_rating, code_verification_status, name_status` (beta), `status, throughput, is_on_biz_app, platform_type, health_status`
  (`can_send_message` AVAILABLE/LIMITED/BLOCKED), `whatsapp_business_manager_messaging_limit` (**`messaging_limit_tier` is
  deprecated**; values seen: TIER_250 [V, example]; TIER_50…TIER_UNLIMITED and UNTIERED on the WABA field [V, reference]; TIER_1K/2K/10K/100K by the
  documented ladder [U]) [V, manage-phone-numbers + messaging-limits + health-status, 2026-11-07].
- Cloud API number: `POST /{waba_id}/subscribed_apps` (no body) → `POST /{phone_number_id}/register`
  `{messaging_product:"whatsapp", pin:"6 digits"}`; 10 register or deregister calls per number per 72 h, then 133016 [V, 2026-11-07].
- Coexistence number: **do NOT register**; within **24 h** `POST /{phone_number_id}/smb_app_data` `{messaging_product:"whatsapp",
  sync_type:"smb_app_state_sync"}` and again with `"history"`, each once only (returns `request_id`); subscribe history,
  smb_app_state_sync, smb_message_echoes, account_update [V, onboarding-business-app-users, 2026-11-07].
- Payment: **no field says "no payment method"**. A send fails with **131042** (payment account not attached, currency not set,
  timezone not set). WABA `currency` is the billing currency (the INR check); `primary_funding_id` exists but its empty meaning is
  undocumented, so Frrata does not read it [V fields / U inference, 2026-11-07].
- Disconnect: `DELETE /{waba_id}/subscribed_apps` → `{success:true}`; `POST /{phone_number_id}/deregister` (Cloud API only, keeps
  history). A coexistence number cannot be deregistered; the merchant disconnects in the app → `account_update` `PARTNER_REMOVED`
  [V, manage-webhooks + registration, 2026-11-07].
- **New account model** (GA 23 Sep 2026): a WhatsApp account (WAAC, holds the number) plus one Messaging
  account per partner (its id is the waba_id). **No number migration between providers**: the client shares
  its WhatsApp account. Paths move to the WAAC id by H1 2028 [V, account-model-evolution].
- **Coexistence** (Business app + Cloud API on one number): app 2.24.17+; history (6 months) and contacts
  sync once, within 24 h of onboarding; app-sent messages arrive as `smb_message_echoes`; 20 mps fixed;
  broadcast lists read-only, groups not synced, companions unlinked; disconnects after ~14 days without
  opening the app [V]. Available in India [S only].
- **Pricing**: per message since 1 Jul 2025. **From 1 Oct 2026 in-window utility and service messages are
  charged**; 1,000 free service messages per number per month [V]. Free entry point: Click-to-WhatsApp ads
  only, window up to 7 days [V]. India before GST: marketing ₹0.8631; utility, authentication, service
  ₹0.1150 [S, watsberry 2026-10-01; whautomate "October 1, 2026"; Gallabox lists 0.1323 = +15%, inferred markup].
  Authentication-international (₹2.4971 [S]) applies only when the WABA's Primary Business Location differs from the
  user's country; India's rose 1 Apr 2026; 30-day notice [V, pricing + authentication-international-rates, undated,
  read 2026-11-08]. Utility/auth volume tiers per market, monthly [V]. Prices change only on the 1st of a quarter, ≥ 1
  month's notice; charged on delivery [V, …/pricing, 2026-11-09]. India's utility rate stays [S].
- **Limits**: per business portfolio, shared by its numbers: 250 → 2,000 → 10,000 → 100,000 → unlimited [V].
- **Templates** (rechecked 2026-11-09, …/templates/components + template-categorization + utility-templates, undated):
  marketing / utility / authentication; body ≤ 1024; ≤ 10 buttons, ≤ 2 URL, ≤ 10 quick reply, quick replies grouped apart
  from the rest; button text ≤ 25; URL ≤ 2000 with ONE variable at the end. Positional `example.body_text` is nested
  `[[…]]`; a URL button's `example` is the full URL in Meta's table but the suffix only in its JSON (conflict on Meta's
  page) [V-undated]. `parameter_format` NAMED|POSITIONAL, default unstated → always send it [U]. A `#` in a URL button: no
  source [U] (Reviews keeps the token as the last path segment and moves it into the fragment on its own page).
  Create → `{id, status, category}` [V]. Since 9 Apr 2025 a "utility" template judged marketing is APPROVED AS MARKETING;
  recurring re-checks with 1-day notice (none for warned businesses since 16 Apr 2025); 60 days to appeal. A feedback ask
  is utility only if tied to a specific order; generic asks and mixed content are marketing [V-undated]. Utility is paced
  only after a utility template was paused [V-undated].
- **Send errors** (…/support/error-codes, undated, 2026-11-09) [V-undated]: 131026 undeliverable (not on WhatsApp, ToS not
  accepted, old app); **131051 = unsupported message type** (our bug, not the recipient); 131042 payment method; 131056
  same-pair rate limit (retry later); 131049 ecosystem limit (wait ≥ 24 h); 131050 user stopped MARKETING; 132000 param
  count; 132001 template missing/not approved; 132015 paused; 132016 disabled for good (new template); 133010 number not
  registered; 368/131031 WABA restricted; 190 token expired; 130429 throughput. Sync vs webhook per code: undocumented
  [U] → handle both. Send response = accepted, not delivered; keep `messages[0].id` (the wamid).
- **Webhooks**: verify GET `hub.mode=subscribe`, `hub.verify_token`, reply 200 + `hub.challenge`; POST `object:"whatsapp_business_account"`,
  `entry[].id` (the WABA, by the payload shape [U]), `changes[{field,value}]`; `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 with the
  app secret (Meta says "payload"; we hash the raw bytes); retries up to 7 days, duplicates possible; ≤3 MB [V, webhooks/overview +
  create-webhook-endpoint, 2026-11-07]. Fields include messages, message_template_status_update, template_category_update,
  message_template_quality_update, message_template_components_update, user_preferences, account_update, account_review_update,
  account_alerts, phone_number_quality_update, phone_number_name_update, payment_configuration_update, history, smb_app_state_sync,
  smb_message_echoes [V-undated, 2026-11-09]. Template status: `event` ∈ APPROVED, ARCHIVED, UNARCHIVED, DELETED, DISABLED,
  FLAGGED, IN_APPEAL, LIMIT_EXCEEDED, LOCKED, PAUSED, PENDING, REINSTATED, PENDING_DELETION, REJECTED; `message_template_id`
  is a JSON INTEGER (compare as a string); also name, language, reason, message_template_category. template_category_update:
  notice {new_category (current), correct_category, category_update_timestamp +24 h}, done {previous_category, new_category}.
  Quick reply in: messages[].type "button", button {payload, text}, context.id = the template's wamid. Statuses sent,
  delivered, played, read, failed + errors[].code; `recipient_id`/`wa_id`/`from` may be ABSENT (BSUID users) → match on the
  wamid, never on the phone [V-undated, …/webhooks/reference/*, 2026-11-09]. Media URLs live **5 minutes** and need the token [V]. Usernames: a BSUID, phone may be absent [V].
- No agent concept in the Cloud API; policy requires a human escalation path; opt-outs honoured on or off WhatsApp, no
  mechanism prescribed [V, whatsappbusiness.com/policy, 2026-09-23]. "Opt-in must name the business" is in the developer
  page, not the policy [V-undated, …/getting-opt-in, 2026-11-09].
- **Conversions API** (rechecked 2026-11-08; Meta's server-event page shows no date, so treat as unverified-current):
  `event_time` ≤ 7 days before sending, and ONE older event fails the WHOLE request; `event_name` may be a custom
  event; `action_source` ∈ email, website, app, phone_call, chat, physical_store, system_generated,
  business_messaging, other; `event_source_url` required for website events. Send "Delivered" as a custom event at
  delivery time; drop anything over 7 days before batching; seconds, not ms. Which `action_source` fits a delivery is
  not documented [U]. Meta-hosted one-click CAPI (web events only) since 15 Apr 2026; no India-specific CAPI rule
  found [S, 2026-11-08].
- Instagram India: no in-app checkout; product tags click through to the site;
  shop eligibility uneven; commerce review up to 4 weeks [V/S]. DMs → assisted
  order creation, not automatic. Reels creator affiliate links launched in
  India in 2026 (3–15% commission) [S].

## Google — checked 2026-11-06 (Ads and GA4 rechecked 2026-11-08; OAuth verification, Search Console and Merchant API rechecked 2026-11-09)

- **Offline click conversions:** since 15 Jun 2026 the Google Ads API's `UploadClickConversions` fails
  (`CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`) for a project that did not upload between 17 Dec 2025 and 15 Jun 2026;
  new integrations use the **Data Manager API** (no developer token) [V developer docs, undated; Ads developer blog
  2026-05-15]. The Help Center says "January 2026 through June 2026"; the developer docs win.
- **Retractions:** the Data Manager API "doesn't support conversion retractions" (a restatement keeps the count). RETRACTION
  and RESTATEMENT stay on the Google Ads API (`ConversionAdjustmentUploadService`, a developer token; wait 4–6 h after
  creating a conversion action) [V content, undated, read 2026-11-08]. Whether the Ads API can retract a conversion sent
  through the Data Manager API: [U]. **So taking back an RTO order in Google Ads needs a developer token.**
- **GA4 Measurement Protocol `refund`:** `transaction_id` required; `currency` required with `value`; items optional
  (recommended for item-level refunds); partial-refund rules undocumented [V content, page date not visible, 2026-11-08].

- Content API for Shopping sunset 18 Aug 2026, degradation from 1 Sep → build
  only on **Merchant API v1** [V, Google].
- **OAuth app (Search Console + Merchant API), checked 2026-11-09** [V unless tagged; support.google.com/cloud and
  developers.google.com pages undated except oauth2/policies 2026-08-05 and the User Data Policy 2024-02-15]: Google Auth
  Platform pages Overview, Branding, Audience, Clients, Data Access, Verification Center; External. A separate Cloud
  project per tier (dev, prod) — previews never use the prod client; no wildcard redirect URIs.
- Scopes, the smallest set: `webmasters` (sitemaps.submit, sites.add; reads queries too), `siteverification.verify_only`
  (getToken + insert; makes the user an owner), `content` (Merchant API, asked only when Merchant Center is connected).
  Category of each: [U] — only the console's Data Access page shows it; record it there. Merchant API: OAuth
  verification review is mandatory [V]. CASA only for restricted scopes [V]; none known restricted [U].
- Branding: logo ≤ 1 MB, 120×120 square (docs/brand/png/frrata-icon-120.png); a logo or name on the consent screen needs
  brand verification (minutes automated, 2–3 business days manual); a pass lasts 7 days before publishing; scope review
  needs published branding. Homepage on a Search-Console-verified domain (by the project's Owner/Editor), not only a login
  page; privacy policy on the same domain; authorized domains before redirect URIs.
- Scope verification: a justification per scope (why narrower is not enough); a YouTube Unlisted video in English
  showing the app name, client_id in the address bar and each scope's feature. Apps in development or testing are not
  eligible → submit only once "Connect Google" works. Estimates: brand 2–3, sensitive up to 10 business days, restricted
  6 weeks + CASA.
- Testing mode: ≤ 100 test users; refresh tokens expire after 7 days. Production unverified: "unverified app" screen,
  100 new users for the project's LIFETIME, never reset. 100 refresh tokens per account per client; unused 6 months →
  invalid. The client secret is shown once.
- Merchant API developer registration: `registerGcp` once per Cloud project on Frrata's OWN production Merchant Center
  (verified website, Admin caller), not per merchant; else 401 UNAUTHENTICATED.
- No business, legal-entity or India-specific Google OAuth requirement found [U].
- Never send Google user data to ad platforms: Limited Use forbids "transferring or selling user data to third parties
  like advertising platforms" [V, User Data Policy 2024-02-15]. Google Ads developer token + brand verification [U, founder].

## Attribution signals (landing URL + referrer) — checked 2026-11-08 (integration-researcher, for analytics A1·2)

Meta, Instagram and WhatsApp publish nothing on what referrer a shop page receives, and most Meta/Google help pages carry
no date. URL parameters are the signal; the referrer is a hint. [V] read on the provider's or a standards body's own
page · [S] secondary only · [U] no current source.
- `fbclid`: Meta documents it only on ad clicks ("when a user clicks an ad on Facebook and/or Instagram") and never says
  ads-only [V content, undated]; organic and shared links carry it too, so it never means "ad" by itself [S, elasticfunnels
  2026-09-29]. Safari strips gclid/fbclid/msclkid in Private Browsing, Mail and Messages; normal browsing passes them [S,
  taggrs 2026-07-30].
- `fbc`/`fbp` are cookie values, never URL parameters Meta adds. `fbc` = `fb.<subdomainIndex>.<creationTime ms>.<fbclid>`;
  built on the server without an `_fbc` cookie, subdomainIndex = 1 [V content, Meta fbp-and-fbc, undated].
- Meta auto-adding `utm_*` to ads: [U] (headline only; Meta help pages unreadable).
- `igsh` (older `igshid`) is added when an Instagram post/reel/video link is copied or shared, i.e. on instagram.com URLs;
  not on outbound bio/story/DM links [S, aurumspire 2026-07-28; igshare 2026-01-17]. Not an attribution key.
- Referrer from Instagram/Facebook in-app browsers: often empty; when present the shim host `l.instagram.com`
  (`l.facebook.com`, `lm.facebook.com`) [S, sendurl 2026-11-02]. Per placement and per OS: [U]. GA4 lists l.instagram.com,
  instagram.com, ig, l.facebook.com, lm.facebook.com, m.facebook.com, l.messenger.com, whatsapp(.com), youtube.com,
  m.youtube.com as sources [V, GA4 source-category list, undated]. iOS 27 WKWebView apps can override the referrer on every
  request (`overrideReferrerForAllRequests`) [V, WebKit 2026-09-17].
- WhatsApp: no referrer, so it looks direct [S, cutt.ly 2026-05-02]. `android-app://com.whatsapp`: [U]. CTA URL buttons open
  the default browser [V Meta, undated]; template CTA links open an in-app browser for ≥1,000/day numbers [S, Wati
  2025-11-18]; an iPhone in-app browser for all chat links is in development [S, MacRumors 2026-10-20].
- Google Ads: auto-tagging adds `gclid`, "on by default for new accounts" [V content, undated]; also `gad_*` (`gad_source`)
  [V content, undated]. `wbraid` = ad in an iOS app → web page; `gbraid` = web ad → iOS app [V Ads API docs, undated]
  (Ads Help, 2023, no current source, says gbraid is on landing pages for all iOS 14.5+ clicks). Several can co-exist
  (Google ranks gclid > wbraid > gbraid). Any of gclid/gbraid/wbraid/gad_source = Google Ads.
- Google free listings: Merchant Center auto-tagging adds `srsltid` (on by default for new accounts), reported as organic
  [V content, undated]; also seen on plain organic Search URLs [S]. `srsltid` = Google organic, not paid.
- Google organic referrer `www.google.com` (origin): [U]; a `google.com/goto` redirect test was reported, unconfirmed by
  Google [S, 2026-07-10]. YouTube app referrer and `android-app://` from Android apps: [U] (Custom Tabs lets an app set
  `android-app://<package>` [V Chrome docs, undated]).
- Referrer-Policy default `strict-origin-when-cross-origin` [V, W3C ED 2026-03-20; MDN 2026-09-04]; Safari cuts every
  third-party referrer to its origin [V content, undated]. The REFERRING page's policy decides what we receive (W3C §3.9);
  our own header only governs what we send onward. In-app browsers' policy: [U].
- Open: a dated test on real Android and iOS devices (bio, story sticker, DM, WhatsApp, YouTube) recording `ref_host`
  would turn the [U] referrer rows into [V].

## Privacy — checked 2026-11-06 (rechecked 2026-11-08)

DPDP Rules: gazette G.S.R. 846(E) dated 13 Nov 2025 [S], "notified on 14 November 2025" per PIB's backgrounder
(2025-11-17) [V]; 18-month phased compliance. No amendment touching Rule 8(3) (one-year retention of traffic data and
logs) or cookies, and no MeitY cookie FAQ, found [U, 2026-11-08]. The DPDP (Removal of Difficulties) Order 2026,
S.O. 5458(E) of 5 Oct 2026, fixes wording in s.9(1) and s.10(2)(c)(ii) only [S, Legal500 2026-11-02]. The Board had no
Chairperson or Members as of 10 Sep 2026 [S, LiveLaw].
Phases (rechecked 2026-11-08 from the gazette scan): r.4 consent managers "one year", r.3 and 5–16 "eighteen months"
after the gazette of 13 Nov 2025 [V]; AZB counts 12 Nov 2026 / 12 May 2027 [S, 2025-11-14]; the exact day is [U] —
**plan for 12 May 2027**. Notice (r.3): itemised data, purpose, withdrawal as easy as giving. Breach (r.7): each person
without delay, the Board within 72 h. Logs ≥ 1 year (r.8(3)). Under-18: parental consent (r.10). **Order updates rest
on s.7(a) (no consent); marketing needs "a clear affirmative action" (s.6(1)): a pre-ticked box fails** [V text /
S reading, 2026-11-08].
Frata is a processor for each merchant's shoppers; using one merchant's shopper
data for another needs a separate decision (CLAUDE.md § deliberately absent).

## Email — checked 2026-11-08 (research `docs/research/2026-11-08-email-and-notifications.md`)

- **Amazon SES (owner: from the start).** ap-south-1 has API, SMTP `email-smtp.ap-south-1.amazonaws.com` and feedback
  endpoints; sandbox 200 a day, 1 a second until production access [V-undated]. Price: à la carte $0.10/1,000; new
  accounts start on Essentials $0.16/1,000 from 21 Jul 2026 (switchable) [V-undated, aws.amazon.com/ses/pricing].
- **SES tenants:** $0.005/tenant/month + $0.005/1,000; per-tenant reputation and auto-pause (Standard/Strict/None), up
  to 10,000; "combined sending activity still affects your overall account reputation" [V-undated, dg/tenants].
  Suppression order "Configuration Set > Tenant > Account" [V, AWS blog 2026-07-07].
- **SES domains:** `CreateEmailIdentity` → 3 DKIM CNAMEs; custom MAIL FROM = MX feedback-smtp.<region> + SPF TXT;
  events (bounce, complaint, delay) via SNS/EventBridge [V-undated]. SNS signature verification [U] — read before
  building the events route.
- **Resend** (not chosen): no India region; single-account tenants share one reputation; complaint rate < 0.08% or
  "may be shut down without warning" [V-undated; AUP V 2026-10-13]. Postmark: separate transactional/broadcast streams
  [V 2026-10-26]. ZeptoMail: transactional only [V-undated].
- **Gmail:** every sender SPF or DKIM, spam < 0.3%; bulk (~5,000 a day to personal accounts, **counted per primary
  domain, subdomains together, permanent**) needs SPF + DKIM + DMARC aligned, one-click unsubscribe on marketing
  ("Transactional messages are excluded"), spam < 0.10%; enforcement ramped from Nov 2025 [V-undated,
  support.google.com/a/answer/81126, /14229414]. Yahoo: RFC 8058, unsubscribes honoured within 2 days. Microsoft: 5,000+
  a day → SPF, DKIM, DMARC pass or 550 5.7.515 (from 5 May 2025) [V-undated / S]. BIMI: DMARC quarantine/reject at
  100% + VMC/CMC [V 2026-10-26].
- **Shopify:** an unauthenticated sender is rewritten to `store+123@shopifyemail.com`; CNAMEs, DMARC `p=none` minimum,
  up to 48 h; Shopify Messaging 10,000 free a month then $1 / $0.65 / $0.55 per 1,000; abandoned checkout free; warm-up
  20–30% a week, 5× a day's volume triggers throttling [V-undated, help.shopify.com].
- **India:** no law or rule on commercial email found [U]; DPDP governs it (§ Privacy). No email data-residency or
  GST-invoice-by-email rule found [U, a CA to confirm].
- **A prepaid wallet** for Frrata's own services is a closed-system PPI, "not regulated or supervised by RBI", while it
  permits no cash withdrawal [V, RBI Master Direction on PPIs as on 30 Sep 2026, para 2.1]. Paying Meta or an SMS
  vendor on the merchant's behalf would make it semi-closed (RBI authorisation) [S reading].

## Notifications (SMS, WhatsApp, push) — checked 2026-11-08

- **SMS (TRAI):** each brand registers on DLT as a principal entity (header, templates); variables tagged, links and
  numbers whitelisted, else rejected (PR 133/2025, 18 Nov 2025) [V]; misused headers suspended within 6 h; an inquiry
  allows messages for 7 days if kept verifiable; old consents count only if registered with operators (Third
  Amendment, PR 119/2026, 18 Sep 2026) [V]. ~₹0.16–0.25 a message + GST [S, MSG91].
- **WhatsApp:** India marketing ₹0.8631, utility ₹0.115 (+GST) [S, 2026-09-30]. Per-user marketing limit adapts to
  engagement; 131049 = wait 24 h; messages inside the window don't count. Cloud API stops marketing on 13 Oct 2027 (no
  marketing for accounts created from 13 Apr 2027) → Marketing Messages API. Separate opt-in per category advised
  [V-undated, developers.facebook.com].
- **Web push:** iOS 16.4+ only as a Home Screen web app; ask from a tap; a push not shown makes Safari revoke the
  permission [V-undated, developer.apple.com]. Chrome rate-limits disruptive senders (≥ 1,000/min) [V 2026-01-06]. A
  subscription belongs to one origin's service worker: a shop that changes domain loses its subscribers [V spec / U].

## Domains (Vercel for Platforms) — checked 2026-11-08 (research `docs/research/2026-11-08-shop-addresses.md`)

- Wildcard `*.frrata.shop` needs Vercel nameservers or `_acme-challenge` NS delegation (DNS-01); the apex and www are
  added separately; one level per certificate [V, Vercel docs 2026-09-16/18]. The registrar does not matter, the
  nameservers do (frrata.shop bought at Hostinger 2026-11-08 → NS `ns1/ns2.vercel-dns.com`).
- Vercel prices (2026-11-08): frrata.shop $2.99 then $38.39/yr; frrata.com $12.03/yr; .shop is not free-with-Pro [V].
- API: `POST /v10/projects/{id}/domains` (redirect, 301/302/307/308), `POST /v9/…/{d}/verify`, `DELETE /v9/…/{d}`,
  `GET /v6/domains/{d}/config` → misconfigured, recommendedIPv4/CNAME by rank [V, REST reference read 2026-11-08].
  409 = on another Vercel project / not allowed.
- `_vercel` TXT only when another Vercel account uses the domain; a new value on re-add. Frrata adds its own TXT proof.
- A record and www CNAME values are per project (76.76.21.21 or 216.198.79.1; `*.vercel-dns-017.com`); no IPv6;
  www recommended as primary [V 2026-09-18].
- Pro: soft limit 100,000 domains a project; domain writes 100/60 s, verify 100/60 s, config reads 500/60 s [V].
- Let's Encrypt, HTTP-01, "wait 5 to 10 minutes"; CAA must allow letsencrypt.org; proxies break issuance [V].
- The middleware sees the custom host unchanged [V 2025-12-13].
- Public Suffix List: Vercel advises it for tenant domains (myshopify.com, vercel.app, github.io are on it); a `_psl`
  TXT, > 2 years left on the registration, no review-time guarantee; Let's Encrypt limits 50 certs per registered
  domain per 7 days by the PSL [V Vercel 2026-09-16, LE 2026-08-05; U PSL wiki 2025-05-23].
- Domain Connect live at GoDaddy, Cloudflare, IONOS; not Hostinger, BigRock, Namecheap [V-undated].
- Shopify: A 23.227.38.65 + www CNAME shops.myshopify.com; two myshopify names in all, the old one redirects
  [V-undated]. Squarespace unlinks after 15 days without its verify record [V 2026-10-28].

## Trust and safety — checked 2026-11-08 (integration-researcher; gazette pages 403, so [S])

- IT (Intermediary) Amendment Rules 2026, G.S.R. 120(E), in force 20 Feb 2026: court/government takedown **3 h** (was
  36); grievances resolved in 7 days (was 15); unlawful content 36 h (was 72); intimate imagery 2 h (was 24); a user
  advisory every 3 months; all intermediaries. 24 h acknowledgement unchanged [S, Khaitan 2026-02-16, Cyril Shroff
  2026-02-11]. Draft Second Amendment (30 Mar 2026): 180-day retention a minimum; not notified as of 24 Aug 2026 [S].
- E-Commerce (Amendment) Rules 2026 (G.S.R. 789(E), from 1 Jan 2027): yearly dark-pattern self-audit with a
  certificate; a copy of the complaint to the complainant; grievance 48 h / one month unchanged [S, 2026-09-11].
- Hindware v Google (Delhi HC, 22 May 2026): safe harbour lost by a tool that aids infringement [S, Medianama].
- Shopify: product-level enforcement first, account last; trademark notices shown to the merchant in admin [V-undated].
- Turnstile Free: 20 widgets, 10 hostnames each, no challenge cap; Siteverify mandatory, token 300 s, single use
  [V 2026-08-14, 2026-10-22]. hCaptcha Pro $139/month [V-undated].
- Safe Browsing API non-commercial only (v4 deprecated) → **Web Risk** for our hosts (price [U]); v5 host checks from the
  PSL eTLD+1 [V-undated]. Search Console Domain property covers all subdomains [V-undated].
- Whether a SaaS store builder is an "intermediary" (s.2(1)(w)) [U]: a lawyer confirms before the first public shop.

## Sign-up code (OTP) and transactional email — checked 2026-11-08 (integration-researcher, for trials TR1/TR2)
- **WhatsApp authentication template**: fixed text, optional security line, expiry footer 1–90 min; code ≤ 15 chars;
  copy-code button text ≤ 25; no URLs, media or emojis; one-tap Android, zero-tap Android only, iOS < 26 no autofill
  [V, authentication templates + copy-code pages, undated]. Frrata's own WABA: Primary Business Location India, INR.
  Whether a Tech Provider's app may also send from the provider's own WABA: [U] — use a separate app/system user.
- **SMS (India)**: TRAI Direction 18 Nov 2025 — every template variable pre-tagged (e.g. `#url#`), non-compliant templates
  rejected; values checked against whitelisted domains, numbers, links [V, TRAI PR 133/2025]. TCCCPR Third Amendment
  18 Sep 2026: a misused header or template suspended within 6 h [V, TRAI PR 119/2026]. DLT entity ~₹5,900, 2–7 business
  days; header and template 1–3 days each [S]. Delivery time: [U]. MSG91 ₹0.25→₹0.16 per SMS by volume + 18% GST [V,
  undated]; Twilio India $0.0083/segment, Verify $0.05 per success + channel [V, Oct 2026].
- **Supabase phone OTP**: MessageBird, Twilio, Vonage, TextLocal (community); WhatsApp via Twilio only; Send SMS hook
  (Standard Webhooks, HTTP 5 s) [V, undated]. **Not used**: the sign-up code is a Frrata row sent through the outbox
  (ADR-0006), a business check, not a login.
- **Frrata's own sign-up WABA without GST** (checked 2026-11-08, integration-researcher): no Meta page requires GST or
  business verification to use the Cloud API or send authentication templates [V, about-the-platform + authentication
  templates, undated]. A new, unverified portfolio: **250 unique users per rolling 24 h** outside a service window (shared
  by its numbers; per portfolio since 2025-10-08) → 2,000 by verifying, by a partner verifying, OR by 2,000 delivered
  high-quality templates to unique users in 30 days; then 10K → 100K → unlimited by automatic scaling [V,
  messaging-limits, undated]. Authentication messages count toward it: [U, inference]. Unverified: 2 numbers (20 once
  verified or at 2,000), 250 templates (6,000 verified + approved name), no Official Business Account; the display name
  shows in chats only once approved, its review starts at a higher limit [V]. A payment method is required for
  production template sends (test numbers exempt; error 131042) [V]. India Sold-To: INR only, invoiced by Facebook India,
  currency fixed once chosen [V, pricing, 2026-10-01]. UPI/RuPay to pay Meta: [U]. GST 18% on Meta's charges [S,
  montymobile 2026-09-28]; GSTIN on billing and input credit: [U]. Verification documents in India: GST, Udyam/MSME,
  Shop & Establishment, Certificate of Incorporation, business PAN [S, Wati 2026-06-16; Exotel]; a sole proprietor often
  with PAN or Udyam [S, Zoko 2026-08-20]. Rule 5 here: verify once, in the legal entity's name — run the sign-up WABA
  unverified (250/day) until the Pvt Ltd exists. Authentication-international applies only to a business based outside
  the user's country sending > 750K messages outside windows in 30 days [V] — not Frrata (India → India).
- **Tech Provider "access verification"**: "no longer required" (changelog 2025-10-03) but embedded-signup/overview still
  names it for the 200-a-week onboarding limit [U conflict, 2026-11-08].
- **Amazon SES**: $0.10 per 1,000, $0.12/GB attachments [V, undated]; ap-south-1 API and SMTP endpoints [V]; sandbox per
  region (verified recipients, 200/24 h, 1/s), production access first reply within 96 h [V]; Easy DKIM 2048-bit; SPF
  alignment needs a custom MAIL FROM; strict DKIM alignment by default [V].
- **Resend**: Free 3,000/mo (100/day), Pro $20/50k, $0.90 per 1,000 over; regions us-east-1, eu-west-1, sa-east-1,
  ap-northeast-1 — no India; account data stored in the US [V, undated]. **Postmark**: Basic $15/10k … Platform $18 [V].
  Netcore: no public pricing [U].
- **Gmail**: one-click unsubscribe only for marketing/promotional — "Transactional messages are excluded"; 5,000/day per
  primary domain once makes a bulk sender for good; bulk needs SPF + DKIM + DMARC (p=none ok), From aligned, spam < 0.3%
  [V, support.google.com/a 14229414 + 81126, undated]. **Yahoo**: the same, unsubscribes honoured within 2 days [V].

## Merchant billing (Frrata bills merchants) — checked 2026-11-08

- RBI Digital Payments – E-mandate Framework, 2026 (21 Apr 2026, RBI/DPSS/2026-27/396) covers cards, PPI, UPI;
  NACH not in scope. Without extra authentication up to ₹15,000 a debit (₹1,00,000 only for insurance, mutual funds,
  credit card bills); first debit always authenticated; fixed or variable amount, the customer may set a maximum;
  notice ≥ 24 h before EVERY debit (merchant, amount, date/time, mandate ref, reason) [V, rbi.org.in MD id=13374].
- So a merchant whose monthly bill exceeds ₹15,000 approves each debit on a card or UPI mandate (Shopify India does
  this) [V, help.shopify.com india-pay-bills, undated, cites 13 Jul 2026]; eNACH avoids it.
- Razorpay Subscriptions: fixed plan amount per cycle; Add-ons DEPRECATED (FAQ) though the overview still lists them;
  a live amount change only for card-authorised subscriptions; retries T+1..T+3, then `halted` [V, lastmod 2026-10-08].
- Variable monthly amounts → Razorpay Recurring Payments (token; we start each charge; cards, UPI Autopay, eMandate,
  paper NACH) [V, llm-docs, undated]. Who sends the pre-debit notice is not documented [U]: Frrata sends its own.
- Razorpay Invoices API cannot make GST-compliant invoices → Frrata issues its own tax invoice [V, lastmod 2026-10-14].
- Cashfree On-Demand: charge any amount up to the authorised maximum; no auto-retry on eNACH or card, 3 on UPI; ≥ 25 h
  between notice and UPI debit; eNACH approval 24–48 h [V, Cashfree FAQ, undated].
- Frrata stores only the gateway's customer / token / mandate id and status, never card or bank details [U for the
  current RBI text].
- GST (CBIC unreachable 2026-11-08): place of supply s.12(2) IGST and Circular 242/36/2024 [U, 2024-12-31]; Rule 46
  incl. 16-character serial [U]; e-invoicing ₹5 cr AATO [S]; from 1 Jan 2027 also RCM-from-unregistered and import of services (N 04/2026-CT) [V, gazette via caalley, 2026-10-26]; SAC for SaaS unresolved (998315 most cited)
  [U]; TDS moved to Income-tax Act 2025 s.393 from 1 Apr 2026 [S]. **A CA confirms before the first invoice.**
- Shopify reference: 30-day cycles, apps on a separate cycle; app plans priced in USD; India pays in INR (UPI; cards via
  Razorpay); unpaid → store frozen, no grace [V, help.shopify.com, undated]. Frrata never blocks a shop.
- Details and the research table: `docs/research/2026-11-08-documents-and-billing.md` § Billing.

## GST filing (GSP/ASP) — checked 2026-11-09 (integration-researcher; gst.gov.in, einvoice1, developer.gst.gov.in unreachable)
- Filing by software only through a GSP; the taxpayer enables Manage API Access, 6 h or 30 days [S, Sovos undated]; an
  OTP opens the session; the final filing is EVC (OTP) or DSC [V Zoho help, undated]. Taxpayers see and revoke ASP
  tokens since 7 Nov 2025 [S, Tally 2026-10-14]. A direct taxpayer API: [U].
- Zoho is a GSP. Books pushes GSTR-1 and files it by PAN + OTP; GSTR-3B pushed, filed on the portal; approvers are
  Accountants/Admins (≤ 5) [V, undated]. Zoho Invoice: GSTR-1 only [V]. Books ₹899/₹749 (Standard) … ₹9,599/₹7,999
  (Ultimate), monthly/yearly [V, undated]. TallyPrime and BUSY upload and file GSTR-1 [V, undated].
- GSP returns-API prices unpublished (Quicko: onboarding + per call + renewal [V 2026-11-03]; Sandbox: sales [V
  2026-10-09]). GSTZen: e-invoice ₹5,250/yr ≤ 500 a month per GSTIN; e-way bill 18p/35p; GSTIN validator ₹3,500 per
  5,000 calls [V, undated]. 62 GSPs empanelled [S, Mar 2026].
- E-way bill ₹50,000; Part B by the transporter; intra-state ₹1 lakh in DL, MH, TN, WB [S, Tally 2026-06-09]. EWB
  numbers 14 digits (consolidated 11) from 1 Jan 2027 [V, GSTN 2026-11-04]: store as text.
- GSTR-3B Tables 3.1/3.2 locked to GSTR-1 since Jul/Nov 2025; corrections via GSTR-1A before 3B [S, 2026-08-07].
  Returns time-barred 3 years from the due date [S, Tally 2026-03].
- Rule 14B (N 05/2026-CT): ECO-warehouse registration only for supplies through TCS-collecting ECOs [V, GSTN 2026-11-01].
  No exemption found for own-website inter-state sellers (s.24) [S]. s.52 TCS only where the ECO collects the
  consideration [S, undated]; Frrata as an ECO: [U], a lawyer confirms.
- Credit notes declared by 30 Nov after the FY [S, 2026-11]; RTO cancel vs credit note: [U], a CA rules.
- Unverified (no current primary source): six IRPs, 24 h IRN cancellation, B2C dynamic QR, the 30-day IRP limit, HSN
  Table 12 digits, Tables 14/15 for own sites.

## Mux (video) — checked 2026-11-09 (integration-researcher; Mux doc pages carry no date: [V-undated] = read that day)

- **Account**: one Frrata-owned Mux org; an environment per tier (development, production), each with its own assets,
  tokens, signing keys and webhooks; a token works only in its environment; only an org admin creates tokens; Mux keeps a
  hash, a lost secret is gone. Mux Video Read+Write to create uploads/assets; System write for webhooks/signing keys
  [V-undated, core/make-api-requests + core/mux-fundamentals]. A platform secret in Vercel env (Production only), not a
  tenant credential. Tenancy is our table (asset id → shop); `passthrough` ≤ 255 and `meta.*` may be public: no personal
  data [V-undated, create-asset].
- **Direct upload**: `POST https://api.mux.com/video/v1/uploads` {cors_origin (the console origin), new_asset_settings
  {playback_policies:["public"], video_quality:"basic", static_renditions:[{resolution:"highest"}]}, timeout} — timeout
  default 3600 s, min 60, max 604800 → {id, url, status:"waiting"}; the browser PUTs the file to `url` (resumable; UpChunk,
  chunks in 256 KB multiples) [V-undated, create-direct-upload + upload-files-directly]. Max file size undocumented [U];
  max asset 12 h; no duration cap in the API → check `duration` on ready [V-undated / S].
- **Webhooks**: `mux-signature: t=<unix>,v1=<hex>`, HMAC-SHA256 over `t + "." + raw body` with the endpoint's secret;
  SDK tolerance 5 min; secret returned once at creation; rotation = recreate the webhook [U, no endpoint]; non-2xx retried
  24 h, 5 s per attempt, duplicates even after 2xx, ordering undocumented; per environment [V-undated,
  core/verify-webhook-signatures + listen-for-webhooks + manage-webhooks]. Key on the envelope `id` [U whether stable
  across retries]; after any event GET the asset. Events: video.upload.{created,asset_created,cancelled,errored},
  video.asset.{created,ready,errored,updated,deleted,warning}, video.asset.static_rendition.{created,ready,skipped,
  deleted,errored} [V-undated].
- **Playback**: `static_renditions` is current, `mp4_support` deprecated, never both [V-undated, enable-static-mp4-
  renditions]. Values highest | audio-only | 2160p…270p (no capped-1080p / low); no upscaling; a silent video gets
  highest.mp4, audio-only skipped. MP4 `https://stream.mux.com/{PLAYBACK_ID}/highest.mp4`; HLS `…/{PLAYBACK_ID}.m3u8`
  (native only in Safari/Edge). Poster `https://image.mux.com/{PLAYBACK_ID}/thumbnail.webp?time=&width=&fit_mode=`;
  animated ≤ 10 s, ≤ 640 px. Signed IDs need a JWT per URL and per audience (v, t, g, s) [V-undated].
- **Mux Player for Web is in maintenance mode** — Video.js for new work [V-undated, guides/mux-player-web]; ~900 KB
  minified [V, blog 2026-01-21]. Frrata's loops use a plain <video> with no player.
- **Price** (pay as you go, first tier; pricing/video, read 2026-11-09): basic input free; storage basic/plus $0.002400
  (720p) / $0.003000 (1080p) per min per month, basic has a ONE-MONTH MINIMUM; delivery $0.000800 / $0.001000 per min
  after 100,000 free a month (per org), billed at the delivered resolution, buffered segments and MP4 minutes count; MP4
  storage $0.000600 / $0.000750 per rendition-min per month; advanced (sized) rendition prep $0.008000 / $0.010000 per
  min; $20 monthly credit; Free plan up to 10 videos [S]. Price changes apply to the next bill after notice [V, Terms
  2026-10-12]. Never hard-code a rate.
- **Limits**: per environment + org cap — POST bucket 20, 1/s; others 100, 5/s; 429 + x-ratelimit-* [V, changelog
  2026-06-03 + make-api-requests]. Test assets (`test: true`) free, watermarked, 10 s, deleted after 24 h [V-undated].
- **Delete**: `DELETE /video/v1/assets/{id}` → 204, "all its data"; deleting a playback ID may let a current viewer finish
  [V-undated]. No undo documented [U].
- **Residency**: no region choice, no India [U]; DPA sub-processors AWS (hosting), Cloudflare (delivery) [S, DPA
  2026-10-12 via snippet].
- **Terms** (2026-10-12): licence "non-sublicensable"; no "sublicense, resell"; no letting users permanently download or
  redistribute content [V]. Whether hosting merchants' videos inside Frrata is "resell": [U] — ask Mux in writing
  before launch.
- Alternatives: Cloudflare Stream $5/1,000 min stored, $1/1,000 min delivered [V 2026-10-27]; Bunny Stream from
  $0.005/GB CDN, Asia standard $0.03/GB, $1 minimum [V-undated].
