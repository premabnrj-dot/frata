# Parallel lanes: who builds what at once, and how it reaches main
Status: active (owner, 2026-11-15: "any chance some of them could be taken parallelly in another sessions and you
coordinate/orchestrate them"; "content mockup approved. builders approved. all others approved. but when you're
working do share one final mockup for each for me to review") · Orchestrator: session `session_01SDQQsALbVP4rESeVnyh8NG`
(branch `claude/amazing-wright-7irwn3`)

## Lanes now
| Lane | Phase | Spec and decisions | Worker branch |
|---|---|---|---|
| **A** | V1 · Storefront API SA0 (storefront keys, the third tenant source) then SA1 (catalogue reads) | `docs/specs/2026-11-11-storefront-api.md`; ADR-0018 accepted; ADR-0014 | `claude/lane-a-storefront-api` |
| **B** | V1 · Content layer: the read seam, content tables, Console › Content, the move out of the look | `docs/specs/2026-11-14-site-content-layer.md` (mockup approved 2026-11-15) | `claude/lane-b-content` |
| **C** | T1c · Builders: capabilities, the Builder role that never sees orders, shoppers or costs | ADR-0015 accepted; `docs/specs/2026-11-12-studio-intake-and-team.md` | `claude/lane-c-builders` |

**Next, when a lane frees:** P2 Clients (`docs/specs/2026-11-12-studio-shell-clients-billing.md`).
**Held:** C1 credits and A1 (Frrata's payment account for partners must exist first); V2 hosting (after V1, and the
owner's yes on ADR-0017's Vercel-only revision); V3 Studio (after V1, V2, C1, T1c).

## The rules every worker follows
1. **Its own branch only.** Never push `main`, never apply a migration to production, never `vercel deploy`, never
   touch another lane's branch. The orchestrator is the one path to production.
2. **The frata-planning loop, unchanged:** plan, the review agents on the plan, then **one final mockup** of the phase
   published as an artifact. **Stop there** and send the orchestrator the link, the plan path and any owner question.
   Build only after the orchestrator relays the owner's approval.
3. **Migrations** are generated as usual (`npm run db:generate`); their numbers will be renumbered at merge. Say in the
   report which files are migrations. A table ships with its grant, RLS, policy and its block in
   `scripts/verify/tenancy.sql` (take the next free block number and say which).
4. **Shared files** (CLAUDE.md, skills, `src/domains/tenancy/roles.ts`, the console and partner layouts, the shell,
   `next.config.ts`, the middleware, `scripts/check-*.mjs`): change them only as the plan needs, and list every one in
   the report, so merges are planned.
5. **Merge `origin/main` into the branch** at least once a day and before each report.
6. **Done** means: `npm test`, `npm run typecheck`, `verify:tenancy` when `drizzle/` changed, the e2e flows the change
   touches (`npm run release:check` lists them), `impact-reviewer` and the plan's reviewers on the diff,
   `mockup-parity-reviewer` passing. Then report "ready to release" with the branch head.
7. **Reports** go to the orchestrator by `send_message` (session above): what was done, what is next, what blocks.

## Release order (the orchestrator)
One lane at a time: merge `main` into the lane, renumber its migrations against production, run the gates and the
touched flows, apply its migrations to production, push to `main` at once, watch the deploy and runtime errors, tell
the owner. Then the next lane merges the new `main`.
