# Pehchaan — one tap, recognised at every Frrata shop (shopper identity network, as an app)
Status: draft (owner direction 2026-11-09; mockup next) · Date: 2026-11-09 · Mockup: pending · Approved: pending
Decision: `docs/decisions/0009-shopper-network.md` · Research: `docs/research/2026-11-09-shopper-login.md`.

**Name.** *Pehchaan* (पहचान, "recognition"): what the shopper gets — known at every shop. The shopper sees one button,
"Continue with Pehchaan", and a small "by Frrata". In Console › Apps it is "Pehchaan — shoppers known at checkout".

## Owner direction (2026-11-09)
- A **Frrata account network** for authentication (ADR-0009): the shopper signs in to Frrata, recognised everywhere.
- **Transactional WhatsApp from Frrata's number** until the merchant connects their own (the Messages module).
- **No SMS** — not integrated or planned until the owner asks. Fallback is an email code.
- Strictly identity and lead capture; marketing stays in its own modules.

## Goal
North star (4) mobile checkout conversion and (1) COD/RTO. A shopper who has bought on any Frrata shop is filled in on
another in one tap; every sign-in proves the phone, the first input RTO Shield scores; shops without their own WhatsApp
still send order updates. **Measures**: checkout completion with vs without Pehchaan (holdout per shop); share of orders
from a verified phone; RTO on verified vs unverified COD; network size (Pehchaan accounts; shops a shopper uses); cost
per sign-in.

