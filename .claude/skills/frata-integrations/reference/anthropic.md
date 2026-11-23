# frata-integrations — Anthropic (Studio's agent)

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its
checked date, its source and a tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`.
Decision record: `docs/decisions/0020-studio-agent.md`; design: `docs/specs/2026-11-16-studio-agent.md` § 2–9.

## Contents

- Account and terms
- Models, prices and caching
- Managed Agents
- Vercel Sandbox (the second runtime)
- Answered from documentation (2026-11-22)
- Measured on `studio-eval` (2026-11-22)
- As built in V3a (2026-11-23)
- Not yet confirmed (the V3a·1 spike)

## Account and terms — checked 2026-11-16

- One Anthropic Console organisation in the company's name (the Pvt Ltd, rule 5), billed to the company; workspaces
  `studio` and `studio-eval`, so caches, budgets and rate limits are apart. The Managed Agents webhook endpoint is
  registered in the Console only (no API for it) [V, claude-api skill bundle `shared/managed-agents-*.md`].
- "Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products,
  including agents built on the Claude Agent SDK". A product may say "Claude Agent" or "{Name} Powered by Claude";
  never "Claude Code" or look-alike art; the Commercial Terms govern [V, code.claude.com Agent SDK overview, undated page,
  read 2026-11-16]. So: never a partner's Claude sign-in; the agent is "Frrata agent", "Powered by Claude" beneath.

## Models, prices and caching — checked 2026-11-16 (claude-api skill, models table cached 2026-11-03; `shared/prompt-caching.md`)

- Per million tokens: Opus 5.5 $4 in, $20 out, cache read $0.20; Sonnet 5.5 $2 / $10, read $0.10; Haiku 5.5 $0.10 / $0.50
  (prompts ≤ 100K). Cache writes 1.25× for 5 minutes ($5 on Opus 5.5) or 2× for 1 hour ($8). Minimum cached prefix 512
  tokens [V].
- Opus 5.5's effort defaults to `medium`; thinking is always on. Caches are per model, so one model per session [V].
- The TypeScript SDK's default timeout is 10 minutes with 2 retries: Frrata's client sets 30 s and 1 retry for control
  calls, 15 s for the event fetch [V].
- The rupee: ₹93.93 to the dollar, used as ₹94 [S, x-rates.com, 2026-11-16 08:51 UTC].

## Managed Agents — checked 2026-11-16 (claude-api skill bundle `shared/managed-agents-*.md`; beta `managed-agents-2026-04-01`)

- Anthropic runs the agent loop; a container per session runs the code [V].
- `limited` networking with `allowed_hosts` [V].
- Vault credentials are substituted at egress in headers and body (`injection_location`), **never the URL path**, and only
  to the credential's allowed hosts (headers and the URL measured 2026-11-22, see below; body documented only). Hence the build key in a header (ADR-0018's build-key amendment) [V].
- A mounted GitHub repository's token never enters the container; the mount takes a branch or a commit; the repository's
  `.claude/skills` load into the session [V].
- Custom tools are run by our server. Session budgets are hard USD caps checked before each model request [V].
- List cost counts tokens, web search at $10 per 1,000, and **session running time at $0.08 an hour of active time** [V].
- Webhooks are HMAC-signed (Standard Webhooks) and thin (fetch the event after) [V].

## Vercel Sandbox (the second runtime) — checked 2026-11-16

- The Agent SDK spawns a `claude` CLI subprocess that owns the shell and files: its built-in tools run where the
  subprocess runs; 1 GiB RAM, 5 GiB disk, 1 CPU per agent to start; no session timeout of its own [V, code.claude.com
  Agent SDK hosting, undated page, read 2026-11-16].
- Pro: active CPU $0.128 an hour, memory $0.0212 a GB-hour (iad1; other regions differ), 24 h sessions, 10,000 at once;
  network policy by domain; open ports [V, vercel.com/docs/sandbox/pricing, last updated 2026-09-10]. bom1's rates [U].

## Answered from documentation — checked 2026-11-22 (spike report `docs/research/2026-11-22-studio-agent-spike.md`)

- Rate limits per organisation: create endpoints 300 a minute, read endpoints (retrieve, list, stream) 1,200 a minute;
  organisation spend and usage-tier limits also apply; no documented cap on concurrent sessions [V,
  platform.claude.com/docs/en/managed-agents/reference]. (The cached skill bundle's "600 other, environments 60 and 5 at
  once" is older: the live page wins.)
- Sessions are kept until deleted ("transcripts persist until you delete them"); not ZDR-eligible (self-hosted excepted)
  and not HIPAA. Deleting a session removes its events, container and checkpoints; uploaded files are deleted apart. So
  the 30-day delete is Frrata's own sweep [V, managed-agents/overview, github].
- `inference_geo` lives inside the agent's `model`: `us` or `global` only; a workspace stores data in `us` only; no India
  [V, SDK 1.12.0 types `BetaAllowedInferenceGeo`, `workspace_geo`; skill bundle `managed-agents-core.md`].
- Mount by commit: `checkout: {type: "commit", sha}`. The token field is "the GitHub token used to clone … and to push";
  the page recommends fine-grained personal access tokens and does not mention App installation tokens; tokens rotate on
  a running session [V, managed-agents/github].
- `limited`: a refused request on 80/443 gets a 403 naming the host; attached repositories stay reachable with no hosts
  listed; **`allow_package_managers: true` also opens `github.com`, `api.github.com`, `raw.githubusercontent.com`**, npm,
  PyPI and Docker hosts, so Studio's policy keeps it `false` [V, managed-agents/environments].
- Vault `environment_variable` credentials: made through the API with `injection_location` left out, header **and** body
  are on (Console-made ones are header-only); send `{header: true}` [V, skill bundle `managed-agents-tools.md`].
- No webhook per tool call: `session.status_idled` fires on each move to idle (a custom tool waiting included);
  deliveries are unordered, retried up to 3 times and then dropped silently [V, skill bundle `managed-agents-webhooks.md`].
- Sandbox: Ubuntu 24.04, x86_64, up to 8 GB memory and 10 GB disk, Node 22 by default [V, managed-agents/cloud-sandboxes-reference].
- WIF takes any standards-compliant OIDC issuer; service account, issuer and rule are made in the Console; the SDK takes
  a per-request token through `oidcFederationProvider({ identityTokenProvider, federationRuleId })`, which fits Vercel's
  per-request `x-vercel-oidc-token` [V, manage-claude/authentication; SDK 1.12.0 types; vercel.com/docs/oidc/reference].
- Branding: "{Name} Powered by Claude" allowed; never "Claude Code" or look-alike art [V, managed-agents/reference].

## Measured on `studio-eval` — 2026-11-22 (spike probes in `scripts/studio/spike.mjs`; results and evidence in `docs/research/2026-11-22-studio-agent-spike.md`)

Each is our own measurement on the live API [V, probe named], on Opus 5.5 at effort `low` with one-command turns. The
plumbing carries over to any model; the timings and cents are not prices (credits use spec § 7's model on real tasks).
Probes now run on Haiku 5.5 (owner, 2026-11-22).
- The workspace's default inference geo is **`global`** (a Haiku call with no geo was served there); an agent pinned to
  `us` is accepted. So the agent file pins `us` [`geo`].
- A session: create about 0.9 s, first stream event about 0.5 s after the message, a one-command turn 3–5 s. The sandbox
  is a small VM: 4 vCPUs, 16 GB, 30 GB free on `/`, no cgroup limits inside, runs as root (the documentation's 8 GB and
  10 GB read as a floor) [`session`, `limits`].
- `limited`: **DNS is filtered.** A name not on the list doesn't resolve, even by a raw query to 8.8.8.8 (NXDOMAIN), so
  a refused name fails as "could not resolve host", not as a 403. By address, Anthropic's transparent egress gateway
  answers `403`, `x-deny-reason: host_not_allowed`, "Host not in allowlist: <host>". It routes by name, not address: a
  refused name pinned to its real address gets 403. No proxy variables in the sandbox; TCP 22 refused [`network`,
  `network-ip`].
- Vault header credential: the sandbox holds a longer placeholder, the host receives the real value in a header, a URL
  query carries the placeholder unsubstituted, and an echoing host hands the real value back into the sandbox. The
  harness tells the model to use credential variables only for their intended purpose: it refused to send one to an echo
  host until that was stated as the credential's purpose [`vault`].
- Custom tools: each round of calls idles the session once (`requires_action`) when every pending result goes back in one
  send. Answering parallel calls one by one adds an idle per partial answer. Every turn ends with one more idle (`end_turn`)
  [`custom-tools`, `custom-tools-batched`].
- The prompt cache is shared across sessions of one agent version: a second session read all 14,680 cached tokens on its
  first turn. The harness writes **5-minute** entries only [`cache`].
- 70 sessions created in one burst in 0.6 s, and 20 parallel command turns: no 429 [`concurrency-70`,
  `concurrency-active`].
- Mount by commit works with no hosts allowed: HEAD is detached at the SHA, and the remote URL holds no credential
  [`mount-sha`, public repository].
- `usage.list_cost` equals the tokens at list rates plus running time, **in whole cents** (a $0.044 turn reads $0.04)
  [`session`].

## As built in V3a — 2026-11-23 (`src/lib/studio/runtime-managed.ts`, `docs/plans/2026-11-22-v3a-runtime.md`; checked against the SDK 1.12.0 types and the fake server, not yet the live API)
- **Budgets are set at create and only raised.** A session is always created with `budget.max_list_cost` (cents, a
  string); a session without one can never get one. Each turn's Send raises it first: spent + the turn's ceiling −
  max(largest request, the model's floor), strictly above what is spent, or the session restarts (`budgetFor`).
- **At the cap the session pauses** (`session.status_idle` with `stop_reason: budget_reached`) and takes only settle
  events (tool results, interrupt). Raising the budget resumes the old work, so the next Send raises, then sends
  `user.interrupt`, then the message.
- **One `requires_action` idle per round:** every pending custom tool call is answered in one send (each answer alone
  raises another idle).
- **Events are listed in processing order, filtered by `created_at[gte]`.** A queued message is listed before it is
  processed (no `processed_at`): the cursor is a `created_at` and never passes an unprocessed event (`events.ts`).
- **The SDK sends `Authorization: Bearer <key>`** (with `authToken: null` set explicitly so no environment variable is
  read), `anthropic-version` 2026-10-21; the beta header on every Managed Agents call.
- **Vault credentials:** `environment_variable` with `injection_location: { header: true }` and networking limited to
  exactly `api.frrata.shop`; never `body`.
- **Haiku 5.5 above 100K prompt tokens** is priced at the higher rate ($0.50 in, $2.50 out; cache read 0.1×, a 1-hour
  write 2×): Studio's caps use it (`src/domains/studio/spend.ts`), since a page turn's prompt crosses 100K.

## Not yet confirmed (the V3a·1 spike: blocked on owner set-up, see the report § Blocked)

No current source, 2026-11-22 [U]: whether `CLAUDE.md`, `AGENTS.md`, `.mcp.json` or hooks load as instructions (only
`.claude/skills` is documented); whether a GitHub App installation token works as the repository token; whether a
sandbox can expose a port; an Indian bank's forex margin on a USD payment.
