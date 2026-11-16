# Execution: the Studio plan and the one-address plan, as one schedule
Status: active (owner, 2026-11-16: "all mockups approved. Please plan for execution.") · Date: 2026-11-16
Plans executed: `docs/plans/2026-11-16-one-address-checkout.md` (P0–P7) and `docs/plans/2026-11-12-studio-build.md`
(V0, G-a, V2a, C1, V2b, A1a, V2c, V3a–V3d; BT replaced by P1 and P2). Each phase's tasks, verify commands and reviewers
stay in its own plan; this file holds only the order, the lanes, what each wave waits on and what is still to draw.

## Mockups approved (owner, 2026-11-16: "all mockups approved")
| Phase | Mockup | Calls taken as recommended |
|---|---|---|
| P1 · One brand record | https://claude.ai/artifact/BtzqpF9M1dgpPubunSHyEw (`docs/mockups/2026-11-16-p1-brand.html`) | Brand in Look's place; Tiro Devanagari Hindi and Mukta join the font list; corners 0/4/8/12/16 (the pilot's 2 px becomes 0 or 4); Compact, Standard, Roomy; a partner's change on an open store waits for the owner in Notices; eleven colour roles, each pair contrast-checked |
| P2 · Checkout and order pages | https://claude.ai/artifact/TWvK4wN8s7eUAS1fDJyBzp (`…/2026-11-16-p2-checkout.html`) | one 560 px column on a computer; up to four trust blocks; − at 1 removes the line with Undo in its place; today's changed-price and failed-payment words kept; "Checkout" when the heading is empty |
| P3 · The secure frame | https://claude.ai/artifact/VAND3HpPwsd5MvkjBuWnFA (`…/2026-11-16-p3-secure-frame.html`) | how to pay on the page; "Pay · ₹" online kept; EkCode in a popup (design rule changes to "never an iframe"); no edge round the frame; the trust line under Place order kept |
| V2a and P5 · Website on one address | https://claude.ai/artifact/4dn3tMbA4H6JemWtAcQn4b (`…/2026-11-16-website-one-address.html`) | the live chip words (Waiting for record, Securing, Connected); "New website"; Connect my domain on Settings › Website; the stop reason shown to owner and partner; build keys listed and deletable |
| V2b · Publishing after handover | https://claude.ai/artifact/LEfVE6EXD4yFw9YrFjox3u (`…/2026-11-16-v2b-publishing.html`) | a new Notices type "Website"; Undo until the next version goes live; Not now, no Decline; a confirm before an outside service |
| V3b · Studio redraw | https://claude.ai/artifact/LizEVx3Ms4NdpS1kScxU8o (`…/2026-11-16-studio-redraw.html`) | "≈ 19" a page; Publish its own step; hand edits after handover without a passkey, Apply with one; the partner owner raises budgets; "Preview · vN" |

**Reconciled at approval** (shown to the owner with the mockups; built this way unless the owner says otherwise):
1. **Checkout on a computer is P2's one 560 px column.** P3's drawing put the frame left and the bag right; the frame sits
   in the one column under Your bag and How you'll pay, as P3's phone drawing already does. Not a deviation: P2 is the
   layout, P3 drew states.
2. **Sample data is the store's own.** P3 and the Studio redraw drew a made-up "Mustard Cotton Kurta ₹2,190"; the build's
   fixtures and previews use the store's real products (P2's Sage Floral Kurta Set).
3. **The console menu says Brand** (P1), wherever mockups 3–5 drew Look.
4. **The Studio files' address scheme** is the one-address plan's (edits below, Wave 0).

## What each wave waits on
A wave starts when what it waits on is done; phases in one wave run at once in separate lanes. Lanes as
`docs/plans/2026-11-15-parallel-lanes.md`: **A** hosting, **B** API and data, **C** money, **D** the agent, **E** checkout.
Each lane is its own worker branch; the orchestrator (this session) releases one lane at a time to `main` and applies
its migrations to production (`docs/plans/2026-11-15-parallel-lanes.md` § Release order).

