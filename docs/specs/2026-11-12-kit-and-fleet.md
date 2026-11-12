# Kit and fleet: how Frrata builds, guards and keeps every site
Status: draft for the owner (reviews folded in) · Date: 2026-11-12 · Mockup:
https://claude.ai/artifact/NfBB7SwJk8chukgJZVhDFr (docs/mockups/2026-11-12-kit-and-fleet.html) · Approved: —
Direction: ADR-0014 and its amendment. Parents: `docs/specs/2026-11-11-agentic-storefront.md` (V0–V5),
`docs/specs/2026-11-11-frrata-studio.md` (Studio, V3), `docs/specs/2026-11-11-storefront-api.md` (SA0–SA2).
Owner, 2026-11-12: "you haven't planned how the staff/agent would build start kits, set up controls, safety, security,
maintenance, updates."

## Goal
Ranked problem (5), a premium storefront as code, without giving up (7) festive reliability or checkout's safety.
Studio is what partners see; this is what Frrata's staff, services and agents do behind it.
Measures: sites on a supported kit version (≥ 95%); a security fix **patched or mitigated** on every hosted site in
≤ 24 h; publishes refused by checks and overturned on appeal (< 2%); live sites failing today's checks ("drift", < 5%);
kit releases rolled back (tracked).

## Job
Frrata's kit team, its fleet service and its agents build the kit and the starters, set the controls every site runs
inside, and ship fixes and features to 1,000+ sites without breaking one or opening a hole.

## Handover — publishing before a shop has an owner (owner, 2026-11-12)
"If the store isn't handed over, there is no need of owner approval during that time for partners." Kept, with the
guards the reviews asked for:
- **Build mode** = the shop has never had an owner and never opened (derived from `clientStage` in
  `src/domains/partners/stage.ts`: building or invited). A shop that ever had an owner never returns to build mode.
- **In build mode** a verified partner publishes with no approval step once the checks pass. "Publish" sets the version
  the shop will open with; it is visible on the **signed preview** only. The shop's public address keeps showing
  "Opening soon" (as `src/app/s/[host]/_frame.tsx` does today), with `noindex` and a disallow-all robots file, until
  the owner opens the shop. So a partner's build never takes money, collects details or ranks in search under a brand's
  name before the brand owns it (security B1). Shop names on reserved and known-brand lists are refused at creation.
- **The shop cannot open for orders** until a brand owner claims it with a verified email (`drizzle/0066`,
  `app_shop_publish_needs_owner`). V2 tightens that guard to "no owner" whatever the partner link says (today it holds
  only while `partner_links.removed_at is null`). Custom domains need `CAN_MANAGE` (`settings/address/domain-actions.ts`),
  so a partner cannot point a brand's domain at a build-mode site.
- **At handover** the checks run again on the version the owner is shown; the owner accepts **that deployment** (the
  accept is bound to its id); a partner's first handover also gets a person's security review. The partner's routines
  lose publish rights. From then on the approval rule applies (amendment 6), re-checked when a deployment is promoted,
  not when it is queued.
- **A partner removed before handover:** the site goes to maintenance and the shop stays unopened.

## Research (sources dated within 12 months unless marked)
- **Shopify themes** (help and dev docs, undated pages; Theme Store requirements cite May–July 2025 deadlines): updates
  only for Theme Store themes; an update installs as an unpublished copy, so the live theme waits for the merchant;
  automatic updates only when the merchant edited no code; breaking changes (a setting, section or block removed) force
  a manual update; semver and release notes required; Theme Store floor Lighthouse ≥ 60 speed and ≥ 90 accessibility.
  **Taken:** semver with release notes; automatic only when nothing visible changes; breaking changes as a draft a
  person approves; a floor every site must pass (ours stricter).
- **Shopify API versions** (shopify.dev, undated): a version a quarter, each supported ≥ 12 months with ≥ 9 months of
  overlap; a retired version falls forward and the header says which served. Hydrogen `YYYY.M.x` is tied to the API
  version of the same name (changelog 2026-04-09; 2026-10-02). **Taken:** tie each kit major to a dated Storefront API
  version; support ≥ 12 months; fall forward with the served version in a header.
