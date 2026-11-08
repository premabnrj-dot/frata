# Shop addresses: a frrata.shop address for every shop, and the merchant's own domain
Status: draft (mockup for the owner) · Date: 2026-11-08 · Mockup: https://claude.ai/artifact/BStSSZeC35kgWfxQQ6VWNz (`docs/mockups/2026-11-08-shop-addresses.html`) · Approved: —
Research: `docs/research/2026-11-08-shop-addresses.md` (integration-researcher and a codebase map, 2026-11-08).
Owner, 2026-11-08: buys **frrata.shop**; "help me connect with the system"; plan how merchants get a subdomain and
attach their own domain themselves; review every scenario, stress test, security, UX, the boundaries — what Admin
handles and what the merchant controls. Messages and email are parked until this is planned.
Supersedes the brand spec's B·4 line ("shop subdomains … on frrata.com"): shops live on **frrata.shop**, Frrata on
**frrata.com**.

## Goal
A shop that can't be reached can't sell. Today production has no shop address at all (only `frata.vercel.app`, which
serves the console). This gives every shop a working address the day it opens (problem 4, conversion: a link a
shopper trusts) and lets a brand use its own domain (problem 5, a premium storefront), without a developer and without
Frrata's team touching DNS.
Measures: shops reachable on their address the moment they open (100%); own-domain connections finished without a
support ticket (≥ 90%); a connected domain that breaks reaches shoppers on the fallback address within 24 hours (100%).

## Job
A brand picks a name once and shares `kesar-studio.frrata.shop`. When it is ready it connects `kesarstudio.in` by
copying three records, sees each one turn green, and makes it the main address; shoppers on the old address arrive at
the new one. Frrata's team only steps in for disputes, abuse and names that copy someone else's brand.

## The boundaries

