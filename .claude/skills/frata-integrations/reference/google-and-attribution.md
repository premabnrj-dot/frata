# frata-integrations — Google and attribution

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Google — checked 2026-11-06
- Attribution signals

## Google — checked 2026-11-06 (Ads and GA4 rechecked 2026-11-08; OAuth verification, Search Console and Merchant API rechecked 2026-11-09)

- **Offline click conversions:** since 15 Jun 2026 the Google Ads API's `UploadClickConversions` fails
  (`CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`) for a project that did not upload between 17 Dec 2025 and 15 Jun 2026;
  new integrations use the **Data Manager API** (no developer token) [V developer docs, undated; Ads developer blog
  2026-05-15]. The Help Center says "January 2026 through June 2026"; the developer docs win.
- **Retractions:** the Data Manager API "doesn't support conversion retractions" (a restatement keeps the count). RETRACTION
  and RESTATEMENT stay on the Google Ads API (`ConversionAdjustmentUploadService`, a developer token; wait 4–6 h after
  creating a conversion action) [V content, undated, read 2026-11-08]. Whether the Ads API can retract a conversion sent
  through the Data Manager API: [U]. **So taking back an RTO order in Google Ads needs a developer token.**
- **GA4 Measurement Protocol `refund`:** `transaction_id` required; `currency` required with `value`; items optional
  (recommended for item-level refunds); partial-refund rules undocumented [V content, page date not visible, 2026-11-08].

- Content API for Shopping sunset 18 Aug 2026, degradation from 1 Sep → build
  only on **Merchant API v1** [V, Google].
- **OAuth app (Search Console + Merchant API), checked 2026-11-09** [V unless tagged; support.google.com/cloud and
  developers.google.com pages undated except oauth2/policies 2026-08-05 and the User Data Policy 2024-02-15]: Google Auth
  Platform pages Overview, Branding, Audience, Clients, Data Access, Verification Center; External. A separate Cloud
  project per tier (dev, prod) — previews never use the prod client; no wildcard redirect URIs.
- Scopes, the smallest set: `webmasters` (sitemaps.submit, sites.add; reads queries too), `siteverification.verify_only`
  (getToken + insert; makes the user an owner), `content` (Merchant API, asked only when Merchant Center is connected).
  Category of each: [U] — only the console's Data Access page shows it; record it there. Merchant API: OAuth
  verification review is mandatory [V]. CASA only for restricted scopes [V]; none known restricted [U].
