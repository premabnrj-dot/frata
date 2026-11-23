# frata-integrations — Razorpay, merchant billing and GST filing

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Razorpay — checked 2026-11-07
- Merchant billing
- GST filing

## Razorpay — checked 2026-11-07 (refunds, orders and Checkout rechecked 2026-11-12, integration-researcher, for OE·2)

Razorpay doc pages carry no date of their own; dates are each page's `lastmod` in razorpay.com/docs/sitemap.xml (bulk
rebuilds 2026-10-08 and 2026-11-12T08:15Z: a lastmod on those days is not proof the text changed).

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
- Orders API: `amount` (paise, min 100) and `currency` required; `receipt` ≤ 40 chars, unique PER ACCOUNT (a duplicate →
  400 "Duplicate request", fetch by `GET /v1/orders?receipt=` and reuse); `notes` ≤ 15 pairs × 256 chars;
  `partial_payment` default false; one successful payment per order, a late authorised one is auto-refunded; no
  documented order expiry; no documented limit on orders per account [V, docs/api/orders/create lastmod 2026-11-04,
  orders/fetch-all, payments/orders 2026-11-12; read 2026-11-12]. Checkout `key`, `order_id`, `amount` mandatory; "An
  order should be created for every payment" [V, standard/integration-steps 2026-11-12].
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
- **Refunds (checked 2026-11-12)** [V, api/refunds/create-normal + normal-refunds-idempotent + fetch-multiple-refund-payment
  lastmod 2026-10-08; payments/refunds, refunds/normal, refund-speed, subscribe-to-webhooks, balances lastmod 2026-11-12;
  refunds/faqs 2026-10-29; refunds/issue + errors 2026-10-08]:
  `POST /v1/payments/:id/refund` {amount (paise, optional = full, min ₹1, 0 rejected), speed, notes (≤ 15, key < 256,
  value < 512), receipt (unique PER PAYMENT, "treated as an idempotency key")}. Many partials allowed while their sum ≤
  captured; the payment stays `captured` until fully refunded. **Always send `speed: "normal"`**: the merchant's
  dashboard Default Refund Speed is the API default, and Instant costs ₹7.99 / ₹11.99 / ₹14.99 (≤ ₹1,000 / ≤ ₹25,000 /
  above; pricing "Last updated: May 2026").
- Refund idempotency: optional header `X-Refund-Idempotency`, ≥ 10 chars `[A-Za-z0-9_-]` (a uuid fits); same key, same
  body = safe retry; different body or still in progress → 409; retention NOT documented [U] → list before every
  retry. "Another payment operation is in progress" (400) → wait seconds, retry.
- List: `GET /v1/payments/:id/refunds` (count default 10, max 100; skip, from, to); items carry receipt, notes, status.
  Statuses `pending` (accepted, with the bank), `processed` (final; usually set BEFORE the ARN/RRN, so not proof the
  shopper has the money), `failed`. A refund can't be cancelled. Whether a failed refund's `receipt` can be reused:
  [U] → a new attempt gets a new receipt and key. No "refundable" field on a payment: compute captured − listed
  pending + processed (whether `amount_refunded` counts pending is [U]).
- 6 months: normal refund impossible; the API page says status `failed`, the errors page says `BAD_REQUEST_ERROR`
  (conflict: handle both; check payment age before Save).
- Refunds are paid from the merchant's available balance; too low → 400 "does not have enough balance"; it FAILS, not
  queued, unless the merchant funded a Reserve Balance ("becomes the maximum negative limit"). Other refusals: refunds
  disabled on the account or method, dispute open, partial not supported for the method.
- Fees: a normal refund is free; the original fee and its GST are not reversed (payment `fee` includes GST) [V].
- Webhooks: `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`, subscribed by the merchant per
  webhook in their dashboard (one URL, one secret, chosen events; same secret for payments and refund events on one
  webhook: inferred [U]); payload has `refund` + `payment`; auto-refunds of uncaptured payments fire them too
  (`payment.entity.captured` false).
- Timing: 5–7 working days (API, overview) vs 7–10 working days (Normal refunds page); per method in days: cards 5–10,
  netbanking 2–10, wallet 0–3, UPI 2–7. Shopper copy "5–10 working days" covers all. Razorpay emails refund id +
  ARN/RRN only if the customer email was passed (recipient unclear [U]); refund SMS not documented [U].
- UPI Collect deprecated for P2M from 28 Feb 2026; UPI Intent is the default on
  mobile web, QR on desktop [V Razorpay / S NPCI, 2026-11-07].
