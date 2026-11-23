# Studio agent spike (V3a·1): what Managed Agents does, measured or read, item by item
Status: **probes done; blocked items wait on the owner** (2026-11-22). Lane D, branch `claude/lane-d-agent-spike`.
Plan: `docs/plans/2026-11-12-studio-build.md`
§ V3a (V3a·1) · Spec: `docs/specs/2026-11-16-studio-agent.md` § 9 · Decision: ADR-0020 · Script:
`scripts/studio/spike.mjs` (results: `docs/research/2026-11-22-studio-agent-spike.results.json`).

## In short (for the owner, 2026-11-22)
**Which model ran (read this before any figure).** The probes of 19:32–19:40 UTC ran on **Opus 5.5** at effort `low`.
The owner's instruction to test on Haiku ("just use haiku model for now for the agent for testing", relayed by the
orchestrator) reached this lane only after them. The script now runs every probe on one constant, `claude-haiku-5-5`,
and no run since has used a larger model. Plumbing answers carry over to any model: what loads, network policy, vault
headers, idles and webhooks, rate limits, mounts, retention. **Speed, cost and cache figures here price nothing.** They
come from one-command turns at effort `low`, and credits and the 20-task proof use spec § 7's model at `medium` on real
tasks.

**Measured on the `studio-eval` workspace:** 18 probe runs, **$0.45** of list cost of the $25 cap, nothing failed.
Every session and throwaway vault the probes made is deleted (the workspace lists 0 of each). Four agents and two
environments are kept for re-runs, their ids in the results file. The key was never printed, logged or committed.

