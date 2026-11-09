# Theme: Signal
Status: draft · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/9XNT3KFJziXEyaKyDa48dr (docs/mockups/2026-11-09-theme-signal.html) · Approved: —

## Goal
North star **(5) a premium-looking storefront**, and through it (4) mobile conversion. Brands whose product is the hero
(bags, footwear, accessories, western wear: the W0 categories beyond ethnic wear) have no Frrata theme made for them:
Editorial is for occasion wear, Studio is quiet type, Bazaar is for big catalogues. Measure: share of new shops in those
categories that pick Signal and publish within 7 days; product-page add-to-bag rate on Signal shops against the same
categories on other themes (Analytics), after 30 days.

## Job
A small D2C brand that sells objects (a backpack, a sneaker, a wallet) gets a storefront that looks like a design-led
brand's (one signal colour, one confident grotesk, products on quiet grey tiles, stories about the details) without a
designer or a developer.

## Research (2026-11-09)
- **Mokobara** (mokobara.com, studied live today at 1440 and 390 px; Shopify, theme "Moko_Theme / LIVE PROD", schema
  "themex" 2.3.2, not a Theme Store theme: a custom build). What makes it feel unique, in order of weight:
  1. Art direction: their own photography and video; product shots on near-white, lifestyle shots in cities.
  2. **One signal colour** (marigold) used sparingly: section labels as pills, one full-bleed band, the chat button.
  3. **One grotesk** (Neurial Grotesk, a licensed face) for everything; sentence-case headings with a full stop
     ("Crowd favourites.", "Meet the latest.").
  4. **A floating header**: a dark vertical menu panel on a computer, a dark rounded bar on a phone, over the hero.
  5. Home sections: hero carousel; spotlight (label, headline, link beside a wide video); bestsellers with category
     tab pills over edge-to-edge grey tiles; new arrivals rail with a "01 / 10" counter; a brand band in the signal
     colour; a fanned story carousel; a store locator by city; a full-bleed photo with a script wordmark; a dark photo
     footer.
  6. Product page: sticky buy column; the gallery is a long editorial stack (annotated exploded views, diagrams, story
     photos); colour swatches with a "Compare" tab; pay in full vs pay in 4; delivery date; "Pair it with" add-ons;
     pincode check; a trust row (warranty, returns, laptop size); accordions; feature slides "1 / 8".
  **Taken:** the qualities (signal colour as a system, one grotesk, grey tiles, floating header, tabbed bestsellers,
  counter rail, signal band, story fan, statement photo, product stories, pair-it-with). **Not taken:** their name,
  logo, marigold, typeface, copy, photos or exact layouts — Signal is an original theme in this genre, and the
  merchant picks the signal colour.
- **Frrata today** (`src/domains/themes`): three 2.x themes, the section library (10 kinds), site settings (palette,
  type styles, icons), menus, header and footer designs, gallery modes (`stack` exists), sticky buy box, phone buy bar,
  reveal motion. Most of S1 is new values on existing choices, not new machinery.

## Design (mockup boards: Home · computer, Home · phone, Product page, Customize, Video, Samples, Phases)
Order (owner, 2026-11-09): **S0 → S1 → V1 → S2 → S3.**
- **S0 · Sample sets** (before S1, so its preview is real from day one): three sets chosen by `shop_settings.sells`
  (bags, footwear, accessories), each 12 product pieces (front, back, detail on one grey and one light), 6 lifestyle
  scenes and 2 loops. Product shots generated in one consistent studio setup (no people, brands or logos); lifestyle
  photos and loops from free-licence stock (Pexels or Unsplash), loops hosted on Frrata's own Mux environment once V1
  exists (posters until then). Every file has a row in `public/themes/samples/CREDITS.json` (source URL, licence,
  date, what was changed); a gate fails a sample file with no credit. The merchant's own pieces always come first;
  samples fill only what is empty, as today (`samples` in the manifest).
- **S1 · The theme**: manifest `signal` 2.x; pairing `schibsted` (Schibsted Grotesk, OFL, self-hosted like the others);
  header `float`; section label style `pill | plain | none` (new choice); card `tile`; products section layouts
  `tabs` (by collection, up to 5) and `rail` with a counter; the image-with-text section's `signal` scheme (the band);
  footer `photo`; product page: colour/compare tabs, the delivery date line, the trust row from settings.
