# Practices from Ekatan: which of its gates, hooks and evals Frrata takes
Status: built 2026-11-16 · Date: 2026-11-16 · Mockup: none — no screen; the proposal page stands in for it: https://claude.ai/artifact/7x3xUf5cnMgifDtVTMACWZ (`docs/mockups/2026-11-16-practices-from-ekatan.html`) ·
Approved: owner, 2026-11-16 (calls 1, 2, 4, 6 as recommended; 3 and 5 left to Claude: the drift hook blocks; plans from 2026-11-17) · Plan: `docs/plans/2026-11-16-practices-from-ekatan.md`

The owner asked on 2026-11-16: "share best practices ekatan has that frrata can use … work/review those and implement."
Ekatan (`premabnrj-dot/ekatanv2`) is built the same way as Frrata: CLAUDE.md of rules, skills, grep gates, ADRs and
specs with mockups. A research session in Ekatan compared the two the same day and found that Frrata is ahead on
review agents and e2e flows, and that Ekatan is ahead on nine practices. This spec takes each practice, measures what
Frrata has today on its own code (2026-11-16, `main` at 83cb778, full history from 2026-11-06), and says whether to
**adopt** it as is, **adapt** it, or **skip** it. Ekatan's files were read from a read-only clone. This is a
refactor across modules with no visible change, so per `frata-planning` § When this applies it gets a short spec, the
review, a proposal page instead of a mockup, and a plan.

## Goal

This is **enabling work**. It moves no ranked problem directly. It protects all of them: every rule that keeps a
merchant's money and data safe (tenancy, paise, costs off the browser, rows before requests) is held by a skill, a
gate or a review, and this work is about whether those three can be trusted. Frrata ships about 130 commits a day
across parallel lanes, and today a skill can drift from the code, or a plan can run without sign-off, with no
script noticing.

Measures (each is a number a script can print):
- **Skill body changed without a version bump: 56 of 344 edits (16%) → 0.** A gate refuses it.
- **Skills over 500 lines: 3 → none may grow**, and `frata-design-language` is split by the end of phase 4.
- **Gates that CLAUDE.md names, against those `npm test` runs: 17 of 27 → the list is generated, so it cannot drift.**
- **Plans with a fixed `**Mockup:**`, `**Approved:**` and `**Review:**` header: 0 → every plan from 2026-11-17.**
- **Review agents with an eval: 0 of 13 → 4** (the four that guard money and data).

## Job

The owner, and every session working on Frrata, can trust that a skill says what the code does, and that a plan
was signed off and reviewed before it ran, because a script or a hook refuses what drifted, not a reviewer's memory.
Now, because ten lanes work in parallel (`docs/plans/2026-11-15-parallel-lanes.md`) and the honour system is
already slipping (the measures above).

## Research — what Frrata has today, measured

