# GST in the core, the GST app, and Frrata beyond fashion — one plan
Status: **phases 1–5 built** (owner approved 2026-11-09, autonomous run; phase 5 ships switched off) · Date: 2026-11-09 · Mockup (phases 1–2): https://claude.ai/artifact/M4VfNAgqFHYmhCxFwZmepE
Revises: `docs/research/2026-11-09-all-categories.md` § 5 (phases C0–C5) and `docs/specs/2026-11-09-gst-module.md`
§ Phases (G0–G4). Owner, 2026-11-09: "GST filing would be an app, but there is work in the general modules where GST
compliance needs to be added."

## 1. The split
| | **GST in the core** | **The GST app** (Apps › GST) |
|---|---|---|
| What | Every module that creates a taxable fact writes it right, at the source | Reads those facts: the month, Review, Fix, CA exports, push and file |
| Who has it | Every shop, every plan, on by default; not a module you can turn off | A module: exports in every tier, push and file in Growth and Scale |
| Why | GSTR-3B's tax is now locked to GSTR-1, so a wrong invoice is wrong tax; the app can't fix it later | Filing needs a GSP, an OTP and a CA's eye |
| Rule | The app never edits an issued invoice; a correction is a credit note (or GSTR-1A for a filed month) | |

**Beyond fashion lands in the same core modules** (catalogue, sign-up, checkout, returns text), so it ships with the
core work, not after it.

## 2. GST in the core: module by module
Today = what the code does (2026-11-09). Change = what this plan does.

| Module | Today | Change | Phase |
|---|---|---|---|
| **Catalogue · product** | `products.hsn` exists but no form writes it; every line falls back to the shop's 6211 | HSN on every product (search by words or code, the rate it gives shown at this price), unit (UQC: pieces, pairs, sets, kg, litres, packs), country of origin; bulk "Set HSN" on the product list; a registered shop can't publish a product without HSN | 1 |
| **Tax engine** (`domains/tax`) | 5%/18% slab for chapters 61, 62, 64; everything else 18% | A rate table **by HSN and effective date** (rates change once a year from 1 April): nil/exempt, 3%, 5%, 18%, 40%; the ₹2,500 per-piece slab for 61, 62, 63 and 64 after invoice discounts; unknown HSN refused (never a guessed 18%); the rate is the one in force on the invoice date; CA signs the table | 1 |
| **Settings › Taxes** | GSTIN, prices include GST, default HSN 6211 | Registration (Regular / Composition / Not registered); turnover band (sets HSN digits: 4 under ₹5 cr on B2B, 6 above); no default HSN; the wrong "each product can have its own" line made true | 1 |
| **Sign-up** | "What do you sell?" = six fashion keys, a DB check, default HSN 6211 | Categories (Fashion, Footwear, Accessories, Jewellery; more as waves open); sets starting HSNs per product type, return wording, product fields; the DB check, sign-up function and validation change in one migration | 1 |
| **Checkout** | B2C only; any state | "Claim GST input credit": the buyer's GSTIN (checksum now, legal name from a lookup when the GSP lands) and business name → a B2B invoice. A shop **without a GSTIN or on composition ships only within its own state** (s.24: inter-state supply of goods needs a GSTIN) | 1 |
| **Orders · invoice** (at packing) | Tax invoice / bill of supply, seller frozen, place of supply, unit always "pcs" | Buyer GSTIN and name on B2B invoices; the unit from the product; HSN at the band's digits; "composition taxable person" line; invoice value ≥ ₹50,000 flagged for an e-way bill (generated in the app, G3) | 1 |
| **Orders · credit notes** | One full credit note per order (cancelled after packing, came back) | **Several per order**: a returned line or part quantity; a **post-sale discount only by credit note** (s.15(3)(b), from 1 Nov 2026); linked to the invoice; refused after 30 Nov of the next FY (the time limit) | 2 |
| **Offers** | Discount decided per piece before tax (the slab follows it) | Unchanged at checkout; an offer given after packing becomes a credit note, never an edit | 2 |
| **Delivery and COD fee** | Shared over lines by taxable value at each line's rate | Unchanged; a CA confirms the composite-supply reading | 1 (CA) |
| **Returns policy text** | "unused, unwashed, with tags" for every shop | Wording by category (sealed, hygiene, perishables not returnable) | 1 |
| **Frrata's own billing** | GST invoices and credit notes to the merchant | Listed in the app as the merchant's input credit (ITC) | 3 |
| **People** | owner, admin, staff, partner | **Accountant** role (GST and documents only) | 3 |

