# V2a: one partner's agent builds a site into its own repository and sees it on a preview link
Status: draft · Date: 2026-11-24 · Lane L (`claude/lane-l-sites`) · For the owner, through the orchestrator
**Mockup:** none — phases 0–2 add no screen of their own (Studio's preview pane, Checks and Code tabs are drawn and approved in `docs/mockups/2026-11-22-studio-workbench.html`); phase 3 (publish) needs V2a·8's mockup first
**Approved:** not yet; it stands on the owner's decisions of 2026-11-24 ("vercel for now. start step1"); sign-off asked through the orchestrator
**Review:** architecture-reviewer pending, 2026-11-24
**Review:** security-reviewer pending, 2026-11-24
**Review:** tenancy-auditor pending, 2026-11-24
**Review:** speed-reviewer pending, 2026-11-24
**Review:** unit-economics-reviewer pending, 2026-11-24

Adds to `docs/plans/2026-11-12-studio-build.md` § V2a and `docs/plans/2026-11-22-studio-workbench.md`; where this plan is
narrower (a pilot cut), it says so and the V2a row it narrows. Decisions it stands on: ADR-0017 § The decision as it stands
(Vercel; one new Pro team `frrata-sites` when the fleet is built, nothing of it in `frata`'s team), ADR-0016 as amended
(GitHub organisation `FrrataGit`), ADR-0019's 2026-11-24 amendments (stores on `frrata.online`, previews on
`frratapreview.online`, the public site on `frrata.shop`), ADR-0020 (Studio's agent), ADR-0018 (build keys).

## In short (for the owner)
- **What you get, in order, and you can stop after any phase:** (1) one partner, in Studio, has the agent write a site from
  the starter into that site's own GitHub repository and sees it built on a private preview link; (2) every preview kept as
  a version, with "go back to this one"; (3) publish, outlined only, because it waits on the secure payment frame (P3) and
  the address work (P5).
- **The smallest path needs no fleet service and no Vercel token anywhere for one site.** Vercel's own Git integration in
  the new `frrata-sites` team builds each push to a preview; GitHub tells Frrata the preview is ready. The fleet service
  (which alone would hold a Vercel token) comes in phase 1b, when a second and third site make making projects by hand a
  chore. That also answers open question (e) for now: no token at all in phases 1–2.
- **Monthly running cost** (loaded at ₹103.40 a dollar, ex GST; § Costs): phase 1 about **₹2,750 at 1 site, ₹3,100 at 3,
  ₹4,300 at 10**; phase 2 adds almost nothing; phase 3 is not priced until 30 days of real traffic are measured.
  Most of it is the fixed Vercel Pro seat (₹2,068) and GitHub Team (₹414).
- **Build size:** phase 0 small (one lane, now); phase 1 medium (one lane, about two weeks of a worker); phase 1b medium
  (one lane); phase 2 small to medium (one lane); phase 3 large (two lanes, after P3 and P5).
- **What we need from you, and when:** § Owner steps. Before phase 1 starts: `FrrataGit` on GitHub Team, the two GitHub
  Apps, the `frrata-sites` team (Pro), `frratapreview.online` bought; ids and names only, never a key in chat.

## Where things stand (2026-11-24, read from the repository)
| Piece | State | Where |
|---|---|---|
| Studio's agent loop, tools, `asTurn`, binds, credits ledger | built (V3a; staff only, `STUDIO_OPEN=staff`) | `src/lib/studio/**`, drizzle/0166–0169 |
| `HostingPort` | stand-in: `requestPreview` answers `not_available`, `latest` answers null | `src/lib/studio/hosting.ts` |
| `preview_build` tool | answers "not available yet" | `docs/plans/2026-11-22-v3a-runtime.md` § The hosting stand-in |
| Repository for a session | none: Starter 0 goes in as a session file and code is lost when the session ends | V3a plan, line 51; V3a·7 waits |
| `sites`, `site_deployments` | not built | this plan's phase 0 (V2a·1) |
| Build keys (`frs_build_`, drafts, header only) | built (G·2) | `src/lib/queries/storefront-keys.ts`, `mintBuildKey` |
| Starter | built (`kit/starter`, `npm run check`) | `kit/starter` |
| Accounts | none yet: `FrrataGit`, the two Apps, `frrata-sites`, `frratapreview.online` | `docs/setup-studio-hosting.md` |
| Spike items blocked on set-up | 2 (App token as repo token), 4 (instruction files), 8 (preview cookie in Safari), 9 (`next build` size), 13 (OIDC), 14 (ruleset bypass), 15 (share links) | `docs/research/2026-11-22-studio-agent-spike.md` |

## The shape of the smallest path
```
Studio (frata, bom1)                       GitHub: FrrataGit                         Vercel: frrata-sites (Pro)
 asTurn tool push_files ──session App──▶   site-<id> repo, branch studio/<session>  ──Vercel Git integration──▶ preview build
   token: this repo only, contents:write     ruleset: main only by the fleet App      install: npm ci --ignore-scripts
   minted per turn, ≤ 1 h, revoked            (needs Team)                             env: the store's build key (Preview)
                                                                                       Deployment Protection on
 /api/webhooks/github  ◀── deployment_status (Fleet App webhook, HMAC) ◀── Vercel posts statuses to the commit
   stored, 200, processed later: site_deployments row (state from timestamps), gate verdict
 preview_build / latest() reads the row; Studio shows "Open preview" (a new tab, bypass link)
```
Why this and not the V2a·5 fleet first: the fleet's jobs are making projects, minting keys into them, share links and
patch waves. At one site each is a five-minute staff step done once; at three a chore; at ten a script. The fleet's design
(V2a·5) is unchanged and lands as phase 1b, behind the same `HostingPort`, with the same tables.

## Phase 0 · The data model (V2a·1), now, no accounts needed — lane L
**Built:** migration `0176_sites` (number taken at build time; § Build C). Three tables and one definer:
- `host_teams` (platform scope, definer-only, no role reads it; Admin reads it later through a named definer): a row per
  Vercel team Frrata uses: `slug` (unique), `external_id` (Vercel `team_…`, unique, null until the owner sends it), `role`
  (`console` | `sites`), at most one `console`. Seeded with the console team (`premabnrj-dots-projects`, `console`), so
  "the console's team" is a row the database checks, not a setting someone remembers (ADR-0017 rule 3).
- `sites` (tenant-policied): one per store (`unique (tenant_id)`), `host_team_id`, `repository_id` (GitHub's numeric id,
  stable across renames; unique), `repository` (`owner/name`, for display), `host_project_id` (Vercel `prj_…`; unique),
  `created_at`, `created_by` (the person), `partner_id` (who builds it, from the bind; null for Frrata's own),
  `preview_deployment_id` (which deployment is the store's preview; composite FK on `(tenant_id, id)`), `closed_at`.
  `frata_app` reads; nobody inserts but the definer; frata_app updates only `preview_deployment_id` (phase 2's "go back").
- `site_deployments` (tenant-policied, append-only for frata_app): `site_id` (composite FK with `tenant_id`), `commit_sha`
  (40 hex), `branch`, `cause` (`agent` | `person` | `patch` | `rollback`), `host_deployment_id` (Vercel `dpl_…`, unique),
  `url` (https, the preview's own host), `created_at`, `building_at`, `ready_at`, `failed_at`, `failed_code` (our code),
  `checks_passed`, `checks` (jsonb, ≤ 64 kB, WB·5's results, text only), `checked_at`. **State is derived** (no status
  column): queued → building → ready | failed, from the timestamps, by one pure function `deploymentState()` in
  `src/domains/sites/state.ts` with a SQL mirror in one file and a parity test (the order-predicates pattern).
  frata_app may insert a requested row (the phase 1b fleet path) and nothing else; state columns are written by the
  webhook's definer only.
- `app_site_create(p_team uuid)` (security definer, `search_path = ''`, revoked from public, anon, authenticated,
  service_role, frata_builder, frata_admin; granted to frata_app): the store from `app_current_tenant()` (null → refused),
  the partner from `app_current_partner()` when Studio's bind is set. Refuses in a code, never a raw error: `no_store`,
  `team_unknown`, `site_exists` (a second site for a store; also the unique index), and **while the team is the console's**
  `console_taken` (a second site in that team: the pilot only) and `console_partner` (any store with a live partner
  link). Returns the new site's id.
- `frata_builder`: select on named columns of `sites` and `site_deployments` (not `created_by`, not `checks`' raw text
  until WB·5 redacts it) under `builder_rows` / `builder_only` (tenancy audit H, workbench plan).
- Proof § 90 in `scripts/verify/tenancy.sql`: two stores, a site each; cross-store read and write refused for frata_app and
  frata_builder; second site refused; console-team refusals; definer EXECUTE refused to anon, authenticated and
  frata_admin; `host_teams` unreadable by every role; the live-deployment read's EXPLAIN on an index.
**Not built in phase 0:** any UI, the fleet, any network call, `src/lib/queries/sites.ts` (phase 1, with its first reader).
**Tests:** `npm run verify:tenancy` on a fresh database; `npm run check:migrations`; `npm test`; `npm run typecheck`.
**Size:** small, one lane (this one).

## Phase 1 · One partner, one site, built on a preview link
**Built** (each a task with its verify command once the owner approves the plan):
| # | Task | Verify |
|---|---|---|
| 1·1 | `src/lib/queries/sites.ts`: the store's site and its latest deployments, through `withTenant` (console) and `ctx.reads` (Studio); the transaction closed before any fetch | `npx vitest run src/lib/queries`; `npm run check:tenant` |
| 1·2 | **The repository, by hand once for the pilot:** staff make `FrrataGit/site-<8 of site id>` from the starter template (never forked, never named after the shop), install the session App and Vercel's GitHub App on that repository only, add the ruleset; an ops script `scripts/ops/site-register.mjs` prints the SQL that fills `repository_id`, `repository`, `host_project_id` for a site id (never run by an agent against production; the `prod-migrate.mjs` pattern) | the script's own test; the owner's yes on the printed SQL |
| 1·3 | **The project, by hand once:** in `frrata-sites`, one project linked to that repository: region bom1; install command `npm ci --ignore-scripts`; production branch `main`; ignored build step: build only `studio/*` and `main`; Deployment Protection (Vercel Authentication) on for previews; the store's **build key** as a Preview, Sensitive variable (minted by `mintBuildKey` in the console by a staff member who is the store's partner person; audited), the public key for Production later | the checklist in `docs/setup-studio-hosting.md` § 8 (new), ticked by staff |
| 1·4 | **The session App's token** (V3a·7, narrowed): `src/lib/studio/github.ts` mints an installation token with `repositories: [repository_id]` and `permissions: { contents: write }` only, at the start of each turn that writes, ≤ 1 hour, revoked at the turn's end; the repository id read from `sites` matched on the bound store, never from the model, a tool's input or a request; the App's private key read through `secret()` in one module (`check:config`) | `npx vitest run src/lib/studio` against `e2e/fakes/github.mjs` (new) |
| 1·5 | **The session mounts the repository** (spike item 2 run first): Managed Agents `checkout` of `studio/<session id>` at the branch head Frrata read, with the token as `authorization_token`; the instruction-file check at the mounted SHA (spike item 4: only `.claude/skills/` loads; anything else is refused before the session starts) | spike items 2 and 4 re-run, passed; `npx vitest run src/lib/studio` |
| 1·6 | **`preview_build` for real:** `vercelGitHosting` behind `HostingPort`: `requestPreview` records a `site.build` intent in the tool's bound write (one in flight a site; a newer one replaces a queued one) and the push of the turn's commit to `studio/<session>` is the build; `latest` reads the newest `site_deployments` row. Frrata reads the branch head itself (never a SHA from the model) | `npx vitest run src/lib/studio src/lib/sites` |
| 1·7 | **`/api/webhooks/github`** (ENTRY_POINTS): body capped (25 kB → 413) before parsing, `X-Hub-Signature-256` HMAC on the raw body, our key `github:<X-GitHub-Delivery>`, stored in `webhook_events`, 200 at once; processed in `after()` and by `/api/cron/drain` through a definer `app_site_deployment_seen(repository_id, sha, …)` that takes the store from the `sites` row with that repository id (platform scope, ids only), refuses a repository no site has, and trims the payload to state, SHA, deployment id and URL | `npx vitest run src/app/api/webhooks src/lib/sites`; `npm run verify:tenancy` (§ 90 gains the webhook definer) |
| 1·8 | **The gate, the pilot's cut of V2a·6:** after `ready`, Frrata's server fetches the preview's HTML for the home, a product and a collection page through the bypass and runs the checks that read output only (no key-shaped string, the legal block, the bag link, no reserved path, `images.unoptimized` markers, first-load script ≤ 150 kB gz); results in `checks` (≤ 64 kB). The build-time half (lockfile against policy, hard floor on source) runs on the repository's files through the session App before the push | `npx vitest run src/domains/sites` |
| 1·9 | **Studio shows it:** the agent's preview card says ready or failed in our words; "Open preview" opens a new tab on the deployment URL with a per-deployment bypass (top-level, so Safari's cookie rule does not bite; spike item 8). The workbench's preview pane keeps the store preview it has today | e2e flow `site-preview` (next free number) on the fake GitHub and a fake Vercel status; `mockup-parity-reviewer` on the card |
| 1·10 | **Measured:** every build's minutes and the team's usage for 30 days into a table the unit-economics review reads | the table read by `unit-economics-reviewer` |

**What stops the agent writing outside its repository:** the token is minted for one repository id with contents write and
nothing else; the session App is installed only on site repositories (never `frata`, never the fleet's); `main` is ruled
so only the Fleet App updates it (spike item 14 proves a push by the session App is refused); the sandbox's network is
`limited` to the API host and GitHub's hosts (spike item 5); the repository id comes from `sites` on the bound store; a
second store's repository is a second token the turn cannot ask for. Pushes to any branch other than `studio/*` are not
built (ignored build step) and are visible in the repository's history.

**The preview's key:** a build key reads drafts (ADR-0018 amendment), so it lives only as a Sensitive Preview variable of
that store's own project; it never reaches the sandbox or the model (the session uses its own vault key, V3a). Rotated when
the partner person who made it leaves (the key's own rule, G·2).

**Pilot cut (one site) — can be cut:** the fleet and every Vercel API call (projects, keys, share links by hand); the
preview domain on the preview (Vercel's own protected URL is used; `frratapreview.online` is attached in 1b); the
in-pane frame of the site; the source half of the gate beyond the lockfile; Admin › Sites (V2a·10); placements (V2a·7).
**Cannot be cut:** GitHub Team and the ruleset on `main`; the per-turn, one-repository token; `--ignore-scripts`;
Deployment Protection on previews; the webhook's HMAC, cap and stored-first path; the console team refusals; proof § 90;
the build key only in that store's own project.

**Size:** medium, one lane (about two weeks of a worker), after the owner's phase-1 steps; spike items 2, 4, 5, 8, 9, 14
and 15 run in its first two days.

## Phase 1b · The fleet, when a second and third site are near (V2a·3–5 as written, narrowed)
**Built:** the fleet service (`frrata-fleet`, a small project in `frrata-sites`, its own repository outside `FrrataGit`
per S8): the only holder of a Vercel token (a team token of `frrata-sites`, never of `frata`'s team; the preflight
refuses a token whose team id is a `console` row of `host_teams`) and the Fleet App's key. Its calls: make the repository
from the template, make the project as 1·3 lists, set the build key (V2a·4: minted at send time in the row's store, sent in
one HMAC-signed body, deleted if the call fails), a per-deployment share link, attach `<deployment>.frratapreview.online`,
delete previews never live after 30 days. Frrata's app talks to it only through outbox kinds `site.create`, `site.key`,
`site.share` (ADR-0006) and hears back through `/api/webhooks/fleet` (V2a·3). Routing stays out of it (ADR-0019 point 2).
**Size:** medium, one lane. **Cost:** inside the same Pro team (its functions are a few hundred calls a month).

## Phase 2 · Versions and rollback of previews
**Built:** every ready deployment is a version (the rows already exist); Studio's Versions list reads them 20 a page on
`(site_id, created_at desc)`; "Go back to this one" sets `sites.preview_deployment_id` to an older ready row of the same
site (frata_app's one column update, in `asTurn`'s bound write or `asMember`; refused if the row is not ready, not this
site's, or older than the kept window); a newer build moves the pointer forward again. Kept: the last 10 ready previews
and anything ever live; older preview deployments deleted by the fleet's 30-day sweep (1b) or by hand before it. The
repository keeps every commit regardless, so "go back" never loses code; a restore that rebuilds an older SHA is a new
deployment with `cause = 'rollback'`.
**Tests:** a parity test for the pointer rules; proof § 90 gains the pointer's cross-store refusal; e2e `site-preview`
gains go back and forward.
**Size:** small to medium, one lane. **Cost:** about the same as phase 1; Vercel does not bill kept deployments
separately (unverified for 2026: checked before the phase).

## Phase 3 · Publish (outline only; waits on P3 and P5)
Publish = promote one checked version to the store's address through Frrata's app (ADR-0019: the store's host stays
Frrata's; the site sits behind it). It needs: P3 (the secure payment frame) for any store with real shoppers; P5 (one
address: routing rules, `secure.` records, `frrata.online` and P4b); V2a·6's full gate as the publish checks (source and
output, the one-address list); V2a·8's screens and their mockup (Open my store promotes the opening version; the
handover accepts a deployment id); Production keys (the public key only); the fleet's promote and rollback; Admin › Sites'
kill switch. **Cost** is the live traffic, priced only on 30 days of the pilot's measured usage (decision 18; ADR-0017's
guess restated at ₹103.40: Launch ≈ ₹345, Growth ≈ ₹3,451, Scale ≈ ₹11,473 a site a month, all above the proposed kill
line, so no paid store is hosted before the measurement). **Size:** large, two lanes. Open question (e) must be ruled before it.

## Costs (a month; ex GST; list price × ₹103.40 loaded, `frata-unit-economics` § The dollar rate, 2026-11-24)
Assumptions, each named: Vercel Pro is $20 a month for one seat plus usage (`docs/setup.md` S22); GitHub Team about $4 a
member a month, one member (`docs/setup.md:564`); a preview build is 2 minutes at $0.014 (Studio inputs,
`frata-unit-economics`), so $0.028; **60 preview builds a site a month** (two a working day; the cap is 20 a site a day
before handover, V2a·9) — a guess, measured in 1·10; preview traffic is the partner and the brand only, so bandwidth and
function calls stay inside the plan's included usage (unverified until 1·10); `frratapreview.online` at most the repo's
₹3,200 for 3 years for a `.com` (₹89 a month; a `.online` price is not in the repo); the GitHub Apps and repositories
cost nothing; the agent's own model and sandbox cost is the partner's, paid in credits (a preview outside a turn is 1
credit, ₹6.33 of cost).
| Line | 1 site | 3 sites | 10 sites |
|---|---|---|---|
| Vercel Pro seat (`frrata-sites`) $20 | ₹2,068 | ₹2,068 | ₹2,068 |
| GitHub Team, one member, $4 | ₹414 | ₹414 | ₹414 |
| Preview domain, amortised | ₹89 | ₹89 | ₹89 |
| Preview builds, 60 × $0.028 a site | ₹174 | ₹521 | ₹1,737 |
| **Phase 1 total** | **₹2,745** | **₹3,092** | **₹4,308** |
| Per site | ₹2,745 | ₹1,031 | ₹431 |
| Phase 1b adds (fleet functions, within included usage) | ~₹0 | ~₹0 | ~₹0 |
| Phase 2 adds (kept deployments) | ~₹0 | ~₹0 | ~₹0 |
At ₹94 base the phase 1 totals are ₹2,495 / ₹2,811 / ₹3,916. If the frata Pro seat could host the pilot instead, the
₹2,068 would vanish, but the owner and ADR-0017 rule 3 put Studio's code outside that team: not an option.
**What it earns against:** each preview a partner builds outside a turn is 1 credit (₹20 sold, ₹6.33 of cost); one
preview build costs ₹2.90, so builds pay for themselves 2× inside the credit. The fixed ₹2,571 is a pilot cost.

### Kill lines
- **A preview build** measured above ₹6.33 (more than 4.4 minutes at $0.014, or a dearer machine) for two weeks: the
  credit for a build is repriced before the next partner.
- **Fixed cost:** if 90 days after phase 1 ships fewer than three partners have built a site, the Team and Pro seats are
  cancelled (₹2,571 a month saved) and Studio goes back to session files.
- **Phase 3:** ADR-0017 rule 11 stands: a plan's median hosted site costing more than a third of that plan's hosting line
  for two months stops new hosted stores.

## Security and tenancy rules that bind every phase
1. One merchant never sees another's: every site row carries `tenant_id` under `tenant_rows`; the repository id and the
   project id are unique, so a repository or project belongs to one store; the webhook's definer takes the store from the
   site row, never from the payload.
2. A site's repository, deployment and keys belong to one store: one repository, one project, one build key per store;
   the token is minted for that repository only.
3. No host token in `frata`: phases 1–2 hold none anywhere; 1b's token lives only in the fleet's project in
   `frrata-sites`, and the preflight refuses a token whose team is the console's.
4. The agent's key and repository token are per session (turn-scoped for the token, ≤ 1 hour, revoked at the end).
5. A cost field never reaches a site: the build key reads what the store's pages show plus drafts (ADR-0018).
6. Previews are never on a brand's domain, never indexed (`X-Robots-Tag: noindex` from the project), protected.
7. What frata does hold: the session App's private key (writes contents to site repositories only, never `main`), the
   Fleet App's webhook secret (reads statuses), and per-deployment bypass links (view only, expiring). None can deploy,
   change a firewall or repoint a host. Each in `secret()`, Production only.

## Tests that prove it
`npm run verify:tenancy` (§ 90 every phase); `npm run check:migrations`; `npx vitest run src/domains/sites src/lib/sites
src/lib/studio src/app/api/webhooks`; e2e `site-preview` on fakes; spike items 2, 4, 5, 8, 9, 14, 15 recorded passed in
the spike report; a manual pen-style check that the session App's token cannot push to `main`, read a second repository
or reach `frata`.

## Owner steps (names and ids only; never a key, private key or password in chat)
| When | Step | Send back |
|---|---|---|
| Before phase 1 | `FrrataGit` on **GitHub Team** (about $4 a month), 2FA required, Actions off (`docs/setup-studio-hosting.md` § 1) | the URL and plan |
| Before phase 1 | The **session App** (contents read and write only) and the **Fleet App** (contents read and write, administration read and write for rulesets later, deployments read, webhook on `deployment_status`), both "only on this account" (§ 2) | names, App IDs, Client IDs; the private keys through the orchestrator's secure form |
| Before phase 1 | **`frrata-sites`**, Pro, Standard Protection, Vercel's GitHub integration installed on chosen `FrrataGit` repositories only; **no token** (§ 4) | slug and team id |
| Before phase 1 | **`frratapreview.online`** bought, nameservers to Vercel when 1b attaches it (§ 5) | registrar and expiry |
| Before phase 1 | Which store is the pilot partner's, and which partner | the store's name |
| Before phase 1b | Yes to the fleet's own repository outside `FrrataGit` (S8) and its token in `frrata-sites` | yes / no |
| Before phase 3 | Rule open question (e); P3 and P5 done; hosting priced on 30 days | the rulings |

## Open questions, each with a recommendation
| # | Question | Recommendation |
|---|---|---|
| (e) | A routing token in the `frata` team (P5·4 versus S22) | **Not needed in phases 1–2**: no token exists. For phase 3, **option B**: routing rules published from a project of their own, so no `frata`-team token can repoint hosts, unless P5·1's spike shows Vercel scopes a token to one project's routing only, in which case A with that scope and the preflight naming it. The owner rules after `security-reviewer` reads P5·1 |
| f | Fleet first (V2a·5 as written) or Vercel Git integration first | **Git integration first** for one site (no token, a week less), the fleet at the second-to-third site |
| g | The preview in Studio's pane (a frame) or a new tab | **A new tab** until spike item 8 passes in Safari; the pane keeps the store preview it has |
| h | Where the gate runs | **Output checks on Frrata's server after ready; source checks before the push** for the pilot; the Sandbox build path of V2a·5 when patch waves need it |
| i | One site in the console's team for the pilot (allowed by rule 3) or none | **None**: the agent's site goes straight into `frrata-sites`; the existing hand-built pilot keeps its project until V2a·11 moves it |
| j | Repository name | `site-<first 8 of the site id>`, never the shop's name (kit spec § 6) |
| k | Whether `checks` is a jsonb on the deployment or a table | **A capped jsonb** (≤ 64 kB, results only, nothing branches on it; `checks_passed` is the column code reads) |
| l | Who may press build in phase 1 | the bound partner person in Studio only (asTurn); console owners see the state, never press it |

## Practices recorded in skills
`frata-architecture` § Shop websites as code gains (when phase 0 lands): sites are written only by `app_site_create` and
the webhook definer; deployment state from timestamps; the console team is a `host_teams` row.

## Repetitive work → agents and scripts
| Chore | Script or agent |
|---|---|
| Registering a hand-made repository and project for a site | `scripts/ops/site-register.mjs` (prints SQL; 1·2) |
| Proving a preview is built and checked after a change | e2e `site-preview` on fakes |

## Build C (phase 0) — record
Filled in at build time: migration number, files, the commands run and their output.
