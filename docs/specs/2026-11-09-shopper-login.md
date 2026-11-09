# EkCode — one tap, recognised at every Frrata shop (shopper identity network, as an app)
Status: active · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/A33Xi8HVfsAyZqQ2pn7uKu
(`docs/mockups/2026-11-09-ekcode.html`, v4) · Approved: owner, 2026-11-09
Decision: `docs/decisions/0009-shopper-network.md` · Research: `docs/research/2026-11-09-shopper-login.md`.

**Name (owner, 2026-11-09).** **EkCode**: one code, every Frrata shop; said "ek code"; `ekcode_*` in code. Devanagari
appears only in the drawn mark: every word on every screen is English (owner). The shopper sees one button, "Continue
with" + the mark, and nothing else on ekcode.in. In
Console › Apps (Grow): "EkCode — Shoppers filled in at checkout".

**Brand (owner, 2026-11-09).** EkCode is its own brand: the service that keeps a shopper's codes and WhatsApp for
them. **Nothing a shopper sees says Frrata**: not the sign-in pages, the notice, the WhatsApp name or messages, the
email, nor the checkout tick. EkCode has its own domain (`ekcode.in` in the mockup; owner to buy), its own WhatsApp
number and display name "EkCode" (Meta approves a name that matches a brand of the verified business: the ekcode.in
site shows it), and its own email sender. The company behind it is named once, in EkCode's privacy policy, because the
data law needs the fiduciary's identity and contact. Merchants meet EkCode as an app in their console.