- **Cloudflare Workers for Platforms** (developers.cloudflare.com, 2026-04-21 to 2026-11-03): dispatch namespaces with
  unlimited scripts; untrusted mode by default (no shared cache); **outbound Workers** see and control every `fetch()`
  of customer code; per-call CPU and sub-request caps; up to 8 tags a script; **no gradual deployments for user
  Workers** (each version takes 100% at once); account API 1,200 requests per 5 minutes. **Taken:** egress allow-list in
  an outbound Worker; caps per shop; our own waves in the dispatch Worker; patch rollouts paced to the API limit.
- **Cloudflare data locality** (2026-05-05, 2026-07-23, 2026-10-30): the Data Localization Suite is an Enterprise add-on;
  Regional Services lists India but for Workers limits only where requests run (code and secrets deploy globally);
  Workers for Platforms is not mentioned — **unverified**. **Taken:** no India-residency claim without Enterprise and a
  written answer; checkout and sign-in never pass through a third-party router (§ 5).
- **Vercel for Platforms** (vercel.com docs, 2026-09-03 to 2026-09-16): one project per tenant through the SDK; Pro
  allows 450 deployments an hour and 6,000 a day (≥ ~2.2 h to deploy 1,000 sites); rolling releases on one project only
  on Pro; bom1 transfer $0.20/GB. **Taken:** on Vercel the waves are ours, project by project; supports Cloudflare as
  the first choice (decided in the hosting decision record).
- **npm supply chain** (GitHub changelog 2025-12-09, 2026-05-22, 2026-07-08, 2026-09-18; npm docs 2026-05-04,
  2026-10-06): classic tokens revoked, write tokens ≤ 90 days; **trusted publishing** from GitHub-hosted runners with
  automatic provenance, "require 2FA and disallow tokens"; **staged publishing** (npm 11.15) holds a CI publish until a
  maintainer approves with 2FA; npm 12 turns dependency install scripts off by default; **provenance proves where a
  package was built, not that it is safe**. Mini Shai-Hulud (2026-05-19): 637 malicious versions in ~40 minutes through
  `preinstall`; a 7-day cooldown would have blocked all (Chainguard). keyv (2026-08-04, secondary source): malicious
  releases **with valid provenance** from a poisoned source, planting `.claude/` and `.vscode/` hooks. Cooldowns: npm
  `min-release-age` (2026-02-11), pnpm 11 `minimumReleaseAge` default 1 day and `allowBuilds` (release 2026-04-28,
  secondary date), Renovate `minimumReleaseAge` (undated). **Taken:** trusted + staged publishing with a person's 2FA;
  provenance required but never trusted alone; a 7-day cooldown on third-party packages; `@frrata/*` exempt (staged
  approval is its gate); the checks flag install scripts and editor/agent hook folders.
- **Fleet code updates** (nextjs.org codemods 2026-10-02; Renovate self-hosted docs, undated): codemods run without
  prompts in CI or under an agent; one bot with a shared preset across many repos. No current published practice for
  waves across tenant deployments was found. **Taken:** majors ship with codemods plus an agent-driven migration.
- **Model upgrades** (Anthropic engineering 2026-01-09; model deprecations page, latest entry 2026-09-30): keep a
  regression suite near 100% and run it before switching models; several trials per task (pass^k); deterministic graders
  first; 20–50 tasks from real failures; ≥ 60 days' notice before a model retires; every model id is a pinned snapshot.
  No current source on canarying model versions in the Agent SDK. **Taken:** pinned model id, golden suite graded by
  the checks, typecheck and e2e, k trials, then 5% of sessions; retirement dates on the calendar.

## Design

