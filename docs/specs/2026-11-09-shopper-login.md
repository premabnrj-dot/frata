# Shopper login — sign in on a shop with WhatsApp, SMS fallback (KwikPass-style), as an app
Status: draft (owner decisions in § 8) · Date: 2026-11-09 · Mockup: after § 8 is decided · Approved: pending
Research: `docs/research/2026-11-09-shopper-login.md` (Meta, TRAI, competitors, DPDP, browsers — dated).

## Goal
North star (4) mobile checkout conversion and (1) COD/RTO: a returning shopper is filled in (name, phone, address) in one
code, and every login proves the phone — a verified number is the first input RTO Shield scores. **Measures**: checkout
completion with vs without a login (holdout per shop); share of COD orders from a verified phone; RTO on verified vs
unverified COD; cost per login (₹, by channel).

## Job
A shopper on any shop taps "Continue with WhatsApp", gets a code from **that shop's** WhatsApp number (or by SMS), and is
signed in on that shop with their past address ready; the shop gets a verified, consented customer (a lead) without a
developer. Strictly identity and lead capture — marketing is its own module (§ 7).

## What exists (built, reused)
- **Messages module**: each merchant's own WhatsApp Business account via Meta Embedded Signup (Tech Provider), sealed token
  (`wa_connections`), template creation and sends (`src/lib/modules/communication/graph.ts`), webhook routing per shop.
- **Frrata's own WhatsApp number** sends copy-code authentication templates for merchant sign-up
  (`src/lib/trials/signup-code.ts`, `sendAuthCode` in `src/lib/meta/graph.ts`) — Frrata is the business there.
- Keyed, versioned phone HMACs (`claimKey('phone', …)`), derived keys (`src/lib/crypto/secret-box.ts`), rate limits that
  fail closed, `ipBucket` (/64), ADR-0008 attempt rows for calls a person waits on, the unticked WhatsApp opt-in at
  checkout (`orders.wa_opt_in_at`), order links by token, the module registry (add-ons, plan limits), the billing engine.
- **Rules already decided**: no cross-brand shopper data network before DPDP consent design and a decision superseding
  ADR-0002 (CLAUDE.md); never a wallet reselling WhatsApp credit (RBI; product roadmap); shopper OTP waits for DLT
  (roadmap Phase 2, item 6).

## 1. Shared platform WABA vs the shop's own (BYO)
**Meta does not allow one WhatsApp account to send login codes for many businesses** (research § 1). So:
- **WhatsApp codes come from the shop's own number** (the Messages module, already Embedded Signup). The template is
  created in the shop's account at Turn-on; the shopper sees the shop's display name in the chat; Meta bills the merchant.
  Copy-code template only (a web shop gets nothing else: § 2 of the research).
- **The zero-config default is SMS** under Frrata's DLT entity and a `-T` (transactional) header, if a TSP confirms one
  platform header may carry OTPs for many brands ([U] today; L0 task). If it may not, the default is **email code** and
  SMS needs the merchant's own DLT (biometric registration — offered, never required).
- **"Verify via Frrata" on WhatsApp is possible only as a Frrata account** — the shopper signs in to *Frrata*, which
  then tells the shop who they are (Razorpay's and Shop's model). That is the cross-store network of § 2, phase L3.
- Limits that matter on a shop's number: a new portfolio reaches 250 unique users / 24 h (whether OTPs count: [U]) — the
  Turn-on screen says so and SMS takes the overflow; pair rate 1 / 6 s → resend waits ≥ 30 s anyway; 80 msg/s is never
  the limit for a shop.

## 2. Cross-store identity (the network) — two layers, one switch
**L1 (per shop, ships first):** a shop's customers are its own. `shop_customers` keyed by a **tenant-keyed** phone HMAC
(HMAC(key, tenant ‖ phone)), so two shops' rows cannot be joined even by Frrata's own queries. The address is
**derived from the shop's own orders** by that phone (no address table: derive, never duplicate). Frrata is the shop's
processor (DPA in the merchant terms).

