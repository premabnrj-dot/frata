# Plan: product import (PI·0–PI·3)
Status: planned · Date: 2026-11-12 · Spec: `docs/specs/2026-11-11-product-import.md` (active; mockup approved 2026-11-12)

Every finding of the five plan reviews (2026-11-12: architecture, tenancy, security, speed, unit economics) is either
folded into a task below or listed under "Accepted / deferred". Every task ends with `npm test`, `npm run typecheck`
and `impact-reviewer` on its diff; tasks touching `drizzle/` also run `npm run verify:tenancy` on a throwaway Postgres.

## Changes to the spec the reviews forced
| Was | Now | Why (review) |
|---|---|---|
| Up to 2,000 products | **Up to 600 products per shop** (the shop's live catalogue limit); the file check says so before anything is written | The cached catalogue entry is 880 kB at 600 products, ~2.9 MB at 2,000, past Next's 2 MB; lists cap at `MAX_LISTED = 600` (speed H4, architecture MAJOR). SQL-paged lists come first if a shop needs more |
| "Reuses the product create path" | A **set-based chunk writer** `src/lib/catalogue/write.ts` built from the pure helpers (`handleFor`, `skuFor`, `uniqueSku`, `reconcile`); the editor's `saveProduct` moves onto the same writer | No such path exists: SKU, GTIN and variant rules live inline in the server action; product by product would be ~30 statements and a whole-catalogue purge each (architecture BLOCKER, speed H3) |
| "Rows written by asMember" while the page can close | The browser drives each chunk through `asMember` while the page is open; a closed page leaves the job paused, resumed from its row when reopened. No unattended runner in PI·1 | A leased runner has no session, no support audit, and outlives a removed member (tenancy HIGH 2, security M5) |
| Owner/admin; "partner before handover" | `ANY_MEMBER` (staff already edit the catalogue); cost columns only when `costsVisibleIn` allows, inside the transaction | No such role tuple; staff edit products today (architecture MAJOR, tenancy LOW 8) |
| Photos by URL fetched on the server (PI·3) | **Fetched in the browser first** (Shopify's CDN answers CORS `*`, checked 2026-11-12) and stored like any upload; the server fetches only hosts without CORS, through a hardened `public-fetch` and its own paced queue | The shared outbox would hold order emails and payment checks for hours; SSRF (speed H1, security H3) |
| Bulk photos inside the upload limit | Imports use their own upload bucket (one token per photo, not per width) | 800 tokens/hour ≈ 200 photos; 60 products × 4 photos fails the 10-minute target (speed H2, architecture MAJOR) |
| "1,2,99" an error, Hindi names transliterated | One price parser shared with the editor (`parseRupees` stops accepting misplaced commas); `handleFor` transliterates (one new small dependency, named and sized in the task) | The editor's parser strips every comma; `handleFor` drops Hindi letters (architecture MAJOR) |
| Measure: first published product | Measure: sign-up → first **delivered** order, and trial → paid, import vs no import, first 2 cohorts; Done offers "Publish the N ready" | Drafts and no photos don't sell (unit-economics) |

## Tasks
**PI·0 · groundwork (no screen changes)**
1. Int test of today's `saveProduct` (SKU uniqueness, GTIN clash, archived variant revival, cost check). Verify:
   `INT_DB_HOST=… npx vitest run src/lib/catalogue`.
2. `src/lib/catalogue/write.ts`: `writeProducts(tx, tenantId, drafts[])` set-based (handles `= any(bases)` + suffix,
   SKUs `= any`, one insert per table, variants in id order, `lock_timeout` 1 s); `saveProduct` calls it for one.
   Verify: task 1's tests unchanged; EXPLAIN of the handle and SKU reads < 10 ms at 10×.
3. One price parser (`src/domains/money/rupees.ts`, ₹ / Rs / INR / "1,299" / "1,00,000" / "/-"; misplaced commas
   refused) used by the editor and the import; `handleFor` transliterates Devanagari and other Indic scripts. Verify:
   `npx vitest run src/domains`.

**PI·1 · file → check → drafts**
4. Pure `src/domains/catalogue/import/`: header matching (ours, Shopify, WooCommerce, common sheet words), rows →
   product drafts (one row per variant by Handle, or one per product with "S/M/L" cells), every problem as row · column ·
   what to fix, the 600 cap, the "rows to fix" CSV with formula escaping as `gstr1-files.ts` does (`= + - @ \t \r`).
   Fixtures: a Shopify export, a WooCommerce export, our template, a Hindi sheet, the stress test's broken sheet.
   Verify: vitest.
5. Migration: `import_jobs` (tenant, file name, file hash, update flag, mapping, counts, next chunk, started_by,
   support_session_id, created/finished) and `import_rows` (tenant, job, n, cells, errors, product_id), composite
   `(tenant_id, job_id)` and `(tenant_id, product_id)` FKs, unique `(tenant_id, file_hash, update)`, grant/revoke/RLS/
   `tenant_rows` policy in the same migration, no `frata_admin` grant; `tenancy.sql` gains the checks the tenancy audit
   listed. Rows' cells are nulled when the job ends (costs). The same migration adds a unique index on
   `variants (tenant_id, upper(sku))` (PI·0 found the app treats SKUs case-blind while `variants_tenant_sku` doesn't: two
   saves at once could store `KS-1` and `ks-1`; the index also turns `writeProducts`' SKU read into a lookup, now ~7 ms
   at 10×); check production for case-only duplicates first (none, 2026-11-12). The exact `variants_tenant_sku` index stays
   for now; a later migration drops it once the upper-case one has run in production. Verify: `npm run check:tenant`,
   `npm run verify:tenancy`.
6. Actions: `startImport` (server re-checks the file's summary: ≤ 600 products, ≤ 1,800 variants, one running job per
   shop, a daily limit failing closed), `importChunk` (Zod `.strict()`, ≤ 512 kB, a Handle group never split; the server
   re-runs task 4's rules; `writeProducts` as drafts; audit row in a support visit), `deleteImportDrafts` (never
   published, never ordered, this job, this shop; photo files through the `acceptedBase` guard). Parser loaded with
   `import()` on file pick (read-excel-file, 16.7 kB gz; CSV via papaparse 7.3 kB); the import route's CSP gains
   `worker-src 'self' blob:`. Revalidate `/console/products` only (drafts never reach shoppers). Verify: int tests
   (a chunk refused when it breaks the cap; a resumed job continues at its chunk), `security-reviewer`.
7. UI per the mockup (File, Check, Done, history, "Publish the N ready"). Verify: `npm run e2e -- --only import` (new
   flow 75: the stress test's sheet, phone and desktop), screenshots read.

**PI·2 · photos by file name** (ships with PI·1)
8. Bulk photos matched by file name, resized in the browser as today, an import upload bucket. Verify: e2e flow 75
   adds 12 photos; `security-reviewer`.

**PI·3 · photos by URL, updates**
9. Browser fetch for CORS hosts; `src/lib/http/public-fetch.ts` (resolve and pin the IP, refuse non-public ranges,
   https:443 only, manual redirects ≤ 3 re-checked, 10 MB / 10 s, magic bytes JPEG/PNG/WebP) and a paced
   `photo.fetch` queue with its own cron (batches ≤ 10, 4 at a time, deduped by URL hash), stored under
   `tenants/<tenant>/products/` only, ≤ 10 per product; sharp with `limitInputPixels: 40e6`, `failOn: 'error'`.
   ADR-0005 amended. Verify: int tests (private IP, redirect to loopback, oversize, wrong bytes refused).
10. Update mode: matched by SKU then address; a blank cell changes nothing; no variant deleted; stock changes shown in
    the check step; live products' catalogue purged at most once per 30 s, then once at the end. Verify: int tests;
    an update chunk never makes checkout wait past 1 s (measured).

## Accepted / deferred (with the signal that brings each back)
- Unattended import runner: when a shop asks to import > 600 products or leave the page mid-import.
- More than 600 products: SQL-paged lists first (speed H4).
- Remembered mapping per source: stored on `import_jobs.mapping` and read back from the shop's last job of that source;
  no separate table (tenancy MED 7).
