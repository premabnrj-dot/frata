# Research — email and notifications (Frrata → merchants; merchant → shoppers)
Date: 2026-11-08 · For: `docs/specs/2026-11-08-messaging.md` · By: four agents (email infrastructure, India rules and
channels, product UX, the codebase), facts checked 2026-11-08. [V] primary or vendor page, [V-undated] vendor page
with no date of its own (read live today), [S] secondary, [U] unverified or no current source.

## 1. What Frrata has today (codebase, 2026-11-08)
- **One sender:** Supabase's sign-in email (`src/lib/auth/send-link.ts:15`), reused for Admin adding an owner,
  partner approval and handover. Supabase's built-in sender allows a few an hour; no custom SMTP yet.
- **Nothing else tells anyone anything:** no order email or WhatsApp (graph.ts has no send call), no billing notice
  (spec `2026-11-08-billing.md:99` wants each notice to be an outbox row; "email provider" is an open owner call,
  plan `:141`), no notice when Frrata stops an offer, pauses a module, recalls a theme, changes a plan or opens a
  support visit, none for Razorpay key problems (`markProblem` has no caller) or WhatsApp health.
- **Shoppers have no email:** checkout asks phone, name and address only (`src/domains/checkout/address.ts:19-28`;
  a Phase 1 decision). No consent table or field exists anywhere.
- **The outbox is ready and empty:** `enqueue` in the change's transaction, `SENDERS` registry empty, module gate
  per row (`outboxDecision`: send, defer, drop), `drainSoon` not called yet, daily cron as safety net.
- **Branding already assembled:** `brandFor()` (`src/lib/documents/brand.ts:15`) gives name, accent, logo, contact;
  `shop_settings` holds logo, accent, tagline, support email and phone, WhatsApp, legal name, address, grievance
  officer, GSTIN, order prefix. Custom domains have a table (`tenant_domains`) and no UI.
- **Domains:** frrata.com bought 2026-11-08 (brand spec); `CONSOLE_HOST` app.frata.in, `SHOP_DOMAIN` frata.store
  (not bought; B·4 moves shops to frrata.com).

## 2. Sending infrastructure
| Fact | Status | Source (date) |
|---|---|---|
| SES runs in ap-south-1 (Mumbai): API, SMTP `email-smtp.ap-south-1.amazonaws.com`, feedback endpoint | V-undated | docs.aws.amazon.com/general/latest/gr/ses.html |
| SES price: à la carte $0.10/1,000; new accounts start on Essentials $0.16/1,000 from 21 Jul 2026 (switchable) | V-undated | aws.amazon.com/ses/pricing |
| SES tenants: $0.005/tenant/month + $0.005/1,000; per-tenant reputation and auto-pause (Standard/Strict/None); up to 10,000; "combined sending activity still affects your overall account reputation" | V-undated | docs.aws.amazon.com/ses/latest/dg/tenants.html |
| SES suppression per tenant: "Configuration Set > Tenant > Account" | V | AWS blog, 2026-07-07 |
| SES domain by API: `CreateEmailIdentity` → 3 DKIM CNAMEs; custom MAIL FROM = MX + SPF TXT; events via SNS/EventBridge (bounce, complaint, delay) | V-undated | ses dg creating-identities, mail-from, event destinations |
| SES default quota 200/day, 1/s (sandbox), adjustable | V-undated | ses quotas |
| Resend: no India region; single-account tenants share reputation; complaint rate < 0.08% or shut "without warning" | V-undated / V 2026-10-13 | resend.com docs, AUP |
| Postmark: transactional and broadcast streams on separate infrastructure; $18 + $1.20/1,000 | V 2026-10-26 / V-undated | postmarkapp.com |
| ZeptoMail: transactional only ("not intended for … marketing") | V-undated | help.zoho.com |

**Mailbox providers.** Gmail: every sender SPF or DKIM, spam rate under 0.3%; bulk (~5,000 a day to personal
accounts, **counted per primary domain, subdomains together, permanent**): SPF + DKIM + DMARC aligned, one-click
unsubscribe on marketing ("Transactional messages are excluded"), spam under 0.10%; enforcement ramped from Nov 2025
[V-undated, support.google.com/a/answer/81126 and /14229414]. Yahoo: RFC 8058 one-click, unsubscribes honoured
within 2 days [V-undated]. Microsoft: 5,000+ a day → SPF, DKIM, DMARC pass or 550 5.7.515, effective 5 May 2025
[V-undated / S]. BIMI needs DMARC quarantine/reject at 100% and a VMC/CMC certificate [V 2026-10-26]: cosmetic, later.

**How Shopify does it** [V-undated, help.shopify.com]: the merchant's sender address is rewritten to
`store+123@shopifyemail.com` until their domain is authenticated (CNAMEs; DMARC `p=none` minimum by the merchant;
"I updated DNS records"; up to 48 h; "Update recommended" when records go missing). Wix falls back to its own
authenticated domain the same way. Shopify Messaging (was Shopify Email): 10,000 free a month, then $1 / $0.65 /
$0.55 per 1,000; abandoned-checkout emails free. Warm-up: 5× normal volume in a day triggers throttling; grow
20–30% a week, 4–6 weeks before a campaign.

