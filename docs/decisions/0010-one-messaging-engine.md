# ADR-0010: Messages beside EkCode — one messaging engine, two senders

Status: accepted (owner, 2026-11-09) · research `docs/research/2026-11-09-messages-and-ekcode.md` · brief
`docs/mockups/2026-11-09-messages-and-ekcode.html` · builds on ADR-0006, ADR-0008, ADR-0009

## Context
Messages (the merchant's own WhatsApp number: order and COD messages, inbox, cart recovery, broadcasts — an
Interakt-style product) was planned before EkCode (ADR-0009: the shopper identity brand with its own number). Only
Messages C1 (connect, health) is built. The owner asked whether communication belongs inside EkCode. Meta allows one
business per Messaging account and forbids speaking for another business; no product in India sends merchant
marketing under its identity-network brand; a Tech Provider restriction has taken down all of a provider's merchants
at once.

## Decision (owner, 2026-11-09: "go with your recommendations")
1. **Two products, one engine.** EkCode stays the shopper-facing identity brand and the zero-setup sender of
   transactional messages; **Messages** is the merchant's own number, in the shop's name. Below both: one contact and
   consent model per shop, one sender rule, one template engine, one send queue (`whatsapp.send`), one webhook router,
   one Admin view.
2. **The sender rule** is one pure function (`src/domains/messaging/route.ts`): marketing only from the shop's own
   number, through the Marketing Messages API, with that shop's marketing consent; transactional from the shop's
   number when connected and healthy, else EkCode's number when the shopper opted in and the allowance has room, else
   email; sign-in codes only from EkCode's number. The merchant never picks a sender.
3. **One consent model per shop** (`customer_consents`: order updates, WhatsApp marketing, email marketing, each with
   notice version and time; opt-outs per sender). EkCode's network data is never used for marketing. One checkout
   tick, worded by sender.
4. **EkCode's number lives in its own Meta business portfolio**, outside the Tech Provider's.
5. **Billing:** Meta bills merchants directly for their own number — no markup, no wallet; Frrata's fee is the plan.
   A Solution Partner (Multi-Partner Solution) only if the card step stops merchants.
6. **Plans:** inbox and order messages in every plan; cart recovery, broadcasts and Click-to-WhatsApp ads from Growth.
   Marketing is built on the Marketing Messages API from the start (Cloud API marketing ends 13 Oct 2027).
7. **Order of work:** EkCode P1 → M·1 order messages (EkCode's order updates ride the same pipeline) → M·2 inbox →
   M·3 grow → M·4 ads and pay in chat; each with its own mockup.

## Consequences
- The communication spec (`docs/specs/2026-11-07-communication.md`) and plan `docs/plans/2026-11-07-m2.md` are re-cut
  under this decision before M·1: their `consents` table becomes `customer_consents`; their templates come from the
  template engine; `wa_opt_outs` moves out of Reviews.
- EkCode P1 builds the pieces M·1 reuses (`customer_consents`, `shop_customers`), shaped for both from the start.
- One more Meta business verification (EkCode's portfolio).
