---
name: frata-integrations
description: Use when building, planning or answering questions about a Frata connector - Razorpay (partner, sub-merchants, Route, webhooks), Shiprocket (API, rate shopping, NDR, COD remittance), Meta (Tech Provider, WhatsApp Cloud API, pricing, Conversions API, Instagram), Google (Merchant API, Ads, GA4, OAuth verification), email or Anthropic (Managed Agents, the Agent SDK's terms, model prices for Studio) - and for which facts about them are verified, when, and where from.
metadata:
  version: 2.2.0
  owner: owner
  verified: 2026-11-16
  decisions: [ADR-0006, ADR-0020]
---

# Frata integrations

**Facts here expire.** Each carries the date it was checked and a tag: [V]
primary source or several independent ones · [S] vendor/affiliate only · [U]
unverified. Older than 90 days or [S]/[U] and you are about to build on it →
run the `integration-researcher` agent first, then update this file and bump
the version. Full research: `docs/research/2026-11-06-market-ux-and-stack.md`.

## Rules for every connector

1. Outbound calls are `outbox` rows (ADR-0006), sent by a sender registered for
   the row's `kind`; every request through `fetchWithTimeout`.
2. Inbound webhooks: verify on the raw body, store under our key, answer 200,
   process later. Route listed in `scripts/check-actions.mjs` ENTRY_POINTS.
3. Per-merchant credentials live in a tenant table, encrypted; never in env,
   never logged, never sent to a browser.
4. A connector's state is shown to the merchant in words on the Channels hub:
   connected · needs attention (with the one action) · not connected.
5. Everything the platform must apply for (Meta app review, Google OAuth
   verification, Razorpay Aggregator) is in the **legal entity's** name — a Pvt
   Ltd before the first application (re-verifying later means downtime).

## Reference files — open the one for the work in hand

The sections above bind every change. The rest are in one file each below, moved there unchanged (practices plan
G4, 2026-11-16); a "§ <name>" named elsewhere is in SKILL.md or in the file listed here.

| Open | When | Sections |
|---|---|---|
| [reference/payments-and-billing.md](reference/payments-and-billing.md) | payments, refunds, Razorpay accounts and keys, how Frrata bills merchants, GST filing (GSP/ASP) | Razorpay, Merchant billing, GST filing |
| [reference/shipping.md](reference/shipping.md) | shipping, rate shopping, NDR, COD remittance, PIN code serviceability and RTO data | Shiprocket, PIN code delivery |
| [reference/meta-and-messaging.md](reference/meta-and-messaging.md) | WhatsApp, Instagram, the Conversions API, Tech Provider, notifications (SMS, push), OTP and sign-up codes | Meta, Notifications, Sign-up code |
| [reference/email.md](reference/email.md) | sending email (SES), events, SNS, transactional and marketing mail | Email |
| [reference/google-and-attribution.md](reference/google-and-attribution.md) | Google (Merchant API, Ads, GA4, OAuth, Search Console) and attribution signals (landing URL, referrer) | Google, Attribution signals |
| [reference/platform.md](reference/platform.md) | shop domains (Vercel for Platforms), Mux video, infrastructure usage and costs, Vercel functions and firewall | Domains, Mux, Infrastructure usage, Vercel platform |
| [reference/anthropic.md](reference/anthropic.md) | Studio's agent: Frrata's Claude account and its terms, model prices and caching, Managed Agents, Vercel Sandbox, what the spike must confirm | Anthropic |
| [reference/law-and-market.md](reference/law-and-market.md) | offers and checkout law, DPDP privacy, trust and safety, the E-Commerce Rules and Legal Metrology, Shopify as the reference | Commerce law, Privacy, Trust and safety, Consumer protection, Shopify |
