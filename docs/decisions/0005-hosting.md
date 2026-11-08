# ADR-0005: Vercel (bom1) for the app, Supabase (ap-south-1) for data, auth and jobs

Status: accepted · 2026-11-06 · amended 2026-11-06 (files: Vercel Blob) · amended 2026-11-08 (AWS, owner)

## Decision
- One Next.js app on Vercel serves the console and every storefront, routed by
  host. Custom domains through Vercel for Platforms (Pro: no per-domain fee,
  soft limit 100k per project, checked 2026-11-06).
- Functions pinned to `bom1`, beside Supabase in ap-south-1.
- Supabase: Postgres and auth (magic link). Background work runs from the
  Postgres outbox, swept by cron; heavier queues move to Supabase Queues (pgmq)
  when a connector needs them.
- **Files (product photos, logos) on Vercel Blob**, store `frata-blob`, not
  Supabase Storage (amended 2026-11-06, Phase 1 architecture review). The
  console asks our own server for a one-time upload token; the server checks
  `requireMember` and forces the path `tenants/<tenantId>/…`, so who may write
  where is decided by the same code as every other write. Supabase Storage
  would need either a service-role key (absent on purpose) or storage policies
  for `authenticated` that repeat `app_access_for` in a second place, and the
  photo copy behind a file import runs with no user session at all. Photos are
  resized once in the browser (400/800/1200/1600 WebP) and served as they are,
  with no per-view image transforms. `BLOB_READ_WRITE_TOKEN` is read only in
  `src/lib/env.ts`.
- Deploy by pushing to `main`; never `vercel deploy` (no commit behind it).
- **AWS: allowed service by service, not as a second host** (owner, 2026-11-08; replaces "No AWS"). The app,
  data, auth and jobs stay on Vercel and Supabase. An AWS service may be used when it does one job better or cheaper
  (e.g. Amazon SES for email), on these terms: its own short decision record naming the service and why; region
  `ap-south-1` (Mumbai), beside bom1 and Supabase; one IAM user per service with a least-privilege policy (that
  service's actions only), its key in Vercel only, read by one owner module through `src/lib/env.ts`; no customer
  or shopper data stored in AWS beyond what the service needs to do its job; calls through the outbox (ADR-0006).
  None is in use as of 2026-11-08 (trials send by WhatsApp only).

## Why
The stack the founder already runs well (Ekatan). Storefronts are cached so a
festive peak hits the CDN, not Postgres.

## Revisit when
Image bandwidth or CDN requests cost more than compute (unit-economics review
2026-11-06: serving photos from Vercel costs ~$57/month more than Supabase at
200 shops; move images to R2 or Supabase Storage behind a CDN first), or storefront traffic makes Cloudflare Workers + Cloudflare
for SaaS cheaper.
