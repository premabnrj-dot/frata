# Kit and fleet: how Frrata builds, guards and keeps every site
Status: draft for the owner · Date: 2026-11-12 · Mockup: (published with this spec) · Approved: —
Direction: ADR-0014 and its amendment. Parents: `docs/specs/2026-11-11-agentic-storefront.md` (V0–V5),
`docs/specs/2026-11-11-frrata-studio.md` (Studio, V3). Owner, 2026-11-12: "you haven't planned how the staff/agent
would build start kits, set up controls, safety, security, maintenance, updates."

## Goal
Ranked problem (5), a premium storefront as code, without giving up (7) festive reliability or the safety of
checkout. Studio and partners are the front of that plan; this spec is the back: what Frrata's own staff and agents do
so that every site is built on a sound kit, stays inside the controls, and stays patched for years.
Measures: share of sites on a supported kit version (target ≥ 95%); time from a security fix to every hosted site
(target ≤ 24 h); publishes refused by checks that a person later judged wrong (target < 2%); sites whose live version
fails today's checks ("drift", target < 5%); kit releases rolled back (track, no target).

## Job
Frrata's kit team, with its own agents, builds the kit and the starters, sets the controls every site runs inside,
and ships fixes and features to 1,000+ sites without breaking one.

## Handover (owner, 2026-11-12) — the publishing rule before a shop has an owner
"If the store isn't handed over, there is no need of owner approval during that time for partners." This matches the
partner model already built (partner foundations F3; `drizzle/0066`): a partner-built shop has no owner member until
the brand claims it with its verified email, and **it cannot open for orders until then** (database guard
`app_shop_publish_needs_owner`). So:
- **Before handover (build mode):** a verified partner publishes the website after the checks pass, with no approval
  step. The site serves on the shop's Frrata address and previews; the shop takes no orders (the guard), so a
  partner's build never takes a shopper's money. The checks, the patch lane and Frrata's controls apply as always.
- **At handover:** the owner sees the live version and the partner's scopes, and accepts the shop. The live version
  becomes the baseline; connecting the brand's own domain and payments are the owner's (as today).
- **After handover:** the owner's scope and approval rules apply (amendment 6): a publish needs the owner's yes on
  the exact version unless the owner gives that partner more.

## Research
Filled from the research run (sources dated within 12 months): § Facts used. Products looked at: Shopify (theme
versions and updates, Theme Store review, Hydrogen and Storefront API version support), Cloudflare Workers for
Platforms (dispatch namespaces, outbound workers, tags), Vercel for Platforms, npm trusted publishing and provenance,
pnpm and Renovate cooldowns and install-script defaults, Next.js codemods, Anthropic's model deprecation policy.

## Design
Seven parts. Each lands in the phase that first needs it (§ Phases). Screens: the mockup.

### 1. The kit (one repository Frrata owns: `frrata-kit`)
| Package | What it holds | Who changes it |
|---|---|---|
| `@frrata/core` | Storefront API client (typed per API version), money in paise, the buy link with attribution, SEO tags (Product, Offer, Breadcrumb JSON-LD), image component on Frrata media, the analytics beacon, consent | Kit team |
| `@frrata/legal` | The legal block: renders runtime data from the API; the code only places it | Kit team, legal review |
| `@frrata/brand` | The brand kit as tokens (colour, type, radius, motion) generated from the console; the same source as checkout, emails and share cards | Kit team |
| `@frrata/ui` | Components India-first: product card, gallery, variant and size picker, size chart, pincode check, COD line, bag link, Hindi and English | Kit team |
| `@frrata/checks` | The publish checks as one CLI (`frrata check`): build, phone speed and bytes, accessibility, legal block present and untouched, secret scan, packages on the allow-list, outbound hosts, licences | Kit team, security owner |
| `@frrata/cli` | `npx frrata dev · check · preview` | Kit team |
| `skills/` | The agent's instructions for building with the kit, and one migration skill per breaking change | Kit team |
| `policies/` | The controls as files (§ 3), released with the kit | Two staff approve every change |

One framework for starters and the kit, chosen in the V1 spec with the host (the hosting decision record). The kit
holds no secret and no server code that reads Frrata's database: everything goes through the Storefront API.

### 2. Starters (how staff and the agent build them)
- **Starter 0** (V1) is Frrata's: a complete fashion shop (home, collection, product, size guide, about, contact,
  policies from content) built on the kit. Before Studio exists, staff build it with Claude Code in `frrata-kit`;
  from V3 Frrata builds starters **in Studio itself**, in a Frrata workspace on a demo shop with a seeded catalogue
  — the same sandbox, checks and limits partners get (Frrata is Studio's first customer).
- **The bar for a Frrata starter**, stricter than a partner's publish: every check passes with headroom (≥ 10% under
  each budget); a person's accessibility pass (keyboard, screen reader, zoom) on phone and desktop; visual
  snapshots of every page at phone and desktop; the checkout handoff tested end to end; two staff approve.
