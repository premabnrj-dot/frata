# Frata roadmap

Status: proposed · 2026-11-06 · Mockup: https://claude.ai/artifact/NvAiqDdfikTq97hFtUfFYX · Approved: pending

Goal: a small Indian fashion brand keeps more profit per delivered order, without
a developer (`frata-planning` § North star). Each phase is usable on its own and
gets its own research, spec and mockup before it is built.

| Phase | Name | Moves (ranked problem) | A merchant can… | Measure |
|---|---|---|---|---|
| 0 | Foundation | — | — (built 2026-11-06: tenancy, auth, console shell, gates) | Isolation proof green |
| 1 | First sale | 3, 4, 5 | set up a store, add products with size × colour and size charts, publish a shop, take COD and prepaid orders, confirm them | First product live < 15 min; first real order |
| 2 | Ship and confirm | 1 | confirm COD on WhatsApp within 5 min, ship with Shiprocket, track, work failed deliveries | RTO on confirmed vs unconfirmed COD |
| 3 | True profit | 6, 1 | see profit per order and per delivered order; RTO by pincode; send delivered orders to Meta | Merchant can name profit per delivered order |
| 4 | Fit and returns | 2 | run exchanges and returns with reasons; show fit feedback; size finder | Share of returns that are "size" |
| 5 | Channels | 4, 5, 6 | sync Instagram/Facebook and Google; WhatsApp abandoned bag; campaigns on delivered orders | Delivered orders per ₹ of ad spend |
| 6 | Run Frata | 7 | (Frata) staff console with expiring support access, billing, own domains, team invites, festive load test | 10× traffic, no error spike |

## Business track — start now (lead times of weeks)

1. Pvt Ltd (Meta, Google, Razorpay bind to the legal name).
2. Meta business verification → WhatsApp Tech Provider app review (needed by Phase 2).
3. Shiprocket: written answer on a platform partner agreement (needed by Phase 2).
4. Razorpay Partner Program, Aggregator type (Phase 6).
5. Shop domain for `*.<domain>` subdomains (Phase 1, owner call 1).
