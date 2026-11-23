# frata-integrations — Domains, video, infrastructure and Vercel

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Domains
- Mux
- Infrastructure usage
- Vercel platform

## Domains (Vercel for Platforms) — checked 2026-11-08 (research `docs/research/2026-11-08-shop-addresses.md`)

- Wildcard `*.frrata.shop` needs Vercel nameservers or `_acme-challenge` NS delegation (DNS-01); the apex and www are
  added separately; one level per certificate [V, Vercel docs 2026-09-16/18]. The registrar does not matter, the
  nameservers do (frrata.shop bought at Hostinger 2026-11-08 → NS `ns1/ns2.vercel-dns.com`).
- Vercel prices (2026-11-08): frrata.shop $2.99 then $38.39/yr; frrata.com $12.03/yr; .shop is not free-with-Pro [V].
- API: `POST /v10/projects/{id}/domains` (redirect, 301/302/307/308), `POST /v9/…/{d}/verify`, `DELETE /v9/…/{d}`,
  `GET /v6/domains/{d}/config` → misconfigured, recommendedIPv4/CNAME by rank [V, REST reference read 2026-11-08].
  409 = on another Vercel project / not allowed.
- `_vercel` TXT only when another Vercel account uses the domain; a new value on re-add. Frrata adds its own TXT proof.
- A record and www CNAME values are per project (76.76.21.21 or 216.198.79.1; `*.vercel-dns-017.com`); no IPv6;
  www recommended as primary [V 2026-09-18].
- Domains a project: Hobby 50, Pro "Unlimited" (soft 100,000) [V, plans/hobby 2026-09-14, limits 2026-09-16,
  multi-tenant limits 2026-09-08]; whether the wildcard, apex, www and vercel.app count toward the 50 [U]. REST limits
  name no plan: domain add/update/remove 100/60 s, verify 100/60 s, project domains read 500/60 s, DNS config 500/60 s
  [V limits 2026-09-16; "same on Hobby" U]. Conflict: multi-tenant limits says add 100/h, verify 50/h, remove 100/h per
  team [V 2026-09-08] — size batches to the per-hour numbers until Vercel confirms (checked 2026-11-09).
- Hobby cron (`crons`, now "a legacy feature"): 100 a project, once a day, ±59 min; more frequent fails the deploy [V,
  cron-jobs/usage-and-pricing 2026-07-15]. **Schedules** (public beta 2026-11-05, `schedules` in vercel.json): Hobby at
  most every 15 min, jitter always 15; 100 static a deployment; 500 dynamic creations and 5,000 runs (scheduled +
  manual) a billing period, then runs skipped; "limits may change" [V, schedules/limits + configuration; changelog
  2026-11-05]. Too-frequent on deploy [U].
- Hobby is "non-commercial personal use only"; "requesting or processing payment from visitors" is commercial [V,
  fair-use-guidelines 2026-09-14]. **The first live payment on any shop needs Pro.**
- Let's Encrypt, HTTP-01, "wait 5 to 10 minutes"; CAA must allow letsencrypt.org; proxies break issuance [V].
- The middleware sees the custom host unchanged [V 2025-12-13].
- `secure.<host>` (checked 2026-11-16): one domain and one HTTP-01 certificate each (a wildcard covers one level) [V
  working-with-ssl 2026-09-16]; explicit `POST` certs 30/h, automatic issuance's share of it U [V limits 2026-09-16]. Its DNS
  record must match the host's own (A for an apex, the same project CNAME for www) or WebKit may cap its cookies at 7 days
  (CNAME cloaking) [V rule webkit.org/tracking-prevention undated; U applied to frames].
- Public Suffix List (checked 2026-11-16): Vercel advises it for tenant domains (myshopify.com, vercel.app, github.io are on
  it). PRs "MUST use the automated template" (README notice 2026-05-06; a template-check workflow since 2026-07-22):
  organisation, reason, distinct users in thousands ("a minimum of 2000 - 3000"), `_psl` TXT with the PR URL kept for good,
  ≥ 2 years on the registration kept, abuse contact, role email answered ≤ 30 days [V template, last commit 2026-07-22]. No
  SLA, rate-limit-only reasons declined [U, wiki 2025-05-23]. Pickup: Firefox in-tree every few days (latest 2026-11-15) then
  the trains [V commits; U weeks]; Chromium refreshes irregularly (2025-11-07, 2026-03-16, 2026-09-18) [V commits; U to
  stable]; Safari: no current source [U]. Let's Encrypt: 50 a registered domain per 7 days (refill 1 per 202 min) by the PSL,
  renewals exempt [V LE 2026-08-05].
