# Messaging, creative, ads, team spaces and support for Indian D2C fashion (research, 2026-11-09)

For the product roadmap (handed to the vision/roadmap session). [V] primary read today (own date where shown),
[V-undated] primary without a date, [S] secondary (dated), [U] unverified. ₹88/$ assumed.

## 1. WhatsApp
- **Pricing** (Meta pricing page, "effective as of October 1, 2026"): per delivered message; marketing/utility/auth
  templates any time; service only in the 24 h window; Meta Business Agent $2 per 1M tokens. From 1 Oct 2026: in-window
  utility charged; service charged after 1,000 free/number/month. Click-to-WhatsApp ad entry: 7-day window, everything
  free but Business Agent tokens. India (pre-GST): marketing **₹0.8631** (was ₹0.7846 before 1 Jan 2026), utility/auth/
  service **₹0.115**, auth-international ₹2.4971 [S, whautomate, "verified against Meta's card Sep 2026"]. **INR billing
  mandatory by 31 Dec 2026.** BSP markup: AiSensy ~26%, Gallabox ~15%.
- **Limits**: per-user marketing limit adaptive (error 131049, wait 24 h) [V 2026-06-17]. **Marketing leaves the Cloud
  API**: accounts from 13 Apr 2027 can't send marketing on it; all lose it 13 Oct 2027 → Marketing Messages API [S,
  ppc.land 2026-10-21]. Build broadcasts and cart sends on the Marketing Messages API from the start.
- **CTWA**: ~₹20–120 per conversation, ₹80–250 per lead fashion/beauty [S, vendor]; GoKwik: 83% of WhatsApp-driven
  festive orders (Oct–Dec 2025) from first-time buyers; automation users 2.25× median GMV growth [S, 2026-10-14].
- **Flows** (price unstated), **catalog/carts** (multi-product up to 30; order webhook), **payments in India** (Razorpay,
  PayU, BillDesk, Zaakpay; `order_details`) [V-undated]. Business AI in the WhatsApp Business app, India, 14 May 2026
  (all Indian languages; UPI "soon"); Business Agent for API users in India 7 Jul 2026 [S].
- **BSPs**: AiSensy (chatbot ₹2,500, AI ₹1,350/mo), Interakt ($55/$69; WA + IG inbox), Wati ($59–279), Gallabox
  (₹2,999–16,999), LimeChat (quote; COD verification, COD→prepaid, AI agent).
- **Results (vendor-reported)**: cart recovery ~5% conservative (Daivik, 225 orders/~4,500 messages) vs claims 12–30%;
  COD confirmation RTO 30–35% → 18–22%; 8–12% of COD switch to prepaid for a discount. No independent study.

## 2. Email, SMS, RCS
Email: median Indian D2C ~6% of revenue, top 28–34%; opens 18–25% [S]; Frrata checkout collects no email today. Gmail/
Yahoo/Microsoft bulk rules (SPF, DKIM, DMARC, one-click unsubscribe, spam < 0.1–0.3%). Klaviyo $20–25 (USD), Omnisend
$16/$59, Mailmodo $149/$199, Brevo ~$9, Amazon SES $0.10/1,000. SMS: DLT ~₹5,900, 2–7 days; ₹0.16–0.25; a fallback only.
RCS: Jio marketing ₹0.27–0.30 from 1 Sep 2026 (reaches iPhones), Airtel ~₹0.11; ¾ of traffic is BFSI — not yet fashion.

## 3. Graphics and ad creative
- Meta Advantage+ Creative: image expansion and backgrounds, text rewrite (Jul 2026), Brand Memory (Jun), Image-to-Video
  (6 Oct), Image Animation (2 Nov 2026); agentic Ads Manager (7 Oct); Muse for Small Business (29 Sep) [S]. Virtual
  try-on in test (2025) [U]. AI labels: "AI info" on Meta's own edits and C2PA-detected content [V 2025-02, recheck].
- Google Asset Studio: product imagery from 1–2 photos, editor, video [V-undated; India not stated]; consumer try-on in
  Search in India 3 Dec 2025 [S].
