# ADR-0016: Who owns a site's code, and what a partner may reuse

Status: **accepted** (owner, 2026-11-15: "go with rest of your suggestion") · Next: the partner terms updated with
counsel before V4 · Pairs with: `docs/specs/2026-11-14-site-content-layer.md`, ADR-0014, the kit and fleet
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

## Decision (reviews folded 2026-11-15)
1. **Two layers in every site repository**, kept apart by the kit's layout and its checks:
   - **The partner's layer** (`starter/`, `skills/`, `frrata/fields.json` with no values): components, layouts, page
     patterns, the partner's own skills. Owned by the partner; licensed to each brand for its own site, perpetual and
     irrevocable, transferable with the shop, **except** fonts, images or packages licensed to the partner per site
     (a licence scan runs before a starter or an export).
   - **The brand's layer** (`brand/`): assets drawn or bought for the brand, `brand.md` and the agent's learned facts,
     custom work the brand paid for. Owned by the brand; never copied to another brand's site. Brand tokens and
     seasons are not in the repository at all: they are API data (kit spec § 2; ADR-0014 amendment 8).
   - The kit enforces it: `starter/` never imports `brand/` (only the reverse); no page copy as string literals and no
     media ids in `starter/`; each placement names the component that declares it; at handover the owner accepts the
     list of partner-layer files, so paid custom work cannot sit in `starter/` unnoticed.
2. **Repositories live in Frrata's organisation**, one per shop; neither the partner nor the brand holds admin rights.
   Access is through per-repository GitHub App tokens (no organisation-wide token), the live branch is protected,
   secret scanning is on, and removing a partner removes its repository access in the same step. **No key is ever in
   a repository:** the fleet injects the storefront key per deployment, and the gate refuses `frs_pub_`/`frs_test_`
   strings in source. Removing a partner keeps the site running under the licence in 1.
3. **"Save as agency starter"** (Studio, V4) copies a **fresh tree with no git history**, from an allow-list
   (`starter/`, `skills/`, `frrata/fields.json`) only, then refuses the copy if a scan finds any key-shaped string,
   media URL or id, another brand's handles or titles, a phone number or an email, or a default other than text or a
   toggle. A person at Frrata reviews each partner's first starter. Private starters are visible only to the partner's
   team; the public gallery stays V4 with a review on every release.
4. **Export: later** (owner, 2026-11-15, matching the intake answer; the kit spec now says the same). When it exists, it is the brand's layer plus the partner's layer under the licence, as a git bundle
   and the media, with `.claude/` and editor folders stripped.

## Consequences
- The kit's repository layout gains `brand/` and `starter/`; the publish gate and "Save as agency starter" read it.
- Partner terms gain the licence in 1 and the no-copy rule in 1 and 3; counsel reviews them before V4.
- The kit spec § 7 and the intake answer on export are made to agree.
- A partner can leave without taking a brand's site down, and can grow a house style across clients without carrying
  one brand's identity, key or customers into another.
