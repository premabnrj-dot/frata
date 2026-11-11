# Email marketing (campaigns and flows)
Status: draft · Date: 2026-11-11 · Mockup: https://claude.ai/artifact/FEYLwWhyFNbtDDgbdC2PNX
(`docs/mockups/2026-11-11-email-marketing.html`) · Approved: — · Research: `docs/research/2026-11-11-email-marketing.md`
· Builds on: `docs/specs/2026-11-08-messaging.md` (E·3 own domain; E·4/E·5 held there, planned here)

## Goal
Problem 6 (true profit) and repeat sales for problem 1 (COD): a merchant brings shoppers back by email and sees what it
kept after returns. Measure: share of shops with ≥ 1 campaign in 60 days; ₹ kept after returns per 1,000 emails;
spam rate < 0.10% across shops.

## Job
A small fashion brand emails the shoppers who asked — new drops, sales, restocks — and switches on flows that sell while
they sleep, without a developer and from a phone.

## Design (see mockup)
- **Rails:** same SES account, a `marketing` configuration set and outbox kind queued behind order emails; our own
  per-shop lists, consent rows and RFC 8058 unsubscribe (ADR-0006 exception to write: unsigned unsubscribe POSTs carry a
  token, stored as a row, answered at once); no open tracking; clicks through our link; orders by the link's tags,
  judged on delivered orders minus returns within 5 days of a click.
- **Own domain required for marketing** (Gmail judges by the From domain; frratamail.app is shared). Order emails move
  to the merchant's domain at the same time (E·3). Records table, Check records, Copy all, Send on WhatsApp; Frrata adds
  them itself for domains on Vercel DNS.
- **Lists:** "Email me new drops" (footer, order page, order emails), "Email me when it's back" on a sold-out size,
  imports only through a confirmation email. Segments: Everyone, Engaged 90 days, Never bought, First order delivered,
  Repeat buyers, COD delivered, Bought from a collection; always left out: unsubscribed, bounced, came back twice,
  emailed today, declared under 18.
- **Campaigns:** Who · What · When, phone first; templates (New drop, Sale, Festive, Back in stock, Early access, Last
  chance, Lookbook, Plain letter) filled from Look and the catalogue; blocks (Photo, Text, Products, Collection, Offer
  from Offers with its real end, Button, Divider); checks at review; test send; send now, schedule, best time; report:
  delivered, clicked, orders (delivered / came back / on the way), ₹ kept, unsubscribed, spam; send again to
  non-clickers.
- **Flows:** Welcome (2), Back in stock, Finish paying (exists), Thank you and review, Pay online next time (COD
  delivered), Win-back (90 days), Still want our emails? (180 days, then left out). Each stops when the shopper orders.
- **Calendar:** Indian fashion's year (wedding season, end-of-season sales, Republic Day, Holi, Eid, Raksha Bandhan,
  Navratri, Diwali) with a ready campaign each.
- **Pricing (approved 2026-11-11, messaging spec call 7):** per email; included monthly Launch 5,000 / Growth 10,000 /
  Scale 25,000; wallet ₹500 / ₹1,600 / ₹5,000 for 5,000 / 20,000 / 1,00,000 + GST. **New caps:** a day 5,000 /
  20,000 / 50,000; first campaign 1,000 / 2,000 / 5,000, then 5× the largest; per shopper 1 a day, 4 a week.
- **Safety:** spam > 0.10% warns and narrows the next send to Engaged; > 0.30% or bounces > 4% pauses the shop's
  marketing (order emails go on); links only to the shop.

## Phases
E·3 Own domain → M·1 Lists → M·2 Campaigns + wallet → M·3 Flows → M·4 Calendar and extras; later WhatsApp in the same
campaign and abandoned bag for signed-in shoppers.

## Owner calls (recommendations first)
1. Own domain required for marketing. 2. The caps as starting values (Admin raises per shop). 3. Flows count against
the monthly emails except Back in stock and Finish paying. 4. Imports only through a confirmation email. 5. An app in
Apps (Grow), on for every plan. 6. Owner: switch SES to à la carte pricing.

## Design review — to complete after the owner's direction (frata-planning § 3), then the review agents
(architecture, tenancy, security, unit economics, speed) on the plan.

## Out of scope
Opens as a metric; per-contact pricing; A/B labs; dedicated IPs (until ~1M emails a month); BIMI; SMS.
