# Frrata Sites — storefronts as code, built by developers and agents
Status: direction accepted (owner 2026-11-11: north-star wording, partners get the builder first, themes retire; ADR-0014) — each phase still gets its own spec, mockup and reviews · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/K8QusFghYyKYsYtU678huQ (docs/mockups/2026-11-11-agentic-storefront.html)
· Approved: —

Owner (2026-11-11): "developers would be the core client who'll be developing, maintaining their sites; we could grow to
agentic frontend on top of our storefront APIs, like Replit or Lovable; clients have our console system and
integrations; no concept of themes with customization any more; a themes gallery, all agentic, that clients can reuse;
partners should be able to build it." Asked: what goes, what is adopted, security and safety, the mockup.

## Goal
Changes the north star (owner's decision, not this spec's): Frrata becomes the commerce backend; the storefront is code.
Proposed wording in the mockup. Ranked problems kept: (1) COD/RTO, (2) size returns, (3) catalogue operations, (4) mobile
checkout, (6) profit per order, (7) festive reliability stay Frrata's; (5) a premium storefront moves to code built by
developers, partners or Frrata's agent. Measures per phase are in § Phases.

## Job
A brand (or its developer, or a partner) gets a website that is entirely its own code, built by hand or by an agent from
a starter, while the brand runs the business in Frrata's console and every rupee passes through Frrata's checkout.

## What stays · goes · comes
See the mockup (with file counts). Stays: console, integrations, catalogue, offers, checkout and order pages, EkCode,
ADR-0002/3/4/6/8. Goes (frozen at V0, removed at V5): theme catalogue and manifests, the customizer and Look, Theme
Studio TS1c–TS4, ADR-0012, the section renderers once every shop has moved, Admin theme releases, pages as data.
Comes: the Storefront API (un-parked from `docs/specs/2026-11-11-storefront-api.md`), one repo and one isolated
deployment per shop, the builder, the gallery of agentic starters, developer access, publish checks.

## Design (summary; each phase gets its own spec, mockup and reviews)
- **Boundary.** A site is a separate deployment with no database credentials and no secret: one public storefront key
  (read-only, its shop fixed when made), plus the cart link into Frrata's checkout host. Checkout, payment, sign-in and
  any form that holds personal data stay on Frrata.
- **Repo per shop.** Git is the source of truth: every agent turn is a commit on a draft branch; publish = a deployment
  of a commit that passed the checks; rollback = redeploy an earlier one. Developers can clone and push.
- **The builder.** Chat beside a live preview (phone/desktop), code and diff views, checks, credits. The agent runs in a
  per-session sandbox: the shop's repo, a package mirror on an allow-list, the Storefront API with a test key; nothing
  else on the network; no console data beyond the catalogue the shop shows. Publish is a human click.
- **Agentic starters.** A repo + design rules + an agent skill (+ screenshots, licences). Updates ship as skills and
  migrations the agent applies on request, never files that overwrite a brand's code.
- **Publish checks.** Build; speed and accessibility on the phone; the legal block (E-Commerce Rules 2026, in force
  2027-01-01); secret scan (only the public key may appear); package allow-list and audit; outbound hosts limited to
  Frrata's API, media and checkout.

## Design review (headline answers; full review per phase)
- **UI/UX:** builder, gallery, Website, publish dialog, partner starters drawn; Rule 0 holds on every screen.
- **Tenancy:** the key is a third tenant source (ADR-0002 amendment, already drafted for SA0); sites hold no DB access.
- **Modularity:** Storefront API mappers in `src/domains/storefront-api/<version>`; hosting and builder as their own
  modules behind the outbox; nothing generated is imported by the app.
- **SSOT:** the catalogue, prices, availability and the legal block are computed once in Frrata and read by sites.
- **YAGNI:** no GraphQL, no write API beyond the cart link until a site asks, no marketplace payments until V4's signal.
- **KISS:** V1 is SA1 as already specified; V2 adds hosting; V3 adds the agent on top of V2.
- **Scalability:** cost per hosted site and per agent turn are the hypotheses to measure (unit-economics review).
- **Speed:** a site's speed becomes the site's; checks hold a floor before publish; the API is CDN-cached (SA1 design).
- **Reliability:** checkout works whatever a site does; deployments roll back; hosting calls go through the outbox.
- **Security:** the threat table in the mockup; the security-reviewer and tenancy-auditor run on each phase's spec.
- **Unit economics:** agent tokens, sandbox minutes, builds and hosting per shop; credits per plan; reviewer before V2.
- **Blast radius:** themes keep running for every shop until V5; no shop's site changes without a publish.

