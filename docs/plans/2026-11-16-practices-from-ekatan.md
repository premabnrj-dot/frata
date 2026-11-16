# Practices from Ekatan — G1 gates, G2 hooks, G3 evals, G4 split
Status: active · Date: 2026-11-16
**Mockup:** none — no screen; proposal page https://claude.ai/artifact/7x3xUf5cnMgifDtVTMACWZ
**Approved:** owner, 2026-11-16 (calls 1, 2, 4, 6 as recommended; 3 and 5 left to Claude: block, plans from 2026-11-17)
**Review:** architecture-reviewer NOT READY → 12 findings fixed below, 2026-11-16
**Review:** security-reviewer NOT READY → 8 fixed below, 2 for the owner (§ Owner), 2026-11-16

Spec: `docs/specs/2026-11-16-practices-from-ekatan.md`. Branch `claude/practices-from-ekatan`. Each phase lands on its
own: each gate runs against its own documentation first (CLAUDE.md), then `npm test` and `npm run typecheck`, then
`impact-reviewer` on the diff, then a push to `main`.

## Regression net (before the change)
This changes tooling, not the product. Before G1, `npm test` (27 gates + vitest, 1,692 tests) and `npm run typecheck` are
green on `main` at 83cb778, and `npm run build` passes postbuild (measured 2026-11-16). Each new gate gets a vitest file in
`scripts/__tests__/` with a fixture that must fail and one that must pass. Each hook gets a test that feeds it tool calls
on stdin.

## G1 · Gates
| # | Task | Verify |
|---|---|---|
| 1 | `scripts/lib/frontmatter.mjs`: reads front-matter (scalars, one nested map, inline arrays) and body. No dependency. | test |
| 2 | `scripts/check-skills.mjs` (`check:skills`, in `npm test`). **Skills:** name = folder; description opens "Use when/before"; `metadata` version x.y.z, owner, verified date; body ≤ 500 lines. PINNED (design-language, architecture, integrations) at **today's length + 20** until G4 (A7), may only shrink below that. Every other `.md` in the folder is linked from SKILL.md and links no further; a reference over 100 lines opens with `## Contents`; `evals/*.json` schema. **Agents:** name = file name, description, `metadata` version / owner / verified. **Both:** a body that changed since the base while the version stayed the same fails. Base = `SKILLS_BASE` env, else the merge base with `origin/main`. If neither exists, the rule is skipped with a printed note. CI sets `SKILLS_BASE=${{ github.event.before }}` with `fetch-depth: 0`, so pushes to `main` are judged (A8). | test with fixtures; run on the spec |
| 3 | `metadata.owner: owner` on the 8 skills. `metadata` (1.0.0, owner, 2026-11-16) on the 13 agents. | `check:skills` |
| 4 | `scripts/check-plans.mjs` (`check:plans`). Plans in `docs/plans/` dated 2026-11-17 or later need, among their first 15 lines, `**Mockup:**` (a link, or `none — <why>`), `**Approved:** <who>, <date>` and at least one `**Review:** …`. A plan whose `Status:` is draft may say `**Review:** pending`; once it is active or done, every Review line needs a date and none may say pending (A3). "Pending" is read only on those header lines. | test |
| 5 | `scripts/merge-main.mjs --journal` (`check:migrations`, in `npm test`). It branches before the `git fetch` (A11): no network, git not needed. Journal idx in order; every entry has its file; an out-of-order `when` **fails** unless the entry is listed in `APPLIED_OUT_OF_ORDER` (`0123_partner_teams`). `--check` is unchanged. | test |
| 6 | `scripts/check-docs.mjs` (`check:docs`). Fails when a living doc (CLAUDE.md, `.claude/**/*.md`, `docs/setup.md`, `docs/runbooks/`, `e2e/README.md`) names a backticked repo path that does not exist. Skipped: placeholders (`NN`, `<…>`, `*`), `e2e/.out/`, and `src/domains/<module>/` paths that `check:modules` reserves (A12). Also fails CLAUDE.md over 200 lines. `frata-architecture` line 713 is reworded as the rule it is. | test |
| 7 | `check:storefront-build` also budgets every Console, Admin and partner page: 150 kB gz, measured as shop pages are. Pages measured on 2026-11-16 at or above 148 kB are pinned at measured + 2 kB, may only shrink: content 225.2, products/[handle] 207.1, settings/[section] 185.9, orders 158.2, offers/[id] 152.1, collections/[handle] 150.9, collections/new 149.6, offers/new 149.3, preview 148.6 (A1). The customizer keeps its own `CUSTOMIZER_KB = 208`, and the new loop skips it (A2). `frata-architecture` line 756 is corrected. | `npm run build` |
| 8 | `frata-planning`: the plan header lines and `check:plans`; § 4, the proposal opening (In short, Audit, What to take, Your calls, Step by step); a number on a mockup is measured by the engine; § 3 gains **Stress test**; the loop gains **After deploy**. `impact-reviewer` item 5 points at `check:skills`. `release-agent` gains the next-day error check and the version merge (A6): on a `metadata.version` conflict, take the higher version and bump its patch. `merge-main.mjs --check` reports a skill whose version on main is ahead of the branch's while both changed its body. | `check:skills` |

