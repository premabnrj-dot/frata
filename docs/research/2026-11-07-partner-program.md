# Partner program: developers, designers and agencies who bring their own clients

Status: research · Date: 2026-11-07 · Decided (owner, 2026-11-07): merchant owns the store; 20% for 24 months; F1–F3 now → spec `docs/specs/2026-11-07-partner-foundations.md` (F1 became `partner_links`, not a `tenants` column)
Not a spec yet. This answers *whether* and *how* to plan it, and what to lay down now.

## 0. Goal (frata-planning § North star)

A partner program does not move a ranked merchant problem directly. It is a
**distribution** decision: it lowers onboarding cost (unit-economics rule 7),
and a partner who stays with a merchant helps with problems 3 (catalogue ops)
and 5 (premium storefront), the "without a developer" half of the goal.
**Measure:** share of new merchants that arrive through a partner; partner-referred
merchants' 6-month retention and delivered GMV against direct merchants;
Frata's onboarding hours per partner-referred merchant.

## 1. What we must understand before planning

| # | Question | Why it decides the design | How we find out |
|---|---|---|---|
| U1 | **Who is the partner?** A freelance Shopify/WordPress dev, an Instagram-brand designer, a D2C growth agency (ads + catalogue), a photographer/stylist, or a consultant/CA | Devs want building tools. Agencies want reports and multi-store work. Referrers want only a link and a payout. One portal cannot serve all five on day one | 10 calls: 5 Indian Shopify freelancers, 3 agencies, 2 Instagram designers |
| U2 | **How are they paid by the client today?** One-off build fee (₹15k–₹1.5L), monthly retainer, or % of ad spend | If they already have retainers, our commission is a bonus. If they only get build fees, recurring commission is the reason to move clients to us | The same 10 calls |
| U3 | **What can a partner do on Frata that they can't on Shopify?** No theme code, no app store yet | Shopify pays partners 20% *and* lets them sell themes, apps and custom code. A no-code Frata removes the dev's billable work, so the commission and the services have to replace it | Show the mockup to the 10, ask what they would bill a client for |
| U4 | **Who owns the merchant relationship?** | Decides retention rules, what happens on a fight, data access (ADR-0002) | Owner decision (see § 6) |
| U5 | **Can we afford a share?** Contribution is thin until ~471 tenants (frata-unit-economics) | A share comes out of contribution, so it must be priced against what a direct sale costs us | `unit-economics-reviewer` on § 4 |
| U6 | **Tax and payout mechanics** (TDS on commission, GST on the partner's invoice, KYC) | Decides whether we can pay small partners at all and what the payout screen shows | A CA, once (§ 5) |
| U7 | **Do we bill the merchant ourselves yet?** | Commission is a share of revenue we collect. Phase 6 (Razorpay subscriptions, GST invoices) doesn't exist yet | Roadmap: commission payouts can't ship before Phase 6 |

## 2. How others do it (current sources only, dated)

| Program | Model | Taken |
|---|---|---|
| **Shopify Partners** | 20% recurring of the merchant's subscription, only if the partner builds a *development store* and transfers it. A client who signs up alone earns nothing. Monthly payouts via the Partner Dashboard. Limited-time bonuses ($500 per dev-store referral up to 10; Q4 2026 first-referral bonus). How long the share lasts conflicts between sources (lifetime vs ~4 years): **unverified**. [Shopify earnings FAQ](https://help.shopify.com/partners/help-support/faq/earnings), [Shopify for agencies](https://www.shopify.com/emea-rec-for-agencies), [referral offer 2026](https://www.shopify.com/recreferralofferdetails2026), checked 2026-11-07 | Attribution by **building the store**, not by a cookie. The partner sets it up and hands it over. That's the cleanest attribution there is, and it fits us |
| **Wix Studio Partner Program** | Terms updated 2026-01-01: points earned per site unlock levels. Level gates the benefits; Wix advertises 20%+ revenue share on Studio Premium sites (older reports: up to 30% at the top level). [Wix partner terms](https://www.wix.com/partner-program-terms-of-use), [Wix partners](https://wix.com/partners), checked 2026-11-07 | **Tiers by active clients**, so the rate rises with commitment. Partner-built sites get a workspace with all clients in one place |
| **Webflow** | Only a 2025 affiliate listing found (50% for 12 months). **No current source found** for agency terms | Nothing (unverified) |

What none of them do, and we can: **pay on the merchant's delivered GMV.** Our
fee is already a % of each delivered order (owner, 2026-11-06), so a partner's share of it
grows only when the client actually sells and delivers. The partner is then paid to cut RTO
and grow the brand, which is our own North star.

## 3. Recommended model

### 3.1 Three ways in, one program

| Track | Who | What they do | What they earn |
|---|---|---|---|
| **Referrer** | Anyone (consultant, CA, influencer, existing merchant) | Shares a link/code | One-time bounty after the merchant's **first 30 delivered orders** (not on signup, so no fake stores) |
| **Builder** | Freelance dev/designer | Builds the store in their own workspace and hands it to the client (the Shopify dev-store pattern) | Recurring share (§ 4) + their own fee to the client, which Frata never touches |
| **Agency** | 3+ active clients, does ongoing work | Builds *and* runs stores: catalogue, campaigns, NDR | Higher recurring share by tier, plus portal tools: all-clients view, reports |

Builder and Agency are the same thing at different tiers, so we build it once.

### 3.2 Attribution: the store is built by the partner, not clicked by the client

- A partner creates a **client store** from their portal. The tenant is created with
  `acquired_by_partner_id` set **at creation**, server-side, from the partner's own
  session (never from a URL or form, per ADR-0002's rule on where ids come from).
- The partner fills in the catalogue and theme, then **invites the client as `owner`**. The client
  accepts, picks a plan and starts paying. That moment, the **handover**, starts the share.
- The referral link (Referrer track) is a second, weaker path, honoured only for a
  store created through it within 60 days.
- **One partner per merchant**, recorded once and changed only through Admin (audited).

### 3.3 The merchant owns the store. The partner is a guest who earns.

This is the rule that makes everything else simple, and it protects us:
- The merchant is `owner`. The partner is a member with a new role, **`partner`**.
  It's scoped like `admin` but can't change billing or payouts, delete the store, or
  remove the owner.
- The **merchant can remove the partner** at any time. Access ends. The commission
  continues for a **notice period** (say 90 days) and then stops, *unless* the merchant
  names a new partner. This stops partners holding stores hostage and keeps them honest.
- A partner who leaves Frata takes nothing. The store, data and customers stay with the merchant.

### 3.4 Retention: why a partner keeps clients on Frata

Partners churn a client when the platform makes them look bad or stops paying.
So retention comes from four things:
1. **Recurring money that grows with the client.** A share of the delivered-order fee
   means the partner's income rises when the client's sales rise. That's the opposite of
   a one-off build fee.
2. **Make the partner look good to the client.** A monthly, partner-branded client report
   (delivered orders, RTO saved, profit per delivered order, all from
   `src/domains/orders/profit.ts`, never recomputed) that the partner sends as *their*
   work. This is the cheapest and strongest retention lever.
3. **Early warnings in the portal.** Per client: setup incomplete, RTO rising, NDR
   piling up, plan at its order flag, payment failing. The partner sees a client in trouble
   before the client thinks of leaving.
4. **Paid service lines on top of Frata:** a "Hire a partner" directory for direct
   merchants (catalogue shoots, campaign setup, store design), with leads routed to
   partners by tier and rating. Frata takes **no cut of the partner's own fees** in year 1.

## 4. Commission: what to adopt

Frata's revenue per merchant = plan fee + % of delivered merchandise_net
(frata-unit-economics rule 4). The share is a % of **what Frata actually collected
from that merchant in the month, excluding GST and pass-through costs** (WhatsApp is billed
by Meta to the merchant, so it's never part of the base).

| Tier | Active paying clients | Share of Frata revenue | Duration |
|---|---|---|---|
| Partner | 1–4 | **20%** | 24 months from handover per client |
| Silver | 5–14 | **25%** | 24 months |
| Gold | 15+ | **30%** | 24 months, then 10% for life while still the client's partner |

Plus a **first-client bounty** (e.g. ₹2,000 after 30 delivered orders) to get a partner
over the first-store hump.

Why these numbers (hypotheses, per frata-unit-economics rule 1):

| Figure | Value | Source / reasoning | Date | Test |
|---|---|---|---|---|
| Base share | 20% | Matches Shopify (20%), Wix (20%+), so it doesn't lose the comparison | 2026-11-07 | 10 partner calls: is 20% of a smaller bill enough to switch? |
| Launch merchant, Frata revenue | ≈ ₹4,380/mo | ₹1,499 + 2% × (120 delivered × ₹1,200 net) = ₹1,499 + ₹2,880 | model | Real merchants' delivered GMV |
| Partner share on it | ≈ ₹876/mo | 20% | model | — |
| Growth merchant, Frata revenue | ≈ ₹19,400/mo | ₹4,999 + 1% × (1,200 × ₹1,200) | model | — |
| Partner share on it | ≈ ₹3,880–5,820/mo | 20–30% | model | — |
| Cap on duration | 24 months | Limits a permanent liability while contribution is thin (break-even ~471 tenants) | 2026-11-07 | `unit-economics-reviewer` |

**A worked case.** A Silver agency with 10 Launch clients earns ~₹11,000/month,
and ~₹48,500 if the same 10 are on Growth. That's on top of what they bill the clients.
On Shopify, 20% of ₹1,994 Basic is ~₹400/month per client. Our share is larger
because our fee is larger and it rides on delivered orders, which is the pitch.

**Not recommended:** a share of GMV *itself* (we'd pay out more than we earn on low-margin
months); paying on signup (fake stores); lifetime 30% (an unbounded liability before break-even);
discounts the partner resells (it breaks "one plan version per merchant", Phase A2).

Run `unit-economics-reviewer` on this table before it becomes a spec. It may say 20%
must start at 15% until contribution per ₹100 is measured (current model ₹10.3, unvalidated).

## 5. Payouts

**Rule: pay from collected revenue only, a month in arrears, after the return window.**

1. **Monthly statement on the 5th** for the previous month: per client, Frata revenue
   collected → share % → commission. It's derived from Phase 6 invoices, never typed in.
   A refund or credit note in a later month is a negative line (clawback), never a
   recomputation of a closed month.
2. **Hold period.** The delivered-order fee is only final once the order is delivered and past
   the return window, so commissions on a month are payable after **30 days**. A statement
   for October pays on ~5 December.
3. **Minimum payout ₹1,000.** Below that it carries forward.
4. **Rails:** RazorpayX Payouts (IMPS/NEFT/UPI) to a verified bank account, through the
   outbox (ADR-0006: the payout is a row before it's a request; idempotency key = statement id).
   Razorpay Route isn't the fit: it splits a *shopper's payment*, while this is Frata paying from
   its own revenue.
5. **KYC before the first payout:** PAN (required for TDS), bank account (penny-drop
   verified), GSTIN if they have one, and the partner agreement accepted with a timestamp.
6. **Tax (confirm with a CA before building):**
   - TDS on commission: old s.194H, now under the Income-tax Act 2025 (Razorpay's tax-code
     list maps it to s.393(1) code 1006,
     [razorpay.com/docs/payroll/tax-verifications/tax-codes](https://razorpay.com/docs/payroll/tax-verifications/tax-codes.md),
     checked 2026-11-07). Rate (2% after the Oct-2024 cut) and threshold (₹20,000/yr) are
     from memory: **verify**. The statement shows gross, TDS, net, and Form 16A quarterly.
   - GST: a GST-registered partner invoices Frata with 18% GST and Frata claims input credit.
     An unregistered partner is paid without GST. Use **self-billed invoices** generated on the
     statement so partners don't have to raise them (a CA confirms that this is allowed).
7. **What a partner reads:** "₹8,420 for October · pays 5 Dec · 3 clients · TDS ₹168". One
   number per month, and the clients behind it.

## 6. Onboarding and the multi-client portal

### Onboarding (a partner live in a day)
1. Apply: name, work links/Instagram, city, how many clients a year, specialities.
2. Frata approves (Admin, by hand at first: quality matters more than volume early).
3. Partner agreement (commission, notice period, conduct, no spam, DPDP: they act on
   the merchant's behalf and never export shopper data for their own use).
4. A **sandbox store** to learn on (seed data, never live payments).
5. First client store → handover checklist → first-client bounty.
6. Payout details collected only when the first commission is due (less friction up front).

### The portal (a fourth surface, `/partner`, or a mode of the console)
- **Clients:** one row per store. Stage (building / handed over / live / at risk),
  delivered orders this month, plan, this month's commission, last activity. Primary action: **Open store**.
- **Open store** = a normal console session for that tenant as a `partner` member.
  The console already returns a list of memberships per user (`app_access_for`, Phase A),
  so switching between stores is a switcher on what exists, not a new cross-tenant path.
- **Earnings:** statements, payouts, TDS certificates.
- **Grow:** referral link, "Hire a partner" leads, client report export.
- **Team (Agency tier):** invite staff to the agency; each is added to chosen client stores.

**Tenancy (ADR-0002) stays intact:** a partner never reads across merchants
through a special role. Every client is a separate `members` row, and every page is
`withTenant()` for one tenant at a time. The one cross-tenant view, the Clients list and earnings,
reads **Frata's own data about the partner** (partner table, attribution, statements),
plus a small per-client summary written by a job. It never reads merchant rows directly. That
summary path is the one thing the `tenancy-auditor` must review.

## 7. Too early, or start now?

**Plan now, lay three cheap foundations now, build the portal and payouts after Phase 6.**

You're right that partners can drive sales. For a no-developer product sold to small
Indian brands, the people those brands already trust are the freelancers who built their
Shopify or Instagram shop. But a commission paid before we bill merchants (Phase 6), and
before contribution per ₹100 is measured, is a promise we can't price yet. Retrofitting
attribution later, though, is painful and causes disputes. So:

| Now (cheap, avoids a painful retrofit) | Next (with Phase 2–3, by hand) | After Phase 6 (billing exists) |
|---|---|---|
| **F1** `tenants.acquired_by_partner_id` + `partners` table (Frata-owned, not tenant data), set at creation in Admin A1 | 3–5 **design partners**, hand-picked, signed agreement, onboarding by hand | Partner portal: clients, earnings |
| **F2** `partner` as a fourth member role, with its permission set defined in `src/domains/tenancy/roles.ts` | Commission tracked in a sheet; paid by hand, invoice + TDS by the CA | Statements derived from invoices; RazorpayX payouts via the outbox |
| **F3** Store switcher in the console shell (U) for users with more than one membership (owners with two brands need it too) | Client report v1 = the Phase 3 profit page, exported | Tiers, directory, referral links |

Design partners also do something better than any survey: they onboard real merchants
before we've built self-serve onboarding, which is the exact cost line (rule 7) the
program exists to cut.

## 8. Decisions the owner needs to make

1. Who owns the merchant: merchant (recommended) or partner?
2. Base share 20% for 24 months (recommended), or a lower 15% until contribution is measured?
3. Does F1–F3 go into the current phases (A1 / U), or wait?
4. Pick 3–5 design partners: names you already know?
5. Portal as its own surface (`/partner`) or a mode of the console? (Recommended: console mode
   first, since it reuses the shell and gate, and split it later only if partners need a different look.)

## Next steps if approved

`unit-economics-reviewer` on § 4 → `tenancy-auditor` on § 6 (the summary path) →
spec `docs/specs/YYYY-MM-DD-partner-foundations.md` for F1–F3 → mockup → sign-off,
per `frata-planning`.
