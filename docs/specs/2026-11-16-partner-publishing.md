# Partner publishing after handover
Status: draft · Date: 2026-11-16 · Mockup: not yet (one per phase, below) · Rule: ADR-0014 amendment 9 (owner,
2026-11-16: "yes. record and plan.")

## Goal
Ranked problem 5, a premium storefront built as code by partners: a brand's website keeps getting better after
handover without the owner reviewing every change. Measures, once V2 hosts sites: median days between a partner's
publishes on handed-over shops (target: no slower than before handover); share of free publishes undone within 7 days
(< 5%; above it, the default turns to "Ask me first"); sensitive changes that shipped without the owner's yes (0).

## Job
After handover the owner picks, per partner, whether that partner publishes freely or asks first, so partners can add
pages and redesign whenever they like while the risky changes always reach the owner.

## The rule (ADR-0014 amendment 9)
| | Before handover | After, "Publishes freely" (default) | After, "Ask me first" |
|---|---|---|---|
| Code publish (pages, layout, redesign) | Partner, checks pass (amendment 6) | Partner, checks pass; owner told with Undo | Waits for the owner's approval of that version |
| Content (words, menus, FAQ, banners) | Partner saves live | Partner saves live; owner told (amendment 8) | Same as freely: content is not a publish |
| An outside script or service | Checks only | **Owner's yes** | **Owner's yes** |
| Policy pages, legal details | Partner | **Owner's yes** | **Owner's yes** |
| The site's domain (Website setting) | Partner (no owner yet) | **Owner or Manager only** (already so: `mayManageApi`) | Same |
| Prices, stock, orders, shoppers, payments, costs | Never through the site | Never | Never |

## What exists today (checked 2026-11-16)
- Policies (`policies` section and the policy texts, `policy.edit`), **Business and GST** and **Contact and grievance
  officer** are `CAN_BUILD` (`src/domains/settings/sections.ts`, `src/app/(console)/console/settings/actions.ts:111`):
  a partner edits them after handover today. **This is the gap PP1 closes.**
- The Website setting and keys: a partner only while the store has no owner (`mayManageApi`,
  `src/domains/storefront-api/keys.ts`). A custom domain is `CAN_MANAGE`. Already matches the rule.
- Code publishing, the publish gate, `site_deployments`, rollback: none yet (V2, kit spec §§ 4–6). A site today is a
  repository its builder deploys (the pilot: Frrata builds House of Ayuda and the owner reviews; unchanged).

## Phases
### PP1 — Policies and legal details after handover (console; can ship before V2)
- After a store has an owner, a partner member cannot save the Policies section, the policy texts, Business and GST,
  or the grievance officer. Before handover, unchanged. Enforced where the section's `editors` are read (page, save,
  upload), through one pure test beside `seesCosts`: `maySaveSensitive(role, hasOwner)`, read with `hasOwnerIn(tx)`
  inside the save's transaction (fails closed).
- The partner sees the section read-only with one line and an **Ask the owner** button: it sends the owner an Inbox
  line naming the section and the partner, with a link to it. (The owner edits it. No queue of proposed text: YAGNI
  until partners ask for it.)
- Mockup: the section as a partner sees it after handover; the owner's Inbox line. Phone and desktop.
- Tests: unit (`maySaveSensitive` against every role × hasOwner); e2e on a handed-over store (partner refused in
  words, owner saves); `check:capabilities` row.

### PP2 — The choice per partner (lands with V2's publishing)
- Settings › People, on a partner's row: **Publishing** — "Publishes freely" / "Ask me first". Owner or Manager
  (`shop.manage`); a support visit never changes it; audited. Stored as one timestamp on the store's partner link
  (`partner_links.publish_asks_since`, null = freely; derived, never a status column), with `publish_asks_by`.
- Built only when there is something to publish: V2's publish gate and `site_deployments`. Until then the row would
  switch nothing (YAGNI).

### PP3 — Free publishes, told after, with Undo (V2)
- The gate classifies each version against the live one: **ordinary**, or **needs the owner** when the build output
  adds a host to the scripts, connections, frames or images it loads (CSP and the outbound allow-list, kit spec § 4),
  or when the publish would change the domain. A version that needs the owner waits whatever the partner's choice.
- A free publish writes its `site_deployments` row (cause `partner_publish`, approval null, the choice in force) and
  enqueues one Inbox line to the owner (ADR-0006): who, what changed (pages added or removed, from the build's route
  list), a signed preview link, **Undo**. Undo = rollback to the previous kept deployment, owner or Manager, one tap,
  its own row; a rollback never removes a Frrata patch-lane fix (lane 1 lands on the live branch, kit spec § 5).
- "Ask me first": the same line says **Review and publish**; the owner approves that exact deployment id.
- Mockup: Settings › People's Publishing control; the Inbox lines (published, waiting, needs your yes); the review
  screen; Undo's confirm and its result. States: waiting, published, undone, refused by checks, a partner removed
  mid-review (the version is dropped).

## Design review
- **UI/UX:** three moments, each one primary action: Ask the owner (PP1), choose Publishing (PP2), Undo or Review
  (PP3). States as listed per phase. Words: "Publishes freely", "Ask me first", "Undo", no jargon about deployments.
- **Tenancy:** no new table. PP2 adds columns to `partner_links` (tenant table, RLS already on); PP3 uses V2's
  `site_deployments` (its own spec). Tenant id from `requireMember` only. `tenancy-auditor` on each phase's plan.
- **Modularity / SSOT:** the rule is one pure function in `src/domains/partners/` (who may publish what, given role,
  hasOwner, the choice, the version's class); the console, the gate and the e2e read it. The choice lives once on the
  link. "What changed" is derived from the two deployments, never stored as text.
- **YAGNI:** no proposed-text queue for policies, no per-page approval, no per-partner budget. Signals: partners ask
  to suggest policy text; owners undo > 5%.
- **KISS:** one column, one classifier, one Inbox line; Undo reuses rollback.
- **Scalability / speed:** one Inbox line per publish (a partner publishing often is rate-limited to one line an hour
  per partner, collapsed, as content saves are); no page gains a query beyond the link already read.
- **Reliability:** the Inbox line and the rollback go through the outbox; a failed rollback says so and leaves the
  live version serving.
- **Security:** the choice is `shop.manage`, audited; the classifier runs in Frrata's gate on build output, never the
  site's own copy; an outside host can never ship without the owner; removing a partner drops its waiting versions.
  `security-reviewer` on PP1 and PP3 plans.
- **Motion and visuals:** existing toast and dialog patterns; no new motion.
- **Unit economics:** none (no price change; publishes are already in V2's metering).
- **Blast radius:** PP1 changes four settings sections' editors for partners after handover; every caller of
  `editors` (page, save, brand upload) is checked in its plan. Partners on stores already handed over lose those
  saves the day PP1 ships (decision 4 below).

## Owner decisions open
1. PP1: is "read-only with Ask the owner" right, or should the partner's edit wait as a proposal the owner accepts?
   (Recommended: read-only; simpler, and policy changes are rare.)
2. PP1: are the grievance officer's details "legal details"? (Recommended: yes, the E-Commerce Rules require them.)
3. When to build PP1: now, as a small console phase, or with V2. (Recommended: now; it closes today's gap.)
4. Tell partners on stores already handed over before PP1 ships? (Recommended: one line in their workspace.)

## Out of scope
- Brands publishing with Frrata's agent themselves (ADR-0014 decision 4: later, once partner quality is measured).
- Builders (ADR-0015) publishing: unchanged, never.