## G2 · Hooks
| # | Task | Verify |
|---|---|---|
| 9 | `package.json`: `gates` holds the gate chain and `test` is `npm run gates && vitest run`. `npm run gates:list` prints each gate's `// Fails:` line (every gate gets one on line 2). CLAUDE.md "Before you commit" points at the command. Nothing is generated or committed (A9). | `npm test` |
| 10 | **One** hook script, `scripts/hooks/pre-bash.mjs`, registered as `node "$CLAUDE_PROJECT_DIR/scripts/hooks/pre-bash.mjs"` (A10, S4). It returns silently first unless the command matches `\bgit\b[^|;&]*\b(commit\|push)\b`. It parses with a JS tokenizer and never runs the command's text (S5). Each git call is `execFileSync` with argv, `-c core.fsmonitor=` and `--no-ext-diff`, and runs from the project dir. It acts only when `git rev-parse --show-toplevel` of the command's dir is the project dir or one of its `.claude/worktrees/*` (S4). Its only outputs are `deny` or nothing; it never prints `allow` (S6). Any error of its own → exit 0, silent. | tests on stdin, including `$(touch x)` and backticks in `-m` with no side effect |
| 11 | In that script, on `git commit`: run `npm run gates` with cwd = project dir; on a failure, deny with the failing gate's last lines. A `Gates: skipped — <reason>` line in the message lets a commit through on a red `main` (A10). | test |
| 12 | In that script, the doc drift (`scripts/lib/doc-refs.mjs`, shared with `check:docs`). A living doc covers the files it names exactly, plus its `metadata.covers`, which is narrowed. The commit's files are the index plus, when the command holds `git add` / `-a` / `--all`, the working tree's tracked changes and new files (A4). Message from `-m`, `-F <file>` or a heredoc; `--amend` and anything it cannot parse → allow. Deny with the passage unless the message has `Docs: unaffected — <reason ≥ 8 chars>`. **Before it is switched on**, a replay over the last 300 commits: above 25% it ships as a warning, not a deny (A5). | tests; replay |
| 13 | On `git push`: deny when the target is `main` and the push forces it in any spelling (`--force*`, `-f`, `+main`, `:main`, `--mirror`, `--delete`) (A10, S2). | tests |
| 14 | `.claude/settings.json`: the hook. `permissions.deny` for `vercel` (bare and `vercel *`), `npx vercel*`, `npm exec vercel*`, `./node_modules/.bin/vercel*`, and the Vercel MCP's deploy, promote, rollback and rolling-release tools by name (S3). CLAUDE.md says these guard against mistakes and are not the control. `check:config` fails a settings file that adds `permissions.allow` or a hook other than this one (S9). Deny rules are checked in a **fresh** headless session (A10). | `claude -p` in the repo, asked to run `vercel deploy` → refused |

## G3 · Evals
| # | Task | Verify |
|---|---|---|
| 15 | `scripts/eval.mjs` (`npm run eval -- <skill-or-agent> [scenario] [--judge] [--record]`). Scenarios: `.claude/skills/<s>/evals/*.json`, `.claude/agents/evals/<a>/*.json` (planted code in `input`). The child runs as `spawn('claude', [...argv], { shell: false })` with the prompt on stdin (S7) and these flags: `--tools Read,Grep,Glob,Skill`, `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`, `--setting-sources project`, `--permission-mode default`, and `--disallowedTools` for `Read(//proc/**)`, `Read(~/**)` and `Read(**/.env*)`. Its env is scrubbed to PATH, HOME, the model's base URL, the proxy and the CA (no GH/AWS/GCP tokens) (S1). The judge gets `--tools ""`. An agent's body is the child's appended system prompt. | one run, `--judge` |
| 16 | `--record` writes only the final answer and the verdict to `docs/evals/<name>/<date>-<scenario>.md`. It first scans for secret patterns (`rzp_`, `sk-`, JWTs, `postgres://`, AWS keys, `ghp_`) and refuses to write on a match (S8). Scenarios use plainly fake keys. | test of the scan |
| 17 | Two planted-flaw scenarios each for `tenancy-auditor`, `security-reviewer`, `unit-economics-reviewer` and `architecture-reviewer`. `check:skills` checks the agent eval schema. | `--judge --record` on all 8, committed |
| 18 | `docs/decisions/accepted-findings.md` (finding · ruling · owner, date). Every review agent reads it before reporting. | `check:skills` (bumps) |

