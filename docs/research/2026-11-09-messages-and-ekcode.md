# Messages (WhatsApp for merchants) and EkCode — one system, two senders
Date: 2026-11-09 · By: three research agents (codebase map; Meta platform, `integration-researcher`; market) ·
For: the owner's question "keep communication independent or integrate within EkCode?" · Brief:
`docs/mockups/2026-11-09-messages-and-ekcode.html`. Status tags as in `frata-integrations`: [V] primary page with a date,
[V-undated] primary page without one (read 2026-11-09), [S] secondary, [U] unverified.

## 1. The question
The owner wants an Interakt-style communication product (inbox, order and COD messages, cart recovery, broadcasts,
automations) on the merchant's own number, and asks whether it belongs inside EkCode (the approved shopper sign-in
brand with its own number) or beside it. Goal: the least friction for merchants, Frrata owning the complexity.

## 2. What exists today (codebase)
- **Built: Messages C1 only** — connect a number (Embedded Signup v4, coexistence), health and "needs you", disconnect
  (`src/lib/modules/communication/`, `src/app/(console)/console/apps/communication/`), the webhook route
  (`/api/webhooks/whatsapp`, signed), `wa_connections` (one open number per shop), template create/state/send in
  `graph.ts`. The only sender is Reviews' `review:ask` (module still `next`), so nothing reaches a shopper yet.
- **Planned, not built:** C2 order messages (`cod_confirm`, `order_confirmed`, `shipped`, `out_for_delivery`,
  `delivered`, `delivery_failed`; "Confirm order" reply confirms COD), C3 team inbox, C4 automations; cart flows and
  broadcasts on the Marketing Messages API (roadmap 2027). Spec `docs/specs/2026-11-07-communication.md`, plan
  `docs/plans/2026-11-07-m2.md`.
