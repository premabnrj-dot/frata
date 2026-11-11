# Research: building shops with Claude — partners, pages, and a Storefront API
Status: research + proposal (not a spec) · Date: 2026-11-11 · Owner answers (2026-11-11): partners first, merchants
later; scope A + B + D; usage included in plans with monthly caps; first pages About, Contact, FAQ / size help.

## The question
Instead of (or beside) the customizer, give partners the power of Claude to build a client's shop — their own look,
their own sections, their own pages — while every shop still runs on Frrata's infrastructure: safe for every other
merchant, fast, cached, and never leaking a merchant's costs.

## North star
(5) a premium-looking storefront, and distribution through partners (roadmap row P: stores handed over per month).
Measures: time from "new client store" to first publish; share of partner-built shops published within 7 days;
Lighthouse/accessibility of Claude-built pages vs theme pages (must not be worse); credits spent per published shop.
Phase D (headless) serves agencies with developers, not the no-developer merchant: it needs its own justification.

## What Frrata already is (the reason this can be safe)
- A look is **data**: theme version + a JSON layer of sections and settings, Zod-checked on save (`src/domains/themes/
  sections.ts`: plain text, length caps, links only to shop paths, never HTML), drawn by our own server components.
- Drafts, preview, readiness, publish, undo, released-version rules, the contrast gate, page budgets, per-shop cache
  tags, `withTenant` + RLS, and the build gates (`check-client-bundle`: no cost field in any browser chunk).
