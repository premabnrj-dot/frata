# Frrata product roadmap: themes, features, apps — everything a D2C brand runs, in one place
Status: proposal, awaiting the owner · Date: 2026-11-09 · Page: https://claude.ai/artifact/P5zdSXPUSPRBJUSN32v3ay (`docs/mockups/2026-11-09-product-roadmap.html`)
Built on: `docs/research/2026-11-09-all-categories.md` (waves, price, GTM), `docs/specs/2026-11-09-gst-module.md` (GST),
and three research reports from the search/sharing session, committed on `claude/sleepy-albattani-cdnun4` (53f1a23):
`2026-11-09-platforms-and-app-tax.md`, `2026-11-09-back-office.md`, `2026-11-09-marketing-creative-team.md`.
Facts carry their sources there; this plan cites them by report. Where the reports and the GST spec differ, the spec wins.

## 1. The idea in one line
**Frrata is the operating system for an Indian D2C brand: sell, deliver, talk, grow, comply and run the back office in
one place, priced per delivered order, set up by an expert.**

## 2. Leverage: what only Frrata can do
Shopify bundles the generic apps and leaves India's gaps open: COD risk and RTO, WhatsApp, GST invoices, Indian
shipping (platforms report, § 1). An Indian brand pays **₹20–33k a month at ₹5 L GMV, ₹1.7–2.1 L at ₹50 L**, mostly
as % fees on orders that never get delivered (platforms report, § 2, modelled). Frrata's leverage is one data join
nobody else holds:

> **order × delivery outcome × cost × GST × the message that closed it**

From that join come the five things a stack of apps can't do:
1. **Profit per delivered order**, true, live, by product, pincode, channel and campaign.
2. **COD/RTO built in**: score, confirm on WhatsApp, nudge to prepaid, NDR, all on the same order.
3. **Delivered-order signals to Meta and Google** (CAPI): COD and WhatsApp closes are invisible to the pixel.
4. **GST from the source**: GSTR-3B's tax is now locked to GSTR-1 (back-office report, § 1), so the invoice must be
   right at checkout. Only the platform that writes the invoice can guarantee it.
5. **Priced on delivery**: nobody else charges only on delivered orders (platforms report, § 5); fee capped per order
   (all-categories § 1).

Plus the channel and the service: partners (20% for 24 months; Shopify now pays transfer partners 20% too, from
10 Aug 2026) and expert onboarding (agencies charge ₹45k–85k for a Shopify setup).

## 3. Hard dates (the roadmap is ordered around them)
| Date | What | Effect |
|---|---|---|
| 31 Dec 2026 | WhatsApp billing must be in INR, or delivery stops 1 Jan 2027 | Messages module: merchant's WABA billed in INR before then |
| 1 Jan 2027 | E-way bill numbers 14 digits; e-invoice scope widens (RCM, import of services) | Store as text; GST G3 |
| Q1 2027 (reported) | Shop Pay to India | The main threat to an India-first checkout: COD/RTO depth must be shipped first |
| Apr 2027 | IMS into the rules; GST rate changes once a year from 1 April | Rate table versioned by date; buyer-side IMS stays with the CA |
| 13 Apr 2027 / 13 Oct 2027 | Marketing messages leave the WhatsApp Cloud API (new accounts / everyone) → Marketing Messages API | Broadcasts and cart flows built on the new API from day one |
| 13 May 2027 | DPDP Phase III: notice per purpose, consent logs ≥ 1 year, erasure, breach notice in 72 h, rights within 90 days | Consent and data-rights module by Q1 2027; Frrata is the processor (a contract per merchant) |

## 4. The pillars (what a brand gets) — build, integrate or skip
Tier: **C** core (every tier) · **G** Growth and Scale · **U** usage passed through at cost (Meta messages, freight,
GSP calls, AI image credits). Horizon: **Now** Nov–Dec 2026 · **Next** Q1 2027 · **Later** Q2–Q3 2027 · **Watch**.

### Sell (storefront, themes, checkout)
| Item | Build/Integrate | Tier | When | Status |
|---|---|---|---|---|
| Themes 2.1 + Look v4 (site settings, icons, menus, page-aware editing) | Build | C | — | built |
| Theme packs per category wave (samples, sections, copy) | Build | C | Next (W1), Later | — |
| Lookbook hotspots, video, quick view, swatch filters, mega menu | Build | C | Next | — |
| Speed budget: LCP < 3 s on mid-range Android 4G, no app weight | Build (gate) | C | Now | partly (bundle gates) |
| COD risk at checkout: score, partial prepay, COD fee, block | Build | C | Now | partly (risk, COD limits) |
| B2B GST invoice at checkout (buyer GSTIN) | Build | C | Now (G0) | — |
| Offers, creator codes | Build | C | — | built |
| Marketplace export (Myntra, Ajio, Nykaa; Amazon, Flipkart by wave) | Build | G | Later | planned |
| Google free listings / Shopping feed | Build | C | Next | parked (SEO S·4) |
| Hindi storefront | — | — | Watch | no evidence of lift yet |

