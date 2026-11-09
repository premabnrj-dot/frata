# GST module: from every invoice to a filed GSTR-1
Status: draft (research + design, awaiting the owner; revised by `docs/plans/2026-11-09-gst-core-and-categories.md` — the core vs the app, and the Shopify-apps cross-check) · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs (`docs/mockups/2026-11-09-gst-module.html`) · Approved: —

## Goal
Ranked problem **(2) GST and category compliance** (North star as proposed in `docs/research/2026-11-09-all-categories.md`
§ 4), and moat 1 of the GTM. **Measure:** a design partner's CA files GSTR-1 from Frrata's data with no edits, two
months running; and the share of GST-registered shops that file GSTR-1 through Frrata.

## Job
A brand owner (or their CA) closes each month's GST in minutes: every sale, return and RTO already invoiced right,
the GSTR-1 checked against the rules, pushed to the GST portal, and filed with one OTP — without retyping anything.

## Who controls what (the rule the whole module follows)
| Who | Is | Can | Never |
|---|---|---|---|
| The merchant | the taxpayer (GSTIN holder) | everything below; files with their own OTP (EVC) or DSC | — |
| Owner, Admin | members | set tax registration, connect the GST portal, push, file | — |
| **Accountant** (new role, invited, e.g. the CA) | a member with GST only | see GST, fix tax fields, export, push; file **only** with the taxpayer's OTP | see costs, payouts, people, the look |
| Staff, Partner | members | see a product's HSN; partner sets it before handover | see GST periods, push or file |
| Frrata | prepares (an ASP) behind a licensed GSP | compute, check, transmit what the merchant approves | file without the taxpayer's OTP; hold the portal password; change an issued invoice |
| Frrata Admin / support visit | staff | see whether a shop's GST is connected and the last filing's status | see the figures in a support visit beyond what the owner sees; push or file |

Filing needs a human every time: the GST portal issues the API session on the taxpayer's OTP (6 h or 30 days) and
signs a return only by EVC (OTP to the registered mobile) or DSC [V Zoho help, undated; S Sovos, undated]. Since
7 Nov 2025 taxpayers see and can revoke every ASP token [S, Tally 2026-10-14]. So the promise is **"Frrata prepares
and pushes; you approve with an OTP"**, never "auto-filing".

## Applicability (decided by the shop's registration, set once in Settings › Taxes)
| The shop is | Documents | Frrata does | Limits |
|---|---|---|---|
| Not registered | Bill of supply, no GST | sales register only | Inter-state supply of goods needs a GSTIN (s.24; no own-website exemption found [S]): **checkout ships only within the shop's state** (owner call 3) |
| Composition | Bill of supply, "composition taxable person" | CMP-08 working (quarterly totals) | Intra-state only; no tax collected |
| Regular, AATO < ₹5 cr | Tax invoice, credit notes | GSTR-1 (monthly, or quarterly with IFF), HSN 4 digits (B2B) | — |
| Regular, AATO ≥ ₹5 cr | + e-invoice (IRN) on B2B | + HSN 6 digits on all; IRN via the GSP | B2C stays a plain invoice (dynamic QR only ≥ ₹500 cr [U]) |
| Regular, AATO ≥ ₹10 cr | + IRN within 30 days of the invoice [U] | the 30-day check blocks a late IRN | — |
| Any, a consignment ≥ ₹50,000 | + e-way bill (Part A; courier fills Part B) | EWB via the GSP at packing | Intra-state ₹1 lakh in Delhi, Maharashtra, Tamil Nadu, West Bengal [S, Tally 2026-06-09]; EWB numbers 14 digits from 1 Jan 2027 [V, GSTN 2026-11-04] |

**Frrata as an e-commerce operator (s.2(45) / s.52 TCS):** money settles to the merchant through Razorpay, so Frrata
likely doesn't collect the consideration and owes no TCS [S]; a lawyer confirms before launch (owner call 6).