| What | Frrata today (2026-11-16) | How it was measured |
|---|---|---|
| Skills | 8. Each has `name`, `description` opening "Use when", `metadata.version` and `metadata.verified`. **None has `metadata.owner`.** | front-matter of `.claude/skills/*/SKILL.md` |
| Skill length | `frata-design-language` 1,319 lines, `frata-architecture` 1,136, `frata-integrations` 959. The other five are under 300. None has reference files. | `wc -l` |
| Version bumps | 344 commits changed a skill's body since 2026-11-06; **56 left the version as it was** (design-language 22, architecture 18, integrations 8, gotchas 5, unit-economics 3). Today only `impact-reviewer` item 5 asks, by judgement. | a script over `git log` comparing body and `metadata.version` per commit |
| Agents | 13, with `name` and `description` only: no version, owner or date. **No eval for any agent or skill.** | front-matter of `.claude/agents/*.md` |
| `metadata.covers` | Declared in 4 skills (architecture: `src/lib/**`, `src/middleware.ts`, `drizzle/**`; design-language; unit-economics; verify). **Nothing reads it.** | grep |
| Hooks | **No `.claude/settings.json`.** No hook, no deny rule. "Never `vercel deploy`" is prose in CLAUDE.md. | `ls .claude` |
| Docs naming a missing file | Living docs (CLAUDE.md, `.claude/**`, `docs/setup.md`, `e2e/README.md`): **1 real** (`frata-architecture` line 713 names `src/domains/ekcode/`, which does not exist; the module's code is in `src/lib/modules/ekcode` and `src/components/modules/ekcode`) and 11 placeholders or output folders (`e2e/.out/`, `e2e/flows/NN-`). History (specs, plans, ADRs, research): 76 in 45 files, which is right: they record what was planned. | a script over backticked repo paths |
| CLAUDE.md | 148 lines. Its "Before you commit" comment names **17 of the 27 gates** `npm test` runs (missing: logs, documents, api, capabilities, ekcode-brand, billing-read, credits, duration, fonts, feedback, beacon). | `package.json` against CLAUDE.md:108 |
| Gates' first line | 14 of 30 `scripts/check-*.mjs` open with `// Fails: …` on line 2; the rest open with a banner. | `sed -n 2p` |
| Plans | 63 plans. 38 have a mockup line and 41 a dated approval, each written in its own words (e.g. `Status: approved 2026-11-15 (owner, through the orchestrator)`). Reviews are prose ("reviews folded in (architecture, tenancy …)"). A script can check none of it. | grep over `docs/plans/` |
| Migrations | `release:check` (`scripts/merge-main.mjs --check`) already checks numbers, journal `idx` and missing files, and **warns** on an out-of-order `when`. It is not in `npm test`. The journal has one out-of-order `when` now: `0123_partner_teams` (1794513445653) is before `0122_products_low_stock` (1794513446121). | `drizzle/meta/_journal.json` |
| JS budget | Shop pages: 120 kB gz, held by `check:storefront-build` (postbuild). Console and Admin: 150 kB gz (customize 190) is written in `frata-architecture` § Speed as **"review (a gate to add)"**. | `frata-architecture` line 756 |
| States | `check:states` holds one state (every surface root has an `error.tsx`). The seven states are listed in `frata-planning` § 3 UI/UX; `frata-design-language` has no table naming the primitive for each state on each surface. | grep |
| Speed of the gates | All 27 gates, without vitest: **6 s**. Fast enough to run in a hook before every commit. | timed |
| A doc-drift hook, replayed | Over the last 300 commits, a hook like Ekatan's would have stopped **172 (57%)** with today's `covers` globs, and **116 (39%)** counting only files a doc names exactly. Ekatan found a bare `Docs: unaffected` written by reflex on 35 of 50 commits, and now asks for a reason. | a script replaying `git log` against the living docs |

Ekatan's files read: `scripts/check-skills.mjs`, `scripts/check-plans.mjs`, `scripts/doc-drift-hook.mjs`,
`scripts/eval-skill.mjs`, `scripts/check-js-budget.mjs`, `scripts/lib/doc-refs.mjs`, `.claude/settings.json`,
`.claude/skills/ekatan3d-planning/SKILL.md` (In short, measured claims, Stress test, After deploy),
`.claude/skills/ekatan3d-design-language/states.md`, `.claude/agents/pricing-reviewer.md`,
`src/domains/quoting/price-behaviour-accepted.ts`.

## Design — the verdict on each practice

| # | Ekatan practice | Verdict | What changes in Frrata, and why |
|---|---|---|---|
| 1 | `check:skills`: front-matter, `Use when`, `metadata` version/owner/verified, ≤ 500 lines, references one level deep, eval schema, **version bump enforced against git** | **Adopt, extended to agents** | `scripts/check-skills.mjs` in `npm test`. The three long skills are **pinned at today's length and may only shrink** (Ekatan's own arrangement, and `check:size`'s for code), so the gate lands green and the split is phase 4's work. Agents get `metadata` (version, owner, verified) and the same bump rule. The bump is checked against `origin/main`'s merge base; it fails from the day it lands (Frrata needs no two-week warning: the 56 misses are already counted). `impact-reviewer` item 5 then points at the gate instead of asking. |
| 2 | Skill evals: `evals/*.json`, a headless `claude -p` with read-only tools, `--judge`, `--record`; MAJOR bump runs the evals | **Adapt: agents first** | `scripts/eval.mjs` runs both skills' and agents' evals (`claude` 2.1 is installed in cloud sessions). Start where a miss costs money or data: **planted-flaw evals** for `tenancy-auditor` (a query outside `withTenant`, a tenant id from a form), `security-reviewer` (an action with no rate limit, a webhook parsed before its HMAC), `unit-economics-reviewer` (a fee in rupees, not paise) and `architecture-reviewer` (a second copy of profit per order). Two scenarios each. Recorded to `docs/evals/<name>/`. Run before a MAJOR bump of that agent or skill, never in `npm test` (each scenario is a model call). Skill evals follow for `frata-architecture` and `frata-planning`. |
| 3a | Generated reference pages (gates, schema, routes, domains, scripts, skills) regenerated by a hook | **Adapt: gates only** | One generated page, `docs/reference/gates.md`, built from each gate's `// Fails: …` line (16 gates get that line). CLAUDE.md's "Before you commit" points at it instead of listing 17 names by hand. `check:docs` fails when it is stale. Schema, routes and domains pages: skipped. Nothing in Frrata reads them, and `src/lib/db/schema.ts` and the route tree are already the source. Signal to bring back: an agent or reviewer asking "which routes exist" twice. |
| 3b | `doc-drift-hook`: a commit that changes a file a doc covers is denied unless the doc is in the commit or the message says `Docs: unaffected — <why>` | **Adapt: named files only, with a reason** | Measured, it would stop 39% of commits on named files and 57% with today's `covers` globs. The globs are what make it noise (`src/lib/**` covers half the code), so `covers` is narrowed to the files a skill actually describes, and a doc covers what it names exactly. The reason after `Docs: unaffected —` is required (Ekatan's lesson). The hook never fails a commit by its own error. |
| 3c | `check:docs`: a living doc naming a missing file, a stale generated page, CLAUDE.md over 200 lines | **Adopt** | Living docs only: CLAUDE.md, `.claude/**`, `docs/setup.md`, `docs/runbooks/`, `e2e/README.md`. Specs, plans, ADRs and research are history and are left as written. Placeholders (`NN-`, `e2e/.out/`) are skipped by pattern. Fixes the one real finding (`src/domains/ekcode/`). |
| 3d | `docs:stale` weekly report | **Skip** | `check:docs` in `npm test` already fails on each commit; a weekly report would list the same thing later. |
| 4 | `check:plans`: `**Mockup:**` and dated `**Approved:**` lines | **Adopt, with a Review line** | Every plan dated from **2026-11-17** opens with `**Mockup:** <link or none — why>`, `**Approved:** <who>, <date>`, and `**Review:** <agent> <READY or findings fixed>, <date>` for each agent rule 3 calls for. "Pending" fails. Older plans are history and are left alone. This turns "never start 7 before 5" and "nothing executed before the review agents have run" into a script. |
| 5a | `check:migrations` | **Adapt: the journal half into `npm test`** | Frrata's `merge-main.mjs --check` already does this but needs `origin/main` and runs only at release. A `--journal` mode (no network) joins `npm test`: idx in order, every entry has its file, and an out-of-order `when` **fails** unless the entry is listed as applied in production (today: `0123_partner_teams`). That is the gotcha "drizzle-kit silently skips a migration" held by a gate. |
| 5b | `check:js-budget` | **Adapt: add Console and Admin to the gate Frrata has** | `check:storefront-build` already holds the shop at 120 kB. It also measures Console and Admin pages against 150 kB (customize 190), the budget `frata-architecture` already sets. Over budget → split with `next/dynamic`, never raise the number. |
| 6 | The proposal page's fixed opening (In short, Audit, What we took, Your calls, Step by step) and "a claim the mockup makes is measured, not judged" | **Adopt** into `frata-planning` § 4 | Words only, no gate. Frrata's mockups already list their states; they gain the fixed opening and the rule that a number on a mockup comes from running the engine (`src/domains/orders/profit.ts` for profit, the fee engine for a price). |
| 7 | Spec **Stress test** (read the code the screens call; test each action, failure path and other writer; table severity · what · file · fix) and **After deploy** (production errors for each touched page within the hour and next day) | **Adopt** into `frata-planning` § 3 | The Stress test becomes a heading in Frrata's review, before sign-off. After deploy goes to `release-agent`, which already watches the deploy: it adds a next-day `get_runtime_errors` check for the touched pages, written into the plan. |
| 8 | `states.md`: the seven states per surface with the named primitive | **Adopt** as a reference file of `frata-design-language` | Becomes the skill's first reference file in phase 4: Console, Admin, partner workspace, shop, each state with its primitive (`EmptyState`, `Skeleton`, `error.tsx`, …), from what the skill already says. |
| 9a | Paired domain reviewers with "For the other review" | **Skip** | Ekatan pairs two reviewers of one domain (price and visuals of one quote). Frrata's reviewers are by concern (tenancy, security, speed, words, design system), and plans already run several on one diff. Signal: two reviewers' findings contradicting each other on the same plan. |
| 9b | Accepted rulings stored as data | **Adapt, small** | Frrata has no findings engine like Ekatan's price behaviour, but reviewers re-raise rulings the owner already made. One file, `docs/decisions/accepted-findings.md` (finding · ruling · owner date), that every review agent reads before reporting. |
| 10 | Review verdicts recorded and checked | **Adopt** (the `**Review:**` line of 4) | |
| 11 | Agent `metadata` and evals | **Adopt** (1 and 2) | |
| 12 | `memory: project` on review agents | **Skip for now** | A cloud session's container is thrown away; agent memory would have to be committed to the repo to last, and then it is an unreviewed second copy of rules that belong in skills or gates. Frrata's loop already moves a repeated finding into a skill or a gate (rule 6). Signal: the same finding raised on three plans in a month. |
| 13 | Rules that must never fail in hooks and deny rules | **Adopt** | `.claude/settings.json`: deny `vercel deploy` and `vercel --prod` (CLAUDE.md "Never `vercel deploy`") and `git push --force` to `main`. A **PreToolUse hook on `git commit` runs the 27 gates (6 s)** and denies the commit with the first failure, so "Before you commit: `npm test`" holds without memory. Vitest and typecheck stay manual (minutes, not seconds). No Stop hook: it would run on every turn, including turns that changed nothing. |

