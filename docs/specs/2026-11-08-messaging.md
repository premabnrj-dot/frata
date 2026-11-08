# Email and notifications: Frrata → merchants and partners; merchant → shoppers
Status: draft, resumed 2026-11-08 (owner: "while we're waiting for DNS, can we pick Email Plan"; shop addresses in `docs/specs/2026-11-08-shop-addresses.md`) · Date: 2026-11-08 · Mockup: https://claude.ai/artifact/TwHtjtuFPzRDv4uLqLB9xQ (`docs/mockups/2026-11-08-messaging.html`) · Approved: —
Research: `docs/research/2026-11-08-email-and-notifications.md` (four agents, facts checked 2026-11-08).
Owner, 2026-11-08: **emails are branded — merchant to customer in the merchant's brand; Frrata to merchants and
partners in Frrata's brand.** Checkout may ask for an email; **no consent checkbox.** **Amazon SES from the start**
("better and scalable"). **Charge merchants more than cost, in a model Indian merchants understand.** Push and
WhatsApp notifications are planned after email.

## Goal
Today Frrata tells nobody anything: one sign-in email, capped at a few an hour, and no order, billing or Frrata-action
notice at all. This spec makes every event that matters reach the right person, in the right brand.
- **Problem 1 (COD/RTO):** a shopper who gets "Order confirmed · KS-1043 · pay ₹2,490 on delivery" and "Shipped ·
  Delhivery · arrives Thu" refuses fewer parcels; a merchant told of a new COD order confirms it sooner (push, P·1).
- **Problem 6 (true profit):** campaigns are judged on delivered orders, like Offers and Analytics.
- **Running Frrata:** billing notices (RBI: notice ≥ 24 h before each debit), security, and Frrata's own actions on a
  shop reach the owner without a support ticket.
Measures: order emails delivered ÷ sent ≥ 98%, complaints < 0.1%; RTO on COD orders with an email vs without;
billing notices read before the debit; support tickets that begin "I didn't know" (target: none).

## Job
A brand's shoppers hear from the brand at every step of their order without the brand doing anything; the brand
can change the words, send from its own address, and later email its followers. Frrata's team tells merchants and
partners what they must know, and the things they cannot miss always arrive.

## The boundaries (the owner's first question)

**1. Two directions, two brands, never mixed.**

| | Frrata → merchants, staff, partners | A merchant → its shoppers |
|---|---|---|
| Brand | Frrata: wordmark, rani thread, Inter | The shop: its logo, accent, name. **No Frrata mark anywhere**, not in the footer |
| From | `Frrata <notices@notify.frrata.com>` | `Kesar Studio <kesar-studio@frratamail.com>` until the shop verifies its domain, then `Kesar Studio <orders@kesarstudio.in>` |
| Reply-To | Frrata support | The shop's support email (Settings › Store). A Gmail address is Reply-To only, never From (DMARC) |
| Where it also shows | The console's Notices (bell): every notice lands there first | The order page (shopper's and the console's) shows each email's state |
| Who decides | Frrata; required types can't be switched off | The merchant: on/off per email, wording, sender |
| Legal footer | Frrata's address | The shop's legal name, address and grievance officer (Consumer Protection (E-Commerce) Rules), from Settings |