## Phases
| Phase | What people get | Kill signal |
|---|---|---|
| V0 | Owner's decision (ADR-0013, north star, CLAUDE.md); Theme Studio frozen | — |
| V1 | Storefront API SA1 (read, cart link), keys, docs, a starter repo | < 3 external sites live in 90 days |
| V2 | Repo + isolated deployment per shop on Frrata's hosting; domains, previews, rollback, checks | Hosting cost per shop above what plans recover |
| V3 | The builder (chat, preview, files, checks, credits) | Agent-built sites slower or less accessible than the starter |
| V4 | The gallery: partner starters, review, revenue share | < 5 partner starters listed in 120 days |
| V5 | Live looks turned into code; themes removed | — |

## Open questions for the owner
1. The north-star wording. 2. Builder for brands with no developer from day one, or partners first. 3. Hosting: a
project per shop on Frrata's Vercel team, or Cloudflare Workers for Platforms. 4. Existing looks: converted at V5 or kept.
5. Partners' money: revenue share, listing fee, or free starters.

## Out of scope
Code running inside Frrata's own runtime (rejected 2026-11-11 research, option C); generated payment pages; shopper
personal data held by sites; image generation.

## Facts used
See the research section of the mockup (dated sources) and `docs/research/2026-11-11-claude-builder.md`.

## Review findings (2026-11-11) and where each went
Five reviews on the plan (security, tenancy, architecture, speed, unit economics); full scenarios, controls and the
reordered phases: https://claude.ai/artifact/CukynMkEPgQcqWg8m8ZATW (docs/mockups/2026-11-11-studio-hardening.html).
Status: findings recorded, not yet folded into a revised design; the owner decides the six questions there first.
- **Blockers:**
  - Partner code beside checkout cookies: `__Host-` cookies, exact-Origin checks, sites and previews on domains
    Frrata never uses.
  - "No personal data" enforced only by the site's code: Frrata-owned headers and runtime egress at the hosting layer.
  - One partner login publishes to every client: two-factor, re-auth on publish, owner-granted per-client scopes,
    approval bound to the commit.
  - Removing a partner leaves routines, keys and sessions alive: one definer transaction revokes all; run-time
    membership re-check.
  - A law change would need 1,000 publishes: legal block and content served at runtime; a "Frrata patch" lane
    (ADR-0014 exception).
  - Hosting undecided: a hosting ADR amending ADR-0005 (a separate account Frrata owns and runs, brands need none;
    adapter, edge router, repos by site id; ADR-0014 amendment 4, wording 2026-11-12).
- **High:**
  - Studio resolves the shop from the session, never the shop cookie.
  - The proxy pins the session's key.
  - Skills are read-only in sessions; learned facts per shop.
  - Partner credits in a partner ledger, not tenant rows.
  - A closed package mirror and no DNS in the sandbox.
  - Routines' 2 am rules.
  - Credit fraud and free-tier farming controls.
  - WhatsApp approval links: owner-only, never act on open.
  - The kit's release integrity, minimum version and 24 h patch target.
  - API caches 900 s with tag purges.
  - Builds on publish only; a global turn queue.
  - Attribution and the brand kit kept single-source.
- **Pricing (3×):** a credit is ₹6.33 of measured cost (tokens, sandbox seconds, build minutes), sold at ₹19, estimate
  first, charged on actuals. Seats and credits are excluded from the partner share. Hosting allowances are re-sized
  after the host is chosen, with images on storage with no egress fee.
- **In today's code (separate from Studio):** fixed 2026-11-11: placement waits ≤ 2 s for a lock and a shop places ≤ 8
  orders at once (busy → 503, the try given back to the limits); the sold-out purge debounced across instances; the
  quote's reads together, its cached collection members read after its transaction. Fixed 2026-11-12: a payment
  landing, a switch to pay on delivery and a retried payment share the slots and the 2 s wait; a capture is recorded
  before it can be busy and keeps its hold; a passing error leaves the event for the 5-minute drain; the order page
  says "confirming". Open: previews hold production data (S1); staff sign in with an email code only.