- Domain Connect live at GoDaddy, Cloudflare, IONOS; not Hostinger, BigRock, Namecheap [V-undated].
- Shopify: A 23.227.38.65 + www CNAME shops.myshopify.com; two myshopify names in all, the old one redirects
  [V-undated]. Squarespace unlinks after 15 days without its verify record [V 2026-10-28].

## Mux (video) — checked 2026-11-09, signed playback 2026-11-10 (integration-researcher; Mux doc pages carry no date: [V-undated] = read that day)

- **Account**: one Frrata-owned Mux org; an environment per tier (development, production), each with its own assets,
  tokens, signing keys and webhooks; a token works only in its environment; only an org admin creates tokens; Mux keeps a
  hash, a lost secret is gone. Mux Video Read+Write to create uploads/assets; System write for webhooks/signing keys
  [V-undated, core/make-api-requests + core/mux-fundamentals]. A platform secret in Vercel env (Production only), not a
  tenant credential. Tenancy is our table (asset id → shop); `passthrough` ≤ 255 and `meta.*` may be public: no personal
  data [V-undated, create-asset].
- **Direct upload**: `POST https://api.mux.com/video/v1/uploads` {cors_origin (the console origin), new_asset_settings
  {playback_policies:["public"], video_quality:"basic", static_renditions:[{resolution:"highest"}]}, timeout} — timeout
  default 3600 s, min 60, max 604800 → {id, url, status:"waiting"}; the browser PUTs the file to `url` (resumable; UpChunk,
  chunks in 256 KB multiples) [V-undated, create-direct-upload + upload-files-directly]. Max file size undocumented [U];
  max asset 12 h; no duration cap in the API → check `duration` on ready [V-undated / S].
- **Webhooks**: `mux-signature: t=<unix>,v1=<hex>`, HMAC-SHA256 over `t + "." + raw body` with the endpoint's secret;
  SDK tolerance 5 min; secret returned once at creation; rotation = recreate the webhook [U, no endpoint]; non-2xx retried
  24 h, 5 s per attempt, duplicates even after 2xx, ordering undocumented; per environment [V-undated,
  core/verify-webhook-signatures + listen-for-webhooks + manage-webhooks]. Key on the envelope `id` [U whether stable
  across retries]; after any event GET the asset. Events: video.upload.{created,asset_created,cancelled,errored},
  video.asset.{created,ready,errored,updated,deleted,warning}, video.asset.static_rendition.{created,ready,skipped,
  deleted,errored} [V-undated].
- **Playback**: `static_renditions` is current, `mp4_support` deprecated, never both [V-undated, enable-static-mp4-
  renditions]. Values highest | audio-only | 2160p…270p (no capped-1080p / low); no upscaling; a silent video gets
  highest.mp4, audio-only skipped. MP4 `https://stream.mux.com/{PLAYBACK_ID}/highest.mp4`; HLS `…/{PLAYBACK_ID}.m3u8`
  (native only in Safari/Edge). Poster `https://image.mux.com/{PLAYBACK_ID}/thumbnail.webp?time=&width=&fit_mode=`;
  animated ≤ 10 s, ≤ 640 px. Signed IDs: see Signed playback below.
