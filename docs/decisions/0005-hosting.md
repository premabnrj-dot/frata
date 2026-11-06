# ADR-0005: Vercel (bom1) for the app, Supabase (ap-south-1) for data, auth and jobs

Status: accepted · 2026-11-06

## Decision
- One Next.js app on Vercel serves the console and every storefront, routed by
  host. Custom domains through Vercel for Platforms (Pro: no per-domain fee,
  soft limit 100k per project, checked 2026-11-06).
- Functions pinned to `bom1`, beside Supabase in ap-south-1.
- Supabase: Postgres, auth (magic link), storage. Background work runs from the
  Postgres outbox, swept by cron; heavier queues move to Supabase Queues (pgmq)
  when a connector needs them.
- Deploy by pushing to `main`; never `vercel deploy` (no commit behind it).
- No AWS.

## Why
The stack the founder already runs well (Ekatan). Storefronts are cached so a
festive peak hits the CDN, not Postgres.

## Revisit when
Image bandwidth costs exceed compute (move images to R2 or Supabase Storage
behind a CDN first), or storefront traffic makes Cloudflare Workers + Cloudflare
for SaaS cheaper.