- UPI MDR 0.4% on P2M UPI above ₹2,000 (cap ₹300 at ≥ ₹75,000) was due 15 Oct
  2026; NPCI deferred it on 13 Oct to "post Diwali", date to be notified;
  small-merchant zero MDR is defined on UPI **QR** receipts ≤ ₹1 lakh/month and
  may not cover online checkout [S, PayU 2026-10-15, Medianama 2026-10-13; NPCI
  text not read]. (Corrects the 2026-11-06 note, which said "from 15 Oct 2026 [V]".)
- Magic Checkout: no public price ("Enterprise pricing … Contact sales", razorpay.com/pricing, last updated May 2026) [V];
  ~0.65–0.75% per order [S, 2026-11-06]; RTO protection price unpublished [U]. Per ZIP: COD only to uploaded ZIPs, shipping
  only to uploaded ZIPs, COD fee by order-value slab, zone/method rates, "Display Delivery in" timeline [V, shopify/features
  lastmod 2026-10-23]; blocklist phone/email/IP/6-digit ZIP, allowlist phone/email, CSV ≤ 1M rows, needs COD Intelligence,
  allowlisted orders get no RTO insurance [V, rto-reduction/allowlist-blocklist lastmod 2026-10-08]. Standard Checkout: the
  merchant decides COD by PIN code; `cod_fee` in paise, a negative is not rejected [V-undated, standard/cod.md].
- Magic Checkout (web) is a modal (`rzp1.open()`); `handleback` defaults to true (Back closes it); success goes to
  `handler` or `callback_url`; headless integrations then redirect to `order_status_url`; `theme.color` on request, no
  logo option [V magic-checkout/web lastmod 2026-11-16; …/shopify/custom/web-integration-nextjs lastmod 2026-11-12;
  checked 2026-11-16].
- Standard Checkout's pop-up "does not appear in certain browsers, for example, on Facebook and Instagram browsers";
  the fix is `callback_url` (a full-page redirect) [V standard/troubleshooting-faqs lastmod 2026-11-12; checked
  2026-11-16]. Checkout inside a frame: no support statement and no ban found (P3·1 spike).
- No RBI/NPCI rule on cash on delivery found [U, 2026-11-07].
- **Registered websites (checked 2026-11-09):** live payments are accepted only from websites registered on the
  merchant's OWN account; "Razorpay fails the payments received on the unregistered websites" [V Custom Checkout page,
  undated; Standard Checkout failure S, GHL 2025-12-12: "…from web domain - link.fastpaydirect.com has failed as it is
  not registered"]. Keys apply to the websites whitelisted for the MID [V]. A platform's domain registered on another MID
  does not carry over [S] — so **`<slug>.frrata.shop` must be registered on each shop's own account too**. Shopper sees
  "Payment blocked as website does not match registered website(s)" [S, Zoho, undated]. Account action for trying [U];
  test mode exempt [U].
- Dashboard → Account & Settings → Business website detail: one main website plus five additional, additional only in
  the e-commerce category; register before integrating; additional needs About, Contact, Pricing, T&C, Privacy, Refund
  pages live, a sample invoice and a reason of ≥ 50 words; main = instant automated checks, additional = manual review,
  "about 24-48 hours"; a sub-domain → "raise a request with our Support Team" [V, business-website-details +
  dashboard/faqs, lastmod 2026-10-08]. No API to read a merchant's registered websites found [U]: the merchant confirms.
- `callback_url`: "Ensure that the domain of the Callback URL is allowlisted" [V, standard/integration-steps, 2026-10-08].
- Payment Links and Invoices need no website [V, payment-links/faqs + business-website-details, 2026-10-08]; UPI
  Payment Links skip `callback_url` on Android [V]. UPI Intent on by default, desktop shows QR [V, upi-intent,
  2026-10-08]. Instagram/Facebook in-app browsers (Standard): "UPI Intent and Cards will appear"; methods that open a pop-up page
  (netbanking) don't; the Checkout pop-up "does not appear" there → `callback_url` [V, standard/troubleshooting-faqs lastmod
  2026-11-12, checked 2026-11-16]. Custom Checkout FAQ: UPI Intent only [V undated].