- **What a starter ships as:** a repository template + design rules (a brand-brain template) + its agent skill +
  screenshots + licence + a parity test (the pages a shop must have).
- **Category starters** (beauty, jewellery, kids) follow only on demand (YAGNI): a partner asks, or ≥ 20 shops of
  one category are waiting.
- **Partner starters (V4)** go through the same automated bar, then a staff review (security, licence, quality), and
  are **re-reviewed on every release**: a new version is held until it passes.

### 3. Controls (policy as files, two-person rule)
Every control is a file in `frrata-kit/policies/`, changed by a reviewed pull request that **two staff approve**,
released with a version, and shown in Admin › Controls with its current version and who approved it:
- **Packages:** the allow-list (name, version range, licence, why); a new package waits 7 days after its publish
  (cooldown) and is scanned before it is listed; install scripts are blocked; the package mirror serves only listed
  versions.
- **Outbound hosts:** what a site may call (Frrata's API, media, fonts). Enforced at the host (outbound worker or
  equivalent) and at the router, not only by the checks.
- **Headers:** the content-security policy and security headers the router sets on every site.
- **Budgets:** the checks' numbers (JS and HTML bytes, image bytes, phone speed, accessibility). Tightening a budget
  never takes a live site down: it applies to the next publish, and a live site that now fails is listed as drift
  with 30 days to fix.
- **Roles and scopes:** what a partner, a developer and staff may do (build, preview, publish, approve).
- **Limits:** sessions at once, credits per session and month, routines per site, publishes per day.
- **The agent:** the model, its skills and tools, by version (§ 6).
- **The sandbox image:** the operating system and tools the sandbox runs, rebuilt weekly and scanned.

### 4. Releases and the three update lanes
- **Versions:** semantic versions with a changelog per package; channels canary → stable. **Signed:** published only
  from the kit's CI with trusted publishing and provenance; the mirror refuses a version without provenance from
  `frrata-kit`. A software bill of materials per release.
- **Support:** the current major and the one before it, at least 12 months after the next major ships. A
  **minimum version** per major: below it, a site keeps serving but cannot publish until it updates (the patch
  lane updates it first where it can).
- **Lane 1, the patch lane (security and legal; no click):** Frrata's fleet runner builds every site with the new
  patch version, runs the checks and compares screenshots of each site's key pages with its live version. A site
  whose pages change, or whose checks fail, is **held** and its partner told; the rest deploy in waves — 1% of
  sites, then 10%, then all — each wave watched for errors and speed for a set time, **auto-rolled back** on a
  breach. Target: every hosted site within 24 hours. The owner and partner are told after, with what changed.
- **Lane 2, minor (new parts, additive):** "Update available" in Studio and in Admin; the agent applies it with
  its skill on a draft; the usual review, checks and approval (after handover).
- **Lane 3, major (breaking):** a codemod plus a migration skill; the agent does the move on a draft; Frrata offers
  to do it for shops without a partner. A shop not moved by the end of support keeps serving with the patch lane
  until the end-of-life date, then cannot publish until moved.
- **What never needs a release:** prices, stock, content, the legal block's words — all runtime data from the API.

### 5. Security program
- **Before each phase:** the threat model for that phase written into its spec; `security-reviewer` and
  `tenancy-auditor` on the spec; an external penetration test before V2 (hosting) and before V3 (Studio) go to
  partners.
- **On every kit release:** dependency audit, secret scan, licence scan, the bill of materials, `security-reviewer`
  on the release diff; a second person approves.
- **Watching the fleet:** the router's blocked outbound calls and content-security reports, error rates, phone
  speed from real visits, sudden traffic, new domains; an abuse queue (phishing, counterfeit, scams) with takedown
  through the router in minutes.
- **Kill switches (Admin):** a site (the router serves its last good version or a maintenance page), a partner (all
  their sessions, routines, keys and publishes stop), a starter version (no new site from it), a kit version (no
  publish on it; the patch lane moves sites off it).
- **Access:** staff two-factor; the hosting account is changed only by CI and the fleet runner, never by hand;
  break-glass access is logged and reviewed.
- **Incidents:** a runbook per kill switch; who is on call; the 24-hour patch target; what owners are told and when.

### 6. Frrata's own agents (what they do; people own every release)
| Agent | Does | A person |
|---|---|---|
| kit-maintainer | Weekly dependency updates in `frrata-kit` (after the cooldown), drafts codemods and migration skills | Reviews and merges |
| fleet-runner | Builds the fleet on a release candidate, runs checks and screenshot comparisons, runs the waves, rolls back | Starts and can pause a rollout |
| starter-builder | Studio sessions on Frrata's demo shop to build and refresh starters | Two staff approve a starter release |
| release-reviewer | Security, impact and licence review of each kit release diff | Second approver |
| abuse-triage | Sorts the abuse queue, gathers evidence | Decides every takedown |
- **Upgrading Studio's model** is a release too: a fixed set of golden tasks (real Studio jobs on the demo shop)
  scored on checks passed, credits used and a person's quality rating; the new model goes to 5% of sessions first,
  then all, with the old one kept until it is retired.

