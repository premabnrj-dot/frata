# ADR-0017: Shop websites run on Cloudflare Workers for Platforms, in an account apart from the console

Status: **accepted as revised: Vercel only** (owner, 2026-11-16: "approve all" (decision page https://claude.ai/artifact/ChPS16kSEiabXz4J5Q7ALT), decision S1; rules 3, 4 and 6 superseded by ADR-0019). Earlier: **proposed, revised** (2026-11-15). The owner: "why not stick to vercel only for now? do not wish to have
complexity". **Revised recommendation: Vercel only for now** (§ Revised recommendation below); the Cloudflare design
stays drawn as the second adapter. Owner, 2026-11-15: "we can go ahead for the test then. If this is too much of work,
we can plan testing later": **the test is planned as V2's first step** (§ The test, when) · amends ADR-0005 · Pairs with: ADR-0014
amendments 4, 6, 7 and 8; `docs/specs/2026-11-12-kit-and-fleet.md` (§ 1 Domains, § 4 Controls, § 5 Lanes, § 6 Fleet,
§ 7 Security); `docs/specs/2026-11-11-agentic-storefront.md` (V2 and its kill signal); ADR-0016

## Context
- ADR-0014 amendment 4: shop websites run in a separate hosting account that Frrata owns, pays for and runs, never the
  Vercel team that runs the console and checkout. Brands need no host account. Frrata reaches the host through a
  hosting adapter, and a Frrata-owned router stands in front of every domain. Hosting is in the plan: allowances, then
  overage at 3× cost. This record must come before V2.
- Amendment 7 and the kit spec § 1: code sites live on their own registrable domain on the Public Suffix List
  (placeholder `frrata.site`), previews on a second one, never on `frrata.shop`, the console, Admin or Studio's domain.
- The kit spec fixes what the host must carry: an egress allow-list enforced at runtime (§ 4); attested artifacts
  only, kept deployments for rollback, our own waves, 24 h to patch every site (§ 5); a deterministic fleet service
  inside the hosting account, which alone holds the host token, with no fleet-wide storefront key (§ 6); checkout,
  sign-in and order pages never through a third-party router (§ 7).
- ADR-0005 says one Next.js app on Vercel serves the console and every storefront. That stays true for the console,
  checkout and theme shops. It is not true for code sites, which this record moves out.
- The Studio spec drafted the allowances from Vercel's overage: Launch 50 GB + 100 build minutes, Growth 200 GB + 300,
  Scale 1 TB + 1,000; then ₹40/GB and ₹4/minute (`docs/specs/2026-11-11-frrata-studio.md:55`). They were to be re-sized
  once the host was chosen.
- The V2 kill signal: "hosting cost per shop above what plans recover".

## Revised recommendation (2026-11-15, after the owner's question)
1. **Code sites run on Vercel**, in a second Vercel team Frrata owns (`frrata-sites`), one project per site, Next.js
   native, bom1. The console's team never holds site code or its tokens (ADR-0014 amendment 4 stands). No OpenNext,
   no Cloudflare account, no one-week spike.
2. **What we accept by it:** bandwidth is the cost (0.3 MB a page is our guess, not a measurement); no server-side
   egress control on Vercel, so site code's outbound calls are limited by the kit's checks before deploy and the
   site's CSP in the browser, not at runtime; Vercel's written word on hosting sites inside Frrata's plans
   (Vercel for Platforms) is asked before the first paid site.
3. **Allowances are priced on Vercel's numbers measured on the first sites** (bytes and requests per page view,
   build minutes), not on today's guesses, which fail the 3× rule. Hosting is priced (an owner decision) before it is
   sold.
4. **The adapter stays the only door to the host**, so moving to Cloudflare later changes the adapter, not the app.
   Move when: a plan's median hosted site costs more than a third of its hosting line for two months; or a site needs
   egress control we can't get; or Vercel declines the terms.

## The test, when (owner, 2026-11-15)
Only shop websites would ever move; the console, Admin, checkout, payments and orders stay on Vercel bom1 whatever the
test says (rule 4 below: checkout is redirected, never proxied). The test runs as **V2's first step**, once lane A has
built Starter 0 (V1): the same Starter 0 deployed to a Vercel `frrata-sites` project and to a Cloudflare Workers for
Platforms namespace, one week, measuring bytes, requests, CPU and build minutes per page view, preview and domain
set-up, and the time to patch 20 sites. Vercel stays the choice unless Cloudflare's measured cost per site is far lower
and OpenNext passes the starter bar. Before then the owner opens a Cloudflare account in the company's name (Workers
Paid, $25 a month), or the test runs on Vercel's numbers alone.

