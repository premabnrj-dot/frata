# Back office for Indian D2C fashion: GST, accounting, procurement, expenses, POS, CRM/DPDP (research, 2026-11-09)

For the product roadmap (handed to the vision/roadmap session). [P] official/vendor page read; [S] reputable secondary
(mostly snippets); [U] unverified / no current source. **A CA confirms § 1 before the first invoice.**

**Answer**: build the tax invoice, money-in reconciliation, inventory and customer/consent data in Frrata; integrate
accounting, e-invoicing, POS payments and corporate cards. **DPDP Phase III, 13 May 2027, is the hardest date.**

## 1. GST
- **E-invoicing**: still AATO > ₹5 cr [S, 2026 guides]; ₹2 cr claims have no notification. B2B and export only (B2C
  dynamic QR only > ₹500 cr [U]). 30-day IRN rule > ₹10 cr from 1 Apr 2025 [S; primary older]. 57th Council (8 Oct
  2026): e-invoice for RCM from unregistered and import of services ≥ ₹5 cr — recommendation [S, TaxHeal 2026-10-12].
  Direct IRP API reportedly ≥ ₹100 cr [U]; otherwise a GSP; IRN free on the IRPs.
- **E-way bill**: 2026 enhancements (Ship-To GSTIN, closure, new APIs) **on hold** since 29 Jul 2026 [S, Busy 2026-08-11];
  ₹50,000 threshold no current source [U]; relevant for stock transfers, job work, wholesale.
- **GSTR-3B Table 3.1/3.2 auto-filled from GSTR-1 and locked** since July 2025; GSTR-1A is the correction route [S,
  2026-06-23] → the month's tax is whatever the GSTR-1 data says; invoices must be right at source. ITC (Table 4) lock not
  confirmed live; Advisory 643 hard validations [S]. **IMS** (accept/reject/pending, Oct 2025) matters to the brand as a
  buyer; 57th Council: IMS into rules from the **April 2027** return [S]. Also: late fee waiver ≤ ₹5 cr; optional
  **ARQP** (annual return, quarterly payment) for ≤ ₹5 cr B2C-only — many Frrata merchants fit; **rate changes once a
  year from 1 April** [S, 2026-10-12].
- **HSN**: Table 12 dropdown, B2B/B2C split, Table 13 mandatory (2025 advisories, older [U]); 4 digits ≤ ₹5 cr, 6 above —
  store 6–8 digits per product.
- **ECO/TCS s.52** (0.5% since 10 Jul 2024): applies only when the operator collects the money. **Frrata is not an ECO
  while each merchant collects into its own Razorpay sub-merchant account** and Frrata bills only its fee; it would
  become one (registration, TCS, GSTR-8; merchants registered from ₹0) if it collected and paid out. **Keep the money
  flow merchant-owned** [analysis; CA to confirm]. Income tax ECO TDS now s.393(1) Table 8(v), 0.1% (1 Apr 2026) [S].
  Rule 14B for marketplace sellers: brands on Myntra/Amazon will see TCS credits — reconciliation should show them.
- **Rates (GST 2.0, 22 Sep 2025)**: apparel and made-ups (Ch 61–63) and footwear: **5% ≤ ₹2,500 per piece/pair, 18%
  above**; the slab follows the **per-piece taxable value after invoice discounts** → decided per line at checkout after
  discounts (a ₹2,700 kurta with 10% off is 5%; splitting an order coupon changes the tax). **From 1 Nov 2026** a
  post-sale discount reduces value only with a credit note and the buyer reversing ITC (Notification 03/2026-CT,
  26 Oct 2026) [S].
- **Composition**: ≤ ₹1.5 cr, intra-state only → barely fits D2C; a switch that blocks out-of-state shipping and prints
  the composition line [U]. Inter-state goods need registration from ₹0 (s.24(i)) [U].
- **Invoice numbers** (Rule 46(b)): ≤ 16 chars, consecutive, unique per FY; letters, digits, `-` `/`; not starting with
  `/` or `-`; series per type/location allowed [S, 2026-10].
- **The platform must produce**: invoice per order (per-line HSN and post-discount slab, place of supply, FY series);
  credit notes (returns, RTO, post-sale discounts) linked to the invoice; a GSTR-1 dataset (B2C large/small by state,
  Table 12 B2B/B2C, Table 13, notes) as the offline-tool export, later via a GSP; IRN for B2B > ₹5 cr (30 days ≥ ₹10 cr);
  EWB for movements > ₹50,000 [U].
- **GSPs**: no public per-IRN prices (ClearTax "from ₹7,777/mo" [S]; ~₹0.5–2/IRN [S]); get quotes. Zoho Books includes
  e-invoicing from Standard.