- **Signed playback (checked 2026-11-10)** [V-undated unless tagged; guides/secure-video-playback, api-reference
  system/signing-keys, stream/streaming, image/thumbnails, prompts/video-paywall (Last updated 2026-11-06)]:
  - Signing key: `POST /system/v1/signing-keys` (or the dashboard) → `data {id, private_key, created_at}`, a 2048-bit RSA
    pair, `private_key` base64 of a PEM; the access token needs System write; one key set per environment; rotate by
    adding a key and deleting the old one after its URLs expire.
  - JWT RS256; claims `sub` playback id, `aud` v|t|g|s|d, `exp` epoch seconds, `kid` IN THE CLAIMS (Mux's Node SDK
    v14 header is only {alg, typ}). No min or max expiry documented [U]; SDK default 7 d, no `iat`; exp ≥ now +
    duration, and an expired URL stops mid-play.
  - MP4 `stream.mux.com/{id}/{rendition name}?token=`, HLS `{id}.m3u8?token=`; the MP4's `aud` is not stated (`v` by
    inference) [U]; one token for both [U]. The file name is the rendition's `name` (`720p.mp4` expected, not shown) [U].
  - Thumbnail: options (time, width, height, fit_mode) are top-level CLAIMS (`aud` t); the URL carries ONLY
    `?token=`, and any other query parameter breaks the signature.
  - A `token=` on a public id fails. An asset can hold several playback ids; a public one plays anywhere, so a signed
    asset keeps none (add the signed id first, then delete the public one). Direct uploads accept
    `playback_policies: ["signed"]`.
  - **A signed MP4 can still be saved while its token is valid.** Mux points to DRM against downloads, and DRM ids
    can't serve static renditions. `controlsList` is not in Mux's docs [U].
  - A new token is a new URL, so no browser-cache hit (the 24 h cache measured 2026-11-09): token life is a cost
    decision (`frata-unit-economics`).
- **Mux Player for Web is in maintenance mode** — Video.js for new work [V-undated, guides/mux-player-web]; ~900 KB
  minified [V, blog 2026-01-21]. Frrata's loops use a plain <video> with no player.
- **Price** (pay as you go, first tier; pricing/video, read 2026-11-09): basic input free; storage basic/plus $0.002400
  (720p) / $0.003000 (1080p) per min per month, basic has a ONE-MONTH MINIMUM; delivery $0.000800 / $0.001000 per min
  after 100,000 free a month (per org), billed at the delivered resolution, buffered segments and MP4 minutes count; MP4
  storage $0.000600 / $0.000750 per rendition-min per month; advanced (sized) rendition prep $0.008000 / $0.010000 per
  min; $20 monthly credit (pay as you go); Launch $20/mo for $100, Scale $500/mo for $1,000, credits reset each cycle
  [V-undated, pricing/video + pricing.md, 2026-11-10]; Free plan up to 10 assets, 100,000 delivery min/month [V,
  changelog video-free-plan 2025-05-01]. Price changes apply to the next bill after notice [V, Terms
  2026-10-12]. Never hard-code a rate.
- **Limits**: per environment + org cap — POST bucket 20, 1/s; others 100, 5/s; 429 + x-ratelimit-* [V, changelog
  2026-06-03 + make-api-requests]. Test assets (`test: true`) free, watermarked, 10 s, deleted after 24 h [V-undated].
- **Delete**: `DELETE /video/v1/assets/{id}` → 204, "all its data"; deleting a playback ID may let a current viewer finish
  [V-undated]. No undo documented [U].
- **Residency**: no region choice, no India [U]; DPA sub-processors AWS (hosting), Cloudflare (delivery) [S, DPA
  2026-10-12 via snippet].
- **Terms** (2026-10-12): licence "non-sublicensable"; no "sublicense, resell"; no letting users permanently download or
  redistribute content [V]. Whether hosting merchants' videos inside Frrata is "resell": [U] — ask Mux in writing
  before launch.
- Alternatives: Cloudflare Stream $5/1,000 min stored, $1/1,000 min delivered [V 2026-10-27]; Bunny Stream from
  $0.005/GB CDN, Asia standard $0.03/GB, $1 minimum [V-undated].
- **`max_resolution_tier` takes only `1080p` | `1440p` | `2160p`** (default 1080p) [V, api-reference create-direct-upload,
  2026-11-09]: a `720p` tier is a 400 on every upload (it reached production that day). 720p is a static rendition size.
- **As built (PV·1, 2026-11-10)**: a product video uploads with no static rendition (basic, timeout 3600) and gets
  its 720p from `POST /video/v1/assets/{id}/static-renditions {resolution: '720p'}` (outbox `mux.rendition.create`) only
  after 6–60 s and a short side ≥ 720 pass; rendition webhooks route by `asset_id`. Unverified on a real Mux account
  until the owner's first product upload.
