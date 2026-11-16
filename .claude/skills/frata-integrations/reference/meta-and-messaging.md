# frata-integrations — Meta, notifications and sign-up codes

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Meta — checked 2026-11-07
- Notifications
- Sign-up code

## Meta — checked 2026-11-07 (WhatsApp: integration-researcher; spec docs/specs/2026-11-07-communication.md; templates, sends, errors, webhooks, opt-in rechecked 2026-11-09 — docs moved to developers.facebook.com/documentation/business-messaging/whatsapp/, pages undated)

- **Tech Provider**: business verification, App Review (two screencasts: a message sent and received,
  template creation), access verification. Onboarding limit **10 new customers per rolling 7 days by
  default; 200 after the three** [V, embedded-signup/overview]. Tech Partner upgrade: ≥2,500 average daily
  messages, ≥10 active clients, ≥90% quality [V].
- **No credit line**: customers add their own payment method in WhatsApp Manager; Meta bills them [V,
  solution-providers/overview]. India accounts must bill in **INR by 31 Dec 2026**, else delivery stops 1 Jan 2027 [V].
  A Multi-Partner Solution (MPS) with a Solution Partner lets clients share its credit line (no card in WhatsApp
  Manager); the Solution Partner is "Bill To Party"; no Meta page lets a Tech Provider invoice message fees — the Tech
  Provider "will bill for other services"; becoming a Solution Partner is "a lengthy process" [V-undated,
  solution-providers/overview + multi-partner-solutions + share-and-revoke-credit-lines, 2026-11-09]. BSP terms
  (Gupshup ~$0.001/msg fee, WhatsApp at actuals; 360dialog requires MPS for Tech Providers) are vendor-only [S].
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
  opening the app [V]. India since 2025-05-05 [V, changelog]; multi-solution conversations: several partners on one
  number, so a merchant can keep another tool alongside [V, 2026-01-29].
- **Pricing**: per message since 1 Jul 2025. **From 1 Oct 2026 in-window utility and service messages are
  charged**; 1,000 free service messages per number per month [V]. Free entry point: Click-to-WhatsApp ads
  only, window up to 7 days [V]. India before GST: marketing ₹0.8631; utility, authentication, service
  ₹0.1150 [S, watsberry 2026-10-01; whautomate "October 1, 2026"; Gallabox lists 0.1323 = +15%, inferred markup].
  Authentication-international (₹2.4971 [S]) applies only when the WABA's Primary Business Location differs from the
  user's country; India's rose 1 Apr 2026; 30-day notice [V, pricing + authentication-international-rates, undated,
  read 2026-11-08]. Utility/auth volume tiers per market, monthly [V]. Prices change only on the 1st of a quarter, ≥ 1
  month's notice; charged on delivery [V, …/pricing, 2026-11-09]. India's utility rate stays [S]. Tiers: utility list
  rate to 25M/month, auth to 750K/month, then −6% … −30% (auth −6% = ₹0.1081); counted per portfolio, market and
  category [S, chatmaxima "Rates effective October 1, 2026"; V-undated aggregation, pricing, 2026-11-09].
- **Limits**: per business portfolio, shared by its numbers: 250 → 2,000 → 10,000 → 100,000 → unlimited; at 2,000+ one
  step within 6 h when quality is high across all numbers and templates AND ≥ half the limit was used in 7 days; since
  7 Oct 2025 a quality drop no longer lowers the limit, but a low-quality template pauses 3 h, then 6 h, then is
  disabled [V-undated, messaging-limits + upcoming-messaging-limits-changes + template-pausing, 2026-11-09]. Each
  number 80 mps; 1,000 mps needs unlimited + 100K unique users in 24 h + quality ≥ yellow [V-undated, throughput].
  Whether authentication counts toward the limit: not stated [U].
- **EkCode transactional from Frrata's number** (checked 2026-11-09): no Meta page addresses a platform messaging its
  own account holders about third-party sellers' orders [V absence: policy 2026-09-23, template-categorization,
  template-review]. Lawful shape: Frrata-owned utility templates in Frrata's voice, the shop's name a body variable
  ("via Frrata"), no promo; the opt-in names Frrata ("clearly state the business's name") [V-undated, getting-opt-in];
  separate opt-in per category [V-undated]. Platform terms §4.1 (2026-09-23) [V]: no sharing WhatsApp Platform Data
  with third parties (→ no read/delivered/not-on-WhatsApp status or BSUID shown to a merchant); no "resell, or rent the
  WhatsApp Business Platform" (→ per-message re-billing to merchants: counsel first [U]); no misrepresenting
  "affiliation". Precedent: Razorpay Magic Checkout sends from "Razorpay's WhatsApp handle", merchant name editable
  [V-undated]; Shiprocket auto-sends for 3 lakh+ brands, sender unstated [S, 2026-05-01]; GoKwik [U].
