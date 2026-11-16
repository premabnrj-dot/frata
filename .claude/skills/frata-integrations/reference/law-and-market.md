# frata-integrations — Commerce law, privacy, trust and safety, competitors

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Commerce law and checkout references
- Privacy — checked 2026-11-06
- Trust and safety — checked 2026-11-08
- Consumer protection
- Shopify

## Commerce law and checkout references (offers) — checked 2026-11-08 (research `docs/research/2026-11-08-coupons.md`)

- Apparel GST 5% ≤ ₹2,500 a piece, 18% above, from 22 Sep 2025 [V PIB 2025-09-17; S LS Q2509 2025-12-15]; the slab is on
  the post-discount pre-GST value per piece [S] (decision 1, plan 2026-11-08-offers).
- s.15(3)(b) substituted from 1 Nov 2026 (N 03/2026-CT): a post-supply discount needs a credit note and ITC reversal [V by
  two sources, gazette unread]. BOGO = two supplies at one price, rate per s.8 (Circular 92/11/2019) [V].
- E-Commerce (Amendment) Rules 2026, G.S.R. 789(E) of 9 Sep 2026, from 1 Jan 2027: a price cut shows the prior price = the lowest
  in 30 days (r.4(13)); yearly dark-pattern self-audit and certificate (r.4(15)) [V, gazette read 2026-11-11; § Consumer protection].
- No sale above MRP including taxes (Legal Metrology r.18(2), r.2(m)) [V, consolidated to 2026-02-13].
- A purchase-linked contest or game of chance is an unfair trade practice unless prescribed (CPA s.2(47)(iii)(b)) [S].
- CCPA: recurring countdowns treated as false urgency; fees added at checkout as drip pricing; penalties ₹1–7 lakh so far
  [S Bar & Bench 2026-09-01; LS Q5415 2026-03-25].
- Razorpay Magic Checkout: auto-apply best coupon; "unavailable" coupons shown disabled until eligible; prepaid-only
  coupons remove COD; budget, total and per-customer limits; prepaid discount on COD orders excludes shipping and COD fee
  [V magic-checkout/shopify/features lastmod 2026-10-23; order-settings/prepay-cod lastmod 2026-10-08].