### Each V3a·1 item
| # | Item | Verdict | Evidence (§ Measured beside documented) |
|---|---|---|---|
| 1 | A session on Starter 0 for Kesar | **passed** for a session; Starter 0 on Kesar **blocked** | `session`: create 0.9 s, first event 0.5 s, a one-command turn 3–5 s; a 4-vCPU, 16 GB VM running as root (`limits`). Starter 0 needs items 2, 6 and 9 |
| 2 | The session App's token as the repository token | **blocked** | No GitHub organisation or App yet |
| 3 | Mount by commit SHA | **passed** | `mount-sha`: a public repository at a non-head commit, no hosts allowed: HEAD detached at the SHA, no credential in the remote |
| 4 | `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, hooks as instructions | **blocked** | Needs the fixture repository in Frrata's organisation (or the owner's yes to a public one) |
| 5 | `limited` hosts and DNS | **passed**, one difference | `network`, `network-ip`: names off the list don't resolve (NXDOMAIN even straight from 8.8.8.8); by address the gateway answers 403 `host_not_allowed`; no bypass by IP, pinned address, direct DNS or port 22 |
| 6 | The build key in a vault header | mechanism **passed**; the real key **blocked** | `vault`: placeholder in the sandbox, real value in the header at egress, URL query not substituted, an echo hands the value back |
| 7 | A webhook per custom tool call? | **passed** (no: one per round) ; the live webhook **blocked** | `custom-tools(-batched)`: 4 calls in 3 rounds raise 3 `requires_action` idles plus 1 `end_turn`, when each round's results go back in one send |
| 8 | The share link's cookie in Safari | **blocked** | Needs `frrata-sites`, a protected preview, a real Safari |
| 9 | `next build` time and memory | **blocked** | Needs a build key and an API host; the machine's size is measured (item 1) |
| 10 | Concurrency and rate limits | **passed** | 70 sessions in one burst (0.6 s), 20 parallel command turns (p90 3.7 s), no 429 |
| 11 | Cache shares | **passed** | `cache`: a second session read all 14,680 tokens the first wrote; 5-minute entries only |
| 12 | Retention and `inference_geo` | **passed** | `geo`: the workspace default is **`global`**; a `us` pin is accepted. A deleted session and its events return 404 at once; undeleted ones stay (documentation) |
| 13 | Vercel OIDC to Anthropic | **blocked** | Needs the Console's service account, issuer and rule |
| 14 | A ruleset bypass naming one App | **blocked** | Needs the organisation on GitHub Team and both Apps |
| 15 | Share links through Deployment Protection | **blocked** | Needs `frrata-sites` and a protected preview |

### What the findings change in the Studio plan (proposed; spec § 5, § 7, § 8 and V3a·4/5 to take them)
- **Policy: `allow_package_managers: false`** (documented: `true` opens `github.com`, `api.github.com`,
  `raw.githubusercontent.com`). Measured consequence: under `false` the npm registry doesn't resolve either. So a
  sandbox that must run `npm ci` lists `registry.npmjs.org` by exact name in `allowed_hosts`, never the toggle.
- **Vault credentials header-only:** send `injection_location: {header: true}`. Measured: a URL query carries only the
  placeholder, and **an echoing host hands the real key back into the sandbox**. So `api.frrata.shop` must never
  reflect the key header in any body or error (a security-reviewer item for the Storefront API).
- **`/api/cron/studio` every minute is the main path**, the webhook only a nudge: deliveries drop silently after 3 tries
  (documented), and a turn raises (rounds of tool calls + 1) idles. The server answers **every pending call of a round
  in one send**: answering one by one measured an extra idle per partial answer.
- **The 30-day sweep is ours:** Anthropic keeps sessions until we delete them; delete works at once (measured 404).
  Admin › Agent shows the oldest undeleted session.
- **US-only, pinned:** the workspace stores in `us` only, and its measured default inference geo is `global`. The agent
  file pins `model.inference_geo: "us"`; `check:studio` checks the pin.
- **Smaller ones:**
  - A tool error of "could not resolve host" means "not in the policy".
  - The sandbox runs as root with no cgroup limits, so the network policy and the vault are the controls, not users
    inside it.
  - The cache lives 5 minutes, so spec § 8's "cold cache after pauses" line (re-writes at $5/M) is the right model.
  - `list_cost` comes in whole cents: a turn's credits are computed from the cumulative cost's delta, at most 1¢
    (0.15 credit) off.

### What a turn costs, measured (Opus 5.5 at effort `low`, one-command turns: not a credit price)
- `usage.list_cost` equals tokens at list rates plus running time: $4 in, $20 out, $0.20 cache read, $5 5-minute write,
  $0.08 an hour of active time. These are spec § 8's inputs, so its arithmetic stands on the right prices.
- **A one-command turn:**
  - $0.04 cold: a new agent's first session writes the harness's ~7.3k-token prefix.
  - $0.01–0.02 warm.
  - $0.007 each when 20 ran together on a warm cache.
- Running time is negligible: 55 s of active time for 20 turns.
- A real page turn ($1.12 by spec § 8's 25-request assumption) could not be measured. It needs the site repository and
  the build key (items 2, 6, 9), and the 20-task proof measures it after them.

### What the owner must set up (details in § Blocked)
1. **GitHub:** the organisation `frrata` on GitHub Team, the **session App** (contents read and write, installed on one
   repository) and the **fleet App**, and the private repository `frrata/spike-fixture` holding `spike.mjs fixture`'s
   files, with a short-lived installation token for the session as `SPIKE_GITHUB_TOKEN` (items 2, 4, 14, and 1 on
   Kesar).
2. **A build key:** your yes to mint one 24-hour build key for Kesar on production (one `storefront_keys` row and its
   audit row), or a non-production API host with a demo shop; as `SPIKE_BUILD_KEY` and `SPIKE_API_HOST` (items 6 real
   key, 9, and 1 on Kesar).
3. **Claude Console:** a service account in `studio-eval`, a federation issuer `https://oidc.vercel.com/<team>` and a
   rule for this project's preview tokens; the rule id as a Preview variable (item 13). And a **webhook endpoint**
   (Manage → Webhooks) pointing at a preview that stores `session.status_idled` deliveries, its signing secret on that
   preview (item 7 live).
4. **Vercel:** the team `frrata-sites` with Deployment Protection and one protected preview (items 8, 15).
5. **Devices:** a Mac and an iPhone with Safari for the framed-preview test (item 8).

## How to run it
```bash
node scripts/studio/spike.mjs                    # the plan: each probe, what it needs, its cap; no network
node scripts/studio/spike.mjs run models geo     # free and near-free first
node scripts/studio/spike.mjs run session limits network network-ip vault custom-tools custom-tools-batched cache --yes
node scripts/studio/spike.mjs run concurrency concurrency-70 concurrency-active
SPIKE_REPO_URL=https://github.com/octocat/Hello-World SPIKE_REPO_SHA=553c2077f0edc3d5dc5d17262f6aa498e69d6f8e \
  node scripts/studio/spike.mjs run mount-sha             # a public repository at a non-head commit
node scripts/studio/spike.mjs fixture /tmp/spike-fixture   # the canary repository for `instructions`
```
Rules the script keeps:
- **The key:** read from `STUDIO_EVAL_ANTHROPIC_KEY` and passed to the SDK explicitly, with the base URL pinned and no
  auth token. Every string the script writes is scrubbed of each secret it holds.