- **V1 · Video foundation (Mux)**, also the base for reels later: the console asks our server for a Mux direct-upload
  URL (`asModule`/`asMember`, per member and per shop limits); the browser uploads straight to Mux (never through our
  functions); Mux's webhook (signature verified on the raw body, stored in `webhook_events` under our key, processed
  later, ADR-0006) marks the video ready; a per-shop `videos` table (Mux asset and playback ids, status, duration,
  aspect; grant, RLS, policy, tenancy.sql check). The shop plays a **plain muted `<video>`** of Mux's MP4 rendition with
  Mux's poster image: no player script on the shop (budget). One video per section; Replace and Remove (Remove deletes
  the Mux asset). Mux credentials: Production only, sealed in env, never in a preview (S1 of the last security review:
  previews share the database). Facts and prices: `frata-integrations` § Mux (checked 2026-11-09).
  **Decided from the research:** upload settings `video_quality: basic` (free encoding), `playback_policies: public`
  (a signed URL per view would break the shop's cache), `static_renditions: [highest]` (`mp4_support` is deprecated),
  `max_resolution_tier: 1080p`; the shop shows a loop only when its MP4 rendition is ready, not on `asset.ready`;
  **30 s cap**, checked on ready (Mux can't cap duration), longer ones refused and deleted; **no Mux Player** (in
  maintenance mode; ~900 KB) — a plain `<video>`, `stream.mux.com`/`image.mux.com` added to the shop's CSP; webhook
  `/api/webhooks/mux` keyed `mux:<envelope id>`, the processor GETs the asset rather than trusting event order; a
  merchant's Remove deletes our row first, then an outbox `mux.asset.delete` (404 = done); uploads go through the
  outbox's token bucket (Mux allows 20 POSTs a burst, 1/s). Previews use Mux's development environment and free test
  assets. **Setup (owner, 2026-11-09):** pay as you go; Production token in hand; webhook URL
  `https://frata.vercel.app/api/webhooks/mux`; env names `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`
  (Production, Sensitive) and a separate Development environment's set for Preview; signing keys unused (public playback). **Before launch (owner):** ask Mux in writing that hosting merchants' videos inside Frrata is allowed under
  their "non-sublicensable / no resell" terms, and where data is stored; add Mux to Frrata's sub-processors.
- **S2 · Story sections**: `spotlight`, `story_fan`, `statement`; Hero and Spotlight take a V1 loop.
- **S3 · Product stories**: per product up to six stories (photo, title, text, up to three numbered callouts), shown
  stacked under the gallery and as "1 / 6" slides; "Pair it with" (two pieces, added to the bag from the page).

## Design review
- **UI/UX**: shopper surface; every new section has empty (hidden), one, many, phone states in the mockup's spirit; the
  customizer adds three segmented choices and four library entries; signal colour reuses Look v4's readable-colour
  check (`brandColourProblem`); tabs are buttons with `aria-pressed`, the rail scrolls with keys, the fan is a list.
- **Tenancy**: V1 adds `videos` (per shop; Mux ids are not secrets but are scoped to the shop's rows); S1–S2 store nothing new (the theme layer is the shop's own row). S3 adds `product_stories` (tenant_id,
  product, position, photo, title, text, callouts jsonb capped) with grant, RLS, policy and a tenancy.sql check, and
  "pair it with" as a list of product ids checked against the shop's own products.
- **Modularity**: manifest in `domains/themes/catalogue/signal/`, choices in `types.ts`, renderers in
  `components/storefront/sections/`; product stories are core catalogue (`domains/catalogue`), read with the product.
- **SSOT/DRY**: the signal colour is the theme's accent token (one value); trust row reads the shop's settings
  (warranty only when the merchant writes one); the delivery line is the existing ships/arrives estimate.
- **YAGNI**: no store locator, no compare table across products, no chat button, no font upload (see Out of scope).
- **KISS**: S1 is a manifest plus a handful of new enum values the renderers already switch on.
- **Scalability / performance**: one more self-hosted font (≈ 25 kB woff2, one weight preloaded); the rail and tabs are
  server-rendered with CSS scroll (tabs swap with a small island, budget ≤ 2 kB); the shop page stays under its 120 kB
  script and 20 kB CSS budgets (`check:storefront-build`); S3 stories add to the product's cached entry (cap 6 × 1 kB).
- **Reliability**: V1's server calls to Mux (create upload, delete asset) go through `fetchWithTimeout`; an upload that
  never turns ready shows "Didn't work" after Mux's errored event or a timeout sweep; the webhook is idempotent.
- **Security**: Mux's webhook verified by its signature header before parsing, size-capped; the direct-upload URL is
  created only for the member's own shop, with its CORS origin set to the console host; story text and callouts render as text only; photos through the existing upload path; pair-it-with ids
  resolved inside the shop.
- **Motion and visuals**: entrance/reveal from the existing 2.0 choices; the fan uses the base duration and the
  standard easing; reduced motion shows the cards side by side, still.
- **Unit economics**: S1 and S3 none. **V1 costs Frrata** Mux storage and delivery (encoding is free on basic). At first-
  tier rates (2026-11-09), a shop with 10 loops of 15 s and 50,000 plays a month of one loop: storage ≈ $0.01, delivery ≈
  $12.50 at 1080p ($10 at 720p); the 100,000 free delivery minutes a month are for all of Frrata, not per shop. If every
  view loaded all 10 loops it would be 10× — so playback starts only in view and `preload="none"` is the main lever.
  Run `unit-economics-reviewer` on these figures with caps (30 s per video, one per section, poster
  first, `preload="none"` on phones, the smallest rendition that looks right); if the cost per shop is material, video
  is a Growth/Scale feature (like the GST app) rather than every plan. S0's sample loops are Frrata's own, few, fixed.
- **Blast radius**: new enum values on shared settings (header, card, labels) change no existing theme's defaults; the
  shop-look baselines gain Signal's pages; the customizer forms list the new choices only for themes that allow them.

## Out of scope (and what brings each back)
- Store locator (a shop with stores asks), compare table across products (merchants with spec-heavy ranges ask), chat
  button (Messages module ships its widget), custom font upload (a licensing path for merchant-owned fonts).

## Facts used
- Mux (direct uploads, webhooks, MP4 renditions, posters, pricing, limits, terms): `frata-integrations` § Mux, checked
  2026-11-09 (integration-researcher); unverified: max upload size, data residency, secret rotation, whether a loop's
  replays are billed again.
- Mokobara's platform, theme name and typeface: read from the live page's `window.Shopify.theme` and computed styles,
  2026-11-09.
- Schibsted Grotesk: open-source (SIL OFL), on Google Fonts; to be self-hosted like the current pairings.
