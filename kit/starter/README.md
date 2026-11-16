# Frrata starter

A brand's own website on its Frrata store, through the Storefront API (version 2026-12). Next.js.

1. In the brand's Frrata console, Settings › Website: choose **Your own website**, then **Create key** (Test while
   you build: it reads drafts too; Live once the store opens).
2. `cp .env.example .env.local` and set `FRRATA_KEY`. Never in a file git tracks.
3. `npm install && npm run dev`.
4. `npm run check` before you push (CI blocks on it): no key in source, the legal block, no arithmetic on a price,
   no HTML from the API, the paths, the bag link. `npm run build` runs it too.

Pages: home, `/products/<handle>`, `/collections/<handle>`, `/pages/<handle>` (About, Contact), `/faq`, `/bag` (then the
store's own checkout through the bag link). The footer shows the legal block India's E-Commerce Rules ask for.

Docs: https://api.frrata.shop/docs · With Claude Code: `CLAUDE.md` holds the rules, and the partner skill is
`.claude/skills/frrata-site/SKILL.md`.
