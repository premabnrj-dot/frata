---
name: frata-planning
description: Use when planning any Frata feature, enhancement, redesign or connector - before writing a spec or plan, before executing one, and when closing one - to run the spec, research, design review, mockup, sign-off, plan, execute and document loop, with the review headings (UI/UX, tenancy, modularity, SSOT/DRY, YAGNI, KISS, performance, reliability, security, motion and visuals, unit economics, blast radius).
metadata:
  version: 2.6.0
  verified: 2026-11-11
  decisions: [ADR-0001]
---

# Frata planning

No feature is executed before its review and mockup are signed off (ADR-0001).

## The owner's rules (2026-11-06, 5–6 added 2026-11-07) — every plan obeys all six

1. **Phased, mockup first.** Every plan is cut into phases a merchant could use
   on their own. Each phase opens with an HTML mockup published as an artifact
   for the owner to approve; nothing in a phase is built before its mockup is
   approved. A roadmap names the phases; each phase gets its own spec.
2. **Research before UX, then keep what was learned.** Research thoroughly
   (products + published UX research such as Baymard) before drawing. Every
   change the owner approves that is a reusable rule goes into
   `frata-design-language` (or the matching skill) in the same commit as the
   spec, with a version bump.
3. **Review before executing.** After sign-off and before the first line of code,
   run the review (§ 3) and the agents: `architecture-reviewer`, `tenancy-auditor`
   when data is touched, `speed-reviewer` when a page, query, cache or
   background job changes, `security-reviewer` when an action, route, webhook
   or merchant content changes, `unit-economics-reviewer` when money moves. Every
   finding is fixed in the plan or accepted by the owner in writing.
4. **Stay on the product goal.** Every spec opens with which ranked problem it
   moves (§ North star) and how we will know. Work that moves none waits.
5. **Testing, cross-module impact, tech debt, maintainability come first.**
   A plan opens with the regression net for what it changes (e2e flows for the
   flows it touches, unit tests for the engines) BEFORE the change; every task
   ends with its tests and `impact-reviewer` on its diff; no task leaves a
   second copy of a fact, a jsonb field used as state, or an untested path that
   moves money, stock or state.
6. **Record every accepted practice; automate every repeated chore.** Each
   plan has a "Practices recorded in skills" section (UI/UX, performance,
   architecture, testing) landed in the same commit, with version bumps. Work
   done by hand twice becomes a script when it is checkable (a gate) or an
   agent when it needs judgement (`.claude/agents/`), listed in the plan's
   "Repetitive work → agents and scripts" table.

## North star

Frrata is **the commerce backend for Indian D2C brands** (owner, 2026-11-11; ADR-0014). A brand runs its business
in the console; its website is code that a developer, a partner or Frrata's agent builds on the Storefront API.
Frrata keeps what makes the brand money: catalogue, checkout, COD, payments, orders, shipping, GST — so a brand
**keeps more profit per delivered order**. The ranked problems: (1) COD/RTO losses, (2) size and fit returns,
(3) catalogue operations, (4) mobile checkout conversion, (5) a premium storefront, now built as code by developers,
partners or the agent (partners get the builder first), (6) true profit per order, (7) festive-peak reliability.
Themes are retiring: no new theme work. The roadmap is `docs/plans/roadmap.md`.

## When this applies

| Work | Spec | Review + mockup | Plan |
|---|---|---|---|
| New feature, page, flow, connector, schema change | yes | yes | yes |
| Enhancement that changes what a merchant or shopper sees | short spec | yes | yes |
| Refactor across modules, no visible change | short spec | review only, mockup `none` | yes |
| Bug fix, one-file change, copy fix | no | no | no — the commit says why |

## The loop

Copy into the conversation and tick as you go:

```
- [ ] 0 GOAL      which ranked problem this moves, and the measure (North star)
- [ ] 1 SPEC      docs/specs/YYYY-MM-DD-<topic>.md (template below), one per phase
- [ ] 2 RESEARCH  how 2–3 strong products do this job; what the codebase already has
- [ ] 3 REVIEW    every heading below, written into the spec
- [ ] 4 MOCKUP    HTML mockup published as an artifact, link in the spec — Rule 0 (frata-design-language):
                  no explanatory text on any screen; cut every sentence not required
                  (node scripts/check-mockup.mjs <file> first: no overflow, no errors)
- [ ] 5 SIGN-OFF  owner approves → spec status: active; approved rules → frata-design-language
- [ ] 5b REVIEW   agents run on the plan (rule 3); findings fixed or accepted
- [ ] 6 PLAN      docs/plans/YYYY-MM-DD-<topic>.md: tasks, each with its verify command
- [ ] 7 EXECUTE   task by task; run and read each verify command (frata-verify);
                  impact-reviewer on each task's diff before its commit
- [ ] 8 DOCUMENT  skills/rules the change touched updated, version bumped
- [ ] 9 CLOSE     spec status: built, plan status: done
```

**Never start 7 before 5.** If the owner is away, stop at the mockup and say so.

## Step 2 — research

**Current sources only (owner, 2026-11-06).** Every fact used in a plan comes
from a source published or updated in the last 12 months, with that date
written next to it. Check the page's own date, not a search snippet. If only
an older source exists, write "no current source found" and treat the point
as unverified — never cite it as current. Briefs to research agents say this
in their first lines.

