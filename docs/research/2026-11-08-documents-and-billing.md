# Research: documents as PDFs, and billing merchants
Date: 2026-11-08 · For: `docs/specs/2026-11-08-documents-pdf.md`, `docs/specs/2026-11-08-billing.md`

## Documents

### Ekatan (`premabnrj-dot/ekatanv2`, `src/lib/documents`, read 2026-11-08)
jsPDF 4.2.1 + jspdf-autotable 5. `pdf/document.ts` opens A4 in points, registers Inter and Epilogue from base64
modules (~1 MB in the bundle), draws the lockup, running header and "Page x of y". `pdf/blocks.ts`: masthead, cards,
strip, table, totals, prose (autotable only from here). `theme.ts`: a paper palette (faint ink at 4.54:1), a type
scale, a list of known glyphs. One builder per document (quote, payment/credit note, work order, plan) taking a
narrow typed input, returning bytes and a file name; vitest checks the `%PDF-` header, size, names and wording.
`quote-pdf-file.ts` is the one function behind the customer download, the staff copy and the email attachment;
`pdfResponse()` sets `application/pdf`, `Content-Disposition`, `Cache-Control: private, no-store`.
Limits: every line hand-placed; right-aligned tracking off by one space; a missing glyph prints a box; images JPEG
or PNG only; **no complex-script shaping**.

### Libraries, tested in this session (renders in the session scratchpad `pdftest/`)
| Library (npm date) | Size min / gz | Devanagari | Notes |
|---|---|---|---|
| jsPDF 4.2.1 (2026-03-17) | 926 / 274 kB + fonts | **Broken**: क्षत्रिय split, ि misplaced | Ekatan's |
| @react-pdf/renderer 4.9.0 (2026-08-27) | 1.9 MB / 566 kB | **Correct**, Latin + Devanagari fallback chain | 1 page 163 ms; 50 slips 535 ms, 57 kB; React 19 since 4.1; PNG/JPEG only; Arabic shaping bug #3555 (2026-09-03) |
| pdfmake 0.3.14 (2026-11-08) | 1.16 MB / 310 kB | Correct | JSON tree; same-day CVE fix for URL fetching |
| pdf-lib 1.17.1 (2021-11-06) | — | Crashes with fontkit | Unmaintained |
| puppeteer-core 25.16 + @sparticuz/chromium 153 | ~70 MB | Correct | Exact match of HTML; -min downloads Chromium at run time |
Vercel functions (docs updated 2026-08-24): 250 MB uncompressed; 2 GB / 1 vCPU; **4.5 MB non-streamed response body**.

### Indian requirements (secondary sources; a CA confirms)
- Tax invoice, CGST Rule 46 (accountune.com, 2026-09-08): supplier name/address/GSTIN; consecutive number ≤ 16
  characters unique per FY; date; recipient name and address; HSN (4 digits ≤ ₹5 cr, 6 above); description, qty,
  unit; value, taxable value after discount; rate and tax per head; place of supply with state; delivery address if
  different; **reverse charge yes/no**; **signature or digital signature**. Frrata lacks reverse charge, signature, unit.
- Credit note (busy.in, 2026-07-10): own series per FY; original invoice number and date; value and tax reduced by
  head; reason; signature; declare by 30 Nov after the FY.
- B2C dynamic QR: only above ₹500 cr turnover (Tally, 2026-02-23). E-invoicing IRN: above ₹5 cr AATO (unchanged Jan 2026).
- 4×6 in (100 × 150 mm) thermal labels: Shiprocket sells 100 × 150 mm rolls (page undated); "no current source found"
  for a dated Shiprocket statement; verify against the Shiprocket API's own label at S·1.

## Billing
See § Billing below (integration-researcher, 2026-11-08).