## 3. India: rules and channels
| Fact | Status | Source (date) |
|---|---|---|
| DPDP Rules G.S.R. 846(E), gazette 13 Nov 2025 (notified 14 Nov): r.4 consent managers after 1 year; r.3, 5–16 after 18 months — plan for **12 May 2027** | V gazette / S AZB 2025-11-14 | dpdpa.com gazette scan; PIB 2025-11-17 |
| Consent must be "free, specific, informed, unconditional and unambiguous with a clear affirmative action" (s.6(1)); a pre-ticked box fails | V text (Act 2023) / S reading | dpdpa.com s.6 |
| s.7(a): sending a receipt to someone who gave their details for it needs no consent; marketing does | V text / S reading (LiveLaw, Bar & Bench) | dpdpa.com s.7 |
| Notice (r.3): itemised data, purpose, a way to withdraw "comparable" in ease to giving | V | gazette r.3 |
| Fiduciary answers for its processors; processing only under a contract (Frrata = processor, merchant = fiduciary) | V | Act s.8; r.6(1)(f) |
| Breach (r.7): each person without delay; the Board within 72 h. Logs kept ≥ 1 year (r.8(3)). Under-18: parental consent (r.10) | V | gazette |
| No Indian law or rule on commercial **email** found | U | — |
| SMS: each brand registers on DLT as a principal entity (header, templates); variables tagged, links whitelisted or rejected (18 Nov 2025); misused headers suspended in 6 h; inquiry consent lasts 7 days (Third Amendment, 18 Sep 2026); ~₹0.16–0.25 + GST | V TRAI PR 119/2026, 133/2025 / S | trai.gov.in |
| WhatsApp India: marketing ₹0.8631, utility ₹0.115 (+GST) | S | freepressjournal.in, 2026-09-30 |
| WhatsApp per-user marketing limit adapts to engagement (error 131049: wait 24 h); Cloud API stops marketing 13 Oct 2027 → Marketing Messages API | V-undated | developers.facebook.com |
| Web push: iOS 16.4+ only as a Home Screen web app; ask from a tap; a push not shown makes Safari revoke permission; Chrome rate-limits disruptive senders (≥ 1,000/min) | V-undated / V 2026-01-06 | developer.apple.com; developer.chrome.com |
| A push subscription belongs to one origin's service worker (a shop moving domain loses its subscribers) | V spec / U wording | w3c push-api |

## 4. Products (UX)
- **Shopify notifications** [V-undated]: on by default; one logo + accent for all; Liquid code to edit (no visual
  editor); Preview, Send test (to the signed-in admin), Revert (wording only). *Taken:* defaults that work, one brand
  setting, Preview · Send test · Revert — but wording edited in fields, never code.
- **Shopify Messaging / Klaviyo** [V-undated; Klaviyo V 2026-10]: block editor with the shop's branding applied;
  consent states (subscribed, not, pending, unsubscribed, invalid); four first flows (welcome, abandoned checkout,
  post-purchase, win-back), each stopping when the shopper orders; Smart Sending skips a person emailed in the last
  16 h, transactional never skipped; suppression (bounce, complaint, by hand) separate from consent. *Taken:* all of it,
  later phases.
- **Interakt, Shiprocket Engage 360** [V 2026-09-17, 2026-08-24]: WhatsApp first for order updates; COD confirm in the
  message synced to the order; segments named for the problem ("Unconfirmed orders"); price = plan + Meta's per
  message. *Taken:* WhatsApp-first for COD (already M2·1 C2); email is the receipt and the fallback.
- **Vercel, Linear, Stripe** [V 2026-09-14 / V-undated]: an in-app inbox that always receives; email per type;
  critical notices (invoice payment failed, security) cannot be turned off, at most one channel dropped; no email if
  already read in-app. *Taken:* Frrata's notices to merchants work this way.
- **Baymard** [V, updated 2026-05-05]: a shipping email names the carrier, gives the delivery date, lists the items;
  link to the shop's own tracking page, not the carrier's. Confirmation email = proof of purchase.
- **Dark mode** [S, courier.com 2026-08-21]: Apple 62% of opens (Litmus Jul 2026); Gmail iOS inverts; logos on a
  solid plate; ship the color-scheme meta.

## 5. Could not verify
SES Service Terms on sending for other businesses and SNS signature verification (settle before the events route);
ZeptoMail price; SendGrid/Brevo tier prices; current NN/g or Litmus guidance on block editors (older than 12 months);
DPDP exact start day (12 or 13 May 2027); email data residency or GST-invoice-by-email rules in India (a CA to
confirm); web push opt-in rates.
