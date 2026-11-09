# Link previews that sell — research (checked 2026-11-09)

Current sources only; undated live primary pages are marked "live 2026-11-09". [U] = unverified.

## Today in the code
- Product: og:type `website`, og:image = the first photo as **WebP**, 1200 wide, **portrait (4:5)**, no height/alt, no
  `product:*` tags, no `twitter:card` (`src/app/s/[host]/(shop)/products/[handle]/page.tsx`). Home has no image;
  collections, lists, policies have no OG at all.
- Opening-soon shops serve `Disallow: /` — Twitterbot and Pinterestbot obey it (wanted).
- Metadata is in the first HTML because shop pages are force-static ISR. Next 15.5 streams metadata after `<head>` for
  UAs outside `htmlLimitedBots` (default list lacks TelegramBot, Pinterest, meta-externalagent); if a shop route turns
  dynamic, set `htmlLimitedBots` (it replaces the default list) [P, nextjs.org 2025-10-03 + canary source].

## Per platform
| Platform | Reads | Image | Limits | Refresh | Crawler | Source |
|---|---|---|---|---|---|---|
| WhatsApp (chat, Status) | og:title (no brand, ≤ 2 lines), og:description (~80 chars), og:url (undecorated), og:image absolute; `<head>` in the first **300 KB** of HTML | large preview if the image qualifies, else small | **< 600 KB** (drops reported near **300 KB** [S, 2026-03-05]), ≥ 300 px wide, ratio ≤ 4:1 | the sender's app crawls; no debugger; new image URL after edits | `WhatsApp/2.x` with the recipient's Accept-Language; no JS | [P, WhatsApp Link previews, 2026-05-21] |
| Facebook, Messenger, Threads | og:url/title/description/image, fb:app_id, og:type, og:locale; width/height render the first share | 1.91:1 | ≥ 600×315, **1200×630 recommended**, ≤ 8 MB; jpeg/gif/png | 24 h; Sharing Debugger re-scrapes; cached by image URL | `facebookexternalhit/1.1`; tags in the first 1 MB; follows 301/302 | [P, Meta webmasters pages, live 2026-11-09] |
| Instagram DMs | og via facebookexternalhit | 1.91:1 | as Facebook | — | — | [U] |
| Instagram link sticker / bio | a text label, not a card | — | — | — | — | [U] |
| X | `twitter:card=summary_large_image`, twitter:image:alt; falls back to og | ~1.91:1 | 5 MB; jpg/png/webp/gif | no validator; new URL | Twitterbot obeys robots | [U: cards docs gone from X's index] |
| Pinterest | Product Rich Pins: og:type=product, og:title, product:price:amount/currency (+ availability, brand, standard_amount, ≤ 6 images) or JSON-LD Product+Offer | 2:3 performs best [U] | — | syncs ≤ 24 h | Pinterestbot obeys robots; **only the main domain's robots.txt is read** | [P, Pinterest docs, live 2026-11-09] |
| Telegram | og | large card | — | @WebpageBot | TelegramBot | [U] |
| LinkedIn | og:title/image/description/url | 1.91:1 | ≥ 1200×627, ≤ 5 MB | Post Inspector | LinkedInBot | [P but > 3 years old] |
| iMessage | og:title (no site name), og:image ≥ 900 px wide, apple-touch-icon ≥ 108 px; **avoid text in images**; page ≤ 1 MB; no JS, server redirects only | large | — | — | — | [P, Apple TN3156, 2024-04-30, current doc] |
| Google Discover | og:image or schema image ≥ 1200 px wide, > 300k px, `max-image-preview:large`; no logos or text-heavy images | 16:9 crop | — | — | — | [P, 2026-03-09] |
| Slack | oEmbed → Twitter card → OG | — | — | ~30 min | ignores robots | [P, live] |

**Format: JPEG everywhere** (the only format every primary source accepts); never AVIF.

## Pinterest catalogs, Instagram, WhatsApp catalogue
- Pinterest catalogs: business account, claimed site, the tag, policies, a feed (id, title, description, link,
  image_link, price, availability, item_group_id). India availability [U].
- **Instagram product tags are available in India**: creators "Add products" on Reels (US, Brazil, India, Indonesia,
  Thailand) from 2026-03-24, feed posts and 26 markets by Oct 2026; products from a Meta commerce catalogue; checkout
  on the merchant's site [P, creators.instagram.com]. Brand self-tagging in India [U].
- WhatsApp catalogue messages (single, multi up to 30, carousel) come from a Meta catalogue [P, live]. Meta can build a
  catalogue from on-page product microdata with the Pixel; a scheduled feed is more reliable [P, live].

## Generated share images
- `next/og` ImageResponse: **PNG only**, flexbox, 500 KB bundle with fonts (ttf/otf/woff), Node runtime on Vercel,
  immutable 1-year cache (a change needs a new URL) [P, nextjs.org 2026-08-06, Vercel 2026-06-16].
- **Devanagari in Satori is broken** (satori#215 open, reports to Apr 2026). Options: no Hindi text on the image (Hindi
  in og:title/description, which the phone lays out); Takumi (`takumi-js` 2.20.0, JPEG/WebP output; Devanagari [U],
  needs a spike); sharp/Pango text [U on Vercel].
- Render once per (shop, page, content hash), serve immutable from the CDN; never take text or price from the query
  string; read through `src/lib/queries/` with the tenant from the host.

## UTM, short links, QR
- og:url and canonical always clean (from stored data); WhatsApp requires undecorated og:url; Google consolidates
  parameter variants by canonical [P, 2026-07-10] — so UTM on a shared link costs nothing.
- Share buttons: `utm_source=whatsapp|instagram|facebook|x|pinterest|telegram|qr`, `utm_medium=social|qr`.
- Short links on the shop's own host, one 301 hop (Apple follows server redirects only).

## og:image:alt
"A description of what is in the image (not a caption)" [P, ogp.me]. Product, colour, fabric — e.g. "Rust cotton
anarkali kurta with gold block print — Shop Name".

## Recommended tag set
Every page: title, description, clean canonical, og:url, og:site_name, og:locale (`en_IN`/`hi_IN`), og:title (no
brand), og:description (≤ 80 chars), og:image + type/width/height/alt, twitter:card `summary_large_image`,
`max-image-preview:large` on indexable pages.

| Page | og:type | Extra | Image |
|---|---|---|---|
| Product | product | product:price:amount (rupees from paise), :currency INR, :availability, :condition new, :brand, :retailer_item_id, :item_group_id; og:price:standard_amount on sale | product card |
| Collection | website | ItemList JSON-LD | collection grid |
| Home | website | Organization/WebSite JSON-LD | shop card |
| Lookbook | article | — | editorial |
| Policy | website | — | brand card |

Image: **1200×630 JPEG, sRGB, ~q80, key content in the centred 630×630 square, ≤ 250 KB target, 300 KB cap** (checked at
render and in CI). URL `/og/<kind>/<id>/<hash>.jpg`, hash over title, price, availability, image ids, shop name/logo
and template version; immutable. On publish or a price change, ask Meta to re-scrape (outbox; endpoint [U]).
Crawlers never challenged by the firewall; first byte < ~1 s.

## QA checklist
1. `curl -A` each crawler UA: 200, no challenge, every tag in raw `<head>`.
2. og:image: 200, image/jpeg, 1200×630, ≤ 300 KB, declared size matches.
3. og:url/canonical clean; a UTM link previews the same.
4. Opening-soon shop blocked by robots (wanted).
5. Price tags equal the shown price; no cost fields (ADR-0003; add a test, check-client-bundle does not cover metadata).
6. Sharing Debugger and Post Inspector clean.
7. Real phone: WhatsApp chat and Status large preview within 10 s; Instagram DM, iMessage, Telegram, X, Pinterest.
8. Price edit → new image URL, new card on a fresh share, old URL still serves.
9. Hindi shop: no Devanagari in image text unless a shaping spike passes.
10. Alt present and descriptive.