**2. Who sends: always Frrata, through Amazon SES in Mumbai (owner, 2026-11-08), one SES tenant per shop and one for
Frrata** (each shop's reputation, suppression list and pause are its own). A merchant does not plug in their own SMTP or
email tool in this plan: we could not show bounces on the order, we would store their passwords, and a broken setup
would look like a Frrata failure. *Signal to revisit:* Scale merchants asking for Klaviyo → an export of subscribers
and events to Klaviyo, not SMTP.

**3. Three kinds of email, kept apart because mailbox providers judge them apart.**
- **Order emails** (transactional): about one order the shopper placed. No offers, no products to buy, so they stay
  transactional: no unsubscribe needed (Gmail), no consent needed (DPDP s.7(a)), never capped or skipped.
- **Marketing** (campaigns, automations other than "finish paying"): only to shoppers who asked (§ 5), one-click
  unsubscribe (RFC 8058), a separate sending stream and domain, a frequency cap, the merchant's own domain recommended.
- **Frrata notices** to merchants and partners: from Frrata's domain, which never carries a shop's mail. Gmail counts
  every subdomain of one primary domain together, so shops' mail must not live under frrata.com.

**4. Domains** (owner call 2): frrata.com (bought) keeps people's mail and `notify.frrata.com` for notices;
**frratamail.com** (to buy; $12.03/yr at Vercel, available 2026-11-08) carries shops' order emails; a third domain for
shared marketing is chosen at E·4. **Not frrata.shop:** it holds the storefronts and goes on the Public Suffix List, and
DMARC works out a sender's organisational domain from that list, so each `name.frrata.shop` would count as its own
organisation for mail and frrata.shop itself as a public suffix [U: the DMARC revision in progress changes the
method; a separate domain avoids the question either way]. Each:
SPF, DKIM, DMARC (`p=none` first, then quarantine), a custom return path.

**5. Consent without a checkbox** (owner: no consent check; owner call 3). Order emails go to every email given at
checkout. Marketing goes only to shoppers who **tapped** "Email me new drops": on the order confirmation page, in the
order email's footer, or in the shop footer. A tap is the "clear affirmative action" DPDP s.6(1) asks for (in force
from 12 May 2027), with no box in checkout. Every marketing email has one-click unsubscribe; withdrawing is one tap.
The record: who, when, where (page or email), which shop.

**6. Per shop, always.** A shopper's unsubscribe, bounce or spam complaint stops mail from **that shop**, not from
every Frrata shop (suppression per shop). A shop whose complaints rise is paused alone (SES tenants).

**7. What a merchant can change, and what they cannot.** Wording in fields (subject, heading, message, button),
on/off per email, sender name, their domain. Not: HTML or code, links to other sites, the order block, the legal
footer, the unsubscribe line. Placeholders are chosen from a menu (Customer name, Order number…), never typed.

**8. Language.** Order emails follow Frrata's earlier rule: English for now (themes plan); a Hindi shop's typed words
stay as typed. Hindi email words wait for the fluent review the storefront needs.

## Who hears what (the event map)

**Shoppers (merchant's brand), E·2:** Order confirmed (COD: "pay ₹X on delivery"; online: "paid"), Finish paying (an
online order left unpaid, once, after 30 min; it is their own order, not marketing), Payment received (paid after a
switch), Shipped (courier, tracking number, expected date, items; link to the shop's order page), Delivered (with the
invoice link), Cancelled (why in the shop's words; "refund ₹X in 5–7 days" when paid online), and later Out for
delivery and Delivery failed (Ship S·1+, Shiprocket). Not emailed: Confirmed by the shop (no news to the shopper),
Packed, Came back, Lost (the shop calls the shopper; a template invites more RTO), Credit note (reaches a CA, not a
shopper; the invoice link is on the order page).

**The merchant's team (Frrata's brand), E·1:** New order (off by default; on per person), daily summary at 9 am
(optional), Razorpay keys stopped working, WhatsApp needs you, Shipping costs not set (weekly until set).

**Owners and admins (Frrata's brand, required), E·1:** Billing (invoice issued, debit notice ≥ 24 h before, debit
failed, retry, pay link, day 7, day 14), security (a new person added, owner changed, a support visit opened on your
shop, with the reason), Frrata acted on your shop (offer stopped, module paused, theme version recalled or withdrawn,
plan changed), and a data breach notice (DPDP r.7) if ever needed.