- **As built (V1, 2026-11-09)**: `src/lib/video/mux.ts` — upload {cors_origin, timeout 900, new_asset_settings {basic,
  public, static_renditions [highest], no tier, passthrough = our videos row id}}; the shop plays highest.mp4 (≤ 1080p).
  **Since TS1b (owner 2026-11-11):** a loop uploads with no MP4 like a product; past the checks it gets a sized rendition
  (`loopMp4`: 720p, or 540p/480p/360p/270p from a smaller source, never larger than it: Mux skips a sized rendition larger
  than its source) by `POST …/static-renditions`, recorded in `videos.mp4`; V1 rows keep `highest`. Prep ≈ $0.008/min
  (≤ 15 s a loop); delivery is billed at the delivered resolution. Unverified on a real Mux account [U].
  **`highest` can't be mixed with sized renditions** (720p, 480p…) [V, guides/enable-static-mp4-renditions, 2026-11-09]: a
  400 in production that day. 720p delivery = a sized rendition alone (paid prep; none from a smaller source); the asset's
  passthrough and upload_id are checked before anything is written; the envelope's `environment.id` must equal
  `MUX_ENVIRONMENT_ID`. Unverified on a real Mux account until the owner's first upload: the upload URL's host
  (no CSP depends on it), where `passthrough` and `upload_id` appear on upload vs asset events (the definer accepts
  either route), the static rendition file's shape (`name: highest.mp4` / `resolution: highest`, `status: ready`), and
  ~~whether a looped MP4's replays are billed again~~ — measured 2026-11-09 on a real 12 s, 1080p, 3.0 MB loop in
  Chromium: 4 replays in 50 s = ONE request (206, bytes=0-), no refetch; Mux serves the MP4 with `cache-control:
  max-age=86400`, so a return visit within a day may cost nothing. Safari/iOS (range requests) not measured [S].

## Infrastructure usage (Admin › Infrastructure) — checked 2026-11-10 (integration-researcher; Mux and Supabase docs undated: V-undated = read that day)

- **Mux Delivery Usage** `GET /video/v1/delivery-usage` (page, limit 100, asset_id, live_stream_id, timeframe[] epoch s):
  per asset `delivered_seconds`, `delivered_seconds_by_resolution` (only non-zero tiers), asset_duration, asset_state;
  only assets > 0 s, sorted by usage; hourly, last 90 days, ending ≥ 12 h ago [V-undated]. Token: Video Read [U].
- **Mux storage** only through Usage Exports `GET /system/v1/usage/exports` (daily UTC CSVs, ready ≥ 08:00 UTC next day,
  not on Free, enabled in the dashboard, system-scoped token); totals ≠ invoice [V-undated, changelog 2026-06-30].
- **No Mux API for the bill, plan or credits** [V absence]. Cost pace = Frrata's estimate from dated rates, labelled.
- **Mux Data**: free for Mux-hosted video; needs `mux-embed` + `env_key` on the page (the shop's plain <video> sends
  none; adding it is a shopper-browser script and viewer data: a DPDP decision). Metrics `/data/v1/metrics/{id}/overall`,
  errors `/data/v1/errors`, Mux Data Read [V-undated].
- **Mux alerts**: email only, ≤ 3 per org, ~hourly, dashboard-set, not on Free, cap nothing; no usage webhook found [U].
- **Supabase Free**: 500 MB DB, 5 GB egress + 5 GB cached, 50,000 MAU, 1 GB storage, 2 projects, paused after 1 week idle;
  over limits → one grace period, then pause / read-only / 402 [V-undated, pricing + billing-faq]. **Pro** from $25, $10
  compute credit (one default-size project), 8 GB disk, 250 GB egress, 100,000 MAU, 100 GB storage; spend cap on by
  default (blocks the item to next cycle; not compute/IPv4/PITR). No threshold alerts; email after exceeding only.
- **Management API**: `/v1/projects/{ref}/analytics/endpoints/usage.api-counts` and `usage.api-requests-count`
  (analytics_usage_read, 30/min); `/v1/organizations/{slug}` → plan; no org usage/egress/MAU/invoice endpoint [V-undated].
- **Scoped personal access tokens** GA 2026-10-06 (the default): per project, read or read-write per permission [V
  changelog]. The dashboard's token: frata only, Usage Analytics Read, Logs Read, Organization Settings Read; never
  Database or Project Settings write.
