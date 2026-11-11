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
   `smb_app_state_sync`, `account_update`, `phone_number_quality_update`, `phone_number_name_update`, and for Reviews
   `message_template_status_update` and `template_category_update` (the review template's approval and category).
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
  1. ~~Vercel Pro and a frequent outbox schedule~~ — done 2026-11-11 (owner upgraded to Pro): `/api/cron/drain` every
     5 minutes (`vercel.json`); a sender also drains straight after its commit (`drainSoon`).
  2. ~~The outbox claim moves to a definer~~ — done 2026-11-11 (drizzle/0091): `app_outbox_claim` / `app_outbox_settle`,
     and the `outbox` policies lost their no-shop branch; `outbox` is off check:tenant's OPEN_FOR_APP.
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

### Own domains (shop addresses D·2) — turning them on (owner, ~5 minutes)

State (2026-11-09): built and live in production, switched off until these three variables exist. Nothing calls
Vercel's API until then.

**1. Create the token (Vercel → your avatar → Account Settings → Tokens, https://vercel.com/account/tokens):**
- Create Token → Name `frrata-domains` → Scope **premabnrj-dot's projects** (the team, not your personal account) →
  Expiration: 1 year (put the renewal date in your calendar; an expired token turns connecting off, nothing breaks).
- Copy the token once (Vercel shows it only now). Never paste it in chat, a commit or a document.

**2. Add three variables (Vercel → `frata` → Settings → Environment Variables → Add New):**

| Key | Value | Environments | Sensitive |
|---|---|---|---|
| `VERCEL_API_TOKEN` | the token from step 1 | **Production only** (untick Preview and Development) | **Yes** |
| `VERCEL_PROJECT_ID` | `prj_7FMo28q5WaWJTR8knTAo6lpe443v` | Production only | no (not a secret) |
| `VERCEL_TEAM_ID` | `team_bqC0of2bJVsfNi2b8fKOPaEx` | Production only | no (not a secret) |

The two IDs are this project's and team's (read from Vercel 2026-11-09; also under Project → Settings → General →
Project ID, and Team → Settings → General → Team ID). Optional: `DOMAIN_CAPACITY` — leave unset on Hobby (50); set
it to `100000` after moving to Pro. Never Preview: a preview build must not add or remove production domains.

**3. Redeploy:** Deployments → the latest Production deployment → ⋯ → Redeploy (or any push to `main`).

**4. Check:** Settings › Shop address in the console shows **Connect a domain**. If it doesn't, the token or project id
is missing or not in Production.

On Vercel Pro later: the background check's schedule in `vercel.json` moves to every 10 minutes (one line), and the
frrata name starts redirecting to a main domain (D2·9 follow-up).

### Video for shops: Frrata's Mux (V1, 2026-11-09)

State (2026-11-09): steps 1–3 done by the owner (four variables, Production only, Sensitive); step 4's redeploy is
this commit's build; Signal 1.1.0's release and a first real upload are next.

Facts: frata-integrations § Mux. Built and tested end to end against a stand-in; nothing calls Mux until these are set.
1. In Mux, the **Production** environment: copy its **environment id** (Settings › Environments; not a secret).
2. Vercel → `frata` → Settings → Environment Variables, **Production only, Sensitive** (never Preview: previews share
   the production database): `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (the access token pair), `MUX_ENVIRONMENT_ID` (step 1).
3. Mux → Settings → Webhooks (Production environment): URL `https://frata.vercel.app/api/webhooks/mux`; copy its
   signing secret into `MUX_WEBHOOK_SECRET` (Production, Sensitive). `MUX_WEBHOOK_SECRET_PREVIOUS` stays unset (used
   only while a new webhook replaces the old one). Signing keys are not used (playback is public).
4. Redeploy (push to `main`), then Admin › Themes → **Signal 1.1.0** → Release (1.0.0 has no video; shops move up when
   they next try or update the theme).
5. Before launch: ask Mux in writing that hosting merchants' loops inside Frrata is allowed, and where data is stored;
   add Mux to Frrata's sub-processors.


### EkCode — shopper sign-in and WhatsApp (ADR-0009, spec `docs/specs/2026-11-09-shopper-login.md`)

What the owner does, in order. Secrets go straight into Vercel, never into a chat. Variable names are the ones the P1
plan will use; the plan may rename one, and this list follows it.

**A. Start now (no code needed; the long waits)**
1. **Domain.** Buy `ekcode.in` (and `ekcode.com` if free, to protect the name). Tell the agent the names bought; DNS
   records come in step B1.
2. **Company for Meta.** Meta's business verification needs the legal entity (incorporation certificate or GST
   certificate, and a matching website/email). Unverified, the number reaches only 250 different people a day.
3. **A new SIM** that has never been on WhatsApp, for EkCode's number. Not Frrata's sign-up number: EkCode needs its
   own, named "EkCode".
4. **Counsel** (an Indian privacy/tech lawyer), with the spec and mockup: (a) EkCode's notice, privacy policy and terms;
   (b) the merchant terms' data-processing clause; (c) "Save this address to EkCode" starting ticked; (d) English only until the owner plans other languages.
5. **Grievance contact**: Priti Bag, `privacy@ekcode.in` (owner, 2026-11-09). Create the mailbox on ekcode.in.
6. Optional: a trademark search and filing for "EkCode" (classes 9, 35, 42).

**B. When the agent says the ekcode.in pages are deployed (first P1 task)**
1. **DNS.** Vercel → frata → Settings → Domains → add `ekcode.in` and `www.ekcode.in`; at the registrar add the records
   Vercel shows (A `76.76.21.21` for the apex and a CNAME for www, or whatever Vercel lists). Wait for "Valid".
2. **EkCode's WhatsApp number** — in **its own business portfolio** "EkCode" (business.facebook.com → Create a business
   portfolio; India, INR; same company), not Frrata's: a restriction on Frrata's merchant-side (Tech Provider) portfolio
   cannot stop sign-in, and the daily limits are not shared (ADR-0010). Verify this portfolio too (A2's documents):
   - WhatsApp Manager → Add WhatsApp account "EkCode" → add the SIM's number → display name **EkCode** → verify by SMS
     or call. Meta checks the name against ekcode.in, which must be live (B1). Copy the **Phone number ID**.
   - Payment settings: the portfolio's card covers it (INR + GST).
   - Message templates → Create → **Authentication**, name `ekcode_signin_code`, English, **Copy code**, security
     line on, expires in **10 minutes**. Note the language code (`en` or `en_US`).
   - Two-step verification: set a 6-digit PIN on the number (needed for the blue tick later).
3. **The app and its webhook.** developers.facebook.com → Create app (Business) linked to the EkCode portfolio → add
   WhatsApp. WhatsApp → Configuration → callback URL `https://frata.vercel.app/api/webhooks/ekcode`, verify
   token = `EKCODE_WA_VERIFY_TOKEN` below; subscribe `messages`, `message_template_status_update`,
   `template_category_update`, `phone_number_quality_update`, `phone_number_name_update`. App → Settings → Basic →
   Privacy policy URL `https://ekcode.in/privacy`; switch the app to **Live**.
4. **Token.** EkCode portfolio → Business settings → System users → Add (Admin) → Assign assets: the app and EkCode's
   WhatsApp account (full control) → Generate token, never expires, `whatsapp_business_messaging` +
   `whatsapp_business_management`.
5. **Email — not now (owner, 2026-11-09: planned once SES is connected).** When it is planned: AWS console → SES (ap-south-1) → Identities → Create identity →
   Domain `ekcode.in` → add the 3 DKIM CNAMEs and the MAIL FROM records it shows at the registrar → request
   **production access** (use case: one-time sign-in codes, ~1–2k a day). IAM → a user allowed only `ses:SendEmail`
   from that identity → access key. DMARC TXT at `_dmarc.ekcode.in`: `v=DMARC1; p=none; rua=mailto:privacy@ekcode.in`.
6. **Vercel → frata → Environment Variables, Production only** (a preview must never send from EkCode's number):
   - `NEXT_PUBLIC_EKCODE_HOST` = `ekcode.in` (public: the host the shops redirect to; unset = EkCode off everywhere)
   - `EKCODE_WA_PHONE_NUMBER_ID` (B2), `EKCODE_WA_TOKEN` (B4, Sensitive), `EKCODE_WA_AUTH_TEMPLATE` =
     `ekcode_signin_code`, `EKCODE_WA_TEMPLATE_LANG` (B2), `EKCODE_WA_VERIFY_TOKEN` (Sensitive, `openssl rand -hex 16`),
     `EKCODE_META_APP_SECRET` (Sensitive, the EkCode app's secret)
   - Two key rings, Sensitive, each entry `openssl rand -base64 32`: `EKCODE_PHONE_PEPPERS` = `p1:<key>` (phone
     lookups) and `EKCODE_SEAL_KEYS` = `k1:<key>` (sealed phones, names and addresses). Keep copies in a password
     manager. **To rotate**: put the new entry first (`k2:<new>,k1:<old>`) and redeploy — new data uses the new key, old
     data still opens, and an account moves to the newest phone key at its next sign-in. **Never remove an old entry**
     (there is no re-seal job yet: an old seal key still opens every value sealed with it), and never just replace one:
     that locks every shopper out.
   Push to `main` (or Redeploy). Test: a demo shop → Continue with EkCode → your own mobile → the code arrives.

**C. Before EkCode reaches a real shopper**
1. Counsel's answers on A4 (a)–(c), and the notice text final.
2. **Supabase Pro** (backups, point-in-time recovery: the vault holds shoppers' phones and addresses).
3. **Preview deployments off production's database** (Vercel: take `DATABASE_URL` off Preview or point it at a Supabase
   branch) and Deployment Protection on previews.
4. **Meta business verification** done (A2) and the number past 2,000 a day; Admin › EkCode › WhatsApp shows the step.
5. Your approval of the P1 build on a demo shop.

**D. Later**
- ~~Vercel Pro and the 5-minute outbox schedule~~ — done 2026-11-11 (`/api/cron/drain`).
- **Blue tick**: 30 days after the number goes live → WhatsApp Manager → the number → Request Official Business Account.
- Confirm the allowances (600 / 6,000 / 20,000) after the pricing review.

### Email — Amazon SES (ADR-0011, plan `docs/plans/2026-11-11-email.md`)
Nothing here passes through an agent: no AWS key exists anywhere (the app reaches SES through Vercel OIDC). Region
**Asia Pacific (Mumbai) ap-south-1** for every step.

**A. Today**
1. **AWS account:** root user with MFA; a $20 billing alarm (Billing → Budgets).
2. **Production access, early** (SES → Account dashboard → Request production access): Mail type **Transactional**,
   website `https://frrata.shop`, tick the acknowledgement. First reply within 96 hours. When asked for volume: up to
   1,000,000 a day, 50 a second at festive peaks.
3. **Identities** (SES → Identities → Create identity → Domain): `frratamail.app` (shops' order emails) and the notices
   domain (`notify.<Frrata's domain>`), each with Easy DKIM 2048 and a custom MAIL FROM (`bounce.<domain>`). Paste the
   records SES shows to the agent: frratamail.app is on Vercel DNS, so the agent adds them (3 DKIM CNAMEs, MX + SPF for
   bounce, and `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@frratamail.app`).
4. **SNS topic** (SNS → Topics → Standard, name `frrata-ses`): Edit → Message signing → **SignatureVersion 2**. Copy its
   ARN → Vercel `SES_SNS_TOPIC_ARN`.
5. **Configuration sets** (SES → Configuration sets): `shops` and `notices`. In each: Suppression list → **account-level
   suppression off** (ours, per shop, is the only list); Event destination → SNS `frrata-ses`, events **Delivery,
   Hard bounces/Bounces, Complaints, Rejects** only; "Include original headers" off.
6. **Frrata's tenant** (SES → Tenants → Create): name `frrata`; associate the notices identity and the `notices` set.
   Shops' tenants are created by the app.
7. **OIDC** (IAM → Identity providers → Add → OpenID Connect): URL `https://oidc.vercel.com/premabnrj-dots-projects`,
   audience `https://vercel.com/premabnrj-dots-projects`.
8. **Role** (IAM → Roles → Web identity → that provider), name `frrata-ses`. Trust condition:
   `oidc.vercel.com/premabnrj-dots-projects:sub` = `owner:premabnrj-dots-projects:project:frata:environment:production`
   (previews are refused). Inline policy: `ses:SendEmail` on both identities and both configuration sets and
   `arn:aws:ses:ap-south-1:<account>:tenant/*`; `ses:CreateTenant` and `ses:CreateTenantResourceAssociation` on
   `*`. Copy the role ARN → Vercel `SES_ROLE_ARN`; your 12-digit account id → `SES_ACCOUNT_ID`.
9. **Vercel env (Production only):** `SES_ROLE_ARN`, `SES_ACCOUNT_ID`, `SES_SNS_TOPIC_ARN`,
   `EMAIL_SHOP_DOMAIN=frratamail.app`, `EMAIL_NOTICES_FROM=Frrata <notices@notify.<Frrata's domain>>`, `EMAIL_KEYS`
   (`e1:` + 40 random characters; generate with `openssl rand -base64 30`).

**B. When the agent says the email routes are deployed**
1. **SNS subscription:** topic `frrata-ses` → Create subscription → HTTPS →
   `https://frata.vercel.app/api/webhooks/ses`; "Raw message delivery" off. It confirms itself within a minute.
   Delivery policy: 100 retries, max delay 60 s.
2. **Sign-in email:** Supabase → Authentication → Hooks → Send Email hook → HTTP →
   `https://frata.vercel.app/api/auth/send-email`; generate the secret → Vercel `SEND_EMAIL_HOOK_SECRET`; redeploy.
   Then Authentication → Rate limits → emails per hour: 300.
3. Sign in once to check; tell the agent.
