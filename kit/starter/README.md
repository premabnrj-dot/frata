# Frrata starter

A brand's own website on its Frrata store, through the Storefront API (version 2026-12). Next.js.

1. In the brand's Frrata console, Settings › Website: choose **Your own website**, then **Create key** (Live).
2. `cp .env.example .env.local` and set `FRRATA_KEY`.
3. `npm install && npm run dev`.

Pages: home, `/products/<handle>`, `/collections/<handle>`, `/pages/<handle>` (About, Contact), `/faq`, `/bag` (then the
store's own checkout through the bag link). The footer shows the legal block India's E-Commerce Rules ask for.

Docs: https://api.frrata.shop/docs · The partner skill for Claude: `.claude/skills/frrata-site/SKILL.md`.