- **Spend:** every session has a hard session budget equal to its probe's cap. The ledger in the results file sums
  measured list cost, and a run that could pass $25 refuses. A run over $3 needs `--yes`.
- **Cleanup:** a probe deletes its own sessions, throwaway vault and uploaded file when it ends. One agent per shape and
  one environment per network shape are reused, and their ids are recorded.
- **Verified:** with a dummy key the script got `401 authentication_error` and spent nothing. With the real key, 18 runs
  spent $0.45, and the workspace was left with no session and no vault (2026-11-22).

## Results (written by the script)
<!-- spike:results:start -->

Measured spend so far: **$0.45** of the $25 cap (list cost, 19 runs).

| Probe | Ran | Model | Status | Answer | List cost |
|---|---|---|---|---|---|
| `models` | 2026-11-22 19:48 UTC | claude-haiku-5-5 | answered | claude-haiku-5-5 answers on this key (context 1000000, output 128000) | $0.00 |
| `geo` | 2026-11-22 19:32 UTC | claude-haiku-5-5 (the Messages call); claude-opus-5-5 (the agent pin check) | answered | default inference geo served: global; an agent pinned to `us` was accepted; the SDK allows only "global" and "us" (no India) | $0.00 |
| `session` | 2026-11-22 19:33 UTC | claude-opus-5-5 | answered | a session ran a command; create 890 ms, first event 550 ms, turn 5198 ms | $0.04 |
| `network` | 2026-11-22 19:33 UTC | claude-opus-5-5 | answered | see evidence: resolver, proxy variables, what resolves, allowed vs refused codes | $0.02 |
| `network-ip` | 2026-11-22 19:34 UTC | claude-opus-5-5 | answered | see evidence: raw-IP reach, pinned-address reach, direct DNS, non-HTTP port | $0.04 |
| `vault` | 2026-11-22 19:36 UTC | claude-opus-5-5 | answered | value in the sandbox's variable: false; header substituted at egress: true; URL query substituted: false; the sandbox's variable is 61 chars (the real value 38); an echoing host hands the real value back into the sandbox: true | $0.02 |
| `custom-tools` | 2026-11-22 19:37 UTC | claude-opus-5-5 | answered | 4 custom tool calls idled the session 4 times (requires_action), results sent one by one as each call arrived. Each idle raises one session.status_idled webhook (docs) | $0.02 |
| `custom-tools-batched` | 2026-11-22 19:37 UTC | claude-opus-5-5 | answered | 4 custom tool calls idled the session 3 times (requires_action), results sent together per idle. Each idle raises one session.status_idled webhook (docs) | $0.01 |
| `cache` | 2026-11-22 19:38 UTC | claude-opus-5-5 | answered | second session read 14680 cached tokens against the first's 0: cache shared across sessions: true | $0.07 |
| `concurrency` | 2026-11-22 19:38 UTC | claude-opus-5-5 | answered | 10/10 sessions created at once in 502 ms; errors: none | $0.00 |
| `concurrency-70` | 2026-11-22 19:38 UTC | claude-opus-5-5 | answered | 70/70 sessions created at once in 569 ms; errors: none | $0.00 |
| `concurrency-active` | 2026-11-22 19:39 UTC | claude-opus-5-5 | answered | 20/20 turns ran a command at once in 6920 ms wall; turn p50 2688 ms, p90 3737 ms, max 6475 ms; errors: none | $0.14 |
| `mount-sha` | 2026-11-22 19:40 UTC | claude-opus-5-5 | answered | HEAD equals the requested SHA: true; token used: false | $0.02 |
| `limits` | 2026-11-22 19:40 UTC | claude-opus-5-5 | answered | see evidence: cgroup memory, cpu and pid limits, disk, user | $0.01 |
| `fronting` | 2026-11-23 07:05 UTC | claude-haiku-5-5 | answered | pass: the vault value never reached frrata-echo.vercel.app (host header, connect-to, resolve, direct tried) | $0.00 |