**Partners (Frrata's brand), E·1:** application approved or declined, a store handed over / the owner joined,
payout statement (when partner payouts exist).

**Everyone, optional:** Frrata product updates (once a month at most), set by Admin › Notices.

## Design (mockup: the screens below, as drawn)

**E·0 Foundation** (nothing new on screen except reliable sign-in email).
- One sender module `src/lib/email/` (owner of the provider key), one outbox kind `email.send` (and `email.campaign`
  at E·4), rendered at send time from the row's ids (the row never holds the body or the address after send).
- Supabase's sign-in email moves onto the provider's SMTP from `notify.frrata.com` (lifts the few-an-hour cap).
- An events route for delivered, bounced, complained (signature verified, stored under our idempotency key, answered
  at once, processed later; ADR-0006) writing each message's state and the shop's suppression list.
- Two layouts: Frrata's and the shop's (logo on a plate, accent, legal footer), both tested in light and dark, ≤ 60 kB
  (Gmail clips at 102 kB), plain-text part, `color-scheme` meta.

**E·1 Notices: Frrata → merchants and partners** (screens 9–10).
- Console › Notices (a bell in the shell, a count, the list; read on open). Every notice lands here; email per type
  per person, in Settings › Your notifications. **Required** types show a lock: "Billing and security always reach
  you by email" (Vercel/Stripe: one channel at most may be dropped, never all). No email if already read in the console
  within 10 minutes (Linear).
- Admin › Notices: compose to all shops, a plan, partners or one shop; in-console only or also email; required or
  optional (only billing, security and Frrata-action kinds may be required); a preview; "Send to 214 shops".

**E·2 Order emails to shoppers** (screens 2–6).
- Checkout: an optional **Email** field under the phone, "For your order updates and invoice", a typo hint ("Did you
  mean gmail.com?"). No checkbox.
- Console › Settings › **Emails to shoppers**: the sender card (From, Reply-To, "Send from your own domain"), the
  brand strip (logo and accent from Settings › Brand and Look; nothing to set twice), the list of emails each with a
  switch and "Edited" when changed, the last 7 days' delivered and bounced count.
- An email's page: fields (Subject, Preview line, Heading, Message, Button) with an Insert menu for placeholders; the
  live preview of a real recent order (phone, desktop, dark); **Send test to me** (only to the signed-in person),
  **Revert to Frrata's words**; Save with the one save bar (Settings rule). The order block, address and legal footer
  are fixed and greyed in the preview.
- The order page (console): an **Emails** card: each email with Sent · Delivered · Bounced · Marked spam; when an
  email bounced, "Fix the address" (Edit contact) and **Send again**; **Email the invoice** once issued.
- The shopper's order page shows the email the updates go to and "Email me new drops" (owner call 3).

**E·3 Send from your own domain** (screen 7).
- Settings › Emails › Your domain: type `kesarstudio.in` → the records (3 CNAME for DKIM, MX + TXT for the return
  path, one DMARC TXT) with Copy, "Check records", the state in words (Waiting for records · Checking · Sending from
  orders@kesarstudio.in · Records missing — sending from kesar-studio@frratamail.com until fixed). Typical wait "up to
  48 hours". The fallback is automatic; nothing is lost while records are wrong.

**E·4 Campaigns** (module "Email campaigns", Grow group; screen 8).
- Marketing › Emails › New: a template (New drop, Sale, Back in stock, Festive), blocks (Heading, Text, Image,
  Products from the catalogue with live prices, an Offer from Offers with its real end, Button, Divider), audience
  (Everyone subscribed · Bought in the last 90 days · Bought from a collection · Never bought), send now or schedule;
  **Review** lists checks (subject, size, every link to the shop, unsubscribe present, who is left out and why).
- Links carry `utm_source=email&utm_medium=campaign&utm_campaign=<name>` through `shopLink`, so Analytics shows each
  campaign; its page reports sent, delivered, clicks, orders and **₹ kept after returns** (Analytics' figure).
- A shopper emailed by this shop in the last 16 hours is skipped (order emails never are); a shop's first campaigns
  ramp (no more than 5× its usual daily volume; the review says so).

**E·5 Automations** (module "Cart flows", Growth+): Welcome (on "Email me new drops"), Finish paying ×2, Thank you
and review ask (Reviews), Win-back at 90 days; each stops when the shopper orders.

**Later channels** (their own specs; one router decides channels per event):
- **WhatsApp order updates** = M2·1 C2 (already specified): COD confirm and order updates as utility templates on the
  shop's own number. Per event the merchant picks Email, WhatsApp or both (a two-column table on Emails to shoppers →
  renamed **Messages to shoppers** then). WhatsApp marketing uses the Marketing Messages API (Cloud API stops
  marketing 13 Oct 2027).
- **P·1 Push to the merchant's team**: the console installed as an app on a phone; "New COD order KS-1043 · ₹2,490 ·
  Confirm" (problem 1). **P·2 Push to shoppers** only after shops sit on their lasting domain (B·4: a subscription
  belongs to one origin) and only as an extra (iOS needs Home Screen).
- **SMS** last: each brand registers on DLT (header, templates, whitelisted links), weeks of lead time.

## Stress test (what happens when…)

| Situation | What happens | Where it shows |
|---|---|---|
| The shopper gives no email (most COD) | Nothing is sent; WhatsApp (C2) and the order page carry the news | Order page: "No email" |
| A typo (`gmial.com`) | Checkout suggests the fix; if it still bounces, the address is suppressed for this shop | Emails card: Bounced · Fix the address · Send again |
| The shopper marks an email as spam | Suppressed for this shop only; their other shops' mail is untouched | Emails card: Marked spam; the shop's complaint rate |
| One shop's campaign draws complaints | That shop's marketing pauses alone (tenant), order emails go on; Frrata Admin sees it | Banner: "Campaigns paused: 0.4% marked as spam" |
| A shop's domain records break after verifying | Sending falls back to `kesar-studio@frratamail.com` at once | Settings: "Records missing — sending from …"; a notice to the owner |
| Support email is a Gmail address | Used as Reply-To only | Sender card says so |
| No support email set | Order emails can't be switched on; the list links to Settings › Store | Emails to shoppers: "Add a support email first" |
| Marked shipped, then Undo within 5 minutes | Shipping emails wait 5 minutes and re-check the order; an undone step sends nothing | Undo toast: "The shopper has not been emailed" |
| Undo after the email went | Nothing to unsend; the toast says "The shopper was already emailed" | Toast |
| Confirmed then cancelled in a minute | Each email re-reads the order when it sends; a cancelled order gets only "Cancelled" | Emails card |
| Festive peak, 10× orders | Order emails are enqueued in the order's transaction and drained right after commit; campaigns queue behind them and slow down, never order emails; the provider quota is raised before festive season | Admin › Email health |
| The provider is down | The outbox retries with backoff (8 tries); orders are never blocked; Admin is alerted after 15 minutes | Admin › Email health |
| A partner builds a shop before handover | Shop not open: no shopper email can go; tests go to the partner's own address | Emails to shoppers: "Your shop opens to shoppers first" |
| Frrata support visits the shop | They can read and preview, not change, test-send or send | Support banner; buttons disabled with the reason |
| Staff (not owner) | See Emails to shoppers; cannot change the sender or domain | Fields read-only |
| The owner's email bounces | Billing notices stay in the console banner; Admin sees "Owner email bouncing" | Notices; Admin merchant page |
| A shopper is erased (DPDP, abandoned order after 90 days) | Their email goes with the order's details; message rows keep the type and state, not the address | — |
| Same shopper in two Frrata shops | Two separate relationships: each shop's consent, suppression and unsubscribe stand alone | — |
| The wallet can't cover a campaign | Blocked at review: "Needs ₹240 more"; never sent half | Campaign review |
| A merchant pastes a link to another site in a campaign | Refused at review: only links to the shop | Review checks |
| A placeholder the order lacks (no tracking number yet) | The line is left out, never "undefined" | Preview with a real order |
| Gmail clips at 102 kB | Order emails ≤ 60 kB; campaigns warn at 80 kB | Review checks |
| Dark mode (Apple 62% of opens) | Logo on a light plate; colours chosen for both | Preview: Dark |
| A shopper replies to an order email | Goes to the shop's support email (Reply-To); later the Inbox (C3) may take email too | — |
| A shop moves to its own domain later (B·4) | Email links follow the shop's current address; old links redirect | — |
| A shopper asks "send my invoice again" | Email the invoice (console, once issued) | Emails card |

## Design review (frata-planning § 3)
- **UI/UX:** one primary action per screen (Save; Check records; Send test; Review and send). Defaults work with no
  setup (Shopify: on by default). Every state drawn: no support email, shop not open, domain waiting/failing, bounced,
  spam, paused, staff, support visit, phone. Wording edited in fields, never code; Preview on a real order; Revert.
- **Tenancy:** new tables, each with tenant_id, grant, RLS, policy in one migration: `email_messages`,
  `email_suppressions`, `email_templates` (overrides only), `shop_email_domains`, later `subscribers`,
  `campaigns`. Frrata notices: `notices` (platform rows) and `notice_reads`/`notice_prefs` per member; Admin writes
  through `frata_admin`. Provider ids and the events route map to the shop by our own message id, never by a
  payload field; the tenant id comes from the outbox row. Unsubscribe tokens are signed and name shop and address.
- **Modularity:** pure: `src/domains/email/` (which emails an event sends, wording defaults and placeholders, the
  "still true?" check, suppression rules, consent states); I/O: `src/lib/email/` (provider, render, events);
  reads in `src/lib/queries/emails.ts`; screens in Settings and the order page; campaigns and automations are
  modules (registry) on the same sender.
- **SSOT/DRY:** an order's email address lives on the order (edited with Edit contact); brand facts come from
  `brandFor()`; wording defaults live once in the domain; a message's state is derived from its event timestamps
  (sent, delivered, bounced, complained), no status column; consent is a row with timestamps (given, withdrawn).
- **YAGNI:** no merchant SMTP/ESP, no HTML editing, no open tracking (Apple hides opens; clicks and orders instead),
  no A/B tests, no BIMI, no SMS, no attachments (a link to the invoice) — each with its signal in Out of scope.
- **KISS:** E·2 is: an email column, an outbox kind, a render function, one settings page, one card on the order.
- **Scalability:** 500 shops × 50 orders a day × 10 (festive) × 2 emails ≈ 500k a day ≈ 6 a second: within SES's
  raised quota (asked for before festive season). Messages table: ~15M rows a
  month at that peak — partitioned or pruned after 13 months (DPDP logs ≥ 1 year).
- **Performance:** nothing renders in a request: enqueue is one insert in the order's transaction; `drainSoon` after
  commit; the order page adds one indexed read (messages by order). Settings preview renders on the server once per
  change. Shop pages: unchanged except the optional field.
- **SES specifics:** sandbox until AWS grants production access (200 a day, 1 a second): ask in E·0 with the use case;
  events arrive through SNS (its message signature verified) or EventBridge; the tenant name is the shop id from the
  outbox row (never a request field).
- **Reliability:** every send is an outbox row (ADR-0006); retries are safe (provider idempotency key = our message
  id); the "still true?" check runs at send time; a failed provider never blocks an order.
- **Security:** merchant wording is text, escaped, links only to the shop's own paths; test sends only to the
  signed-in member, rate-limited; the events route verifies the provider's signature and caps size; the provider key
  lives in one module; addresses never logged (an error's name only); support visits can't send.
- **Motion and visuals:** Settings uses existing patterns (save bar, switches, toasts); the event map in the mockup
  is a diagram; the email preview frame switches phone/desktop/dark without animation.
- **Unit economics:** SES ≈ ₹14 per 1,000 emails with tenants — a shop with 1,500 orders a month sends ~6,000 order
  emails ≈ ₹85, inside the per-order fee. Marketing from the wallet at 5–10 paise an email (₹50–100 per 1,000) against
  ₹14 cost; Shopify charges ≈ ₹85 per 1,000 after 10,000 free. § Pricing; `unit-economics-reviewer` on the numbers.
- **Blast radius:** checkout (one optional field; e2e 10), the order writer and outcomes (enqueue calls; e2e 49, 50),
  Edit contact (email), the settings list, the console shell (bell), sign-in (SMTP move — the most shared path:
  e2e every flow signs in).

## Tooling: Wraps (owner asked 2026-11-08: "see if this is helpful and can make the process easier")
Wraps (wraps.dev) deploys email infrastructure into **our own AWS account** with one command and offers a TypeScript SDK.
Checked 2026-11-08: the CLI `@wraps.dev/cli` 3.20.1 (AGPL-3.0, Pulumi underneath, updated 2026-11-04) "deploys SES,
DynamoDB, Lambda, EventBridge, and IAM roles", with "least-privilege roles with OIDC support (Vercel, AWS native)" and
domain verification with DKIM/SPF/DMARC; the SDK `@wraps.dev/email` 0.15.1 (MIT, first published 2025-11-12) sends with
`new WrapsEmail().send({ from, to, subject, html })`; templates are React Email; a local dashboard reads the history.
Not stated anywhere we could read: Mumbai (ap-south-1) support, SES tenants, a per-shop domain API [U].
- **Take: the CLI, once, for E·0** (a tool we run, so AGPL does not reach our code): the SES account set-up, the
  configuration set, the event pipeline and above all **Vercel OIDC → an AWS role**, so no long-lived AWS keys sit in
  Vercel's environment. A day of console work becomes one reviewed command; check the region and what it created
  before E·0 closes.
- **Take: React Email** for our two layouts (the shop's and Frrata's).
- **Not the SDK at runtime:** pre-1.0, it pulls DynamoDB, S3 and SSM clients, has no SES tenants (one shop's trouble
  pausing only that shop is the reason we chose SES), and keeps the email history in **DynamoDB, outside Postgres and
  its row security** — a second copy of every message's state, and shopper addresses where our isolation proof
  (`verify:tenancy`) can't reach. Our sender stays ~100 lines on `@aws-sdk/client-sesv2` (`SendEmail` with
  `TenantName`, the configuration set and List-Unsubscribe headers); events land in our `webhook_events` (ADR-0006).
- **Not for merchants' domains (E·3):** those are created by our code per shop (`CreateEmailIdentity` + tenant), never
  by a CLI.

## Pricing: the Messages wallet (owner: higher than cost, a model Indian merchants know)
Indian merchants already buy messaging as **prepaid packs**: WhatsApp tools (Interakt, WATI) and SMS gateways (MSG91)
sell a wallet you recharge, with a rate in paise per message and GST shown. Frrata does the same:
- **Order emails are included on every plan** (no meter): they are about the merchant's own orders, reduce refusals,
  and cost Frrata ≈ ₹0.014 each; a meter here would make merchants switch them off. Frrata's notices are free.
- **Marketing email draws from the Messages wallet** (Settings › Billing › Messages wallet): packs in round rupees
  at whole-paise rates (ADR-0004): **₹500 → 5,000 emails (10 p), ₹1,600 → 20,000 (8 p), ₹5,000 → 1,00,000 (5 p)**,
  + 18% GST shown. A campaign is debited once, as one integer row, after it is sent. Every campaign's review shows
  "Uses 4,812 emails · 3,180 included + 1,632 from the wallet (₹131) · balance after ₹1,369"; a campaign the balance
  cannot cover is **blocked at review** ("Needs ₹240 more"), never sent half.
- **Included each month** (reset monthly, no rollover; reviewer, 2026-11-08): **Launch 5,000, Growth 10,000, Scale
  25,000**. Zero on Launch would make Frrata dearer than Shopify (10,000 free) for every small shop; a small shop's
  list of tapped subscribers keeps the real cost far below the ₹70 ceiling.
- **Credits are valid 12 months from the last recharge** (rolling); no refund on demand, the balance is refunded to
  the original payment method only when the account closes (RBI: a closed-system PPI is outside RBI regulation only
  while it pays for Frrata's own services and permits no cash withdrawal — Master Direction on PPIs, as on
  30 Sep 2026, para 2.1).
- **Auto-recharge** (optional, on the saved UPI Autopay or card from billing B3) obeys the e-mandate rule: notice
  ≥ 24 hours before the debit, so it triggers early (when the balance would last less than 3 days of recent sending).
- **The same wallet later pays for SMS** and, if Frrata ever bills WhatsApp itself, WhatsApp — **only as Frrata's own
  invoiced service** (Frrata's GST; Frrata carries the vendor's price changes). Paying Meta or an SMS vendor on the
  merchant's behalf would make it a semi-closed PPI needing RBI authorisation. Today Meta bills the merchant directly.
- **Margins** (unit-economics-reviewer, SES ₹14.03/1,000 at ₹85/$, gateway 2% + GST): ₹83, ₹59 and ₹35 per 1,000 on
  the three packs (69–83%). Order emails cost 0.25–0.60% of Frrata's revenue per shop. Against Shopify: dearer on the
  small pack (₹100 vs ₹85 per 1,000), cheaper on the large; against WhatsApp marketing (₹0.86 + GST) email is a tenth.
- **For a CA:** GST at the top-up (time of supply on advance; a receipt voucher), and the treatment of the included
  emails. Hypotheses to test: merchants pay for email although Shopify gives 10,000 free (offer the packs to the first
  10 E·4 shops; count recharges in 60 days and which pack); breakage ₹0.

## Phases (each usable on its own)
| Phase | A merchant can… | Depends on |
|---|---|---|
| **E·0 Foundation** | sign in without the hourly cap; nothing else visible | AWS account (SES Mumbai), frrata.com and frratamail.com bought |
| **E·1 Notices** | see every Frrata notice in the console; get billing, security and Frrata-action emails | E·0; billing B3 uses it |
| **E·2 Order emails** | have shoppers emailed at each step in the shop's brand; change the words; see bounces | E·0 |
| **E·3 Own domain** | send from orders@theirbrand.in | E·2 |
| **E·4 Campaigns + wallet** | recharge the Messages wallet; email shoppers who asked, judged on delivered orders | E·3 recommended; billing B3; consent tap |
| **E·5 Automations** | welcome, finish paying, thank-you, win-back | E·4; Cart flows module |
| **P·1 Team push** | get "New COD order" on the phone | E·1 (notice types) |
| WhatsApp C2, P·2, SMS | — | their own specs |

## Owner calls (recommendations first)
1. **Provider — decided (owner, 2026-11-08): Amazon SES from the start**, Mumbai, a tenant per shop; production
   access and a quota for festive volume requested in E·0.
2. **Domains:** buy **frratamail.com** for shops' order emails ($12.03/yr; frrata.shop stays storefronts only); `notify.frrata.com`
   for Frrata. The shared marketing domain waits for E·4.
3. **Marketing consent without a checkbox:** (A, recommended) marketing only to shoppers who tap "Email me new drops"
   (no box in checkout; DPDP-ready); (B) email every checkout address until 12 May 2027, then only tappers — two
   behaviours to build and a list that shrinks overnight.
4. **No Frrata mark in shoppers' emails**, on any plan (owner's branding rule). Recommended: none.
5. **Invoice:** a link to the shop's order page (download there), not an attachment. Recommended.
6. **New-order email to the team:** off by default, on per person; push (P·1) is the real answer. Recommended.
7. **Wallet packs and allowances:** ₹500 / ₹1,600 / ₹5,000 (10 / 8 / 5 paise an email) + GST; included Launch 5,000,
   Growth 10,000, Scale 25,000 a month. You asked for higher than cost: these are 3.5–7× SES's cost; the allowances keep
   small shops at or below Shopify. Recommended as written; lower allowances raise revenue but lose that comparison.

## Out of scope (and what brings each back)
Merchant SMTP/own ESP (Scale merchants asking for Klaviyo → an export) · HTML/code templates (a partner building
themes asks) · open tracking (never: Apple hides opens) · A/B tests (campaigns with > 10k subscribers) · BIMI (DMARC
at reject on frratamail.com, then a CMC) · SMS (DLT registration done for Frrata as telemarketer) · email attachments
(a CA asks for the PDF by email) · Hindi email words (a fluent review) · inbound email into the Inbox (C3 live).

## Facts used
All in `docs/research/2026-11-08-email-and-notifications.md`, recorded in `frata-integrations` 1.8.0 § Email and
§ Notifications (checked 2026-11-08).