## Phases

Each phase lands on its own, green, and is usable without the next.

| Phase | What | Size |
|---|---|---|
| **G1 · Gates** | `check:skills` (skills and agents, pins, bump), `check:plans` (Mockup, Approved, Review from 2026-11-17), the journal mode in `npm test`, Console and Admin JS budgets, `check:docs` (living docs, CLAUDE.md ≤ 200) and the one stale reference fixed. `metadata.owner` on 8 skills, `metadata` on 13 agents. `frata-planning` gains the proposal opening, measured claims, Stress test, After deploy and the Review line. | 6 scripts, ~25 doc edits |
| **G2 · Hooks** | `.claude/settings.json`: deny rules, the commit hook that runs the gates, the doc-drift hook on named files, `covers` narrowed. `docs/reference/gates.md` generated, with `// Fails:` on every gate. | 3 scripts, 1 settings file |
| **G3 · Evals** | `scripts/eval.mjs` for skills and agents; two planted-flaw scenarios each for the four money-and-data reviewers; `docs/evals/`; `accepted-findings.md` read by the reviewers. | 1 script, 8 scenarios |
| **G4 · Split** | `frata-design-language` under 500 lines with `reference/` files one level deep (`states.md` first, then each approved surface's section), then `frata-architecture` and `frata-integrations`. Pins lowered as each shrinks. | moves text, changes no rule |

## Design review

- **UI/UX** — n/a: no screen. The proposal page is for the owner only.
- **Tenancy** — n/a: no table, query or tenant id. The gates read files, not data.
- **Modularity** — every gate is one file in `scripts/`, added to `npm test` beside the others; hooks are scripts the
  settings file calls. Shared parsing (front-matter, backticked paths) goes in one `scripts/lib/` module used by
  `check:skills`, `check:docs` and the drift hook, so a doc's coverage is computed once.
- **SSOT / DRY** — the gate list is generated from the gates (it is hand-copied today and wrong); a doc's coverage is
  read from the doc, not a map; a plan's approval is one line, not prose in three places.
- **YAGNI** — left out: schema, routes and domains pages; the weekly stale report; paired reviewers; agent memory; a
  Stop hook; evals in CI. Each has its signal above.
- **KISS** — the simplest version is G1 alone: six grep scripts in `npm test`. Each later phase adds one thing
  (hooks, evals, the split). No dependency is added: front-matter is parsed by hand as `check-name.mjs` already does.
- **Scalability / performance** — the gates run in 6 s today; the new ones read under 200 markdown files and add
  under a second. The drift hook reads `git ls-files` and the living docs once per commit. The JS budget runs
  postbuild, on Vercel too, as the shop budget does now.
- **Reliability** — a hook that fails by its own error lets the commit through and says nothing (Ekatan's rule: a hook
  that blocks on its own bug teaches everyone to disable hooks). Each gate has a test against a fixture.
- **Security** — the commit hook runs the repo's own scripts only. Evals run `claude -p` with read-only tools
  (`Read`, `Grep`, `Glob`, `Skill`), no Bash that writes, no network tools. Deny rules only remove abilities.
- **Motion and visuals** — n/a.
- **Unit economics** — evals cost model calls: about 8 scenarios × 2 sessions (answer + judge), run only before a MAJOR
  bump of one of four agents. No cost to merchants or to Frrata's hosting.
- **Storefront API** — n/a: nothing the API answers changes.
- **Blast radius** — every session's commits (the hooks) and every commit's `npm test` (the gates). Footguns, written
  before building: (a) a version-bump gate compared against a stale `origin/main` flags old edits, so it compares
  against the merge base and passes when `origin/main` is missing; (b) parallel lanes each bump the same skill and
  collide at merge — `release-agent` takes the higher version and bumps once more; (c) a gate must not match its own
  documentation (CLAUDE.md): `check:docs` and `check:skills` are run against this spec and against their own files
  before they land; (d) the commit hook must not run when the command is not a commit (`git commit-tree`, a message
  that mentions "git commit").

## Stress test (this spec's own)

| Severity | What | Where | Fix |
|---|---|---|---|
| High | A bump gate fails every lane at once on the day it lands, for edits already on `main` | `check-skills.mjs` | Compare against the merge base only: edits already on `main` are never re-judged |
| Medium | The journal mode fails today on `0123_partner_teams` | `drizzle/meta/_journal.json` | List it as applied in production in the gate, with the date; any new one fails |
| Medium | The drift hook stops 39% of commits | `doc-drift-hook.mjs` | Narrow `covers`; measure again after G2 and report the rate to the owner; if over 25%, it becomes a warning |
| Low | A pinned skill grows by one line on a parallel lane | `check-skills.mjs` | The pin is a ceiling; the lane moves a passage to a reference file or the owner raises the pin in writing |

## Out of scope

- Rewriting any rule inside a skill. G4 moves text; a rule that changes meaning is its own spec.
- Evals in CI, on every commit. Signal: an agent regression reaching a plan that its eval would have caught.
- Ekatan's planning loop as a whole: Frrata's loop (`frata-planning`) stays; it gains the four headings above.

## Facts used

- Ekatan's scripts and skills, read from `premabnrj-dot/ekatanv2` at ccf6161, 2026-11-16.
- Claude Code hooks: `PreToolUse` with `permissionDecision: "deny"`, and permission deny rules in
  `.claude/settings.json` — as used in Ekatan's settings file today; checked against Claude Code 2.1.325 installed in
  this session before G2 is built.
