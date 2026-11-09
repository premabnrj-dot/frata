# Setup — what exists and the steps only the owner can do

Checked 2026-11-06.

## What exists

| Thing | Where |
|---|---|
| Vercel project `frata` | team `premabnrj-dots-projects`, production https://frata.vercel.app, functions `bom1` |
| Supabase project `frata` | ref `szqwveysvbbxpjhjlnwl`, ap-south-1, org "doloslyf-creator's Org" (free plan) |
| Migrations applied | `drizzle/0000`–`0003`, each recorded in `drizzle.__drizzle_migrations` |
| Isolation proved on the live database | 2026-11-06, rolled back (`frata-verify` § Live proof); security advisor clean |
| Vercel variables set | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key), `NEXT_PUBLIC_CONSOLE_HOST=frata.vercel.app` |

To make room on the free plan, the old ekatan3d project **fpis was paused**
(2026-11-06). Restore it from the Supabase dashboard if anything still needs it;
the free plan then needs another project paused or an upgrade. The free limit is 2 active projects **per user**, counted
across every organisation where the owner is Owner or Admin (Supabase billing docs, 2026-09-17), so a second Frrata
database (analytics A·2) needs Pro or another project paused.

## Owner steps (secrets never pass through an agent)

### 1. Give the app role a password — Supabase → SQL Editor

Generate one locally (hex, so it needs no URL escaping):

```bash
openssl rand -hex 24
```

Then run, with that value:

```sql
alter role frata_app with password '<the hex value>';
```

### 2. `DATABASE_URL` in Vercel

Supabase → **Connect** → **Transaction pooler** (port 6543). Copy the URI and
change the user from `postgres.szqwveysvbbxpjhjlnwl` to
`frata_app.szqwveysvbbxpjhjlnwl`, with the password from step 1:

```
postgresql://frata_app.szqwveysvbbxpjhjlnwl:<password>@<pooler host>:6543/postgres
```

The user part is exactly `frata_app.szqwveysvbbxpjhjlnwl` — replace `postgres`,
do not prefix it. The password must be the **hex** value: base64 contains `/`
and `+`, which break the URL (the app now refuses such a URL with a message
that never includes it — `src/lib/db/url.ts`).

Vercel → frata → Settings → Environment Variables → `DATABASE_URL`,
type **Sensitive**, **Production only** (checked 2026-11-09: it is; a preview build must never reach the
production database — security review S1). Never the `postgres` user: it bypasses every tenant policy.

### 3. Supabase auth URLs — Authentication → URL Configuration

- Site URL: `https://frata.vercel.app`
- Redirect URLs: `https://frata.vercel.app/auth/callback` and
  `https://*-premabnrj-dots-projects.vercel.app/auth/callback` (previews)

### 4. Redeploy

Vercel → Deployments → latest → Redeploy (variables apply to new builds only).

### 5. Your store

Sign in at https://frata.vercel.app/login with your email, then ask an agent to
create your tenant and owner membership (it is a plain insert; no secret).

### 6. Frata Admin (Phase A)

1. SQL Editor: `alter role frata_admin with password '<hex>';` — a NEW hex value
   (`openssl rand -hex 24`), not the frata_app one.
2. Vercel: `ADMIN_DATABASE_URL` = the Transaction pooler URI with user
   `frata_admin.szqwveysvbbxpjhjlnwl` and that password. Type **Sensitive**,
   **Production only** — previews share the database, and this connection reads
   every merchant (ADR-0007).
3. Supabase → Authentication → Sign In / Providers → Email: keep **Confirm email**
   on. Invites are claimed only by confirmed emails.
4. Redeploy. You are already in `platform_staff` as Admin.

### Rename day: Frrata (brand spec 2026-11-07)

1. Supabase → Authentication → Emails: set the **sender name** to "Frrata" and the sign-in email's **subject** to
   say "Frrata" (the sign-in page tells people to look for "Frrata" in their inbox).
2. Vercel → frata → Domains: add **frrata.com** once bought. The app keeps working on its current hosts; moving shop
   addresses is brand plan B·4, its own decision, with redirects.
3. Before the name is public: the IP India trademark search (classes 35 and 42), frrata.in at an Indian registrar,
   and the Instagram and WhatsApp handles (owner, 2026-11-07: checking these himself).

### 7. Messages: Frrata's Meta app (C1, 2026-11-07)

Until these are set, Console › Apps › Messages says "WhatsApp isn't switched on for Frrata yet" and nothing is called.

1. **Meta Business verification** of Frrata's portfolio, then a Meta app of type Business set up as a **Tech
   Provider** (developers.facebook.com → My Apps). Add the WhatsApp product.
2. **Embedded Signup**: WhatsApp → Embedded Signup → create a configuration (v4) with WhatsApp Business app onboarding
   allowed. Copy its **configuration id**. Add `frata.vercel.app` (and the console host) to the app's allowed domains.
