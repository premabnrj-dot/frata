# Commerce platforms in India, the "app tax", and what to bundle (research, 2026-11-09)

For the product roadmap (handed to the vision/roadmap session). Current sources only; "accessed 2026-11-09" = a live
page with no date of its own; "third-party" = a vendor/agency blog; "unverified" = no source from the last 12 months.
USD→INR at ~₹88 (assumption).

## 1. What each charges and bundles
- **Shopify** (shopify.com/in/pricing, "as of 5 Nov 2026"): Basic ₹1,994/mo (₹1,499 yearly) + **2% on prepaid** (no
  Shopify Payments in India); Grow ₹7,447 (₹5,599) + 1%; Advanced ₹30,164 (₹22,680) + 0.6%; Plus from ₹1,75,000 + 0.2%;
  +18% GST; POS Pro ₹7,000/location. Manual COD exempt (COD-app orders: unverified). Free built-ins: Inbox, Email (10k/mo
  free, then $1/1,000), Forms, Collabs (2.9% on payouts), Sidekick/Magic. **Not built in for India: COD risk, RTO,
  WhatsApp, GST invoices, Indian shipping.** Shop Pay to India reportedly by Q1 2027 (Inc42 2026; unconfirmed) — the main
  threat to an India-first checkout.
- **Wix**: USD only ($29.77–159.77/mo), nothing India-specific (accessed 2026-11-09).
- **Dukaan** (mydukaan.io/pricing): Free 4.99%/order, Starter ₹1,999/yr 3.99%, Growth ₹5,999 1.99%, Infinity ₹39,999
  0.99%; fee capped ₹200, not on manual orders; loyalty/referral/upsell in Growth. Per gross order, not delivered.
- **Instamojo**: Lite free 5%+₹3; Starter ₹6,999/yr; Growth ₹14,999/yr 2%+₹3; WhatsApp and abandoned cart only in Growth.
- **Zoho**: Commerce ₹840/₹2,100/mo (partner page, unverified); Books ₹749–4,999/mo (Patron, 2026-06-16).
- **Shiprocket** (pricing, accessed): Lite free ~₹45/shipment; Business ₹199 ~₹41; Advanced ₹499 ~₹39; Pro ₹799 ~₹36;
  Engage ₹2.49–7.99/order (conflicting, undated); FY26 RHP (Aug 2026): ~₹2,024 cr revenue, newer products 27%,
  214,769 active merchants, 58% of larger ones use > 3 products, NRR 107.8% — **merchants buy a bundle from one vendor
  and pay per use.**
- **GoKwik**: Shopify app $35/mo + 3.5%; larger by quote ("success-based"); reviews complain of support; ~15k merchants,
  ARR > $30M (Mar 2025, older).
- **Razorpay**: 2% (UPI included) +18% GST (May 2026); Magic Checkout: COD nudges, fees, RTO reimbursement opt-in,
  enterprise pricing (Aug 2026).
- **Marketplaces**: Meesho 0% commission; Myntra waives commission for new D2C; Amazon 0 referral < ₹1,000 (Mar 2026);
  Flipkart 0 commission < ₹1,000 — **a platform can't win on % of GMV; it must win on profit per delivered order.**
- **WooCommerce**: no platform fee; ~₹13,700/mo at ₹5L GMV (mostly 2% gateway); the cost is a developer.
- **WhatsApp** (Meta India, 2026): marketing ~₹0.8631 (+~10% on 1 Jan 2026), utility/auth ~₹0.115; from 1 Oct 2026
  service messages charged beyond 1,000/number/month and in-window utility charged; **INR billing mandatory by
  31 Dec 2026** (else delivery stops 1 Jan 2027). BSPs: Interakt $55–69, WATI $59–279, AiSensy ₹2,250–2,500 + ~26%
  markup on messages, Gallabox ₹2,399–16,999 + messages.
- Others: Judge.me free/$15 (most-installed globally); Nector free ≤ 300 orders, $49–349 (unverified); Klaviyo from $20;
  GST invoice apps ~$4–5/mo; Canva Pro ~₹499/mo (unverified).