- Branding: logo ≤ 1 MB, 120×120 square (docs/brand/png/frrata-icon-120.png); a logo or name on the consent screen needs
  brand verification (minutes automated, 2–3 business days manual); a pass lasts 7 days before publishing; scope review
  needs published branding. Homepage on a Search-Console-verified domain (by the project's Owner/Editor), not only a login
  page; privacy policy on the same domain; authorized domains before redirect URIs.
- Scope verification: a justification per scope (why narrower is not enough); a YouTube Unlisted video in English
  showing the app name, client_id in the address bar and each scope's feature. Apps in development or testing are not
  eligible → submit only once "Connect Google" works. Estimates: brand 2–3, sensitive up to 10 business days, restricted
  6 weeks + CASA.
- Testing mode: ≤ 100 test users; refresh tokens expire after 7 days. Production unverified: "unverified app" screen,
  100 new users for the project's LIFETIME, never reset. 100 refresh tokens per account per client; unused 6 months →
  invalid. The client secret is shown once.
- Merchant API developer registration: `registerGcp` once per Cloud project on Frrata's OWN production Merchant Center
  (verified website, Admin caller), not per merchant; else 401 UNAUTHENTICATED.
- No business, legal-entity or India-specific Google OAuth requirement found [U].
- Never send Google user data to ad platforms: Limited Use forbids "transferring or selling user data to third parties
  like advertising platforms" [V, User Data Policy 2024-02-15]. Google Ads developer token + brand verification [U, founder].

## Attribution signals (landing URL + referrer) — checked 2026-11-08 (integration-researcher, for analytics A1·2)

Meta, Instagram and WhatsApp publish nothing on what referrer a shop page receives, and most Meta/Google help pages carry
no date. URL parameters are the signal; the referrer is a hint. [V] read on the provider's or a standards body's own
page · [S] secondary only · [U] no current source.
- `fbclid`: Meta documents it only on ad clicks ("when a user clicks an ad on Facebook and/or Instagram") and never says
  ads-only [V content, undated]; organic and shared links carry it too, so it never means "ad" by itself [S, elasticfunnels
  2026-09-29]. Safari strips gclid/fbclid/msclkid in Private Browsing, Mail and Messages; normal browsing passes them [S,
  taggrs 2026-07-30].
- `fbc`/`fbp` are cookie values, never URL parameters Meta adds. `fbc` = `fb.<subdomainIndex>.<creationTime ms>.<fbclid>`;
  built on the server without an `_fbc` cookie, subdomainIndex = 1 [V content, Meta fbp-and-fbc, undated].
- Meta auto-adding `utm_*` to ads: [U] (headline only; Meta help pages unreadable).
- `igsh` (older `igshid`) is added when an Instagram post/reel/video link is copied or shared, i.e. on instagram.com URLs;
  not on outbound bio/story/DM links [S, aurumspire 2026-07-28; igshare 2026-01-17]. Not an attribution key.
- Referrer from Instagram/Facebook in-app browsers: often empty; when present the shim host `l.instagram.com`
  (`l.facebook.com`, `lm.facebook.com`) [S, sendurl 2026-11-02]. Per placement and per OS: [U]. GA4 lists l.instagram.com,
  instagram.com, ig, l.facebook.com, lm.facebook.com, m.facebook.com, l.messenger.com, whatsapp(.com), youtube.com,
  m.youtube.com as sources [V, GA4 source-category list, undated]. iOS 27 WKWebView apps can override the referrer on every
  request (`overrideReferrerForAllRequests`) [V, WebKit 2026-09-17].
- WhatsApp: no referrer, so it looks direct [S, cutt.ly 2026-05-02]. `android-app://com.whatsapp`: [U]. CTA URL buttons open
  the default browser [V Meta, undated]; template CTA links open an in-app browser for ≥1,000/day numbers [S, Wati
  2025-11-18]; an iPhone in-app browser for all chat links is in development [S, MacRumors 2026-10-20].
- Google Ads: auto-tagging adds `gclid`, "on by default for new accounts" [V content, undated]; also `gad_*` (`gad_source`)
  [V content, undated]. `wbraid` = ad in an iOS app → web page; `gbraid` = web ad → iOS app [V Ads API docs, undated]
  (Ads Help, 2023, no current source, says gbraid is on landing pages for all iOS 14.5+ clicks). Several can co-exist
  (Google ranks gclid > wbraid > gbraid). Any of gclid/gbraid/wbraid/gad_source = Google Ads.
- Google free listings: Merchant Center auto-tagging adds `srsltid` (on by default for new accounts), reported as organic
  [V content, undated]; also seen on plain organic Search URLs [S]. `srsltid` = Google organic, not paid.
- Google organic referrer `www.google.com` (origin): [U]; a `google.com/goto` redirect test was reported, unconfirmed by
  Google [S, 2026-07-10]. YouTube app referrer and `android-app://` from Android apps: [U] (Custom Tabs lets an app set
  `android-app://<package>` [V Chrome docs, undated]).
- Referrer-Policy default `strict-origin-when-cross-origin` [V, W3C ED 2026-03-20; MDN 2026-09-04]; Safari cuts every
  third-party referrer to its origin [V content, undated]. The REFERRING page's policy decides what we receive (W3C §3.9);
  our own header only governs what we send onward. In-app browsers' policy: [U].
- Open: a dated test on real Android and iOS devices (bio, story sticker, DM, WhatsApp, YouTube) recording `ref_host`
  would turn the [U] referrer rows into [V].