- **Gaps found:** the product roadmap marked "order updates, one inbox" as built (fixed today); consent lives in three
  places (`orders.wa_opt_in_*` live, a planned `consents`, EkCode's planned `customer_consents`); `wa_opt_outs` sits in
  the Reviews module; the live checkout tick names the shop while EkCode adds a second tick — a shopper could see two;
  `processWhatsApp` reads 200 rows and never marks inbox items processed, so health events can starve; e2e
  `46-messages` is flaky.

## 3. What Meta allows (checked 2026-11-09)
- **One business, one Messaging account; no impersonation** [V, policy 2026-09-23]. EkCode's number may send only
  EkCode's own messages (sign-in, utility "via EkCode"). A shop's marketing must come from the shop's own number.
- **Who bills messages** [V-undated]: a Tech Provider (Frrata today) has no credit line — Meta bills the merchant, the
  Tech Provider "will bill for other services". A Multi-Partner Solution with a Solution Partner (BSP) shares the BSP's
  credit line (the merchant adds no card), but the BSP is "Bill To Party"; no Meta page lets a Tech Provider invoice
  message fees; Terms §4.1(c) forbid reselling the platform [V, 2026-09-23]. BSP programs (Gupshup ~$0.001 a message
  plus WhatsApp at cost; 360dialog requires MPS) are vendor pages only [S].
- **Marketing** moves to the Marketing Messages API (GA 19 Nov 2025, India unrestricted, Tech Providers may onboard
  clients, same billing) [V]; Cloud API marketing stops 13 Oct 2027 and is unavailable to accounts created from
  13 Apr 2027 [V-undated]. Per-user marketing limits apply in India (131049: wait 24 h) [V-undated].
- **Prices** (India, before GST) marketing ₹0.8631, utility/authentication/service ₹0.115 [S]; in-window utility is
  charged from 1 Oct 2026; 1,000 free service messages a number a month; a Click-to-WhatsApp window "up to 7 days" is
  free [V-undated].
- **Commerce in chat** [V-undated]: Payments API India (Razorpay, PayU, Billdesk, Zaakpay; payment links from Razorpay),
  `order_details`/`order_status`, Flows (forms) in templates, CAPI for business messaging with OrderDelivered,
  OrderReturned, OrderCanceled, CartAbandoned — campaigns can be judged on delivered orders.
- **Coexistence** (Business app + API on one number) in India since 2025-05-05 [V]; 20 msg/s, broadcast lists
  read-only, groups not synced, 180 days of history, disconnects after ~14 days without opening the app; several
  partners may share one number (multi-solution conversations) [V].
- **Login**: nothing new changes EkCode — authentication templates still need a phone number [V-undated].

## 4. What the market does (sources 2025-12 to 2026-10, mostly [S])
| Product | Shape | Price | Billing |
|---|---|---|---|
| Interakt | inbox, catalog, COD-to-prepaid, cart recovery, CTWA | $55–69/mo + ~20–25% markup | prepaid credits |
| WATI | inbox, broadcasts, bots | ₹2,999–18,499/mo + 18–30% | credits (unused not refunded) |
| AiSensy | broadcasts, bots | from ~₹1,500/mo, utility billed ₹0.145 | prepaid credits |
| Gallabox / Zoko / DoubleTick | inbox, COD flows | ₹999–$170/mo, "0%" markup claims | wallet or subscription |
| GoKwik KwikEngage + KwikPass | two separate apps, linked data | $40/mo + usage; KwikPass 5k logins free | usage; "wallet drained" reviews |
| Shiprocket Engage | COD confirm, NDR, cart | ₹2.49 per order (Shopify) | per order; rated 2.3 |
| Shopify Messaging | WhatsApp marketing (2026-07-29) | ~2× Meta's rate | Shopify bills |
| WhatsApp Business app | free; Business AI in India 2026-05-14 | free | — |

**No vendor sends merchant marketing under its identity-network brand.** GoKwik and Razorpay keep login and
messaging apart, sharing data underneath. Merchant pain, ranked: number restrictions and quality drops; templates
rejected or reclassified to marketing (a discount line turns an order update into a ~7.5× price message); wallets,
credits and markups; losing the app after API migration; one Tech Provider restriction taking down every connected
merchant (Meta forum, 2026-07 to 10); slow onboarding (250 a day until verification); support ping-pong.

## 5. Options
- **A. Merge Messages into EkCode (EkCode sends everything).** Rejected: Meta's one-business rule and impersonation
  ban forbid a shop's marketing from EkCode's number; every shop's broadcasts would share one quality rating; consent
  is per shop; shoppers would not know who is writing.
- **B. Two independent products.** Works, but duplicates contacts, consents, opt-outs, templates, sending and webhooks,
  and shows two WhatsApp ticks at checkout.
- **C. One messaging engine, two senders (recommended).** EkCode stays the shopper-facing identity brand and the
  zero-setup sender for transactional messages; Messages is the merchant's own-number product (Interakt-like). Below
  the brands, one system: one contact and consent model per shop, one sender rule, one template engine, one send
  pipeline, one webhook router, one Admin health view.
- **D. Resell messages through a Solution Partner (MPS).** Removes the card step in WhatsApp Manager and opens "max
  price"; does not let Frrata bill message fees without counsel; adds a contract and a dependency. Later option.

## 6. Recommended design (option C)
**A ladder, each rung one tap:**
1. **Day one, nothing to set up** — EkCode: sign-in, prefill, transactional order updates from EkCode's number within
   the plan's allowance (approved spec).
2. **Connect your number** (Embedded Signup, coexistence by default: the merchant keeps the WhatsApp Business app and
   180 days of history) — order updates switch to the shop's own number and name automatically, plus COD
   confirmation by reply, the team inbox, quick replies.
3. **Grow (Growth and up)** — cart recovery, back in stock, broadcasts on the Marketing Messages API from day one,
   Click-to-WhatsApp ads judged on delivered orders (CAPI OrderDelivered), payment links in chat.

**One sender rule** (pure, `src/domains/messaging/route.ts`): for each message — *marketing* goes only from the
shop's own number, through the Marketing Messages API, with the shopper's marketing consent for that shop; a
*transactional* message goes from the shop's number when connected and healthy, else from EkCode's number when the
shopper opted in and the allowance has room, else by email; *sign-in* only from EkCode's number. The merchant never
chooses a sender; the console shows which one was used.

**One consent and contact model per shop**: `shop_customers` (EkCode's pairwise contact) is the shop's contact book;
`customer_consents` holds order updates, WhatsApp marketing and email marketing per shop with notice version and time;
opt-outs per sender (a Stop to the shop's number stops that shop; a Stop to EkCode stops EkCode's updates). EkCode's
network data is never used for marketing (ADR-0009 point 6). One checkout tick, worded by sender.

**One template engine**: order templates generated from the order-state engine (`order-state.ts`), linted before
submit (no price, offer or link that would make Meta call it marketing), created in the merchant's account on connect
and in EkCode's account once.

**Billing**: Meta bills the merchant directly for their own number — no wallet, no markup (a selling point against
Interakt's 20–25%); Frrata's console shows Meta spend per category beside delivered orders and profit. Messages'
inbox and order messages are in every plan; automations and broadcasts from Growth (registry `cart_flows` already
says so). MPS with a Solution Partner is evaluated once merchants ask to skip the card step.

**Safety**: EkCode's number in its own Meta business portfolio, outside the Tech Provider's, so one restriction cannot
take down both (and EkCode's daily limit is not shared with merchant sign-up codes); a 131049 back-off; quality and
block rate on the console; a breaker per shop on EkCode's number (approved).

**Why Frrata wins here**: it owns the store, checkout and order states, so messages are triggered by real events with
no setup, judged on delivered orders, tied to COD risk (RTO Shield) and profit — the things a bolt-on tool cannot see.

## 7. Phases (each its own spec and mockup)
- **M·1 Order messages** (C2): the sender rule, consent model, template engine, `whatsapp.send` outbox kind, COD
  confirmation by reply, the order-page message card; EkCode's order updates ride the same pipeline.
- **M·2 Team inbox** (C3), fixing `processWhatsApp` first.
- **M·3 Grow**: cart recovery and broadcasts on the Marketing Messages API, consent capture, frequency caps.
- **M·4 Ads and payments**: Click-to-WhatsApp with CAPI delivered events, payment links in chat, Flows for address and
  COD.

## 8. Decisions for the owner
1. Option C: Messages beside EkCode, one engine underneath.
2. EkCode's number in its own Meta business portfolio (changes `docs/setup.md` EkCode B2).
3. Billing: Meta bills merchants directly now; a Solution Partner (MPS) later only to remove the card step.
4. Plan placement: inbox and order messages in every plan; automations and broadcasts from Growth.
5. Order: finish EkCode P1 first, then M·1 (which also carries EkCode's order updates), M·2, M·3, M·4.

## Could not verify
India rate card on Meta's own page; who invoices the merchant under MPS; Solution Partner requirements beyond "a
lengthy process"; the BSUID page's 5 Nov 2026 update; Bik and QuickReply prices; whose name shoppers see on
KwikEngage messages.