- **Complaints (vendor blogs, 2026)**: 5–8 paid apps at ₹5,200–15,800/mo; ₹12–18k once reviews, COD, WhatsApp, SEO,
  upsell stack; many pay for 15, use 7; USD billing + 2–3% forex; data lock-in (reviews, points); app weight slows pages.

## 2. A modelled stack (not survey data; AOV ₹1,200, ~half prepaid)
- **₹5L GMV (~420 orders)**: software and platform fees **~₹20–33k/mo (4–6.5% of GMV)** — the largest single line is
  Shopify's 2% on prepaid (₹5k) — plus ~₹19k freight.
- **₹50L GMV (~4,200 orders)**: **~₹1.7–2.1L/mo (3.5–4%)** before ads and freight — largest: WhatsApp messages (~₹45k),
  checkout % (~₹32.5k), Shopify (~₹30.6k).
- Both charge on gross orders, including the 25–40% fashion RTO (vendor benchmarks); festive COD returns 58% vs < 15%
  prepaid (Unicommerce, Apr 2026); Tier 2–3 drove 66% of new D2C order volume in FY26.

## 3. Themes
Shopify fashion themes $170–500 one-time (Prestige $400, Impulse $500, Motion $420). Premium = lookbooks with hotspots,
size charts, video, swatch filters, quick view/buy, mega menu, countdown, pre-order, pickup. Indian failures: speed on
mid-range Android 4G (one case: PageSpeed 32→78 doubled conversion 0.7%→1.4%; removing apps is the biggest fix), COD as
a trust signal, conversion 1.2–1.5%. Hindi lift: unverified.

## 4. All-in-one: won and failed
Zoho One won on one simple price for everything (horizontal, no COD depth). Shopify's bundling commoditised generic
apps but leaves India's gap (COD/RTO, WhatsApp, GST, shipping). Shiprocket won by landing on one must-have workflow,
then cross-selling, priced by use. Dukaan stalled (2023 cuts, support replaced by a bot; FY23 ₹10 cr revenue, ₹34.3 cr
loss). Bikayi failed (2022, older: price hikes, aggressive sales, weak support, counterfeit sellers) → pivoted.

## 5. Leverage over Shopify + apps
Price per **delivered** order (nobody charges only on delivery); COD/RTO built in; WhatsApp at Meta's own rates (the
Oct 2026 billing change makes the BSP layer worth rebuilding); GST-native (must-have more than differentiator); partner
channel (Shopify pays transfer partners 20% of base from 10 Aug 2026); no platform fee on prepaid.

## Ranked: 15 capabilities to bundle (what each replaces, ₹/mo at ₹5L / ₹50L GMV)
1. COD risk at checkout (score, partial prepay, COD fee, block) — ~3k / ~32k
2. No platform fee; priced per delivered order — 5k / 25k
3. WhatsApp confirmation, address check, COD→prepaid, NDR — 1–3k / 10–29k
4. WhatsApp marketing and abandoned cart at Meta's rates — 2.3–4.8k + markup / 6–17k + ~9k
5. Profit per delivered order — spreadsheets
6. Shipping rate comparison, NDR, COD remittance matching — 0–799 (freight passed through)
7. Exchanges-first returns — ~0–2k / 5–15k (unverified)
8. A fast fashion theme (size guide, hotspot lookbooks, video, swatches, quick view; LCP < 3 s) — 2.2–3.7k + apps
9. GST invoices, e-invoice, GSTR reports, Tally/Zoho Books export — ~400 + hours
10. Instagram DM + WhatsApp shared inbox → assisted orders — 1–7k
11. Meta CAPI and attribution on delivered orders — 0–5.6k
12. Reviews with photos/video (import to end lock-in) — 0–1.3k
13. Email campaigns and flows — 0 / ~17k
14. Loyalty and referral — 0–4.3k / ~15.7k
15. POS for pop-ups and exhibitions on the same stock — 7k per location
Left off for lack of evidence: Hindi storefronts, a built-in design tool, full accounting (integrate instead).

**Gaps to recheck**: Shiprocket Checkout, Magic and GoKwik enterprise prices; Klaviyo/Mailmodo at scale; Nector
current tiers; Meta's INR rate card file; Dukaan/Bikayi FY24–25; an India-only Shopify app ranking.