- Tools: Photoroom app ₹167–299/mo; API background removal **$0.02**, AI backgrounds **$0.10**; Fashn.ai API $0.075/
  credit; Botika ~$1.10/image; Pebblely $9–39. Raw: Nano Banana 2.1 1K **$0.0336** (batch −50%), Gemini 3 Pro Image
  $0.134, Vertex try-on ~$0.06.
- **Law**: IT Amendment Rules 2026 (in force 20 Feb 2026): synthetic content labelled + metadata; good-faith edits
  excluded [S]. ASCI draft (12 May 2026): label AI likeness, virtual influencers, synthetic demos ("created/enhanced
  using AI"); routine edits no label; final reportedly ~29 Sep 2026 [S, unconfirmed]. Try-on that misrepresents fit
  drives returns (ranked problem 2).

## 4. Ads
Meta automates most targeting (Advantage+, AI placement, Creative Diversity score, new-customer toggle, product
browsing on by default, Oct 2026) — a small brand wins on **creative volume** and **conversion-signal quality**.
CAPI: delivered and RTO events from the server are the edge (COD and WhatsApp closes are invisible to the pixel).
Creators: Instagram creator marketplace (India), Partnership Ads (Snitch +53% ROAS, older); Reels affiliate 3–15%;
Qoruz (~₹15k/mo), Winkl, Plixxo (no prices).

## 5. Team spaces
Thin evidence: small fashion brands run on WhatsApp groups, Sheets and registers [S]. Workspace ~₹161–270/user, Slack
~₹245, Notion $8–12, Zoho One ₹1,250/employee. Roles to model: owner, designer, catalogue, ops/packer, CA (read-only
finance), agency (ads/creative, no customer PII). Approvals that matter: catalogue draft → approved → live; creative
draft → approved → ad.

## 6. Customer service
Unified WA + IG inbox exists in BSPs; Instagram API: 24 h window, Human Agent tag 7 days, one private reply per comment
within 7 days, 750/h. AI: Meta Business AI (app), Business Agent ($2/1M tokens); BSP AI agents ₹1,350–6,000/mo.
Returns: Return Prime $0.49/request; 21% of returns become exchanges (ClickPost); reverse pickup ~₹35–90/500 g; offer
"exchange for another size" first, book pickup and replacement together.

## Recommendation: build / integrate / skip
**Build** (needs data only Frrata holds): (1) WhatsApp order updates + COD confirmation + COD→prepaid (~₹0.55–0.70
per order on the merchant; Meta bills the merchant); (2) exchange-first returns with reverse pickup; (3) delivered/RTO
signals to Meta CAPI and Google, ad spend read back into profit (no ads manager); (4) one WA + IG inbox with the order
beside it and assisted orders (AI suggests, humans send); (5) abandoned cart + broadcasts to delivered buyers on the
Marketing Messages API, consent under DPDP (~₹1.02/message incl. GST; expect ~5% recovery); (6) roles and approvals
(catalogue, creative; read-only CA; agency without PII).
**Integrate**: (7) AI catalogue images behind one adapter (Gemini/Photoroom/Fashn/Vertex), ~₹2–10/image borne by Frrata,
metered as credits, auto ASCI label + C2PA kept; (8) ad creation via Meta Advantage+ and Google Asset Studio + catalog
feed + creative results, creator codes through Frrata coupons; (9) email: SES transactional, Klaviyo export; no builder
until checkout collects email; (10) coexist with the merchant's own BSP / Business AI.
**Skip now**: team chat/drive/suite, RCS, SMS marketing, an influencer marketplace, own image/video models, an AI agent
that sends without a human.
**Constraints**: Marketing Messages API before 13 Oct 2027; INR billing by 31 Dec 2026; never resell WhatsApp credit
from a wallet (RBI); AI labels (IT Rules, ASCI); measure with holdouts, not vendor attribution.
**Weakest points**: all result figures vendor-reported; Meta 2026 creative dates from one change log; several prices
unconfirmed; Meta's INR rate card not read directly.
