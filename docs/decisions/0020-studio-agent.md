# ADR-0020: Studio's agent runs on Managed Agents, on Frrata's own Claude account, and touches Frrata only through `asTurn`

Status: **accepted** (owner, 2026-11-16: "approve all" (decision page https://claude.ai/artifact/ChPS16kSEiabXz4J5Q7ALT),
decisions 2, 3, 25 and 27 of the source spec) · Source: `docs/specs/2026-11-16-studio-agent.md` (§ 2, § 3, § 4, § 6.7,
§ 6.10) · Plan: `docs/plans/2026-11-12-studio-build.md` (V0·5, V3a) · Drafted as ADR-0019; renumbered because ADR-0019 is
"One address" · Pairs with: ADR-0014 (rule 4, amendments 8 and 9), ADR-0015 (amended § 5), ADR-0016 (amended § 2),
ADR-0018 (the build-key amendment), ADR-0003, ADR-0008

## Context
- The owner, 2026-11-16: "revise the studio plan to keep it fully agentic and use our own claude api as planned". Partners
  never deploy anything themselves; Frrata's agent does every step of the one-screen flow through chat, and what changes
  a live store is a person's tap.
- ADR-0014 rule 4: the agent works in a sandbox on a draft branch; a person publishes. The agent loop must run outside
  the sandbox, code inside it, and anything that touches Frrata on Frrata's server.
- A Builder's role is read-only and executes no definer (ADR-0015 § As built), so a Builder's turn could write nothing
  through the existing Actor makers; and a partner id matched only in code is one forgotten `where` from a leak
  (`src/lib/db/actor.ts` carries `app.tenant_id` and `app.member_role`, not the partner).

## Decision
1. **The runtime is Anthropic Managed Agents with Anthropic's sandbox** (beta `managed-agents-2026-04-01`): Anthropic
   runs the agent loop and a container per session where code runs; Frrata's server runs every custom tool. Networking
   is `limited` to the signed policy's hosts; the store's build key sits in the session's vault as a header credential
   for `api.frrata.shop` only, so neither the model nor the sandbox ever holds a key; the repository is mounted at an
   exact commit; web search and web fetch are off. Each turn's session budget, a hard USD cap checked before every model
   request, is the credit reserve (the spec's § 6.7 formula keeps the request that crosses it inside the ceiling).
2. **One runtime adapter** (`runtime.ts` under `src/lib/studio/`, to be built in V3a·4) is the only door to the runtime:
   start, send, interrupt, stop, budget, usage. The Claude Agent SDK on Vercel Sandbox (or on Frrata's own container
   host) stays drawn as a second implementation behind it and is not built until a switch signal (point 7). The client
   is made with a 30-second timeout and 1 retry for control calls and 15 seconds for the event fetch after a webhook.
3. **Frrata's own Claude account.** One Anthropic Console organisation in the company's name, billed to the company,
   with workspaces `studio` (partners' sessions) and `studio-eval` (the proof and model upgrades). The app reaches
   Anthropic through Vercel's OIDC token if the spike proves it, else one Production-only API key through `secret()`;
   no key in a sandbox, a repository or a browser. **Never a partner's Claude sign-in** (the Agent SDK's terms):
   every model call is Frrata's, billed to Frrata and then to the partner as credits. The agent is "Frrata agent",
   "Powered by Claude" beneath, never "Claude Code" or anything that looks like it. The model id is pinned per agent
   version; a new model passes the 20-task suite before 5% of sessions, then all. Sessions are deleted at Anthropic 30
   days after they end.
4. **`asTurn(turn, cap, work)` is the one chokepoint for a tool call**, the second sanctioned Actor maker beside
   `require-capability.ts` (pinned in `check:capabilities`, listed in `check:actions` beside `asMember`):
   - the turn id is never taken from a webhook or a tool's input: it is Frrata's own open-turn row for the session that
     `app_studio_session_for(runtime id)` names. One open turn per session (a unique partial index); a tool call is
     accepted only after that turn's `user.message` event and before it closes, and its tenant must equal the session's;
   - the person is checked in **its own short transaction, which then closes**: `app_turn_actor` re-checks the
     membership, the partner's link, the assignment and the partner's passkey step-up, and returns tenant, partner and
     role or nothing. Read tools then run outside any transaction through `withActor`, as `frata_builder` whatever the
     role; a write takes its `*In(tx)` form inside its own `withTenant`. A cached loader never runs inside a
     transaction (it would deadlock the pool);
   - every id in a tool's input is matched with `where tenant_id = turn.tenant`.
5. **A third Postgres setting, `app.partner_id`,** beside `app.tenant_id` and `app.member_role`, set only by
   `requireMember`/`requireCapability` from `app_access_for` and carried in the Actor. Every `studio_*` table has a
   restrictive policy `tenant_id = app_current_tenant() and partner_id = <the setting>` and composite foreign keys
   `(tenant_id, partner_id, session_id) → studio_sessions`, so the brand's own staff or a later partner never read a
   session. Studio's rows and the credit ledger are written by `frata_app` definers keyed on the turn: each checks
   `turn.tenant_id = app_current_tenant()`, that the turn is open and that `app_turn_actor` is live; settle caps at the
   reserve; EXECUTE is revoked from public, anon, authenticated, service_role, frata_builder and frata_admin.
6. **Nothing the agent writes reaches a store without a person's tap.** Content, brand words, tokens and logos are rows
   in `studio_proposals`, each drawn with its exact value and Apply; Apply runs the console's own save as that person.
   No tool publishes, hands over, opens the store, touches a domain or a key, changes a price, stock, product or order,
   or reads orders, shoppers, costs or members. Merchant content and repository files reach the model only as data.
7. **Switch to the Agent SDK path when** median change-to-preview stays above 120 s for two weeks of real partner use;
   or Managed Agents leaves beta on terms Frrata can't accept; or its list cost per site exceeds the Agent SDK path's by
   more than a third in the proof.

## Gate (to be written, Studio plan V3a·10)
**`check:studio`**: tool executors import only the allowed save and query modules and run through `asTurn`, never
`db()`; no cached loader or read tool inside a transaction; every id in a tool's input matched with
`where tenant_id = turn.tenant`; the agent file pins a model id, has web tools off and its hosts equal to the policy.
Run against this record too (CLAUDE.md: a gate must not match its own documentation).

## Consequences
- The loop is outside the sandbox by construction, keys never enter it, a hard budget holds before every model call,
  Frrata hosts nothing long-running, and a lost container loses nothing (the repository is the truth).
- A code change is seen after a fleet build (about 1–2 minutes), not instantly; tokens and words show within a couple of
  seconds as data. The redraw the owner approved on 2026-11-16 shows this.
- The runtime is a beta API; site code, the public catalogue, drafts and brand words are processed outside India. No
  shopper data and no cost ever reaches the agent (ADR-0003, ADR-0015).
- The partner becomes a lock in the database, not only in code; `asTurn` is a second Actor maker the capability gate must
  know.
- Each unconfirmed runtime fact (instruction files loaded from a repository, a GitHub App token as the repository token,
  a webhook per tool call, DNS under `limited`, retention and region) is a V3a·1 spike item, dated in
  `frata-integrations` § Anthropic when answered.

## Owner decisions
The source spec's § Owner decisions 2, 3, 4, 5, 13, 15, 17, 25 and 27 (all yes, 2026-11-16).