- **Metrics**: `<ref>.supabase.co/customer/v1/privileged/metrics` needs a secret key (bypasses RLS) → NOT used
  (CLAUDE.md: no service-role key). Use `GET /v1/projects/{ref}/analytics/endpoints/metrics` (analytics_logs_read,
  Prometheus; same series as privileged: U). Beta [V-undated; blog 2025-12-16].
- **Plain SQL**: pg_database_size needs CONNECT; pg_stat_activity nulls other roles' details; pg_stat_statements text
  needs pg_read_all_stats (installed on frata, 2026-11-10) → a definer returning aggregates, not a pg_monitor grant to
  frata_admin (ADR-0007). Max connections / pooler clients: Nano and Micro 60/200, Small 90/400, Medium 120/600, Large
  160/800 [V-undated, compute-and-disk]. frata on 2026-11-10: Free plan, 19 MB, 15/60 connections.
- **Supabase Cron** (pg_cron): every second to yearly; ≤ 8 concurrent, ≤ 10 min a job [V-undated 2026-11-11]. **Available
  on frata on the Free plan** (`pg_available_extensions`, checked 2026-11-11; not installed yet). Free: 2 active projects
  per org counted across all Owners and Admins (paused ones don't count); paused after "too little database activity over a
  week" (app requests count; pg_cron-only writes: U) [V-undated, billing-faq + kb free-project-pausing].
- **statement_timeout**: frata_app and frata_admin carry role-level `statement_timeout=20s, lock_timeout=10s,
  idle_in_transaction_session_timeout=30s` (pg_roles, 2026-11-11). Session `SET` does not work on 6543; role-level via
  Supavisor transaction mode [U, test with pg_sleep] [V-undated timeouts].
- **Vercel billing** `GET /v1/billing/charges`: FOCUS v1.3 JSONL, daily, ≤ 1 year, per team; roles Owner, Member, Developer,
  Security, Billing, Enterprise Viewer (not Pro Viewer); freshness undocumented [V 2026-11-11]. Tokens are Full, Team or
  Project, all read-write (no read-only type); a project token is denied team-level resources, so charges need a team token
  (U until tested) [V access-tokens 2026-09-08]. Least exposure on Pro: a token minted by the team's single Billing-role member.
- **Vercel spend webhook** `budget.reached`: 50/75/100 %, then +100 % steps to 1,000 %; checked "every few minutes";
  `x-vercel-signature` = HMAC-SHA1(raw body), the secret shown once on first save or printed once by `vercel billing budgets
  set --webhook`; Owner or Billing only; no REST endpoint for budgets [V 2026-09-18 / CLI 2026-11-03].

## Vercel platform (functions, firewall) — checked 2026-11-11 (integration-researcher; Vercel pages carry last_updated)

- **Duration** (Fluid): Pro 300 s default, 800 s max, 1800 s beta per function only; the dashboard sets the project default
  (Settings › Functions › Advanced); over the limit → terminated, 504 FUNCTION_INVOCATION_TIMEOUT, streaming time counts
  [V 2026-08-24]. Next 15.5.29: a layout's `maxDuration` passes to the pages under it (nearest wins), **not to route.ts**;
  Server Actions take the page's [V source + nextjs.org 2026-03-13]. vercel.json `functions` globs for App Router pages, and
  precedence between the three settings [U].
- **Bot Protection**: all plans, free, Off/Log/Challenge, **project-wide** (no host scope documented); verified bots skipped
  (googlebot, bingbot, google-storebot, facebookexternalhit = Facebook/Instagram/Messenger previews, razorpay-webhook,
  facebook-webhooks). **WhatsApp, Shiprocket and Mux are not verified** → Bypass custom rules before Challenge [V 2026-09-10;
  WhatsApp failure S, community 2025-12-28].
- **AI Bots**: all plans, free; AI Crawlers and AI Assistants set separately; log/deny (challenge: CLI and API yes, docs no);
  applebot, amazonbot and meta-externalagent are ai_crawler (denying them drops Apple's Spotlight and Siri search) [V].
- **Custom rules**: free, 40 per project on Pro; match host, path, raw_path, route, user_agent, method, header; operators
  eq, pre, suf, sub, re, inc (+ negation); custom rules run before managed rulesets; live in ≤ 300 ms [V 2026-07-29/09-16].
- **On frata (2026-11-11)**: GET/PUT/PATCH `/v1/security/firewall/config` answer 404 "Seawall Config not found" even after Bot Protection (Log) and a custom rule were published in the dashboard; the rules are entered by hand from `ops/firewall.json`. The dashboard's User Agent condition has no regex: use "contains", OR-ed.
- **API**: PUT/PATCH `/v1/security/firewall/config?projectId=`; drafts promoted by `POST …/{configVersion}/activate` (whether
  PUT goes live directly: U, read back `config/active`). Attack Mode `POST /v1/security/attack-mode` (projectId,
  attackModeEnabled, attackModeActiveUntil), immediate, 1/6/24 h; own Functions and Crons pass; unverified callers
  (WhatsApp, Shiprocket, Mux) may be blocked [V 2026-11-11 / 2026-08-11].
- **isbot** 5.2.3 (2026-11-09), Unlicense (not MIT), no dependencies, ≈ 2.6 kB gzip [V registry; S bundlephobia].
- **useReportWebVitals** (Next 15): TTFB, FCP, LCP, FID, CLS, INP; a client component; bundles next/dist/compiled/web-vitals
  (upstream "~3K brotli'd"); a shopper-browser script, so a DPDP note like Mux Data [V 2025-06-16 + source].

- **Project-level routing rules** (checked 2026-11-16; docs 2026-08-11; REST add-a-routing-rule 2026-11-16):
  host/header/cookie/query conditions (equals, contains, regex, exists, negation); one primary action (rewrite incl. external,
  redirect, status) plus modify actions set/append/delete on request and response headers; live "immediately across all
  regions"; before the deployment's routes. The rule body is the @vercel/routing-utils route; vercel.json transforms take key
  objects incl. `ninc` (delete all but a list: an allowlist) [V vercel-json 2026-08-14; U in project rules]. Deleting an
  external upstream's `Set-Cookie` U. External rewrites add x-real-ip, x-forwarded-for, -host, -proto [V rewrites
  2026-08-11]; removable U. No rule-count limit published (forum "100" U); Routes API mutations 60/min, version updates
  20/min [V limits 2026-09-16].
- **Browsers on one address** (checked 2026-11-16): COOP Chrome 83, Safari 15.2 (iOS and iOS WebView mirror), Android
  WebView NOT supported [V MDN BCD]; `same-origin-allow-popups` keeps a window.open reference to an `unsafe-none` popup (OAuth,
  payments) [V MDN 2026-07-12]. Android WebView `window.open` becomes a same-view navigation unless the app enables multiple
  windows [V developer.android.com, undated]. Instagram's in-app engine undocumented by Meta [U]; WhatsApp iOS in-app browser
  in development [S MacRumors 2026-10-20]. WebKit: same-site frames are first-party; 7-day deletion only for JS-made cookies
  and storage; CNAME-cloaked cookies capped at 7 days (top-navigation over-cap fixed in Safari 27.2, 2026-10-26) [V].

## Reading vendors' bills by API — checked 2026-11-23 (`integration-researcher`; plan `docs/specs/2026-11-23-costs-autofill.md`)

- **Supabase** [V-undated, supabase/supabase docs repo, master, read 2026-11-23; the live api.supabase.com spec could not be read]: no organisation-level
  invoice, billing or cost endpoint in the Management API spec (only `/v1/projects/{ref}/billing/addons`); usage endpoints return request counts,
  not money. Invoices are on the organisation's billing page and by email, **in USD, card only**; fixed fees for the current cycle in advance plus
  usage for the previous cycle in arrears, the cycle starting on the organisation's creation day. Pro $25 a month with $10 of Compute Credits; spend cap
  is Pro only. Tax only where Supabase is registered to collect it; GST invoices for India: not stated [U].
- **Vercel** [not re-read 2026-11-23: vercel.com did not resolve in the research session; the lines in § Infrastructure usage stand]: no source
  found that the sum of `/v1/billing/charges` equals the invoice (platform fee, credit, on-demand, tax), for its latency, or for an invoice list API [U].
- **A USD charge on an Indian card** [U]: no current primary source found for the forex markup, GST on it or its timing; read the issuing bank's
  current MITC before booking the rupee figure from an estimate. The recorded rupees are therefore always the card statement's.