- **Products**: name the job in one sentence, then look at how Shopify admin,
  one Indian tool (GoKwik, Shiprocket, Razorpay dashboard, Interakt) and one
  best-in-class product (Linear, Stripe dashboard) do it. Write "Taken:" for each.
- **Code**: search for the noun in `src/domains` and `src/lib` first. Most "new"
  needs are an option on something that exists.
- **Third-party facts**: anything about Meta, Google, Razorpay, Shiprocket or
  WhatsApp terms → `frata-integrations`; if its date is older than 90 days, run
  the `integration-researcher` agent before designing on it.

## Step 3 — the design review

Answer every heading. "n/a" says why. A review that says "yes" to each is not done.

- **UI/UX** — the job and the one primary action; who reads it (merchant
  console or shopper storefront — they share neither look nor gate); its states
  (empty, loading, error, one, many, no permission, phone); what changes after
  each action; keyboard path and labels; built from `frata-design-language`
  primitives. Norman's checks: signifiers, mapping, constraints over refusals,
  undo, the merchant's model (orders, deliveries, payouts — not our tables),
  good defaults, feedback after every action, recognition over recall,
  error prevention before error messages (Norman, *The Design of Everyday Things*).
- **Tenancy** — every new table: `tenant_id`, grant, RLS, policy, in one
  migration. Every read: through `src/lib/queries/` with `withTenant`. Where the
  tenant id comes from. Run the `tenancy-auditor` agent on the plan.
- **Modularity** — pure engine in `src/domains/`, reads in `src/lib/queries/`,
  mutations in `actions.ts`, rendering in `_components/`. Which module it extends.
- **SSOT / DRY** — list every fact the feature stores or computes; where it is
  computed, once, and who reads it. Money is paise. State is derived from timestamps.
- **YAGNI** — what is deliberately left out, and the signal that brings it back.
- **KISS** — the simplest version in one paragraph; each new dependency, table
  or abstraction has a line on why existing ones do not do.
- **Scalability** — what breaks at 500 tenants and 10× festive traffic: table
  growth, indexes, per-tenant hot spots. Background work: write down batch size
  × runs per day against 10× peak (a daily cron is a safety net, never the main
  path: drain after `enqueue`). Pool: instances × `max` against Supavisor's
  client limit.
- **Performance and speed** — at a 10× seed (600 products, 150k orders in one
  shop), write each of these into the spec (budgets: `frata-architecture` § Speed):
  (a) the statements each page runs, in order; independent ones share ONE
  `withTenant` with `Promise.all`; no cached loader or second `withTenant`
  inside a transaction; (b) EXPLAIN of every new query: no seq scan on
  `orders`/`order_lines`/`variants`, under 100 ms; (c) the bytes of each cached
  entry (under 1 MB; Next refuses over 2 MB and silently stops caching);
  (d) the HTML + RSC bytes of the largest shop page it changes (under 300 kB
  raw; lists are paged, never "the whole catalogue"); (e) what each write
  invalidates, by tag; a shopper's action purging a whole shop is a finding;
  (f) first-load JS against the surface's budget; (g) what is preloaded or
  `priority` (one font, one image per shop page).
- **Reliability** — every outbound call through `fetchWithTimeout` and the
  outbox; what a merchant reads when it fails; whether a retry is safe.
- **Security** — for each action or route: who may call it (the tuple, and
  whether the tuple's documented meaning covers this action); whether they may
  touch THIS row; Zod input with length caps; the reply, named fields only; its
  rate limit, the subject it counts (IPv6 per /64) and whether it fails closed
  (fail closed where someone could be guessing). Webhooks: raw-body HMAC, a
  size cap before parsing, our idempotency key, the payload trimmed to what
  reconciliation needs once processed. Merchant content: where it renders
  (shop, Console, Admin, the preview frame on the console origin) — never as
  HTML, links as shop paths. Secrets: server only, one owner module, sealed per
  shop and field. PII: where it is stored, how long, who reads it (support
  visits included), what the logs carry (an error's name or code, never the
  raw error). Environments: a preview never holds production credentials.
- **Motion and visuals** — which pattern in `frata-design-language` § Motion
  each change uses (no new duration or easing); what a phone shows on enter and
  exit; reduced motion. For each new screen: what a picture would say better
  than the words (a pictogram, a three-step journey, a small diagram, an icon
  per row), and what can leave the screen (help into an (i) tip, a checklist
  collapsed to its count). No Unicode glyph stands in for an icon.
- **Unit economics** — does it change what a merchant pays, what Frata pays
  (WhatsApp, Vercel, Supabase), or the profit formula? Run `unit-economics-reviewer`.
- **Theme blocks** (Theme Studio) — a new block or token: additive only (a breaking change is a new kind),
  ids stable across versions (a minor only adds: `themeCheck(m, previous)`), every photo-bearing fill kind in
  `cleanImages`, page limits in `designProblems`, nothing a shop shows that the owner didn't write or choose.
- **Blast radius** — every caller of what changes; shared resources (middleware,
  pool, layout, tokens); footguns written down before building.

## Spec template

```markdown
# <Topic>
Status: draft | active | built · Date: YYYY-MM-DD · Mockup: <artifact link> · Approved: <who, date>

## Goal         which ranked problem (North star) and the measure
## Job          one sentence: who, what, why now
## Research     products looked at, each with "Taken:"
## Design       the screens and flow, linked to the mockup
## Design review  every heading from frata-planning § 3
## Out of scope   with the signal that brings each back
## Facts used     third-party facts with source and date
```