### 1. Domains (security B1–B2, architecture 1)
- **Code sites live on their own registrable domain**, on the Public Suffix List (shown as `frrata.site`; name to
  decide), never on `frrata.shop` (checkout, sign-in, today's theme shops) and never on the console, Admin or Studio's
  domain. Previews on a second such domain. So site code never shares an origin or a site with checkout, sign-in or
  the API, and cannot set cookies that reach them. Host tests prove it (a site's script cannot read a checkout reply or
  set a `.frrata.shop` cookie).
- A brand's own domain points at Frrata's router; checkout stays on Frrata's own host. Recorded in the hosting decision
  record (amending ADR-0005) before V2.

### 2. The kit (`frrata-kit`, one repository, **one version for all packages**)
| Package | Holds | Notes |
|---|---|---|
| `@frrata/core` | A thin typed client for one dated Storefront API version; the buy link; image component on Frrata media | The API serves derived facts (offer, prior price, the JSON-LD object) and `fe.js` is served by Frrata, so money, offers and attribution are never re-implemented in a package (architecture 13) |
| `@frrata/legal` | Places the legal block; its words are runtime data | |
| `@frrata/ui` | India-first components: product card, gallery, size picker and chart, pincode check, COD line, bag link, Hindi and English | |
| `frrata` (CLI) | `dev · check · preview`; the checks merged in (one tool) | The publish gate never trusts the site's copy (§ 4) |
| `skills/` | How the agent builds with the kit; one migration skill per breaking change | Read-only in sessions |
- **Brand tokens are API data** (amendment 3), read by site, checkout, emails and share cards from one source in the
  console; not a compiled package. The source that replaces the look layer's `site` at V5 is named in the V1.5 spec.
- Lockstep versions: min-version, kill switch and the fleet view all speak of one kit version. Each major is tied to a
  dated Storefront API version and its support window.
- The kit holds no secret and no server code that reads Frrata's database.

### 3. Starters (how staff and the agent build them)
- **Starter 0** (V1) is Frrata's: a complete fashion shop (home, collection, product, size guide, about, contact,
  policies from content). Staff build it with Claude Code in `frrata-kit` before Studio exists; from V3, in Studio's
  Frrata workspace on a demo shop with a seeded catalogue — the same sandbox, checks and limits partners get.
- **The starter bar**, stricter than a partner's publish: every check ≥ 10% under budget; a person's accessibility pass
  on phone and desktop; screenshots of every page at both widths; the checkout handoff end to end; author plus one
  approver.
- **A starter ships as** a repository template, a brand-brain template, its skill, screenshots, licence and a parity
  test (the pages a shop must have). Each site records the starter and version it came from (security M3), so a bad
  starter's sites can be found and patched.
- **Category starters** only on demand (a partner asks, or ≥ 20 waiting shops of one category).
- **Partner starters (V4)**: the automated bar, then a person's review (security, licence, quality); **re-reviewed every
  release**; their skills are reviewed as code, since they are stacked into every session that uses them.

### 4. Controls (security B4, H4; architecture 5, 6, 10)
- **Policies live apart from the code they contain:** a separate repository (`frrata-policies`) and pipeline, the
  security owner a required approver, **widening changes wait 24 h** with every staff member told. A release that
  touches policies is never patch-lane.
- **One policy version in force**, served by Frrata as signed JSON by version. The publish gate, the router and Admin
  read the same version; a developer's local CLI warns when its copy is stale (architecture 6).
- **A hard floor in this repo's tests**, which no policy file can lower: no `unsafe-eval`; `connect-src` Frrata only;
  `form-action` limited to Frrata's checkout; no route handlers, middleware or server actions in site code (no POST
  intake, no server-side cloaking); menu and content links only to the shop's own paths and proved domains.
- **The publish gate runs Frrata's pinned, approved checks on the build output**, in a separate step with no secrets.
  The site's own devDependency never decides a publish (partner code in `next.config` or scripts could tamper with it).
- **What the policies hold:** packages (exact version and integrity hash, licence, why; third-party packages wait 7 days
  after publish; security-advisory fixes may skip the wait with two approvals; install scripts blocked; flags on
  `.claude/`, `.vscode/` and similar hook folders) — the Studio spec's "a day's wait" becomes 7 days to agree; outbound
  hosts (enforced in the outbound Worker or equivalent and at the router, not only by checks); headers and CSP; budgets;
  roles and scopes; limits; the agent; the sandbox image.
- **Router changes roll out like code:** header, CSP and outbound changes go Report-Only in waves, then enforce. Router
  config is database rows pushed through the outbox (ADR-0006), with a stated time to take effect and a break-glass
  switch that works when this app is down.
- **Budgets tightened** apply to the next publish; a live site that now fails is drift, with 30 days.

