# Studio: app shell, Clients, Credits & billing, apps in chat
Status: proposed (mockup; awaiting the owner) · Date: 2026-11-12 · Mockup: https://claude.ai/artifact/KiqKqrFCx4enB8KUrnh5Du
(`docs/mockups/2026-11-13-studio-v2.html` v2.3) · Parent: `docs/specs/2026-11-11-frrata-studio.md` · Related:
`docs/specs/2026-11-12-studio-intake-and-team.md`, ADR-0015 (proposed)

## Owner asks (2026-11-12)
A client-oriented Clients section beside the task-oriented Inbox ("Inbox: what needs my attention? Clients: what is the
state of my business?"); a review of the 12 screens (shell, Inbox, new session, plan, session, review, variants, client
approval and handover, brand brain, environment, developer, credits); Credits & billing redesigned on the existing
pricing; real empty, loading, error, cap-reached and approval-pending states; desktop and phone; apps and data
available to builders. No new pricing; merchants never see partner costs or buy Studio credits.

## Navigation tree
```
Studio (sidebar on desktop; a tab bar on a phone)
├── Inbox            what needs me: Needs you · Working · Ready to review · Waiting on client
├── Clients          the business: stage, next, the partner's own billing, Studio credits, share
│   └── Client drawer   progress · your billing (private) · Studio credits · Frrata and the brand · Advanced
│       └── Site workspace (sidebar folds to icons)
│           ├── 1 Brand language   (brand brain: brand.md, words to accept)
│           ├── 2 Design system    (chat + canvas; sources and questions from the intake)
│           ├── 3 Pages and brief  → plan to approve (popup)
│           └── 4 Build            chat · site · Checks/Files/System/Apps/Data; compare; variants; send to client;
│                                  publish; hand over
├── Credits & billing   Overview · Usage · Client budgets · Payments and invoices · Plan · Your share
├── Team               people, roles, brands, caps
└── Settings           Business · Security · Developer · Environment
Brand-facing (no shell): the intake link; the client preview link
```

## The 12 screens, mapped
| Old screen | Now | What changed |
|---|---|---|
| Inbox | Inbox | Lanes end in one action each; "Live" moved to Clients; "Waiting on client" with Remind; empty state |
| New session | New site (popup) | Client, then the intake toggle; budget folded under "More options" |
| Plan to approve | Plan popup | Shows the hold ("holds the top, keeps what it uses") and the client's budget left |
| Session at work | Build | Flagship: chat hides (`[`), full site (`F`), a floating ask box and peek; stop; cap and low-balance banners in the chat |
| Review | Build › Checks/Files + Compare | A live-vs-draft slider on the preview; pins as feedback; checks and diff in the rail |
| Variants | Variants popup | Each shows its credits; optional |
| Client approves | Send to client → notes → Publish → Hand over | Approval and handover bound to one version (7f3a) |
| Routines | Client drawer + handover | Each routine kept on the partner's credits or stopped at handover |
| Brand brain | Brand language + Design system | Intake words accepted by a person; tokens carry sources |
| Environment | Settings › Environment; drawer › Advanced | Frrata's rules once; a client's own in its drawer |
| Developer | Settings › Developer | CLI, test key, GitHub; out of everyday work |
| Credits | Credits & billing (page) | Below |

## One session (owner, 2026-11-12: "bring all these in a single chat system vs preview")
Brand language, the design system, pages and the build are one session: one chat on the left; the preview on the right
follows it through Brand → Design system → Pages → Site, and its tabs stay open to go back and edit. The agent asks
at each step ("looks right?") and moves on when the partner agrees; chips under the box suggest the next things to
say; every edit by hand on the right is mirrored in the chat. The old routes `#brand`, `#design`, `#pages` open the
session on that tab. The plan is still approved in its popup; the design system is still locked with its card.

## Clients
Columns: client (and its Frrata plan), stage (Onboarding, Live, Unlinked), next (who acts: you, the client, the
agent, nobody), your billing (project or retainer; paid, due, overdue), Studio credits (used / budget), your share.
Filters with counts: Live, Onboarding, Waiting on client, Maintenance, Unpaid, Renewing soon, At risk, Unlinked.
Totals: retainers a month, unpaid, share a month.
- **The partner's own billing is a private record** for the partner's team: Frrata doesn't send, collect or see it in
  the product, and the brand never sees it. "Remind" opens WhatsApp on the partner's phone with a drafted message
  (Frrata sends nothing; ADR-0010).
- **Renewal** is the partner's retainer date. **At risk** is a Frrata trial ending or an unlink notice (open: Q4).

## Credits & billing (existing rules only)
| Topic | Rule (source) |
|---|---|
| Plans | Partner free: 10 credits once; Studio ₹2,999 + GST a month, 150 credits; Studio Plus ₹9,999 + GST, 500 (Studio spec) |
| Packs | 100 credits for ₹1,900 + GST, 12 months (Studio spec, credits proposal) |
| Rollover | Seat credits roll over two months; soonest to expire is spent first (owner, 2026-11-12) |
| Reserve and release | A turn reserves its ceiling, keeps what it used; Frrata-side failures come back (credits proposal) |
| Budgets | Per client; warn at 80%, pause at 100%, drafts kept (credits proposal) |
| Refunds | Credits aren't refunded as money; Frrata-side failures return credits (credits proposal) |
| GST | 18% on every purchase; invoices carry the partner's GSTIN for input credit |
| Pays by | UPI first (AutoPay mandate for the seat only); card; netbanking. Packs are bought when the partner chooses |
| Failed payment | Credits already held keep working; seat credits arrive once paid; 7 days' grace, then Partner (free) (2026-11-12) |
| Upgrade | At the next renewal; mid-month needs are a top-up (packs, or a typed number at ₹19 + GST each) (owner, 2026-11-12) |
| Cancel | Studio ends at the period's end; credits stay until expiry; clients' shops, sites and plans unaffected; the share continues |
| Share | 20% of what Frrata collects, 24 months from opening, 90 days after unlinking (`PARTNER_TERMS`); statements on the 5th, paid after 30 days, ₹1,000 minimum, self-billed GST, TDS (payout research 2026-11-07; Phase 6) |
| Separation | Studio credits are what the partner pays Frrata; a brand's Launch/Growth/Scale plan is the brand's; the brand never buys credits and never sees the partner's costs |