**L3 (Frrata account, the network effect) — only after a new ADR, counsel, and before/with DPDP (13 May 2027):**
- Frrata is a **Data Fiduciary** for it: its own notice (itemised: phone, name, delivery addresses; purpose: "so other
  shops on Frrata can fill them in"), its own consent tap (never preselected), one-tap "Forget me on other shops", a
  contact, breach runbook, rights within 90 days. English + Hindi.
- Platform tables, outside every tenant: `frrata_ids` (global phone HMAC with a platform pepper, versioned),
  `frrata_vault` (addresses sealed per shopper key; `frata_app` holds **no grant** — read only through a SECURITY
  DEFINER that requires a fresh verified login for that phone and an open network consent, and writes a
  `network_disclosures` row: which shop received what, when), `network_consents` (notice version, given, withdrawn).
- A shop never reads another shop's rows; it receives only what the shopper confirms on its own page ("Use this address?
  Saved from your Frrata account") after a code — the OTPless pattern: exists → consent → reveal.
- No fingerprinting of visitors who never log in (GoKwik does it; a DPDP liability). No profiling of under-18s.

**Sessions and domains (both layers):** no third-party cookies, no iframes, no FedCM in the foundation — they fail in
Safari and in Instagram's in-app browser. Each shop host gets its own first-party session cookie (`__Host-`, HttpOnly,
Secure, SameSite=Lax, 30 days sliding, `customer_sessions` row with its hash; revoke on sign-out). Recognition across
shops is the **verified phone looked up on the server** (one deployment serves every shop, custom domains included);
a new shop always needs one code. Cached shop pages never read the session: login state lives in a client island and
`shopRequest` API routes (no-store), so ISR is untouched (`.claude/rules/storefront.md`).

## 3. Flows and the fallback state machine
Web gets **copy code** (no one-tap/zero-tap without an Android app). The input is `autocomplete="one-time-code"`,
`inputmode="numeric"`; iOS 26+ offers the code from the keyboard. Desktop: the code goes to the phone, typed on the
desktop — no QR needed. The reverse "send this code on WhatsApp" flow is not built (a username user arrives without a
phone: weak proof).

```
idle → phone (cleanMobile: +91, [6-9], 10 digits; risk checks) → choose channel
  WhatsApp if the shop's number is connected and its template APPROVED, else SMS, else email
→ SENT (attempt row committed BEFORE the request — ADR-0008; code HMAC only; TTL = code life, 10 min;
        message_send_ttl_seconds = 600)
  ├─ send fails 131026 (not on WhatsApp) ........ → SMS at once (one tap saved)
  ├─ no "delivered" in 20 s (our timer, tuned) .. → offer "Get it by SMS" (never automatic: the WhatsApp code may still land)
  ├─ "Didn't get it?" after 30 s ............... → resend once on the same channel, or switch
  ├─ code entered: ≤ 5 tries per code ........... → VERIFIED → session; else LOCKED 15 min
  └─ TTL passed ................................ → EXPIRED (a new code needed)
VERIFIED → prefill from this shop's orders (L1) or, with network consent, "Use this address?" (L3)
```
Limits: ≤ 3 codes per phone per 10 min and 10 per day per shop; ≤ 20 per IP /64 per hour; the code is 6 digits,
random, compared by HMAC in constant time. Login is never required to buy (guest checkout stays).

## 4. Billing, metering, abuse
- **WhatsApp**: Meta bills the merchant directly (their own account) — no pass-through, no wallet (RBI rule above).
- **SMS / email**: Frrata pays (~₹0.21–0.30 per SMS incl. GST). Metered as rows (`login_attempts`: tenant, channel,
  outcome, cost in paise) → one line on the merchant's monthly Frrata invoice through the existing billing engine.