### Deliver (ship, confirm, return)
| Item | B/I | Tier | When | Status |
|---|---|---|---|---|
| Outcomes by hand (delivered, RTO, lost) | Build | C | — | built (S·0) |
| Shiprocket: labels, tracking, NDR, rate comparison | Integrate | C + U freight | Next | parked by owner |
| RTO Shield: WhatsApp COD confirmation, address check, COD→prepaid, NDR on WhatsApp | Build | G | Now | planned (M2·3) |
| COD remittance matching (AWB ↔ order ↔ UTR ↔ bank) | Build | C | Next | — |
| Exchange-first returns with reverse pickup, partial credit notes | Build | G | Next | — |

### Talk (messages and service)
| Item | B/I | Tier | When | Status |
|---|---|---|---|---|
| WhatsApp order updates, one inbox | Build | C + U | — | connect + health built (C1); order messages, inbox planned (C2, C3) |
| Instagram DM in the same inbox; assisted orders from a chat | Build | C | Next | — |
| Abandoned bag and broadcasts to delivered buyers, on the Marketing Messages API, with DPDP consent | Build | G + U | Next (before Apr 2027) | planned (Cart flows) |
| AI reply suggestions (a human sends) | Integrate (LLM) | G | Later | — |
| Email: transactional (SES) now; campaigns once checkout collects email | Integrate | C / G | Now / Later | — |
| SMS (DLT) as a fallback only; RCS | Integrate / skip | U | Later / Watch | — |

### Grow (ads, creative, loyalty, analytics)
| Item | B/I | Tier | When | Status |
|---|---|---|---|---|
| Analytics on ₹ kept after returns, by channel | Build | C | — | built (A·1) |
| Delivered and RTO events to Meta CAPI and Google; ad spend read back into profit | Build | G | Next | planned (A, phase 3) |
| True Profit: by product, pincode, campaign | Build | G | Next | planned |
| Creative studio: AI product photos (background, model, lifestyle) behind one adapter; credits; auto AI label + C2PA kept | Integrate | G + U credits | Later | — |
| Ad creation through Meta Advantage+ and Google Asset Studio from the catalogue (no own ads manager) | Integrate | G | Later | — |
| Reviews with photos, import from Judge.me (end lock-in) | Build | G | Next | planned |
| Loyalty, referral, store credit | Build | G | Later | — |
| Size and fit (fashion) | Build | G | Later | planned |
| Influencer marketplace; own image/video models | Skip | — | — | — |

### Comply (GST and law)
| Item | B/I | Tier | When | Status |
|---|---|---|---|---|
| Product HSN + unit, rate table, no garment default (C0/G0) | Build | C | **Now (tax error today)** | — |
| GST month: Review, Fix, CA exports (GSTR-1 JSON, Excel, sales register, 3B working) (G1) | Build | C | Now | — |
| Push and file GSTR-1 through a GSP, OTP-approved (G2) | Integrate | G + U | Next | — |
| E-invoice (≥ ₹5 cr B2B), e-way bill (≥ ₹50,000), GSTR-1A (G3) | Integrate | G | Later | — |
| Post-sale discounts only by credit note (s.15(3)(b), from 1 Nov 2026) | Build | C | Now | — |
| ARQP option (annual return, quarterly payment, ≤ ₹5 cr B2C) | Build | C | Later | — |
| Category compliance packs (FSSAI, Legal Metrology, BIS, HUID, CDSCO) per wave | Build | C | Next–Later | — |
| DPDP: notice per purpose, consent log, rights requests, erasure, breach runbook, processor contract | Build | C | **Next (by 13 May 2027)** | — |
| Keep money merchant-owned (Razorpay sub-merchant), so Frrata is not an ECO collecting TCS | Rule | — | always | holds today; lawyer confirms |

### Run (back office)
| Item | B/I | Tier | When | Status |
|---|---|---|---|---|
| Settlement ledger: Razorpay settlements (fees + GST as input credit), COD remittances, "money still to arrive" | Build | C | Next | — |
| Expenses: pull Meta, Google, Shiprocket, Razorpay; CSV for the rest; allocate to orders; landed cost into COGS | Build | G | Next | — |
| Tally XML vouchers, then Zoho Books API | Integrate | G | Later | — |
| Procurement: POs, goods received, bill of materials (fabric per size), job work challans + ITC-04 data | Build | Scale | Later | — |
| Locations and stock transfers (invoice + e-way bill between GSTINs, challan within one) | Build | Scale | Later | — |
| POS for pop-ups and stores (PWA on the same stock and invoices; card/UPI devices integrated) | Build + Integrate | Scale + per location | Later (last) | — |
| Corporate cards, full accounting, payroll | Skip | — | — | integrate exports instead |

