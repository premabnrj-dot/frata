# GST in the core, the GST app, and Frrata beyond fashion — one plan
Status: proposal, awaiting the owner · Date: 2026-11-09 · Mockup (phases 1–2): see § Links
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

## 6. Owner calls
1. GST compliance is **core** (every shop, every plan, always on); filing is the **app**. *Recommended.*
2. Phase order 1 → 5 as above (tax-correct core first, filing after the month view is trusted). *Recommended.*
3. Unknown HSN is refused, never guessed at 18%; a registered shop can't publish a product without HSN. *Recommended.*
4. A shop without a GSTIN, or on composition, ships only within its state. *Recommended (s.24).*
5. Phase 1 opens W0 only (fashion, footwear, accessories, jewellery); beauty and wellness in phase 4. *Recommended.*
6. A CA engaged now for the rate table and three rulings (accessories rates, RTO treatment, delivery/COD fee). *Required.*

## Links
- Phase 1–2 mockup: see the published artifact (link added on publish)
- GST module mockup (the app): https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs
- All-categories brief: https://claude.ai/artifact/K8ac7qDBZ3i8onD8vpEsoa
- Product roadmap: https://claude.ai/artifact/P5zdSXPUSPRBJUSN32v3ay