| Wave | Phase | Lane | Waits on | Owner step it needs |
|---|---|---|---|---|
| 0 | Records and reviews (below) | — | nothing | the CLAUDE.md line in V0·3, word for word |
| 1 | **P0 Bag link fix** | E | Wave 0's reviews | — |
| 1 | **P1 One brand record** | B | Wave 0 | — |
| 1 | **P4a Cross-store hardening** | A | Wave 0 | — |
| 1 | **G-a G·1, G·4** (test-key limits; new API fields) | B, after P1·2 | V0·3 | — |
| 2 | **P2 Checkout in the brand's design** | E | P1 | — |
| 2 | **G-a G·2, G·3** (build keys; device sign-in) | B | V0·3; P1 released | — |
| 2 | **P3·1 spike** (Razorpay in a frame, popups, COOP, cookies, certificates, speed) | E | integration-researcher's facts | a person with an iPhone and an Android phone for the in-app browsers |
| 2 | **P4b PSL listing** | A | P4a | O4: renew `frrata.shop` to 3 years |
| 2 | **P5·0** (the pilot's request count and the Vercel billing tier) | A | — | O23: Vercel billing tier |
| 3 | **P3 The secure frame** | E | P2; P3·1 passed | — |
| 3 | **V2a Sites on Frrata's account** (one address) | A | G·2; V0·6 | S8 GitHub org, S22 Vercel teams, O6 preview domain |
| 3 | **V3a·1 agent spike** | D | V0·5 | S3 Claude Console org |
| 3 | **C1 Studio credits** | C | billing R2 (Frrata's seller), Frrata's own Razorpay account | S19 the CA on GST; Frrata's Razorpay |
| 4 | **P5 One address** | A | V2a·1, ·5, ·6; P3; P4a; P5·1 spike | — |
| 4 | **V2b Publishing after handover** | A, after P5 | V2a | — |
| 4 | **A1a Admin credits** | C | C1 | — |
| 5 | **P6 One bag** | B | P5 | — |
| 5 | **V2c Fleet care** (V2c·3 first) | A | V2a | — |
| 5 | **V3a Agent runtime and the 20-task proof** | D | V3a·1; P1; C1·2, C1·5; V2a·5–7; V2c·3 | — |
| 6 | **V3b Studio, the one screen** | D | V3a's proof passed; V2a; C1; P1; G-a | — |
| 6 | **P7 Studio designs checkout** | D, with V3b | P2; V3b | — |
| 7 | **V3c Intake link**, then **V3d Routines** | D | V3b; V2b | — |
| later | G-b, A1b payouts | B, C | as their plans | — |

**The critical path is the owner's accounts.** Waves 0–2 need none of them. V2a, V3a and C1 cannot start until S8, S22,
O6, S3, S19 and Frrata's Razorpay exist; Studio (V3b) needs all three. The sooner they are done, the sooner Wave 3 starts.

## Wave 0 · records and reviews (this session, documents only)
| # | Task | Verify |
|---|---|---|
| W0·1 | The approvals above written into both plans' headers and the specs (status active, mockup links, Approved: owner 2026-11-16) | `npm run check:docs` |
| W0·2 | The Studio files' edits the one-address spec lists (§ The decision record, items 1–9): one address, no `frrata.store`, `shop_domains.serves` gone, BT replaced by P1 and P2, `docs/setup.md` § Email's stale line | `npm run check:docs`; `grep -rn "frrata.store" docs/plans docs/specs` reads only history |
| W0·3 | Numbering: proof § 88 is 0151's; V2a takes § 90 (BT's, freed by P1's § 98); the rest keep § 89, § 91–96. New e2e flows take the next free number at build (`93-site-hosting` becomes `site-hosting`) | `grep -n "§ 8[89]\|§ 9[0-9]" docs/plans/*.md` |
| W0·4 | V0·2 to V0·6 as ADR text (ADR-0014 amendment, ADR-0018 build-key amendment with the CLAUDE.md line shown to the owner, ADR-0015 § 5, **ADR-0020** Studio's agent, ADR-0016 § 2); V0·7's skill sections | `npm run check:docs`; `npm run check:skills` |
| W0·5 | Rules the owner approved in the mockups into `frata-design-language` with a version bump: checkout on code-site stores draws the brand record; what a partner may set on checkout (header, footer, up to four trust blocks, two plain lines with the refusals); EkCode "a real page, never an iframe" (a popup is allowed); the Notices type Website with Preview and Undo; the Website card's state chips; build keys in the keys list | `npm run check:skills` |
| W0·6 | `api-contract-reviewer` on the one-address plan (P1, P5, P6) and `integration-researcher` (Razorpay in a frame, COOP and popups in in-app browsers, WebKit cookies in a same-site frame, the PSL process, Vercel certificates and routing rules); findings folded into the plans | both reports in the plan's Review lines |
| W0·7 | Proposed edits from what the mockups found: P3's Pay · ₹ online kept (plan line); `checkout.tsx`'s "Pincode" label becomes "PIN code" in P2·3; checkout's sold-out line shown with Remove (P2·4 reads the quote's problem lines); the bag-link page keeps no footer | the plan lines |

## Each phase, every time (the loop, unchanged)
1. **Before the change:** the phase's regression net runs green on the lane's branch.
2. **Each task:** its verify command run and read; `impact-reviewer` on the task's diff before its commit.
3. **Before release:** `npm test`, `npm run typecheck`, `npm run verify:tenancy` when `drizzle/` changed, the touched e2e
   flows (`npm run release:check`), the phase's reviewers on the diff, `mockup-parity-reviewer` passing on a screen phase.
4. **Deviations** from a mockup go in the phase plan's Deviations table and to the owner before the phase ships.
5. **Release:** one lane at a time; migrations renumbered against production, applied through the Supabase API with
   their drizzle rows; push to `main`; the deploy and its runtime errors watched; the owner told what is live.

## Mockups still to draw (each before its phase starts)
| Phase | Mockup |
|---|---|
| G-a G·5 | Console › Content's page templates (Contact, About blocks, FAQ topics, title emphasis) |
| C1 | The final Credits & billing phase mockup at the new prices |
| P6 | The pilot's bag drawer with the quote's subtotal and sold-out lines |
| V3d | Routines (content-layer spec § Studio v2.5 item 1) |

## How the work runs
- **Lanes as worker sessions**, as on 2026-11-15: each gets its plan section, its branch (`claude/lane-<x>-<phase>`), the
  parallel-lanes rules and this file. At most three lanes build at once; the orchestrator reviews each report, runs the
  release and relays owner questions.
- **P0 first and alone:** a bug fix with no mockup; this session builds it, ships it, and the pilot's bag stops
  disagreeing with its checkout.
- **Owner reads at each release:** what went live, its deviations if any, and what the next wave waits on.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Checking each wave's "waits on" before starting a lane | the table above, re-read at every release; no new script |
| The gates, flows and reviewers per release | `release-agent` (exists) |