## 1. Who sends what (WhatsApp)
| Message | Sent from | Why it is allowed | Who pays Meta |
|---|---|---|---|
| Pehchaan sign-in code | **Frrata's number** (display name Frrata) | Frrata is the business the shopper signs into (its own login) | Frrata |
| Order updates (confirmed, shipped, delivered, COD confirm) | the **shop's own number** when connected; else **Frrata's number** for shoppers with Pehchaan who opted in | Frrata's own utility template in Frrata's voice, "via Frrata", the shop's name a variable; no Meta rule against it, Razorpay does the same (checked 2026-11-09, § 9) | the sender |
| Reviews ask, marketing | the shop's own number only | the shop's own relationship | the merchant |
- Authentication: copy-code template only on the web (one-tap/zero-tap need an Android app); fixed body, no brand variable
  (fine: it is Frrata's own code); TTL 10 min (`message_send_ttl_seconds` 600; undelivered → dropped, not charged).
- One number serves every shop, so its **quality is shared**: a low-quality template is paused 3 h, then 6 h, then
  disabled for every shop, and low quality blocks the next limit step (it no longer lowers the limit). So: one template
  per order event, separate from the sign-in template; per-shop daily caps; a shop whose shoppers block or report
  Frrata's messages is moved to "connect your own number" for order updates (sign-in codes are unaffected).
- **Meta's terms (§4.1, 23 Sep 2026)**: no WhatsApp platform data reaches a merchant from Frrata's number (no
  read/delivered status, "not on WhatsApp", BSUID) — the shop sees Frrata's own order events only; no shop name or logo
  in Frrata's display name; templates never promotional. The Apps page counts messages sent, not read.
- Limits: Frrata's portfolio must reach **unlimited** (verified business, quality) before broad launch; 80 msg/s per
  number; pair rate 1 / 6 s → resend waits ≥ 30 s.

## 2. The network (identity graph) and isolation
**Platform tables (outside every tenant; `frata_app` holds NO grant — definers only, each re-checking proof):**
- `pehchaan_accounts` (id, phone_hmac — platform pepper, versioned; phone sealed; name; created_at; deleted_at)
- `pehchaan_addresses` (account, sealed address, label, last_used_at) — what the shopper saved, edits by them only
- `pehchaan_consents` (account, kind: `network` | `share:<pairwise shop id>`, notice_version, lang, given_at, withdrawn_at)
- `pehchaan_disclosures` (account, pairwise shop id, what: phone/name/address, at) — every reveal, for the shopper's page
- `pehchaan_codes` (account or phone_hmac, channel whatsapp|email, code_hmac, sent_at, delivered_at, failed_code, tries,
  expires_at, shop pairwise id, ip_hash) — the ADR-0008 attempt row and the meter
- `pehchaan_devices` (account, token_hash, created_at, last_seen_at, revoked_at) — the "remember this phone" on
  id.frrata.com (§ 3)
**Per shop (tenant tables, normal RLS):**
- `shop_customers` (tenant, id, **pairwise id** = HMAC(account, tenant) — a shop never holds the account id; phone, name
  as the shopper confirmed them; first_seen, source; unique (tenant, pairwise id))
- `customer_sessions` (tenant, customer, token_hash, expires_at, revoked_at) — the shop's own first-party session
- `customer_consents` (tenant, customer, purpose marketing_whatsapp|marketing_email, notice_version, given/withdrawn)
**Definers (the only doors):** `pehchaan_issue_code`, `pehchaan_verify_code` (returns a short-lived proof),
`pehchaan_share(proof, tenant, items)` (needs the proof AND an open share consent; writes the disclosure; returns only
the items confirmed), `pehchaan_forget_shop`, `pehchaan_delete`. Proofs are single-use, minutes long, bound to the
phone, the shop and the device.
**Rules:** a shop learns nothing about a shopper until the shopper confirms on that shop; addresses go to a shop once,
per order or per confirmed save; two shops cannot correlate (pairwise ids, tenant-keyed hashes); no fingerprinting; no
under-18 profiling (an age line in the notice); delete = account and vault gone, shops keep only the orders they fulfilled.

## 3. Sessions and domains
- **id.frrata.com** (needs frrata.com — owner preparing): Pehchaan's own first-party domain. A device that signed in once
  keeps a `__Host-` cookie there (90 days, revocable from the account page).
- **"Continue as Ananya" (one tap):** the shop opens id.frrata.com by a **top-level navigation** (never an iframe or a
  third-party cookie — those fail in Safari and Instagram's browser); id.frrata.com recognises the device, shows
  "Continue as Ananya ••••3210 to Kesar Studio" with what will be shared, and returns to the shop with a one-time code the
  shop's server exchanges (PKCE-style: state + verifier; code single-use, 60 s, bound to the shop host). No code typed.
- **New device:** phone → WhatsApp code from Frrata → the same confirm screen. Email code when WhatsApp fails (§ 4).
- **On each shop:** its own first-party session cookie (`__Host-`, HttpOnly, Secure, SameSite=Lax, 30 days), a
  `customer_sessions` row. Cached shop pages never read it: sign-in is a client island + `shopRequest` routes (no-store).
- Custom domains work the same way (the return URL is the shop's verified host; open redirects refused).

## 4. Flows and the fallback state machine
```
shop: "Continue with Pehchaan" → top-level to id.frrata.com/continue?shop=<host>&state&challenge
  ├─ device known ─────────────────────────────→ CONFIRM ("Share name, phone, address with Kesar Studio")
  └─ device unknown → PHONE (+91, [6-9]) → CODE_SENT via WhatsApp (attempt row before the call — ADR-0008)
        ├─ send fails 131026 (not on WhatsApp) → EMAIL (ask the email; code by email from frratamail.com)
        ├─ no "delivered" in 20 s ............ → offer "Email me the code instead"
        ├─ ≤ 5 tries per code; ≤ 3 codes / 10 min / phone; ≤ 20 / hour per IP /64 → LOCKED 15 min
        └─ VERIFIED (+ "remember this phone") → CONFIRM
CONFIRM → (first time on Pehchaan: the network notice + its own tap) → back to the shop with a one-time code
shop server exchanges → shop_customers + session → checkout filled; "Not you?" signs out
```
Guest checkout stays. Desktop: the code goes to the phone and is typed on the desktop. No SMS. No reverse wa.me flow.

## 5. Consent (DPDP) — the words the shopper reads
- **Network notice (once, on id.frrata.com, English/Hindi):** "Pehchaan by Frrata keeps your name, phone and delivery
  addresses so shops on Frrata can fill them in when you ask. We share them with a shop only when you tap Continue there.
  You can remove a shop or delete Pehchaan any time at id.frrata.com." + [Create my Pehchaan] (never preselected).
- **Per shop (each first visit):** "Share your name, phone and address with Kesar Studio?" — items listed, [Continue].
- **Marketing (optional, the shop's, unticked):** "Send me new drops from Kesar Studio on WhatsApp" → `customer_consents`.
- **Order updates from Frrata (unticked, checkout):** "Order updates for this order from Frrata on WhatsApp (Kesar
  Studio)" — Meta requires the opt-in to name the sender (Frrata); the shop's name keeps it expected.

## 6. Billing, metering, abuse
- **Sign-in codes: free to merchants, in every plan** (Frrata's cost: ₹0.115 + GST per delivered code; the network is
  the moat — every shop should switch it on). Codes metered in `pehchaan_codes` for Frrata's own costing.
- **Order updates from Frrata's number:** Meta's terms forbid reselling the WhatsApp platform, and a per-message line
  on the merchant's invoice could read as resale. **Until counsel clears it, the cost (₹0.115 + GST each) is carried
  inside Frrata's fee**, not itemised; per-shop caps bound it. Counsel may allow a ₹0.20 "order updates" line. Once the
  shop connects its own number, Meta bills it directly. No wallet (RBI).
- Market: KwikPass 5,000 logins/mo free; checkout bundles 2.5–3.5% of GMV — Pehchaan free + per-message updates is a
  clear story. `unit-economics-reviewer` runs on it.
- **Abuse:** Indian mobiles only (no international pumping); limits per phone, IP /64 and shop, failing closed; a
  challenge after the 2nd code from one IP; a breaker when a shop's codes sent ≫ verified; per-shop daily caps on Frrata's
  number; codes never logged; proofs single-use.

## 7. Lead generation (in scope)
A shopper who continues with Pehchaan on a shop is that shop's lead (pairwise customer, source from Analytics). Console
› Apps › Pehchaan: sign-ins, new vs returning network shoppers ("37% of today's buyers were filled in"), leads with
marketing consent, export (owner/admin). Marketing itself is not sent from here.

## 8. Marketing stays separate (planned)
Email campaigns (E·4), Cart flows, WhatsApp broadcasts on Meta's Marketing Messages API (2027 move): they read the
shop's `customer_consents` and send from the shop's own channels. Pehchaan never markets, and Frrata's number never sends
marketing.

## 9. Open checks before the mockup is final
- ~~Meta policy for order updates from Frrata's number~~ — checked 2026-11-09: allowed with conditions (Frrata's voice,
  shop as a variable, opt-in names Frrata, no platform data to merchants, no promo); § 1 and `frata-integrations` hold
  the facts. Left for counsel: whether per-message billing is "resale" (§ 6).
- **frrata.com** live with `id.` (owner) and **frratamail.com** sending (SPF/DKIM/DMARC) for the email fallback.
- Counsel on the network notice, the merchant DPA and Meta's resale clause (before launch; DPDP binds 13 May 2027).
- Blue tick for Frrata's number: verified portfolio, 30 days on the platform, two-step verification (after the Pvt Ltd).

## Phases (each its own plan; mockup first)
- **P0** — Frrata's WhatsApp number + Pehchaan auth template (owner's WhatsApp Business setup), id.frrata.com, email
  sender; policy answer (§ 9); unit-economics review.
- **P1** — Pehchaan sign-in on shops: the vault, definers, codes (WhatsApp, email fallback), the confirm screen, shop
  sessions, checkout prefill; R0 net first (e2e: phone → code → confirm → filled; a second shop → one tap).
- **P2** — "Continue as …" one tap (remembered device), the shopper's page (shops, addresses, disclosures, forget,
  delete), the Apps page with leads and consent.
- **P3** — order updates from Frrata's number for shops without their own (if § 9 allows), metered on the invoice, the
  quality breaker.
- Review agents (tenancy, security, architecture, speed, unit economics) on each plan before code.

## Design review (headline; full review per phase plan)
- **Tenancy**: platform tables definer-only, no `frata_app` grant; pairwise ids; disclosure log; shop data unchanged.
- **Security**: top-level redirect with state + PKCE, exact return host, single-use proofs and codes, `__Host-` cookies,
  HMACs only, limits fail closed, breach runbook.
- **Performance**: shop pages stay cached (island + no-store API); one definer call per step.
- **Reliability**: ADR-0008 attempt rows; Meta drops undelivered after TTL (free); email fallback.
- **YAGNI**: no SMS, no one-tap/zero-tap (app only), no reverse OTP, no FedCM/iframes, no platform passkeys, no
  fingerprinting, no marketing.