## Options compared (sources dated; checked 2026-11-15; ₹88/$; ex GST)
| | Cloudflare Workers for Platforms | Vercel, a second team | Netlify | AWS Amplify |
|---|---|---|---|---|
| Isolation between sites | A user Worker per site in a dispatch namespace; untrusted mode by default, no shared cache (`caches.default` off) (limits, 2026-11-03) | A project per site: own builds, functions, env (multi-project reference, 2026-09-03) | A site per shop (no current source on isolation: unverified) | An app per shop (quotas page, undated) |
| Next.js with ISR | Through OpenNext: Next.js 16 and the latest 15 minor; App Router, ISR, image optimisation supported (opennext.js.org, undated; release 1.20.17 on 12 Nov, year not shown). **No published guide for OpenNext as a user Worker in a namespace: unverified.** Cache API is off in namespaces, which some OpenNext cache options use | Native | Through its adapter (no current source: unverified) | Next.js 12–15 only; on-demand ISR and streaming unsupported (support page, undated) |
| Per-site deploys and previews by API | Script upload API; static assets per user Worker; 1,200 API calls per 5 min (limits, 2026-11-03); **no gradual deployments for user Workers**. Previews are our own: the router on the preview domain (a wildcard on our own zone) maps a signed host to a preview script | Create project and deployment APIs; 1,000 deployments an hour (reference, 2026-09-03; the kit spec read 450 an hour and 6,000 a day in 2026-09); multi-tenant preview URLs Enterprise only (limits, 2026-09-08) | Deploy API; 15 credits a production deploy (pricing, undated) | 25 app creations an hour, not adjustable (quotas, undated) |
| Custom domains and TLS at hundreds | Cloudflare for SaaS: 100 hostnames included, then $0.10 each a month, up to 50,000; TLS issued automatically (plans, 2026-08-14). **Apex domains need apex proxying, an Enterprise paid add-on**; otherwise the brand uses `www.` and redirects its apex (apex proxying, 2026-06-10) | Unlimited on Pro (soft 100k a project); TLS automatic; apex by A record; 100 domain additions an hour a team (limits, 2026-09-08) | Custom domains with TLS on every plan (pricing, undated) | 5 domains an app, adjustable (quotas, undated) |
| Router and egress control | The dispatch Worker is the router; an **outbound Worker sees every `fetch()` of site code** and `connect()` is off; it does not see fetches from Durable Objects (outbound Workers, 2026-04-21) | Firewall is inbound. **No egress control for functions found** (search 2026-11-15: unverified); static IPs only fix the source address | None found: unverified | None found: unverified |
| Near Mumbai | Runs at the edge nearest the shopper; placement hints take `aws:<region>` but the page does not mention Workers for Platforms (placement, 2026-10-12): unverified for user Workers. No India residency without the Enterprise Data Localization Suite (kit spec § Research) | bom1 (regional pricing, 2026-09-14) | No Mumbai functions region; nearest is Singapore (functions, 2026-09-17) | ap-south-1 offered (no current source: unverified) |
| Pricing basis | $25 a month: 20M requests and 60M CPU ms, then $0.30/M and $0.02/M ms; 1,000 scripts, then $0.02 each (pricing, 2026-04-21). **No charge for bandwidth**; static asset requests free (Workers pricing, 2026-11-13). Builds: Workers Builds $0.005/min (2026-10-28) as a reference for our own runner | bom1: $0.20/GB, $2.20 per 1M CDN requests, ISR reads $0.44/M (2026-09-14); $20 a seat (pricing, undated) | Credits: $0.13/GB, $1 per 1M requests, $0.10 a deploy at the Pro pack rate (pricing, undated) | $0.15/GB, $0.30 per 1M SSR requests, $0.01 a build minute (pricing, undated) |
| Terms for hosting brands' sites | Allowed **"as part of your integrated SaaS application"**; never standalone, never as "a managed service provider or reseller", never brands' access to the dashboard or API (service-specific terms, 2026-09-28). The self-serve agreement bars selling "access to the Services to any third party" (2.2.1(a); last updated 2025-09-12, older than 12 months) | Section 12 bars "resell … make the Services available to any third party" and "service bureau purposes" (terms, 2026-10-19), beside a product sold for platforms: needs Vercel's written word | The Enterprise agreement bars resale except by a separate written agreement; resale is a partner addendum (search 2026-11-15; dates unverified) | Not checked |
| Lock-in | Dispatch, outbound Workers and Cloudflare for SaaS are Cloudflare's own; OpenNext also targets other hosts | Lowest for code (Next.js is Vercel's); domains and previews are Vercel's | Medium | Medium; the quotas are the limit |