<!-- spike:results:end -->

## R8: the fronting probe (2026-11-23, security M1; plan `docs/plans/2026-11-22-v3a-runtime.md` R8)
Run once on the orchestrator's word, after the owner said yes on 2026-11-23: `SPIKE_FRONT_ECHO_HOST=frrata-echo.vercel.app
node scripts/studio/spike.mjs run fronting`. Haiku 5.5, one session (`sesn_01N1HaNNsYPAHpNLZ2syxr8c`) with a $0.25
budget. The session ran on an environment that allows only `api.frrata.shop` (`env_01Ps1sBcVbbRtJ9ri71GkkXo`; no package
managers, no MCP servers). It had one throwaway vault holding `FRRATA_KEY`, a random 38-character value scoped to
`api.frrata.shop` and sent as a header. The echo (`/headers`, Frrata-owned) answers with the headers it received, and the
sandbox reduced its reply to a length and a SHA-256 before printing anything.

**Verdict: pass.** The echo never received the value. The throwaway value's own hash appears in none of the four lines.

| Way | What the sandbox printed | Reading |
|---|---|---|
| `Host:` header (TLS to `api.frrata.shop`, `Host: frrata-echo.vercel.app`) | `0 e3b0c442…b855` (the empty string's hash) | curl got a reply, but it held no `frrata-key`: the echo did not receive the value. Whether the echo saw the request at all is not known, because only a hash was kept |
| `--connect-to api.frrata.shop:443:frrata-echo.vercel.app:443` | `0 e3b0c442…b855` | the same: a reply without the value |
| `--resolve api.frrata.shop:443:<echo's address>` | `echo resolves: no`, so no request was sent | **Not exercised.** `limited` filters DNS, so the sandbox cannot learn the echo's address, and the probe sent nothing this way |
| direct to `frrata-echo.vercel.app` | `0 e3b0c442…b855`, `Could not resolve host` | refused at DNS, as `network` measured |

Cost: `usage.list_cost` read **$0.00** (it counts whole cents). Tokens at Haiku's list rates plus 6.3 s of active time come
to about **$0.002**. The session and the vault were deleted when the probe ended. The agent `agent_01KfCxQ8YWvy4HgVMUfW33bS`
(Haiku 5.5, made by this run) and the environment `env-api` are kept for re-runs, as the script keeps all of them.