## G4 · Split
| # | Task | Verify |
|---|---|---|
| 19 | `frata-design-language` body ≤ 500 lines. Surface-specific approved sections move to `reference/*.md` (one level deep, `## Contents` over 100 lines), each linked from a table in SKILL.md that says when to open it; `reference/states.md` comes first (seven states × surface × primitive). No rule changes meaning. Major version, because where a rule lives changed. Pin removed. | `check:skills`; rules counted before and after |
| 20 | `frata-architecture`, then `frata-integrations`, the same way. Pins removed. | `check:skills` |

## Owner (security review, not done by this plan)
- **S2: a GitHub ruleset on `main`** that blocks force-pushes and deletion. It is the real control; the hook and deny rules
  only catch honest mistakes. The repository settings are the owner's.
- **S9, CODEOWNERS** for `.claude/settings.json` and `scripts/hooks/`: not done. With one owner it adds no reviewer. It
  returns when a second person can push.
- **S10**: failing open is the design. CI runs `npm test` and the build on every push (`.github/workflows/test.yml`), and
  that is the real gate.

## Deviations
| Element | Built | Reason | Owner seen |
|---|---|---|---|
| Call 6: split design-language, "the other two follow, one at a time" | All three split in one phase, each its own script run and line check | The same mechanical move (sections moved unchanged, 0 lines lost in each); doing them together keeps parallel lanes from conflicting on three separate days | no: in the report |
| Task 2: pins at today's length + 20 until G4 | Pins removed the same day | G4 ran in this session, so the pins held for hours, not weeks | no: in the report |

## Practices recorded in skills
`frata-planning` (task 8): plan header, proposal opening, measured claims, Stress test, After deploy. `frata-verify`: the
new gates, the hook and `npm run eval`. CLAUDE.md: `gates:list`, the hook, the deny rules.

## Repetitive work → agents and scripts
| Chore done by hand | Now |
|---|---|
| Asking "did you bump the skill?" in review | `check:skills` |
| Copying the gate list into CLAUDE.md | `npm run gates:list` |
| Remembering `npm test` before a commit | the commit hook |
| Checking a plan was approved and reviewed | `check:plans` |
| Checking a reviewer still catches what it should | `npm run eval` |

## Progress
- **G1 built 2026-11-16.** `impact-reviewer` FIX BEFORE COMMIT → fixed: CI sets `SKILLS_BASE` only on pushes to `main`
  (branches use the merge base); the Console budget is a pure function (`scripts/lib/app-budget.mjs`) with a test;
  `merge-main.mjs` reads the migration files once; `frata-architecture` bumped minor (a gate added). `npm test` (1,710
  tests) and typecheck green; `npm run build` postbuild clean.
- **G2 built 2026-11-16.** Replay before switching on: 38% of the last 300 commits would have been stopped (code paths
  only; 63% when a doc naming another doc counted), over 25%, so the doc drift ships as a **warning** to the agent
  (`additionalContext`), and the commit goes ahead. Gates before commit and the force-push check **deny**. Verified in a
  fresh headless session: `vercel deploy` refused by the deny rule despite an allow; a `--force` push to main refused by
  the hook; the drift warning reaches the agent. `security-reviewer` READY as a guardrail (7 holes fixed: `+HEAD` on
  main, push-option values, `command`/path-prefixed git, here-strings, worktree common dir, `-F` read capped, realpath;
  `vercel:*` for every launcher; `check:config` allows only `permissions.deny`). `impact-reviewer` CLEAR (fixed: the deny
  says the gates read the working tree; `cd ~`/`$VAR` no longer throw; tests for `-F`, `cd`, `--amend`, worktrees, a
  plain push). Deviation from task 10: gates run from the worktree's own top (its committed package.json), not the
  project dir, after confirming the worktree shares the project's git dir. Not caught and accepted (in the hook's
  header): git aliases, a remote set to force, `bash -c`, backticks.
- **G3 built 2026-11-16.** `npm run eval`; 8 planted-flaw scenarios; all pass (33/33 behaviours) after the judge was
  told that raising a problem or giving its fix counts (the first, literal judge failed the security reviewer on
  wording). Results in `docs/evals/`. `docs/decisions/accepted-findings.md`: two rulings the owner made; two **proposed**
  rows (the hook's accepted gaps, the Console pins) wait for the owner. `impact-reviewer` FIX BEFORE COMMIT → fixed:
  the proposed rows were first written as rulings (they were not the owner's); the judge's verdict must grade every
  behaviour once; an unknown scenario fails; the deny names HOME's credential folders, not HOME; four agents point at
  the reference files.
- **G4 built 2026-11-16.** design-language 1,312 → 305 lines (7 reference files with `states.md`), architecture 1,128
  → 396 (4), integrations 952 → 38 (7); sections moved unchanged (a line check found 0 missing in each); majors bumped;
  pins removed; `check:skills` bumps cover reference files.