### Cost per site (hypotheses; figure · source · date · test)
Assumed: page views a month Launch 40k, Growth 400k, Scale 1.33M (from the plans' order counts at ~1.5% conversion
and 4 pages a visit); 5 site requests and 0.3 MB without images per page view; 8 ms CPU a request; images from
Frrata's media host (ADR-0005's line, not here); mix 60/30/10. Test: the V2 spike's measured requests, CPU and bytes
on Starter 0, then month 1's invoice.

| Host | 50 sites a month | 500 sites a month |
|---|---|---|
| Cloudflare WfP | ≈ $60 (≈ ₹106 a site): base $25, requests $15, CPU $10, cache storage ~$10 | ≈ $507 (≈ ₹89 a site): requests $203, CPU $109, hostnames $40, scripts $80, cache ~$50 |
| Vercel second team, bom1 | ≈ $890–1,090 (≈ ₹1,560–1,910 a site): 4,160 GB at $0.20 is most of it | ≈ $10,500 (≈ ₹1,850 a site) |
| Netlify Pro | ≈ $700 (≈ ₹1,230 a site) | ≈ $6,950 (≈ ₹1,220 a site) |
| Amplify | ≈ $665 (≈ ₹1,170 a site), before $15 a site for WAF | ≈ $6,650 (≈ ₹1,170 a site), and quota increases |

Bandwidth decides it. Sites are page traffic, and only Cloudflare does not meter bytes.

### The drafted allowances at 3× (`frata-unit-economics` rule 9a)
- **On Vercel bom1 they fail.** Launch's 50 GB costs $10 (₹880); 3× is ₹2,640, more than Launch's whole ₹1,499.
  The ₹40/GB overage is below 3× of ₹17.60 (₹52.80).