**Still open:** `--resolve` to an address. The address has to come from outside the sandbox, since the sandbox cannot
resolve the echo. `network-ip` measured that the gateway routes by name: a refused name pinned to its real address gets a
403. So the gateway would most likely send an allowed name pinned to the echo's address to `api.frrata.shop` itself, but
no probe has measured that. Closing this takes a second run that passes the echo's address in, which needs the
orchestrator's word. The fact that the first two ways got a reply without the value also leaves one thing open: we don't
know what answered (the gateway, Vercel's edge or `api.frrata.shop`), only that the echo never got the value.

## Measured beside documented (2026-11-22, workspace `studio-eval`; Opus 5.5 at effort `low` unless a row says otherwise)
Each probe's measured answer, set against what the documentation said. "Same" means the measurement confirms it;
"differs" says how.

| Probe (item) | Documentation said | Measured | Verdict |
|---|---|---|---|
| `models` (the key) | — | The `studio-eval` key answers; `claude-opus-5-5` reports a 1,000,000-token context and 128,000 output. $0.00 | **passed** |
| `geo` (12) | `inference_geo` is `us` or `global`; the workspace's default decides when the agent doesn't pin one | One Haiku 5.5 call with no geo was served in **`global`**: the workspace default is `global`, not `us`. An agent pinned to `us` was accepted. $0.0000035 | **passed**; same, and it settles that the agent file must pin `us` (otherwise inference may run anywhere) |
| `session` (1, 9 in part) | Ubuntu 24.04, x86_64, up to 8 GB memory and 10 GB disk, Node 22 default; CPU count not stated | A session on a closed `limited` environment ran one bash command. Create 890 ms, first stream event 550 ms after the message, whole turn 5.2 s, 4.9 s active. Ubuntu 24.04.5, x86_64, Node v22.23.5, **4 CPUs** (`nproc`), `free` shows **16 GB**, `df` shows 30 GB free on `/`. 6 input + 297 output tokens, 7,017 read from cache and 7,347 written on the session's **first** turn (the harness's own prompt). **$0.04** list cost (the API's own `list_cost`) | **passed**. Differs: memory and disk read higher than the documented limits, but `free` and `df` may show the host, not the sandbox's cap, so plan on 8 GB and 10 GB until `build` measures a real peak. **`limits` follow-up:** no cgroup limit exists inside the sandbox (`memory.max`, `cpu.max`, `pids.max` absent). It is a whole small VM: 4 vCPUs, 16 GB, a 252 GB ext4 root with 30 GB free (`/workspace` and `/tmp` on the same disk), running as **root**, 20,000 open files. $0.01. So the 8 GB / 10 GB reads as a floor or is out of date; a real build peak still waits on `build` |
| `mount-sha` (3) | `checkout: {type: "commit", sha}` is supported; the repository is cloned at session start | Public `octocat/Hello-World` mounted at its **first commit** (`553c207…`, not the branch head) on an environment with **no hosts allowed**. `git rev-parse HEAD` equals the SHA, `status` says `HEAD (no branch)`, and the remote URL holds no credential. No token. $0.02 | **passed**; same. A private repository with the session App's token (item 2) is still blocked |
| `network` + `network-ip` (5) | Under `limited` only `allowed_hosts` are reachable; a refused request on 80/443 gets a 403 naming the host; DNS not described | Environment allowing only `postman-echo.com`. **DNS is filtered:** `/etc/resolv.conf` names 8.8.8.8 and 8.8.4.4, but only allowed names resolve. `example.com` and `registry.npmjs.org` return nothing, and a raw UDP query straight to 8.8.8.8 gets NXDOMAIN (rcode 3). So a refused *name* fails as `curl: (6) Could not resolve host`, not as a 403. **By address**, traffic reaches Anthropic's egress gateway (TLS certificate `CN=default.domain`, issuer `Anthropic, Egress Gateway SDS Issuing CA (production)`). It answers `https://1.1.1.1` and `http://1.1.1.1` with `403`, `x-deny-reason: host_not_allowed`, "Host not in allowlist: 1.1.1.1". A refused name pinned to its real address (`--resolve`) gets 403. An allowed name pinned to a foreign address still gets 200 from the real host: the gateway routes by name, not by address. TCP 22 to GitHub: connection refused. No `HTTP(S)_PROXY` variables in the sandbox (the gateway is transparent). Allowed host: 200. $0.02 + $0.04 | **passed**. Differs: a refused name is a DNS failure, not a 403. Studio's tool errors must read "could not resolve host" as "host not in the policy". No bypass by IP, by pinned address or by direct DNS was found; whether the filtered resolver forwards refused names upstream (a DNS side channel) can't be seen from inside |
| `vault` (6, mechanism) | An `environment_variable` credential shows the sandbox an opaque placeholder and is substituted at egress in headers and/or body, only to its own hosts, never in the URL; a host that echoes headers hands the value back | A throwaway 38-character random value in a vault created through the API with `injection_location: {header: true}`, allowed to `postman-echo.com` only. **In the sandbox** the variable is a 61-character placeholder whose SHA-256 differs from the value's. **In a header**, the host received the real value (38 characters, matching hash): substituted at egress. **In a URL query**, the host received the placeholder unchanged (61 characters, the sandbox's hash): not substituted. The echoed header hands the **real value back into the sandbox**. **The agent refused twice before it ran this.** First it ran only the local check: sending a credential to a public echo service "would leak it". Then it said the session's setup tells it to treat credential variables as real secrets and use them only for their intended purpose. It ran once the credential's name and the message stated this check as its purpose, with the command printing only lengths and hashes. Three runs, $0.02 each | **passed**; same as documented. New: the harness steers the model away from sending a vault credential anywhere but its purpose. So `api.frrata.shop` must never reflect the key header in a body or an error, or the key enters the sandbox |
| `custom-tools` + `custom-tools-batched` (7) | No webhook per tool call; `session.status_idled` fires on every move to idle, including "awaiting custom tool result" | Four custom calls: n=1, then n=2, then n=3 and n=4 in one response. **Answered one by one as each call streamed in: 4 `requires_action` idles.** The parallel pair idled once, and once more after its first result while the second was still pending. **Answered all pending calls in one send at each idle: 3 idles**, one per round of calls. Every turn also ends with an `end_turn` idle. A call reached the stream 0.2–0.5 s after the one before it; a whole four-call turn took 5–6 s. $0.02 + $0.01 | **passed**; same as documented. A turn raises (rounds of tool calls + 1) idles, so (rounds + 1) `session.status_idled` webhooks, not one per call. Studio's server must answer every pending call of a round in **one** send, or it raises extra idles |
| `cache` (11) | The harness caches on its own; whether two sessions of one agent version share a cache not documented | Two sessions of one agent with a ~14.7k-token system prompt, one short turn each. Session 1 wrote 14,680 tokens to cache (**5-minute** entries; no 1-hour writes) and read 0. Session 2, on its **first** turn, read all 14,680 from cache and wrote none. $0.07 + under $0.01 | **passed**: the cache is shared across sessions of one agent version (inside 5 minutes). One sprint session's cache warms the next, but only if it starts within the 5-minute life |
| `concurrency` + `concurrency-70` + `concurrency-active` (10) | 300 creates and 1,200 reads a minute per organisation; no documented cap on concurrent sessions | **10 sessions** created in one burst in 502 ms. **70 sessions** (decision 29's cap) in one burst in 569 ms. No 429 in either, $0.00 (no model call; 0.8 s of active time billed for the ten). **20 sessions each ran one bash turn at the same moment:** 20/20 succeeded, 6.9 s wall, first event 450–572 ms in every one, turn p50 2.7 s, p90 3.7 s, max 6.5 s; 55 s of active time in all. No 429. $0.14 | **passed**; consistent with the documentation. 70 at once is within the create limit and doesn't queue; 20 parallel model turns show no throttling on this workspace's tier. Not measured: 70 *active* turns at once (that would draw the organisation's token rate limit, whose tier the Console shows) |

