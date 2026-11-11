# Shop stress test: findings, fixes and opportunities
Status: findings · Date: 2026-11-11 · Scope: everything a shop runs on except themes and Look (owner: another session)

Three code reviews traced ten scenarios each, plus a full e2e run:
- the merchant's day in the console (Diwali peak, RTO, size and address changes, partial cancel, refunds, staff,
  five days away, races, phone search, month end);
- the shopper's path (viral drop, Instagram's browser, COD abuse, coupons, a late webhook, Hindi addresses, 3G, a big
  product, after delivery);
- setup and growth (60 products from Excel, Razorpay test→live, a partner's handover, own domain, which reel sold,
  outgrowing Launch, WhatsApp health, silent failures).

Each bug below was checked in the code before it was fixed or listed.

## Fixed (branch, ddb8f21)
| What | Who it hit | Fix |
|---|---|---|
| A returning shopper looped on "The total changed" forever while a first-order offer or a one-per-customer code was live | The shop's best customers | Checkout shows and sends the placement's own price for that phone |
| A sold-out size left in the bag refused every tap at checkout (checkout hides it, so it couldn't be removed) | Every shopper in a drop | The bag drops lines that can no longer be bought |
| Order search by a pasted phone (+91, 91, 0, brackets) found nothing | Every merchant answering a WhatsApp | Normalised as phones are stored |
| A phone whose parcels came back before read Low risk and went through bulk confirm | COD shops | High, "N earlier parcels to this phone came back" (advice, never a block) |
| A genuine Hindi address read Medium risk | Hindi-speaking shoppers | Devanagari digits count; a non-Latin city skips the city rule |
| Live Razorpay keys after test keys showed "Working" from the test webhook; online payment offered with no live webhook; the secret hidden | Every shop going live | A change of mode forgets the webhook worked and shows the secret |
| A changed pincode kept the old state at checkout (wrong place of supply, so wrong GST) | Shoppers who correct a pincode | The state and an autofilled city follow the pincode |
| An unpaid COD order could be moved to a pincode the shop blocked for COD | Merchants | Refused, with what to do |
| Home said "You're up to date" with parcels waiting to ship | Merchants at peak | To ship counts |
| The cancel dialog said Frrata never tells the customer (it emails them); refusals promised a "Phase 2" | Merchants | True words |

## Bugs that need a decision or a bigger change
Ranked by money at risk.
1. **A paid order whose webhook is lost stays unpaid**, and the "Finish paying… nothing was charged" email goes 1 minute
   after the hold ends. Nothing asks Razorpay. Fix: a cron that asks Razorpay about unpaid online orders from the last
   72 h (S–M).
2. **The order page has no "Pay again" or "Pay on delivery"**, though the email promises both, and `/retry` and `/cod`
   exist. So no abandoned online order is ever recovered (S).
3. **A reload during UPI (the app switch in Instagram's browser) can place a second order and charge twice**: the
   pending order is saved but never read back (S–M). Razorpay's redirect mode for in-app browsers is the durable fix.
4. **A "doesn't combine" order offer cancels a bigger pay-online saving** (₹949 instead of ₹899 in the test). That
   breaks design rule 46 and pushes shoppers to COD. One order offer applies to both methods today. Fix: price each
   method's best set (M, pricing engine).
5. **A returned-items credit note doesn't restock and doesn't take the goods' cost off Analytics**. Frrata's fee still
   counts the returned value. Decide: is a returned item billable? (M)
6. **An RTO marked "don't put stock back" (damaged) still counts the goods as recovered in profit** (S).
7. **A broken Razorpay connection never shows**: `markProblem` has no caller, so the console says "Live" while every
   online payment fails (S).
8. **Silent failures reach no one**: Settings promises "payment keys · WhatsApp · shipping costs need you" emails,
   and nothing writes them. There is no new-order alert either (M, specified in the messaging spec E·1).
9. **WhatsApp health stops updating** once 200 kept inbox rows fill the queue (the Business-app path syncs 6 months of
   history). Kept chat bodies are never deleted (a DPDP retention gap). Already in the parked list; not fixed (S–M).
10. **iPhone photo uploads may fail**: Safari can't encode WebP, the PNG it returns is refused. Check on a real iPhone,
    then fall back to JPEG (S).
11. **Each tap counts toward the 5-orders-an-hour phone limit**, retries included. Count placed orders only (S).
12. **An abandoned Razorpay sheet holds the size for 20 minutes**. At a drop that sells out sizes that aren't sold.
    Release on dismiss (S).
13. **Offers that are used up are still advertised** (bar, product page, cards), and the code then "doesn't work here" (S–M).
14. **A creator's code beaten by an automatic offer reads "doesn't work here"**, counts as a wrong guess, and the creator
    loses the attribution (S).
15. **The product page's stock ignores prepaid holds**, so a size reads "In stock" that checkout calls sold out (S).
16. **Registering for GST can make live products unbuyable** with no warning (a product without a rate) (S).
17. **The domain check still runs once a day** although Vercel Pro is on: `vercel.json` and `DOMAIN_CAPACITY`
    (config, owner).
18. **The pincode directory may be empty in production** (no loader in the repo). Then autofill and the city risk rule
    are off. Check the table.

## Opportunities, ranked by profit per delivered order
| # | What | Problem | Size | Planned? |
|---|---|---|---|---|
| 1 | **Product import** (CSV/Excel, ₹ and commas, "S/M/L" in a cell, duplicate SKUs, Hindi titles, missing photos) — 60 products in 10 minutes instead of 5 hours. The blocker (Vercel Pro for the sweep) is gone | 3 | L | Phase 1 §1A, deferred |
| 2 | **Change one line of a placed order** before packing: size swap, partial cancel, re-priced and restocked by line. Today the whole order is cancelled or ships with the wrong COD amount | 1, 2 | M | No |
| 3 | **Phone-first peak work**: oldest first on work tabs, selection on phones, bulk Mark packed, "Confirm & next". About 6 taps an order today, 2,400 for 400 | 7 | S–M | No |
| 4 | **Profit at the moment of decision**: "If delivered ₹X · if it comes back −₹Y" on the order page for owners | 6, 1 | M | Phase 3 (True profit) |
| 5 | **A "needs you" digest and new-order alert** (email or WhatsApp): a merchant away for 5 days hears nothing | 1, 7 | S | Messaging E·1 |
| 6 | **Recover abandoned online orders** (bug 2, then a WhatsApp nudge) | 4 | S | Cart flows (later) |
| 7 | **A Customers view**: search a phone across all orders, delivered and refused counts, open orders, WhatsApp | 1, 2 | M | No |
| 8 | **Search across all tabs** (today it searches only the tab you are on) | 7 | S | No |
| 9 | **Sign-up defaults to Launch and lists what each plan adds that is live**; "plan price free, 2% on delivered orders still applies" in the trial. Growth's extras are all "next" today | Trust | S | No |
| 10 | **"Your month on each plan" in rupees** (Launch is cheaper below ~₹3.5 lakh delivered a month) | 6 | S | No |
| 11 | **One "ready for live payments" ladder**: KYC → live keys → live webhook → website registered, each from the data | 4 | S | No |
| 12 | **Tracking on the shopper's order page** (courier and number exist) | 4 | S | No |
| 13 | **Tracking-only creator codes and a reel link preset**, so a reel or creator is credited without a discount | 6 | S–M | No |
| 14 | **Back-in-stock alerts** for a sold-out size | 4, 7 | M | No |
| 15 | **After handover, a partner's reach narrows** (catalogue and look; no legal identity or shopper data) | Trust | M | No |
| 16 | **Hindi names transliterate** into product addresses, SKUs and campaign tags | 3 | S | No |
| 17 | **A month view in Analytics** (calendar month, delivered date) until the settlement ledger | 6 | S | Ledger is Next |
| 18 | **Team activity**: who confirmed, packed and shipped what today | 7 | S | No |

What held up: placement is exactly once per key; two buyers for the last piece are serialised; switching to COD asks
Razorpay first; GST per discounted line is right; staff never see cost anywhere traced; two people acting on one order
are serialised.
