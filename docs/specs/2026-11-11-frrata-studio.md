# Frrata Studio — the agentic builder (partners first)
Status: draft plan for the owner (UX, possibilities, limits, pricing); nothing is built · Date: 2026-11-11 · Mockup:
https://claude.ai/artifact/DJg1R1FPkY4aacE5CDC64J (docs/mockups/2026-11-11-frrata-studio.html) · Approved: —
Direction: ADR-0014 (owner 2026-11-11: north star accepted; partners get the builder first; themes retire). Parent:
`docs/specs/2026-11-11-agentic-storefront.md` (phases V0–V5; Studio is V3, after the API V1 and hosting V2).

## Goal
Ranked problem (5) a premium storefront, now built as code; partners as the distribution (roadmap row P). Measures:
time from a client's brief to a published site; share of Studio sessions that end published; checks scores of
Studio-built sites against the starter's (must not be worse); credits per published page; partner retention at 90 days.

## Job
A partner builds and keeps every client's website by asking an agent, watching it work beside a live preview,
steering it, reviewing the draft as code or as pages, getting the client's yes on a phone, and publishing.

## Research (dated; see the mockup's research table)
Claude Code cloud docs (sessions, environments, agent view, permission modes, routines; read 2026-11-11) · Claude
Agent SDK terms (API billing, no Claude sign-in or Claude Code name for third-party products) · Shopify Storefront
API/Oxygen/Plus (2026-10, 2026-11-09) · Lovable, Framer, Bolt, v0, Replit pricing (live 2026-11-11) · Anthropic
pricing (live 2026-11-11) · Vercel Sandbox and pricing (2026-09) · Cloudflare Workers (2026-10-02) · Indian price
points (Shopify India, Shiprocket, GoKwik, 2026).

## Design (12 screens in the mockup)
1. **Inbox** across clients: Needs you · Working · Ready to review · Done; a phone push on "needs you".
2. **New session**: client, start from (live, a draft, a starter), prompt with attachments, the autonomy dial (Plan
   first · Ask before each page · Build freely), one run or three variants, preview data, a credit cap and estimate.
3. **Plan to approve**: files it touches, its credits, its questions (tap to answer); approve, edit, keep planning.
4. **Session at work**: activity stream (read, edit, build, screenshot, check), queued messages, "point at the page"
   pins, todos, checks, reviewers (subagents) on the right; the dial can change mid-session; Stop.
5. **Review**: code diff and before/after pages; a line comment or a pin goes to the agent with the next message.
6. **Variants**: three drafts in three sandboxes, compared; keep one.
7. **Client approves**: Frrata's WhatsApp transactional message → a signed preview → pins and sentences become the
   agent's next task; Approve.
8. **Routines**: a saved prompt + a trigger (schedule, hourly at most; or a Frrata event) → a draft → checks → a person,
   or publish if the partner allowed it for that routine.
9. **Brand brain**: brand.md (read every session), skills stacked Frrata → starter → agency, reviewers, learned facts a
   person keeps.
10. **Environment**: preview data (catalogue read-only; never orders or customers), outbound allow-list, packages
    (allow-list, a day's wait, no install scripts), keys added by a proxy, domains, who publishes.
11. **Developer**: clone, `npx frrata dev` with the test key, pull a session, push; every push gets a preview and the
    same checks; a branch can be handed to the agent.
12. **Credits**: by client and session, reserved per turn and returned on failure, caps, the client's invoice option.

## Possibilities and limits
In the mockup, with the reason and what would lift each limit. By design (stay): no database or server of the site's
own; checkout, payment, sign-in and personal data on Frrata; the agent never changes prices, stock, products or
orders; outbound calls only to Frrata, its media and allowed fonts. Policy: package allow-list, a person publishes,
the checks' floor. Cost: sessions at once, minutes a turn, routines hourly. Phase: no image generation; brands after
partners.

## Pricing (hypotheses; unit-economics review before V2 and V3)
| Figure | Value | Source · date | Test |
|---|---|---|---|
| Storefront API for shopper traffic | Included, no per-call fee; rate limits per key and IP | Shopify, BigCommerce (2026) | API traffic → orders per shop |
| Hosting | In the plan: Launch 50 GB + 100 build min, Growth 200 GB + 300, Scale 1 TB + 1,000; then ₹40/GB, ₹4/min (3×) | Vercel Pro overage, Cloudflare (2026) | Bandwidth and build minutes per shop, month 1 |
| Cost per credit (one ordinary turn) | ≈ ₹6.2 (model ₹4.0, sandbox ₹1.0, build and checks ₹1.2) | Anthropic, Vercel Sandbox (2026); ₹88/$ | Cost ÷ credits used, monthly |
| Price per credit | ₹19 for ₹6.33 of **measured** cost (tokens, sandbox seconds, build minutes) — 3× by construction (owner rule 2026-11-11); review: a "turn" costs ₹5–150, so per-turn pricing fails 3× | owner, unit-economics review 2026-11-11 | The 20-task cost proof before V3 |
| Studio seats | Partner free 10 credits (acquisition cost ₹62); Studio ₹2,999 / 150; Studio Plus ₹9,999 / 500; packs ₹1,900 / 100 — each seat ≥ 3× the cost it includes | owner rule; Indian tool band ₹0–3,000 | Seats bought by the first 20 partners |
| A new page | 10–30 credits (₹190–570) | 2026-11-11 research ₹80–170 cost | First 50 pages |
| Gallery | Free starters at V4; paid later, partner keeps 85% | Shopify 15% (2026) | Starters listed, 120 days |

## Design review (headline; each build phase gets the full review)
- **UI/UX:** Rule 0 on every screen; states drawn: needs you, working, ready, failed check, cap reached, phone.
- **Tenancy:** a session acts for one shop; its tools take ids under that shop; the preview's key is the shop's test
  key; Studio rows (sessions, routines, credits) are tenant rows with RLS; a partner sees only linked clients.
- **Security:** agent outside the sandbox; keys by proxy; egress allow-list; draft branches only; a person publishes;
  previews on their own origin, signed; reviewers include security; injection treated as unsolved.
- **Reliability:** credits reserved before a turn (ADR-0006/0008); a failed turn returns them; sandboxes are disposable,
  the repo is the truth.
- **Scalability:** sessions at once per seat; routines hourly at most; builds queued per site.
- **Unit economics:** the table above; `unit-economics-reviewer` before V3.
- **Blast radius:** none on today's shops until V2 hosting; checkout untouched.

## Open questions (in the mockup)
Seat prices; who carries a client's credits; routines that publish; client approval on every publish; brands' own
developers; the model's host (Frrata's API account, proposed).

## Out of scope
The agent editing catalogue or money; image generation; brands using Studio before partners; Studio inside the
console runtime (it runs beside it, through the API and the sandbox host).

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
