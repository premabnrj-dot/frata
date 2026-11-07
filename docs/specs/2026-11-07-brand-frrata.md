# Brand: Frata becomes frrata
Status: draft · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/S55h8hC9dYNJC2fQghjFvi · Approved: —

## Goal
Ranked problem (5), a premium-looking storefront, and trust in the product a merchant runs their shop on. The owner
asked for the rename to "frrata" with a new wordmark, guideline, typography, palette and icons. Measure: the owner's
sign-off on the brand book, then `check:contrast`, `check:scale` and a new `check:name` holding it in code.

## Job
Give the platform one bold, ownable identity that reads as Indian fashion and as fast, without getting in the way of
a tool used all day.

## Research
The owner's references (two boards, 2026-11-07): custom geometric wordmarks with one drawn detail (an arrow, a cut, a
letter swapped for a symbol, a ligature). Taken: a drawn lowercase mark whose detail is the double r. The UX foundation
research (`docs/research/2026-11-07-ux-foundation.md`) still holds for how the brand sits in the product: brand in the
chrome only, status colours never change between surfaces.

## Design (see the mockup)
- **Wordmark:** drawn, lowercase, stroke 14 on x-height 54. Three directions: A Thread (recommended: the first r's arm
  runs on to within a 3-unit "stitch" of the second; joining them read as "nr" or "π" in testing), B Tick, C Soft.
- **Monogram:** the rr of A in a square with a 23% radius. It replaces the oxblood "F".
- **Colour:** Ink and Paper do the work. Rani (#D61F69) is the signature, with Rani Deep (#A8124F) as text on paper and
  Rani Light (#FF4F93) on ink. Haldi (#F2B233) and Neel (#23307A) appear on brand surfaces only. Status colours are
  unchanged. Rani is never a button, link, number or status.
- **Type:** Bricolage Grotesque 800 for display (page h1s, brand, empty states, website), Inter for work (unchanged,
  with Indic fallbacks), JetBrains Mono for numbers. An eight-step scale.
- **Icons:** 21 domain icons, 24 grid, stroke 1.75, round ends; the current page's icon at 2.25; no filled variants.

## Owner calls (recommendation first)
1. Wordmark: A Thread · B Tick · C Soft.
2. Signature colour: Rani (with Haldi and Neel) · keep oxblood.
3. Display face: Bricolage for headlines, Inter for work · Inter everywhere.
4. Rename scope now: the product, emails and legal pages (B·2), addresses later (B·4) · everything at once.

## Before the name is final (not checked)
Whether frrata.com, frrata.in and frrata.app are free; an IP India trademark search in classes 35 and 42; Instagram
and WhatsApp handles; buying the single-r spelling as a redirect.

## Rollout
B·1 tokens and mark components · B·2 the name in the product, with `check:name` · B·3 the icon set · B·4 shop
addresses and the app domain, with permanent redirects (merchants have shared `*.frata.in` links).

## Out of scope
A marketing website; packaging print files; renaming the GitHub repo, Vercel project or Supabase project (these are
internal names and can stay).