- **Price (to decide, § 8)** — the market: KwikPass 5,000 logins/mo free, 20,000 for $20; checkout bundles 2.5–3.5% of
  GMV; nobody else prices login alone. Recommended shape: the module **in the plan** with a monthly SMS allowance (Launch
  500, Growth 3,000, Scale 10,000), then SMS at a flat ₹0.40 each; WhatsApp logins unlimited (merchant's Meta cost).
  `unit-economics-reviewer` runs on the figures.
- **Abuse (OTP pumping)**: Indian mobiles only (+91, [6-9]) — international toll fraud is impossible by construction;
  per-phone, per-IP, per-shop limits (fail closed); a per-shop daily SMS ceiling with an alert; a challenge (Turnstile)
  after the 2nd code from one IP; a pumping signature — sent ≫ verified for a shop in an hour — trips a breaker that
  moves the shop to WhatsApp/email only until reviewed; codes never logged; costs visible to the merchant.

## 5. Data model (L1)
All tenant tables: `tenant_id` first, composite keys, grant + RLS + policy + proof rows, no `frata_admin` grant.
- `shop_customers` (tenant, id, phone_hmac — tenant-keyed, phone (as orders keep it), name, verified_at, created_at;
  unique (tenant, phone_hmac)). Orders gain nothing: a customer's orders are found by phone (derived).
- `login_attempts` (tenant, id, phone_hmac, channel, code_hmac, sent_at, delivered_at, failed_code, verified_at,
  expires_at, tries, cost_paise, ip_hash) — the ADR-0008 attempt row and the meter in one.
- `customer_sessions` (tenant, id, customer_id, token_hash, created_at, last_seen_at, expires_at, revoked_at).
- `customer_consents` (tenant, customer_id, purpose: `marketing_whatsapp` | `marketing_email`, notice_version, given_at,
  withdrawn_at) — the lead's consent, separate from login (Razorpay separates them too).
- Module `shopper_login` (registry), its folders per check:modules; the login widget is a storefront hook (like Reviews).

## 6. Lead generation (in scope)
A verified login is a lead **for that shop only**: phone, name, first-seen source (Analytics' attribution), last order.
An optional, unticked "Send me new drops and offers on WhatsApp" at login records `customer_consents`. Console › Apps ›
Shopper login: logins, verified share, by channel, cost, leads with consent, export (owner/admin, formula-escaped).

## 7. Marketing is a separate module (already planned)
Planned elsewhere and kept apart: Email campaigns (E·4, `docs/specs/2026-11-08-messaging.md`), Cart flows (registry),
WhatsApp broadcasts on Meta's **Marketing Messages API** (marketing leaves the Cloud API 13 Apr / 13 Oct 2027:
`docs/plans/2026-11-09-product-roadmap.md`). They read `customer_consents`; this module never sends marketing.

## 8. Owner decisions before the mockup
1. Accept: **no central WhatsApp sender for shop logins** (Meta policy). WhatsApp from the shop's own number; zero-config
   default = SMS under Frrata's DLT if a TSP confirms, else email code.
2. **The network (Frrata account, L3)**: plan it as a later phase behind a new ADR + counsel review, or not at all.
3. **Price**: in plans with an SMS allowance (recommended), or an add-on.
4. **DLT**: register Frrata as an entity with a transactional header (weeks; biometric of the authorised person) — start now.
5. Name in Apps: "Shopper login" (or "WhatsApp login").

## Phases
- **L0** — decisions (§ 8); TSP confirmation for one platform header; DLT registration; `unit-economics-reviewer`.
- **L1** — per-shop login: WhatsApp (shop's number) + SMS/email fallback, sessions, prefill from the shop's own orders,
  "My orders"; R0 net first (e2e of the state machine with the Meta fake and an SMS fake).
- **L2** — leads and consent, the Apps page, metering on the invoice, the abuse breaker.
- **L3** — Frrata account (network), only with § 8.2 yes and the ADR.

## Design review (short; full review with the agents after § 8)
- **Tenancy**: L1 adds tenant tables only; tenant-keyed HMACs make cross-shop joins impossible; the tenant comes from the
  shop host (`requireShop`), never the body. L3's platform tables are definer-only with a disclosure log.
- **Security**: codes as HMACs, constant-time compare, attempt rows, limits fail closed, no code or phone in logs, cookie
  `__Host-`, session token hashed at rest, sign-out revokes.
- **Performance**: no session read in cached pages; login is an island + API; one statement per lookup.
- **Reliability**: ADR-0008 (the shopper waits), Meta drops undelivered after TTL (free), SMS provider behind
  `fetchWithTimeout`, failures shown in words with the next channel.
- **Unit economics**: WhatsApp cost is the merchant's; SMS is Frrata's → allowance + flat price; reviewer to run.
- **YAGNI**: no one-tap/zero-tap (needs an app), no reverse-OTP, no FedCM/iframes, no passkeys platform-wide (≤ 5
  origins), no Truecaller (Android browser only, terms unknown), no fingerprinting.
