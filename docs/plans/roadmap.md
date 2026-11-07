# Frata roadmap

Status: proposed · 2026-11-06 · Approved: pending
Mockups: Phase A https://claude.ai/artifact/7mikx6osVqgKjs84oERW5k · Phase 1 https://claude.ai/artifact/QJ3N5knGqGZniMCsZJn7Fu

Order (owner, 2026-11-06): Admin (A1, A2) first, then Phase 1.

Goal: a small Indian fashion brand keeps more profit per delivered order, without
a developer (`frata-planning` § North star). Each phase is usable on its own and
gets its own research, spec and mockup before it is built.

| Phase | Name | Moves (ranked problem) | A merchant can… | Measure |
|---|---|---|---|---|
| 0 | Foundation | — | — (built 2026-11-06: tenancy, auth, console shell, gates) | Isolation proof green |
| A1 | Frata admin: staff access and merchants | — (enables onboarding) | (Frata) add merchants, see setup and usage, open a merchant's console in audited support mode, staff with 2FA, activity log | First merchant onboarded by hand |
| A2 | Plans and packages | — (the business) | (Frata) Launch/Growth/Scale with price, included orders, per-delivered-order fee, features; versions; assign/change | Every merchant on a plan version |
| 1 | First sale (spec active 2026-11-06) | 3, 4, 5 | set up a store, add products with size × colour and size charts, publish a shop, take COD and prepaid orders, confirm them | First product live < 15 min; first real order |
| 2 | Ship and confirm | 1 | confirm COD on WhatsApp within 5 min, ship with Shiprocket, track, work failed deliveries | RTO on confirmed vs unconfirmed COD |
| 3 | True profit | 6, 1 | see profit per order and per delivered order; RTO by pincode; send delivered orders to Meta | Merchant can name profit per delivered order |
| 4 | Fit and returns | 2 | run exchanges and returns with reasons; show fit feedback; size finder | Share of returns that are "size" |
| 5 | Channels | 4, 5, 6 | sync Instagram/Facebook and Google; WhatsApp abandoned bag; campaigns on delivered orders | Delivered orders per ₹ of ad spend |
| U | UX foundation (spec draft 2026-11-07, [mockup](https://claude.ai/artifact/QC3ujrncYJYjJMKhe6LvbC)) | 1, 3 (enabling) | (merchant and staff) one shell on every width, visible fields and focus, bottom bar on phones, the same calm motion; then Home as "Today" | Any page in ≤ 2 taps on a phone; 0 contrast and target failures (gates) |
| 6 | Run Frata | 7 | (Frata) charging merchants (Razorpay subscriptions), GST invoices, own domains, festive load test | 10× traffic, no error spike |

## Business track — start now (lead times of weeks)

1. Pvt Ltd (Meta, Google, Razorpay bind to the legal name).
2. Meta business verification → WhatsApp Tech Provider app review (needed by Phase 2).
3. Shiprocket: written answer on a platform partner agreement (needed by Phase 2).
4. Razorpay Partner Program, Aggregator type (Phase 6).
5. Shop domain: a cheap one now for `*.<domain>` subdomains, the final one before the first real merchant (owner, 2026-11-06).
6. DLT registration (entity, sender ID, OTP template) for shopper OTP (Phase 2; weeks of lead time).
7. Vercel Pro and Supabase Pro before any merchant takes a real order (Phase 1, owner call 7).
8. A lawyer reads the policy templates and grievance-officer wording once (Phase 1, owner call 13).