- **On Cloudflare a GB costs nothing**, so a GB allowance meters nothing Frrata pays. Requests and CPU are the cost:
  ≈ $0.46 per million page requests (₹40.50), so 3× is ₹121.50, rounded to **₹125 per million**. Build minutes hold at
  ₹4/minute while our runner costs ≤ $0.015 a minute (band: $0.005 Workers Builds to $0.014 Vercel Standard; the
  fleet's runner is **unverified** until the spike).
- Cost of the included allowance, and its 3× (hosting only, Cloudflare): Launch ₹92–171 (3× ₹277–515), Growth
  ₹251–489 (3× ₹752–1,465), Scale ₹748–1,540 (3× ₹2,244–4,620). Build minutes are most of it. Frrata's patch builds
  are never counted against a shop (kit spec, Unit economics).

## Decision (proposed)
1. **The first adapter is Cloudflare Workers for Platforms**, in a Cloudflare account Frrata's company owns, apart
   from the Vercel team `premabnrj-dots-projects`. One dispatch namespace for live sites, one for previews. Each site
   is one user Worker named by site id, never by shop name. The second adapter, kept drawn but unbuilt, is a Vercel
   team of its own (project per site).
2. **The adapter is the only door to the host.** It lives in the fleet service inside the hosting account, which alone
   holds the host token (kit spec § 6). Its calls: create a site, deploy an attested artifact, promote, roll back to a
   kept deployment, add, check and remove a domain, set limits, set the egress list by policy version, kill. This app
   never calls the host: it writes `site_deployments` rows and outbox kinds `site.build`, `site.promote` and
   `site.domain` in the same transaction (ADR-0006); results come back as `webhook_events`.
3. **The router is Frrata's dispatch Worker** on the sites' domain, with Cloudflare for SaaS custom hostnames whose
   fallback origin is that zone. It maps host → site id from config pushed as rows through the outbox and held at the
   edge, so break-glass and kill switches work when this app is down. It sets headers and CSP from the signed policy
   version, serves only attested artifacts, waves rollouts site by site (user Workers have no gradual deployments), and
   serves "Opening soon", maintenance and closed pages.
4. **Checkout, cart, sign-in and order paths are redirected, never proxied**, to the shop's checkout host on Frrata's
   Vercel app in bom1 (`checkout.<brand domain>`, Storefront API spec § 4). Policies, the legal block and share images
   reach a site as API data and Frrata media URLs. The router carries page requests only (kit spec § 7).
5. **Egress is the outbound Worker**: every `fetch()` of site code goes through it and only the policy's hosts pass
   (Frrata's API, media and checkout; allowed fonts). No site Worker may bind a Durable Object, because those fetches
   bypass it. Each site gets CPU and sub-request caps.
6. **Domains.** Sites on Frrata's sites domain and previews on a second registrable domain, both on the Public Suffix
   List. A brand connects `www.<its domain>` in the console (`CAN_MANAGE`, as today); the console shows the DNS record,
   TLS is issued by Cloudflare. **The apex redirects to `www.`** at the brand's registrar, until a signal pays for
   Enterprise apex proxying (owner decision 2).
7. **Previews** run in the preview namespace behind the signed preview (kit spec, Handover; content-layer preview
   token). They are never indexed, never on a brand's domain, and deleted after 30 days.
8. **Retention.** Each site keeps its live deployment and the last 10 (rollback never below the minimum version, kit
   spec § 5). Build logs and screenshots 90 days. When a shop closes, the router serves the closed page at once; its
   Workers, hostnames and repository go 90 days later (kit spec § 7).
9. **Patch lane pacing.** Rollouts are paced under 1,200 API calls per 5 minutes; at 3 calls a site, 1,000 sites take
   ≥ 13 minutes of calls, within the 24 h target. Off-peak IST windows; festive freeze as in the kit spec.
10. **Allowances are re-sized to what Cloudflare meters** (owner decision 3): page requests Launch 0.5M, Growth 3M,
    Scale 10M a month, then ₹125 per million; build minutes 100 / 300 / 1,000, then ₹4 a minute; bandwidth fair use
    with no meter. Never a hard stop on selling: amber at 80%, then overage (pricing ladder).
11. **The kill signal, measured.** Each month, the host and build-runner invoices are shared out per hosted shop by its
    measured requests, CPU and build minutes, plus an equal share of fixed fees. If for two months running a plan's
    median hosted shop costs more than one third of that plan's hosting line plus the overage it paid, V2 stops
    taking new shops and the allowances are priced again. Proposed hosting lines: Launch ₹500, Growth ₹1,500,
    Scale ₹4,500 (owner decision 4). At the top of the build-cost band, a shop that uses all its build minutes sits at
    the line (Launch ₹171 against ₹167; Scale ₹1,540 against ₹1,500); the spike's measured build price settles it.
12. **No India residency claim** for sites. Shopper data never reaches the sites' host: sites hold no forms, no
    sessions, no personal data (ADR-0014 rule 3, the kit's hard floor).

## Before V2 builds on it (a spike, one week)
Starter 0 built with OpenNext, deployed as a user Worker in a namespace, ISR 60 s with tag purge, behind the dispatch
and outbound Workers. It passes the starter bar. We measure requests, CPU, bytes and build minutes per page view and per
build, and the time to ship a Next.js security patch to 20 sites. If it fails, the Vercel adapter is built instead and
the allowances are priced again on Vercel's numbers (they fail 3× as drafted).

## Switch when
- The kill signal in rule 11 fires on Cloudflare's own numbers.
- OpenNext lags a Next.js security fix by more than 24 h, or drops a feature the starter needs (ISR, images).
- Cloudflare will not confirm in writing that hosting inside Frrata's plans is an "integrated SaaS application".
- More than one brand in five refuses `www.` and Enterprise apex proxying costs more than Vercel's difference.
- Cloudflare changes the price of requests, scripts or hostnames by more than 50%.

## The pilot, before V2 (owner, 2026-11-15)
The owner: "let's use our own claude code first" and, on hosting the first sites in a Frrata-owned account with the
cost measured, "yes".
- **Who builds:** Frrata builds the first websites itself with Claude Code, on the starter (SA1b), before partners and
  before Studio. Partners may bring their own Claude Code on the same repo, skills and checks; Studio (V3) comes later.
  The guardrails live in the repo and its checks, never in the agent, so they hold whoever writes the code.
- **What Frrata pays:** nothing for the model or the sandbox when a developer brings their own Claude Code (their
  plan, their machine or Claude's cloud); the API, checkout and orders as today, inside the plan and order fee; the
  pilot's hosting, below.
- **Where the first 1–3 sites run:** for the test, the owner's existing Vercel team (owner, 2026-11-15: "since we
  testing we can have normal vercel for now"), one project per site, separate from the `frata` app project, the
  store's public key set as a Production variable, never in the repo. Before real shoppers pay on a site, its team is
  on a plan that allows commercial use; the separate `frrata-sites` team the test above names comes with V2. Its cost is absorbed as a pilot cost and measured per site (bytes, requests, build
  minutes, the team's base fee), and those numbers price hosting's allowances before V2 (owner questions 3 and 4 above).
- **Where the code lives:** for the test, one private repository per site under the owner's existing GitHub account
  (owner, 2026-11-15: "same with github for testing"), created from the starter, beside `frata`; a developer is added
  to that repository only. The Frrata organisation of ADR-0016 § 2 comes before partners build sites.

## What the owner sets up
- A Cloudflare account in the company's name; Workers Paid with Workers for Platforms ($25 a month); billing by the
  company card; GST treatment of an imported service checked with the CA.
- Staff sign in with passkeys and no shared logins; one API token for the fleet service, scoped to the two namespaces,
  the router, R2 and Cloudflare for SaaS (kit spec § 7).
- Two registrable domains bought (sites and previews), their zones on Cloudflare, Cloudflare for SaaS on the sites zone,
  and both submitted to the Public Suffix List early (inclusion takes weeks).
- A written answer from Cloudflare on the terms (integrated SaaS, overage billed to brands), and a quote for apex
  proxying for later.

## Consequences
- ADR-0005 gains a line: code sites are not served by the Vercel app; they run on Cloudflare Workers for Platforms
  under this record. Its "Revisit when" line on Cloudflare is answered for code sites only.
- The Studio spec's hosting row and `frata-unit-economics` get the new allowances once approved.
- `unit-economics-reviewer`, `speed-reviewer` (router) and `tenancy-auditor` (`site_deployments`, the router config
  rows) run on the V2 spec, as the kit spec already lists.
- A second vendor holds Frrata's public face for code sites. Checkout and money stay in bom1.

## Owner decisions
1. Host for the first adapter: **Cloudflare Workers for Platforms** (recommended) or a separate Vercel team?
2. Brand domains: **`www.` with the apex redirected** at the registrar (recommended), or pay for Cloudflare Enterprise
   apex proxying from the start?
3. Allowances: replace GB with **page requests** (0.5M / 3M / 10M, then ₹125 a million) and keep build minutes at
   100 / 300 / 1,000 then ₹4 a minute? Yes or no.
4. Hosting lines for the kill signal: Launch ₹500, Growth ₹1,500, Scale ₹4,500 a month? Yes or no.
5. Buy the two site domains now and name them (they replace `frrata.site`)? Yes or no.
6. Ask Cloudflare for its written answer on the terms before the V2 spike starts? Yes or no.