### 5. Releases and the three lanes (security H1–H2, M2; architecture 8, 9, 15)
- **Publishing the kit:** GitHub-hosted trusted publishing, bound to the release workflow, a protected environment with
  required reviewers and tags on `main`; npm's staged publishing so a person approves each publish with 2FA; "disallow
  tokens"; no `pull_request_target`; no long-lived npm or hosting secrets in CI; provenance on every version, checked
  by the mirror and the gate, never treated as proof of safety. Who administers the mirror is named in the V2 spec.
- **Support:** the current major and the previous one, ≥ 12 months after the next ships, ending no earlier than its
  Storefront API version. A **minimum version**: below it a site serves but cannot publish.
- **Lane 1, patch (security or legal only; no click):**
  - Eligible only when flagged security or legal, the diff limited to listed packages and under a size cap, and signed
    by the security owner and a second staff member. A built-bundle diff that adds hosts or URLs, `eval` or `Function`,
    or branches on user agent, date or `webdriver` is held.
  - Each Lane 1 release raises the minimum to itself and lands as a commit on the site's live branch, so the next draft
    publish cannot undo it.
  - Only sites whose installed packages the release changes are built (per-site bill of materials).
  - Live and candidate are built together against a frozen per-site API snapshot, a frozen clock and seeded randomness,
    compared with masks and a threshold. The main signal is a **synthetic smoke test on every site**: key pages load,
    the legal block shows, the buy link opens checkout with the bag; plus the router's 5xx rate and real-visit errors,
    and synthetic phone crawls at random times.
  - Waves: Frrata's demo shops and ≥ 20 sites, then 10%, then all, each with a bake time; automatic rollback switches
    back to the kept previous deployment (no rebuild), **never below the minimum or to a killed version** — if none
    qualifies, the maintenance page.
  - A held site has an escalation clock: a critical fix held 12 h → staff force it or the router mitigates (blocks the
    affected path) or the site goes to maintenance. Notices say what changed only after the rollout completes.
  - Builds reserve slots so partner publishes keep moving; off-peak IST windows; paced to the host's API limits.
- **Lane 2, minor (additive):** "Update available" in Studio; the agent applies it on a draft; the usual checks and
  approval. For a shop with no partner, Frrata's agent drafts it for the owner to approve.
- **Lane 3, major (breaking):** a codemod and a migration skill; the agent moves it on a draft; Frrata does it for shops
  with no partner (priced, below). At end of support the site moves to Starter 0 with its content and brand, or to
  maintenance — never served unpatched.
- **Festive freeze:** no lane 2 or 3 rollouts in declared peak weeks; lane 1 only.
- **Never a release:** prices, stock, content, brand tokens, the legal block's words — runtime data from the API.

### 6. The fleet service (security B3; architecture 3, 4)
- **Deterministic code, not an LLM agent**, running inside the hosting account, which alone holds the host token
  (amendment 4). Each site builds in its own sandbox with no credentials and no shared writable cache, with that site's
  own storefront key; **no fleet-wide storefront key exists**.
- **A separate deploy step accepts only an attested artifact**: the site's live commit plus a lockfile bump to a signed,
  approved release. The router serves only attested artifacts.
- **Records in this app** (ADR-0006 rows before requests): a tenant table `site_deployments` written by publish, the
  patch lane, rollback and handover alike — cause, commit, kit and policy versions, approval id, checks, screenshot
  verdict, `live_from`, `rolled_back_at`; live, held and drift **derived** from it (as looks are). Platform tables
  `kit_releases` and `rollouts` (waves as timestamps). Requests go out as outbox kinds `site.build` and `site.promote`;
  results come back as `webhook_events`. Waves advance by a sweep through id-only definers, or a `frata_fleet` role by an
  ADR-0007 amendment — chosen in the V2 spec with `tenancy-auditor`.
- **This app's own deploys** can break every site without a kit change: Starter 0's build stays a blocking CI step for
  each supported major (Storefront API spec § 8), and a sample of live sites is smoke-tested after each production
  deploy.

### 7. Security program (security S5, H3, H5, M1, M4, L1–L2)
- **Phishing-resistant sign-in** (passkey or authenticator app) for staff in Admin, the GitHub organisation, the host and
  the registry: for GitHub and the registry before the first kit release, for Admin before V2 (an ADR-0007 amendment;
  today staff sign in with an email code only). No branch-protection bypass; the audit log exported outside GitHub.