## Item by item
The Status column below is the documentation pass's (before any probe); each item's measured verdict is in § In short.
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
| ~~Every probe~~ | Done 2026-11-22: `STUDIO_EVAL_ANTHROPIC_KEY` on `frata-studio-eval` | ran: see § In short |
| 2, 3 (private), 4, 14, and Starter 0 on Kesar (1) | The GitHub organisation `frrata` on GitHub Team; the **session App** (contents read and write, installed on one repository) and the **fleet App**; a private repository `frrata/spike-fixture` holding `spike.mjs fixture`'s files; a short-lived installation token handed to the session as `SPIKE_GITHUB_TOKEN` | `run mount-sha instructions`; the ruleset test by hand |
| 6 (real key), 9, and Starter 0 on Kesar (1) | Either the owner's yes to mint one 24-hour build key for Kesar on production (`api.frrata.shop`; one `storefront_keys` row and its audit row), or a non-production API host with a demo shop; set as `SPIKE_BUILD_KEY` and `SPIKE_API_HOST` | `run build` (cap $2) |
| 7 (live) | A webhook endpoint in the Console (Manage → Webhooks; there is no API) pointing at a preview with a handler that stores `session.status_idled` deliveries, and its signing secret on that preview | `run custom-tools` with deliveries counted against idles |
| 13 | In the Claude Console: a service account in `studio-eval`, a federation issuer `https://oidc.vercel.com/<team>`, a rule mapping this project's preview tokens to it; the rule id as a Preview variable | a preview route lists models with no key |
| 8, 15 | The Vercel team `frrata-sites` with Deployment Protection, one protected preview, and a Mac and an iPhone with Safari | both by hand, with screenshots |

## What this changes elsewhere
- `frata-integrations` › `reference/anthropic.md`: a new section "Measured on `studio-eval`" with each fact above,
  dated and tagged by probe; "Not yet confirmed" cut down to what's still blocked (this branch).
- Proposed, not applied (owner and plan): the six plan changes in § In short. Spec § 5 and V3a·4 get the policy file
  (`allow_package_managers: false`, `registry.npmjs.org` by name if the sandbox installs) and `{header: true}`. The agent
  file gets the `us` pin. V3a·5 takes the cron as the main path with one send per round. ADR-0020 point 3 stays our own
  sweep. The Storefront API gets the rule that the key header is never reflected.
