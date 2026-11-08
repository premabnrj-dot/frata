# Plan: documents as branded PDFs (D0–D3)
Spec: `docs/specs/2026-11-08-documents-pdf.md` (approved by the owner, 2026-11-08) · Status: in progress

## Review findings (2026-11-08) — binding; they override the spec where they differ
Reviews: architecture-reviewer and security-reviewer, both on the plan before any code.
1. **No PDF is stored in Blob.** The Blob store is public, and the invoice series contains `/`.
   - An issued document is **re-rendered on every download** from its frozen rows, plus a paper logo frozen at issue.
   - It is served only through a route that checks access. Nothing gets a blob URL.
   - A private store is for later, with its own token and Production only, if ever needed.
2. **`documentFile` takes document data, not orders.** One tax-document shape serves the shop's invoice, its credit
   note and (B2) Frrata's invoice: an HSN/SAC code, reverse charge, signatory. The blocks take any brand
   `{name, accent, logo bytes}`.
3. **A renderer fetches nothing.**
   - Images arrive as bytes, loaded through `fetchWithTimeout`, only from URLs that pass `acceptedBase` (our host,
     this tenant's folder).
   - Each image is capped at 1 MB, must be PNG or JPEG by its magic bytes, and has its pixel size capped.
   - Gate `check:doc-fetch`: no `fetch`, no `<Image src="http…">`, no `<Link>` in `src/lib/documents/pdf/**`.
4. **No cost reaches a document.** Gate `check:doc-inputs`: no cost sentinel (`scripts/cost-sentinels.mjs`) in
   `src/lib/documents/**` or `src/domains/documents/**`.
5. **Merchant text is plain text.**
   - The note, signatory and contact are Zod-capped at ≤ 240 characters. No link is made from a merchant string.
   - The colour must match `^#[0-9a-f]{6}$` and passes through `paperAccent`.
6. **Limits fail closed:** `pdfMember` 30 / 10 min and `pdfShop` 120 / 10 min; ≤ 50 orders per file; at most 2
   images a slip; none on 4×6.
7. **The shopper's copy** goes through `shopRequest` (Origin), with limit `invoiceIp` 20 / 10 min fail-closed.
   - It reads through `src/lib/queries/`.
   - It returns the same 404 whether the order isn't packed, the shop is wrong or the token is wrong.
   - The invoice carries no phone number: Rule 46 asks for name and address, which `addressLines` already gives.
8. **Credit notes (D3):**
   - `'credit'` is added to `COUNTER_KINDS`, `compose()`, `MAX_IN_YEAR` and `seriesFits()`.
   - It has its own table: tenant_id, RLS, select and insert for frata_app inside the shop. A trigger makes a credit
     note final once issued. Proof check.
9. **Owner calls applied:** the PDF is the paper layout (the print page stays as the preview), no "Made with
   Frrata", and credit notes are issued in Frrata.

**D2 as built (2026-11-08; security-reviewer and impact-reviewer findings applied)**
- The logo for paper is a PNG only: the browser redraws any PNG, JPEG or WebP as a PNG (≤ 600 px) and uploads it
  through `DOC_LOGO_SHAPE` (1 MB, documents editors, never a support visit, limit failing closed). `setDocLogo` and the
  loader check the magic bytes, IHDR, ≤ 2000 px and that the image data inflates within that size (no
  decompression bomb). Only successes and definite refusals are cached.
- An invoice freezes its logo, signatory and note at packing (`orders.invoice_logo`, `invoice_signatory`,
  `invoice_note`); slips use today's. CHECKs pin both logo columns to the shop's own folder (proof check 40).
- The signatory and note refuse web addresses (a PDF viewer would make them links).
- **Dropped:** product photos on slips (photos are WebP; React-PDF reads PNG/JPEG; converting needs a native
  dependency). Brought back by a merchant asking, with server-side conversion. **Not built:** a document colour
  (the look's accent through `paperAccent` is used) and a logo "made from the shop logo" (no shop logo is set yet).
- **Carried:** the HTML print page does not yet show the signatory, note or logo (it stays a preview; D3 aligns it).

## Tasks (each: verify, impact-reviewer on its diff, commit)
- **D0**
  - Paper rules (`src/domains/documents/paper.ts`): accent at 4.5:1, file names, Content-Disposition.
  - Fonts: vendored OFL Inter and Noto Sans Devanagari, traced into the function.
  - Blocks; slip (A4 and 4×6) and invoice pages; `documentFile`; `pdfResponse`.
  - Gates `check:doc-inputs` and `check:doc-fetch`.
  - vitest: `%PDF-`, the page size, the invoice number and both tax heads in the text, a Devanagari fixture.
  - Verify: `npm test`, typecheck, a render of the fixture checked by eye.
- **D1**
  - Route `GET /console/orders/pdf?kind=slip|invoice&size=a4|label&n=…`: `asMember(ROLES.print)` audited, the
    limits, `pdfResponse`.
  - The order page and the queue get "Download PDF" and "Download N slips (PDF)", with the size remembered per member.
  - The print page stays as the preview.
  - e2e: content type, `no-store`, the same number on a second download, another shop's number gives nothing.
- **D2**
  - `shop_settings` columns: `doc_logo` (a frozen Blob path; PNG or JPEG uploaded through a new `PATH_SHAPE` branch,
    byte-checked), `doc_signatory`, `doc_note`, `slip_size`, `slip_photos`.
  - Column grants; proof check.
  - Settings › Documents with a preview.
  - The logo reference is frozen on the order at packing (`invoice_logo`).
  - The shopper's "Download invoice": a POST with the token.
- **D3**
  - The credit-note counter kind, the `credit_notes` table and its proof.
  - Issue (`CAN_MANAGE`, `asMember`, audited), for a packed order that was cancelled or came back.
  - The credit-note PDF.
  - e2e.
- **Close:** rewrite `frata-design-language` rule 9; add `frata-architecture` § Documents; `frata-gotchas` (jsPDF
  breaks Devanagari; React-PDF takes PNG/JPEG only; fonts need tracing); `frata-verify` (the Devanagari fixture).
