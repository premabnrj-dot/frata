# M2·1 Communication: connect WhatsApp, order messages, a team inbox
Status: draft · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/GuKHwcfZDU47yrZbK4AjR9 (screens 4–11) · Approved: owner chose Communication as the first module (2026-11-07); spec pending
> **Re-cut under ADR-0010 (2026-11-09) before M·1:** Messages sits beside EkCode on one engine (sender rule, `customer_consents`, template engine, `whatsapp.send`). Where this draft disagrees, ADR-0010 wins.
Depends on: `docs/specs/2026-11-07-modules-foundation.md` (it is the first module in the registry).
Facts: § Facts used. All checked 2026-11-07 against Meta's docs by `integration-researcher`.

## Goal
Problem 1 (COD/RTO) first: every COD order is confirmed on WhatsApp within 5 minutes, and the shopper's
reply moves the order. Then a shared inbox so a small team answers customers without passing one phone
around. **Measures:**
- RTO on WhatsApp-confirmed vs unconfirmed COD orders (the roadmap's Phase 2 measure)
- median first reply time in the inbox
- the share of merchants who connect a number within a day of turning Messages on

## Job
A brand connects its own WhatsApp Business number in a few minutes, keeping its phone app if it wants.
Its shoppers get order updates there and reply to confirm. Its team answers every chat in one inbox,
each person seeing who handles what.

## Research (dated)

**How connecting works (Meta, 2026-11-07):**
- **Embedded Signup v4 only** (v2/v3 deprecated 15 Oct 2026). In a Meta popup the merchant picks or
  creates their business and verifies the number first.
- Frata receives the account ids (`waba_id`, `phone_number_id`) and a code. The server exchanges the code
  for a token scoped to that merchant.
- Then Frata subscribes its app to the account, registers the number with a 6-digit PIN (10 tries per
  72 h), and the merchant adds a payment method in WhatsApp Manager. **Meta bills the merchant; a Tech
  Provider has no credit line.**

**Coexistence:**
- A number already on the **WhatsApp Business app** can be connected and keep working in the app (app
  2.24.17+). Chats from the last 6 months can be imported once, within 24 h of connecting.
- Messages the merchant sends from the phone arrive as `smb_message_echoes`.
- Throughput is fixed at 20 msgs/s. Broadcast lists become read-only, groups don't sync, and companion
  devices are unlinked.
- It disconnects after about 14 days without opening the app.
- Available in India per vendors only; Meta's page is silent [S].

**New account model** (GA 23 Sep 2026): a WhatsApp account holds the number, and each partner gets its own
Messaging account. **A number can't be migrated from another provider**; the merchant *shares* its
WhatsApp account with Frata instead.

**Pricing:**
- Per message since Jul 2025. **From 1 Oct 2026, utility and service messages inside the 24 h window are charged.**
- The first 1,000 service messages per number per month are free.
- India, before GST: utility ₹0.1150, marketing ₹0.8631 [S].
- India accounts must bill in INR by 31 Dec 2026.

**Limits:**
- Messaging limits are per business portfolio: 250 → 2k → 10k → 100k → unlimited. A new business starts
  at 250 business-started chats a day until it's verified.
- Tech Provider onboarding: **10 new merchants per 7 days**, 200 after business verification, App Review
  and access verification.

**Usernames:** webhooks carry a business-scoped user id (BSUID). A username user's phone number can be absent.

**Competitors:**
- **Wati** (©2026): inbox with assignment and tags; 3 users on $59, +$39 per user; routing on $119.
- **Interakt** (©2026): unlimited agents; auto-assign on its top plan; tags; welcome and away replies; bots.
- **Gallabox:** pricing page not read.
- **Taken:** assignment, tags, quick replies, internal notes, away replies, Mine/Unassigned views.
- **Different:** each chat sits next to the customer's **orders, COD risk and profit**, and a reply can
  confirm the order. No WhatsApp-only tool has the order.

**Codebase:**
- `orders.phone` is 10 digits; there's no customers table and no consent record yet.
- `order_events.actor_kind` allows member, support and system.
- The outbox has per-kind senders. The cron is daily (Hobby): too slow for a 5-minute confirmation.

## Design (mockup to come: Apps › Messages setup, the order's WhatsApp card, Inbox list and thread)

### C1 · Connect (Console › Apps › Messages)
> Built 2026-11-07; facts rechecked the same day (ES v5 exists, v4 used; no payment field; Business app numbers are
> never registered). Deferred to C3: the state on the Apps row and the "open the app" warning. See docs/plans/2026-11-07-m2.md § C1 as built.

1. **Before:** one screen and two choices, each with a pictogram:
   - **"I use the WhatsApp Business app on this number"** (recommended for most brands): coexistence.
     Keep the app; chats from the last 6 months come across. An (i) tip lists what changes (broadcast lists
     become read-only, linked devices are signed out, open the app at least every 2 weeks).
   - **"A new number, or one not on WhatsApp"**: verified by OTP inside Meta's popup.
   - A third line: "Already on Interakt, Wati or another tool?" opens a short guide to *share* the WhatsApp
     account with Frata (no migration on the new model).
2. **Meta's popup** (Embedded Signup v4, the FB JS SDK loaded only on this page).
3. **Back in Frata:** "Connecting…" while the server finishes. It exchanges the code, stores the token
   encrypted, subscribes, registers (non-coexistence), reads the number, name, quality and limit, and, for
   coexistence, starts history and contact sync within the 24 h.
4. **Status on the setup page and the Apps row, in words:**
   - **Connected:** +91 98450 12345 · Kesar Studio · limit 250 a day.
   - **Needs attention**, with one action each:
     - "Add a payment method in WhatsApp Manager": messages won't deliver until it's added.
     - "Display name in review"
     - "Quality is low: fewer messages are being sent"
     - "Open the WhatsApp app on your phone": coexistence about to disconnect.
     - "Move billing to INR by 31 Dec".
   - **Not connected.**
5. **Disconnect:** a dialog naming what stops. Disconnecting deletes the token; the number stays theirs.

### C2 · Order messages (the first job: COD confirmation)
- On connect, Frata creates **utility templates** in the merchant's account (English first, Hindi next):
  - `cod_confirm` (order, total, address; buttons **Confirm order** / **Cancel**)
  - `order_confirmed`
  - `shipped` (URL button: track)
  - `out_for_delivery`
  - `delivered`
  - `delivery_failed` (buttons: Deliver tomorrow / Change address / Cancel)

  Never a promo inside, or Meta re-categorises it as marketing at 7.5× the price. Status follows
  `message_template_status_update` and `template_category_update`.
- **Console › Apps › Messages › Order messages:** a switch for each message, the template preview, and
  the estimate in rupees ("about ₹0.81 per delivered COD order with GST, billed by Meta": 5 messages × ₹0.1150 [S]). Explanation lives in (i) tips.
- **Checkout:** "Get order updates on WhatsApp" with the shop's name (opt-in must name the business). Stored as
  a **consent** (purpose `order_updates`, given at checkout, withdrawable), ready for DPDP from May 2027.
- **A reply moves the order:**
  - "Confirm order" confirms it (`order_events` actor `customer`, a new actor kind), and the To confirm
    queue loses it.
  - "Cancel" asks the merchant (an "Asked to cancel" badge); it never cancels by itself.
  - Delivery-failed replies feed the NDR queue (M2·2).
- **On the order page:** a WhatsApp card (slot `order.side`) shows what was sent, its ticks
  (sent/delivered/read, derived from timestamps) and the reply.

### C3 · Team inbox (Console › Inbox, nav "Today")
- **Views (tabs with counts):** Mine · Unassigned · All open · Closed. Search by name, phone or order number.
- **List row:** name (or profile name), last message, time, unread dot with a count, assignee initials,
  and the latest order's state badge.
- **Thread:**
  - Bubbles with derived ticks. Template messages are marked as templates.
  - Messages sent from the phone app (coexistence echoes) are marked "Sent from the WhatsApp app".
  - Internal **notes** in the thread are never sent and carry a "Note" tag.
- **Side (slot `customer.side`):** the customer's orders (matched by phone), COD risk, total delivered,
  last order's profit (owners only), and consents.
- **Composer:**
  - Free text while the 24 h window is open ("Open for 3 h" in the meta line, with an (i) tip that every
    message is billed by Meta).
  - After the window closes, the composer becomes **"Send a template"**.
  - Attach image or document. `/` opens **quick replies** (shared, per shop).
  - Enter sends; Shift+Enter adds a new line.
- **Team:**
  - **Assign** to a person.
  - **Close** with Undo for 8 s; a new message reopens the chat.
  - **Snooze** until a time.
  - Opening a chat marks it read on Meta. Typing presence and snooze are deferred (architecture review: YAGNI).
- **Keys** (the queue rules, design-language § Work queues 6): `j`/`k` to move, `Enter` to open, `a` to
  assign to me, `e` to close, `/` for search, `r` to reply.
- **Live updates:** only while the Inbox tab is visible, it reads one per-shop "inbox changed at" value every
  4 s, slowing to 15–30 s when idle, and fetches rows only when that value moves (unit-economics review:
  polling is the main cost, about ₹43 per seat a month at 4 s). There's no websocket on Vercel functions. Supabase Realtime is left out
  because Supabase is auth only (CLAUDE.md).
- **Who sees the inbox:** owner, admin and staff. **Partner: off by default**, the owner can allow it, because chats hold
  shopper details (tenancy review).
- **Phone:** the list is one screen and the thread is the next, with the composer pinned above the bottom bar.

### C4 · Automations (after C3; Growth+)
- **Replies:** away message outside business hours, and a welcome on first contact.
- **Assignment:** auto-assign round-robin among people who are on.
- **Keyword replies:** "size", "track", "return" answer with links.
- **Marketing moves to Retain:** abandoned bag, back in stock and campaigns are marketing messages with
  separate consent, judged on delivered orders.
- **Instagram DMs** join the same inbox as a second channel. It needs `instagram_business_manage_messages`
  Advanced access; same 24 h window, plus a 7-day Human Agent tag.

## Data (all tenant tables: tenant_id, grant, RLS, policy in one migration; proofs in tenancy.sql)

| Table | Holds | Notes |
|---|---|---|
| `wa_connections` | waac_id, waba_id (Messaging account), phone_number_id (unique across Frata), display phone, verified name, `coexistence`, token_enc, pin_enc, connected_at/by, disconnected_at; health as typed columns: quality, limit_tier, payment_ok, name_status, checked_at | One open row per tenant. Token sealed like payment keys; never sent to a browser or logged |
| `contacts` | bsuid (nullable), phone (nullable, 91XXXXXXXXXX), name, wa_profile_name | Unique (tenant, bsuid) and (tenant, phone). Orders match by phone (derived) |
| `consents` | contact, purpose (`order_updates`, `marketing`), given_at, source, withdrawn_at | Facts with history; "may we message" is derived |
| `conversations` | contact, channel (`whatsapp`, later `instagram`), assigned_to/at, closed_at, snoozed_until, last_inbound_at, last_message_at | The window and unread state are derived (last_inbound_at; per-person reads) |
| `messages` | conversation, direction, provider_id (wamid, unique per tenant), kind, body, media blob path, template name, order_id, author (member / system / customer / app echo), sent/delivered/read/failed_at, error, pricing category | **No status column**: ticks are derived from timestamps |
| `conversation_notes` | conversation, author, body | Never sent; separate from messages so no code path can send one |
| `conversation_reads` | conversation, user, read_at | Unread per person, derived |
| `quick_replies` | shortcut, body | Per shop |
| `wa_templates` | name, language, category, status, reason, components (a snapshot of Meta's), synced_at | A cache of Meta's, refreshed by webhook; labelled as such |
| `typing_presence` | conversation, user, until | 20 s rows, ephemeral |

**Binding review fixes:** see `docs/plans/2026-11-07-m2.md` § Review findings: the per-item webhook key with
status, the server-side ids on connect, a private media route, `canSeeChats`, composite FKs,
`biz_opaque_callback_data`, compare-and-set confirm, and consents keyed on (tenant, phone) as a core table.

**Platform (pre-tenant):**
- `app_tenant_for_wa(phone_number_id)` (definer): the webhook's route to a shop.
- **Inbound:** `POST /api/webhooks/whatsapp`, listed in ENTRY_POINTS.
  - The raw body is verified with `X-Hub-Signature-256` (HMAC-SHA256, Frata's app secret), then stored in
    `webhook_events` under our key `whatsapp:<phone_number_id>:<wamid or status id>`. Retries for up to 7
    days dedupe on that key.
  - It answers 200, then processes **at once** (Next `after()`) and in the sweep.
  - `GET` answers Meta's verify challenge.
- **Inbound media** is fetched within the 5-minute URL lifetime into Vercel Blob under the shop's path,
  served to the console through a signed, no-store route.
- **Outbound:** a member's send writes the `messages` row and an outbox row `whatsapp.send` in one
  transaction. The sender posts to `/{phone_number_id}/messages` and stores the wamid.
  - Order messages are enqueued in the same transaction as the order change (ADR-0006).
  - Per-number pacing: 20 msgs/s for coexistence.
  - Fairness across shops in the sweep.
- **Secrets** (Vercel, server only): META_APP_ID, META_APP_SECRET, WA_CONFIG_ID, WA_VERIFY_TOKEN. Each
  merchant's token is sealed in `wa_connections`.

## Design review (frata-planning § 3)
- **UI/UX:** one primary action per screen (Connect · Send · Assign to me). Every state is written:
  - not connected, connecting, connected
  - each needs-attention item
  - window closed (template only); a message failed (its reason in words, with Retry when safe)
  - no chats yet (pictogram tile, "Connect WhatsApp" or "Chats appear here")
  - phone layout

  Voice: short; explanations in (i) tips.
- **Tenancy:**
  - The webhook finds the shop only from `phone_number_id` through the definer, never from a body field
    we trust.
  - Every table carries tenant_id with RLS. The token never leaves the server.
  - Media paths are prefixed with the tenant and served through a route that checks membership.
  - Chats aren't visible to partners unless the owner allows it.
  - Support visits see the inbox, audited.
  - **`tenancy-auditor` runs on this spec.**
- **Modularity:**
  - `src/domains/communication/`: window, ticks, template params, consent, assignment (pure).
  - `src/lib/connectors/whatsapp/`: Graph client, signup exchange, senders.
  - `src/lib/queries/communication.ts`.
  - `src/app/(console)/console/inbox/` and `apps/communication/`.
  - `src/components/modules/communication/`: slots.
- **SSOT:** ticks, unread, the window and "may we message" are all derived. Templates are a labelled cache
  of Meta's. Orders are matched by phone, never copied into contacts.
- **YAGNI (out):** bots and flows, broadcasts (Retain), Instagram (C4), multiple numbers per shop, call
  buttons, payments over WhatsApp, a desktop app.
- **KISS:** polling rather than realtime infra. Every message, a member's or an order's, is one outbox kind.
- **Scale (500 shops, festive 10×):**
  - About 5 messages per order. Indexes: messages (tenant, conversation, created_at), conversations (tenant,
    assigned_to, last_message_at), contacts (tenant, phone/bsuid), webhook_events key.
  - Polling: one indexed "changed since" read per open tab; there's a request budget to watch.
  - The outbox is drained per minute (**needs Vercel Pro**, business track 7) and on commit through `after()`.
- **Reliability:**
  - Every send is an outbox row: retries are safe on the wamid and dedupe key.
  - A failure shows on the message in words.
  - Meta down: messages wait with "Waiting to send".
  - No payment method: "Needs attention" before any message is lost.
- **Security:**
  - Signature on the raw body; app secret in env.
  - Tokens sealed; actions behind `asModule('communication', …)`.
  - Zod on every input; media type and size checked.
  - No shopper data in logs or audit rows.
- **Unit economics:**
  - Meta bills the merchant: about 5 utility messages per COD order ≈ ₹0.58 + GST [S rate].
  - Frata's cost is Blob storage for media and request volume.
  - Seats: see the owner calls. **`unit-economics-reviewer` runs on seats and the per-order estimate.**
- **Blast radius:**
  - Checkout (a consent checkbox), order actions (a system/customer confirm path), `order_events` actor CHECK.
  - The outbox sweep, the console nav, middleware (webhook route public).
  - CSP for the FB SDK on one page only.

## Phases (each usable on its own)
| Phase | A merchant can | Blocked by |
|---|---|---|
| **C1 Connect** | turn on Messages, connect a number (coexistence or new), see its health | Meta app + Tech Provider set-up; works in dev mode with Frata's own test number first |
| **C2 Order messages** | COD confirmation with a reply that confirms; shipped and delivered updates (with M2·2) | App Review (2 screencasts: send/receive, template creation) for other businesses' numbers |
| **C3 Team inbox** | answer every chat as a team: assign, notes, quick replies, media | C2 (App Review gates both; order changed by architecture review) |
| **C4 Automations** | away and welcome replies, auto-assign, keyword replies; Instagram DMs later | C3 |

## Prerequisites (business track, start now)
1. Pvt Ltd → **Meta business verification** of Frata's portfolio.
2. A Meta app as **Tech Provider**: Embedded Signup v4 configuration (config_id), webhook URL, a test number.
3. **App Review** for `whatsapp_business_management` + `whatsapp_business_messaging` (Advanced), recorded on C1 + C2.
4. **Access verification.** Until all three are done: 10 new merchants per 7 days.
5. **Vercel Pro** (per-minute cron) before C2 goes to real shoppers.

## Owner calls: decided 2026-11-07, as recommended (see docs/plans/2026-11-07-m2.md § Owner calls)
1. **Seats:** Messages in every plan (recommended). Team members per tier, e.g. Launch 3 · Growth 10 · Scale 25,
   with extra seats as an add-on (Wati charges +$39 per user), or unlimited like Interakt?
2. **Order updates opt-in at checkout:** ticked by default with the shop named (common in India; DPDP
   wants a clear, affirmative consent from May 2027), or unticked (recommended for DPDP)?
3. **Partners in the inbox:** off by default, owner can allow (recommended)?
4. **Automations (C4)** in Growth+ (recommended), or every plan?
5. **Languages** for the order templates: English, then Hindi? Any other first?

## Facts used (all checked 2026-11-07; [V] Meta primary · [S] vendor)
ES v4, v2/v3 deprecated 15 Oct 2026 [V] · code → business token; subscribed_apps; register with PIN, 10 per
72 h; the customer adds the payment method [V] · Tech Providers have no credit line [V] · coexistence: app
2.24.17+, history 6 months within 24 h, echoes, 20 mps, broadcast read-only, 14-day inactivity [V]; in India [S] ·
new account model GA 23 Sep 2026; no migration between providers; share the WhatsApp account [V] · per-message
pricing; in-window utility and service charged from 1 Oct 2026; 1,000 free service per number per month; CTWA
free entry point up to 7 days [V]; India ₹0.1150 utility / ₹0.8631 marketing [S] · INR billing by 31 Dec 2026 [V] ·
limits per portfolio 250 → 2k → 10k → 100k → unlimited [V] · onboarding 10 per 7 days, 200 after three
verifications [V] · templates: review up to 24 h, mixed content = marketing, ≤10 buttons [V] · webhook signature
X-Hub-Signature-256, retries 7 days, ≤3 MB [V] · media URLs 5 min, token required [V] · BSUID, phone may be
absent [V] · typing indicator 25 s [V] · policy requires a human escalation path, opt-in names the business,
opt-outs honoured [V] · Instagram DMs: instagram_business_manage_messages, 7-day Human Agent tag [V] ·
Wati / Interakt plans [S].
