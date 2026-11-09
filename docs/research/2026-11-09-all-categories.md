# All categories: should Frrata stop being fashion-only? GTM, product and codebase plan

Status: research + proposal, awaiting the owner · Date: 2026-11-09 · Asked by the owner the same day
Sources: every market fact carries its page's date; "undated" = read live 2026-11-09; "UNVERIFIED" = no source from the
last 12 months. Money rows are hypotheses (frata-unit-economics rule 1): figure · source · test.

## 0. Answer

**Yes: remove the fashion-only limit from the product and the pitch, but open categories in waves, each when its
compliance pack is built.** Not "fashion only", not "anything on day one".

1. **The fashion label doesn't win deals; depth does.** Every competitor is horizontal (Shopify, Dukaan, GoKwik,
   Razorpay, Zoho). The only vertical player, Fynd, went horizontal in 2025 and still ships fashion-specific depth
   (fynd.com, Jan and 8 Jun 2026). Shiprocket won by owning one painful workflow, not a category (growfusely, 6 Jan 2026).
2. **Fashion is the biggest pool and the hardest one.** 38.9% of Shopify India's 130,450 stores are apparel
   (StoreLeads, 6 Nov 2026), but it grows slowest (+17–28%) with the worst RTO (25–45%); beauty (+39–41%) and
   health/wellness (+46–48%) grow about twice as fast with RTO 5–15% (Unicommerce, Apr 2026; ClickPost FY26, undated
   ©2026; base.com, 21 Sep 2026). A COD/RTO toolkit sells to all of them; a size chart sells to fashion only.
3. **Agencies and developers build for many categories.** One platform for all their clients is the only way
   partners (20% share, built) bring us volume; a fashion-only Frrata makes them run two stacks.