### 7. Maintenance over years
- **The fleet view (Admin › Sites):** every site's kit version, checks, phone speed, errors, last publish, partner,
  and drift; filters for "below minimum", "held by the patch lane", "no partner".
- **Drift:** a live site that fails today's checks gets a task for its partner, 30 days, then a reminder to the owner.
- **A site with no partner** (removed, gone) keeps serving and keeps getting the patch lane. The owner can invite a
  partner, ask Frrata to move it to a newer starter, or return it to Starter 0 with their content and brand.
- **Framework upgrades** ride the kit's majors: the kit pins the framework; sites never upgrade it on their own.
- **Retention:** a site's repository lives while the shop is active, plus 90 days after it closes.

### Who does it (people)
A kit team of two engineers to start, with the agents above doing most of the code under review; one security owner;
a weekly release manager (rotating); the abuse queue part-time until volume needs more; partner success for partners.

## Phases (each part lands where it is first needed)
| Phase | Kit and fleet work in it |
|---|---|
| V1 | `frrata-kit` with core, legal, ui, checks, cli, skills; signed releases (canary, stable); Starter 0 built by staff to the starter bar; policies v1 (packages, budgets, outbound hosts) in files |
| V1.5 | `@frrata/brand` (one source with checkout, emails, cards); the two-person rule on policies; Admin › Controls read-only |
| V2 | The fleet runner and lanes 1–3; the router's headers and outbound limits; kill switches; Admin › Sites (fleet view, drift); pen test |
| V3 | Starters built in Studio; the agent as a versioned control with golden tasks; the sandbox image; Admin › Agent; pen test |
| V4 | Partner starter review and re-review per release |
| V5 | Theme shops moved to Starter 0 through parity checks |

## Design review
- **UI/UX:** staff screens in Admin (Kit releases, Rollout, Sites, Controls, Starter workshop, Agent, Incidents) and
  two partner moments (an update card in Studio; "Frrata patched your site"); plus build mode and handover. Rule 0
  on every screen. States: rollout running, paused, held sites, rolled back; a control change waiting for its second
  approver; a site below minimum; an empty fleet.
- **Tenancy:** fleet-wide reads only through `frata_admin` in `src/lib/admin/` (ADR-0007). Sites, publishes,
  patch-lane results and drift are per shop (tenant rows with RLS) or Admin-only tables; the fleet runner acts as
  Admin with an audited actor. Partner scopes: amendment 6.
- **Modularity:** the kit, starters and policies live outside this app (`frrata-kit`); this app holds the API, the
  router's configuration, Admin screens and the fleet runner's records. Nothing generated is imported by the app.
- **SSOT:** budgets and allow-lists exist once, in `policies/`; the checks CLI, the router and Admin read the same
  released files. The brand kit is one source for site, checkout, emails and cards. The legal block's words exist
  once, in Frrata, served at runtime.
- **YAGNI:** no category starters, partner revenue or private package registry beyond the mirror until a signal;
  no per-site custom budgets.
- **KISS:** one kit repository, one framework, files for policy, three lanes; the fleet runner reuses the publish
  path (build → checks → deploy) rather than a second one.
- **Scalability:** a patch-lane rollout builds every site once: at 1,000 sites × ~2 min a build, ~33 build-hours,
  run in parallel within the host's limits so the 24 h target holds; builds queue per site; screenshots only of key
  pages.
- **Performance:** the kit carries the speed budgets; the checks refuse what goes over; real-visit speed per site in
  the fleet view.
- **Reliability:** releases and rollouts are rows before they are requests (ADR-0006): each wave and each site's
  result recorded; a rollback redeploys the recorded last good version.
- **Security:** § 5; signed releases with provenance; two-person rule on controls and releases; kill switches;
  outbound limits enforced at the host and router; secrets only in CI.
- **Unit economics:** fleet builds and screenshots are Frrata's cost per release (≈ build minutes × sites); counted
  in the hosting allowances; `unit-economics-reviewer` before V2.
- **Blast radius:** a bad kit release is the largest risk (every site). Guards: canary channel, screenshot holds,
  waves with automatic rollback, the minimum-version rule, the kit version kill switch.

## Out of scope
Category starters (signal: a partner asks, or 20 shops of one category); a public bug bounty (signal: V3 general
availability); a second framework (signal: a partner market that refuses the first).

## Facts used
See § Research; filled from the research run with sources and dates.