- **Missing today:** custom pages (a shop has home, products, collections, policies, bag, checkout; any other path is
  the shop's 404), a contact form, and a public API.

## What the market does (dated, from the three research reports)
| Product | What the AI produces | Lesson ("Taken") |
|---|---|---|
| Shopify Sidekick blocks (2025-12-10) and Canvas (2026-10-01) | Liquid blocks in slots that declare `@theme`; Canvas lets the agent edit theme files on a duplicate theme | Generate into declared slots; work on a copy; validate → render → screenshot loop. **Not taken:** free-form code per shop — a Canvas theme loses theme updates and portability (community, 2026-10-30) |
| Framer Agent, Harness 2 (2026-11-02) | JS calls against a document-tree API; code generated deterministically from the tree | The agent edits a structured tree through a narrow API, never code |
| Wix Harmony (2026-01-21), Squarespace Blueprint (2026-09-22), Webflow (2026-02-05) | Pages from native components after a short questionnaire | Questionnaire before the first prompt; chat and direct editing on the same objects |
| v0, Lovable, Bolt | Real code, each app in its own microVM/deployment/database | Generated code is untrusted (Vercel guide, 2026-06-17); Lovable showcase app leaked 18,697 records (The Register, 2026-02-27). Only viable with per-shop isolation — not on a shared storefront |
| Vercel json-render (0.22, 2026-11-04), Google A2UI (spec v1.0, 2026-06-08), Puck AI | A flat, id-referenced component tree validated against a catalogue | The shape for Phase B: Zod catalogue that also writes the prompt; actions by name; **no CSS in the payload** (A2UI removed its theme field); validate, feed errors back. No dependency needed — Frrata's Zod + renderer is already this pattern |
| Notion 3.8 (2026-10-13), Framer branches (2026-09-15), Sidekick | Edits highlighted, attributed, proposed before applied | Tint what changed; record "by Claude" on each revision; publish is the one human gate |
| Anthropic, *How we contain Claude* (2026-05-25) | Users approve ~93% of prompts | Don't confirm each tool call; constrain what the agent *can* do |
| Anthropic prompt-injection work (2025-11-24); OWASP LLM 2026 (2026-09-01, Excessive Agency #3) | Injection is ~1% even with safeguards | Least agency: no fetch, no URLs, no code; untrusted text only as JSON tool results; server validates every call |
| Shopify Storefront API (2026-10), BigCommerce (2026-06-01), Medusa (2026-10-21), Commerce Layer | Public + private tokens, field allow-lists, hosted checkout URL | Phase D: read-only catalogue + cart → Frrata checkout handoff; shop from the token; allow-listed fields only |
| Quality: WebAIM Million (2026-03-30); AudioEye (2026-09-30, vendor) | AI-built sites fail WCAG; low contrast on 84% of pages | Gate Claude's output (contrast, alt, heading order, budgets) before publish |
| Google FAQ rich results removed (2026-05-07) | — | FAQ is for shoppers, not SEO |
| India E-Commerce Amendment Rules 2026 (notified 2026-09-09, in force 2027-01-01; law-firm coverage, gazette to check) | Legal name, address, customer care, grievance officer; complaints acknowledged in 48 h | Contact page carries a fixed business-details block Claude can't remove; a form message has a 48 h clock |

## The decision that matters: what Claude is allowed to produce
| | Claude produces | Runs where | Verdict |
|---|---|---|---|
| A. Copilot | Edits to today's sections, settings and pages | Our renderer | Safe, cheap |
| B. Composer | New sections and pages as a JSON tree of Frrata building blocks + theme tokens | Our renderer | Safe; the real "own theme" |
| C. Code on Frrata | React/CSS/Liquid | Beside every other shop | **No.** Shared runtime, DB reach, bypasses build gates; CSS is compiled at deploy so new classes wouldn't exist |
| D. Headless | The partner's own app, against a Frrata Storefront API | Partner's hosting | Safe for Frrata; quality and speed are the partner's |

Proposal: **A + B + D, phased, never C.** A theme stops being "a look" and becomes **a design system Claude composes
in**: its tokens, fonts, building blocks and rules. Themes become more valuable, not obsolete.

## How it uses Frrata's infrastructure (A and B)
```
Partner (console origin, customizer)          Frrata server                                  Anthropic API
  chat beside the live preview  ──► builderTurn (server action)
                                     requireMember / partner link; tenant from session
                                     usage row + credits reserved BEFORE the call (ADR-0006/0008)
                                     snapshot: brand, theme catalogue, sections, photos (ids),   ──► messages + tools
                                       product titles — never costs (ADR-0003)
                                     ◄── tool_use: add_section / edit_section / create_page /
                                         set_tokens / use_photo / preview_screenshot
                                     each tool = the customizer's own save: Zod parse, theme
                                       allows it, photo id is this shop's, contrast, limits
                                     writes ONLY this shop's DRAFT revision (one per turn, "by Claude")
  preview iframe ◄── same renderer as the shop
  Publish (a human button, never a tool) ──► today's publish: readiness + quality gates
```
- **Tenant safety:** the shop comes from the session, never from Claude or the chat; every tool runs in `withTenant`;
  tools take ids, never URLs; no tool reads orders, customers, costs or messages.
- **Injection:** product text, captions and alt text reach Claude as JSON tool results marked as data; contact-form and
  inbox messages never enter the builder; worst case is a spoiled draft — undo it.
- **Output safety:** Claude's text is plain text (no HTML/CSS/script), links are shop paths, images are the shop's own,
  colours are theme tokens checked by the contrast gate. Flat schema per section (Claude's strict-schema limits: no
  recursion, ≤ 20 strict tools), then our full Zod parse; errors go back for one retry.
- **Speed:** generated pages render through the same cached server components and budgets; a page's section count and
  images are capped; the builder adds no JS to the shop.
- **Scale:** the Claude call is the only new external dependency; it runs only in the console; shops never call it.

## Phases (each usable on its own)
| Phase | What a partner gets | New infrastructure |
|---|---|---|
| **P0 Pages** | About, Contact, FAQ / size help, built by hand in the customizer; in the menu, sitemap and SEO tags | Pages inside the look (draft/publish/undo for free); `/pages/<handle>` route; page sections (story, makers, materials, FAQ accordion, size help from size charts, business details); contact form → a console list with a 48 h clock + email via the outbox; Vercel BotID + rate limits + per-shop cap |
| **P1 Claude copilot (A)** | "Build with Claude" chat in the customizer: questionnaire → plan → edits to sections, settings and the P0 pages; changed sections tinted; one revision per turn; undo; credits shown | `builderTurn` action, tool layer over existing saves, usage + credits tables, prompt cache, eval set |
| **P2 Composer (B)** | Claude (and the partner by hand) composes new sections from building blocks: stack, grid, media, text, product list, collection list, button, accordion, quote, logos, spacer; saved as "this shop's sections" | Block catalogue (Zod + server components), flat id-tree schema, token-only styling, quality gates at publish (contrast, alt, heading order, budgets), preview screenshot self-check |
| **P3 Storefront API (D)** | Partner hosts its own frontend; Frrata keeps catalogue, cart, checkout, orders, payments | Public + private keys (hashed, scoped, origins, rotation), read-only catalogue + cart, `checkoutUrl` to Frrata checkout, field allow-list + gate (no cost field in any response), dated versions, signed cache webhooks via the outbox, canonical to the partner's domain |

Merchants get P1 later, once partner quality is measured. Each phase still needs its own spec, mockup and review.

## How effective, against today's themes (hypotheses to measure, not claims)
| | Themes + customizer today | With P0–P2 | With P3 |
|---|---|---|---|
| Time to a client's first publish | Hours of form-filling | Target: under an hour (questionnaire → plan → edits) | Days–weeks (custom code) |
| Uniqueness | 6 themes, 12 sections | Per-brand sections and pages within a theme's system | Unlimited |
| Safety, speed, SEO | Guaranteed | Same guarantees (same renderer, same gates) | Partner's responsibility past the API |
| Pages beyond home | None | About, Contact, FAQ, then any page | Any |
| Who it serves | Merchants, partners | Partners first, then merchants | Agencies with developers |

## Cost (hypotheses for `unit-economics-reviewer`, list prices checked 2026-11-11)
- Opus 5.5 $4 / $20 per M tokens; Sonnet 5.5 $2 / $10; Haiku 5.5 $0.10 / $0.50; cache reads far cheaper.
- A small edit (one turn): about ₹1–4. A full build (3 pages, ~40 tool calls, screenshots): about ₹80–170 on Sonnet 5.5,
  roughly double on Opus 5.5. To be measured on an eval set before choosing the model.
- Included, with caps (owner): e.g. per partner per month a number of full builds and edits, plus an hourly cap;
  chatting free, changes metered (Wix's model); credits reserved at the start of a turn so a job never stops half-way.

## Out of scope
C (code running on Frrata), image generation, Claude touching prices, products, orders or messages, a GraphQL API,
checkout or payment APIs, shopper login over the API (EkCode later), merchants building with Claude before partners.

## Gaps to recheck before specs
Gazette text of the 2026 E-Commerce Rules; full OWASP LLM 2026 list; a current source on contact forms and About
pages; Indian WhatsApp support preferences (primary survey); Turnstile vs BotID on custom domains.
