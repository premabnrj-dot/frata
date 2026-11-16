# Practices from Ekatan — G1 gates, G2 hooks, G3 evals, G4 split
**Mockup:** none — no screen; proposal page https://claude.ai/artifact/7x3xUf5cnMgifDtVTMACWZ
**Approved:** owner, 2026-11-16 (calls 1, 2, 4, 6 as recommended; 3 and 5 left to Claude: block, plans from 2026-11-17)
**Review:** architecture-reviewer, security-reviewer — see § Review, 2026-11-16

Spec: `docs/specs/2026-11-16-practices-from-ekatan.md`. Branch `claude/practices-from-ekatan`. Each phase lands on its
own: gates run against their own documentation first (CLAUDE.md), `npm test` and `npm run typecheck` pass,
`impact-reviewer` on the diff, then a push to `main`.

## Regression net (before the change)
The change is to the tooling, not the product. The net is: `npm test` (27 gates + vitest) and `npm run typecheck` green
on `main` 83cb778 before G1 (measured 2026-11-16: 1,692 tests pass); each new gate has a vitest file in
`scripts/__tests__/` that runs it against a fixture that must fail and one that must pass; each hook has a test that feeds
it a tool call on stdin.

## G1 · Gates
| # | Task | Verify |
|---|---|---|
| 1 | `scripts/lib/frontmatter.mjs`: read a skill's or agent's front-matter (scalars, one nested map, inline arrays) and body. No dependency. | its test |
| 2 | `scripts/check-skills.mjs` (`check:skills`, in `npm test`): skills — name = folder, description opens "Use when/before", `metadata` version x.y.z / owner / verified date, body ≤ 500 lines unless PINNED (design-language, architecture, integrations at today's length, may only shrink), every other `.md` in the folder linked from SKILL.md and linking no further, a reference over 100 lines opens with `## Contents`, `evals/*.json` schema. Agents — name = file name, description, `metadata` version / owner / verified. Both — body changed since the merge base with `origin/main` and the version is the same → fail. No `origin/main` → the bump rule is skipped with a note. | `node scripts/check-skills.mjs`; test with fixtures; run against the spec that describes it |
| 3 | `metadata.owner: owner` on the 8 skills; `metadata` (version 1.0.0, owner, verified 2026-11-16) on the 13 agents. | `check:skills` clean |
| 4 | `scripts/check-plans.mjs` (`check:plans`): plans in `docs/plans/` dated 2026-11-17 or later need `**Mockup:**` (link, or `none — <why>`), `**Approved:** <who>, <date>` and at least one `**Review:** … <date>`; "pending" fails. | test; `node scripts/check-plans.mjs` |
| 5 | `scripts/merge-main.mjs --journal` (`check:migrations`, in `npm test`): no network; journal idx in order, every entry has its file, an out-of-order `when` fails unless listed in `APPLIED_OUT_OF_ORDER` (`0123_partner_teams`, applied in production). `--check` keeps its warning for the rest. | test; `npm run check:migrations` |
| 6 | `scripts/check-docs.mjs` (`check:docs`): living docs (CLAUDE.md, `.claude/**/*.md`, `docs/setup.md`, `docs/runbooks/`, `e2e/README.md`) naming a backticked repo path that does not exist (placeholders `NN`, `<…>`, `*`, `e2e/.out/` skipped); CLAUDE.md over 200 lines. Fix `frata-architecture`'s `src/domains/ekcode/`. | test; clean |
| 7 | `check:storefront-build` also budgets Console, Admin and partner pages: 150 kB gz first-load JS (the customize page 190), measured as shop pages are (layouts above + page). Ceilings set from today's build if any page is already over (pinned, may only shrink). | `npm run build` (postbuild) |
| 8 | `frata-planning`: plan header lines (Mockup, Approved, Review) and `check:plans`; § 4 the proposal page's opening (In short, Audit, What to take, Your calls, Step by step); a number on a mockup is measured by the engine; § 3 gains **Stress test**; the loop gains **After deploy** (errors for touched pages within the hour and next day). `impact-reviewer` item 5 points at `check:skills` for bumps. `release-agent` gains the next-day check. | `check:skills` (bumps) |

## G2 · Hooks
| # | Task | Verify |
|---|---|---|
| 9 | `package.json`: `gates` holds the gate chain; `test` is `npm run gates && vitest run`. | `npm test` |
| 10 | `// Fails: …` on line 2 of every gate; `scripts/docs-gates.mjs` writes `docs/reference/gates.md` from them; `check:docs` fails when it is stale; CLAUDE.md "Before you commit" points at it. | `check:docs` |
| 11 | `scripts/hooks/commit-gates.mjs`: PreToolUse on Bash; on a `git commit`, runs `npm run gates`; on a failure, denies with the failing gate's last lines. Any error of its own → allow, silent. | its test (stdin) |
| 12 | `scripts/hooks/doc-drift.mjs` + `scripts/lib/doc-refs.mjs` (shared with `check:docs`): on a commit that changes a file a living doc names exactly or its narrowed `metadata.covers` matches, while the doc is not in the commit, deny with the passage, unless the message has `Docs: unaffected — <reason ≥ 8 chars>`. Any error → allow. Narrow `covers` in the 4 skills. Replay over the last 300 commits; report the rate. | test; replay script |
| 13 | `.claude/settings.json`: the two hooks; `permissions.deny` for `vercel deploy`, `vercel --prod`, `npx vercel`, `git push --force`/`-f` to `main`. CLAUDE.md "Deploying" names the deny rule. | a denied call in this session |

## G3 · Evals
| # | Task | Verify |
|---|---|---|
| 14 | `scripts/eval.mjs` (`npm run eval -- <skill-or-agent> [scenario] [--judge] [--record]`): skills from `.claude/skills/<s>/evals/*.json`, agents from `.claude/agents/evals/<a>/*.json` (a scenario carries its planted code in `input`). Headless `claude -p`, tools `Read,Grep,Glob,Skill` only; an agent's body is its system prompt. `--record` → `docs/evals/<name>/<date>-<scenario>.md`. | one real run with `--judge` |
| 15 | Two planted-flaw scenarios each: `tenancy-auditor`, `security-reviewer`, `unit-economics-reviewer`, `architecture-reviewer`. `check:skills` checks the agent eval schema. | `--judge --record` on all 8, results committed |
| 16 | `docs/decisions/accepted-findings.md` (finding · ruling · owner, date); every review agent reads it before reporting. | `check:skills` (bumps) |

## G4 · Split
| # | Task | Verify |
|---|---|---|
| 17 | `frata-design-language` body ≤ 500 lines: surface-specific approved sections move to `reference/*.md` (one level deep, `## Contents` over 100 lines), each linked from a table in SKILL.md saying when to open it; `reference/states.md` first (seven states × surface × primitive). No rule changes meaning; version major (the file a rule lives in changed). Pin removed. | `check:skills`; a line count of rules before and after |
| 18 | Then `frata-architecture`, then `frata-integrations`, the same way, pins removed. | `check:skills` |

## Deviations
| Element | Built | Reason | Owner seen |
|---|---|---|---|

## Practices recorded in skills
`frata-planning` (task 8): plan header, proposal opening, measured claims, Stress test, After deploy. `frata-verify`: the
new gates and `npm run eval`. CLAUDE.md: the gates page, the hooks.

## Repetitive work → agents and scripts
| Chore done by hand | Now |
|---|---|
| Asking "did you bump the skill?" in review | `check:skills` |
| Copying the gate list into CLAUDE.md | `docs/reference/gates.md`, generated |
| Remembering `npm test` before a commit | commit hook |
| Checking a plan was approved and reviewed | `check:plans` |
| Checking a reviewer still catches what it should | `npm run eval` |

## Review