## What Frrata already has (code, 2026-11-09)
GSTIN on the shop (checksum checked); HSN per product column (not editable yet: C0 fixes it); tax invoice numbered at
packing with the seller frozen; place of supply → CGST+SGST or IGST; delivery and COD fee apportioned; prices with or
without GST; bill of supply without a GSTIN; full credit notes for cancelled and came-back orders; Frrata's own invoices
to merchants with credit notes. Missing: rates beyond apparel, buyer GSTIN (B2B), partial credit notes, unit (UQC),
the period view, GSTR-1 data, any GSP connection.

## Design (screens; mockup boards)
1. **Settings › Taxes › Registration** — Regular / Composition / Not registered; GSTIN (legal name and status fetched
   by a GSTIN lookup, shown for a yes); filing: Monthly / Quarterly (IFF); turnover band (< ₹5 cr, ₹5–10 cr, ≥ ₹10 cr)
   → chips of what applies (e-invoice, 6-digit HSN, e-way bill); who files (Owner, Admin, Accountant invite).
2. **Products › HSN** (C0) — a searchable HSN field showing the rate it gives at this price ("5% up to ₹2,500, 18%
   above"), the unit (Pieces, Kilograms, Litres, Pack…); a bulk "Set HSN" on the product list.
3. **Checkout › GST invoice** — "Claim GST input credit": GSTIN → business name filled from the lookup; the invoice
   becomes B2B (buyer GSTIN, place of supply from the GSTIN's state).
4. **Taxes › GST (new console page)** — a month at a time: status (Ready · 2 to fix · Pushed · Filed), totals
   (taxable, CGST, SGST, IGST, credit notes), the due date, and one primary action that moves with the state:
   Fix → Push to GST portal → File with OTP.
5. **Review** — tabs as GSTR-1 names them, in the merchant's words: Business sales (B2B), Large inter-state (B2CL),
   Other sales by state and rate (B2CS), Credit notes (CDNR/CDNUR), HSN summary (B2B/B2C), Documents issued; each a
   count and a total, every row links to its order.
6. **Fix list** — what blocks a clean return, each fixable in place: a product without HSN, a B2B buyer GSTIN that
   fails the lookup, an invoice series gap (with the cancelled number explained), a credit note past 30 Nov, a period
   already filed (changes go to GSTR-1A).
7. **Connect the GST portal** — a three-step sheet: (1) on gst.gov.in, My Profile › Manage API Access › Yes, 30 days
   (a drawn picture, not words); (2) GST username; (3) the OTP the portal sends. Shows "Connected until <date>" and
   Disconnect.
8. **Push and file** — Push sends the period (a progress line, then "The portal has your GSTR-1: totals match ✓",
   compared against the portal's summary); File asks PAN + the EVC OTP; Filed shows the ARN and keeps the
   acknowledgement. A filed month is read-only; later changes go to next month's GSTR-1A.
9. **For your CA** — GSTR-1 JSON (offline-tool format), an Excel workbook (the same tables), the sales register,
   the HSN summary, Frrata's own invoices to you (your input credit on our fee). GSTR-3B: its outward tables are
   auto-filled from GSTR-1 and locked [S, 2026-08-07]; Frrata shows them and exports the working; ITC, IMS and payment
   stay with the CA (as Zoho leaves 3B's final filing to the portal [V, undated]).
10. **Phone** — the month card and one action; Review as stacked counts; File works with a thumb.

## Phases (each its own mockup sign-off)
| Phase | A merchant can | Size |
|---|---|---|
| G0 (with C0) | set HSN and unit per product; a rate table for W0–W1 (CA-signed); B2B GSTIN at checkout; partial-return credit notes | ~1 agent-week |
| G1 | the GST page: month view, Review, Fix list, exports for the CA; Accountant role | ~1.5 |
| G2 | connect the GST portal through a GSP; push GSTR-1; file with EVC (proprietors, firms) — a company or LLP signs on the portal with its DSC; ARN kept | ~1.5 + GSP contract |
| G3 | e-invoice (IRN) for B2B at ≥ ₹5 cr; e-way bill ≥ ₹50,000; GSTR-1A for a filed month | ~1.5 |
| G4 | CA firms: many shops in one view (a partner type), month status across clients | ~1 |

## Design review
- **UI/UX** — one primary action per state (Fix → Push → File); the merchant's words with the GSTR-1 table names as
  secondary labels for the CA; states: not registered (the page says what applies and offers the registration
  settings), no orders this month, ready, to fix, pushing, pushed, filing, filed, portal session expired (Connect
  again), portal down (try later; nothing lost), wrong OTP; phone width; keyboard path through Review tabs. Rule 0.
- **Tenancy** — new tables `gst_periods` (tenant, period, return kind, pushed_at, filed_at, arn, payload hash),
  `gst_connections` (tenant, sealed session token, expires_at, connected_by) and `gst_attempts` (row before request);
  each with tenant_id, grant, RLS and policy in one migration; reads through `src/lib/queries/gst.ts`; the tenant from
  `requireMember`. Tenancy-auditor on the plan.
- **Modularity** — the pure engine `src/domains/tax/gstr1.ts` (orders + credit notes → GSTR-1 tables, the checks,
  the JSON); the rate table `src/domains/tax/rates.ts`; the GSP client `src/lib/connectors/gsp/` (one owner module);
  console page `src/app/(console)/console/taxes/gst/`.
- **SSOT / DRY** — an issued invoice's tax is its stored figures (orders, order_lines.gst_bps, credit_notes); GSTR-1 is
  derived from them, never recomputed from today's rates; a period's state is derived from pushed_at / filed_at.
- **YAGNI** — out: GSTR-3B filing, ITC and IMS (the CA's), GSTR-9, purchases; they come back if 3 design partners'
  CAs ask. E-invoice and e-way bill wait for G3 (target merchants are < ₹5 cr and parcels < ₹50,000).
- **KISS** — G1 alone (exports a CA uploads) already removes the retyping; G2 adds the push. One GSP, chosen on
  written quotes.
- **Scalability** — a month's GSTR-1 at 150k orders in one shop: computed from indexed order rows by period, paged in
  Review; the JSON streamed; a push is one outbox row per period.
- **Performance** — Review reads one period's invoices (index on tenant_id, packed_at); EXPLAIN in the plan.
- **Reliability** — every GSP call: a `gst_attempts` row first, then `fetchWithTimeout`; the OTP steps are
  interactive (the merchant waits), so they are synchronous calls recorded as rows, not outbox jobs (an ADR-0006
  amendment: "an interactive call is a row before it is a request, answered in the request"); the push itself is an
  outbox job. A failed push is safe to retry (the portal's save is idempotent per period [U: confirm with the GSP]).
- **Security** — GST actions: CAN_MANAGE + Accountant (a new tuple `CAN_FILE_GST`); never a support visit; the
  session token sealed per shop (secrets module), never logged; OTP and PAN never stored; GSTIN lookup rate-limited per
  shop; the buyer's GSTIN at checkout validated (checksum, then lookup) and capped; exports are PII (buyer names on
  B2B), downloaded by the roles above only, audited.
- **Motion and visuals** — the month's steps as a three-step line (Fix · Push · File); Push and File use the existing
  progress patterns; the "enable API access" step is a drawn picture.
- **Unit economics** — GSP cost per shop is unknown (no GSP publishes returns-API prices; GSTZen's e-invoice
  ₹5,250/yr and GSTIN checks ₹3,500/5,000 calls are the nearest [V, undated]); exports in every tier, push and file in
  Growth and Scale until quotes; unit-economics-reviewer on the quotes.
- **Blast radius** — the rate table touches checkout, invoices, offers and repricing (C0 keeps stored rates); the new
  role touches every role tuple (Accountant added to none but GST's); the checkout state lock for unregistered shops
  touches checkout and the shop's pincode check.

## Added from the back-office report (2026-11-09, search/sharing session; a CA confirms)
- The ₹2,500 slab follows the per-piece taxable value **after invoice discounts**: decided per line at checkout after
  offers (the code already rates the discounted piece: `src/domains/checkout/discounts.ts`).
- **From 1 Nov 2026** a post-sale discount reduces the value only through a credit note, with the buyer reversing ITC
  (s.15(3)(b), Notification 03/2026-CT, 26 Oct 2026) [S]: G0 issues it as a credit note, never an edit.
- **ARQP** (annual return, quarterly payment) is optional for ≤ ₹5 cr B2C-only sellers [S, 2026-10-12]: a filing
  option in Registration (G3).
- **GST rates change once a year, from 1 April** [S]: the rate table is versioned by effective date (G0).
- **IMS into the rules from the April 2027 return** [S]: buyer-side, stays with the CA; Frrata's own invoices to the
  merchant appear in their IMS.
- Invoice numbers: ≤ 16 characters, consecutive and unique per FY; letters, digits, `-` and `/`, not starting with
  either (Rule 46(b)) [S, 2026-10]: the series check already holds this (work.ts).

## Out of scope (and what brings it back)
GSTR-3B filing, ITC, IMS, GSTR-9 (3 CAs ask); purchases and expenses (a merchant asks to keep books in Frrata); TDS/TCS
(Frrata confirmed as an ECO); multi-GSTIN shops (a shop with a second state warehouse).

## Owner calls
1. Promise "prepares and pushes; you approve with an OTP" — never auto-filing. *Recommended (the law requires it).*
2. A new **Accountant** role (GST only). *Recommended.*
3. A shop **without a GSTIN ships only within its own state** (checkout refuses other states, with the reason).
   *Recommended: s.24 makes inter-state supply of goods need a GSTIN.*
4. GST data and CA exports in every tier; push and file in Growth and Scale. *Recommended until GSP quotes.*
5. GSP: shortlist Quicko and Sandbox (publish per-call billing), get two written quotes, contract in the Pvt Ltd's
   name. *Recommended.*
6. A lawyer confirms Frrata is not an e-commerce operator collecting consideration (no TCS); a CA rules on RTO (cancel
   vs credit note) and B2C credit-note reporting. *Required before G2.*

## Facts used (integration-researcher, 2026-11-09; gst.gov.in, einvoice1 and developer.gst.gov.in were unreachable)
- Software files only through a GSP; Manage API Access; 6 h / 30 days; OTP; EVC or DSC [V Zoho undated; S Sovos undated].
- ASP tokens visible and revocable since 7 Nov 2025 [S, Tally 2026-10-14].
- Zoho is a GSP; Books pushes GSTR-1 and files by PAN + OTP, pushes 3B and leaves the filing to the portal; approvers
  are Accountants/Admins (≤ 5); Books ₹749–7,999 a month billed yearly [V, undated].
- GSTR-3B Tables 3.1/3.2 locked to GSTR-1 since Jul/Nov 2025; GSTR-1A before 3B [S, 2026-08-07; 2025-12-05].
- Three-year bar from the due date [S, Tally 2026-03].
- E-invoice ₹5 cr AATO; from 1 Jan 2027 also RCM from unregistered and import of services (N 04/2026-CT) [V, 2026-10-26].
- E-way bill ₹50,000; Part B by the transporter; EWB 14 digits from 1 Jan 2027 [S 2026-06-09; V 2026-11-04].
- Credit notes declared by 30 Nov after the FY [S, 2026-11].
- Rule 14B: ECO-warehouse registration only for supplies through TCS-collecting ECOs [V, GSTN 2026-11-01].
- s.52 TCS only where the ECO collects the consideration [S, undated].
- GSP returns-API prices unpublished (Quicko, Sandbox) [V 2026-11-03, 2026-10-09]; GSTZen e-invoice ₹5,250/yr,
  EWB 18–35 paise, GSTIN validator ₹3,500/5,000 calls [V, undated].
- Unverified (no current primary source): a direct taxpayer API; six IRPs; 24 h IRN cancellation; B2C dynamic QR;
  30-day IRP limit; HSN Table 12 digits; Tables 14/15 for own sites; RTO cancel-vs-credit-note.
