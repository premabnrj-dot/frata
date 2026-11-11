# Email marketing — research (2026-11-11)

Two research passes for the email-marketing proposal (`docs/specs/2026-11-11-email-marketing.md`). Every fact was read
2026-11-11; the page's own date is given where it has one. [V] read on the provider/regulator page, [S] secondary,
[U] unverified.

## Products (campaigns, flows, pricing)

| Product | Free | Paid / unit | Source date |
|---|---|---|---|
| Shopify Messaging | 10,000 emails/month on every plan; abandoned-checkout emails always free | per email: $1/1,000 to 300k, $0.65 past 300k, $0.55 past 750k | help.shopify.com (undated), Fall '26 Edition |
| Klaviyo | 250 profiles, 500 emails | $20/month for 500 profiles, 5,000 emails; per active profile, auto-upgrades | klaviyo.com/pricing (undated, ©2026) |
| Omnisend | 250 contacts, 500 emails | Standard $11.20 (500 contacts, 6,000 emails); per contact | omnisend.com/pricing (May 2026) |
| Mailchimp | 250 contacts, 500 emails, no flows | from $20/month; per contact tier | mailchimp.com/pricing (undated) |
| Zoho Campaigns (INR) | 2,000 contacts, 2,000 emails, no workflows | ₹240/month for 500, ₹1,860 for 5k, ₹2,940 for 10k (Standard) | zoho.com pricing JSON (undated) |
| BiteSpeed, KwikEngage, Interakt | — | WhatsApp-first, quote-priced | [S] |

**Flows that earn** — Klaviyo 2026 benchmark (blog 2026-10-02), revenue per recipient avg / top 10%: abandoned cart
$6.77 / $13.70; welcome $5.75 / $13.27; browse $2.08 / $4.32; post-purchase $1.80 / $2.77; win-back $0.82 / $1.60.
Clothing placed-order rate: campaigns 0.97%, flows 1.62% (Klaviyo industry benchmarks, ©2026). Omnisend 2026 report
(2025 data): automations 2% of sends, 30% of email revenue; $2.87 per automated email vs $0.18 per campaign email;
welcome + abandoned cart = 76% of automation orders; back-in-stock converts best (6.46%).

**Attribution** — Klaviyo 5 days after open or click; Omnisend 7 days, refunds not subtracted; Mailchimp 5 days open /
30 days click. Every one counts opens and none subtracts returns.

**UX taken:** per-email pricing with a free monthly allowance and free recovery emails (Shopify); flows shipped off,
one switch each, in money order; templates filled from the shop (logo, colours, live products); product and offer
blocks from the catalogue and the discount engine; resend to non-clickers after 48 h (Omnisend Campaign Booster);
order-keyed segments (engaged 30/90, never bought, first-time, repeat, churn) plus Frrata's own (COD delivered, came
back twice); automatic sunset of the unengaged; results on delivered orders net of returns; never block the first send
on DNS (Shopify falls back to its own domain); phone-first three-step campaign (no competitor edits well on a phone);
an Indian festive calendar. **Avoided:** opens as revenue, per-contact auto-upgrades, a free tier without flows,
open-ended builders and multivariate tests, dedicated IPs below ~1M emails/month.

## SES, mailbox providers, law

- SES pricing [V, aws.amazon.com/ses/pricing, undated]: à la carte $0.10/1,000; plans Essentials $0.16, Pro $0.22
  (+$105/month), Enterprise $0.23 (+$500/month); new accounts and unused account×Region pairs default to Essentials from
  21 Jul 2026, switch to à la carte any time. Tenants $0.005/month/tenant + $0.005/1,000. Dedicated IPs $24.95/month/IP;
  managed $15/month + $0.08/1,000. VDM $0.07/1,000.
- MARKETING is a valid account mail type (PutAccountDetails, 409 while a change is in review) [V].
- **SES list management is unusable per shop:** one contact list per account, ≤ 20 topics, every non-send API at
  1 request/s [V, dg/sending-email-list-management, quotas]. Keep our own lists and RFC 8058 endpoint.
- **Tenants isolate SES enforcement, not Gmail/Yahoo reputation:** "combined sending activity still affects your
  overall account reputation" [V, dg/tenants]; Gmail counts by the From primary domain, bulk status permanent
  [V, support.google.com/a/answer/14229414]. Every shop on frratamail.app shares one reputation → **marketing from the
  merchant's own domain**.
- Merchant domain: Easy DKIM 3 CNAMEs (2048-bit), custom MAIL FROM = one MX + SPF TXT, associate to the shop's tenant;
  identities 10,000/Region by default [V].
- Gmail: spam < 0.30% (target < 0.10%), bulk = 5,000+/day per primary domain, SPF + DKIM + DMARC aligned, one-click
  unsubscribe for marketing, 48 h recommended; "When clients use your service to send email, you're responsible for
  their sending practices" [V, answer/81126]. Yahoo: "Honor unsubscribes within 2 days" [V]. Microsoft: 5,000+/day →
  SPF, DKIM, DMARC, effective 5 May 2025 [V, ©2025].
- DPDP Rules G.S.R. 846(E) (13 Nov 2025): consent managers (r.4) one year on; notice and consent (r.3), children
  (r.10) at 18 months — plan for 12 May 2027. Withdrawal "with the ease … comparable to that with which such consent was
  given". Marketing needs a clear affirmative action; order emails rest on s.7(a) [V gazette copy; S trackers].
- No Indian law specific to commercial email found [U]; TRAI TCCCPR covers calls and SMS.
- BIMI needs DMARC quarantine/reject and a VMC (trademark) or CMC; ~$780–1,752 a year [S]. Not for small brands now.
