# V2a: one partner's agent builds a site into its own repository and sees it on a preview link
Status: draft · Date: 2026-11-24 · Lane L (`claude/lane-l-sites`) · For the owner, through the orchestrator
**Mockup:** none — phases 0–2 add no screen of their own (Studio's preview pane, Checks and Code tabs are drawn and approved in `docs/mockups/2026-11-22-studio-workbench.html`); phase 3 (publish) needs V2a·8's mockup first
**Approved:** not yet; it stands on the owner's decisions of 2026-11-24 ("vercel for now. start step1"); sign-off asked through the orchestrator
**Review:** architecture-reviewer CHANGES NEEDED (2 blockers, 5 majors, 5 minors; phase 0 shape not certain as drawn), all folded in, 2026-11-24
**Review:** security-reviewer FIX BEFORE MERGE (2 high, 4 medium, 3 low; phase 0 safe with 6 constraints), all folded in, 2026-11-24
**Review:** tenancy-auditor FIX BEFORE MERGE (1 high, 5 medium, 2 low; no reachable cross-store path), all folded in, 2026-11-24
**Review:** speed-reviewer WITHIN BUDGET with conditions (3 high, 4 medium, 4 low), all folded in, 2026-11-24
**Review:** unit-economics-reviewer NEUTRAL for merchants, NEUTRAL to HURTS Frrata (pilot turns are Frrata's cash); figures corrected, 2026-11-24

Adds to `docs/plans/2026-11-12-studio-build.md` § V2a and `docs/plans/2026-11-22-studio-workbench.md`; where it is narrower
it says so in § Narrows. Decisions it stands on: ADR-0017 § The decision as it stands (Vercel; one new Pro team
`frrata-sites` when the fleet is built, nothing of it in `frata`'s team), ADR-0016 as amended (GitHub organisation
`FrrataGit`), ADR-0019's 2026-11-24 amendments (stores on `frrata.online`, previews on `frratapreview.online`, the public
site on `frrata.shop`), ADR-0020 (Studio's agent), ADR-0018 (build keys).

## In short (for the owner)
- **What you get, in order; you can stop after any phase:** (1) one partner, in Studio, has the agent write a site from
  the starter into that site's own GitHub repository and sees it built on a private preview link; (2) every preview kept
  as a version, with "go back to this one"; (3) publish, outlined only: it waits on the secure payment frame (P3) and the
  address work (P5).
- **The smallest path keeps the fleet service for later.** For one site, Vercel's own GitHub link in the new
  `frrata-sites` team builds what Frrata's server pushes; GitHub tells Frrata the preview is ready. No Vercel token is
  made in phase 1 (the `frata` team's existing domains token, accepted-findings row 1, is unchanged). The fleet comes
  at the second or third site.
- **Monthly running cost, phase 1** (₹103.40 a dollar loaded, ex GST): **about ₹2,570 whether 1, 3 or 10 sites**, because
  Vercel Pro's $20 of included usage covers the builds. On top, **Frrata pays the agent's model cost while Studio is
  staff-only**, up to the `studio-eval` workspace limit: **₹10,340 a month** at $100. Each extra person who needs a Vercel
  and a GitHub seat adds ₹2,482. Phase 2 adds almost nothing. Phase 3 is not priced until 30 days of real traffic.
- **Build size:** phase 0 small (one lane, after two spike answers); phase 1 medium (one lane, about two weeks); 1b medium
  (one lane); phase 2 small to medium (one lane); phase 3 large (two lanes, after P3 and P5).
- **The small build asked for now (the `sites` tables) is held**, not built: the reviews changed its shape in four places
  and two of them hang on facts only the accounts can show (§ Build C).
- **What we need from you, and when:** § Owner steps. Before phase 1: `FrrataGit` on GitHub Team, the session App, a
  read-only Fleet App with no key yet, `frrata-sites` (Pro, spend limit on), `frratapreview.online` (one year), and which
  partner and store are the pilot. Names and ids only, never a key in chat.

## Where things stand (2026-11-24, read from the repository)
| Piece | State | Where |
|---|---|---|
| Studio's agent loop, tools, `asTurn`, binds, credits ledger | built (V3a; staff only, `STUDIO_OPEN=staff`) | `src/lib/studio/**`, drizzle/0166–0169 |
| `HostingPort` | stand-in: `requestPreview` answers `not_available`, `latest` null | `src/lib/studio/hosting.ts` |
| Repository for a session | none: Starter 0 is a session file, code lost at the session's end | V3a plan line 51; V3a·7 waits |
| `sites`, `site_deployments` | not built; proof § 90 is still free | this plan, phase 0 |
| Build keys | built (G·2) for `session` and `developer` only; **nothing mints a preview key** | `src/lib/studio/sessions.ts:160`, `device.ts:142` |
| Accounts | none: `FrrataGit`, the Apps, `frrata-sites`, `frratapreview.online` | `docs/setup-studio-hosting.md` |
| Spike items blocked on set-up | 2, 4, 8, 9, 13, 14, 15 | `docs/research/2026-11-22-studio-agent-spike.md` |

## The shape of the smallest path
```
Studio (frata, bom1)                         GitHub: FrrataGit                        Vercel: frrata-sites (Pro)
 sandbox: repo mounted with a READ token,     site-<8 of id>, branch studio/<session>  Vercel's GitHub link builds
   no GitHub host allowed (it cannot push)    ruleset: main closed to everyone          studio/* only (never main
 turn end: outbox site.build ──server push──▶   but the Fleet App (needs Team)          until phase 3); env: the
   path policy + lockfile allow-list first,                                           preview key (Preview, Sensitive)
   token: this repo, contents:write, ≤1 h                                             Deployment Protection on
 /api/webhooks/github ◀── deployment_status ── (Fleet App webhook, HMAC; Vercel's bot as creator, URL host pinned)
   stored with its store, 200, processed later → site_deployments row; then the gate, outside any transaction
 Studio: preview card; "Open preview" through a share link (spike 15 decides which kind)
```
Frrata's server is the only writer of the repository (security H2), and only at a turn's end through the outbox
`site.build` row (architecture major: the row exists before the request; one build in flight; the daily cap and the
credit count hold).

## Phase 0 · The data model (V2a·1) — held until spike items 2 and 15 and one webhook payload are read
Shape after the reviews (what will be built; § Build C says why not today). Migration number taken at build time.
- **`host_teams`** (platform scope, no grant to any role, RLS on, restrictive `definer_only`): `slug` unique,
  `external_id` (Vercel `team_…`) unique **not null**, `role` in (`console`, `sites`, `fleet`, `staging`), a partial unique
  index where `role = 'console'`. Seeded with the console team **and its id**, which the owner sends.
- **`sites`** (tenant-policied): `tenant_id` `on delete restrict`; `unique (tenant_id) where closed_at is null` (a closed
  site is history; a new team means a new row, which is how V2a·11's move is recorded); `unique (tenant_id, id)`;
  `host_team_id`; `repository_id` (GitHub's numeric id) unique; `host_project_id` (`prj_…`) unique; `created_at`,
  `created_by` (from the bind, never an argument), `built_by_partner_id` (history, no check reads it), `closed_at`. The
  repository name is derived (`site-<first 8 of the id>`), not stored.
- **`site_deployments`** (tenant-policied): composite FK `(tenant_id, site_id)` → `sites`; `unique (tenant_id, site_id, id)`;
  `session_id` (nullable, Studio's session); `cause` in (`agent`, `person`, `patch`, `rollback`); `commit_sha` CHECK
  `^[0-9a-f]{40}$`; `branch` CHECK pattern and length; `source_deployment_id` (GitHub's deployment id, bigint, unique,
  null until reported); `host_deployment_id` (`dpl_…`, nullable, unique); `url` (nullable, CHECK https on `*.vercel.app` or
  `*.frratapreview.online`); `created_at`, `building_at`, `ready_at`, `failed_at`, `failed_code`, `canceled_at`;
  `checks_passed`, `checks` (jsonb, CHECK ≤ 64 kB), `checks_version`, `checked_at`. **State is derived** by one pure
  `deploymentState()` (`src/domains/sites/state.ts`: requested, building, ready, failed, canceled, stale after 15 minutes
  building, superseded when a later row of the site exists) with a SQL mirror in one file and a parity test.
  Index `(tenant_id, site_id, created_at desc, id desc)` serves `latest()`, Versions' keyset and the kept-10 count;
  one-in-flight is a partial unique on `site_id` for rows Frrata requested and not yet reported, never for every push.
- **`site_selections`** (tenant-policied, append-only; replaces the pointer column, architecture § 1, after
  `shop_theme_publishes` in drizzle/0033): `site_id`, `deployment_id`, `kind` in (`preview`, `live`), `at`, `by`; FK
  `(tenant_id, site_id, deployment_id)` → `site_deployments`. The shown preview is the newest `preview` row; phase 3's
  live and rolled-back states come from the same table. Phase 0 creates it; phase 2 writes it.
- **Grants:** every table revoked from public, anon, authenticated, service_role, frata_admin. `frata_app`: `select`
  only on `sites`, `site_deployments`, `site_selections` (no INSERT, UPDATE or DELETE). `frata_builder`: named columns
  only, never `created_by`, `repository_id`, `host_project_id`, `host_team_id` or `checks`, under `builder_rows` /
  `builder_only`, in a migration file named `_sites` that `check:tenant` § 7b learns, with a rule that these tables get
  only `select` to frata_app and `host_teams` none. No `partner_only` policy: the site is the store's, its owners read it
  (consequence written down: a new partner's Studio sees the old partner's site).
- **Definers** (each `search_path = ''`, revoked from public, anon, authenticated, service_role, frata_builder,
  frata_admin; `proconfig` checked in the proof):
  - `app_site_create()`: store from `app_current_tenant()`, person from Studio's bind (`no_bind` without it), team = the
    one `sites` row (the caller names none). Refuses `no_store`, `no_bind`, `no_team`, `site_exists`, and, when that row is
    the console's, `console_taken` and `console_partner` (ADR-0017 rule 3). Callers pinned in `check:studio`. Frrata's own
    sites get an Admin definer later.
  - `app_site_register(site, repository_id, project_id)`: set once, refuses an overwrite; reached by staff through an
    Admin action (passkey in the last 5 minutes), never by SQL run as `postgres`.
  - `app_site_request(session)` (phase 1): the requested row, from the bound turn.
  - `app_site_deployment_seen(webhook_event_id)` (phase 1): reads the stored event; finds the site by `repository_id`
    with `closed_at is null`; matches the row on `(tenant_id, site_id, …)` from that site; refuses `deployment_elsewhere`;
    fills only null timestamps (out-of-order deliveries are safe); sets no tenant; returns a code and ids.
  - `app_site_checks(deployment, verdict, version)` (phase 1): the only writer of the check columns, called only from the
    gate module.
  - `app_site_preview_set(deployment)` (phase 2): refuses a row not ready, not this site's, not passed, or outside the
    kept window.
- **Proof § 90:** two stores, a site each; frata_app insert, update, delete refused on every table; cross-store reads
  zero; frata_builder sees named columns only and nothing without `member_role = 'builder'`; § 82 gains the columns; the
  selection FK refuses another site's or store's deployment (as postgres); second open site refused, a closed one allows
  a new row; console-team refusals; unbound refusal; definers refused to every role but their callers; `host_teams`
  unreadable by frata_app, frata_admin, frata_builder; about 10k seeded deployments and an Index Scan asserted for
  `latest()` and the webhook match.

## Phase 1 · One partner, one site, built on a preview link
| # | Task | Verify |
|---|---|---|
| 1·0 | **Spike first (two days):** items 2 (App token mount; a push from the sandbox fails), 4 (instruction files), 5, 8, 9 (`next build` time and memory), 14 (ruleset: only the Fleet App updates `main`), 15 (share links: which bypass exists without a token), plus Vercel building a bot-authored commit, and one real `deployment_status` delivery read (fields, size, states, the creator, how a cancelled build reports). `integration-researcher` dates each into `frata-integrations` | the spike report's rows passed or answered |
| 1·1 | Phase 0's migration (Build C), on the spike's answers | `npm run verify:tenancy`; `npm run check:migrations`; `npm test` |
| 1·2 | `src/lib/queries/sites.ts`: the store's site and latest deployments through `withTenant` and `ctx.reads`; lists never select `checks`; the read closed before any fetch | `npx vitest run src/lib/queries`; `npm run check:tenant` |
| 1·3 | **Repository and project by hand, once:** `FrrataGit/site-<8>` from the starter template (never forked); the session App, Vercel's App and the Fleet App installed on it only (never the template, `spike-fixture`, `frata` or the fleet's); the ruleset on `main`. In `frrata-sites`: bom1, protection on, production builds off until phase 3, build only `studio/*`; the preview key (1·4) as a Preview, Sensitive variable. Staff register ids through `app_site_register` | the checklist (`docs/setup-studio-hosting.md` § 8, new), ticked |
| 1·4 | **The preview key:** a new kind minted by an Admin action (passkey fresh, audited), shown once to staff, 30-day expiry with a rotation date on the site, one per project (a deviation from ADR-0018's "one key per preview deployment", written there) | `npx vitest run src/lib/storefront-api`; `security-reviewer` on the diff |
| 1·5 | **Tokens** (`src/lib/studio/github.ts`, `fetchWithTimeout`): a **read** token for the session's mount and a **write** token for the server's push, each for one `repository_id` read from `sites` on the bound store, contents only, ≤ 1 hour, revoked after use; the App's key through `secret()`, one module | `npx vitest run src/lib/studio` on `e2e/fakes/github.mjs` (new) |
| 1·6 | **The mount:** Managed Agents checkout of `studio/<session>` at the head Frrata read, with the read token; the sandbox allows no GitHub host; the instruction check at that SHA, `.claude/` compared with the starter's hash | spike 2 and 4 rows; `npx vitest run src/lib/studio` |
| 1·7 | **The push, at a turn's end only:** `requestPreview` writes `app_site_request` and an outbox `site.build` in the tool's bound write; the sender reads the session's files, applies the **path policy** (refuses `vercel.json`, `.npmrc`, `package.json` scripts, `.claude/**`, `.github/**`, `CLAUDE.md`, `AGENTS.md`), compares the lockfile with an allow-list, then commits and pushes with the write token; one in flight a site, a newer request replacing a queued one; the 20-a-day cap | `npx vitest run src/lib/sites src/lib/studio` |
| 1·8 | **`/api/webhooks/github`** (ENTRY_POINTS): body cap set from the measured payload (likely 64 kB) before parsing; `X-Hub-Signature-256` compared with `timingSafeEqual` on the raw body; only `deployment_status`; the Fleet App's installation id and Vercel's bot as `deployment.creator` pinned; our key `github:<X-GitHub-Delivery>`; stored with its store (one lookup on `repository_id`, Mux's pattern; `'github'` added to `app_pending_event_shops`), 200 at once; processed in `after()` and by `/api/cron/drain` through `app_site_deployment_seen`; payload trimmed to state, ids, SHA, URL; rows still building after 15 minutes looked up by the drain | `npx vitest run src/app/api/webhooks src/lib/sites`; `npm run verify:tenancy` |
| 1·9 | **The gate, the pilot's cut of V2a·6:** after `ready` is committed and its transaction closed, the server fetches home, a product and a collection page from the row's URL only if its host is this project's `*.vercel.app` (`redirect: 'manual'`, 5 s each, 20 s total, 1 MB a body, no script from another origin), runs the output checks, and writes through `app_site_checks` once (`checked_at is null`); never inside the drain's events window. The first-load limit is the shop's 120 kB (speed L10) | `npx vitest run src/domains/sites src/lib/sites` |
| 1·10 | **Studio shows it:** the preview card in our words; "Open preview" opens a new tab through the share link spike 15 chose (never the project's automation secret in a browser; that stays on the server for the gate) | e2e `site-preview` (next free number) on fakes; `mockup-parity-reviewer` on the card |
| 1·11 | **Measured for 30 days:** build minutes, the share of the $20 used, `studio-eval` spend per site | the table read by `unit-economics-reviewer` |

**What stops the agent writing outside its repository:** it cannot push at all (a read token, no GitHub host); Frrata's
server pushes one repository's files, chosen from `sites` on the bound store, with a token minted for that repository
only, after the path policy; `main` is closed to everyone but the Fleet App; the session App is installed only on site
repositories.

**What is left and accepted (proposed accepted-findings row):** code built from allowed packages can still read the
preview key during the build and send it out; the key reads only that store's public data and drafts and expires in 30
days; Vercel spend management on `frrata-sites` caps a build loop.

**Pilot cut (one site). Can be cut:** the fleet and every Vercel API call; the preview domain on the preview (Vercel's
protected URL until 1b); the site in Studio's pane (a new tab instead); the gate's source checks beyond the path policy
and lockfile; Admin › Sites (V2a·10); placements (V2a·7). **Cannot be cut:** GitHub Team and the ruleset on `main`;
the server as the only pusher; the path policy and lockfile allow-list; per-use, one-repository tokens; Deployment
Protection; the webhook's HMAC, pins, cap and stored-first path; the console-team refusals; proof § 90; the preview key
only in that store's project.

**Size:** medium, one lane (about two weeks of a worker) after the owner's phase-1 steps.

## Phase 1b · The fleet, when a second and third site are near (V2a·3–5, narrowed)
`frrata-fleet`, a small project in `frrata-sites`, its own repository outside `FrrataGit` (S8): the only holder of a
`frrata-sites` team token and of the Fleet App's private key (made then, not before); the preflight refuses a token
whose team id is a `console` row of `host_teams`; **`frata` never holds a `frrata-sites` token**. It makes repositories
and projects as 1·3, sets keys (V2a·4), makes per-deployment share links, attaches `<deployment>.frratapreview.online`,
deletes previews never live after 30 days. Frrata's app reaches it only through outbox kinds `site.create`, `site.key`,
`site.share` and hears back through `/api/webhooks/fleet` (V2a·3); routing stays out (ADR-0019 point 2).
**Size:** medium, one lane. **Cost:** inside the same team (a few hundred function calls a month).

## Phase 2 · Versions and rollback of previews
Every ready deployment is a version (rows exist). Versions lists 20 a page on the `(…, created_at desc, id desc)` keyset,
`checks_passed` only. "Go back to this one" is `app_site_preview_set`, a new `site_selections` row; a newer ready build
selects itself. Kept: the last 10 ready previews and anything ever live; the repository keeps every commit, so a restore
of an older SHA is a new deployment with `cause = 'rollback'`. **Tests:** pointer rules' parity test; proof § 90 gains
the selection definer; e2e `site-preview` gains back and forward. **Size:** small to medium, one lane. **Cost:** as phase
1 (kept deployments not billed separately: unverified, checked before the phase).

## Phase 3 · Publish (outline only; waits on P3 and P5)
Publish selects one checked version as `live` and the store's address serves it through Frrata's app (ADR-0019). It
needs P3 for any store with real shoppers; P5 (routing, `secure.` records, `frrata.online`, P4b); V2a·6's full gate (source
and output, the one-address list) as the publish checks; V2a·8's screens and mockup; the public key in Production;
production builds turned on; the fleet's promote and rollback; Admin › Sites' kill switch. **Cost:** live traffic,
priced only on 30 days of the pilot's measurement (decision 18). ADR-0017's guess restated at ₹103.40: Launch ≈ ₹345,
Growth ≈ ₹3,451, Scale ≈ ₹11,473 a site a month. **Size:** large, two lanes. Question (e) is ruled before it.

## Costs (a month; ex GST; list × ₹103.40 loaded; `frata-unit-economics` § The dollar rate)
Assumptions, each named and to recheck before buying (the Vercel figures were read 2026-07 to 09, past the 90-day rule;
GitHub's has no date; the `.online` price is not in the repo): Vercel Pro $20 a seat **with $20 of usage included**
(`docs/setup.md:251`); GitHub Team about $4 a member; one person holds both seats; a preview build 2 minutes at $0.014
(unmeasured: spike 9); 60 builds a site a month; preview traffic inside the included usage; the preview domain ₹89 a
month (a ceiling borrowed from a `.com`; buy one year, not three, since it is attached only in 1b); while
`STUDIO_OPEN=staff` no partner pays credits, so the agent's turns are Frrata's cash, capped by the `studio-eval` limit.
| Line | 1 site | 3 sites | 10 sites |
|---|---|---|---|
| Vercel Pro seat $20 | ₹2,068 | ₹2,068 | ₹2,068 |
| GitHub Team, one member, $4 | ₹414 | ₹414 | ₹414 |
| Preview domain, amortised | ₹89 | ₹89 | ₹89 |
| Preview builds (60 × $0.028 a site, inside the $20 included) | ₹0 | ₹0 | ₹0 |
| **Phase 1 infrastructure** | **₹2,570** | **₹2,570** | **₹2,570** |
| Builds at the 20-a-day cap instead ($16.80 a site, past the included $20) | ₹0 | +₹3,143 | +₹15,303 |
| Agent turns Frrata pays while staff-only (ceiling: `studio-eval` $100) | up to ₹10,340 | up to ₹10,340 | up to ₹10,340 |
| Each extra person with Vercel and GitHub seats | +₹2,482 | +₹2,482 | +₹2,482 |
At ₹94 base the infrastructure line is ₹2,503. GST is reclaimed, but about ₹463 a month is paid out first. If Advanced
Deployment Protection is needed for share links, it is a paid add-on: checked in 1·0. One 8-page Opus site is ₹1,548
loaded (on Haiku, much less), so the $100 ceiling is about six sites a month on Opus.
**Once partners pay:** a preview outside a turn is 1 credit (₹20 sold, ₹6.33 of cost); a build at list is ₹2.90 (2.2×
cover), and ₹0 at the margin while inside the included $20.

### Kill lines
- **A build:** measured on the invoice (not minutes × list) above ₹6.33 a build for two weeks → the build credit is
  repriced before the next partner.
- **Fixed cost:** 90 days after phase 1 ships with fewer than three partners' sites built → cancel the Team and Pro
  seats (₹2,482 a month saved; the domain is prepaid).
- **Pilot turns:** Frrata-paid turns reach the workspace limit two months running → Studio waits for credits (V3b)
  before more pilot sites.
- **Phase 3:** ADR-0017 rule 11 read whole: a plan's median hosted site above a third of that plan's hosting line **plus
  the overage it paid**, with fixed fees shared equally per hosted shop. With ₹2,570 of fixed fees, Launch's third (₹167
  of a proposed ₹500) is crossed at zero traffic until **16 hosted shops**; the hosting lines are still only proposed
  (ADR-0017 owner decision 4) and the rule was written on Cloudflare's numbers. The owner prices hosting on measurement
  before phase 3.

## Design review (frata-planning § 3)
- **UI/UX:** no new screen; the preview card and "Open preview" are V3b's approved card; states: requested, building,
  ready, failed (in our words, from `failed_code`), canceled, stale, checks failed.
- **Tenancy:** § Phase 0; § Security rules 1–2.
- **Modularity:** state in `src/domains/sites`; reads in `src/lib/queries/sites.ts`; writers in `src/lib/sites/` (PLATFORM_SCOPE
  entry with its reason for the webhook processing only); the GitHub client in one module.
- **SSOT:** a deployment's state from timestamps; the shown preview from `site_selections`; the repository name from
  the site id; the build key's facts stay in `storefront_keys`.
- **YAGNI:** no fleet, Admin › Sites, placements or frame in phase 1 (each with its phase above).
- **KISS:** Vercel's GitHub link builds; Frrata pushes; GitHub reports. Three tables and a selection table.
- **Scalability:** about 72k deployment rows a year at 100 sites; 6,000 webhook events a day at 10× (20 builds × 3
  statuses × 100 sites); the gate about 2,000 runs a day, each outside a transaction.
- **Performance:** each read on the index above, under 1 ms at that size (EXPLAIN asserted on a 10k seed); no `checks` in
  lists (a 64 kB jsonb × 20 rows is 1.3 MB); every outward call after `ctx.reads` returns, never inside `ctx.write`.
- **Reliability:** every GitHub and gate call through `fetchWithTimeout`; the push through the outbox (a retry pushes the
  same commit: safe); GitHub does not redeliver a failed delivery, so the drain looks up rows still building after 15
  minutes; the merchant reads "Preview could not be built" with a retry.
- **Security:** § Security rules; the webhook (1·8); the gate's fetch pinned (1·9); merchant content never rendered by
  the console (the preview opens in a tab on Vercel's host).
- **Motion and visuals:** n/a, no new screen.
- **Unit economics:** § Costs (reviewed).
- **Storefront API:** no change to what it answers; one new key kind (1·4): `api-contract-reviewer` on that diff.
- **Blast radius:** `app_pending_event_shops` gains a provider (shared with Razorpay, WhatsApp, Mux: their e2e flows
  rerun); `check:tenant` § 7b and `check:studio` gain entries; `HostingPort` swaps the stand-in (V3a's tests rerun).

## Security and tenancy rules that bind every phase
1. One merchant never sees another's: every site row carries `tenant_id` under `tenant_rows`; the repository and project
   ids are unique, so each belongs to one store; the webhook's definer takes the store from the site row.
2. A site's repository, deployment and keys belong to one store: one repository, one project, one preview key a store;
   tokens minted for that repository only.
3. No host token in `frata`: phases 1–2 make none; 1b's lives only in the fleet's project; `frata` never holds a
   `frrata-sites` token; the preflight refuses a console-team token.
4. The agent's key is per session; repository tokens are per use, ≤ 1 hour; the sandbox never holds a write token.
5. No cost field reaches a site: the preview key reads public data and drafts (ADR-0018).
6. Previews are never on a brand's domain, never indexed, always protected; the automation bypass never leaves the server.
7. What frata holds: the session App's private key (contents on site repositories, never `main`), the Fleet App's
   webhook secret (statuses only). Neither can deploy, change a firewall or repoint a host. Each through `secret()`.

## Narrows (what this plan leaves out of V2a·1 and where it comes back)
| V2a·1 item (studio-build plan:402) | Comes back in |
|---|---|
| kit and policy versions on a deployment | 1b (nullable columns, the fleet's patch waves) |
| approval, the declaration's id, `site_field_declarations` | phase 3 (publish, V2a·7 placements) |
| `live_from`, `rolled_back_at` | replaced by `site_selections` (`kind = 'live'`), phase 3 |

## Owner steps (names and ids only; never a key, private key or password in chat)
| When | Step | Send back |
|---|---|---|
| Before phase 0 | The console team's id (`team_…`, Vercel › Settings › General of `premabnrj-dots-projects`) | the id |
| Before phase 1 | `FrrataGit` on **GitHub Team**, 2FA required, Actions off (`docs/setup-studio-hosting.md` § 1) | URL and plan |
| Before phase 1 | The **session App** (contents read and write only). The **Fleet App** with deployments read and its webhook on `deployment_status` only, **no private key yet** (security M4; § 2 of the set-up guide to be corrected); both "only on this account" | names, App IDs, Client IDs; the session App's key through the secure form |
| Before phase 1 | **`frrata-sites`**, Pro, Standard Protection, spend management on, Vercel's GitHub link on chosen repositories only; **no token** | slug and team id |
| Before phase 1 | **`frratapreview.online`**, one year | registrar and expiry |
| Before phase 1 | Which partner and which store are the pilot; a yes to Frrata paying pilot turns up to the `studio-eval` limit | names; yes or no |
| Before phase 1b | Yes to the fleet's repository outside `FrrataGit`, its token in `frrata-sites`, the Fleet App's key there | yes / no |
| Before phase 3 | Rule (e); hosting lines (ADR-0017 decision 4) on 30 days of measurement | the rulings |

## Open questions, each with a recommendation
| # | Question | Recommendation |
|---|---|---|
| (e) | A routing token in the `frata` team (P5·4 versus S22) | **Option C** (security review): Frrata's app passes the site's paths itself (ADR-0019), a rewrite from the `sites` row to the selected live deployment, so no new token is needed; B helps only if the routing project sits in a team `frata` holds no token for; A widens accepted-findings row 1 and reopens it. Not needed in phases 1–2. The owner rules after `security-reviewer` reads P5·1 |
| f | Fleet first (V2a·5) or Vercel's GitHub link first | **GitHub link first** for one site; the fleet at the second or third |
| g | The site in Studio's pane or a new tab | **A new tab** until spike 8 passes in Safari |
| h | How a partner opens a protected preview with no token | **Spike 15 decides:** a share link made by hand per deployment, or partner seats (+₹2,068 each, priced above), or the thin fleet slice (share links only) brought into phase 1. Never the project's automation secret in a browser |
| i | One site in the console's team for the pilot | **None**; the hand-built pilot keeps its project until V2a·11 |
| j | `checks` as jsonb or a table | **Capped jsonb**, written by one definer; code reads `checks_passed` |
| k | Who may press build in phase 1 | the bound partner person in Studio only; owners see the state |
| l | One preview key a project or one a deployment (ADR-0018) | **One a project** for the pilot (no token to set one per deployment), 30-day rotation; per deployment with the fleet |

## Practices recorded in skills
When phase 0 lands, `frata-architecture` § Shop websites as code gains: sites are written only by definers; deployment
state from timestamps; the shown version from `site_selections`; the console team is a `host_teams` row; Frrata's server
is the only writer of a site repository.

## Repetitive work → agents and scripts
| Chore | Script or agent |
|---|---|
| Proving a preview is built and checked after a change | e2e `site-preview` on fakes |
| Checking a push against the path policy | the `site.build` sender's own check, unit-tested |

## Build C (phase 0) — held, 2026-11-24
Not built. The architecture review found the drawn shape not certain (a pointer column replaced by `site_selections`; the
deployment's identity; the definers' callers; the check writer), and two answers it rests on come only from the accounts:
what a real `deployment_status` carries (GitHub's deployment id, Vercel's `dpl_` id, size) and what spike 15 says about
share links. The console team's id is also needed for the `host_teams` seed. Build it as task 1·1 once those three are in;
migration number the next free one then (main is at 0175 today). The tenancy proof was run on main's migrations on a fresh
Postgres 16 on 2026-11-24: "all checks passed (through § 104)"; § 90 stays free for it.
