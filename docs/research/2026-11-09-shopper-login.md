# Shopper login (KwikPass-style) — research
Date: 2026-11-09 · By: integration-researcher (Meta, SMS, TRAI) and a research agent (competitors, DPDP, browsers) ·
For: `docs/specs/2026-11-09-shopper-login.md`. Every fact carries its source and date; [V] read on the primary page,
[V-undated] primary page with no date of its own, [S] secondary, [U] unverified, [OLD] newest source > 12 months.

## 1. The finding that reshapes the brief: no shared WhatsApp sender for shop logins
- Meta: "Sharing a Messaging account across multiple businesses is against policy"; one business, one WhatsApp
  account [V-undated, …/authentication-templates/authentication-best-practices, read 2026-11-09].
- Policy: no impersonating another business or speaking for one "without permission" [V, whatsappbusiness.com/policy,
  23 Sep 2026].
- Twilio Verify ended its shared WhatsApp sender for this reason: "Effective March 1, 2024, you must bring your own brand
  and phone number" [V, twilio.com/docs/verify/whatsapp, modified 2026-03-09]. OTPless and MSG91 document only the
  customer's own number [V-undated / S].
- → A "Verify via Frrata" number may send OTPs only where **Frrata is the business the shopper signs into** (Frrata's own
  sign-up today; a Frrata-wide shopper account later, § 4). A shop's own login code goes from **the shop's own number**
  (Embedded Signup — the Messages module, built), billed by Meta to the merchant.

## 2. WhatsApp authentication templates (web storefronts)
- Body is fixed preset text, the code the only variable ("<code> is your verification code."); optional security line;
  expiry footer 1–90 min; code ≤ 15 chars; no URLs, media, emojis; **no brand variable** — the shop is known only by the
  sending number's display name [V-undated, authentication-templates + copy-code pages].
- One-tap and zero-tap need an Android app (package name + signature hash + handshake) → **a web shop gets copy code
  only**; iOS 26+ offers the code from the keyboard with no integration, earlier iOS none [V-undated].
- Delivered to the primary device only (masked on linked devices). TTL default 10 min, `message_send_ttl_seconds`
  30–900; undelivered → dropped, and Meta charges only on delivery [V-undated, time-to-live, pricing].
- Cannot be sent to a username-only user (BSUID): it needs the phone [V-undated, business-scoped-user-ids].
- Reverse "send this code on WhatsApp" (wa.me prefilled): no Meta rule either way [U]; a username user's message may
  arrive with no phone → weak proof of the number. Not built on.
- No third-party "Sign in with WhatsApp" exists [U, absence].
- Limits: messaging limit per business portfolio, 250 → 2K → 10K → 100K → unlimited unique users / 24 h (silent on
  authentication [U]); 80 msg/s per number; pair rate 1 per 6 s to one user (burst 45; 131056) [V-undated].
- Price India (1 Oct 2026, before GST): authentication ₹0.1150, international ₹2.4971 (only above 750K/30 days outside
  windows) [S, watsberry 2026-10-01]; billed to the sending account [V-undated, pricing].
- Errors: 131026 not on WhatsApp → another channel; webhook latency and whether 131026 is synchronous: undocumented [U].