**1. Three domains, three jobs** (Vercel's advice: tenant domains apart from the dashboard).

| Domain | Serves | Who controls it |
|---|---|---|
| **frrata.com** | Frrata's website, people's mail, later `app.frrata.com` (console) and `notify.frrata.com` (notices) | Frrata |
| **frrata.shop** | `<name>.frrata.shop`: one per shop; the apex and `www` go to frrata.com | Frrata (wildcard, certificates, the Public Suffix List entry) |
| **The merchant's domain** | `kesarstudio.in` (naked; `www` redirects to it — owner, 2026-11-08) | The merchant (their registrar, their DNS); Frrata serves it once proven |

**2. What the merchant controls** (owner and admin; a partner before handover; never staff; support visits read only):
- the frrata.shop name: free changes until the shop opens; after that **two changes**, each old name redirecting for
  good and never given to another shop;
- their own domains: add (up to 4 hosts), check, make one the **main address**, remove;
- what shoppers see when they connect: nothing changes until they press "Make it your main address".

**3. What Frrata Admin handles** (admin role, every action with a reason, in Admin › Activity, the shop told):
- **rename a shop's name** (impersonation, trademark, a name that misleads) and **freeze** further changes;
- **detach a domain** (phishing, a dispute) and **block** a name or domain from every shop;
- **release** a retired or held name (only Admin; never automatic);
- the **names list**: reserved words (ours, technical), protected brands, offensive words;
- **domain health**: every failing domain, Vercel sync failures, a **Retry**.
Admin does not connect a merchant's domain for them (the merchant's DNS is the merchant's); support visits can read
the screen to help.

**4. What Frrata does by itself** (no person): the wildcard and certificates for frrata.shop; adding and removing
domains on Vercel (outbox rows, ADR-0006); re-checking every connected domain daily; **falling back** to the
frrata.shop address when the main domain fails for 24 hours; **detaching** a domain whose proof has been gone for 15
days (Squarespace's rule); redirects from old names and other domains to the main address.

**5. What we deliberately do not do (now):** sell domains (later: Vercel's registrar API, if merchants ask); edit a
merchant's DNS for them (later: Domain Connect for GoDaddy and Cloudflare); touch email records (MX stays theirs; our
records never conflict with mail); non-Latin domain names (`xn--`, homoglyphs).

## Design (mockup: the screens below, as drawn)

**A name at sign-up** (exists; tightened). "Your shop's address: **kesar-studio**.frrata.shop · Available". Rules: 3–30
letters, digits, single hyphens; not reserved, protected or offensive; never a retired name. Admin's new-merchant
form uses the same rule (today it does not).

**Settings › Shop address** (one page; the console's settings list):
- **Your frrata.shop address** card: `kesar-studio.frrata.shop` with Copy and Open; "Main address" badge when no
  own domain is main; **Change** (before opening: free; after: "2 changes left · the old address keeps working").
- **Your own domain** card: each domain with its state in words; **Connect a domain**; the main one marked.
- Staff see the page read-only; a support visit sees it with buttons disabled and why.

**Connect a domain** (a page, three steps, resumable):
1. **Your domain**: type `kesarstudio.in`. The naked domain is the main address and `www.kesarstudio.in` redirects to
   it (owner, 2026-11-08); a subdomain like `shop.kesarstudio.in` works too. **Where did you buy
   it?** GoDaddy · Hostinger · BigRock · Namecheap · Cloudflare · Other → the matching step-by-step guide.
2. **Add these records** (each with Copy; values read from Vercel for this project, never hard-coded):
   - `TXT  _frrata  frrata-verify=7c1e…` — proves the domain is yours;
   - `A  @  76.76.21.21` (the value Vercel recommends for our project);
   - `CNAME  www  ….vercel-dns-017.com`.
   "Don't change your MX records: your email stays where it is." "Using Cloudflare? Set these to DNS only (grey cloud)."
   **Check records** → each record turns green or says what is wrong in words.
3. **Securing**: "Getting a secure certificate (usually 5–10 minutes)" → **Connected** → the choice:
   **Make it your main address** (a dialog listing what happens) or **Keep it as a second address**.

**Naked domains (owner, 2026-11-08: "I would prefer naked domains").** Possible without a real issue:
- The apex takes an **A record** (DNS allows no CNAME at the apex); the www host takes a CNAME and redirects (308) to
  the apex. Vercel recommends www only because a CNAME lets it re-route without the merchant changing anything.
- The one cost: if Vercel ever changes the IP it recommends for our project, the merchant must edit one A record. Our
  daily check sees it ("Points to an old Vercel address · change it to …") and says so; Vercel keeps answering on its
  published anycast IPs. Cloudflare users can use CNAME flattening and never hit this.
- Nothing else differs: shops set no cookies (so apex cookies can't leak to the merchant's other subdomains), HSTS on
  own domains is sent without includeSubDomains, and an A record at the apex never conflicts with MX (email).
- **frrata.com and frrata.shop are naked too**: their nameservers are Vercel's, which answers the apex itself (no IP
  for anyone to update); `www.frrata.com` redirects to `frrata.com`.

**Make it your main address** (dialog): shoppers who open kesar-studio.frrata.shop or www.kesarstudio.in arrive at
kesarstudio.in (same page); links you shared keep working; bags in progress start afresh (do it in a quiet hour);
Google moves your pages over a few weeks. Buttons: **Make it main** · **Not now**.

**Problems, in words** (each with one way on):
- Records not found yet · "DNS can take up to 48 hours. We check every 10 minutes for the first day."
- Pointing elsewhere · "Your A record points to 3.110.… (your old site). Change it to 76.76.21.21."
- Cloudflare proxy on · "Turn off the orange cloud for these two records."
- Certificate blocked by CAA · "Your domain allows only DigiCert to issue certificates. Add letsencrypt.org."
- Connected to another shop · "This domain is connected to another Frrata shop. If it's yours, add the TXT record
  above: whoever proves it gets it, and the other shop is told."
- Main domain stopped working · banner on every console page for owners and admins: "kesarstudio.in stopped
  working on 12 Nov. Shoppers are being sent to kesar-studio.frrata.shop until it's fixed. **See what's wrong**."

**Admin › Merchant › Addresses** (tab): current name, old names (redirecting), domains with state and last check;
actions with a reason: **Rename**, **Freeze changes**, **Detach domain**, **Retry sync**. **Admin › Names**: reserved,
protected, blocked; add, remove, release a held name. **Admin › Domain health**: failing domains and sync errors.

## Data and rules (for the plan; every table with tenant_id, grant, RLS, policy in one migration)
- **`shop_names`** (name PK, tenant_id, became_main_at, retired_at): every name a shop has had. The current one is
  the row without `retired_at`; old ones redirect (308) to the current; no name is ever reused by another shop (the
  primary key holds it). `tenants.slug` stays as the current name (a mirror kept by the one function that renames).
- **`shop_domains`** (host PK, tenant_id, apex, token, claimed_at, proved_at, added_at, dns_ok_at, cert_ok_at,
  failing_since, main_at, removed_at, removed_reason): state **derived from timestamps** (claimed → proved → added →
  connected → main; failing; removed), no status column. One main per shop (partial unique index). A claim that is
  not proved in 7 days lapses; **a claim never blocks another shop** — the first valid proof wins, and a fresh proof
  from another shop moves the domain (the DNS owner decides), telling the previous shop.
- **`blocked_names`** (name or domain, kind reserved/protected/blocked/offensive, reason, by): Admin-managed; the pure
  rule checks shape; the database checks the list.
- `tenant_domains` is retired into `shop_domains` (its only rows are Admin's platform-host rows, display only).
- **Lookup:** `tenantForHost` reads `shop_names` (any name, current or old) and `shop_domains` (proved and added,
  not removed) through the definers; the response says "serve" or "redirect to <main host>"; cached per host with
  `host:<h>` tags, revalidated on every change (`refreshHosts`).
- **The main address** is what canonical, Open Graph, structured data, sitemap.xml and robots.txt use (today: always
  the platform host) and what Make a link, Copy link and (later) emails use.
- **Vercel calls** are outbox kinds `domain.add`, `domain.remove`, `domain.check`; one owner module
  `src/lib/domains/vercel.ts` holds a team token scoped to the project; 409 "already on this project" is success.

## Stress test (what happens when…)

| Situation | What happens | Where it shows |
|---|---|---|
| Two people sign up for `kesar` at once | The name's primary key: one wins, the other is told "Just taken" | Sign-up |
| A name copying a big brand (`fabindia-sale`) | Refused if on the protected list; otherwise Admin renames on a complaint, with a reason | Sign-up; Admin |
| A name with lookalike letters | ASCII only; `xn--` refused | Sign-up |
| A shop renames after opening | Old name redirects forever (same path); WhatsApp and Instagram links keep working | Settings: "1 change left" |
| A retired name someone else wants | Never reused; Admin may release it with a reason | Admin › Names |
| A shop closes | Its names are held (not released); its domains are removed from Vercel at once; the owner is told to delete their DNS records | Admin; the closing notice |
| A merchant types a domain they don't own | It stays "claimed", never served; lapses in 7 days; blocks nobody | Settings |
| Someone points a domain at us without connecting it | Not on our project → Vercel serves nothing for it; if added by another shop, it still needs the TXT proof | — |
| The real owner arrives after a squatter's claim | Their TXT proof wins; the squatter's claim lapses | Both shops' settings |
| A domain is sold to a new owner | Its records change: checks fail → after 24 h the old shop falls back; after 15 days without proof it is detached; the new owner can prove it for their shop | Banner; Admin |
| The registrar can't put a CNAME on the apex | We use an A record for the apex and a CNAME for www | Step 2 |
| Cloudflare orange cloud | Certificate fails; we say "DNS only" | Step 3 problem |
| A CAA record allows another authority only | We say which and what to add | Step 3 problem |
| The merchant edits MX by mistake | Not ours to fix; the guide warns before; the check never asks for MX | Guide |
| Certificate takes long | "Securing" for up to an hour; then a problem in words | Step 3 |
| The main domain expires at the registrar | Checks fail → after 24 h shoppers go to the frrata.shop address; owner banner | Banner |
| Changing the main address | Bags and checkout drafts in progress start afresh (per-browser storage); orders already placed are untouched (`/orders#t=` works on every host) | Dialog warns |
| Shared links to the old main address | 308 to the new main, path kept | — |
| Vercel API down or rate-limited | Outbox retries; the merchant sees "Waiting on our side"; never a half-connected domain shown as connected | Settings; Admin › Domain health |
| 500 shops connect in a festive week | Vercel allows 100 domain writes a minute; the outbox drains in order | — |
| A shop's frrata.shop subdomain sets a cookie for another shop | Shops set no cookies today; frrata.shop on the Public Suffix List makes it impossible in browsers; a gate keeps shops cookie-free until then | — |
| HSTS on a merchant's domain | Own domains get HSTS **without includeSubDomains**, so their other subdomains (old site, webmail) are never forced to HTTPS | — |
| A phishing store on frrata.shop | Admin freezes the shop and detaches its domains; the PSL keeps one shop's flag (Safe Browsing) from marking all of frrata.shop | Admin |
| Staff or a support visit | Read only, with the reason on each button | Settings |
| A partner after handover | No longer sees the shop; the owner controls addresses | — |
| Razorpay and a new domain | Payments run in-page with no callback URL; whether Razorpay checks the merchant's registered website is checked before D·2 ships | Plan |

## Design review (frata-planning § 3)
- **UI/UX:** one primary action per step (Check records; Make it main; Change); the state of each record in words
  and colour; defaults that work (a frrata.shop address the moment the shop opens, www as main); constraints over
  refusals (only valid names can be typed; records are copied, not typed); undo (make the frrata.shop address main
  again, one tap). Phone: the records list stacks, Copy stays next to each value.
- **Tenancy:** the host decides the shop only through the definers; a domain becomes a shop's only after its TXT
  proof (never because a form said so); names and domains are unique across shops; Admin writes through
  `frata_admin` with reasons. `tenancy-auditor` on the plan.
- **Modularity:** pure `src/domains/addresses/` (name rules, domain normalisation and PSL-aware validation, the state
  from timestamps, which host is main, what to redirect); I/O `src/lib/domains/` (Vercel, DNS TXT lookup, the check
  job); reads in `src/lib/queries/addresses.ts`; screens in Settings and Admin.
- **SSOT:** the main address computed once (`mainHostFor`) and read by canonical, sitemap, links and emails; a
  domain's state from its timestamps; names in one table (current + old).
- **YAGNI:** no registrar reselling, no Domain Connect, no IDN, no per-path redirects — each with its signal.
- **KISS:** one table per idea (names, domains, blocked); one outbox kind per Vercel call; one daily check.
- **Scalability:** domains ≤ 4 per shop; 500 shops → ≤ 2,000 domains (Vercel soft limit 100,000); daily checks 2,000
  config reads ≈ 4 minutes at 500/min.
- **Performance:** the host lookup stays one cached read (60 s, tag-invalidated); redirects are served from the cached
  lookup; no DNS call in a shopper's request.
- **Reliability:** Vercel and DNS calls through `fetchWithTimeout` and the outbox; a failed check never removes a
  domain at once (24 h to fall back, 15 days to detach).
- **Security:** TXT proof before serving; the Vercel token in one module; Zod caps on names and hosts; rate limits
  (10 domain adds a day a shop; Check every 30 s); no cookies on shops; PSL entry; HSTS split; retired names never
  reused; Admin actions with reasons; `security-reviewer` on the plan.
- **Motion and visuals:** the three steps as a stepper; records turning green use the existing flash; a small diagram
  of the three domains on the page's (i).
- **Unit economics:** frrata.shop renews at $38.39/yr (₹3,263); Vercel charges no per-domain fee on Pro; own domains
  are included on every plan (recommended; owner call 4).
- **Blast radius:** the host lookup (every shop request), canonical/sitemap (SEO), Admin's merchant form, the address
  settings page, HSTS headers (every response), e2e host rules (`*.frata.test`).

## Phases
| Phase | What | Needs |
|---|---|---|
| **D·0 Connect frrata.shop** | Nameservers at Hostinger → Vercel; `frrata.shop`, `*.frrata.shop`, `www.frrata.shop` on project `frata`; `NEXT_PUBLIC_SHOP_DOMAIN=frrata.shop`; apex and www to frrata.com; `_psl` TXT + the PSL request; Admin's name rule = sign-up's | the purchase; no migration |
| **D·1 Names** | `shop_names`, `blocked_names`; renames after opening with redirects; Admin rename/freeze/release; the names list | D·0 |
| **D·2 Own domains** | `shop_domains`, the connect flow, checks, main address, fallback, detach; canonical/sitemap on the main host; HSTS split; Admin detach/health | D·1; Razorpay website check |
| **D·3 One-click connect** | Domain Connect for GoDaddy and Cloudflare | templates accepted |
| Later | Buying a domain through Frrata; console to app.frrata.com (its own small spec: Supabase redirect URLs, cookies) | signals |

## Owner calls (recommendations first)
1. **frrata.shop: bought at Hostinger for 1 year (owner, 2026-11-08; registry review up to 24 h).** Keep it there and set
   its nameservers to Vercel's (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`): the wildcard needs Vercel's nameservers,
   not Vercel as registrar. Extend to 3 years before the PSL request (> 2 years left). If the review refuses it, buy it
   at Vercel ($2.99, renews $38.39). **Buy frrata.com at Vercel now** ($12.03/yr, available 2026-11-08).
2. **Renames after opening: two**, old names redirect forever and are never reused (Shopify allows two names in all).
3. **Naked domains as the main address — decided (owner, 2026-11-08)**: `kesarstudio.in` main, `www` redirects;
   frrata.com and frrata.shop naked too.
4. **Own domains on every plan**, no extra fee (Vercel charges none; Shopify includes it).
5. **frrata.shop on the Public Suffix List** (Vercel's advice; what Shopify, Vercel and GitHub do).
6. **Fallback after 24 hours, detach after 15 days** without proof.

## Out of scope (and what brings each back)
Selling domains (merchants ask "can I buy one here") · Domain Connect (D·3) · non-Latin domains (a merchant asks,
with a homoglyph policy) · per-path redirects from an old website (a merchant migrating from WooCommerce asks) ·
email on the merchant's domain (messaging E·3, parked) · console on frrata.com (its own spec).

## Facts used
`docs/research/2026-11-08-shop-addresses.md`; recorded in `frata-integrations` § Domains (checked 2026-11-08).