- **Two-person rule** = the author plus one approver, enforced by branch protection and the protected environment. An
  emergency path: the security owner plus one, logged, reviewed within 24 h. **An agent never counts as an approver.**
- **Kill switches:** a site (one staff member with a reason; the owner told at once by email, ADR-0011; reviewed
  after); a partner (sessions, routines, keys and publishes stop); a starter version and a kit version (two people).
  A switch serves only the last good version or the maintenance page.
- **Watching:** blocked outbound calls, CSP reports, errors, real-visit speed, sudden traffic, new domains pointing at
  build-mode sites; an abuse queue (phishing, counterfeit, scams) with takedown through the router in minutes.
- **Before each phase:** its threat model, `security-reviewer` and `tenancy-auditor` on its spec; an external pen test
  before V2 and before V3 reach partners. On every kit release: dependency, secret and licence scans,
  `security-reviewer` and `impact-reviewer` on the diff, the second approver.
- **Data residency:** checkout, sign-in and order pages stay on Frrata's own host in Mumbai and never pass through a
  third-party global router that would decrypt shopper data abroad; the analytics beacon goes to bom1. A site's router
  carries only page requests.
- **Retention:** screenshots and build logs 90 days; logs never show keys. A site's repository is kept while the shop
  is open and 90 days after it closes (closing = the owner closes the shop or it is removed for abuse); the owner can
  export the code at any time.

### 8. Frrata's agents (people own every release)
| Agent | Does | May never |
|---|---|---|
| kit-maintainer | Weekly dependency updates in `frrata-kit` after the cooldown; drafts codemods and migration skills | Touch `policies`, `.github/` or the allow-list; approve |
| starter-builder | Studio sessions on Frrata's demo shop to build and refresh starters | Release a starter |
| abuse-triage | Sorts the abuse queue and gathers evidence | Close a report or take a site down |
- Reviews of kit releases use the existing `security-reviewer` and `impact-reviewer` agents. The fleet service is code
  (§ 6), not an agent.
- **Studio's model** is a pinned id. A new model must pass the golden suite (20–50 real tasks, k trials each, graded by
  the checks, typecheck and e2e, plus planted-instruction tests) before 5% of sessions, then all; each model's retirement
  date is on the calendar.

### 9. Maintenance over years
- **Admin › Sites:** each site's kit version, checks, real phone speed, errors, partner, starter, build mode or owned;
  filters for below minimum, held, drift, no partner.
- **Drift:** a task for the partner, 30 days, then the owner is told by email; an appeal path for a refused publish.
- **No partner:** the site keeps the patch lane; Frrata's agent drafts minors for the owner; majors as in lane 3.
- **Framework upgrades** ride kit majors; sites never upgrade the framework alone.

### People
A kit team of two engineers to start (the agents write most of the code under review), one security owner, a weekly
release manager (rotating), the abuse queue part-time, partner success.

## Phases (each part where it is first needed; YAGNI per architecture 19)
| Phase | Kit and fleet work |
|---|---|
| V1 | `frrata-kit` (core, legal, ui, CLI with checks, skills) in one version; trusted + staged publishing; Starter 0 to the starter bar; budgets and the allow-list as the CLI's defaults (sites self-host; Frrata cannot enforce yet); staff phishing-resistant sign-in on GitHub and the registry |
| V1.5 | Brand tokens as API data, one source with checkout, emails and cards |
| V2 | The separate site domain; `frrata-policies` served as signed JSON; the package mirror; the gate on build output; the fleet service, `site_deployments`, rollouts and lanes 1–3; the router (Report-Only waves, break-glass); kill switches; Admin › Sites, Controls, Kit; build mode on the signed preview; staff passkeys in Admin; pen test |
| V3 | Starters built in Studio; the agent as a pinned, evaluated control; the sandbox image; Admin › Agent; pen test |
| V4 | Partner starters reviewed and re-reviewed per release |
| V5 | Theme shops moved to Starter 0 through parity checks |

## Design review
- **UI/UX:** Admin screens (Kit, a release, a rollout, Sites, Controls, Starters, Agent, Kill switches) and three
  partner/owner moments (build mode, handover, updates). Rule 0. States: rollout running, paused, held with its clock,
  rolled back; a control waiting for its approver or its 24 h; below minimum; empty fleet; phone width.
