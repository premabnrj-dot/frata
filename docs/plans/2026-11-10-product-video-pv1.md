# Plan: PV·1 — one video per product (a reel or a landscape film)
Status: building (console on main; shop next) · Date: 2026-11-10 · Spec: docs/specs/2026-11-09-product-video.md (approved: owner,
2026-11-10, "execute") · Mockup: https://claude.ai/artifact/Gs8ym9wnZvLxL2HgV71hbk · Builds on V1
(docs/plans/2026-11-09-video-v1.md) · Facts: frata-integrations § Mux

## Goal
Ranked problems 2 (fit returns) and 5 (premium storefront). A merchant uploads a phone video for a product. Shoppers
see a tile second in the gallery and a "See it on a model · 0:24" button beside the sizes, and a viewer with
Add to bag. Measured per product, 30 days before and after: add-to-bag rate, size-return share, and viewer opens per
product view.

## Owner decisions (2026-11-10)
- Approved PV·1 as specified.
- Hosting merchants' videos on Mux is not resale (owner, 10 Nov). Recorded in frata-integrations § Mux as the owner's
  position; Mux has not confirmed it.

## What changes from the spec, found in the code (2026-11-10)
1. **Look publishes would delete product videos.** `releaseUnusedVideos` (queries/videos.ts) removes every video no
   look references. Product videos must never be candidates: the release looks at `use = 'loop'` rows only.
2. **Caps per use.** V1's caps (10 a day, 30 a month, 20 live) cover the whole shop, so product videos would eat the
   Look's 20. Each use counts its own rows (numbers below, pending the unit-economics review).
