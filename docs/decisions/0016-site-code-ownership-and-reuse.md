# ADR-0016: Who owns a site's code, and what a partner may reuse

Status: **proposed** (drafted 2026-11-14 for the owner; not in force) · Needs: the owner's decision, then the partner
terms updated with counsel · Pairs with: `docs/specs/2026-11-14-site-content-layer.md`, ADR-0014, the kit and fleet
spec (§ 3 Starters, § 7 retention and export)

## Context
- Every shop's website is code in its own repository that records its starter and version; starters are repository
  templates; partner starters reach a reviewed gallery at V4 (ADR-0014; `docs/specs/2026-11-12-kit-and-fleet.md:117-122`).
- Nothing decides who owns a site's code, whether a partner may reuse brand A's site for brand B, or private agency
  starters. The owner put "templates between partners" and "code export" at "a later stage" and "later"
  (`docs/specs/2026-11-12-studio-intake-and-team.md:11,14`), while the kit spec says the owner can export the code at
  any time (`kit-and-fleet.md:211-212`). The Studio mockup v2.4 already draws "Atelier · Pixel & Thread · your agency
  starter" (`docs/mockups/2026-11-13-studio-v2.html:1490`). The hardening review proposed repositories in a Frrata
  organisation and starters licensed for perpetual, transferable use (`docs/mockups/2026-11-11-studio-hardening.html:135`;
  not folded).
- Reuse is easy technically once products, content and tokens come from the API by key, but today a site also carries
  its brand's design system values, `brand.md`, drawn assets and the agent's learned facts.

## Decision (proposed)
1. **Two layers in every site repository**, kept apart by the kit's layout:
   - **The partner's layer** — components, layouts, page patterns, the partner's own skills (`starter/` and `skills/`):
     owned by the partner; licensed to each brand for its own site, perpetual and irrevocable, transferable with the
     shop.
   - **The brand's layer** — design system values and seasons, assets drawn or bought for the brand, `brand.md` and the
     agent's learned facts, custom work the brand paid for (`brand/`): owned by the brand; never copied to another
     brand's site.
2. **Repositories live in Frrata's organisation**, one per shop; neither the partner nor the brand holds admin rights
   on it. Removing a partner keeps the site running: the brand keeps its site, the partner's layer under the licence
   in 1.
3. **"Save as agency starter"** (Studio, V4) copies only the partner's layer into a private starter for that partner's
   other clients: `brand/` removed, and the checks refuse a starter that still holds another brand's name, tokens,
   media ids or files. Private starters are visible only to the partner's team; the public gallery stays V4 with a
   review on every release.
4. **Export:** one rule for both specs, chosen by the owner (any time, as the kit spec says; or later, as the intake
   answer says). When it exists, it is the brand's layer plus the partner's layer under the licence, as a git bundle
   and the media.

## Consequences
- The kit's repository layout gains `brand/` and `starter/`; the publish gate and "Save as agency starter" read it.
- Partner terms gain the licence in 1 and the no-copy rule in 1 and 3; counsel reviews them before V4.
- The kit spec § 7 and the intake answer on export are made to agree.
- A partner can leave without taking a brand's site down, and can grow a house style across clients without carrying
  one brand's identity into another.
