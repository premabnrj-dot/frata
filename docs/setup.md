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
the free plan then needs another project paused or an upgrade.

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
type **Sensitive**, Production + Preview. Never the `postgres` user: it
bypasses every tenant policy.

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
  without it. It is the safety net for Razorpay events; each event is also
  processed the moment it arrives.
- `PAYMENT_KEYS_SECRET` (Sensitive, Production): replace the placeholder with
  `openssl rand -base64 32` **before any merchant connects Razorpay** — changing it
  later makes saved keys unreadable and those shops must reconnect. Each shop's
  Razorpay webhook secret is made by Frata per shop (Settings → Online payments);
  there is no platform-wide Razorpay secret.
- Supabase Pro before real merchants: free projects pause after a week idle and
  have no backups. Vercel Pro too: Hobby is non-commercial.
