# Studio agent spike (V3a·1): what Managed Agents does, measured or read, item by item
Status: **in progress** (2026-11-22). Documentation answers are in; probes are running on the `studio-eval` key
is not in this environment. Lane D, branch `claude/lane-d-agent-spike`. Plan: `docs/plans/2026-11-12-studio-build.md`
§ V3a (V3a·1) · Spec: `docs/specs/2026-11-16-studio-agent.md` § 9 · Decision: ADR-0020 · Script:
`scripts/studio/spike.mjs` (results: `docs/research/2026-11-22-studio-agent-spike.results.json`).

## In short
- **Blocked first on the key.** A network secret can't be saved for `api.anthropic.com` (the session proxy never adds a
  credential to Anthropic's hosts), so the key has to go in as an environment variable on `frata-studio-eval`, named
  `STUDIO_EVAL_ANTHROPIC_KEY` (never `ANTHROPIC_API_KEY`, which the session's own runtime would read). Every session on
  that environment can read it, and so can every command run in one; the workspace's monthly spend limit is the backstop.
  The script refuses to run without it and never prints it.
- **What the documentation settles today (2026-11-22):** mount by commit SHA is supported. A vault secret goes in
  headers or body, never the URL. `limited` refuses a host on 80/443 with a 403 that names the host. Sessions are kept
  until we delete them (no ZDR, no HIPAA). `inference_geo` is `us` or `global` only and the workspace stores data in the
  US only (no India). Rate limits are 300 creates and 1,200 reads a minute per organisation, and no documented cap on
  concurrent sessions. WIF takes any standards-compliant OIDC issuer, and the SDK takes a per-request token. No webhook
  fires per tool call; one fires per idle.
- **Three facts in our spec or skill are out of date:**
  - The rate limits in `frata-integrations` (600 a minute for "other" calls, environments 60 a minute and 5 at once)
    come from the cached skill bundle. The live reference page says 300 creates and 1,200 reads a minute.
  - `allow_package_managers: true` also opens `github.com`, `api.github.com` and `raw.githubusercontent.com` to the
    sandbox. The policy must keep it `false`, which spec § 5 already implies.
  - A Console-made vault credential is header-only by default; through the API, leaving `injection_location` out
    enables both header and body. Our code must send `{header: true}`.
- **Needs the owner:** a GitHub organisation with the session App, a fixture repository and GitHub Team; a build key the
  owner agrees to mint (a production row) or a non-production API host; the Anthropic Console's service account,
  federation issuer and rule; the Vercel team `frrata-sites` with Deployment Protection and one preview; a Console
  webhook endpoint; a real Safari. Exactly what each item needs is in § Blocked.
- **Spend:** $0 so far. With the key, the eight probes that need nothing else have hard session budgets summing to
  **$3.11**; I expect under $1 of list cost.

## How to run it
```bash
node scripts/studio/spike.mjs                    # the plan: each probe, what it needs, its cap; no network
node scripts/studio/spike.mjs run models geo     # free and near-free first
node scripts/studio/spike.mjs run session network vault custom-tools cache concurrency --yes   # ≤ $3.10 of caps
node scripts/studio/spike.mjs fixture /tmp/spike-fixture   # the canary repository for `instructions`
```
Rules the script keeps:
- **The key:** read from `STUDIO_EVAL_ANTHROPIC_KEY` and passed to the SDK explicitly, with the base URL pinned and no
  auth token. Every string the script writes is scrubbed of each secret it holds.
- **Spend:** every session has a hard session budget equal to its probe's cap. The ledger in the results file sums
  measured list cost, and a run that could pass $25 refuses. A run over $3 needs `--yes`.
- **Cleanup:** a probe deletes its own sessions, throwaway vault and uploaded file when it ends. One agent per shape and
  one environment per network shape are reused, and their ids are recorded.
- **Verified so far:** with a dummy key, the script reaches `api.anthropic.com` through this session's proxy, gets
  `401 authentication_error`, records it and spends nothing (2026-11-22).

## Results (written by the script)
<!-- spike:results:start -->

Measured spend so far: **$0.00** of the $25 cap (list cost, 2 runs).

| Probe | Ran | Status | Answer | List cost |
|---|---|---|---|---|
| `models` | 2026-11-22 19:32 UTC | answered | claude-opus-5-5 answers on this key (context 1000000, output 128000) | $0.00 |
| `geo` | 2026-11-22 19:32 UTC | answered | default inference geo served: global; an agent pinned to `us` was accepted; the SDK allows only "global" and "us" (no India) | $0.00 |

<!-- spike:results:end -->

## Measured beside documented (2026-11-22, workspace `studio-eval`)
Each probe's measured answer, set against what the documentation said. "Same" means the measurement confirms it;
"differs" says how.

| Probe (item) | Documentation said | Measured | Verdict |
|---|---|---|---|
| `models` (the key) | — | The `studio-eval` key answers; `claude-opus-5-5` reports a 1,000,000-token context and 128,000 output. $0.00 | **passed** |
| `geo` (12) | `inference_geo` is `us` or `global`; the workspace's default decides when the agent doesn't pin one | One Haiku 5.5 call with no geo was served in **`global`**: the workspace default is `global`, not `us`. An agent pinned to `us` was accepted. $0.0000035 | **passed**; same, and it settles that the agent file must pin `us` (otherwise inference may run anywhere) |

## Item by item
Sources are tagged [V] when they are vendor documentation or SDK types read on the date shown, and [U] when no current
source was found. "Probe" names the script's test; its pass line says what makes the answer a yes.

| # | Item (V3a·1) | From documentation, 2026-11-22 | Probe and pass line | Status |
|---|---|---|---|---|
| 1 | A Managed Agents session on Starter 0 for Kesar | A session runs a cloud sandbox: Ubuntu 24.04, x86_64, up to 8 GB memory and 10 GB disk, Node 20/21/22 (22 default), Playwright with Chromium; a request that omits `networking` gets `unrestricted` [V, platform.claude.com/docs/en/managed-agents/cloud-sandboxes-reference, environments] | `session` (any session works, with the container's facts) · then Starter 0 itself through `build` | **key** for `session`; Starter 0 on Kesar **blocked** (rows 2, 6, 9) |
| 2 | The session App's token as the repository token | `authorization_token` is "the GitHub token used to clone the repository and to push to it", never echoed; the page recommends fine-grained personal access tokens and names classic scopes (`repo`); a GitHub App installation token is not mentioned; tokens rotate on a running session through `sessions.resources.update` [V, managed-agents/github] | `mount-sha` with `SPIKE_GITHUB_TOKEN` set to an App installation token on a private repository: HEAD equals the SHA and `git push` to `studio/spike` works | **blocked**: the GitHub organisation and the session App don't exist |
| 3 | Mount by commit SHA | `checkout: {type: "commit", sha}` is supported; the repository is cloned at session start; skills are read from that checkout once [V, managed-agents/github; SDK 1.12.0 `BetaManagedAgentsCommitCheckout`] | `mount-sha`: `git rev-parse HEAD` in the sandbox equals `SPIKE_REPO_SHA` | documented yes; **key** plus any repository (a public one needs no token) |
| 4 | Whether `CLAUDE.md`, `AGENTS.md`, `.mcp.json` or hooks load as instructions | Only the root `.claude/skills/<name>/` is documented as loaded ("discovered once per session, from the repository state checked out at session start"); nothing says `CLAUDE.md`, `AGENTS.md`, `.mcp.json` or `.claude/settings.json` hooks are read [V, managed-agents/github, managed-agents/skills via the skill bundle] · absence in documentation is not a no [U] | `instructions`: the fixture holds a distinct canary in each file plus a skill as the positive control. Pass (the safe answer): the agent, using no tool, names only the skill's canary, and no hook file appears in `/tmp` | **blocked**: needs the fixture repository (`spike.mjs fixture` writes it) in Frrata's GitHub organisation, or the owner's yes to a public fixture |
| 5 | `limited` hosts and DNS | Under `limited` only `allowed_hosts` are reachable; a refused request on 80/443 gets a **403 naming the blocked host**; exact names match exactly, `*.x` matches subdomains only; attached repositories, files and memory stay available with no hosts listed; `allow_package_managers` opens a fixed list that **includes `github.com`, `api.github.com`, `codeload.github.com`, `raw.githubusercontent.com`**, npm, PyPI and Docker hosts; access is by host, not by operation [V, managed-agents/environments]. DNS is not described [U] | `network`: the resolver, the proxy variables, `getent` for an allowed and a refused host, HTTP codes for allowed, refused and a raw IP | documented in part; DNS **key** |
| 6 | The build key in a vault header | An `environment_variable` credential shows the sandbox an opaque placeholder and is substituted at egress in headers and/or body (`injection_location`), only to its own `allowed_hosts`, **never in the URL path**; the host must also be allowed on the environment; created through the API with `injection_location` left out, **both** places are on (Console-made credentials are header-only); a host that echoes headers hands the value back into the sandbox [V, skill bundle `shared/managed-agents-tools.md`; SDK 1.12.0 `BetaManagedAgentsEnvironmentVariableCreateParams`] | `vault` with a throwaway random value and an echo host: the sandbox's hash differs from the value's, the echoed header equals it, the URL query does not · the real build key through `build` | mechanism **key**; the real key **blocked** (row 9) |
| 7 | Whether each custom tool call raises a webhook | No webhook per tool call. `session.status_idled` fires on every move to idle, including "awaiting … custom tool result"; deliveries are thin, unordered, retried up to 3 times over 5–120 s and then **dropped without a signal**; endpoints are registered in the Console only [V, skill bundle `shared/managed-agents-webhooks.md`, managed-agents/reference] | `custom-tools`: four calls (two alone, two in parallel) and the count of `requires_action` idles. Expected: 3 idles, so a webhook per idle, and parallel calls share one | **key** (the count); the live webhook is **blocked** (a Console endpoint). Since webhooks drop, `/api/cron/studio` every minute is needed either way |
| 8 | The share link's cookie in a cross-site iframe in Safari | Vercel's automation bypass sets its cookie `SameSite=Lax` by default; `x-vercel-set-bypass-cookie: samesitenone` sets `SameSite=None` "when accessing the deployment through … an iframe" [V, vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation, via Vercel's documentation search]. Safari blocks third-party cookies in cross-site iframes by default, `SameSite=None` included [U: WebKit's tracking prevention, not re-read today; webkit.org is not reachable from this environment] | Not a script probe: a preview on `frrata-sites` with protection on, framed from a console origin, opened in Safari on macOS and iOS. Pass: the second request in the frame is served without a challenge | **blocked**: `frrata-sites`, one protected preview, a real Safari. Expected to fail: then previews need a host on the console's own site (same-site), or the share token on every request |
| 9 | `next build` time and memory | Up to 8 GB memory and 10 GB disk, CPU count not stated [V, cloud-sandboxes-reference] | `build`: Starter 0 packed from `kit/starter`, `npm ci --ignore-scripts`, `next build` reading the API through the build key in a header. Pass: both finish, with time and peak memory recorded | **blocked**: `SPIKE_BUILD_KEY` and `SPIKE_API_HOST`. Starter 0's build reads the API, so it needs a key. Minting one for Kesar writes a production row: the owner's call |
| 10 | Concurrency and rate limits | Per organisation: create endpoints 300 a minute, read endpoints (retrieve, list, stream) 1,200 a minute; organisation spend limits and usage-tier limits also apply; no documented limit on concurrent sessions [V, managed-agents/reference, Rate limits]. The cached skill bundle's 600 "other" a minute and environments' 60 a minute and 5 at once differ: the live page wins. Model calls draw the organisation's token limits [V, skill bundle `managed-agents-api-reference.md`]; workspaces can carry their own rate limits (SDK 1.12.0 `organization.workspaces.rateLimits`) | `concurrency`: 10 sessions created at once with no message (no model call; runtime bills active time only). Pass: 10 created, no 429. The spec's 70-at-once figure needs the org's tier from the Console | documented; **key** for the burst |
| 11 | Cache shares | The harness caches on its own ("built-in prompt caching") [V, managed-agents/overview]; whether two sessions of one agent version share a cache is not documented [U] | `cache`: two sessions of one agent with a ~6k-token stable system prompt, one short turn each. Pass: the second session's `cache_read_input_tokens` > 0 on its first turn | **key** |
| 12 | Retention and `inference_geo` | **Sessions are kept until deleted**: "transcripts persist until you delete them"; not eligible for ZDR (self-hosted excepted) or HIPAA; delete removes the session, its events, its container and checkpoints; uploaded files are deleted on their own [V, managed-agents/overview, github, reference]. `inference_geo` sits inside the agent's `model`, accepts `us` or `global`, and is checked against the workspace's allowed geos at save, at create and on every turn; a workspace stores data in `us` only [V, skill bundle `managed-agents-core.md`; SDK 1.12.0 `BetaAllowedInferenceGeo = 'global' \| 'us'`, `workspace_geo: 'us'`] | `geo`: one Haiku 5.5 call reports `usage.inference_geo`, and an agent pinned to `us` is accepted or refused | documented; ADR-0020's 30-day delete sweep is ours to run. **key** for the workspace's own default |
| 13 | Vercel OIDC to Anthropic | WIF accepts "any standards-compliant OIDC issuer"; it needs a service account, a federation issuer and a federation rule **made in the Claude Console** (an organisation admin); the token is exchanged at `POST /v1/oauth/token` and refreshed by the SDK [V, platform.claude.com/docs/en/manage-claude/authentication]. In a Vercel Function the token arrives per request as `x-vercel-oidc-token`, issuer `https://oidc.vercel.com/<team>` [V, vercel.com/docs/oidc/reference via Vercel's documentation search]; SDK 1.12.0 takes `credentials: oidcFederationProvider({ identityTokenProvider, federationRuleId })`, so a per-request token fits [V, SDK types] | A preview of this app that exchanges its OIDC token and lists models. Pass: 200 with no API key set | **blocked**: the Console's service account, issuer (the team's URL) and rule for workspace `studio-eval`, and the rule id on a preview |
| 14 | A ruleset bypass naming one App | Not re-read today: docs.github.com is not reachable from this environment. The spec's 2026-11-16 reading stands: rulesets on private organisation repositories need GitHub Team [V, 2026-11-16]. Whether a single App can be on the bypass list [U] | Manual, in the organisation: a ruleset on `main` with only the fleet App on the bypass list; a push by the session App is refused; one by the fleet App passes | **blocked**: the organisation on GitHub Team, both Apps |
| 15 | Share links through Deployment Protection | The automation bypass (`x-vercel-protection-bypass` header or query, a per-project secret) and a per-URL bypass through `PATCH /aliases/{id}/protection-bypass` (a TTL, revocable) exist; Vercel's own tools make "a temporary shareable link" per deployment [V, Vercel documentation search, 2026-11-22]. The sharable-links page itself (its cookie, lifetime, plan) was not reachable [U] | Manual on `frrata-sites`: a per-deployment link opens a protected preview without a Vercel login; revoking it ends access | **blocked**: `frrata-sites` and one protected preview |

### Also open in spec § Research (no V3a·1 row of their own)
| Item | Today | Status |
|---|---|---|
| Whether a sandbox can expose a port | Not described in the Managed Agents pages read today [U]; spec option A doesn't need it (previews come from the fleet) | no probe; recorded |
| Vercel verifying a host on a zone the team owns without a TXT record | Not checked today (vercel.com is not reachable from here; Vercel's documentation search is the only path) | V2a's spike |
| Vercel Sandbox's bom1 rates | Not checked today | V2a's spike |
| An Indian bank's forex margin on a USD payment | Not an API fact: the first two Anthropic invoices against the bank's debits (spec § 8) | after the first invoice |

## Blocked: what the owner must set up, item by item
Nothing here was created by this lane (no accounts, teams, Apps, webhooks or production rows).
| Unblocks | The owner sets up | Then the spike runs |
|---|---|---|
| Every probe | `STUDIO_EVAL_ANTHROPIC_KEY` as an environment variable on `frata-studio-eval`, holding the `studio-eval` workspace's key (monthly spend limit set), then a new session on that environment | `run models geo`, then the six key-only probes |
| 2, 3 (private), 4, 14, and Starter 0 on Kesar (1) | The GitHub organisation `frrata` on GitHub Team; the **session App** (contents read and write, installed on one repository) and the **fleet App**; a private repository `frrata/spike-fixture` holding `spike.mjs fixture`'s files; a short-lived installation token handed to the session as `SPIKE_GITHUB_TOKEN` | `run mount-sha instructions`; the ruleset test by hand |
| 6 (real key), 9, and Starter 0 on Kesar (1) | Either the owner's yes to mint one 24-hour build key for Kesar on production (`api.frrata.shop`; one `storefront_keys` row and its audit row), or a non-production API host with a demo shop; set as `SPIKE_BUILD_KEY` and `SPIKE_API_HOST` | `run build` (cap $2) |
| 7 (live) | A webhook endpoint in the Console (Manage → Webhooks; there is no API) pointing at a preview with a handler that stores `session.status_idled` deliveries, and its signing secret on that preview | `run custom-tools` with deliveries counted against idles |
| 13 | In the Claude Console: a service account in `studio-eval`, a federation issuer `https://oidc.vercel.com/<team>`, a rule mapping this project's preview tokens to it; the rule id as a Preview variable | a preview route lists models with no key |
| 8, 15 | The Vercel team `frrata-sites` with Deployment Protection, one protected preview, and a Mac and an iPhone with Safari | both by hand, with screenshots |

## What this changes elsewhere (proposed, not yet applied outside this file)
- `frata-integrations` § Anthropic: today's answers dated there, and the rate limits corrected (this branch; listed in
  the report to the orchestrator).
- Spec § 5 and V3a·4: write `allow_package_managers: false` into the policy file, because `true` opens GitHub to the
  sandbox; send `injection_location: {header: true}` explicitly; pin `inference_geo` to `us` in the agent file (the
  workspace's default otherwise decides, and `global` may route anywhere).
- ADR-0020 point 3: "Sessions are deleted at Anthropic 30 days after they end" stays our own sweep. Anthropic keeps
  them until deleted, so a failed sweep keeps transcripts indefinitely; Admin › Agent should show the oldest undeleted
  session.
- V3a·5: since webhook deliveries can drop silently, `/api/cron/studio` every minute is the path that guarantees
  progress, not only a net.
