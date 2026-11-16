# frata-integrations — Anthropic (Studio's agent)

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its
checked date, its source and a tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`.
Decision record: `docs/decisions/0020-studio-agent.md`; design: `docs/specs/2026-11-16-studio-agent.md` § 2–9.

## Contents

- Account and terms
- Models, prices and caching
- Managed Agents
- Vercel Sandbox (the second runtime)
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
  to the credential's allowed hosts. Hence the build key in a header (ADR-0018's build-key amendment) [V].
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

## Not yet confirmed (the V3a·1 spike answers each, dated here)

No current source found, 2026-11-16 [U]: whether Managed Agents loads a repository's `CLAUDE.md`, `AGENTS.md`,
`.mcp.json` or hooks as instructions; whether `github_repository` takes a GitHub App installation token where the docs say
"Personal Access Token"; whether each custom tool call raises a webhook; DNS under `limited` networking; session
retention and `inference_geo` for Frrata's organisation; whether a sandbox can expose a port; Workload Identity
Federation from Vercel's OIDC token; an Indian bank's forex margin on a USD payment.