## 2. Accounting
TallyPrime: XML over HTTP on the merchant's PC (port 9000) or ODBC; no REST/webhooks → **generate Tally XML vouchers**
for the CA, a local agent later. Zoho Books India [P]: Free (≤ ₹25 lakh) / Standard ₹749 / Professional ₹1,499 /
Premium ₹2,999 / Elite ₹4,999 / Ultimate ₹7,999 per month (annual), REST API. Vyapar: CSV only. **COD remittance**
(Shiprocket ~D+8–9; early COD fees 0.49–0.99%, conflicting): match AWB ↔ order ↔ remittance UTR ↔ bank, net of freight
and COD charges. **Razorpay**: `/v1/settlements/recon/combined` (fee and tax in paise per item), `/v1/settlements/:id`
(UTR) → order ↔ payment ↔ settlement ↔ UTR; fees + GST booked as expense with ITC.

## 3. Procurement and inventory
ITC-04 for job work (half-yearly > ₹5 cr, annual ≤ ₹5 cr); inputs back within 1 year or deemed supplied [U]; fabric
goes out on a delivery challan. Zoho Inventory $0–249 (USD page); Ginesys ERP ₹7,000/user (min 2), POS ₹3,500/user,
Browntape OMS from ₹5,000 + ₹3.5/order line; Unicommerce ~$100/mo [S]; Increff quote. Fashion needs: size × colour
matrix, stock per location, POs and goods-received notes, bill of materials (fabric per size), landed cost into COGS,
production batches.

## 4. Expenses
Zoho Expense free ≤ 3 users, ₹79–149/user; RazorpayX corporate card [S older]. What a brand needs is mostly not a card:
ad spend, freight/COD fees and gateway fees come by API; packaging, shoots, salaries, rent by hand/CSV; the point is
profit per order with GST input credit per bill.

## 5. POS and stores
Shopify POS Pro ₹7,000/location/month; Razorpay POS ₹1,000 + ₹325–425/month [S]. UPI MDR 0.4% > ₹2,000 announced for
15 Oct 2026, **deferred to "post-Diwali"**, no new date [S]. Branch transfers between GSTINs under one PAN = a supply
(invoice + EWB; Rule 28 valuation; zero value kills ITC); within one GSTIN a delivery challan [S older]. Fashion ~60% of
D2C store leasing [S]; offline adds planning, staffing and sync burden.

## 6. CRM, loyalty, DPDP
DPDP Rules 2025 (notified 13/14 Nov 2025): Phase II 13 Nov 2026 (consent managers); **Phase III 13 May 2027**: notice
per purpose, safeguards and ≥ 1 year of logs, breach notice (people without delay, the Board in 72 h), erasure when the
purpose ends with 48 h warning, children's consent, a published contact, rights requests within 90 days; penalties to
₹250 cr. **Each merchant is the fiduciary, Frrata its processor** (a processing contract). Marketing consent per
purpose, logged with notice version and time, withdrawable as easily as given. Loyalty: Nector from $49, Reelo ₹2,500
[U], Capillary/Easyrewardz quote. Store credit and gift-voucher GST / RBI PPI status: no current source [U].

## Build / integrate, and the order
| Area | Build | Integrate | Risks |
|---|---|---|---|
| GST | invoice + credit notes; per-line HSN and post-discount slab; place of supply; FY series ≤ 16; GSTR-1 dataset export; composition flag; EWB fields | one GSP for IRN/EWB (B2B > ₹5 cr), later GSTR-1 filing | wrong slab → wrong tax locked through 3B; becoming an ECO; annual rate changes; Apr 2027 redesign; CA sign-off |
| Accounting | settlement ledger (Razorpay and COD), fees + ITC, "money still to arrive" | Tally XML export; Zoho Books API; Vyapar CSV | one system must own the invoice number |
| Inventory/procurement | matrix, stock per location, POs + GRN, BOM, landed cost into COGS, job-work challans + ITC-04 data | Ginesys/Unicommerce/Increff for those who outgrow us | ERP scope creep; stock drift; landed cost wrong → profit wrong |
| Expenses | pull Meta, Google, Shiprocket, Razorpay; manual/CSV; allocate to orders | cards and claims via CSV/feeds | bad allocation misleads profit; never build cards |
| POS | later: a PWA POS on the same stock and invoices; transfers as invoice + EWB / challan; series per store | card and UPI devices | offline sync; transfer valuation; MDR |
| CRM/DPDP | profiles and segments; consent + notice log; rights requests; erasure jobs; breach runbook; store credit; points/referral | messaging via WhatsApp/email connectors | 13 May 2027; processor liability; points accounting |

**Order**: (1) GST invoices + credit notes + GSTR-1 dataset; (2) COD and gateway reconciliation; (3) expense pull +
landed cost; (4) consent/notice log and data rights by **Q1 2027**; (5) Tally XML, then Zoho Books; (6) POs, BOM, job
work + ITC-04; (7) locations and transfers; (8) GSP for IRN/EWB where needed; (9) loyalty and store credit; (10) POS last.

**Verify before building**: GSTN/CBIC primaries (Phase III HSN, EWB threshold); NPCI MDR date; GSP quotes; a CA ruling
on ECO status; Gofrugal/Petpooja POS pricing (not researched).
