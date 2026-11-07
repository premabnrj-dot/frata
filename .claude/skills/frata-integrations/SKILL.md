---
name: frata-integrations
description: Use when building, planning or answering questions about a Frata connector - Razorpay (partner, sub-merchants, Route, webhooks), Shiprocket (API, rate shopping, NDR, COD remittance), Meta (Tech Provider, WhatsApp Cloud API, pricing, Conversions API, Instagram), Google (Merchant API, Ads, GA4, OAuth verification) or email - and for which facts about them are verified, when, and where from.
metadata:
  version: 1.2.0
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
- **Embedded Signup v4 only** (v2/v3 deprecated 15 Oct 2026; v4 is "phone number first") [V]. It returns
  waba_id, phone_number_id and a code; the server exchanges the code for a per-customer business token
  (lifetime not stated [U]). Then `POST /<WABA_ID>/subscribed_apps` and `POST /<PHONE_NUMBER_ID>/register`
  with a 6-digit PIN (10 per number per 72 h) [V].
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
- **Webhooks**: `X-Hub-Signature-256` HMAC-SHA256 of the raw body with the app secret; retries up to 7 days,
  duplicates possible; ≤3 MB; route by `phone_number_id` / `entry[].id` [V]. Media URLs live **5 minutes**
  and need the token [V]. Usernames: webhooks carry a BSUID, and a phone number may be absent [V].
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
