# Admin: partners, their credits and their data
Status: proposed (mockup; awaiting the owner) · Date: 2026-11-12 · Mockup: `docs/mockups/2026-11-12-admin-partners.html` ·
Extends today's Admin › Partners (the review queue, `src/app/(admin)/admin/partners/page.tsx`) · Related: Studio credits
(`docs/specs/2026-11-12-studio-shell-clients-billing.md`), partner teams (`docs/specs/2026-11-12-studio-intake-and-team.md`),
ADR-0007 (Admin reads across merchants), ADR-0015 (proposed)

## Owner ask (2026-11-12)
"Build mockup for admin module to manage partners, their credits, see their data."

## What staff see
- **Partners** (today's queue, extended): To review · Active · Suspended · Declined. Active is one table: plan,
  people, brands (live · onboarding), credits held, used this month (credits and ₹), last month's share, flags.
  To review shows the duplicate checks beside each application (PAN, GSTIN, payout account, device).
- **A partner's page:** Overview (credits held, reserved, used, sold, price ÷ measured cost, share; what needs a look;
  PAN, GSTIN, payout account, terms, consent for signals); Team; Brands (stage, plan, linked date, share window, and a
  link to Merchants); Credits (ledger with kind, brand, session, person, balance after; where credits sit); Payments
  (GST invoices, failed attempts); Share (statements with GST and TDS; this year's total against the ₹20,000 TDS line);
  Audit.
- **Studio credits** across partners: used, sold, measured cost, price ÷ cost (3× rule), credits held unused (owed work:
  income only as they are used or expire), grants this month and who approved them, turns failed on Frrata's side.
- **Payouts:** the monthly run (20%, + GST 18% with a GSTIN, − TDS 2% above ₹20,000 a year, net), under ₹1,000 carried,
  waiting on a verified bank account; one outbox row per statement (ADR-0006), RazorpayX in Phase 6.

## Rules
1. **Roles.** `support` reads everything here; only `admin` grants or returns credits, refunds, suspends, reinstates,
   holds or pays out, approves or declines (today's `ANY_STAFF` / `ADMIN_ONLY`).
2. **Fresh passkey** for every money or access action (`requireStaff`'s 5-minute `confirmedRecently`).
3. **Two admins over 200 credits** for a grant; every grant, return and refund needs a reason and lands in the
   partner's ledger and the audit log.
4. **Credits aren't refunded as money.** A refund is only for a charge taken twice or in error, back to the same method,
   with a credit note. A turn's credits come back only when it failed on Frrata's side.
5. **No shopper data here.** A partner's brands show stage, plan and dates; orders and shoppers stay in Merchants,
   behind a support visit (ADR-0007). Reads across partners go through `frata_admin`.
6. **Suspend** ends every partner person's access to every brand in one transaction (`admin_end_partner`, intake and
   team spec), stops sessions and routines (drafts kept), holds payouts, tells the brands, and needs the partner's
   name typed. Brands' shops and sites keep running.
7. **Staff never act as a partner.** They end a person's sessions or suspend the partner; roles and removals are the
   partner owner's.
8. **Approval** grants the 10 free credits once; a failed duplicate check needs a written reason to approve anyway.

## States (the mockup's dashed control)
Empty (nothing to review), loading (skeleton), couldn't load (in place, Try again), support role (actions off with the
reason), field mistakes inside dialogs (no toast, § Feedback 4).

## Open
- The second-admin threshold (200 credits) and the cap per grant (1,000) are proposals.
- Payouts and the share's GST and TDS handling wait for Phase 6 and the CA.
