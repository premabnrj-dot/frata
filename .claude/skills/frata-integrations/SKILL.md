---
name: frata-integrations
description: Use when building, planning or answering questions about a Frata connector - Razorpay (partner, sub-merchants, Route, webhooks), Shiprocket (API, rate shopping, NDR, COD remittance), Meta (Tech Provider, WhatsApp Cloud API, pricing, Conversions API, Instagram), Google (Merchant API, Ads, GA4, OAuth verification) or email - and for which facts about them are verified, when, and where from.
metadata:
  version: 1.3.0
  verified: 2026-11-07
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

## Shiprocket — checked 2026-11-06

- Per-seller API credentials, token valid 24 h (founder's research) [U — confirm in docs].
- A "channel integration" partner entry point exists; **no platform partner
  terms found** [U]. Ask in writing before building on it.
- Competes with Frata: Fastrr Checkout (headless APIs incl. Next.js), Fastrr
  Signals (RTO risk on shopper profiles), Engage (WhatsApp), Fastrr Ads [S].
  Listed on NSE/BSE 19 Aug 2026 [S].

## Meta — checked 2026-11-07 (WhatsApp: integration-researcher; spec docs/specs/2026-11-07-communication.md)

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
  deprecated**) [V, manage-phone-numbers + messaging-limits + health-status, 2026-11-07].
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
  ₹0.1150 [S, watsberry 2026-10-01]. Utility/auth volume tiers per portfolio, monthly [V].
- **Limits**: per business portfolio, shared by its numbers: 250 → 2,000 → 10,000 → 100,000 → unlimited [V].
- **Templates**: marketing / utility / authentication; mixed content (an order update with a promo) is
  marketing; WhatsApp may re-categorise; review up to 24 h; body ≤1024; ≤10 buttons [V].
- **Webhooks**: verify GET `hub.mode=subscribe`, `hub.verify_token`, reply 200 + `hub.challenge`; POST `object:"whatsapp_business_account"`,
  `entry[].id` (the WABA, by the payload shape [U]), `changes[{field,value}]`; `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 with the
  app secret (Meta says "payload"; we hash the raw bytes); retries up to 7 days, duplicates possible; ≤3 MB [V, webhooks/overview +
  create-webhook-endpoint, 2026-11-07]. Fields include messages, message_template_status_update, account_update, account_review_update,
  account_alerts, phone_number_quality_update, phone_number_name_update, payment_configuration_update, history, smb_app_state_sync,
  smb_message_echoes [V]. Media URLs live **5 minutes** and need the token [V]. Usernames: a BSUID, phone may be absent [V].
- No agent concept in the Cloud API; policy requires a human escalation path; opt-in must name the
  business; opt-outs honoured on or off WhatsApp [V, policy 23 Sep 2026].
- **Conversions API**: a website event's `event_time` may be up to 7 days old;
  ONE older event fails the WHOLE request [V, Meta docs]. Send "Delivered" as a
  custom event at delivery time; drop anything over 7 days before batching.
  Timestamps in seconds, not ms.
- Instagram India: no in-app checkout; product tags click through to the site;
  shop eligibility uneven; commerce review up to 4 weeks [V/S]. DMs → assisted
  order creation, not automatic. Reels creator affiliate links launched in
  India in 2026 (3–15% commission) [S].

## Google — checked 2026-11-06

- Content API for Shopping sunset 18 Aug 2026, degradation from 1 Sep → build
  only on **Merchant API v1** [V, Google].
- Sensitive OAuth scopes need brand verification; Google Ads needs a developer
  token with brand verification [U, founder].
- Never send Google user data to ad platforms (Google API policy) [U, founder].

## Privacy — checked 2026-11-06

DPDP Rules notified 13 Nov 2025; consent managers from 13 Nov 2026; notice,
consent, processor contracts and 72 h breach reporting from 13 May 2027 [V].
Frata is a processor for each merchant's shoppers; using one merchant's shopper
data for another needs a separate decision (CLAUDE.md § deliberately absent).