- **EkCode's number, as built (P1, 2026-11-09):** its own Meta app in its own portfolio (ADR-0010); copy-code
  authentication template `ekcode_signin_code`, sent with `message_send_ttl_seconds` 600 from `sendAuthCode`
  (`src/lib/meta/graph.ts`, which now returns the wamid or Meta's error code); delivery reports at
  `/api/webhooks/ekcode` (its own app secret), trimmed to wamid, status, error and time; 130429 retried once after 2 s;
  131026 never shown to the shopper (Meta §4.1). EkCode sends no email; shops' order emails go through SES (ADR-0011).
- **Display name / blue tick** (2026-11-09): "Frrata" fits the clear-relationship rule; never a shop's name in it [S,
  360dialog]. Official Business Account: policy compliance, ≥ 30 days on the platform, verified portfolio, two-step
  verification, approved display name; no notability test stated; reapply after 30 days [V-undated,
  official-business-accounts]. A second number adds its own throughput and quality, not daily capacity [V-undated].
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
- **Instagram media for a brand intake (checked 2026-11-12, integration-researcher; Meta pages undated, terms 2026-02-03):**
  - Instagram Login (graph.instagram.com), scope `instagram_business_basic`, business and creator accounts, no
    Facebook Page needed [V developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login].
  - `caption` on a post is documented "Available for Instagram API with Facebook Login only" [V reference/instagram-media];
    whether Instagram Login returns it is [U]. Test `/me/media?fields=caption,media_url,permalink,media_type,timestamp`
    on an account we own (Standard Access) before designing around captions.
  - `media_url` may be missing (copyrighted audio): fall back to `thumbnail_url` or `permalink` [V]. Media URLs expire;
    no lifetime stated [V]. Up to 10K newest posts; no stories [V].
  - Accounts we don't own need Advanced Access → App Review → Business Verification (in the Pvt Ltd's name) [V
    instagram-platform/overview]. Rate: 4,800 × impressions per 24 h per app and account [V].
  - Reading a public account by handle (Business Discovery) needs Facebook Login, a Page and more scopes [V]: don't
    offer "type your handle".
  - Platform terms §6.2: don't import or back up User Content without Meta's permission [V devpolicy 2026-02-03]. Rule:
    read posts once, keep only the derived palette and permalinks; never store or republish an Instagram image unless
    the merchant uploads it. Delete on the user's request (terms §3.d) [V]. No rule names deriving a palette [V absence].
  - Repo: no Instagram connection is built; `shop_settings.instagram` is a plain handle; the communication spec plans
    `instagram_business_manage_messages` for DMs (separate connection).

## Notifications (SMS, WhatsApp, push) — checked 2026-11-08

- **SMS (TRAI):** each brand registers on DLT as a principal entity (header, templates); variables tagged, links and
  numbers whitelisted, else rejected (PR 133/2025, 18 Nov 2025) [V]; misused headers suspended within 6 h; an inquiry
  allows messages for 7 days if kept verifiable; old consents count only if registered with operators (Third
  Amendment, PR 119/2026, 18 Sep 2026) [V]. ~₹0.16–0.25 a message + GST [S, MSG91].
- **WhatsApp:** India marketing ₹0.8631, utility ₹0.115 (+GST) [S, 2026-09-30]. Per-user marketing limit adapts to
  engagement; 131049 = wait 24 h; messages inside the window don't count. Cloud API stops marketing on 13 Oct 2027 (no
  marketing for accounts created from 13 Apr 2027) → Marketing Messages API. Separate opt-in per category advised
  [V-undated, developers.facebook.com]. MM API GA 19 Nov 2025; India unrestricted; Tech Providers may onboard clients;
  same billing as Cloud API; "max price" open beta 1 Oct 2026 for Solution-Partner-shared accounts only; 131063 when a
  merchant disabled Cloud API marketing [V, marketing-messages changelog 2026-10-19]. Free entry point window (CTWA)
  "up to 7 days" [V-undated, pricing, 2026-11-09].
