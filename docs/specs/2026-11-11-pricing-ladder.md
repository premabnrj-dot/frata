# The pricing ladder — how every feature and add-on is placed and priced
Status: draft for the owner · Date: 2026-11-11 · Approved: — · Goes into `frata-unit-economics` once approved

## Goal
One method, used every time we plan a feature or an add-on, so that (a) every plan is worth its price to the shop it is
for, (b) a shop moves up because its own numbers say so, never because it hit a wall, and (c) the price feels right to
an Indian merchant. Measure: upgrades a month; share of upgrades that came from an in-product nudge; downgrades and
churn within 60 days of an upgrade (a bad upgrade comes back as churn).

## The fact the ladder rests on (computed 2026-11-11 from the decided tiers)
Plan cost = monthly price + fee % × delivered order value. So the cheapest plan is set by **delivered GMV a month**:

| Store | GMV a month | Launch | Growth | Scale | Cheapest |
|---|---|---|---|---|---|
| Low AOV · ₹599 × 300 | ₹1.8 L | ₹5,093 (2.8%) | ₹6,796 (3.8%) | ₹15,898 | Launch |
| Low AOV · ₹599 × 700 | ₹4.2 L | ₹9,885 | ₹9,192 | ₹17,096 | Growth |
| High AOV · ₹4,500 × 80 | ₹3.6 L | ₹8,699 | ₹8,599 | ₹16,799 | Growth |
| High AOV · ₹4,500 × 450 | ₹20.3 L | ₹41,999 | ₹25,249 | ₹25,124 | Scale |
| Volume · ₹900 × 1,500 | ₹13.5 L | ₹28,499 | ₹18,499 | ₹21,749 | Growth |
| Volume · ₹900 × 3,000 | ₹27 L | ₹55,499 | ₹31,999 | ₹28,499 | Scale |

Break-even: **Launch → Growth at ₹3.5 L a month, Growth → Scale at ₹20 L a month** of delivered order value.
Consequence: the "~150 / ~1,500 / ~5,000 orders" labels mislead for high-AOV shops (a bridal brand at 80 orders is
already overpaying on Launch) and low-AOV shops (300 orders and still rightly on Launch).