## 3. SMS OTP in India (the zero-config channel)
- TRAI TCCCPR 2nd Amendment (12 Feb 2025) [V, gazette PDF]: OTP for e-commerce / app login is **Transactional** (within
  30 min of the customer's own action, no explicit consent); headers suffixed -P/-S/-T/-G; registering an entity needs
  physical verification + biometric of the authorised person; headers/templates unused 90 days deactivated; ≤ 2
  telemarketers in the chain.
- **One platform header for many brands: [U]** — no TRAI or operator text found; a TSP (operator) must confirm before
  building. Per-merchant DLT (biometric) is a big ask of a small brand.
- Price: MSG91 OTP ₹0.25 → ₹0.18 by volume + 18% GST [V-undated]; Gupshup ~₹0.17, Kaleyra ~₹0.18 [S, 2026-05]; Twilio
  India $0.0832/segment [V, "current as of October 2026"]. Delivery speed: [U].

## 4. Competitors (pricing and the network)
| Product | How the shopper is known | Price model | Source |
|---|---|---|---|
| GoKwik KwikPass | phone + OTP; "smart fingerprinting" of visitors who never log in (claims 30% identified) | 5,000 logins/mo free; 20,000 for $20/mo; custom | apps.shopify.com/kwikpass (Oct 2026) [V] |
| GoKwik checkout | bundled | ₹3,000/mo + 3.5% (0–2k orders) | gokwik.co/pricing [V-undated] |
| Razorpay Magic / "Login with Razorpay" | a **Razorpay account** linked to the phone; shared with "that specific Merchant" | enterprise quote; free to install | razorpay.com/magic (Aug 2026) [V]; buyer terms (10 Oct 2025) |
| Shiprocket Fastrr (Identity) | phone OTP; "95% autofilled" | usage-based, unpublished | checkout.shiprocket.in [V-undated] |
| Cashfree Checkout360 | WhatsApp OTP; "120M+ profiles" | unpublished | cashfree.com [V-undated] |
| OTPless Address Autofill | check exists → **consent notice** → reveal | per auth ($0.0012 [S, undated]) | otpless.tech [V-undated] |
| Shopify Shop | email → Shop account → code by SMS/email on a new device | free to shoppers | Shopify help, privacy (2 Mar 2026) [V] |
| Prizma OTP Login | per message | $0.01 per WhatsApp OTP or SMS | apps.shopify.com (current) [V-undated] |
- Nobody sells a priced "login" alone except KwikPass credits; checkout bundles charge 2.5–3.5% of GMV. Conversion and
  RTO claims (+34–60% conversion, −30–90% RTO) are vendor figures with no method — only a holdout on Frrata's own shops
  gives a claimable number.
- Simpl was ordered by RBI to stop payment operations (25 Sep 2025) [OLD]: keep login strictly away from money movement.
- **Every cross-store network is a provider account keyed by the verified phone**, looked up server-side. None relies on
  third-party cookies.

## 5. DPDP (Act 2023, Rules 13 Nov 2025)
- Notice, consent, security, breach, rights: from **13 May 2027** (18 months; a cut to 12 was floated, not notified).
  Consent Manager registration from 13 Nov 2026 [V, Rules G.S.R. 846(E); PIB 17 Nov 2025].
- Consent: "free, specific, informed, unconditional and unambiguous with a clear affirmative action" (s.6); an itemised,
  stand-alone notice; withdrawal as easy as giving; the fiduciary must prove notice and consent (log version + time).
- A shopper's address given to store A for delivery is a legitimate use **for store A only**; reusing it at store B is
  a new purpose needing consent.
- Per shop, Frrata is the merchant's **processor** (DPA in the merchant terms). For a cross-store network Frrata decides
  a purpose no merchant does → **Frrata is a Data Fiduciary** in its own right (own notice, consent, contact, breach
  duties, rights in 90 days). Frrata cannot be the Consent Manager (it must not read the data, no conflicts).
- Children: under 18 → verifiable parental consent; no tracking or targeted ads. Breach: notify people without delay,
  the Board within 72 h. Penalties up to ₹250 crore.

## 6. Browsers (cross-domain)
- Chrome keeps third-party cookies by user choice (17 Oct 2025 [OLD by weeks]); Safari blocks them; CHIPS partitions per
  top-level site (cannot carry identity across shops by design); FedCM Chrome/Edge only, not Android WebView (where
  Instagram lands); Storage Access API needs a prior visit + gesture, not in WebView [V web-features 2026].
- Passkeys: Related Origin Requests ≤ 5 labels → per shop domain, never platform-wide [V, passkeys.dev 2026-02-05].
  Google sign-in: every origin registered. Truecaller web: Android browsers only, price [U].
- → **The only cross-shop key that works everywhere is the verified phone, looked up on the server.** Every Frrata shop is
  one deployment, so no browser state needs to cross domains.