3. **Webhook**: WhatsApp → Configuration → callback URL `https://<console host>/api/webhooks/whatsapp`, verify token = the
   value you set as `WA_VERIFY_TOKEN`. Subscribe the fields `messages`, `smb_message_echoes`, `history`,
   `smb_app_state_sync`, `account_update`, `phone_number_quality_update`, `phone_number_name_update`.
4. Vercel → frata → Environment Variables (Production):
   - `NEXT_PUBLIC_META_APP_ID` (the app id) and `NEXT_PUBLIC_WA_CONFIG_ID` (step 2): public, shown to Meta's popup.
   - `META_APP_SECRET` (Sensitive): App settings → Basic → App secret.
   - `WA_VERIFY_TOKEN` (Sensitive): any random string, e.g. `openssl rand -hex 16`, the same as in step 3.
   - `PAYMENT_KEYS_SECRET` must already be set (it seals each shop's WhatsApp token too).
5. Redeploy, then connect Frrata's own test number first (dev mode). Other brands' numbers need **App Review**
   (two screencasts, recorded after C2·1) and access verification; until then Meta allows 10 new brands per 7 days.

## Later

- `CRON_SECRET` (Sensitive): the daily cron in `vercel.json` (03:17 UTC) is refused
  without it. It is the safety net for Razorpay and WhatsApp events; each event is also
  processed the moment it arrives.
- `PAYMENT_KEYS_SECRET` (Sensitive, Production): replace the placeholder with
  `openssl rand -base64 32` **before any merchant connects Razorpay** — changing it
  later makes saved keys unreadable and those shops must reconnect. Each shop's
  Razorpay webhook secret is made by Frata per shop (Settings → Online payments);
  there is no platform-wide Razorpay secret.
- `TRIAL_CLAIM_SECRET` (Sensitive, **Production only**): `openssl rand -base64 32`. Without it no shop gets a trial
  (one trial per business is keyed by it); never change it once set.
- `FRRATA_WA_PHONE_NUMBER_ID`, `FRRATA_WA_TOKEN` (Sensitive), `FRRATA_WA_SIGNUP_TEMPLATE`, `FRRATA_WA_TEMPLATE_LANG`
  (**Production only**: a preview would send from Frrata's number): Frrata's own WhatsApp number and its approved
  copy-code authentication template. All set, with `TRIAL_CLAIM_SECRET`, turns on the WhatsApp code at sign-up.

### Frrata's own WhatsApp number (the sign-up code)

Owner steps, about an hour plus Meta's template review. Facts: frata-integrations § Sign-up code (checked 2026-11-08).
This is Frrata's number, separate from the Tech Provider app that connects merchants' numbers. No GST or business
verification is needed to start; unverified, it reaches 250 different people a day (plenty for sign-ups). Verify the
business once the company exists to lift that.

1. **A number** that can take an SMS or a call and is **not on WhatsApp** (a new SIM is simplest; a number on the
   WhatsApp app must delete that account first).
2. **business.facebook.com** → create a business portfolio "Frrata" (India, INR — the currency cannot change later).
3. **developers.facebook.com** → My Apps → Create app → Business → link it to that portfolio → add **WhatsApp**.
   Use a new app, not the Tech Provider one.
4. App → WhatsApp → **API Setup** → Add phone number → display name "Frrata" → verify with the code Meta sends.
   Copy the **Phone number ID** shown there.
5. **WhatsApp Manager → Payment settings** → add a card (templates do not send without one; Meta charges in INR + GST).
6. **WhatsApp Manager → Message templates → Create**: category **Authentication**, name `frrata_signup_code`,
   language English, delivery **Copy code**, add the security line, code expires in **10 minutes**. Submit; approval
   is usually minutes to hours. Note the language code it shows (`en` or `en_US`).
7. **Business settings → Users → System users** → Add (Admin) → Assign assets: the app and the WhatsApp account, full
   control → **Generate token**, expiry *Never*, permissions `whatsapp_business_messaging` and
   `whatsapp_business_management`. Copy it once; it is not shown again.
8. **Vercel → frata → Settings → Environment Variables**, Production only:
   `FRRATA_WA_PHONE_NUMBER_ID` (step 4), `FRRATA_WA_TOKEN` (step 7, Sensitive), `FRRATA_WA_SIGNUP_TEMPLATE` =
   `frrata_signup_code`, `FRRATA_WA_TEMPLATE_LANG` = the code from step 6. Redeploy (or push to `main`).
9. Test: sign up at /start with your own mobile — the "WhatsApp number" step appears and the code arrives.
- Supabase Pro before real merchants: free projects pause after a week idle and
  have no backups. Vercel Pro too: Hobby is non-commercial, and allows 100 deployments a day, 100 builds an hour and one
  at a time (the limit hit on 8 Nov), one WAF rate-limit rule per project, and cron once a day (±59 min; Vercel calls
  Cron Jobs "legacy", moving to Schedules). Pro is $20 a month with one deploying seat and $20 of usage
  (vercel.com/docs, 2026-07-15 to 09-16).
- **Before WhatsApp COD confirmations (or any outbox sender) ship** (owner, 2026-11-08: "will upgrade to Pro
  later"; review P5):
  1. **Vercel Pro**, then a frequent outbox schedule in `vercel.json` (every 5 minutes, not the daily `17 3 * * *`).
     A sender also drains straight after its commit (`drainSoon`, `src/lib/outbox/drain.ts`); the cron is the net.
  2. **The outbox claim moves to a definer** that returns the due rows for the sweep, and the `outbox` policies lose
     their no-shop branch (drizzle/0017, 0018), so a table that will hold shoppers' phones has none
     (tenancy audit 2026-11-08; `check:tenant` lists `outbox` in OPEN_FOR_APP until then).
- **Preview deployments must not hold the production database** (review S1): in Vercel, take `DATABASE_URL` off
  Preview (or point Preview at a Supabase branch) and turn on Deployment Protection for previews.

### Frrata's Google app (Search Console and Google Shopping for merchants — search and sharing S·4)

Facts and sources: frata-integrations § Google (checked 2026-11-09). Two stages: **now** (prepare, verify the brand,
test with up to 100 accounts) and **after "Connect Google" is built** (the scope review needs a video of it working).

**Now — before the console**
1. Own **frrata.com** and verify it in Search Console as a *Domain* property (DNS TXT record at `@`), signed in with
   the Google account that will own the Cloud project. Keep the TXT record for good.
2. Publish on frrata.com: a homepage that says what Frrata does with Search Console and Google Shopping (not only a
   login page, linking the privacy policy); a privacy policy (`/privacy`) naming the Google data read (search queries and
   clicks, sitemaps, site ownership, product listings), how it is used and stored, that it is never shared or sent to
   ad platforms (Google's Limited Use policy); terms (`/terms`).
3. The console's sign-in callback should live on a frrata.com host (e.g. `app.frrata.com`): every redirect host must be
   an authorized, verified domain, and frata.vercel.app is not ours to verify. (Plan this with own domains.)

**Now — Google Cloud console**
4. console.cloud.google.com → create two projects: **frrata-prod** and **frrata-dev** (Google requires one per tier;
   previews and localhost use dev).
5. In each: APIs & Services → Library → enable **Google Search Console API**, **Site Verification API**, **Merchant API**.
6. Google Auth Platform (console.developers.google.com/auth/overview) → **Get started**: App name `Frrata`, user support
   email, Audience **External**, developer contact email.
7. **Branding**: logo `docs/brand/png/frrata-icon-120.png`; home page `https://frrata.com/`, privacy
   `https://frrata.com/privacy`, terms `https://frrata.com/terms`; Authorized domains: `frrata.com` (add it first).
8. **Clients → Create client → Web application**, name "Frrata web": JavaScript origin `https://app.frrata.com`; redirect
   URI the exact callback S·4 uses (we will send it). **Download the secret at once — it is shown only once**; it goes
   into Vercel (Production only), never in chat. The dev project gets its own client for `http://localhost:3000`.
9. **Data Access → Add or remove scopes → Manually add**: `https://www.googleapis.com/auth/webmasters`,
   `https://www.googleapis.com/auth/siteverification.verify_only`, `https://www.googleapis.com/auth/content`. Take a
   screenshot of which table (non-sensitive / sensitive / restricted) each lands in and send it to us.
10. **Audience**: stay in **Testing**; add up to 100 test users (you, pilot merchants). In Testing, connections expire
    after 7 days.
11. **Branding → Verify branding** (minutes; a manual review 2–3 business days), then **Publish branding** within 7 days.
12. Merchant API registration: create Frrata's own Merchant Center account (frrata.com as its verified website, you as
    Admin); we call `registerGcp` once from each project (not per merchant).

**Later — once "Connect Google" works (S·4)**
13. Record an English video, upload it to YouTube as **Unlisted**: the click on Connect Google, the consent screen
    showing "Frrata", the address bar with `client_id=…`, and each permission in use (searches appear, a sitemap is
    submitted, the shop's address is verified, a product appears in Merchant Center).
14. Audience → **Publish app**; Verification Center → Prepare for verification → paste the per-scope reasons (we write
    them) and the video link → Submit. Reply to Google's emails quickly; sensitive scopes take up to ~10 business days.
    Do not publish before this: an unverified production app allows only 100 users for its whole life.

### Own domains (shop addresses D·2) — when you turn them on

Vercel → frata → Settings → Environment Variables, each **Production only** (never Preview: a preview build must not
add or remove production domains), type **Sensitive** for the token:
- `VERCEL_API_TOKEN` — a token from Vercel → Account Settings → Tokens, scoped to the team.
- `VERCEL_PROJECT_ID` — Project → Settings → General → Project ID.
- `VERCEL_TEAM_ID` — Team → Settings → General → Team ID.
- `DOMAIN_CAPACITY` — optional: 50 on Hobby (the default), raise it on Pro.
Until they are set, Settings › Shop address shows no Connect button and the domain check does nothing.
