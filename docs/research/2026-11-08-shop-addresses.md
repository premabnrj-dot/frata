# Research — shop addresses (frrata.shop subdomains and merchants' own domains)
Date: 2026-11-08 · For: `docs/specs/2026-11-08-shop-addresses.md` · By: integration-researcher (Vercel, PSL, Shopify,
Squarespace, Domain Connect) and a codebase map. [V] primary, [V-undated] vendor page with no date read live today,
[U] unverified.

## 1. What the code does today
- **One address rule:** a shop's address is `<slug>.<SHOP_DOMAIN>` everywhere (`hostFor`, storefront.ts:53); nothing
  reads a merchant's own domain back as the address; no primary or redirect concept.
- **Host → shop:** `surfaceFor`/`routeFor` (host.ts) send any non-console host to `/s/<host>/…`; `tenantForHost`
  (platform.ts:25) uses `app_tenant_for_slug` for `<slug>.SHOP_DOMAIN`, else `app_tenant_for_host` (a whole-host match
  in `tenant_domains`); cached 60 s, tag `host:<h>` (storefront.ts:56-63).
- **The slug:** 3–30, `[a-z0-9-]`, no `--`, a reserved list in `src/domains/signup/slug.ts` (not in the database).
  Changeable by owner/admin **only before the shop opens** (`app_change_shop_address`, drizzle/0010); the old slug is
  freed at once with no redirect; only an audit row remembers it. **Admin's new-merchant form uses a looser rule**
  (1–40 chars, `--`, reserved words allowed): a real inconsistency.
- **`tenant_domains`:** `host, tenant_id, created_at`; frata_app may only read; frata_admin select + insert; no one can
  update or delete. Only Admin's createMerchant writes a row (the platform host, display only, stale after a rename).
- **URLs built from the platform host even on an own domain:** canonical, Open Graph, structured data, sitemap.xml,
  robots.txt. Relative and host-proof: old product handles (308), `/orders#t=`, Razorpay (in-page handler, no
  callback URL). Console-bound: Razorpay webhooks, sign-in links, previews.
- **Origin-bound shopper state:** bag (localStorage), offer code, attribution, checkout drafts (sessionStorage): a
  host change starts these afresh. Shop hosts set **no cookies**. Rate limits key on shop + IP/phone, never host.
  `requireShop` refuses a write whose Origin differs from Host.
- **HSTS `max-age=63072000; includeSubDomains` on every host** (security-headers.ts:27): on a merchant's apex domain
  it would force HTTPS on all their other subdomains for two years. Must change before own domains.
- **Production:** project `frata` has only `frata.vercel.app`; frrata.shop and frrata.com are not in the team yet.
  e2e fakes shops as `*.frata.test` over http (constants.mjs, run.mjs host-resolver rules).

## 2. Vercel, certificates, the PSL
| Fact | Status | Source (date) |
|---|---|---|
| A wildcard `*.frrata.shop` needs Vercel nameservers (or `_acme-challenge` NS delegation): wildcard certificates use DNS-01 | V | vercel.com/docs/domains/troubleshooting (2026-09-18) |
| The wildcard does not cover the apex; add `frrata.shop` (and `www`) separately; one level per certificate | V | docs multi-tenant configuring-domains (2026-09-16) |
| Buying through Vercel sets the nameservers | V | docs working-with-domains (2026-09-16) |
| frrata.shop at Vercel: $2.99 first year, **renews $38.39/yr**, transfer $59.99; .shop is not a free-with-Pro TLD | V-undated API / V 2026-09-02 | api.vercel.com registrar price |
| API: `POST /v10/projects/{id}/domains` (redirect + 301/302/307/308), `POST /v9/…/{d}/verify`, `DELETE /v9/…/{d}`, `GET /v6/domains/{d}/config` → `misconfigured`, `recommendedIPv4`/`recommendedCNAME` by rank | V | Vercel REST reference (read 2026-11-08) |
| Errors: 409 already on another Vercel project / not allowed; 402; 429 | V | same |
| `_vercel` TXT only when another Vercel account uses the domain; a new value on re-add | V | add-a-domain (2026-09-16) |
| Apex A record and www CNAME values are **per project** (76.76.21.21 or 216.198.79.1; a per-project `*.vercel-dns-017.com`); no IPv6; **www recommended as primary** | V | troubleshooting (2026-09-18) |
| Pro: soft limit 100,000 domains a project; domain writes 100/60 s, verify 100/60 s, config reads 500/60 s | V | /docs/limits (2026-09-16) |
| Let's Encrypt, HTTP-01; "wait 5 to 10 minutes"; renewal 14–30 days before expiry; CAA must allow letsencrypt.org; proxies (Cloudflare orange cloud) break issuance | V | working-with-ssl (2026-09-16) |
| The middleware sees the custom host unchanged | V | request-headers (2025-12-13) |
| Vercel advises: tenant domains on the **Public Suffix List**, the dashboard on another apex, `__Host-` cookies without Domain | V | configuring-domains (2026-09-16) |
| myshopify.com, vercel.app, github.io, wixsite.com are on the PSL | V | publicsuffix.org list VERSION 2026-11-06 |
| PSL submission: a `_psl` TXT kept in place, **> 2 years left on the registration**, no review-time guarantee | V Vercel / U PSL wiki 2025-05-23 | |
| Let's Encrypt limits 50 certificates per registered domain per 7 days, registered domain by the PSL | V | letsencrypt.org/docs/rate-limits (2026-08-05) |
| HSTS preload needs includeSubDomains, ≥ 1 year, "cannot easily be undone" | V-undated / V MDN 2026-09-11 | |
| Subdomain takeover: a record left pointing at a host that no longer serves it; remove DNS first | U (MDN 2025-09-10) | |
| Whether Vercel stops another account adding a domain we removed while its records still point at our project | U | no doc found |