- **WhatsApp commerce (2026-11-09):** Payments API India — deep integration Razorpay/PayU/Billdesk/Zaakpay; Enhanced
  Payment Links Razorpay (PayU, Cashfree allowlisted); `order_details` / `order_status` messages. Flows (forms) go in
  templates, data endpoint optional, not on WhatsApp Web. CAPI for business messaging accepts OrderDelivered,
  OrderReturned, OrderCanceled, CartAbandoned [V-undated]. Tech Provider portfolio restrictions have taken down every
  connected merchant at once (Meta developer forum, 2026-07 to 10) [S] → keep EkCode's number outside the Tech
  Provider's portfolio.
- **Web push:** iOS 16.4+ only as a Home Screen web app; ask from a tap; a push not shown makes Safari revoke the
  permission [V-undated, developer.apple.com]. Chrome rate-limits disruptive senders (≥ 1,000/min) [V 2026-01-06]. A
  subscription belongs to one origin's service worker: a shop that changes domain loses its subscribers [V spec / U].

## Sign-up code (OTP) and transactional email — checked 2026-11-08 (integration-researcher, for trials TR1/TR2)
- **WhatsApp authentication template**: fixed text, optional security line, expiry footer 1–90 min; code ≤ 15 chars;
  copy-code button text ≤ 25; no URLs, media or emojis; one-tap Android, zero-tap Android only, iOS < 26 no autofill
  [V, authentication templates + copy-code pages, undated]. Frrata's own WABA: Primary Business Location India, INR.
  Whether a Tech Provider's app may also send from the provider's own WABA: [U] — use a separate app/system user.
  Rechecked 2026-11-09: no brand variable (the shop is known only by the sending number's display name); delivered to the
  primary device only; TTL default 10 min, `message_send_ttl_seconds` 30–900, undelivered → dropped and not charged
  [V-undated, authentication-templates, time-to-live]. **A web shop gets copy code only** (one-tap/zero-tap need an Android
  app). Cannot go to a username-only user (BSUID) [V-undated, business-scoped-user-ids].
- **One business, one Messaging account** (2026-11-09): "Sharing a Messaging account across multiple businesses is against
  policy" [V-undated, authentication-best-practices]; no speaking for a business "without permission" [V, policy
  2026-09-23]; Twilio Verify ended its shared sender on 1 Mar 2024 [V, twilio docs 2026-03-09]. → **No central Frrata
  sender for shop logins**: a shop's code goes from the shop's own number (Embedded Signup), billed to the merchant;
  Frrata's number only where Frrata is the business (its own sign-up and EkCode logins, ADR-0009 — auth uses "New account creation" / "Account integrity, access, or
  recovery" [V-undated, template-categorization]; no rule that the code names the app signed into [V absence]; the
  sign-in screen says "Frrata"). Reverse
  wa.me OTP: no Meta rule [U], and a username user's message may carry no phone → weak proof. No third-party "Sign in
  with WhatsApp" [U]. Pair rate 1 / 6 s to one user (burst 45, 131056); 80 msg/s per number [V-undated].
- **SMS (India)**: TRAI Direction 18 Nov 2025 — every template variable pre-tagged (e.g. `#url#`), non-compliant templates
  rejected; values checked against whitelisted domains, numbers, links [V, TRAI PR 133/2025]. TCCCPR Third Amendment
  18 Sep 2026: a misused header or template suspended within 6 h [V, TRAI PR 119/2026]. DLT entity ~₹5,900, 2–7 business
  days; header and template 1–3 days each [S]. Delivery time: [U]. MSG91 ₹0.25→₹0.16 per SMS by volume + 18% GST [V,
  undated]; MSG91 OTP ₹0.25→₹0.18 + GST [V-undated, 2026-11-09]; Twilio India **$0.0832**/segment ("current as of October
  2026"; corrects $0.0083) [V, 2026-11-09], Verify $0.05 per success + channel [not rechecked]; Gupshup ~₹0.17, Kaleyra
  ~₹0.18 per OTP [S, competitor, 2026-05].
- **TCCCPR 2nd Amendment** (12 Feb 2025) [V, gazette PDF read 2026-11-09]: OTP for e-commerce / app login is Transactional
  (within 30 min of the customer's action, no explicit consent); headers suffixed -P/-S/-T/-G; entity registration =
  physical verification + biometric of the authorised person; headers/templates unused 90 days deactivated; ≤ 2
  telemarketers in the chain. **One platform header for many brands: [U]** — a TSP confirms before building.
- **Other logins** (2026-11-09): Truecaller Mobile Web SDK Android browsers only, price [U]; Google sign-in: FedCM on, each
  origin registered [V-undated]; passkeys: Related Origin Requests ≤ 5 labels → per shop domain, never platform-wide [V,
  passkeys.dev 2026-02-05].
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