**Indian partners, by design:** prices in rupees beside credits, always with the GST line and the total; "Pay ₹2,242 by
UPI" as the button; a CSV "for your CA"; GST invoices downloadable per payment; no auto-debit except the seat mandate
the partner set up; WhatsApp reminders from the partner's own phone; project fees with a 50% advance and retainers
both modelled, because both are how Indian freelancers and agencies bill.

## Apps in Studio (from the modules registry, `src/domains/modules/registry.ts`)
- **The agent reads a shop's apps** (on, off, coming) and what each puts on a site: Delivery Zones (PIN check, zone
  charge), Product video (on the product page). Messages and EkCode act inside Frrata's checkout, not site code. True
  Profit and GST are console-only. Reviews, RTO Shield, size and fit are parked or coming: nothing to build yet.
- **Studio never turns an app on or off.** That stays with the brand's owner or admin in person (`CAN_MANAGE`,
  `managesInPerson`), and any price is on the brand's plan. A Lead or Owner can send "Ask Riya to turn on Reviews",
  which lands in her console. Builders can't.
- **A block for an app renders nothing while the app is off.** The Storefront API answers `404 not_available`
  (`apiResources` contract), and the kit's app slot hides; a check proves it.
- **Data a builder designs with** (Storefront API SA1, specified; built in V1): shop (policies, legal block, COD,
  delivery promises); products (variants, price, M.R.P., earlier price, availability with a count only at ≤3, size
  chart, offer lines); collections; offers; search; through apps that are on: the PIN check, product video. Handed to
  Frrata: the bag (a link), payment, sign-in, opt-in. Never: orders, shoppers, costs, writes (prices, stock, products
  change in the console). Builders get a preview copy without cost fields (ADR-0015).
- **Future apps** join the registry as `next`; when one ships with an API resource and a kit block, the agent can
  offer it on sites where it's on.

## States in the mockup (a dashed "State" control)
Empty (no clients; nothing needs you; no usage), loading (skeleton rows), couldn't load (in place, with Try again;
§ Feedback 5), low balance (banner, chat banner with "Buy 100 · ₹2,242"), payment fails (inside the payment popup,
nothing charged; renewal banner), budget used up (client drawer and the chat; raise or go to billing), approval
pending (Inbox "Waiting on client", Clients filter).

## UX decisions
1. Inbox and Clients answer different questions; nothing live appears in the Inbox.
2. One shell; a site's workspace folds the sidebar to icons and shows the four steps.
3. Billing is one page with six tabs, no dashboards: one balance, three numbers, one bar.
4. Money is always shown with GST and a total; credits always beside rupees.
5. Private partner billing is labelled once per section ("Only your team sees this"), never mixed with Frrata's.
6. Caps and failures stay where they block (the chat, the popup), not only as toasts.
7. Developer and environment controls live in Settings and the drawer's Advanced, not in the build flow.
8. Apps are read, never switched, from Studio.

## Owner decisions (2026-11-12, on Q1–Q6)
- **Q1 Seat credits roll over two months** (was one). Soonest to expire is still spent first.
- **Q2 Grace after a failed seat renewal (owner: "you decide"): 7 days.** Credits already held keep working; the
  month's seat credits arrive once paid; after 7 days unpaid the partner moves to Partner (free) and keeps any pack
  credits; sites, clients and the share are untouched.
- **Q3 No mid-month plan change: a top-up instead.** Packs of 100 (₹1,900 + GST), or a typed number of credits at the
  pack rate (₹19 + GST each; minimum 20). Plan changes take effect at the next renewal. Typing an amount is offered only
  for top-ups.
- **Q4 Yes:** a partner sees a brand's Frrata trial ending or a past-due plan, with the brand's consent at linking.
- **Q5 WhatsApp alerts:** no Frrata number is connected yet. Alerts go by email and in Studio; WhatsApp is a pinned
  placeholder ("coming").
- **Q6 Tax on the share:** TDS at the market standard, 2% on commission above ₹20,000 a year (Income-tax Act 2025
  s.393(1) Table Sl. 1(ii), formerly s.194H; Form 26Q code 1006; from 1 Apr 2026; secondary sources checked
  2026-11-12, the CA confirms before payouts). GST 18% is added for GST-registered partners and agencies (self-billed
  invoice); unregistered partners are paid without GST.

## Open questions for the owner
- **Q1** decided above; the seat still costs more per credit than a pack (₹19.99 vs ₹19.00): open.
- **Q2** Grace period after a failed seat renewal.
- **Q3** Upgrading mid-month: new month from today (shown), or prorate.
- **Q4** May a partner see a brand's Frrata trial ending or a past-due plan (the "At risk" signal)? Recommended: only
  with the brand's consent at linking.
- **Q5** Low-balance and 80% alerts by WhatsApp to the partner: which number sends them (ADR-0010 keeps EkCode's for
  sign-in and shopper updates)?
- **Q6** TDS rate and self-billed GST on the share need the CA (payout research marks them unverified); payouts wait
  for Phase 6.
- **Q7** Plan differences beyond credits (sessions at once, seats per team) are undefined; the mockup shows credits only.
