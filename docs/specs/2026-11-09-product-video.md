# Product video: a reel or a landscape film on each product
Status: draft · Date: 2026-11-09 · Mockup: https://claude.ai/artifact/Gs8ym9wnZvLxL2HgV71hbk (`docs/mockups/2026-11-09-product-video.html`) · Approved: owner, 2026-11-10 ("execute") · Status: building (PV·1)

## Goal
Ranked problems 2 (size and fit returns) and 5 (a premium-looking storefront); also 1 (COD/RTO), since a parcel refused
at the door is often a piece that looked different from what arrived. Measures, per product, comparing 30 days before
the video with 30 days after:
- add-to-bag rate on the product page;
- the size-return share for products with video against those without;
- viewer opens per product view, and how much of each video is watched (from the player's own events).

## Job
A fashion merchant uploads the video they already shot on their phone (a 9:16 reel or a 16:9 film), and a shopper
deciding on a size sees the piece move on a real person before buying.

## Use cases (in the order they matter)
1. **See it on a person (fit):** the model turns once and walks. Shown with the Fit section's "model 5 ft 6 in, wears S".
2. **See how it moves (fabric):** sheen, sheerness, flare.
   - Current evidence: a video of hands handling the cloth improves how accurately shoppers judge stiffness and stretch
     (Creusen, Shen and Wijntjes, *IJRDM* 53(13), online 2025-09-24).
   - No current controlled study ties product video to conversion or returns; vendor numbers are vendor claims.
3. **Close-up:** zari, embroidery, hand-block print.
4. **Reels already made:** uploaded as the file.
   - Instagram's API leaves out `media_url` for videos with licensed audio, the owner's own included (changelog,
     2026-07-30).
   - Most fashion reels use trending music, so import cannot be the main path.
5. **How to wear or drape:** a saree drape, three ways with one dupatta.

## Showcase strategy
| Place | Shopper sees | Phase |
|---|---|---|
| Product gallery | A tile, second by default and never the cover: the chosen frame, a play button, the length. Nothing downloads until it is tapped | PV·1 |
| Beside the sizes | "See it on a model · 0:24" (or "How to wear"), the merchant's choice; opens the viewer | PV·1 |
| Viewer | Full screen on a phone (a reel fills it; a film sits across the middle), a dialog beside the buy box on a computer. Sound on, since the tap asked for it; mute, pause, captions (PV·3), close or swipe down. Price, sizes and Add to bag stay under it | PV·1 |
| Home and collections | A "Watch and shop" Look section: reels from the shop's products. Each tile moves as Mux's animated preview image (≤ 10 s, ≤ 640 px, an image, not a video stream); a tap opens the viewer, swipe up for the next product | PV·2 |
| Product cards | A video mark; on a computer, hover plays the preview image | PV·2 |
| Google and Meta | The same MP4 as the product's video: Google `video_link` (6–240 s, ≥ 720p, 9:16, 16:9 or 1:1, free listings and Demand Gen); Meta catalog `video[0].url` (≤ 200 MB) | PV·3 |

Sources:
- Shopify Dawn 16.1.1 and Horizon 4.4.0 source (2026-11-02/03): gallery video is click-to-play, `preload: none`, no
  gallery autoplay.
- web.dev video performance (2026-04-02) and the video pattern (2026-07-02): a poster first, no autoplay, `preload="none"`.
- MDN autoplay (2026-09-10): sound only after a gesture.
- Google Merchant `video_link` (help and Merchant API, 2026-04-14 / 2026-06-30 / 2026-11-09).
- Meta Catalog Product Video FAQ (undated, read 2026-11-09).

## Decisions (PV·1)
- **One video per product**, reel or film; the shape is read from the file (width × height), never asked.
  Up to 3, and a video per colour, in PV·3.
- **Accepted files:**
  - MP4 or MOV from the camera roll, up to 500 MB, 6–60 s.
  - A longer video gets "1:42 is too long · up to 60 s" and its asset is deleted (V1's too-long path).
  - The upload is resumable (Mux direct upload, UpChunk), with a progress bar and Cancel.
- **Delivery:** one 720p MP4 static rendition per product video.
  - It serves the shop and, later, the feeds; Google needs ≥ 720p.
  - About 2 Mbit/s: a 24 s reel is about 6 MB, fetched only after a tap.
  - No `highest` rendition: Mux refuses `highest` mixed with sized renditions (frata-integrations § Mux).
  - No HLS in PV·1: an MP4 plays everywhere with no player library, and the product page has 3 kB of JS headroom.
    Revisit if watch data shows long videos stalling on 4G.
- **Poster:**
  - The merchant picks a frame from a strip of eight; Mux's thumbnail at that time, at the gallery's width.
  - The poster is an image and lazy-loads, except when the video tile is the first visible slide (it never is, since
    the cover is always a photo).
- **No autoplay of product video anywhere.** PV·2's moving tiles are images.
- With `Save-Data`, the preview images stay still.
- **Player:** the plain `<video>` (as the Look's loops), with our own controls in the viewer:
  - pause is always there (WCAG 2.2.2);
  - the mute choice is remembered for the session;
  - Escape and swipe-down close;
  - focus returns to the tile.
- **Console:** Photos becomes "Photos and video".
  - A tile shows the video's frame and length.
  - Its details: shape, length, where it shows, cover frame, button words (See it on a model · How to wear · None),
    Replace and Remove.
  - States follow V1: Uploading (progress, Cancel), Getting it ready, Ready, Didn't work (too long, too short, not a
    video), and "One video per product · Replace it".
- **Caps:** V1's upload caps per shop and platform (10 a day, 30 a month, trial 3 a day, hourly platform cap) also
  apply here; live product videos per plan are set by the unit-economics review.

## Data
- `videos` (V1) stays the one record of a Mux asset. Its lifecycle, outbox deletes and webhook routing are unchanged.
- A new table **`product_videos`**: `tenant_id`, `product_id`, `video_id`, `position`, `poster_ms`, `button`
  (`model` | `wear` | `none`), `created_at`.
  - Composite FKs to products and videos on `(tenant_id, …)`.
  - Unique on `(tenant_id, product_id)` in PV·1; it becomes unique on position in PV·3.
  - RLS, grant and policy in the same migration, plus a row in `scripts/verify/tenancy.sql`.
- Removing a product video, or deleting the product, queues `mux.asset.delete` in the same transaction (V1's sender).
- Product videos ask Mux for the 720p rendition. `src/lib/video/mux.ts` takes a `use: 'loop' | 'product'`: loops
  keep `highest`, products get `720p`. The duration cap comes from the use (15 s or 60 s).
- The shop reads only ready videos with a ready MP4 (`mp4_ready_at`), through the product's cached entry: playback id
  (checked shape), width, height, duration, poster time, position, button. The product's cache tag is refreshed when
  the video turns playable or is removed.

## Design review
- **UI/UX:**
  - Shopper: one primary action stays Add to bag; the viewer keeps it in reach.
  - Merchant: one Add tile for photos and video.
  - States:
    - empty: no tile, no button;
    - uploading, getting ready, didn't work;
    - ready;
    - a second video refused;
    - phone and computer;
    - reduced motion: the viewer opens with a fade, the preview images stay still.
  - Keyboard: the tile is a button ("Play video, 0:24"); the viewer is a dialog with labelled controls.
- **Tenancy:** `product_videos` carries the tenant in every key; the save action takes the product from the shop's own
  rows; a video id from another shop is refused (as `cleanVideos`). Run `tenancy-auditor` on the plan.
- **Modularity:**
  - The video state stays in `src/domains/video/state.ts`, gaining the duration cap per use.
  - The product's media list (photos and video in order) is a pure function in `src/domains/catalogue/`.
  - The viewer is one client island, loaded with `next/dynamic` on the first tap.
- **SSOT / DRY:**
  - Shape, length and readiness are derived from the `videos` row, never copied.
  - The "model … wears S" line is read from the product's Fit fields.
- **YAGNI:** no HLS, captions, Instagram import, or more than one video until the data asks (signals: stalls on 4G;
  merchants asking for captions; reels with no licensed music being the common case; merchants asking for a second
  video).
- **KISS:** reuses V1 end to end; adds one link table and a rendition choice.
- **Performance:**
  - The product page's first paint is unchanged (the cover photo).
  - The tile's poster is a lazy image.
  - The viewer's JS loads on tap.
  - Measured by `speed-reviewer`: the product page's HTML and JS bytes before and after, and LCP on a slow phone.
- **Reliability:** Mux calls are rows first (ADR-0008 for uploads, the outbox for deletes); a stalled upload reads as
  "Didn't work" after the timeout (V1's derived state).
- **Security:**
  - Playback ids are public by design (the URL is the video).
  - The upload URL is checked to be `https://` before it reaches the browser.
  - The webhook stays as V1.
  - Merchant-chosen button words are fixed values, not free text.
- **Motion and visuals:** the viewer enters on the sheet spring on a phone (rule 25a) and as the standard dialog on a
  computer; the progress bar is linear; nothing autoplays.
- **Unit economics** (Mux list prices read 2026-11-09):
  - Example shop: 50 products with a 30 s video, 20,000 product views a month, 1 in 10 opening the video and watching
    20 s. That costs about $0.08 storage, $0.02 MP4 storage and $0.53 delivery a month, plus $0.004 per new video.
  - 500 such shops: about 333,000 delivered minutes a month, about $190 after Mux's 100,000 free minutes.
  - `unit-economics-reviewer` sets live videos per plan and a delivered-minutes budget before PV·1 ships.
  - Mux's terms on hosting merchants' videos ("resell") are to be confirmed with Mux in writing (frata-integrations
    § Mux).
- **Blast radius:**
  - `product-view.tsx`, `buy-box.tsx`, the product's cached entry, the console Photos panel, `src/lib/video/*`
    (rendition per use).
  - e2e: `66-video` (loops unchanged), and a new flow for product video (upload with the Mux fake, ready, tile,
    viewer, remove) written first.

## Out of scope
- Autoplaying product video (signal: none; the evidence is against it).
- Live shopping.
- Shopper-made review videos (signal: Reviews R2).
- WhatsApp catalog video (send the product link).
- A paid shoppable-video vendor (their main draw, reel import, is weakened by Meta's July 2026 change).

## Facts used
From the research of 2026-11-09 (sources and dates as above):
- Shopify Dawn and Horizon source: the theme store versions of 2026-11-02 and 2026-11-03.
- web.dev (2026-04-02, 2026-07-02); MDN autoplay (2026-09-10), `prefers-reduced-data` (2026-06-16), Save-Data
  (2025-12-17).
- Google Merchant `video_link` (help, and the Merchant API reference updated 2026-11-09); Google video SEO
  (2025-12-18); VideoObject (2026-09-24).
- Meta Catalog Product Video FAQ (undated, read 2026-11-09).
- Instagram changelog (2026-07-30).
- Creusen et al. (2025-09-24).
- Vendor prices (Tolstoy, Firework, Videowise, Quinn, Whatmore): live, read 2026-11-09.
- Mux pricing and renditions (read 2026-11-09).
- Unverified: product-page video practice at Myntra, Ajio, Nykaa Fashion, Zara and H&M (their pages refused the
  fetch).
