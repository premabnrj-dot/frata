# Homepage in Rani Mela
Status: done · Date: 2026-11-22 · Spec: docs/specs/2026-11-22-homepage-rani-mela.md
**Mockup:** https://claude.ai/artifact/NAyi1JZajH7nbK7kxm6Voa (docs/mockups/2026-11-17-homepage-rani-mela.html)
**Approved:** owner, 2026-11-22
**Review:** design-system-reviewer 12 findings fixed (phone menu left as drawn, owner call), 2026-11-22
**Review:** words-reviewer 6 findings fixed (copy changes listed for the owner), 2026-11-22
**Review:** speed-reviewer 2 findings fixed (shop CSS budget, Mukta 105 to 35 kB), 2026-11-22
**Review:** impact-reviewer 9 findings fixed, 2026-11-22

## Regression net
`e2e/flows/05-shop-look.mjs` (the homepage baseline regenerated; every shop baseline unchanged), `e2e/flows/90-ux.mjs`
(site-home at 320, 390, 1280 and 200 %: no new failure), `src/domains/orders/__tests__/example.test.ts` (the card's
lines add up to what the brand keeps), `src/components/brand/__tests__/site-fonts.test.ts` (every Hindi letter on the
page is in the cut font), `check:contrast` (every `--site-*` pair), `check:storefront-build` (no shop pays for this).

## Tasks
1. Tokens and fonts: `--site-*` at the top of `src/app/site.css`; DM Sans and Mukta 700 (cut) self-hosted.
   Verify: `npm run gates`, `npm run build` (`check:storefront-build` clean).
2. Parts and page: `src/components/brand/site-home.tsx`, `src/app/page.tsx`, eight sections.
   Verify: `npm run typecheck`, `npm test`.
3. Engine: `exampleOrder()` returns its GST; `exampleOrderLines()` is the card's list. Verify: `npm test`.
4. Flows: `UPDATE_BASELINES=1 npm run e2e -- --only shop-look,ux` (GREEN, 17 steps), the new baseline looked at
   beside the mockup.
5. Skill: frata-design-language rules 45–51 (10.1.2).

## Deviations
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| Order card lines (₹1,188 product, ₹210 shipping, ₹980 kept) | Engine lines: product ₹990, shipping, packing and COD fee ₹135, ads ₹180, GST ₹119, Frrata fee ₹47, you keep ₹1,019 | Website rule 43 and the mockup's own note: figures from the profit engine, never typed | yes, reported 2026-11-22 |
| "Profit, this order" | "You keep" | Says what the number is to a founder | yes, reported 2026-11-22 |
| No Next tags | Next on WhatsApp confirm (tile, step, toast) and on plan features the registry marks next | Rule 41: what is not built says Next (`MODULES[k].status`) | yes, reported 2026-11-22 |
| "Fast shipping" | "Shipping" | No measured speed behind "fast" (words review) | yes, reported 2026-11-22 |
| "No fee on returned parcels" | "No fee on parcels that come back" | A shopper's return was delivered and pays the fee | yes, reported 2026-11-22 |
| Plan bullets (typed) | "Up to N orders a month" and the plan's own features | Read from the plans, never typed | yes, reported 2026-11-22 |
| Mockup-parity agent | Checked by hand: the built page's screenshots beside the mockup at 1280 and 390 | The page renders its order card and prices only with plans present; checked with sample plans rendered outside Next | yes, reported 2026-11-22 |

## Practices recorded in skills
- frata-design-language reference/brand-and-public.md rules 45–51 (colour jobs, type, frame, the scroll order, icons,
  motion, Next); SKILL.md tokens note; 10.1.2.
- A website's tokens never go in `base.css`: the shop sheet imports it and its CSS budget has no room (rule 45).
- An SVG sprite's shapes take attributes, not page classes: `<use>` clones are not styled by the page's CSS.

## Repetitive work → agents and scripts
| Chore | Now |
|---|---|
| A same-in-both-modes token drifting in dark | `check:contrast` fails it (EkCode) |
| A Hindi letter added without re-cutting Mukta | `site-fonts.test.ts` names it |