4. **But each category brings its own law and its own profit maths** (FSSAI, Legal Metrology, BIS, CDSCO, HUID; food
   that can't be resold after RTO). Opening a category before its pack exists is a legal exposure and makes our
   "true profit" untrue. Hence waves.

## 1. GTM

**Positioning (one line):** *Frrata: the Indian D2C store that does your GST, your COD and your marketing, with an
expert who sets it up, for less than Shopify and its apps.*

| Moat | What it is | Honest test |
|---|---|---|
| 1 · GST and compliance, built in | HSN-wise rates for every slab, tax invoices, credit notes, GSTR-1 ready data, e-invoice and e-way bill, then filing through a GSP (GST module, `2026-11-09-gst-module.md`); plus each category's legal fields on the product page and invoice | A CA files a design partner's GSTR-1 from Frrata with no edits, 2 months running |
| 2 · Price | 30–40% less than Shopify + a one-page checkout + a WhatsApp tool (the stack COD-heavy brands run) | Written quotes from Razorpay (Magic) and GoKwik: do they charge on COD? (the claim rests on it) |
| 3 · Expert-led onboarding | A Frrata expert (or a partner) sets up catalogue, GST, shipping, WhatsApp, theme; first order in 7 days | Onboarding minutes per shop; 90-day retention onboarded vs self-serve |
| 4 · Everything in one place | WhatsApp, SMS, email, Meta ads (delivered-order signals), analytics on ₹ kept, offers, RTO tools; ~90% of add-ons in the tier | Share of merchants who cancel ≥ 2 other tools within 60 days |

**The price claim needs care** (unit-economics review, 2026-11-09, `orderProfit` and `applyBps` on 15 merchant shapes):

- Against Shopify + a checkout charged on all GMV (Magic ~0.7% [S, 2026-11-06]): Frrata today is 16–53% cheaper.
- Against a checkout charged on prepaid only: 0–40%.
- Against Shopify with no checkout app: **dearer in 7 of 15 shapes**. Shopify charges nothing on COD; Frrata's 2/1/0.5%
  is on every delivered order. Worst: ₹8,000 electronics (−17.5%), small COD fashion (−14.9%), home at 300 orders (−11%).
- **Recommended fee shape: cap the per-order fee** (Launch 1.5% ≤ ₹25, Growth 1% ≤ ₹20, Scale 0.5% ≤ ₹15). It costs
  ~4% of revenue (break-even ~471 → ~490 tenants, scaled; the 471 itself doesn't reconcile and must be rebuilt) and
  removes the high-AOV penalty. A flat per-order fee makes beauty and food dearer; a GMV band penalises mid-AOV. Say
  "30–40% less than Shopify + checkout + WhatsApp tool", never "than Shopify".

**Waves (each opens when its pack ships; marketing names only open categories):**

| Wave | Categories | Why now | Pack (must ship first) |
|---|---|---|---|
| W0 (now) | Fashion, footwear, fashion accessories, jewellery (imitation/silver) | What we have | Product HSN in the editor; accessories at their own rate (today they get the garment rate) |
| W1 | Beauty and personal care, wellness/supplements, fragrance | Same Instagram + COD playbook; fastest growth; low RTO | Rate table (5/18%), net quantity + unit, manufacturer/packer, batch + expiry, ingredients, "not returnable once opened", shades as an option |
| W2 | Home and kitchen, décor, kids (non-apparel), stationery, gifting | Large pool (12.8% of Shopify IN), mid AOV | Weight + dimensions (volumetric), fragile flag, warranty text, carton contents |
| W3 | Packaged food and beverages | ⅓ of funded D2C (Inc42, 14 May 2026) | FSSAI licence on page + invoice, best-before, veg/non-veg mark, no returns, RTO written off in profit, quantity limits per line > 10 |
| W4 | Electronics and accessories; fine jewellery | High AOV, high fraud | BIS R-number, serial/IMEI at packing, warranty; HUID per piece, 3% GST + making charges; e-way bill ≥ ₹50,000; insurance line in profit |

Not offered: age-restricted goods (alcohol, tobacco, e-cigarettes), drugs and medical devices, weapons (a list in
Terms; sign-up refuses them).

**Channels:** (1) partners and agencies (built: 20% for 24 months), now able to bring every client; (2) Instagram-native
founders by category, with a design partner per wave as the case study; (3) "Switch from Shopify" with a free expert
migration (products, customers, redirects); (4) CA firms as a channel for the GST module (they manage 50–200 small
GSTINs each).

**Pricing and packaging:** keep three tiers, all channels and ~90% of add-ons included; the fee capped per order; GST
filing in Growth and Scale, GST data and exports in every tier; expert onboarding included in Growth/Scale, a one-time
fee on Launch (agencies charge ₹45k–85k for a Shopify setup: swcybernetics, undated; colorwhistle, undated).

## 2. What changes, by who uses it

**Merchant**
- Sign-up: "What do you sell?" becomes categories (Fashion, Footwear, Accessories, Jewellery, Beauty, Wellness,
  Home, Food, Electronics, Other) with the open waves enabled; it sets the starting HSN, return policy, product
  fields, samples and theme ranking. No default HSN 6211.
- Product editor: HSN (searchable, with the rate it gives), unit (UQC), weight and dimensions, the category's legal
  fields (net quantity, manufacturer/packer, origin, best-before, FSSAI, BIS, warranty, HUID), and size chart / model
  only for apparel. New product: one variant by default, options by category (Size, Shade, Weight, Volume, Pack of).
- Settings › Taxes: per-product HSN made true; the GST module (its own spec).
- Returns policy: wording by category (sealed, hygiene, perishables, warranty).
- Themes: samples per category; `goodFor` by category; neutral copy ("item", not "piece").

**Partner (agency/developer)**
- One workspace for all clients, any category; a category-aware setup checklist they can hand over; their share
  unchanged. A "Category packs" page in partner docs.

**Frrata Admin**
- A shop's category and wave on the merchant page; category gates (a wave enabled per shop for design partners
  first); a category filter in Merchants and Usage; the restricted-goods list and a review queue for sign-ups that
  pick "Other"; onboarding minutes per shop (the cost line).

## 3. What changes in the codebase (from the sweep, ~190 places in 10 areas)

| Area | Count | The change |
|---|---|---|
| Tax | 10 | `rateFor` becomes a dated HSN → rate table (nil/5/18/40 + cess; the ₹2,500 slab only for 61/62/64), CA-signed; checkout refuses a line with no HSN; repricing keeps the order's stored rate; invoice unit from the product (UQC), not "pcs" |
| Data model | 12 | `sells` keys widened (CHECK, `app_create_shop_v2`, zod: one migration and deploy); `default_hsn` no default; `product_types.size_chart` optional; per-product legal fields; weight/dimensions editable; line quantity limit per product |
| Catalogue and editor | 30 | full Shopify taxonomy (server-only, stable ids, under the 2 MB cache entry); synonyms and "popular" by category; required attributes per vertical; no size chart for non-sized goods; neutral examples |
| Storefront and themes | 25 | words "item"; material attribute by category for SEO/JSON-LD; the missing-photo glyph neutral; sample sets per category; `goodFor` by category |
| Returns and fit | 9 | policy wording by category; Size & fit module limited to apparel/footwear; profit: RTO resale rate by category (food 0%) |
| Ship | 3 | weight slabs in suggested costs; volumetric weight; fragile/liquid/battery flags |
| Onboarding and marketing | 9 | sign-up chips, checklist, landing page, partner page, meta description |
| Admin | 0 → new | category, wave gate, restricted goods review |
| Docs and skills | ~35 | CLAUDE.md, roadmap, North star (ranked problems per category), design language, unit economics |
| Tests and seed | ~50 | a second seed shop (beauty: HSN 3304, no options, net quantity); rate-table tests; e2e per wave |

**Riskiest (money, tax, law), in order:** (1) the rate table, (2) the 6211 default and checkout fallback, (3) product HSN
not editable, (4) repricing re-deriving old rates, (5) invoice unit, (6) `sells` CHECK + function + zod in one deploy,
(7) packaged-goods / FSSAI / BIS fields before W1/W3/W4, (8) returns policy text, (9) taxonomy ids stable,
(10) weight-based freight in profit.

**Already category-neutral:** money, availability, options/variants engine (up to 3 free options, none works),
collections rules, checkout, COD/RTO/risk, offers, invoice/credit-note mechanics, shipping settings, analytics, modules,
WhatsApp, themes engine, tenancy, admin.

## 4. North star, rewritten (owner to approve)

*Frrata exists so a small Indian D2C brand keeps more profit per delivered order, stays GST-compliant, and runs its
store, messages and ads in one place without a developer.* Ranked problems: (1) COD/RTO losses, (2) GST and category
compliance, (3) catalogue operations, (4) mobile checkout conversion, (5) a premium storefront, (6) true profit per
order, (7) festive-peak reliability, (8) category-specific returns (size and fit for fashion; damage for home and
electronics; none for food).

## 5. Phases (each its own spec and mockup sign-off)

| Phase | What ships | Size |
|---|---|---|
| C0 | Fix now, fashion included: product HSN + unit in the editor, accessories at their own rate, no 6211 fallback, repricing keeps stored rates | ~3 agent-days |
| C1 | Category foundation: sign-up categories, rate table (CA sign-off), taxonomy, neutral copy, per-category returns text, Admin category + wave gate | ~1.5 agent-weeks |
| C2 | W1 pack (beauty, wellness): legal fields, expiry/batch, samples, theme copy; one design partner | ~1 |
| GST | The GST module (its own spec): GSTR-1 data → filing via GSP | see its spec |
| C3 | W2 pack (home): weight/dimensions, volumetric freight, fragile, warranty | ~1 |
| C4 | W3 pack (food): FSSAI, best-before, no returns, RTO write-off in profit, quantities | ~1 |
| C5 | W4 packs (electronics, fine jewellery): BIS, serials, HUID, e-way bill, insurance | ~1.5 |
| P | Price: the per-order cap (after the Razorpay/GoKwik quotes) | ~2 agent-days + billing review |

## 6. Owner calls
1. Open all categories **in waves**, each behind its compliance pack. *Recommended.*
2. W1 = beauty and wellness first (then home, food, electronics/fine jewellery). *Recommended.*
3. The per-order fee **capped** (1.5% ≤ ₹25 / 1% ≤ ₹20 / 0.5% ≤ ₹15), and the claim worded "than Shopify + checkout +
   WhatsApp tool". *Recommended; after two written quotes.*
4. Expert onboarding included in Growth/Scale, paid once on Launch. *Recommended.*
5. C0 (product HSN, accessories rate) ships now, whatever the rest. *Recommended: it is a tax error today.*
6. North star and CLAUDE.md rewritten as § 4.

## 7. Cheapest checks before building (2 days, no code)
- Written quotes: Razorpay Magic and GoKwik, do they charge on COD orders, at what %.
- 30 Indian Shopify stores (10 per category): which checkout, WhatsApp and GST apps they run.
- 3 founders in beauty/wellness: would they move for GST + COD + onboarding at our price.
- A CA: the HSN → rate table for W0–W1 and the accessories rate.