**Mark (owner's pick, 2026-11-09).** एक inside one rounded box (a code cell) with a rani cursor under it; "Code" open
beside it; Mukta 700 for both scripts. The box alone is the icon (filled ink below 48 px; ए alone at 16 px). The shop
button is ink on light themes, paper on dark, never in a shop's colours. Drawn once as paths when built; never typed.
WhatsApp's display name is "EkCode" (Brand, above).

## Owner calls (2026-11-09)
- Mockup approved (v4), with: no charge past the allowance; English only until the owner plans other languages;
  grievance contact **Priti Bag, privacy@ekcode.in**.
1. "Save this address to EkCode" at checkout starts **ticked** for a shopper with an EkCode (counsel confirms the notice
   covers it).
2. Apply for the blue tick 30 days after EkCode's number goes live.
3. EkCode gets its own domain, email sender and WhatsApp number (owner to buy and set up; `ekcode.in` is a placeholder).

## Owner direction (2026-11-09)
- A **Frrata account network** for authentication (ADR-0009): the shopper signs in to Frrata, recognised everywhere.
- **Transactional WhatsApp from EkCode's number** until the merchant connects their own (the Messages module).
- **No SMS** — not integrated or planned until the owner asks. **No email at all for now** (owner, 2026-11-09): planned later,
  once Amazon SES is connected. (Review 2026-11-09: an email code proves an email, never a phone, so when it comes it must
  never open an account keyed by the phone.)
- Strictly identity and lead capture; marketing stays in its own modules.

## Goal
North star (4) mobile checkout conversion and (1) COD/RTO. A shopper who has bought on any Frrata shop is filled in on
another in one tap; every sign-in proves the phone, the first input RTO Shield scores; shops without their own WhatsApp
still send order updates. **Measures**: checkout completion with vs without EkCode (holdout per shop); share of orders
from a verified phone; RTO on verified vs unverified COD; network size (EkCode accounts; shops a shopper uses); cost
per sign-in.

## 1. Who sends what (WhatsApp)
| Message | Sent from | Why it is allowed | Who pays Meta |
|---|---|---|---|
| EkCode sign-in code | **EkCode's number** (display name EkCode) | Frrata is the business the shopper signs into (its own login) | Frrata |
| Order updates (confirmed, shipped, delivered, COD confirm) | the **shop's own number** when connected; else **EkCode's number** for shoppers with EkCode who opted in | Frrata's own utility template in Frrata's voice, "via EkCode", the shop's name a variable; no Meta rule against it, Razorpay does the same (checked 2026-11-09, § 9) | the sender |
| Reviews ask, marketing | the shop's own number only | the shop's own relationship | the merchant |
- Authentication: copy-code template only on the web (one-tap/zero-tap need an Android app); fixed body, no brand variable
  (fine: it is Frrata's own code); TTL 10 min (`message_send_ttl_seconds` 600; undelivered → dropped, not charged).
- One number serves every shop, so its **quality is shared**: a low-quality template is paused 3 h, then 6 h, then
  disabled for every shop, and low quality blocks the next limit step (it no longer lowers the limit). So: one template
  per order event, separate from the sign-in template; per-shop daily caps; a shop whose shoppers block or report
  EkCode's messages is moved to "connect your own number" for order updates (sign-in codes are unaffected).
- **Meta's terms (§4.1, 23 Sep 2026)**: no WhatsApp platform data reaches a merchant from EkCode's number (no
  read/delivered status, "not on WhatsApp", BSUID) — the shop sees its own order events only; no shop name or logo
  in EkCode's display name; templates never promotional. The Apps page counts messages sent, not read.
- Limits: Frrata's portfolio must reach **unlimited** (verified business, quality) before broad launch; 80 msg/s per
  number; pair rate 1 / 6 s → resend waits ≥ 30 s.

## 2. The network (identity graph) and isolation
**Platform tables (outside every tenant; `frata_app` holds NO grant — definers only, each re-checking proof):**
- `ekcode_accounts` (id, phone_hmac — platform pepper, versioned; phone sealed; name; created_at; deleted_at)
- `ekcode_addresses` (account, sealed address, label, last_used_at) — what the shopper saved, edits by them only
- `ekcode_consents` (account, kind: `network` | `share:<pairwise shop id>`, notice_version, lang, given_at, withdrawn_at)
- `ekcode_disclosures` (account, pairwise shop id, what: phone/name/address, at) — every reveal, for the shopper's page
- `ekcode_codes` (account or phone_hmac, channel whatsapp|email, code_hmac, sent_at, delivered_at, failed_code, tries,
  expires_at, shop pairwise id, ip_hash) — the ADR-0008 attempt row and the meter
- `ekcode_devices` (account, token_hash, created_at, last_seen_at, revoked_at) — the "remember this phone" on
  ekcode.in (§ 3)
**Per shop (tenant tables, normal RLS):**
- `shop_customers` (tenant, id, **pairwise id** — a random id per (account, shop) from `ekcode_pairs`, deletable on
  "forget"; a shop never holds the account id; phone, name; first_seen, source; unique (tenant, phone): guests and
  EkCode shoppers in one row, shaped for Messages M·1, ADR-0010)
- `customer_sessions` (tenant, customer, token_hash, expires_at, revoked_at) — the shop's own first-party session
- `customer_consents` (tenant, customer, purpose marketing_whatsapp|marketing_email, notice_version, given/withdrawn)
**Definers (the only doors):** `ekcode_issue_code`, `ekcode_verify_code` (returns a short-lived proof),
`ekcode_share(proof, tenant, items)` (needs the proof AND an open share consent; writes the disclosure; returns only
the items confirmed), `ekcode_forget_shop`, `ekcode_delete`. Proofs are single-use, minutes long, bound to the
phone, the shop and the device.
**Rules:** a shop learns nothing about a shopper until the shopper confirms on that shop; addresses go to a shop once,
per order or per confirmed save; two shops cannot correlate (pairwise ids, tenant-keyed hashes); no fingerprinting; no
under-18 profiling (an age line in the notice); delete = account and vault gone, shops keep only the orders they fulfilled.

## 3. Sessions and domains
- **ekcode.in** (owner to buy): EkCode's own first-party domain. A device that signed in once
  keeps a `__Host-` cookie there (90 days, revocable from the account page).
- **"Continue as Ananya" (one tap):** the shop opens ekcode.in by a **top-level navigation** (never an iframe or a
  third-party cookie — those fail in Safari and Instagram's browser); ekcode.in recognises the device, shows
  "Continue as Ananya ••••3210 to Kesar Studio" with what will be shared, and returns to the shop with a one-time code the
  shop's server exchanges (PKCE-style: state + verifier; code single-use, 60 s, bound to the shop host). No code typed.
- **New device:** phone → WhatsApp code from EkCode → the same confirm screen. If the code doesn't arrive: Resend or
  guest checkout (§ 4).
- **On each shop:** its own first-party session cookie (`__Host-`, HttpOnly, Secure, SameSite=Lax, 30 days), a
  `customer_sessions` row. Cached shop pages never read it: sign-in is a client island + `shopRequest` routes (no-store).
- Custom domains work the same way (the return URL is the shop's verified host; open redirects refused).

## 4. Flows and the fallback state machine
```
shop: "Continue with EkCode" → shop's /api/shop/ekcode/start (flow made server-side) → ekcode.in/continue?flow=<handle>
  ├─ device known ─────────────────────────────→ CONFIRM ("Share name, phone, address with Kesar Studio")
  └─ device unknown → PHONE (+91, [6-9]) → CODE_SENT via WhatsApp (attempt row before the call — ADR-0008)
        ├─ not delivered in 20 s (or 131026; never said aloud) → "Didn't get it?" Resend · Check out as a guest
        ├─ ≤ 5 tries per code; ≤ 3 codes / 10 min / phone; ≤ 20 / hour per IP /64 → LOCKED 15 min
        └─ VERIFIED (+ "remember this phone") → CONFIRM
CONFIRM → (first time on EkCode: the network notice + its own tap) → back to the shop with a one-time code
shop server exchanges → shop_customers + session → checkout filled; "Not you?" signs out
```
Guest checkout stays. Desktop: the code goes to the phone and is typed on the desktop. No SMS. No reverse wa.me flow.

## 5. Consent (DPDP) — the words the shopper reads
- **Network notice (once, on ekcode.in, English):** "EkCode keeps your name, phone and delivery
  addresses so shops can fill them in when you ask. We share them with a shop only when you tap Continue there.
  You can remove a shop or delete EkCode any time at ekcode.in." + [Create my EkCode] (never preselected).
- **Per shop (each first visit):** "Share your name, phone and address with Kesar Studio?" — items listed, [Continue].
- **Marketing (optional, the shop's, unticked):** "Send me new drops from Kesar Studio on WhatsApp" → `customer_consents`.
- **Order updates from EkCode (unticked, checkout):** "Order updates for this order from EkCode on WhatsApp" — Meta
  requires the opt-in to name the sender (EkCode); the messages name the shop.

## 6. Billing, metering, limits (owner, 2026-11-09)
- **Sign-in codes: free and unlimited on every plan** (Frrata's cost ₹0.115 + GST per delivered code; ~₹26 / ₹259 /
  ₹863 a month at 1.5 codes per order for Launch / Growth / Scale). Metered in `ekcode_codes` for Frrata's own costing.
- **Order updates from EkCode's number: a monthly allowance by plan**, 4 per included order — Launch 600, Growth 6,000,
  Scale 20,000 — at no charge (Frrata's cost at full use ₹69 / ₹690 / ₹2,300; 0.9% / 2.0% / 3.5% of that shop's
  revenue at ₹2,000 per order, an assumption). Counted on *delivered* messages, reset on the 1st (IST).
- **Past the allowance (owner, 2026-11-09): no charge per message, ever.** Updates from EkCode's number pause until
  the 1st (IST); sign-in codes never stop. Console › Apps › EkCode › More updates offers: **wait until the 1st**,
  **move up a plan** (the next plan's allowance), or **connect your own number** (no allowance; Meta bills the shop).
  At 80% the Apps row turns amber and "Needs you" says so.
- **P3 (review 2026-11-09, recommended)**: the allowance is the larger of 600 / 6,000 / 20,000 and 4 × orders placed
  this month; a COD confirmation never pauses. Costs are stated net of delivery (1.07 / 2.20 / 3.77% of that shop's
  revenue at ₹2,000), ex GST: Frrata reclaims the GST on Meta's invoice (owner, 2026-11-09).
- Allowances are a versioned row (`ekcode_pricing`: allowance and codes a day per plan, from-date), set in Admin ›
  EkCode › Controls. Frrata's cost is carried inside its fee; nothing about WhatsApp is itemised on the merchant's bill,
  so Meta's no-resale clause is not touched.
- Market: KwikPass 5,000 logins/mo free; checkout bundles 2.5–3.5% of GMV. `unit-economics-reviewer` runs on these
  numbers before the P3 plan.
- **Abuse limits (not pricing):** Indian mobiles only; 3 codes per number / 10 min; 5 tries per code; 20 codes per
  network (/64) per hour, a proof of work after the 2nd (no vendor); per-shop codes per day Launch 100 · Growth 600 ·
  Scale 2,000 (review 2026-11-09; caps the worst month at ₹345 / ₹2,070 / ₹6,900)
  (Admin can raise one shop); the breaker when < 40% of a shop's codes are right after 200; failing closed; codes never
  logged; proofs single-use.
- **Meta's own cap**: unique people per 24 h on EkCode's number (2,000 → 10,000 → 100,000 → unlimited) is shared by
  every shop; onboarding pace follows it (Admin › WhatsApp shows the step). Whether codes count: unknown, assume yes.

## 7. Lead generation (in scope)
A shopper who continues with EkCode on a shop is that shop's lead (pairwise customer, source from Analytics). Console
› Apps › EkCode: sign-ins, new vs returning network shoppers ("37% of today's buyers were filled in"), leads with
marketing consent, export (owner/admin). Marketing itself is not sent from here.

## 8. Marketing stays separate (planned)
Email campaigns (E·4), Cart flows, WhatsApp broadcasts on Meta's Marketing Messages API (2027 move): they read the
shop's `customer_consents` and send from the shop's own channels. EkCode never markets, and EkCode's number never sends
marketing.

## 9. Open checks before the mockup is final
- ~~Meta policy for order updates from EkCode's number~~ — checked 2026-11-09: allowed with conditions (EkCode's voice,
  shop as a variable, opt-in names EkCode, no platform data to merchants, no promo); § 1 and `frata-integrations` hold
  the facts. No per-message charge to merchants (owner), so the resale question is closed.
- **ekcode.in** bought (owner), with its site naming the business (for Meta's display-name check) and an email sender
  on it (SPF/DKIM/DMARC) for the fallback code.
- Counsel on the network notice (English only until the owner plans other languages), the privacy policy and terms,
  the merchant DPA and "Save this address" ticked (before launch; DPDP binds 13 May 2027).
- Blue tick for EkCode's number: verified portfolio, 30 days on the platform, two-step verification (after the Pvt Ltd).

## 10. Where EkCode runs (no separate product, no public API)
EkCode is **a brand, not a second system**. It runs in Frrata's one deployment, on its own host:
- `ekcode.in` is routed by host in `src/middleware.ts`, the way a shop's host is, to its own route group
  (`src/app/ek/`, `src/app/api/ek/`) with its own layout, look and `__Host-` cookie. It shares nothing visible with the console or a
  shop. Pages: the public home, Privacy, Terms, Contact, `/continue` (sign-in and Continue) and the shopper's page.
- A Frrata shop opens `ekcode.in/continue` by a top-level redirect and gets a one-time code back (§ 3); its server
  exchanges the code **inside the same deployment** through the definers (§ 2). No API keys, no SDK, no webhooks
  between EkCode and the shops: they share one database and one release.
- **Not like GoKwik on Shopify.** GoKwik is an outside company, so it must expose an API, an app listing and a script
  for stores it doesn't run. EkCode only serves Frrata shops, so it needs none of that. Cost: one more domain on the
  Vercel project; no new service, database, deploy or bill.
- **Later, if EkCode is sold to stores outside Frrata** (Shopify, WooCommerce): then it gets the outside pieces — an
  OAuth-style "Continue with EkCode" for any site (client id, registered return URLs, PKCE), a script button, a
  merchant sign-up and per-sign-in billing. Signal: the owner decides to sell EkCode on its own. The pairwise ids,
  consent log and brand already fit that; only the door changes.

## 11. Frrata Admin › EkCode (staff; mockup § Admin)
The whole network seen and steered by Frrata staff (`requireStaff`; writes admin-role only, each with a reason, in
Admin › Activity). **Staff see counts, costs and health — never a shopper's address or a list of shoppers.**
- **Overview**: accounts, signed in (30 d), shops with EkCode on, shoppers on 2+ shops; the sign-in steps (tapped →
  number in → code arrived → code right → continued); cost this month (codes and order updates, delivered × Meta's
  dated rate, with GST; per sign-in; email codes); "Needs you" (breakers, paused templates, requests near their due date).
- **Shops**: per shop — on/off, sign-ins, share of codes right, cost, order updates, state (OK, Breaker, Own number,
  Off by shop); Pause EkCode for one shop (reason; the shop sees "Paused").
- **WhatsApp**: EkCode's number (name approved, quality, daily limit and the next step, blue tick date), every template's
  state (approved, in review, paused until, disabled), refusals in 24 h (not on WhatsApp → email, too many to one
  person, held back).
- **Privacy**: rights requests (erase, copy, correct, complaint) with the 90-day due date; erase only after a code to
  the account's number; "Find an account" by exact number with a reason — shows when made, how many shops and phones,
  never who or where, and is logged; the notice and its versions (agreed counts); the breach steps (Board in 72 h).
- **Controls**: switches for every shop (sign-in, email fallback, order updates from EkCode's number); limits (codes per
  number, tries per code, codes per network, codes per shop, the breaker's threshold); blocked numbers with reasons.
- **Data for it**, all behind definers like the vault: `ekcode_flows` (one row per sign-in attempt: shop, started,
  number_in, code_sent, delivered, verified, account_created, continued, abandoned — timestamps only, state derived;
  no phone), `ekcode_settings` (the switches and limits, versioned), `ekcode_blocks`, `ekcode_requests`,
  `ekcode_staff_lookups`. `frata_admin` calls `ekcode_admin_stats(period)` (aggregates only),
  `ekcode_admin_shops(period)`, `ekcode_admin_lookup(phone, reason)` (logged, admin role) and the setters. Nothing in
  Admin reads `ekcode_accounts` or `ekcode_addresses` directly.

## Phases (each its own plan; mockup first)
- **P0** — EkCode's WhatsApp number (under Frrata's verified business) + auth template (owner's WhatsApp Business setup), the ekcode.in domain and site, email
  sender; policy answer (§ 9); unit-economics review.
- **P1** — EkCode sign-in on shops: the vault, definers, WhatsApp codes only (no email until SES is planned), the confirm screen, shop
  sessions, checkout prefill; the ekcode.in host and its public pages; Admin › EkCode Overview, Shops and Controls
  (the switches, limits, breaker and blocks must exist before the first real code); R0 net first (e2e: phone → code →
  confirm → filled; a second shop → one tap).
- **P2** — "Continue as …" one tap (remembered device), the shopper's page (shops, addresses, disclosures, forget,
  delete), the Apps page with leads and consent; Admin › Privacy (requests, lookup, notice versions).
- **P3** — order updates from EkCode's number for shops without their own (allowed, § 9), cost inside Frrata's fee until
  counsel clears a line, the quality breaker; Admin › WhatsApp (templates per event, refusals).
- Review agents (tenancy, security, architecture, speed, unit economics) on each plan before code.

## Design review (headline; full review per phase plan)
- **Tenancy**: platform tables definer-only, no `frata_app` grant; pairwise ids; disclosure log; shop data unchanged.
- **Security**: top-level redirect with state + PKCE, exact return host, single-use proofs and codes, `__Host-` cookies,
  HMACs only, limits fail closed, breach runbook.
- **Performance**: shop pages stay cached (island + no-store API); one definer call per step.
- **Reliability**: ADR-0008 attempt rows; Meta drops undelivered after TTL (free); Resend or guest checkout.
- **YAGNI**: no SMS, no one-tap/zero-tap (app only), no reverse OTP, no FedCM/iframes, no platform passkeys, no
  fingerprinting, no marketing.