## 3. Products
- **Shopify** [V-undated]: manual connect = A `23.227.38.65` + www CNAME `shops.myshopify.com`, "usually within two
  hours, up to two days"; automatic connect for Cloudflare, GoDaddy, IONOS; one primary domain, others redirect to it;
  **two myshopify names in total**, the old one redirects (admin login keeps the old one); trademark complaints by form,
  the merchant told in admin. *Taken:* records shown with Copy, a Check button, a primary with redirects, a limited
  number of renames whose old names redirect, a complaint path.
- **Squarespace** [V 2026-10-28]: a verification CNAME, A records, www CNAME; **unlinks after 15 days if the verify
  record goes**. *Taken:* keep checking; detach a domain whose proof is gone.
- **Domain Connect** [V-undated, domainconnect.org]: live at GoDaddy, Cloudflare, IONOS; not Hostinger, BigRock,
  Namecheap; a template per provider via pull request. *Taken (later):* one-click connect for GoDaddy and Cloudflare;
  step guides for the rest.
- **Chrome IDN display** [V-undated]: mixed scripts and lookalikes show as punycode. *Taken:* ASCII only, no `xn--`.

## 4. Trust and safety (integration-researcher, checked 2026-11-08; MeitY/PIB/gazette pages returned 403)
| Fact | Status | Source (date) |
|---|---|---|
| IT (Intermediary) Amendment Rules 2026, G.S.R. 120(E), in force 20 Feb 2026: court/government takedown **3 h** (was 36); grievances resolved **7 days** (was 15); unlawful content 36 h (was 72); intimate imagery 2 h (was 24); user advisory every 3 months; all intermediaries | S | Khaitan ERGO 2026-02-16; Cyril Shroff 2026-02-11 |
| 24 h acknowledgement unchanged | S | Khaitan 2026-02-16 |
| Draft Second Amendment (30 Mar 2026): advisories a condition of safe harbour; 180-day retention a minimum; not notified as of 24 Aug 2026 | S | LKS 2026-06-10; Medianama 2026-08-24 |
| E-Commerce (Amendment) Rules 2026 (G.S.R. 789(E), in force 1 Jan 2027): a yearly dark-pattern self-audit with a certificate; a copy of the complaint to the complainant; grievance 48 h / one month unchanged | S | ABS News 2026-09-11; lexcomply (undated) |
| Hindware v Google (Delhi HC, 22 May 2026): safe harbour lost by a tool that aids infringement | S | Medianama 2026-05-29 |
| Shopify: enforcement at the product level first, the account last; trademark notices shown to the merchant, who responds in admin | V-undated | shopify.com/legal/aup; help.shopify.com |
| Cloudflare Turnstile Free: 20 widgets, 10 hostnames each, no challenge cap; Siteverify mandatory; token 300 s, single use; reads no form inputs | V | developers.cloudflare.com 2026-08-14, 2026-10-22 |
| Safe Browsing API is non-commercial only (v4 deprecated) → Web Risk for commercial monitoring; v5 builds host checks from the PSL eTLD+1 | V-undated | developers.google.com/safe-browsing |
| Search Console Domain property covers all subdomains, DNS-verified | V-undated | support.google.com/webmasters/answer/34592 |
| Disposable-email list (CC0) carries no accuracy guarantee: a signal, not a block | V-undated | github disposable-email-domains |
| GSTIN/PAN lookup APIs (Cashfree Secure ID): no public rate card | V-undated | cashfree.com docs |

Not verified: the gazette texts; whether a SaaS store builder is an "intermediary" under s.2(1)(w) (a lawyer to
confirm); Web Risk pricing (snippet: 100,000 a month free, then $0.50/1,000); PUMA v IndiaMART; Razorpay's prohibited
list for counterfeits.

## 5. Could not verify
Shopify's reserved store-name words; whether GoDaddy accepts any third-party Domain Connect template; Hostinger
Domain Connect; Vercel's protection against re-adding a removed domain; real certificate issuance times; PSL review
time; whether Razorpay checks the website domain a merchant registered (to check before own domains go live).