- Baymard: collapse the promo field and auto-apply (83% of sites don't) [V 2026-06-01]; show free-shipping qualification
  in the cart summary [V 2026-11-02].

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

## Trust and safety — checked 2026-11-08 (integration-researcher; gazette pages 403, so [S])

- IT (Intermediary) Amendment Rules 2026, G.S.R. 120(E), in force 20 Feb 2026: court/government takedown **3 h** (was
  36); grievances resolved in 7 days (was 15); unlawful content 36 h (was 72); intimate imagery 2 h (was 24); a user
  advisory every 3 months; all intermediaries. 24 h acknowledgement unchanged [S, Khaitan 2026-02-16, Cyril Shroff
  2026-02-11]. Draft Second Amendment (30 Mar 2026): 180-day retention a minimum; not notified as of 24 Aug 2026 [S].
- E-Commerce (Amendment) Rules 2026 (G.S.R. 789(E), 9 Sep 2026, from 1 Jan 2027): yearly dark-pattern self-audit with a
  certificate; a copy of the complaint to the complainant; grievance 48 h / one month unchanged [V, gazette read 2026-11-11].
- Hindware v Google (Delhi HC, 22 May 2026): safe harbour lost by a tool that aids infringement [S, Medianama].
- Shopify: product-level enforcement first, account last; trademark notices shown to the merchant in admin [V-undated].
- Turnstile Free: 20 widgets, 10 hostnames each, no challenge cap; Siteverify mandatory, token 300 s, single use
  [V 2026-08-14, 2026-10-22]. hCaptcha Pro $139/month [V-undated].
- Safe Browsing API non-commercial only (v4 deprecated) → **Web Risk** for our hosts (price [U]); v5 host checks from the
  PSL eTLD+1 [V-undated]. Search Console Domain property covers all subdomains [V-undated].
- Whether a SaaS store builder is an "intermediary" (s.2(1)(w)) [U]: a lawyer confirms before the first public shop.

## Consumer protection (E-Commerce Rules, Legal Metrology) — checked 2026-11-11 (integration-researcher; gazette text read)

- **E-Commerce (Amendment) Rules 2026 = G.S.R. 789(E)**, Gazette Extraordinary Part II s.3(i) No. 721, dated 9 Sep 2026
  (eGazette CG-DL-E-10092026-276125; PIB 10 Sep), in force **1 Jan 2027** [V, gazette PDF via taxheal mirror; egazette.gov.in
  503]. Substitutes r.3(1)(j), r.4(2),(5),(6),(7), r.5(3)(a),(c),(f), r.6(5)(d), r.7(1)(a); inserts r.4(11)(c), 4(12)–(15),
  r.5(6)–(7), r.6(5)(j). r.4(4) untouched.
- **r.4(2) from 1 Jan 2027**, every e-commerce entity, "in a clear and accessible manner on its platform, displayed prominently at
  an appropriate place": legal name; principal geographic address of HQ **and all branches**; name and details of its website;
  "e-mail address, landline and mobile numbers" of customer care AND the grievance officer [V]. No footer or every-page rule;
  "appropriate place" undefined [V absence]. Until 31 Dec 2026 also "fax" [S, lexcomply 2026-09-22].
- r.4(4): grievance officer's "name, contact details, and designation" on the platform [U, undated page]. CCPA v Agoda
  (14 Oct 2026): details not prominent breached r.4(2), 4(4); a prominent link to name, designation, India email [S, TaxGuru
  2026-10-15; order unread].
- **Grievances r.4(5) from 1 Jan 2027**: acknowledge in 48 h, give the complainant "a copy of the complaint as recorded", redress
  within one month of receipt [V]. A ticket number per complaint to track status, r.7(1)(f) [U, undated page]. r.4(7): every
  e-commerce entity "shall become a partner" in the National Consumer Helpline convergence process (was best effort) [V].
- r.4(6) imported goods: importer's name and details; "full and complete name of the country of origin" [V]. r.4(13) prior price =
  lowest in 30 days; r.4(14) invoice: seller's name "in the same font size as that of the e-commerce entity's name"; r.4(15)
  yearly dark-pattern self-audit, certificate "displayed prominently" (where: not stated) [V].
- **Own-site D2C brand = inventory e-commerce entity** ("shall include single brand retailers") → r.4 + r.7, not r.6 (sellers on a
  marketplace) [U, undated page; S AZB 2026-09-18]. r.7(1)(a) from 1 Jan 2027: return, refund, exchange, best before/use before,
  warranty, delivery and shipment, cost of return shipping, mode of payments, grievance redressal [V]. Whether Frrata or the
  merchant is "the e-commerce entity" on a hosted shop: counsel [U].
- Marketplace only (r.5, r.6): seller GSTIN/MSME number r.6(5)(j); country of origin r.6(5)(d); no bundled fees, consumer-data
  limits r.5(6)–(7) [V].
- **Legal Metrology r.6(10)**: an e-commerce entity shows the r.6(1) declarations "except the month and year" of manufacture:
  manufacturer/packer/importer name and address, country of origin (imported), generic name, net quantity, MRP incl. all taxes,
  dimensions where relevant [V, Khaitan consolidation as amended to 2026-02-13]. LMPC "E-commerce entity" = a company or foreign
  company/branch (r.2(be)); a proprietor or LLP brand may be outside it [V text / U reading]. r.6(10A) searchable, sortable
  country-of-origin filter for imported products from **1 Jul 2027** (G.S.R. 312(E), 27 Apr 2026, replacing 1 Jul 2026 in G.S.R.
  128(E)) [V gazettes].
- **What this asks of Frrata before 1 Jan 2027** (owner to schedule; not built): Settings › Business details gains branch
  addresses, a landline beside the mobile for customer care and the grievance officer, and the grievance officer's designation
  required; the Contact policy shows the website's name and address; the contact form (with M·2) gives a copy of the complaint
  and a ticket number; counsel answers who is "the e-commerce entity" on a hosted shop and who joins the National Consumer Helpline.

## Shopify (competitor reference: Hydrogen, Oxygen, India) — checked 2026-11-12 (integration-researcher)
[V] read on the vendor's page, dated; [V-u] read that day, page undated; [U] no current source.
- Hydrogen 2026-10 (GA 2026-10-14): "a framework-agnostic JavaScript library to add Shopify commerce to your existing
  stack"; React Router 7 (on Oxygen) and Next.js 16 (Vercel Shop, on Vercel) starters; "host it anywhere, including
  Oxygen, which is still free"; 20 skills for coding agents; WebMCP for a browser agent [V, shopify.dev changelog
  2026-10-14; shopify.com/news/fall-26-edition-developer 2026-10-28].
- Oxygen: no extra charge on paid plans, not on the Agentic plan; public environments Plus 25, others 1, dev/trial 0;
  production + preview per branch; GitHub Actions deploy on push; shareable previews Basic+ [V-u, shopify.dev].
- Checkout stays on Shopify (`cart.checkoutUrl`, a checkout subdomain); information/shipping/payment UI extensions
  Plus only [V-u]. Customer Account API: buyers, OAuth 2.0 + PKCE [V-u].
- AI: Canvas (Sidekick edits a Liquid theme's code), early access 2026-10-01 [V]; AI Toolkit / Dev MCP for coding
  agents [V-u]; Storefront MCP catalog/cart replaced by UCP `/api/ucp/mcp` [V-u]. No Shopify agent that builds a
  Hydrogen site for the brand [V-u, as of 2026-11-12].
- India: Basic ₹1,994 / Grow ₹7,447 / Advanced ₹30,164 a month (monthly billing), Plus from ₹175,000; third-party
  gateway fee 2 / 1 / 0.6 / 0.2% on top of the gateway's own; COD exempt [V, shopify.com/in/pricing as of 2026-11-09].
  No Shopify Payments in India [V-u]. "Shopify doesn't create a GST-compliant bill" [U, guide 2025-09-22].
- Agency price signal for a Hydrogen build: $50k–$250k+, 3–6 months; a Liquid theme under $10k [secondary, 2026-10-27].
