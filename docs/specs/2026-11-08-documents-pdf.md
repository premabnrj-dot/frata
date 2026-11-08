# Documents as PDFs: a shop's packing slips, invoices, credit notes and labels, in the shop's own brand
Status: active · Date: 2026-11-08 · Mockup: https://claude.ai/artifact/132Kvnvy18BS9cLGQRxbpo (`docs/mockups/2026-11-08-documents-pdf.html`) · Approved: owner, 2026-11-08 ("take up both plans and execute"; calls: PDF is the paper layout (print page = preview), credit notes in Frrata, no "Made with Frrata")
Research: `docs/research/2026-11-08-documents-and-billing.md` § Documents (library tests rendered in this session).

## Goal
North star (3) **catalogue operations** and (6) **true profit per order**: packing and paperwork done in one click,
in the brand's own look, with GST documents a CA accepts. Measures: share of packed orders whose slip is downloaded
or printed from Frrata (target ≥ 80% of shops that pack ≥ 10 a week); support tickets about invoices (target: 0
"wrong GST" in 60 days); time from Confirm to Packed per order (before/after, same shops).

## Job
A brand owner or their packer downloads a branded packing slip, tax invoice or label as a PDF — one order or fifty
at once — prints it on A4 or a 4×6 thermal printer, and sends the shopper the same invoice; the numbers on every copy
are the ones issued at packing, forever.

## What exists (kept)
- **Facts, once:** `packingSlip()` and `invoice()` in `src/domains/orders/documents.ts` return plain data; GST in
  `src/domains/tax/gst.ts`; the invoice number, date, seller and per-line tax are **frozen at Mark packed**
  (`pack()` in `src/lib/orders/work.ts`, `tenant_counters`, ≤ 16 characters, per financial year).
- **Print pages** `console/orders/print` (A4, browser print, up to 50, audited support reads, e2e 60-documents).
- None of the document types carries a cost field (ADR-0003); PDF inputs stay typed to exactly those types.

## Research (summary; sources dated in the research note)
- **Ekatan** (`ekatanv2/src/lib/documents`): jsPDF + autotable, fonts embedded as base64, shared blocks (masthead,
  table, totals), one builder per document, one `…File()` function for download, staff copy and email, `pdfResponse`
  with `private, no-store`. *Taken:* pure data → one renderer per document → one file function; narrow input types;
  glyph checks; image-type checks. *Not taken:* jsPDF — **it breaks Devanagari** (tested: क्षत्रिय split, ि on the
  wrong letter), and Indian shoppers' names and addresses are often Hindi.
- **@react-pdf/renderer 4.9** (2026-08-27): shapes Devanagari correctly, mixed with Latin through a font fallback
  chain (tested: श्री प्रिया शर्मा, तिलक मार्ग); 1 page in 163 ms, 50 slips in 535 ms (57 kB); JSX and flexbox, built
  from the same tokens as the console. *Taken.* Images PNG/JPEG only (our photos are WebP → a PNG made at upload).
- **Headless Chromium** (exact match of the print pages): 70 MB, heavy per render, and its slim build downloads
  the browser at run time (against ADR-0006). *Fallback only.* **Hosted PDF APIs**: shopper addresses would leave
  Frrata (DPDP sub-processor). *Not taken.*
- **Shopify** (order printer apps), **Shiprocket** (4×6 labels), **Razorpay** (invoices as PDF downloads + email).
  *Taken:* one-click download beside Print; bulk as one file; 4×6 for thermal printers; the same file emailed.

## Phases (each its own mockup; this mockup covers D1 and D2)
| Phase | A merchant can | Visible change |
|---|---|---|
| **D0 Foundation** | nothing new | `src/lib/documents/` (renderer, blocks, fonts, `documentFile()`), the paper palette, gates; PDFs identical in content to today's print pages |
| **D1 Download** | download a slip or invoice as a branded PDF; bulk slips as one PDF; A4 or 4×6 slips | Order page: **Download PDF** beside Print; queue: **Download N slips** |
| **D2 Brand and shopper copy** | set logo, colour, signatory, terms for documents; the shopper downloads their invoice from their order page | Settings › Documents; shopper order page **Download invoice** |
| **D3 Credit notes** | issue a credit note for a cancelled or returned packed order (owner/admin) | Order page **Issue credit note**; its own series |
| D4 Shipping labels | print the courier's label | Waits for Ship S·1 (Shiprocket returns its own label PDF) |

## Design
**Order page** — the document block keeps Print and adds **Download PDF** (slip / invoice). After packing, the
invoice shows its number and **Download** (A4). A cancelled-after-packing order's invoice downloads stamped
CANCELLED; once D3 ships, **Issue credit note** sits beside it.
**Queue** — the bulk bar: *Print N slips* · **Download N slips (PDF)** · format A4 / 4×6 (remembered per member).
**Settings › Documents (D2)** — logo for paper (uploaded PNG/JPEG, or made from the shop logo), document colour
(the shop's accent unless it fails 4.5:1 on paper, then ink), authorised signatory name, invoice footer note (≤ 240
characters: return policy line, thanks), show product photos on slips (on/off), slip size default. A live preview of
the slip and the invoice beside the form.
**The PDF** — masthead: the shop's logo and name (display face), document title, number and date; a single
accent rule. Body in Inter with Noto Sans Devanagari as fallback; money and numbers in ink, tabular. The slip's
headline is **Collect ₹2,490** or **Prepaid — collect nothing**, a Code128 barcode of the order number; the invoice
carries every CGST Rule 46 particular (adds **Reverse charge: No**, unit "pcs", the authorised signatory line).
Footer: the shop's support contact; page x of y; "Made with Frrata" in 7 pt, never on the shopper's copy header.
**Shopper's copy (D2)** — the shopper's order page (`/orders#t=…`) shows **Download invoice** once packed; fetched by
POST with the order token (never a token in a URL); cancelled shows as cancelled.