## 3. The GST app (Apps › GST, a module in the registry)
Unchanged from the spec, renumbered after the core: **G1** the month, Review, Fix, CA exports (GSTR-1 JSON, Excel,
sales register, 3B working, Frrata's invoices as ITC) · **G2** connect the GST portal through a GSP, push GSTR-1, file
with the OTP · **G3** e-invoice (≥ ₹5 cr, B2B), e-way bill (≥ ₹50,000), GSTR-1A, ARQP · **G4** CA firms across shops.

## 4. The phases (revised order)
| # | Phase | Core or app | Ships | Size | Gate before building |
|---|---|---|---|---|---|
| **1** | **Tax-correct catalogue and checkout** | Core + categories | Product HSN, unit and origin; dated rate table; registration and turnover band; no default HSN; sign-up categories (W0: fashion, footwear, accessories, jewellery); B2B at checkout; state lock for unregistered/composition shops; invoice with buyer GSTIN and unit; returns text by category | ~1.5 agent-weeks | Mockup sign-off; a CA signs the W0 rate table and the accessories rates; review agents on the plan |
| **2** | **Credit notes done right** | Core | Several credit notes per order (part returns, post-sale discounts), the 30 Nov limit | ~4 agent-days | Mockup sign-off; a CA rules on RTO (cancel vs credit note) |
| **3** | **GST app: the month** (G1) + Accountant role | App | The month, Review, Fix, CA exports | ~1.5 | Mockup (drawn: GST board 1, 2, 7) |
| **4** | **Beyond fashion: beauty and wellness** (W1) | Core | Categories foundation (taxonomy, neutral copy, Admin category and wave switch), W1 legal fields (net quantity, manufacturer/packer, batch, best-before), sample sets | ~2 | Mockup; a design partner |
| **5** | **GST app: push and file** (G2) | App | GSP connection, push, file with OTP | ~1.5 + contract | Two GSP quotes; a lawyer on ECO status |
| 6 | W2–W4 packs; G3; G4 | Core / App | As in the brief | — | Each its own mockup |

**What already holds and stays:** invoice numbering (≤ 16 characters, per FY), the seller frozen at packing, place
of supply, the post-discount slab per piece, the charges shared over lines, the bill of supply without a GSTIN,
Frrata's own GST invoices.

## 5. Phase 1 in tasks (for the plan once the mockup is approved)
1. Regression net first: e2e flows touching products, checkout, invoices (05-shop-look, 10-checkout, 60-documents,
   47-offers) green; unit tests for `rateFor`, amounts, documents; a second seed product outside apparel (HSN 7117).
2. `domains/tax/rates.ts`: the dated table (W0 HSNs: 61, 62, 63, 64, 42, 71, 7117, 9603… as the CA signs), `rateOn(hsn,
   value, date)`; `rateFor` becomes a wrapper; tests per slab and date.
3. Migration: `products.uqc`; `shop_settings.registration`, `turnover_band`; `default_hsn` default dropped (existing
   shops keep theirs as a starting value, not a fallback); `orders.buyer_gstin`, `buyer_name`; `sells` keys widened
   (CHECK + `app_create_shop_v2` + zod together). Grant, RLS unchanged (same tables).
4. Product editor: Tax panel (HSN search, rate shown, unit, origin); product list bulk Set HSN; readiness "needs HSN".
5. Checkout: B2B switch and GSTIN; the quote refuses a line with no HSN (registered shop); state lock.
6. Invoice and PDF: buyer, unit, digits, composition line, ≥ ₹50,000 flag.
7. Settings › Taxes: registration, turnover band, copy fixed. Sign-up: categories.
8. Returns text by category (policies/render.ts).
9. impact-reviewer, security-reviewer, tenancy-auditor (new columns), unit-economics none (no price change).
10. Skills: frata-architecture (rate table rule, core vs app), frata-integrations (rates with sources), changelog.

## 5b. Cross-check against the GST apps on Shopify (research 2026-11-09; listings, docs, Community threads)
**What they are:** a dozen apps at $0–20 a month (WebPlanex GST Invoice India, GST Pro, AppSaaz, GST Hero, Swipe,
Zoho Books, Tally connectors…). They print invoices, credit notes on refund, GSTR-1/3B reports; AppSaaz (launched
10 Aug 2026) already pushes and files GSTR-1 with the OTP from inside Shopify. **So reports and filing alone are not
a moat**; the bar is low and cheap.

**Why Frrata still wins:** Shopify does not compute GST to Indian rules: one tax line, no CGST/SGST split, the place
of supply from the fulfilment location (same-state orders get IGST), no price slab (Shopify Help, 22 Sep 2025;
Community, Sep 2025–Apr 2026). Apps either reprint Shopify's lines or compute their own, so **charged ≠ invoiced**
(Swipe review Jun 2026; Razorpay thread Nov 2025). The GSTIN field at checkout is Plus-only, so apps bolt it on the
cart. Frrata owns the checkout: **one engine computes the tax the shopper pays, the invoice, the credit note and
GSTR-1.** That, not the reports, is the pitch.

**Taken from them:** a live GSTIN check as the buyer types (format, state code, check digit) and a correction window
until packing; the legal name filled from the portal; every credit note linked to its invoice, gap-free FY numbering;
the portal's totals shown before the OTP; accountant access without the store login and reports emailed to the CA each
month; a pre-flight list (HSN gaps, duplicates) before export; Tally XML; invoices on WhatsApp; a due-date calendar.

**Where the plan was weak, and the fix (now in the phases):**
| # | Gap | Fix | Phase |
|---|---|---|---|
| 1 | Prices including GST between ₹2,625 and ₹2,950 have no self-consistent slab (at 5% the value is over ₹2,500, at 18% under) — Indian fashion prices sit there | A CA-signed rule for the band (today: tested at 5% → 18%); the product's Tax panel and the GST Fix list warn and suggest a price outside the band; order coupons shared to lines before the slab (already) | 1 |
| 2 | A discount after the sale reduces GST only if agreed before the sale (s.15(3)(b), s.34); otherwise it is a commercial credit note with no tax effect | Two kinds: "agreed before the sale" (GST credit note, the invoice's rate and HSN) and "goodwill" (no GST change, not in GSTR-1); time-barred at 30 Nov after the FY | 2 |
| 3 | COD-heavy shops: every RTO after packing needs a credit note; B2C notes net in Table 7 (9B only inter-state > ₹1 lakh); Table 13 must list cancelled numbers | RTO credit notes issued automatically on "came back" (a CA rules first); the app nets them per GSTR-1's tables and lists cancelled numbers | 2, 3 |
| 4 | Quarterly filers (QRMP with IFF), GSTR-3B and GSTR-1A missing from the "month" | The app's period follows Filing: Monthly, or Quarterly with IFF for B2B in months 1–2; 3B outward summary shown and exported; GSTR-1A in G3 | 3 |
| 5 | **Companies and LLPs must sign with a DSC, not an EVC OTP**; many D2C brands are Pvt Ltd | G2: EVC for proprietors and firms; a company or LLP pushes from Frrata and signs on the portal with its DSC (Frrata signs with a DSC later, only if asked) | 5 |
| 6 | Several GSTINs (a warehouse in another state) | A location per GSTIN with its own series and place of supply: Scale tier, with Locations (roadmap) | later |
| 7 | Frrata as an e-commerce operator (s.52 TCS) if it ever collects money | An ADR now: money stays merchant-owned (Razorpay sub-merchant accounts); a lawyer's opinion attached before G2 | 1 (ADR) |
| 8 | B2B: the GSTIN's state must match the billing state; place of supply for goods is where delivery ends | Checkout checks the state code against the billing state; place of supply from the ship-to state | 1 |
| 9 | HSN codes must come from the portal's master; 4 or 6 digits by turnover | The HSN search uses the portal's master list (dated), digits enforced by the band | 1 |
| 10 | CAs import Tally XML and Zoho | Tally XML in G1's exports; Zoho Books later; the month's pack emailed to the accountant | 3 |
| 11 | A separate paid "GST app" is compared with $10 apps | GST in the core and the app's exports in every tier; push and file included in Growth (no add-on price) | — |
| 12 | A merchant at ≥ ₹5 cr with B2B sales needs IRNs from day one | Turnover ≥ ₹5 cr: B2B at checkout off (with the reason) until e-invoice ships (G3) | 1 |

## 5c. As built (2026-11-09) — and where it differs from the plan
- **Phases 1–3** as planned (migrations 0070–0072). Exports: `/console/gst/export?p=&f=json|sheets|register|tally`,
  no-store, limited per member. Frrata's own invoices are not in the CA's files yet (they show Frrata's fee: G1·b).
- **No automatic credit note when a parcel comes back** (deviation): a final document would make the outcome
  impossible to undo if the parcel is re-delivered; the Fix list names RTO parcels with an invoice and no note, and
  the CA rules (owner call 6). Reversal from the order page issues it in one tap.
- **Phase 4** built without its own mockup, in the approved design language (owner: "take best decision"):
  `products.label` (0073), the declarations on the product page, returns wording by category, the editor by
  category. Not built: sample sets per category, the Admin category column and wave switch, neutral copy beyond the
  editor ("About this piece" stays).
- **Phase 5** behind `GSP_PROVIDER` (unset in Vercel = off; the in-process fake is refused in Production), tables
  0074, draft **ADR-0008** (an interactive call is an attempt row before it is a request) for the owner to sign. A
  real GSP is a second implementation of `src/lib/gst/gsp.ts` after two quotes and counsel's ECO opinion (call 7).
  DSC filing for companies: not built (EVC only).

## 6. Owner calls
1. GST compliance is **core** (every shop, every plan, always on); filing is the **app**. *Recommended.*
2. Phase order 1 → 5 as above (tax-correct core first, filing after the month view is trusted). *Recommended.*
3. Unknown HSN is refused, never guessed at 18%; a registered shop can't publish a product without HSN. *Recommended.*
4. A shop without a GSTIN, or on composition, ships only within its state. *Recommended (s.24).*
5. Phase 1 opens W0 only (fashion, footwear, accessories, jewellery); beauty and wellness in phase 4. *Recommended.*
6. A CA engaged now for the rate table and four rulings: accessories rates, the ₹2,625–2,950 inclusive band, RTO treatment, delivery/COD fee. *Required.*
7. An ADR that money stays merchant-owned (Frrata is not an e-commerce operator collecting TCS), with a lawyer's opinion before G2. *Required.*

## 6b. Owner answers, 2026-11-09
1. **ADR-0008 signed** (an interactive call is an attempt row before it is a request).
2. **Frrata is not an e-commerce operator collecting for merchants** (owner, 2026-11-09, correcting an earlier answer the
   same day): a shop's money goes to the shop's own Razorpay account and COD remittance to the shop; Frrata collects no
   consideration on a merchant's behalf. So no TCS under s.52, no GSTR-8, and no compulsory registration under s.24(ix)/(x)
   because of Frrata. **This holds only while Frrata never collects a shopper's payment**: a marketplace checkout, or
   settlement routed through a Frrata account, would change it — any such change needs this question asked again first.
   (TCS facts as checked 2026-11-09, for that day: 0.5% of net taxable value since 10 July 2024, GSTR-8 by the 10th.)
3. **Frrata's fee stays on the order as delivered**: a later return or credit note does not reduce it.

## 6d. The GST app is a module (owner, 2026-11-09)
Console › GST, its CA files and the Accountant login are the module `gst`: in the **Growth and Scale** plans
(migration 0075 adds it to their current versions; Launch unchanged), shown only once the merchant switches it on in
Apps, at `/console/apps/gst`. GST on invoices, credit notes, the rate table, Settings › Taxes and Products › HSN codes
stays in the core for every plan: a shop on Launch still issues correct tax invoices.

## 6c. Filing from Frrata (G2): parked (owner, 2026-11-09)
No GSP access is expected in the near future. G2 stays built and **off** (`GSP_PROVIDER` unset; the section never shows),
and the product's filing path is the CA's files: the GSTR-1 JSON is uploaded on the GST portal (Returns › GSTR-1 ›
Prepare offline › Upload) by the merchant or their CA, after a look in the offline tool for the first period. If G2 is
still parked by May 2027, remove `src/lib/gst/gsp.ts`, the File panel and actions, and the 0074 tables (keep ADR-0008).
What it would take, should a GSP become possible:
- **A GSP contract** (two quotes; the GSTN list of GSPs): sandbox and production credentials, their per-call price,
  the APIs for GSTR-1 save, summary, file with EVC (and DSC for companies), and an uptime commitment.
- **Their facts in `frata-integrations`**, dated: auth (app key, OTP session lifetime), payload version, error codes.
- **A second `Gsp` implementation** in `src/lib/gst/gsp.ts` against their sandbox, then `GSP_PROVIDER=<name>` in
  Vercel Production with the credentials as Sensitive variables. The fake stays e2e-only.
- **The CA's sign-off** on one real period filed from the sandbox, and the owner's go to switch it on.

## Links
- Phase 1–2 mockup (GST in the core): https://claude.ai/artifact/M4VfNAgqFHYmhCxFwZmepE (`docs/mockups/2026-11-09-gst-core.html`)
- GST module mockup (the app): https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs
- All-categories brief: https://claude.ai/artifact/K8ac7qDBZ3i8onD8vpEsoa
- Product roadmap: https://claude.ai/artifact/P5zdSXPUSPRBJUSN32v3ay
