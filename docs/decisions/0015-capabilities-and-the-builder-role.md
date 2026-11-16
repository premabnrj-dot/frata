# ADR-0015: Capabilities, and a Builder never sees orders, shoppers or costs

Status: **accepted** (owner, 2026-11-15: "builders approved"); **built** (T1c, 2026-11-15; § As built below); was proposed, revised after the architecture review 2026-11-12 (CHANGES NEEDED, folded in) (owner decision 2026-11-12: "builders don't see orders, shoppers or costs. Create a guardrail,
framework, safety, security to ensure we have proper system"; the framework below awaits the owner's sign-off and the
architecture, security and tenancy reviews) · spec `docs/specs/2026-11-12-studio-intake-and-team.md` (T1) · amends
ADR-0002 (tenant isolation) with a second axis: what a member may see inside one tenant.

## Context
ADR-0002 keeps one merchant out of another's data. Inside a shop, access is a role list per feature (`ANY_MEMBER`,
`CAN_BUILD`, `CAN_MANAGE`, `CAN_SET_COSTS`, `SHIPPERS`, `CAN_SEE_GST` in `src/domains/tenancy/roles.ts`), imported by
76 files and checked once, at `requireMember(allowed)`. A partner today is a full shop member: orders, shoppers'
details, costs before handover. Partner teams (spec T1) add people who build sites and should hold nothing else. A new
role added to the wrong tuple, a page that forgets its check, or a query called from a new place would leak orders,
shoppers' names, phones and addresses, or a merchant's costs, with nothing to catch it but review.

## Decision
1. **A new shop role, `builder`,** for a partner's Builders. Not in `ANY_MEMBER`, `CAN_BUILD`, `CAN_SET_COSTS`,
   `SHIPPERS`, `CAN_SEE_GST` or `CAN_MANAGE`. A partner's Owner and Leads keep the `partner` role.
2. **Capabilities are the one source of truth.** `roles.ts` gains `CAPABILITIES: Record<Capability, readonly
   MemberRole[]>` (for example `orders.read`, `shoppers.read`, `costs.read`, `catalogue.read`, `catalogue.write`,
   `settings.delivery`, `studio.build`, `studio.publish`, `exports`, `documents`). Today's tuples become views of it, so
   no file changes meaning on the day it lands. `builder` holds only `console.open`, `catalogue.read`,
   `studio.build` and `preview.read`.
