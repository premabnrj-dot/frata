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

## Later

- `CRON_SECRET` (Sensitive) when the first cron is added to `vercel.json`.
- `RAZORPAY_WEBHOOK_SECRET` (Sensitive) from Razorpay's webhook settings.
- Supabase Pro before real merchants: free projects pause after a week idle and
  have no backups. Vercel Pro too: Hobby is non-commercial.
