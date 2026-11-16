# Build that converts
Status: done · Date: 2026-11-16
**Mockup:** https://claude.ai/artifact/B2rA72TRjJr525gTLGCkoF, approved
**Approved:** owner, 2026-11-16
**Review:** architecture-reviewer n/a — static content page, no data, no tenant, no action; skipped per
frata-planning § review scope (no table, query, action, route, webhook or money touched)

## Tasks
1. Add `BuyerJourney` spot illustration (`src/components/brand/illustrations.tsx`) — reuses the `store`,
   `payments`, `delivered` pictograms already in `PICTOGRAMS`. Verify: `npm run typecheck`.
2. Add the page (`src/app/build-that-converts/page.tsx`) on the existing public frame, 8 cards with existing
   `IconName`s only (`confirmed`, `key`, `slip`, `cod`, `reviews`, `stock`, `returned`, `search`) — no new UI icon.
   Verify: `npm run gates`, `npm run typecheck`, `npm run build` (static, 388 B page / 107 kB first load — well
   under the 300 kB budget), manual render at 1280 and 390 px (screenshots matched the mockup, no sideways scroll).
3. Link the page from `SiteFooter` on `/` and `/partners`. Verify: visual check (both screenshotted above).

## Deviations
None — built as drawn.

## Practices recorded in skills
None new; the page reuses every existing primitive and rule (website spec W·1, § Graphic language). No new
pattern earned a place in `frata-design-language`.

## Repetitive work → agents and scripts
None — one static page, built once.