## The model
- **Pure data → renderer → file.** `packingSlip()/invoice()/creditNote()` (domains, pure) → `SlipPdf/InvoicePdf/…`
  (`src/lib/documents/pdf/*.tsx`, React-PDF, built from `blocks.tsx`) → `documentFile(kind, orders, opts)` (one
  function for console download, bulk, shopper copy and any email attachment).
- **Issued means stored.** An invoice and a credit note are rendered **once, at issue**, and stored privately in Blob
  under `tenants/<t>/documents/<series>.pdf`; every later download serves those bytes (an exact copy, whatever the
  logo or layout became). A missing file is re-rendered from the frozen row and stored. Slips render on demand.
- **Logo for paper** is frozen with the issued invoice; slips use today's.
- **Fonts** vendored (OFL), traced into the function (`outputFileTracingIncludes`), never fetched. Images only from
  our own Blob host, passed as bytes; a renderer never fetches.
- **Response:** `application/pdf`, `Content-Disposition: attachment; filename="Kesar Studio Tax invoice KS-26-27-00001.pdf"`
  (ASCII + `filename*=UTF-8''…`), `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`.
- **Bulk** ≤ 50 orders in one PDF; thumbnails small so a 50-slip file stays well under Vercel's 4.5 MB body limit.

## Design review (frata-planning § 3)
- **UI/UX** — the job: paper for a parcel in one click. States: not packed (slip only), packed (both), cancelled
  after packing (stamped; credit note in D3), shopper copy (packed only), 51+ selected (refused with the limit in
  words), a support visit (download allowed, audited), phone (download opens the OS sheet). Norman: Download sits
  beside Print with the format named; the file name says what it is; a reprint is identical.
- **Tenancy** — no new tenant table in D0–D2 (settings are `shop_settings` columns, D2 migration with its column
  grant); D3 adds `credit_notes` (tenant_id, RLS, policy, proof check). Reads through `documentsFor` under
  `asMember`; the shopper copy through the token path; Blob paths under `tenants/<t>/documents/` only.
- **Modularity** — domains (pure document data) · `src/lib/documents` (render, file) · route handlers (`GET …/pdf`
  for members, `POST /api/shop/orders/invoice` for shoppers).
- **SSOT / DRY** — the numbers are the frozen order rows; the PDF and the print page read the same `invoice()`.
  **Owner call:** keep the HTML print page (screen preview + browser print) and the PDF both, from the same data,
  or make the PDF the only paper layout (recommended: the PDF; the print page becomes an on-screen preview).
- **YAGNI** — no templates editor, no custom fields, no ZIP of many invoices, no email sending of documents (comes
  with Communication), no labels before Ship S·1.
- **KISS** — one new dependency (@react-pdf/renderer); no Chromium.
- **Scalability / performance** — 50 slips ≈ 0.5 s, 57 kB; invoices served from Blob after first render; a rate limit
  per member and per shop on bulk (fails closed).
- **Reliability** — a render that fails says "We could not make the PDF. Print instead." with Print beside it; Blob
  write failure still returns the PDF and retries the store next time.
- **Security** — who: `ROLES.print` for download; credit notes `CAN_MANAGE`. THIS row: tenant from the session or the
  shopper token. Nothing fetched from a merchant URL (SSRF); no cost field can be passed (typed inputs + gate).
- **Motion and visuals** — Download is a button with a spinner label ("Making PDF…"), no new motion; the Documents
  settings preview is the PDF's own first page as an image.
- **Unit economics** — Blob storage ≈ 40 kB per invoice (₹ negligible); no per-document vendor cost.
- **Blast radius** — rule 9 of `frata-design-language` changes; e2e 60-documents grows PDF steps; the shopper order
  page gains a button.

## Practices recorded in skills (same commit as approval)
- `frata-design-language` rule 9 rewritten (PDF as paper; A4 + 4×6; the paper palette at 4.5:1; brand limits).
- `frata-architecture` § Documents (pure data → renderer → `documentFile()`; issued = stored; headers; fonts traced).
- `frata-gotchas`: jsPDF breaks Devanagari; React-PDF images are PNG/JPEG only; fonts need `outputFileTracingIncludes`.
- `frata-verify`: render a Devanagari fixture and compare it with a golden image.

## Repetitive work → agents and scripts
| Work | Becomes |
|---|---|
| "Does this document leak a cost?" | gate `check:doc-inputs` (cost sentinels in `src/lib/documents/**` and document types) |
| "Does a renderer fetch?" | gate `check:doc-fetch` (no `fetch`, no URL image sources in renderers) |
| "Is this GST document complete?" | vitest per document (Rule 46 particulars, both tax heads, 16-char number) + a `gst-document-reviewer` agent for CA-style review of a new document type |

## Out of scope (and what brings each back)
- Courier labels (Ship S·1 returns them) · e-invoice IRN/QR (a merchant above ₹5 cr AATO) · emailing documents
  (Communication) · custom templates (3 merchants ask) · ZIP export for a CA (a CA asks).

## Owner calls
1. Rule 9: PDF becomes the paper layout (print page stays as preview) — recommended.
2. Credit notes in Frrata (D3) rather than "ask your CA" — recommended (the invoice is ours; so is its reversal).
3. "Made with Frrata" in 7 pt on the merchant's documents: yes / no.
