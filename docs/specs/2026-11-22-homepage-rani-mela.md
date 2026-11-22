# Homepage in Rani Mela
Status: built · Date: 2026-11-22 · Mockup: https://claude.ai/artifact/NAyi1JZajH7nbK7kxm6Voa · Approved: owner, 2026-11-22

## Goal
Acquisition: a brand owner who lands on `/` understands in one scroll who Frrata is for and starts a store. Not a ranked
product problem; the same reason the website exists. Measure: visits from `/` to `/start` (once analytics is on).

## Job
The owner asked for a bolder, more playful website built around the frrata rani, in words an Indian founder reads in
one go, with each scroll answering the next feeling. Homepage first; the other public pages follow once this is live.

## Research
Directions board (https://claude.ai/artifact/42PdxGPDtgbyHA6tR782Ee, three rounds): loud Indian (truck art, haldi) was
too bold; calm SaaS (Ledger, Plex Indigo, Saffron Line) too plain; the owner picked rani-led **Rani Mela**, with neel in
place of indigo. Scroll order follows loss aversion before relief, numbers before adjectives, and a clear default plan.

## Design
`docs/mockups/2026-11-17-homepage-rani-mela.html` (homepage + design system). Rules recorded as
frata-design-language reference/brand-and-public.md rules 45–51.

## Design review
- **UI/UX** — one action (Start your store free), repeated at the top, in pricing and at the close. Static page: its
  states are plans present and plans missing ("Prices appear when you start your store.", the hero card and the fee
  number hidden). Phone: one column, tiles and steps two then one across.
- **Tenancy** — n/a: no merchant data; plans are platform rows read by `publicPlansForPage`.
- **Modularity** — `src/app/page.tsx` composes; parts in `src/components/brand/site-home.tsx`; the sheet
  `src/app/site.css` scoped under `[data-site]`, its tokens at the top (not `base.css`: the shop sheet imports that).
- **SSOT** — every ₹ from the plans or `exampleOrder()`; the example's GST is now returned by the engine (`gst`), so the
  card's lines add up to what the brand keeps (tested) instead of the page working out GST itself.
- **YAGNI** — no scroll animation, no carousel, no testimonials or logos (none are real yet).
- **Performance** — no client script; fonts self-hosted; DM Sans preloaded, Mukta cut to the page's letters (35 kB from 105 kB,
  tested), lazy by unicode-range. speed-reviewer measures the build.
- **Security** — no action, no input. Links out to WhatsApp only.
- **Motion** — CSS only, rule 50.
- **Unit economics** — none; figures are read, not changed.
- **Blast radius** — `/` only. no shared sheet changes; `ExampleOrder` gains a field.

## Out of scope
The other public pages (next, one by one); real testimonials (when brands agree to be named).

## Facts used
None third-party.