## Three kinds of store, three reasons to move up
| | Low AOV (< ₹1,000) | High AOV (> ₹3,000) | Volume (> 1,000 orders) |
|---|---|---|---|
| Pain | Thin profit per order; one RTO wipes out 3 sales; COD-heavy | Each lost order is costly; a few shoppers are most of the money | Team time, mistakes at scale, festive peaks |
| Moves up for | **Features that save ₹ per order**: RTO Shield, COD confirm, Pay online next time, cart flows | **The fee itself** (saves from ₹3.5 L) and keeping big buyers: VIP segments, early access, white-glove words | **Operations**: team seats and roles, bulk actions, higher caps, priority support, API/export |
| What never works on them | "Save on fees" (they won't reach ₹3.5 L soon) | Per-order add-ons that look small but add up on every order | Hard limits that stop selling at a peak |
| The nudge, in their rupees | "RTO Shield would have saved ₹6,300 last month (21 returns × ₹300)" | "On Growth you'd have paid ₹1,840 less last month" | "Your team confirmed 1,240 orders by hand last month" |

## The method — five steps for every feature or add-on
1. **Place it** (one of four):
   - **Core** — needed to run a shop, or the baseline (Shopify + India app stack) gives it free. Every plan. (Offers,
     order emails, checkout.)
   - **Metered** — costs Frrata per use. Every plan, with a monthly allowance that rises by plan; beyond it a prepaid
     wallet. Never a hard stop on selling. (Marketing email, WhatsApp later.)
   - **Earns its plan** — saves rupees per order or per hour that only matters past a plan's break-even. Growth or
     Scale. (RTO Shield, cart flows; team and bulk tools.)
   - **Add-on** — a specialist job a segment wants, with its own cost to Frrata; any plan unless it would make a plan
     pointless. Monthly price. (Reviews, GST filing.)
2. **Check the three stores**: what each pays a month, and what it earns or saves (₹ kept after returns, from its own
   orders). An add-on above **2% of a low-AOV shop's GMV**, or one that costs more than it saves for any of the three, is
   priced again or moved.
3. **Check the baseline**: Shopify + the India app stack for the same job. Frrata is never dearer for the shop that job
   is for; where it is (COD fee), say why in the bundle.
4. **Write the nudge**: the moment it appears (after a win, never mid-task), the line in the shop's own rupees, the one
   action ("Move to Growth · from 1 Dec"). The price change shows what moves and when; GST shown.
5. **Write the hypotheses**: figure · source · date · test (frata-unit-economics rule 1). The test runs on real shops
   before the price is called right.

## Indian merchant psychology — principles (hypotheses until tested)
1. **Value in rupees from their own orders** ("paisa vasool"): every upgrade line is a saving or an earning from last
   month, never a feature list. Test: nudge with ₹ vs nudge with features, conversion in 30 days.
2. **Recharge, not subscription, for usage**: merchants already buy WhatsApp and SMS as prepaid packs; bigger packs at a
   visibly better rate ("₹1,600 → 20,000 emails · 8 p each"). Test: pack mix and repeat recharges in 60 days.
3. **Familiar price points**: ₹299 / ₹499 / ₹999 for add-ons; plans end in 99; "₹17 a day" beside small monthly prices.
   Test: ₹499 vs ₹500 vs "₹17 a day" on the Apps details dialog.
4. **No surprise at the bill**: "+ 18% GST" everywhere; the fee "only on delivered orders" (a returned COD costs nothing);
   UPI Autopay with the 24-hour notice; one line per charge on the invoice. Trust is the price of a recurring debit.
5. **Try before paying**: add-ons get a trial (Admin already grants 30 days); the first month's result is the sales
   pitch. Test: trial → paid by add-on.
6. **Allowances, not walls** (EkCode's rule): a meter that turns amber at 80%; past it, three choices (wait for the 1st,
   recharge, move up). Selling never stops. Test: what shops choose at 100%.
7. **Annual for the cash-rich, monthly for everyone**: offer "2 months free" yearly on Growth and Scale only; many small
   brands guard cash flow, so Launch stays monthly. Test: take-up by plan.
8. **One recommended plan**, labelled by who it is for ("Most brands at ₹3.5 L a month"), never by a fake "Popular".
   Real social proof only once true ("214 brands like yours on Growth").
9. **Never dark patterns** (CCPA dark-pattern guidelines, 2023): no fake countdowns, no pre-ticked add-ons, downgrade as
   easy as upgrade.

## Email marketing, placed by the method (answers the owner's question)
| | Launch | Growth | Scale |
|---|---|---|---|
| Campaigns, templates, segments, report on ₹ kept | ✓ | ✓ | ✓ |
| Emails included a month (approved) | 5,000 | 10,000 | 25,000 |
| Flows: Welcome, Back in stock, Finish paying, Thank you | ✓ | ✓ | ✓ |
| Flows that cut RTO and win back: Pay online next time, Win-back, browse/bag (cart flows: Growth+, decided) | — | ✓ | ✓ |
| Send again to non-clickers, best time, collection segments, festive calendar | — | ✓ | ✓ |
| VIP and high-value segments (by ₹ kept), early access to VIPs first | — | — | ✓ |
| Several sender addresses / brands, a second domain | — | — | ✓ |
| Higher daily cap, Frrata reviews a big send before it goes, export and API | — | — | ✓ |

**Launch: what to charge to activate.** Recommendation: **₹0 to activate**; it is included with 5,000 emails, as
approved. Reasons: Shopify gives 10,000 emails free on every plan (baseline rule); the own-domain step is already the
real activation effort; email is the cheapest channel to win repeat orders for the low-AOV shop that most needs them;
the upgrade comes from the Growth flows, shown in its rupees ("Win-back would have reached 214 shoppers who bought once
in 90 days"). If a charge is wanted anyway: **₹299 a month ("₹10 a day")** for Launch, the same allowance, cancel any
time — never a one-time activation fee (it reads as a penalty and buys nothing visible).

## Hypotheses (figure · source · date · test)
| Figure | Source | Date | Test |
|---|---|---|---|
| Upgrades follow GMV, not orders | tier arithmetic | 2026-11-11 | Upgrades by GMV band, first 6 months |
| A ₹ nudge converts better than a feature list | assumption | 2026-11-11 | 50/50 nudge copy, 30 days |
| Low-AOV shops upgrade for RTO tools | assumption | 2026-11-11 | Upgrade reason by AOV band |
| Launch with free email retains better than Launch at ₹299 | assumption | 2026-11-11 | Alternate by weekly cohort, 60-day churn |
| Annual take-up on Growth/Scale ≥ 20% | assumption | 2026-11-11 | Offer for one quarter |