### Team
| Item | B/I | Tier | When | Status |
|---|---|---|---|---|
| Roles: owner, admin, staff, partner | Build | C | — | built |
| Accountant (GST and money, no look or people), Agency (ads and creative, no customer data), Designer, Catalogue, Packer | Build | C | Next | — |
| Approvals: catalogue draft → approved → live; creative draft → approved → ad | Build | G | Later | — |
| Tasks and notes on an order, product or customer (team space in context) | Build | C | Later | partly (order notes) |
| Team chat, drive, docs suite | Skip | — | — | WhatsApp groups and Google already win |

## 5. The order (each row a phase with its own spec and mockup sign-off)
| When | Phase | Moves (ranked problem) | Why now |
|---|---|---|---|
| Now | **C0 / G0** product HSN, rate table, B2B GSTIN, partial credit notes, post-sale discount rule | 2 GST | Tax error today; 3B locked to GSTR-1 |
| Now | **RTO Shield** (COD confirmation, COD→prepaid, NDR on WhatsApp) | 1 COD/RTO | The core promise; before Shop Pay arrives |
| Now | Messages: INR billing for every merchant's WABA | 1, 4 | Delivery stops 1 Jan 2027 otherwise |
| Now–Next | **G1** GST month + CA exports; Accountant role | 2 | The moat a CA can test |
| Next | **C1–C2** categories foundation, W1 beauty and wellness pack | growth | All-categories decision |
| Next | Settlement ledger + COD remittance matching | 6 profit | Money in, matched |
| Next | **DPDP** consent, notice, rights | law | 13 May 2027 |
| Next | Cart flows + broadcasts on the Marketing Messages API; Instagram in the inbox | 4, 1 | Built once, on the API that stays |
| Next | CAPI delivered/RTO + ad spend into profit; True Profit | 6, 1 | The ads edge |
| Next | **G2** push and file through a GSP | 2 | After G1 is trusted |
| Next | Exchange-first returns; Reviews | 2 returns, 5 | Fashion's own pain |
| Later | Expenses + landed cost; Tally/Zoho Books | 6 | Profit gets complete |
| Later | Creative studio (AI photos, ad creatives via Meta/Google) | 5 | Credits, labels |
| Later | W2–W4 packs; G3 e-invoice and e-way bill | growth, 2 | Bigger merchants |
| Later | Procurement, locations, POS | 3, 7 | Scale tier, last |

## 6. Packaging (~90% included)
| | Launch | Growth | Scale |
|---|---|---|---|
| Store, themes, checkout, offers, COD risk, Messages, GST invoices and CA exports, analytics, partners | ✓ | ✓ | ✓ |
| RTO Shield, cart flows and broadcasts, CAPI signals, True Profit, reviews, returns, GST push and file, expenses, Tally/Zoho, creative studio, approvals | — | ✓ | ✓ |
| Procurement, locations, POS (per location), multi-GSTIN | — | — | ✓ |
| Expert onboarding | one-time fee | included | included |
| Usage at cost | Meta messages, freight, GSP calls, AI image credits | | |

Never a wallet reselling WhatsApp credit (RBI); Meta bills the merchant directly (Tech Provider).

## 7. How we'll know (one measure per pillar)
Sell: conversion on mid-range Android · Deliver: RTO on confirmed vs unconfirmed COD · Talk: share of orders touched
by a message · Grow: delivered orders per ₹ of ad spend · Comply: GSTR-1 filed with no edits by the CA · Run: share of
money in matched without a spreadsheet · Team: shops with ≥ 3 people working in Frrata · Business: apps cancelled
within 60 days of moving.

## 8. Owner calls
1. The positioning: "the operating system for an Indian D2C brand", priced per delivered order. *Recommended.*
2. The order in § 5: compliance and RTO first, then the dated work (DPDP, Marketing Messages API), then growth tools,
   back office and POS last. *Recommended.*
3. Build vs integrate as in § 4; skip team chat/drive, own AI models, influencer marketplace, corporate cards, full
   accounting. *Recommended.*
4. AI creative as metered credits (Frrata pays ~₹2–10 an image, labelled under the IT Rules 2026 and ASCI). *Recommended.*
5. POS last, Scale only, per location. *Recommended.*
6. Packaging in § 6. *Recommended, with the fee cap from the all-categories brief.*

## Links
- All-categories brief: https://claude.ai/artifact/K8ac7qDBZ3i8onD8vpEsoa
- GST module mockup: https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs
- Current roadmap (phases built so far): `docs/plans/roadmap.md`