- **Tenancy:** `site_deployments` is a tenant table with RLS; `kit_releases` and `rollouts` platform tables; fleet-wide
  reads through `frata_admin` in `src/lib/admin/` for staff screens; the sweep through id-only definers or a new role
  (V2 spec, `tenancy-auditor`). No fleet-wide storefront key.
- **Modularity:** the kit, starters and policies live outside this app; this app holds the API, the router's config,
  Admin, the deployment records and the outbox kinds; the fleet service lives in the hosting account.
- **SSOT:** policies once (signed JSON by version); brand tokens once (API data); the legal block's words once; money,
  offers and attribution once (the API), never re-implemented in the kit; site state derived from `site_deployments`.
- **YAGNI:** mirror, policy service, channels and Admin screens wait for V2; no category starters, bug bounty, second
  framework, per-site budgets or private registry beyond the mirror until a signal.
- **KISS:** one kit version, one framework, three lanes; the patch lane, publish, rollback and handover write the same
  deployment rows through the same build → gate → deploy path.
- **Scalability:** only affected sites build; reserved slots for partner publishes. At ~2 min a build: 1,000 sites
  ≈ 33 build-hours (≈ 2 h at 20 parallel builds); 10,000 ≈ 330 build-hours (≈ 8 h at 40) — within 24 h only with
  per-site SBOM selection and parallel builds; deploy calls paced to 1,200 per 5 minutes (Cloudflare) or 450 an hour
  (Vercel Pro). Build time per site is **unverified** until the V1 starter is measured.
- **Performance:** the kit carries the budgets; the gate refuses over-budget builds; real-visit speed in Admin.
- **Reliability:** rows before requests; rollback to kept deployments; break-glass on the router; smoke tests after
  this app's deploys.
- **Security:** § 1, § 4–§ 7.
- **Unit economics:** Frrata's patch builds are Frrata's cost, never counted against a shop's allowance; migrations
  Frrata does for shops without a partner are priced in credits at 3× (owner rule) or absorbed for security —
  `unit-economics-reviewer` before V2.
- **Blast radius:** a bad kit release or policy change could reach every site; guards: staged publishing, policies
  apart, the hard floor, waves with smoke tests and rollback, the minimum version, kill switches, Report-Only first.

## Reviews (2026-11-12) and where each went
- **Security** (4 blockers, 6 high, 4 medium, 2 low): pre-handover sites public → signed preview, "Opening soon",
  noindex, reserved names (Handover); site code beside checkout's origin → own registrable domain (§ 1); the fleet
  runner's power → deterministic service, attested artifacts, no fleet key (§ 6); code and its controls in one release
  → `frrata-policies` apart, gate on build output, hard floor in tests (§ 4); patch-lane abuse and cloaking, signing
  gaps, phishable sign-in, collusion, agent injection, time bombs at handover, kill switch misuse, held sites, starter
  kill, residency, retention → § 4, § 5, § 7, § 8, Handover.
- **Architecture** (3 blockers, 9 high, 7 medium, 1 low): domain → § 1; research missing → § Research; runner as Admin →
  § 6; `site_deployments`, outbox kinds, derived state → § 6; checks inside partner builds → § 4; one policy version
  and the cooldown → § 4; lockstep versions → § 2; lane 1 rules → § 5; breach signals → § 5; router changes → § 4;
  handover edge cases → Handover; this app's deploys → § 6; core duplicating money → § 2; brand tokens as data → § 2;
  scale and festive freeze → § 5, Design review; unit economics → Design review; two-person rule → § 7; no-partner
  sites → § 5, § 9; YAGNI → Phases; retention, export, appeal, email notices → § 7, § 9.
- Still to run before V2: `tenancy-auditor` on the deployment tables, `unit-economics-reviewer`, `speed-reviewer` on the
  router.

## Out of scope
Category starters (signal: a partner asks, or 20 waiting shops); a public bug bounty (V3 general availability); a second
framework (a partner market that refuses the first); per-site budgets; a private registry beyond the mirror.

## Facts used
§ Research, each with its source and date; undated pages marked.