3. **Sensitive data has three locks, any one of which refuses a Builder** (revised after the architecture review,
   2026-11-12: a setting-based policy could fail open, and costs are columns, not tables):
   - **Postgres, by grant (default deny).** `withTenant` takes an actor, never a role string: `{ member }` (from
     `requireMember`'s result, inside `asMember`), `{ shop }` (from the host) or `{ system, reason }`. For a Builder it
     runs `set local role frata_builder`: a role with grants on an **allow-list** of tables and columns (the
     catalogue's public columns, preview snapshots, Studio's own tables) and none on orders, shoppers, messages,
     logs, GST, offers, billing, analytics, or any cost column (`variants.unit_cost`, `order_lines.unit_cost`,
     `orders.cogs/forward_shipping/courier_cod_fee/gateway_fee`, `shop_settings.ship_cost_*`). Row security still
     applies on top. A new table or column is invisible to `frata_builder` until a migration grants it.
   - **Postgres, by policy.** `app_member_role()` = `nullif(current_setting('app.member_role', true), '')`, written
     `(select app_member_role())` so it runs once per statement. Role policies are `as restrictive` (permissive ones are
     OR-ed) and are allow-lists, so an unset role refuses. `check:tenant` learns restrictive role policies;
     `withAnalyticsTenant` sets the actor too.
   - **Definers.** Every SECURITY DEFINER that returns shopper, order or cost data (34 migrations; e.g.
     `app_notice_members`, `app_member_email`, `app_ekcode_*`) checks `app_member_role()`; the notice sender filters
     recipients per notice type by capability (`new_order` and `needs_you` never reach a Builder).
   - **Queries.** The actor rides on a branded `Tx`; sensitive `src/lib/queries/` functions call `assertCan(tx, cap)`.
     The `shop` actor holds only what a shopper may see of their own data (checkout, EkCode sign-in).
   - **Entry points.** Pages and actions call `requireCapability(cap)`. A Builder holds `console.open` and is never
     added to `CONSOLE_ROLES`; role `===`/`!==` comparisons outside `roles.ts` are refused by the gate.
     `costs.read` is a predicate (`seesCosts(role, hasOwner)`), not a list. Console navigation is drawn from the same
     table; hiding a link is never the lock.
4. **Default deny.** A role reaches a capability only by being listed. A new route segment, query module or table has
   no access until it is mapped.
5. **Builders' Studio sessions use preview data only:** a catalogue snapshot with no cost fields, and never orders or
   shoppers (Studio spec § Environment). The proxy pins the session's test key, bound to the preview snapshot; it
   refuses every shopper-session and order endpoint. A Builder cannot reach a live key. Code a Builder writes reaches
   shoppers only after a Lead or the Owner publishes it; the publish review, the router's CSP and the outbound limits
   are the lock there. `shopCached` runs only under the `shop` actor.
6. **Change control.** `CAPABILITIES` is pinned by a snapshot test; changing who holds `orders.read`,
   `shoppers.read`, `costs.read` or `exports` needs the owner's name and date beside the line, and the tenancy-auditor
   on the diff.

## Guardrails (each a gate or a test; nothing here relies on review alone)
| Guard | What fails |
|---|---|
| `check:capabilities` (new gate in `npm test`) | A sensitive query export without `assertCan`; a console page or action under a sensitive route without `requireCapability`; a role list in a feature file instead of a capability; an unmapped route segment |
| `check:tenant` (extended) | A `frata_builder` grant outside the allow-list; a role policy that is not `as restrictive`; `system` actor outside outbox, cron and webhook paths |
| Snapshot test of `CAPABILITIES` | Any change to who holds a capability (the diff is the review) |
| `verify:tenancy` (new section) | As `frata_builder`: every sensitive table and cost column refuses; each sensitive definer refuses; an unset actor refuses; a cross-partner assignment and a removed person are refused |
| e2e sweep `builder` | Signed in as a Builder, every console route not in its allowed list answers 404, every sensitive action refuses, nav shows only allowed items |
| `check:client-bundle` (existing) | A cost field in any browser chunk |
| `check:documents`, `check:payload` (extended) | An invoice, label, CSV or email built for a role without `documents` / `exports` |
| Audit | Each refusal is logged with member, capability and route (`member-audit.ts`); repeated refusals by one person alert the partner owner and Frrata |

## Consequences
- One file says who sees what; three independent locks enforce it; four gates and two proofs fail CI when a change
  breaks it.
- The tuples stay during the move (T1 migrates them to capabilities file by file; the gate's allow-list ratchets down
  like `check:feedback`'s).
- `set local role` and a stable role function per statement: negligible (architecture review); `speed-reviewer` measures
  it on the T1 plan.
- Support visits keep acting as the owner (ADR-0007); `builder` never gets a support path.

## Alternatives considered
- **Keep Builders as `partner` and gate only Studio.** Rejected: both reviews (2026-11-12) rank it a blocker.
- **A separate Studio login with no shop membership.** Rejected for now: the catalogue read, previews and handover all
  ride on membership; a second access model doubles what must be audited (KISS).

## As built (T1c, 2026-11-15; plan `docs/plans/2026-11-15-t1c-builders.md`, owner's answers 2026-11-15 "all recommended")
- **Capabilities:** `CAPABILITIES` in `roles.ts` holds `console.open`, `catalogue.read`, `preview.read` (a Builder's three)
  and one capability per old tuple (`shop.work` = ANY_MEMBER, `console.full` = CONSOLE_ROLES …), plus `api.manage` (lane
  A) and `content.write` (lane B). The tuples are views of it; the snapshot pins it. `studio.*`, `exports`, `documents`
  wait for the pages that need them (default deny).
- **Postgres, by grant:** `frata_builder` is its own LOGIN (owner question 7; `DATABASE_URL_BUILDER`), not a role
  `frata_app` sets, so a Builder transaction has no way back to `frata_app`'s rights. Column grants on eight catalogue
  tables, and (one-address P1·2, 2026-11-16) the live brand record and `shop_settings.logo_url` for Console › Brand's preview; `builder_rows` and restrictive `builder_only` policies (`app.member_role = 'builder'`).
- **Departures from § 3 and § 5, approved by the owner (2026-11-15):** (1) the legacy `withTenant(tenantId)` calls stay
  for every non-Builder actor: a Builder can never hold a tenant id, because its stores arrive in a separate list that
  `requireMember` never carries, and its Actor keeps the id private. (2) Definers: frata_builder may execute none (every
  definer revokes PUBLIC; § 82 checks every schema), so they need no role check of their own; the partner definers check
  the person's role themselves. (3) **The store preview runs the shopper read path as `frata_app`** (question 5): its
  output is what shoppers would see (drafts, availability after held pieces, best-seller order). (4) A refused page is
  its own panel, not a 404 (question 3). (5) Refusals are logged with ids only; the alert waits for C1 (question 2).
- **members.role** is derived from `partner_members.role` by trigger; `frata_app` holds no UPDATE on `members`.
- **Gates and proofs:** `check:capabilities`, `check:tenant` § 7b, `verify:tenancy` § 82, e2e `86-builders` (the sweep
  reads every page and route file).

## Amendment (§ 5, owner 2026-11-16: "approve all"; Studio spec decision 25; Studio plan V0·4; ADR-0020)
**§ 5 is replaced for Studio's agent.** The test-key proxy and the preview snapshot it described are not built; a
Builder's Studio turn runs as follows.
1. **Through `asTurn(turn, cap, work)`**, the second sanctioned Actor maker beside `require-capability.ts`, pinned in
   `check:capabilities` and listed in `check:actions` beside `asMember` (ADR-0020 point 4). The turn comes from Frrata's
   own open-turn row, never from a webhook or a tool's input; `app_turn_actor` re-checks the membership, the partner's
   link, the assignment and the partner's passkey step-up in its own short transaction, which then closes.
2. **Every read tool runs as `frata_builder`, whatever the person's role:** the catalogue's public-page columns, drafts
   included, outside any transaction, through `withActor`. Never orders, shoppers, costs or members (§ 3 unchanged).
3. **Builders propose and apply nothing.** Every propose tool (content, brand words, tokens, logos) refuses a Builder's
   turn; Apply, Send, Publish and Hand over are refused to a Builder in words. A Builder's turn gets the read tools, the
   sandbox and `preview_build`.
4. **Studio's rows are written by definers keyed on the turn**, never by the Builder's role (which executes no definer:
   § As built, departure 2). A Builder selects only its own partner's sessions and messages for that store.
5. **The session reads the store with a build key** held in the session's vault and sent as a header (ADR-0018's
   build-key amendment), never a live key.
6. **Unchanged:** code a Builder writes reaches shoppers only after a Lead or the Owner publishes; `shopCached` runs
   only under the `shop` actor; no capability is added (Builders preview checkout's design only: one-address decision 9).
