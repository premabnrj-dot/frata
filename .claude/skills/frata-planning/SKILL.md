---
name: frata-planning
description: Use when planning any Frata feature, enhancement, redesign or connector - before writing a spec or plan, before executing one, and when closing one - to run the spec, research, design review, mockup, sign-off, plan, execute and document loop, with the review headings (UI/UX, tenancy, modularity, SSOT/DRY, YAGNI, KISS, performance, reliability, security, unit economics, blast radius).
metadata:
  version: 2.0.0
  verified: 2026-11-06
  decisions: [ADR-0001]
---

# Frata planning

No feature is executed before its review and mockup are signed off (ADR-0001).

## The owner's rules (2026-11-06) — every plan obeys all four

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
   when data is touched, `unit-economics-reviewer` when money moves. Every
   finding is fixed in the plan or accepted by the owner in writing.
4. **Stay on the product goal.** Every spec opens with which ranked problem it
   moves (§ North star) and how we will know. Work that moves none waits.

## North star

Frata exists so a small Indian fashion brand **keeps more profit per delivered
order** without a developer. The ranked problems: (1) COD/RTO losses, (2) size
and fit returns, (3) catalogue operations, (4) mobile checkout conversion,
(5) a premium-looking storefront, (6) true profit per order, (7) festive-peak
reliability. The roadmap is `docs/plans/roadmap.md`.

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
- [ ] 4 MOCKUP    HTML mockup published as an artifact, link in the spec
- [ ] 5 SIGN-OFF  owner approves → spec status: active; approved rules → frata-design-language
- [ ] 5b REVIEW   agents run on the plan (rule 3); findings fixed or accepted
- [ ] 6 PLAN      docs/plans/YYYY-MM-DD-<topic>.md: tasks, each with its verify command
- [ ] 7 EXECUTE   task by task; run and read each verify command (frata-verify)
- [ ] 8 DOCUMENT  skills/rules the change touched updated, version bumped
- [ ] 9 CLOSE     spec status: built, plan status: done
```

**Never start 7 before 5.** If the owner is away, stop at the mockup and say so.

## Step 2 — research

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
  growth, indexes, pool size, per-tenant hot spots, background-job backlog.
- **Performance and speed** — at festive volume (seed 10× a normal week): round trips per
  request, indexes on what is filtered, storefront cached, console under 1 s.
- **Reliability** — every outbound call through `fetchWithTimeout` and the
  outbox; what a merchant reads when it fails; whether a retry is safe.
- **Security** — each action/route: who may call it (`check:actions`), whether
  they may touch THIS row, what it accepts (Zod), what it returns. Webhooks:
  signature on the raw body. Secrets: server only, one owner module.
- **Unit economics** — does it change what a merchant pays, what Frata pays
  (WhatsApp, Vercel, Supabase), or the profit formula? Run `unit-economics-reviewer`.
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
