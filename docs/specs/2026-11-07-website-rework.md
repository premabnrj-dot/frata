# W·1 · The public pages in the Frrata identity
Status: draft · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/5XCS7xCWJj8zGS5SUpv8cf · Approved: —

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