3. **Upload size:** 250 MB, not 500.
   - V1's upload is one XHR PUT with no resume.
   - A 60 s phone video at 1080p is about 60–130 MB (iPhone figures, secondary source, 2026-03-08).
   - Resumable chunked upload (Content-Range PUTs, UpChunk's protocol) waits until it can be verified on real Mux.
4. **The 720p file can't be made from a smaller source** (frata-integrations § Mux). A product video under 720p fails
   with "Choose a video of at least 720p" (Google's minimum too).
5. **No position column.** The video tile is second, after the cover photo, in PV·1; a position comes with PV·3's
   three videos.
6. **The console shows a Video card under Photos** in today's editor; E·1's merged "Photos and video" card comes with
   E·1.

## Numbers (pending unit-economics review)
| | Loop (V1, unchanged) | Product (PV·1) |
|---|---|---|
| Length | ≤ 15 s | 6–60 s |
| File | ≤ 64 MB | ≤ 250 MB |
| Mux upload timeout | 900 s | 3600 s |
| "Didn't work" if not ready after | timeout + 10 min | timeout + 10 min |
| MP4 rendition | `highest` | `720p` (sized: paid prep, about $0.008/min) |
| Uploads started, per shop | 10 a day (trial 3), 30 a month | 20 a day (trial 5), 100 a month |
| Live (pending or ready) | 20 | 200 (one per product) |

## Tasks (each: its verify command; `impact-reviewer` on its diff before its commit)

### PV1-0 The regression net, first
- Unit tests, red before the code:
  - `src/domains/video/__tests__/state.test.ts`: limits per use; product `too_short`, `too_long`, `too_small`;
    `uploadProblem` per use.
  - `src/lib/video/__tests__/mux.test.ts`: the upload settings per use; `parseAsset` reports each rendition's status
    (`720p` ready, skipped).
- e2e `e2e/flows/67-product-video.mjs`:
  1. The owner adds a video to Chanderi kurta set (the fake Mux makes a 720p rendition). The card says Ready with
     shape and length; a cover frame and the button words are chosen.
  2. The shop shows the tile second and the button. A tap opens the viewer, the `<video>` source is the 720p MP4,
     Add to bag works from the viewer, and Escape closes and returns focus.
  3. A Look publish leaves the product video alone (the fake's deleted list stays empty).
  4. Remove: the tile goes and the asset is deleted.
  5. A file marked `XLONG` (70 s) says too long and is deleted; `SMALL` (a skipped 720p) says at least 720p.
- `e2e/fakes/mux.mjs`: honours the requested rendition (`720p.mp4`), plus the `XLONG` and `SMALL` markers.
- Verify: `npx vitest run src/domains/video src/lib/video` red; then `npm run e2e -- --only video,product-video` (66
  green, 67 red until built).

### PV1-1 Data — `drizzle/0089_product_videos.sql` (+ access)
- **`videos.use`**: `text not null default 'loop'`, check `in ('loop','product')`.
  - `frata_app` gets insert on `use` (0081 grants insert by column: `tenant_id, mux_env, created_by`).
- **`product_videos`**:
  - Columns: `tenant_id`, `product_id`, `video_id`, `poster_ms int not null default 1000` (check 0..60000),
    `button text not null default 'model'` (check `in ('model','wear','none')`), `created_at`.
  - Keys: PK `(tenant_id, product_id)`; unique `(tenant_id, video_id)`.
  - FKs `(tenant_id, product_id) → products` (cascade) and `(tenant_id, video_id) → videos`.
  - A trigger refuses a `video_id` whose `use` isn't `product`.
  - Access: RLS on; `frata_app` select, insert, update(poster_ms, button) and delete, own tenant; `frata_admin`
    select; revoked from anon, authenticated and service_role.
- `scripts/verify/tenancy.sql`: another shop can't read, link, or move a link to its own video.
- Schema mirrored in `schema-catalogue.ts` (`productVideos`) and `schema-themes.ts` (`videos.use`).
- Verify: `npm run db:generate` (snapshot); `npm test`; `npm run verify:tenancy` on a throwaway Postgres.

### PV1-2 Pipeline (pure first)
- `src/domains/video/state.ts`:
  - `VIDEO_USES` and limits per use (table above).
  - `videoState(v, now, use)`: the not-ready window is the use's; failures `too_long | too_short | too_small |
    didnt_work`.
  - `uploadProblem(type, size, use)`.
- `src/lib/video/mux.ts`:
  - `createUpload(videoId, origin, use)`: the use's settings and timeout. `UPLOAD_SETTINGS` becomes a function of
    use; loops are byte-for-byte unchanged.
  - `parseAsset` returns `renditions: Record<string, 'ready' | 'skipped' | 'errored' | 'preparing'>`, plus
    `mp4Ready(use)`.
- `src/lib/video/process.ts`:
  - Cap by the row's use.
  - Product: under 6 s → `too_short`; `720p` skipped → `too_small` (both delete the asset).
  - `mp4_ready_at` once the use's rendition is ready.
  - Refresh `catalogue` (the product's entry) when a product video turns playable or stops; `videos` for loops, as
    today.
- `src/lib/queries/videos.ts`:
  - `startVideo(…, use)` counts caps over its use's rows only.
  - `releaseUnusedVideos` and `referenced` consider `use = 'loop'` only.
  - New, in the caller's transaction: `productVideoFor(tx, tenantId, productId)`,
    `linkProductVideo(tx, tenantId, productId, videoId)`, and
    `unlinkProductVideo(tx, tenantId, productId, now)` (removes the row and queues the Mux delete).
- Verify: the unit tests green; `npm test`; `npm run typecheck`.

### PV1-3 Console
- `src/app/(console)/console/products/video-actions.ts` (`ANY_MEMBER`, as photos; never in a support visit):
  - **start** `{productId, contentType, size}`: refused if the product already has a video ("One video per product ·
    Replace it"). The row (`use = 'product'`) and the link are committed in one transaction under the shop's lock
    (ADR-0008), then Mux.
  - **cancel**: removes the row, unlinks, queues `mux.upload.cancel`.
  - **remove**: unlinks and queues the delete.
  - **set** `{productId, posterMs, button}`.
  - **status**: reuses `videoStatusFor`, with `use` and `width × height`.
  - The limits: `LIMITS.videoStartMember` and `videoStartAll`, fail closed.
- `products/_components/video-panel.tsx`, a Video card under Photos:
  - The tile, and the states Uploading (progress, Cancel), Getting it ready, Ready, Didn't work (too long, too short,
    under 720p), with Choose another.
  - Ready shows shape (Reel 9:16, Film 16:9, Square), length, and a cover-frame strip (eight Mux thumbnails across
    the length).
  - The button words (See it on a model · How to wear · None), Replace (confirm, then remove and start), and Remove
    (confirm).
  - Status is polled with V1's backoff.
- `productForEdit` carries the link and its video row.
- Verify: `npm test` (check:actions, size); 67's console steps green.

### PV1-4 Shop
- `coreProduct` (storefront.ts) adds `video: { playbackId, width, height, durationMs, posterMs, button } | null`
  (playable product rows only; playback id shape-checked). The cache key becomes `product-v3`; the preview reads it
  too.
- `buy-box.tsx`:
  - **The tile:** a `<button>`, second in the gallery, in every gallery kind. It shows the poster at the gallery's
    width (Mux thumbnail at `posterMs`, lazy, `decoding="async"`), a play mark, the length in mono, and
    "Play video, 0:24" as its name.
  - **The button** "See it on a model · 0:24" (or "How to wear") beside the model line, unless `button = 'none'`.
- **`video-viewer.tsx`** (client, `next/dynamic`, loaded on the first tap):
  - a modal `<dialog>`, full screen on phones and centred on computers, and a history entry (Back closes, like
    SizeGuide);
  - `<video playsInline src=…/720p.mp4 poster>` started by the tap with sound;
  - Pause, Mute and Close buttons, labelled; Escape closes and returns focus to what opened it;
  - the title, price, the size chips (BuyBox's own state) and Add to bag.
- Shop words: `playVideo`, `seeOnModel`, `howToWear`, `closeVideo`, `pause`, `play`, `mute`, `unmute` in English and
  Hindi (the Hindi waits for a fluent reader before a Hindi shop goes live, as today).
- Budgets: the shop's CSS ≤ 22 kB (no new arbitrary classes); the product page's first-load JS within its headroom
  (the viewer is a separate chunk); the product HTML/RSC bytes before and after, written down.
- Verify: `npm run build` (postbuild budgets); `npm run e2e -- --only product-video,checkout,ux,speed`.

### PV1-5 Document and close
- Spec status active, then built.
- frata-design-language: the product video rule (tile second, never the cover; no autoplay; the viewer).
- frata-integrations § Mux: the 720p sized rendition for products, the owner's resale position, and the
  "unverified until the first real upload" list.
- Plan status done.

## Reviews (rule 3), 2026-11-10: what changed in the plan
Each finding is fixed in the plan, or listed under "For the owner".

**Cost bound (unit economics BLOCKER; security HIGH-1).**
- The problem: a 250 MB file of a near-still picture can run about 11 h. Its paid 720p prep would be spent before the
  60 s check.
- Product uploads ask Mux for NO static rendition.
- When the asset is ready, it must pass all of:
  - 6–60 s long;
  - a short side of at least 720;
  - Mux-ready.
- Then the outbox `mux.rendition.create` adds the 720p MP4. The endpoint is being verified (integration-researcher).
  Until it is, the fake implements Mux's documented shape.
- The browser reads the file's length before uploading and refuses outside 6–60 s; the server still checks on ready.
- Caps:
  - trial 5 a day and 20 a month; paid 20 a day and 100 a month; 200 live;
  - per shop at most 5 an hour;
  - three failures (too long, too short, too small) in a day stop that shop's uploads until tomorrow.
- The platform limit gets a separate key per use, so product uploads never use up the Look's.

**Kill switch (unit economics; security LOW-3).**
- Product video is a module, `product_video`: core (in every plan), status now. The shop switches it on in Apps.
- Admin › Modules can pause it for everyone (existing), and every write and the shop's tile honour the module.
- A monthly delivered-minutes budget (40 min per delivered order, floor 5,000) comes before open sign-up. It needs
  Mux's per-asset usage API verified first, so it is listed under "For the owner".

**Lifecycle (architecture H1, H2, M5; tenancy LOW; security MED-3).**
- Unlink always goes through `removeVideo` (sets `removed_at`, queues the delete or cancel). The delete sender refuses
  a row that isn't removed or failed.
- `product_videos → products` is `on delete no action`, so a product can't silently drop its video (a tenant delete
  still cascades).
- `releaseUnusedVideos` also releases a product video with no link that is older than 2 h, and a timed-out row that
  holds an asset id.
- Replace is one start with `replaces`: caps checked first, then in one transaction the old video is removed and the
  new row and link are written.
- A link to a failed video never blocks Choose another; start replaces it.

**Uses never cross (architecture M8; tenancy LOW; security MED-2).**
- Every product action takes `productId` only, and resolves the video through the link joined to `videos` where
  `use = 'product'`.
- V1's cancel and status actions, `cleanVideos`, `playableVideos` and `releaseUnusedVideos` touch `use = 'loop'` only.
- `use` is required in `ROW` and on `VideoRow`, read everywhere.

**Data (tenancy HIGH + MEDIUMs; architecture M9).**
- `videos` gets `unique (tenant_id, id)`, then the composite FK.
- The trigger: SECURITY INVOKER, `search_path ''`, on insert or update of `video_id, tenant_id`; execute revoked.
- `frata_app` gets insert only on `use`.
- No `frata_admin` grant.
- The proof catches each case by its own code: `foreign_key_violation`, `check_violation`, `insufficient_privilege`.
  It also checks the FKs and the policy in the catalog.
- `npm run verify:tenancy`: all 64 checks passed (2026-11-10).

**Shop (architecture H4, M6, M7, M12, M13; LOW).**
- The product page's script has no room (120.5 of 121 kB): split the island first. Speed review: task PV1-4a.
- The viewer:
  - has its own sizes and message;
  - Add to bag closes it (`history.back()`), then opens the bag;
  - its history entry shares one hook with SizeGuide;
  - rule 27 in frata-design-language records the exception.
- The chunk preloads on pointerdown and when the tile comes into view. On `NotAllowedError` (iOS) the viewer shows
  Play.
- Reduced motion fades; the viewer is a `data-store-drawer`; mute is remembered for the session.
- A pure `mediaList(photos, video)` in `src/domains/catalogue/` gives the gallery's order (video second, never the
  cover, none when there are no photos), the counter and the thumbnail strip.
- The video is left-joined into `coreProduct`'s first select; "playable" is decided by `videoState()`.

**Cache (architecture M10; security LOW-1).** Start, replace, remove, set and the processor refresh `catalogue` (the
product entry's tag; written down as a choice: bounded by uploads, never by shoppers).

**Console (architecture M12).** One shared `useVideoUpload` hook (upload, poll, cancel) used by `video-field.tsx` and
`video-panel.tsx`; `clock()` replaces `secs`.

**Speed (speed review, measured before on a 602-product seed: product page JS 120.6 of 121 kB, shop CSS 15.3 of
15.9 kB, cold product page 27 queries in 5 transactions, 232 ms cold and 12 ms warm TTFB, HTML 55.5 kB, RSC 26.4 kB).**
- **PV1-4a comes first** and frees at least 1.5 kB of the product page's script, measured with
  `SHOW_BUDGETS=1 npm run build`.
  - The tile's markup is drawn on the server as a slot (as `belowGallery`); only the open handler is client code.
  - `SizeGuide` loads through `next/dynamic`.
  - The budget is written as "≤ 121 kB the gate's way".
- **Cache.** A product video purges its product's own tag, `shop:{t}:product:{handle}` (as `reviews:product`), never
  the whole catalogue (its 861 kB entry, best sellers, 602 pages).
  - From the processor's write transaction (the handle is read inside it), and from set, remove, cancel and replace at
    commit.
  - Remove purges before `drainSoon` deletes the asset.
- **CSS.** The viewer reuses SizeGuide's sheet and dialog classes and adds no arbitrary values; the CSS figure is
  measured before and after.
- **The tile:**
  - only when the product has at least one photo, so it is never the LCP;
  - `fetchPriority="low"`, a fixed 4:5 box, a Mux `srcset` with `fit_mode=smartcrop`;
  - never a preconnect or preload of Mux hosts;
  - a 56 px Mux thumbnail in thumbs and rail layouts.
- **Console polling** starts after the PUT finishes and stops at the use's window.
- **Measured in the commit:**
  - JS, CSS, HTML and RSC with a video;
  - the `product-v3` entry size and cold statements;
  - EXPLAIN of the video read, the cap counts and the release;
  - the viewer chunk's size and first-tap load on throttled 4G;
  - the ISR tags after a video turns playable.

**For the owner (accept or decide):**
1. **Delivered-minutes budget per shop.** It comes before open sign-up, not in PV·1. Until then: a Mux spend alert
   (an owner step in Mux's dashboard), plus Admin › Modules pause.
2. **An Admin takedown** of one shop's product video (security MED-4). Proposed for PV·1b. Until then, pausing the
   module hides every product video.
3. **Unverified until the first real upload:**
   - adding a rendition to an existing asset;
   - whether "720p" means the short side of a reel;
   - whether prep is billed on an asset deleted at ready;
   - whether an MP4 fetch is billed for the whole file;
   - sound on the first tap on iOS.
4. **Mux's position on downloads of the public MP4.** Its terms forbid letting users permanently download content.
   Owner's call: write to Mux, or accept.

## Where the build stopped (2026-11-10, owner: "stop at a point, we'll resume later")
**Done and committed:**
- Reviews (all five, plus the Mux recheck), folded in above.
- PV1-0: the unit tests (green) and e2e `68-product-video.mjs`, red until the console and shop exist. The fake Mux
  still makes the rendition named at upload. It needs the add-rendition endpoint
  (`POST /video/v1/assets/{id}/static-renditions`) and its `static_rendition.*` hooks, routed by `asset_id`. The
  flow's first step must expect no `static_renditions` at upload, and one create-rendition call after ready.
- PV1-1: drizzle 0089/0090, the `product_video` module key, `npm run verify:tenancy` (64 checks).
  **Not applied to production.**
- PV1-2:
  - `state.ts` and `mux.ts` per use: a product uploads with no MP4; `createRendition` (verified 2026-11-10).
  - The processor: 6–60 s, short side ≥ 720, then outbox `mux.rendition.create`; a skipped rendition is too small.
  - The sender `sendRenditionCreate`, registered in the drain.
  - `queries/videos.ts`:
    - per-use caps (`PRODUCT_CAPS`);
    - `productVideoFor`, `linkProductVideo`, `unlinkProductVideo` (through `removeVideo`);
    - `releaseProductVideos`, the net run at each product start;
    - loop-only release, `cleanVideos` and `playableVideos`.
- Icons `video` and `play`; the Apps icon for the module.

**Next, in order:**
1. **The fake Mux:** the add-rendition endpoint and its hooks; update step 1 of e2e 68.
2. **Pipeline leftovers:**
   - V1's look cancel and status actions refuse non-loop rows;
   - the processor purges the product's own tag (`shop:{t}:product:{handle}`, the handle read in its write
     transaction) instead of `catalogue`;
   - `shopCached` gets that tag on `product-v3`;
   - frata-integrations § Mux takes the recheck's lines (version 1.21.0).
3. **PV1-3, the console:**
   - `products/video-actions.ts` (start with `replaces`, cancel, remove, set; productId only; support refused; module
     on; refresh the product tag);
   - the shared `useVideoUpload` hook (polls only after the PUT finishes; `clock()` replaces `secs`);
   - `video-panel.tsx` (states, cover-frame strip, button words, Replace, Remove);
   - `productForEdit` carries the link;
   - the browser reads the length before uploading.
4. **PV1-4a, the island split** (≥ 1.5 kB freed, measured with `SHOW_BUDGETS=1 npm run build`), then **PV1-4, the
   shop:**
   - `mediaList` in `src/domains/catalogue/`;
   - `coreProduct` left-joins the video (`product-v3`);
   - the server-drawn tile slot and "See it on a model";
   - `video-viewer.tsx` via `import()` on tap and preload on pointerdown;
   - its own sizes and message; Add to bag closes it, then opens the bag;
   - the shop words in English and Hindi; rule 27's exception.
5. **PV1-5:**
   - full e2e;
   - `impact-reviewer` on the diff;
   - spec status active;
   - frata-design-language;
   - the owner's go-ahead before production migrations and `main`.

## Progress, 2026-11-10 (owner: "continue and push after significant work that can be tested"; "merge the work on main")
- Done since the stop:
  - the fake Mux's add-rendition endpoint;
  - caps by plan (`PRODUCT_VIDEO_CAPS`, owner: "keep generous monthly cap plan wise");
  - the per-product cache tag; Look actions loop-only;
  - **PV1-3, the console**: `products/video-actions.ts`, `video-panel.tsx` under Photos, `src/lib/video/product-view.ts`
    (every product-video Mux URL built in one place).
  - e2e 68 now covers the console only. The shop step returns with PV1-4 (its text is in 8a732d3's copy of the flow).
- The browser refuses a file over a minute before uploading (the cost is in the file). Too short is left to the
  server, because a short file is cheap.
- The Product video module is core and is switched on in Apps. Until then, the card links there.

## Signed playback: owner decision needed (research 2026-11-10, frata-integrations § Mux, Signed playback)
The owner said "we're not letting people download". What Mux allows:
- **Signed URLs** stop a link working after it expires. They do not stop a shopper saving the MP4 while the token
  is valid. Only DRM stops capture, and DRM cannot serve MP4s (it needs HLS and a player library: out of PV·1's
  budget).
- **Each fresh token is a new URL**, so the browser cache misses and Mux bills the delivery again. The shop's cached
  HTML would need a token longer than its cache life, or a token fetched on tap.
- What PV·1 can do without DRM:
  - `controlsList="nodownload"`, no picture-in-picture, no context menu on the player;
  - signed, short-lived MP4 URLs fetched when the viewer opens (a shop route), so a copied link stops working;
  - a signed poster with a long token (a still frame, cheap).
- The proposal goes to the owner with PV1-4, before the shop serves any product video. Videos uploaded before then
  get a signed playback id added and their public id deleted (Mux: add signed first, then delete public).

## Impact and security reviews of the console chunk (2026-11-10)
- Fixed:
  - refusals come before the insert (MED-1);
  - set skips unchanged values;
  - module off cancels queued 720p prep;
  - separate limit keys per use;
  - the card says "Not on your shop yet" until PV1-4 (`ON_SHOP`);
  - a failed read never offers Add;
  - the nearest frame shows as the cover.
- With PV1-4:
  - an int test over `queries/videos.ts` (caps, release, use filters) and a unit test of the processor's `one()`;
  - `releaseProductVideos` from the outbox cron, not only at a start;
  - what archiving a product does to its video;
  - split `storefront.ts` (388 of 400 lines) before the product entry gains the video;
  - dead exports (`VIDEO_USES`, `NOT_READY_AFTER_MS`, `MAX_BYTES`, `UPLOAD_TIMEOUT_S`);
  - `minShortSide` in `USE_LIMITS`;
  - one `consoleOrigin`.
