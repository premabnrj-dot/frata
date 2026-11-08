# W·1 · The public pages in the Frrata identity
Status: built · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/5XCS7xCWJj8zGS5SUpv8cf · Approved: owner, 2026-11-07 (calls 1–6 as recommended)

## Goal
Ranked problems (1) COD/RTO losses and (6) true profit per order, told to the merchants who have them, plus partner
supply for the brands who need a builder. Measure: sign-ups started from `/` and partner applications from
`/partners`, compared week on week once traffic exists. Before that, the ux flow's layout checks and Lighthouse
mobile ≥ 90.

## Job
A fashion founder opening frrata.com on a phone should know in one screen what Frrata does for a COD-heavy brand,
what it costs in rupees, and how to start or ask on WhatsApp. A freelancer or agency on /partners should see the rate,
the duration and what it adds up to.

## Research (checked 2026-11-07; vendor numbers unverified)
Shopify India (Fall '26), Dukaan (© 2026), Shiprocket (Nov 2026), GoKwik (© 2026), Razorpay Magic Checkout (Aug 2026),
Linear (Nov 2026); Shopify Partners (Fall '26), Razorpay Partners (live 7 Nov), Framer Creators (6 Nov 2026); Baymard
homepage (13 Oct 2026), NN/g carousels (7 Aug 2026) and handmade design (10 Apr 2026), CXL social proof (5 Nov 2026).
Taken:
- a plain outcome headline with a real product view in the hero, no carousel;
- ₹ pricing on the page, with the delivered-only fee;
- no invented proof, so the terms carry it until real merchants agree to be named;
- WhatsApp beside the call to action (no Indian competitor checked has one);
- about eight sections;
- the partner rate and its duration in the hero, with a worked ₹ example.

No current source was found for "pricing on the page converts better"; the call rests on the comparison.

## Design (the mockup)
- **Home.**
  - An ink stage with the block print, the plain headline "Keep more of every order you deliver", a paper button with
    the thread, and the WhatsApp number in text.
  - The hero shows the console's Today view and one order, marked "Example shop", with its fee only if delivered and
    "You keep" tagged Next.
  - A Neel band of terms; five steps from order to profit (Now/Next); three Now cards; the three plans in ₹ from the
    plans table; four FAQs; a final call to action and the footer.
- **Partners.**
  - The same stage, "Build brands' shops. Earn 20% for 2 years", and an earnings mock.
  - A Neel band of the terms, and a brand-count calculator over `shareExample()` (Launch, 120 delivered orders a
    month at ₹1,200: ₹876 per brand per month).
  - Build, hand over, earn (with the 90-day tail); the rules; a final call to action.

## Owner calls (recommendation first; see the mockup)
1. The hero: an ink stage with a real console view (example data) · keep the paper hero and the illustration.
2. Pricing on the home page in ₹ · prices only after sign-up.
3. Proof: none invented; the terms carry it · placeholder quotes (not offered).
4. "You keep ₹1,034" in the hero, tagged Next · leave profit out until Phase 3 ships it.
5. Partners: a brand-count calculator · the single fixed example.
6. 20% for 24 months against Framer's 50% for 12: run `unit-economics-reviewer` before any change; the mockup keeps 20%/24.

## Owner direction (2026-11-07)
**Fewer words, more pictures.** Each section says its point in one short line and shows it in a drawing, the product
frame or a number. No reassurance paragraphs, no notes about how the page works (e.g. "Figures are read from the plans
themselves…" goes). A heading at most 6 words; a line under it at most 12; a card at most 2 short lines.

## Design review (architecture-reviewer on the plan, 2026-11-07, folded in)
- **UI/UX:** one point per section, said in at most 6 words and shown in a drawing, the product frame or a number. These
  lines stay visible: GST and "of each delivered order" on every plan card, "up to N orders a month", the partner's
  90-day tail, "24 months from opening", "₹0 added to the brand's price", and "Example · ex GST · paid monthly once
  billing starts" beside the partner numbers. The skip link is in the site header; the console view is `inert`, so its
  links are not Tab stops.
- **SSOT:**
  - The hero order runs `EXAMPLE_ORDER` through `orderProfit()`, with the fee from Launch's `feeBps` and both "if
    delivered" and "if it comes back". It is hidden when plans fail.
  - The partner figures are `shareExample()` × n, shown as the engine's ₹875.80.
  - "2 years" is derived from `shareMonths`.
  - The Shopify-import claim goes; every "Now" names something built.
- **Modularity / DRY:** `SiteHeader`, `SiteStage`, `Selvedge`, `SiteFooter` and `ConsolePreview` live once in
  `src/components/brand/site.tsx` and `console-preview.tsx`; the paper-on-ink button is a `button()` variant
  (`inverse`), its pair and paper-on-Neel gated in `check:contrast`.
- **Performance:** no client script added. The calculator is radio chips over server-computed values (`:has(:checked)`).
  The block print is a "selvedge" strip at the stage's edge, never behind numbers, controls or forms. Large ₹ figures are
  mono (a ₹ in the display face would pull the Devanagari file).
- **Reliability:** a plans read that fails at runtime throws, so the last good page stays cached; only the build (no
  database) falls back. A new plan version revalidates `/` and `/partners`.
- **Tenancy / security / unit economics:** n/a (platform-scope `publicPlans`, no tenant read, no action; the partner terms
  do not change, so `unit-economics-reviewer` is not needed until call 6 changes them).
- **Tests:** the ux net measures `/`, `/partners`, `/login` and `/start` signed out; 40-partners follows the new copy; unit
  tests for the example order and the calculator values.
- **Accepted gaps:**
  - e2e builds without a database, so prices and the partner example show their fallback there; unit tests hold their
    values.
  - No Lighthouse tooling; the ux flow's speed step prints.
  - No `?from=` tracking yet.
  - **No privacy or terms page exists** although sign-up and apply collect email and phone: the owner's to write (legal).

## Plan (after sign-off; reviewers before code)
| Task | What | Verify |
|---|---|---|
| W·1 home | Stage hero with a server-rendered console view (example data, no reads), Neel band, steps, cards, pricing (same source), FAQ, final call to action | ux flow at 320/390/1280 (no sideways scroll, no overlap, tab order); Lighthouse mobile ≥ 90; `check:name`, `check:scale`, `check:voice` |
| W·2 partners | The same frame, the earnings mock, the calculator (a small client island over `shareExample()`), steps, rules | e2e 40-partners green; a unit test that the calculator equals `shareExample()` × n |
| W·3 sign-in and start | The stage on /login and /start: the wordmark, the block print, one sentence | e2e checkout and the partner sign-in steps |

/partners and `src/components/brand/illustrations.tsx` belong to the partners session: tell it before W·2.

## Out of scope
Hindi and regional-language versions (signal: owner call or merchant demand), merchant logos and testimonials (signal:
named merchants who agree), a blog or changelog page, and the shop addresses move (brand B·4).
