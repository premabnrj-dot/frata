# ADR-0014: Frrata is the commerce backend; a shop's website is code

Status: accepted (owner, 2026-11-11: "Accept the north-star wording; partners get the builder first; we'll remove the
look/themes concept") · proposal `docs/specs/2026-11-11-agentic-storefront.md` (mockup
https://claude.ai/artifact/K8QusFghYyKYsYtU678huQ) · supersedes, at V5, ADR-0012 (manifests as data)

## Context
Frrata grew a theme system (six themes, a customizer, Theme Studio's designs and pages) so a brand with no developer
gets a premium storefront. The owner wants developers and partners to be the storefront's core makers, with an agent
in the product doing the developer's work, and partners publishing agentic starters others build from. Earlier calls
reverse with it: the Storefront API was parked "everything runs on Frrata for now" (2026-11-11) and the in-console
Claude builder was skipped "Claude never runs on Frrata's servers" (2026-11-11).

## Decision
1. **North star.** "Frrata is the commerce backend for Indian D2C brands. A brand runs its business in the console; its
   website is code that a developer, a partner or Frrata's agent builds on the Storefront API. Frrata keeps what makes
   the brand money: catalogue, checkout, COD, payments, orders, shipping, GST." (CLAUDE.md and `frata-planning`.)
2. **A website is code in its own repository and its own isolated deployment**, holding one read-only public key and no
   database access, no secret. Generated code never runs in Frrata's console or checkout runtime.
3. **Checkout, payment, sign-in and personal data stay on Frrata's host.** A site hands the bag over by link.
4. **The agent works in a sandbox on a draft branch; a person publishes.** Partners get the builder first; brands later,
   once partner-built quality is measured.
5. **Themes retire.** No new theme work (Theme Studio TS1c–TS4 cancelled). Live looks keep rendering until each shop
   moves (V5); then the theme catalogue, the customizer and ADR-0012 are removed.
6. **Phases V0–V5** as in the proposal, each with its own spec, mockup and reviews; the kill signals there stand.

## Consequences
- ADR-0002 gains a third tenant source (a storefront key), as drafted in the Storefront API spec's SA0.
- The planning skill's rule "work that moves no ranked problem waits" now reads against the new north star.
- Hosting, agent and build costs become Frrata's to meter (credits, plans): `frata-unit-economics`.