- **Checkout in a frame (checked 2026-11-16):** Razorpay documents neither support nor a ban, nor UPI intent / 3-D Secure /
  netbanking from a frame, nor whether the registered website is the top page's or the frame's [U]. checkout.js (served
  2026-11-16, undocumented) builds its own iframe with `allow="otp-credentials; payment; clipboard-write;
  publickey-credentials-get https://api.razorpay.com; …"` and knows when it runs framed; a frame of ours must itself allow
  those features or Razorpay's inner frame loses them [V MDN Permissions Policy 2026-10-23]. No CSP host list is published [U];
  seen in the script: checkout.razorpay.com, api.razorpay.com (+ api-dark, api-<region>), lumberjack(-cx,-metrics).razorpay.com,
  cdn.razorpay.com, express.razorpay.com [V-observed]. Apple Pay in a frame: `allow="payment"` (Safari 17+), same origin
  (≤ 16) [V apple-pay lastmod 2026-11-12].

## Merchant billing (Frrata bills merchants) — checked 2026-11-08; Recurring Payments re-read 2026-11-22

- RBI Digital Payments – E-mandate Framework, 2026 (21 Apr 2026, RBI/DPSS/2026-27/396) covers cards, PPI, UPI;
  NACH not in scope. Without extra authentication up to ₹15,000 a debit (₹1,00,000 only for insurance, mutual funds,
  credit card bills); first debit always authenticated; fixed or variable amount, the customer may set a maximum;
  notice ≥ 24 h before EVERY debit (merchant, amount, date/time, mandate ref, reason) [V, rbi.org.in MD id=13374].
- So a merchant whose monthly bill exceeds ₹15,000 approves each debit on a card or UPI mandate (Shopify India does
  this) [V, help.shopify.com india-pay-bills, undated, cites 13 Jul 2026]; eNACH avoids it.
- Razorpay Subscriptions: fixed plan amount per cycle; Add-ons DEPRECATED (FAQ) though the overview still lists them;
  a live amount change only for card-authorised subscriptions; retries T+1..T+3, then `halted` [V, lastmod 2026-10-08].
- Variable monthly amounts → Razorpay Recurring Payments (token; we start each charge) [V, llm-docs, undated]. UPI: Razorpay
  sends the pre-debit notice when the order is created; wait ≥ 24 h, then create the payment [V,
  api/payments/recurring-payments/upi/create-subsequent-payments.md, undated, checked 2026-11-22]. Cards: a `notification`
  object on POST /orders, turnaround 36 h 5 min; who sends it is not stated [U, cards/create-subsequent-payments.md,
  2026-11-22]. Frrata also emails its own notice (C1, partner seats), so a UPI payer may get two.
- UPI authorisation order amount = the first debit (≥ ₹1, ≤ token.max_amount); "If the first debit fails, the registration
  fails" [V docs; a live ₹3,538.82 / ₹11,798.82 authorisation untested, U] [V, upi/create-authorization-transaction.md,
  payment-gateway/s2s-integration/recurring-payments/upi.md, undated, 2026-11-22]. Card: only the ₹1 minimum is stated;
  first charge at registration not stated [U]. eMandate order amount 0. Nothing says a ₹1 authorisation is refunded [U].
- token.max_amount (UPI, "All other MCCs"): ≤ ₹25,000 as_presented, ≤ ₹1,00,000 other frequencies; AFA-free ₹15,000 a
  debit; lower caps for MCCs 4722, 5944, 7322, 7409, 7410, 9311, 9400; Frrata's MCC unknown [U]. frequency (UPI): daily,
  weekly, fortnightly, bimonthly, monthly, quarterly, half_yearly, yearly, as_presented (cards: weekly, monthly, yearly,
  as_presented); Razorpay warns as_presented on a monthly plan "may find it risky"; NPCI allows one successful debit per
  token per cycle. expire_at default 10 years, max 30 [V, upi/create-authorization-transaction.md, 2026-11-22].
- Cancel a UPI token: `PUT /customers/:cid/tokens/:tid/cancel` (DELETE does not cancel the mandate); cards: only DELETE is
  documented [V/U, upi/tokens.md, cards/tokens.md, 2026-11-22]. Recurring webhooks: token.confirmed, token.rejected,
  token.cancelled, token.paused, order.notification.delivered/failed (only with a notification object),
  payment.authorized/captured/failed, order.paid [V, recurring-payments/webhooks.md, 2026-11-22].
- A failed debit: UPI with no notification object → Razorpay debits at 25 h and retries 3 times itself; with one → no
  automatic retry, the merchant creates a new order [V, upi/create-subsequent-payments.md, 2026-11-22]. Up to 30 webhook
  URLs an account, each with a secret field; reply 2xx within 5 s; retried 24 h, then disabled [V,
  webhooks/setup-edit-payments.md, 2026-11-22].
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
