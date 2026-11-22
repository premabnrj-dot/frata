# Studio workbench, the road to one address, apps for websites: the build
Status: active (owner approved 2026-11-22; all seven plan reviews dated and folded in; T1 and AP2 still wait on their own mockups)
· Date: 2026-11-22 · Spec: `docs/specs/2026-11-22-studio-workbench.md` (active)
**Mockup:** https://claude.ai/artifact/7nJMbpWCz2z4EBXmNeyj2n (`docs/mockups/2026-11-22-studio-workbench.html`); T1 and AP2's two blocks still to draw
**Approved:** owner, 2026-11-22 ("go with your recommendation"; "Yes, test orders before opening")
**Review:** architecture-reviewer CHANGES NEEDED (4 blockers, 6 majors), all folded in, 2026-11-22
**Review:** security-reviewer FIX BEFORE MERGE (3 high, 4 medium, 3 low), all folded in, 2026-11-22
**Review:** api-contract-reviewer 3 blockers, 4 majors, all folded in, 2026-11-22
**Review:** words-reviewer 40 rows on the mockup, all rewritten, 2026-11-22
**Review:** tenancy-auditor FIX BEFORE MERGE (3 high, 3 medium, 1 low), all folded in (§ Tenancy audit), 2026-11-22
**Review:** speed-reviewer OVER BUDGET as written (2 high, 3 medium, 3 low), all folded in (§ Speed review), 2026-11-22
**Review:** unit-economics-reviewer NEUTRAL for merchants, HURTS Frrata until the video budget is enforced; no second host now; folded in (§ Unit economics), 2026-11-22

This plan adds to `docs/plans/2026-11-16-execution.md`; that file keeps the order of everything else. Each phase runs
the loop in its § "Each phase, every time": regression net first, `impact-reviewer` per task, the phase's reviewers on
the diff, `mockup-parity-reviewer` on a screen phase, one lane released at a time.

## Order (changes to the execution plan's table)
| Wave | Phase | Lane | Waits on |
|---|---|---|---|
| 0 | W0 stale text · T1's spec and mockup · the three pending reviews | — | nothing |
| 2 | P2, then **P3 straight after** (P3·1 spike starts with P2) | E | two test phones for P3·1 |
| 2 | G·1–G·4 · **D0** | B | — |
| 2 | P5·0 · P4b | A | O4 (the `frrata.shop` renewal) for P4b only |
| 3 | V2a · P5·1 · **T1** | A, E | the hosting decision (below); O6; T1's mockup approved |
| 3 | **AP1** | B | G·2 |
| 3 | C1 · V3a·1 | C, D | C1's mockup; Razorpay live confirmed (below) |
| 4 | P5 · V2b · A1a · **AP2** | A, C, B | P3, V2a; AP2's blocks approved; the Mux cost review |
| 6 | **V3b as the workbench** · P7 as a page in the preview's list | D | V3a's proof |

## Lanes open now (owner, 2026-11-22: "we can proceed with what we can build next")
Rules as `docs/plans/2026-11-15-parallel-lanes.md` § The rules every worker follows; the orchestrator is session
`session_01SDQQsB1DwvmSsYZgaMUvaR` (branch `claude/clever-cray-pga9kk`). Workers branch from that branch.
| Lane | Work | Branch | Mockup |
|---|---|---|---|
| E | P2 checkout and order pages in the brand's design (one-address plan § P2), with P3·1's spike report prepared for the owner's phones | `claude/lane-e-p2-checkout` | approved 2026-11-16 |
| B | G·1–G·4 (Studio plan § G-a), then D0 (below) | `claude/lane-b-ga-d0` | G·2's key list: approved (website-one-address § 4); D0: screen 2, approved 2026-11-22 |
| D | Studio workbench shell on fixtures: WB·1, WB·2, WB·3 (shell only, a test-only route), WB·7. No data, agent, hosting or credits (owner, 2026-11-22: "when will you take up studio work"; brought forward because the layout is approved whatever the agent's proof says) | `claude/lane-d-workbench-shell` | workbench screen 1 (approved 2026-11-22) and the redraw's chat (approved 2026-11-16) |
| — | W0 and T1's spec: the orchestrator | this branch | — |

## W0 · Stale text (documents only) — done 2026-11-22
| # | Task | Verify |
|---|---|---|
| W0·1 | V0·1 as written: ADR-0017's Decision, "What the owner sets up" and Consequences rewritten to its accepted status (or to the hosting decision below, once taken) | `npm run check:docs`; the ADR read |
| W0·2 | Kit spec § 1 and its phase table: `frrata.site` and the router replaced by ADR-0019's one address | `grep -n "frrata.site" docs/specs/2026-11-12-kit-and-fleet.md` reads only history |
| W0·3 | "Approved:" headers on the one-screen and agent specs; agent spec § 14's three "Owner seen: no" rows against the plan's four "yes" | `npm run check:docs` |
| W0·4 | The execution plan's table gains this plan's rows; the parked note's § Resume here points here | the two files read |

## D0 · Start with no domain (lane B; mockup screen 2)
- **Regression net:** e2e `91-storefront-api`, `53-domains`, the signup flow that opens a store; `npx vitest run src/app/api/storefront`.
| # | Task | Verify |
|---|---|---|
| D0·1 | Settings › Website: the address row (the store's frrata name, Connect my domain) in place of the disabled select | `npm run e2e -- --only storefront-api`; `mockup-parity-reviewer` |
| D0·2 | Days left on a Test key (pure, `src/domains/storefront-api/keys.ts`, from the row already read), warn chip from day 7; Renew = make then delete in one action | `npx vitest run src/domains/storefront-api`; e2e step |
| D0·3 | Open my store refuses while the website is `elsewhere` with no proved address (pure predicate beside `setupSteps`; the action in `shop-actions.ts`); the dialog as drawn | `npx vitest run src/domains`; e2e step: a store with a Test key and no domain cannot open, and opens after Connect my domain |
| D0·4 | The key dialog's line (a Test key reads products not yet published); the docs' Start guide: read on the server on a preview address | `npm run check:words`; `npx vitest run src/domains/storefront-api` (docs test) |
- **Reviews:** `security-reviewer`, `design-system-reviewer`, `words-reviewer`, `mockup-parity-reviewer`, `impact-reviewer` per task.

## T1 · Test orders before opening (lane E; its own spec and mockup first)
Nothing is built before `docs/specs/<date>-test-orders.md` and its mockup are approved. The spec answers every
constraint in the workbench spec § 3 (who may place one; test status derived, no column; `rzp_test_` only; no stock,
invoice serial, outbox row or analytics; erased at opening; no EkCode), and is reviewed by `security-reviewer`,
`tenancy-auditor`, `architecture-reviewer` and `unit-economics-reviewer` before its tasks are written here.

## AP1 · The app contract and the docs gate (lane B; after G·2)
- **Regression net:** `released-api.test.ts`, `waf.test.ts`, `kit.test.ts`, e2e `91-storefront-api`, `node scripts/verify/api-isr.mjs`.
| # | Task | Verify |
|---|---|---|
| AP1·1 | Pin today's OpenAPI `paths` as a fixture; then one pure route table in `src/domains/storefront-api/2026-12/routes.ts`; `openapi.ts`, `docs.ts`, `RESOURCES`, `waf.test.ts` and the released snapshot read it; output deep-equals the fixture | `npx vitest run src/domains/storefront-api`; `npm run check:layers` |
| AP1·2 | `ModuleDef.site` (`{ resources, blocks, drawn } \| { none }`) for every app; `check:modules` fails an app with a shopper file and no entry | `npm run check:modules` (run against its own description) |
| AP1·3 | `shop.apps`: optional, `MAY_GROW`, keys only, an `api*` loader; a pinned-keys test; `2026-12.json` by a reviewed `UPDATE_API=1` commit | `npm run check:api`; `npx vitest run src/domains/storefront-api` |
| AP1·4 | The `not_available` sentinel in `apiRequest` (after the key checks out; app routes only); skill rule 3 updated | `npx vitest run src/lib/storefront-api` |
| AP1·5 | Purges of `shop:<t>` for Admin pause and unpause, Admin trial or end, a plan change; `app_shops_with_boundary` gains trial and add-on ends | `npm run verify:tenancy`; `PERIOD=1 node scripts/verify/api-isr.mjs` |
| AP1·6 | `check:api-docs` (new gate): every served route in the description and the reverse (`k/`, `t/`, `h/`); every field described; every example parses; a snapshot change has a What's new line; the generated Apps pages and llms.txt entries | `npm test`; the gate run against the file that describes it |
- **Reviews:** `api-contract-reviewer`, `architecture-reviewer`, `tenancy-auditor`, `speed-reviewer`, `words-reviewer` (docs), `impact-reviewer` per task.

## AP2 · Delivery Zones and Product video on websites (lane B; blocks drawn and approved first)
| # | Task | Verify |
|---|---|---|
| AP2·1 | `src/lib/queries/delivery.ts`: the one resolve shared by the theme's POST and the API; `delivery/check?pin=` dynamic, its limit kind (per /64, failing closed; a per-key ceiling), the WAF path, the `check-api.mjs` allow-list entry; one listed answer shape | `npx vitest run src/lib/queries src/app/api`; `npm run e2e -- --only delivery-zones,storefront-api`; EXPLAIN in the task's notes |
| AP2·2 | `product.video`: the closed Mux host pair, ready videos only, null when the app is not usable; purges on ready and on the switch | `npm run check:api`; `npx vitest run src/domains/storefront-api` |
| AP2·3 | Starter blocks `<PinCheck>` and `<ProductVideo>`, drawing nothing when off; `node scripts/kit-sync.mjs` | `cd kit/starter && npm run check && npm run build` |
- **Needs first:** `unit-economics-reviewer` on Mux minutes served to partner websites, and the owner's call on its result.
- **Reviews:** as AP1, plus `security-reviewer` and `mockup-parity-reviewer`.

## V3b as the workbench (lane D; replaces V3b·1's layout task; the chat's cards stay as approved 16 Nov)
| # | Task | Verify |
|---|---|---|
| WB·1 | `src/domains/studio/layout.ts` (pure): panel widths and limits, folded state, the key map, what a phone shows | `npx vitest run src/domains/studio` |
| WB·2 | Two Neel primitives, the rail and the resize edge (a separator with a value, arrow keys), in the gallery and flow `81-neel` | `npm run e2e -- --only neel` |
| WB·3 | The three regions as drawn: chat, preview bar (page, case, width, Preview only), inspector tabs; layout kept in browser storage only | `npm run e2e -- --only studio`; `mockup-parity-reviewer` at 1280 and 390 |
| WB·4 | Design tab: hand edits as data (a chat line and a version each, no credits); a Builder's edit a proposal | e2e steps |
| WB·5 | Checks tab: V2a·6's gate keeps its results (where is named in V2a's plan); text only, redacted | `npx vitest run src/lib/sites` |
| WB·6 | Code tab: a version's changed files through the session App by `fetchWithTimeout`; path allowlist, size caps, text only; loaded on first open | `npx vitest run src/lib/studio`; first-load JS of the partner layout unchanged (`npm run build`) |
| WB·7 | Access: landmarks, `aria-expanded`, one polite region for progress, reduced motion; axe in the flow | `npm run e2e -- --only studio` |
- **Reviews:** V3b's own list, plus `design-system-reviewer` on screen 1 before the lane opens.

## Tenancy audit, folded in (2026-11-22; these override the task text above)
| Finding | Task | What is built |
|---|---|---|
| H the repository read names no source | WB·6 | Repository and SHA only from `sites`/`site_deployments` matched on `tenant_id` = `requireCapability`'s store and the version id together; the token minted for that one repository; `cache: 'no-store'`; the client sends a version id and a path, never a repository or ref |
| H Builders hold no grant on the site tables; check results have no store | WB·5, WB·6; V2a·1, V2a·6 | V2a·1 gains `frata_builder` select on named columns with `builder_rows`/`builder_only`, the `check:tenant` allow-list entry, proof § 82 and § 90; check results are a named column or table with grant, RLS and policy in that migration; reads in `src/lib/queries/sites.ts` |
| H one CDN copy for every store on the header-keyed tree | AP2·1 | `delivery/check` on `h/` and `t/` is `private, no-store`; the 60 s copy exists on `k/` only; a test asserts it |
| M Admin's pause names no stores to purge | AP1·5 | An ids-only, paged `frata_admin` read of stores with the app on, in `src/lib/admin/modules.ts`. `app_shops_with_boundary` keeps its signature, `search_path = ''`, `setof uuid`, grants re-run; it gains `tenant_plans.starts_at` and `trial_ends_at`; `scripts/verify/tenancy.sql` gains an in-window and an out-of-window row |
| M the "is this app usable" read is unnamed | AP1·4 | Through a `shopCached` loader in `src/lib/queries/modules.ts`, keyed by `ctx.tenantId`, tagged `shop:<t>` |
| M limits keyed by network alone | AP2·1 | The limit key is `<keyId>:<network /64>`: websites on one fleet share egress |
| L Renew | D0·2 | Deletes by `id` + `tenant_id` + `kind = 'test'` in the same `asMember` transaction; the new row's `partner_id` follows `createKeyAction`'s rule; purge `skey:<old hash>` |

## Unit economics, folded in (2026-11-22; ₹103.40 a dollar; list prices times guesses unless marked measured)
| Finding | Task | What is built or decided |
|---|---|---|
| A delivered 720p minute costs ₹0.083 (Mux list, read 2026-11-09); partner code, not the theme, decides playback; the minutes cap (`PRODUCT_VIDEO_CAPS`) is shown in Admin, not enforced (`src/domains/video/state.ts`). Expected ₹55 / ₹551 / ₹1,834 a month (Launch / Growth / Scale); an autoplaying partner site ₹1,654 / ₹16,544 / ₹55,009 | AP2·2, AP2·3 | The budget is **enforced before AP2·2 ships**: past it `product.video` answers null (poster only), never a stop on selling; amber at 80 %. The starter block: 720p, click to play, `preload="none"`, no loop. **Owner call before AP2:** minutes included per plan (proposed 1,000 / 10,000 / 30,000) and the price past them (proposed ₹250 per 1,000) |
| Hosting on Cloudflare saves ₹19–1,046 a site a month against Vercel Flat Rate, ₹272–9,435 against metered; the router on Vercel (ADR-0019) stays either way | the hosting row below | No second host at 1–3 pilot sites: the saving is under ₹6,000 a month against a base fee, an unproven OpenNext spike and a second adapter. Decided on measurement |
| Images: no optimiser is billed today (photos are resized once in the browser and served from Vercel Blob; `next/image` is used nowhere). Blob transfer is the cost; R2 has no egress charge. Guessed saving ₹860–1,810 a store, in conflict with the themes review's ₹6–211 | the hosting row below | Not moved on a guess |
| One read settles hosting and images | P5·0 | P5·0 gains: 30 days of the `frata` team's Vercel usage (Blob transfer GB, Fast Data Transfer GB, requests a page view) and whether Flat Rate is on (decision 23) |
| Three exchange rates in the records (₹88, ₹94, ₹103.40) | W0 | W0·1 restates ADR-0017's tables at the skill's rate, dated |

## Speed review, folded in (2026-11-22; these override the task text and the two tables above where they differ)
| Finding | Task | What is built |
|---|---|---|
| H a purge storm: `shop:<t>` is on every entry, so pausing one app for 500 stores drops 500 whole stores (catalogues up to 880 kB, every product page, every `k/` copy) | AP1·3, AP1·5, AP2·2 | A new scope `apps` (`shop:<t>:apps`) on the usable loader. `shop.apps` and `product.video`'s null are derived from that loader at map time, never stored in the shop or product entry; an app route's answer (its `not_available` included) carries the `apps` tag. Admin pause, trial end, plan change and the sweep purge `apps` only, after commit, 500 ids a page. **No app stop purges `shop:<t>`.** This replaces the contract review's "purge `shop:<t>`": `api-contract-reviewer` confirms on AP1's diff that no cached copy outlives the `apps` purge (`PERIOD=1 node scripts/verify/api-isr.mjs`) |
| H the usable loader as planned never hits and can deadlock the pool | AP1·4, AP2·1 | The loader takes the tenant only and caches facts; `moduleAccess(facts, ctx.now)` runs per request. It is read in `apiRequest` before `run`, never inside a `withTenant`; `deliveryFor` takes the access as an argument (4 fewer statements) |
| M the delivery check's limit is unnamed; a website's server shares its fleet's egress, so the key is one bucket a store, and today's 120 per 600 s is a tenth of a 7.5k-order day | AP2·1, AP2·3 | The limit and the per-key ceiling written with their 10× arithmetic; a 429 is never `s-maxage`; on a 429 `<PinCheck>` says to check at checkout |
| M the Code tab's GitHub read | WB·6 | The sites row is read and its transaction closed before any fetch. One compare call per open (the installation token reused until expiry), file bodies on click, 5 s timeout, at most 50 files and 200 kB |
| M "first load unchanged" cannot be checked for a page that does not exist | WB·3, WB·6 | The Studio page is pinned in `scripts/lib/app-budget.mjs` at ≤ 150 kB (partner shared is 103 kB today); Code, Checks and Versions load with `next/dynamic`; no diff or highlight library |
| L three reads in series in `openShop` already | D0·3 | The refusal's facts join the first select; never `websitePage()` inside `asMember` |
| L video's place | AP2·2 | `video` is on `Product` only, never `Card` or the catalogue entry; the minutes budget flips by a purge of `apps`, never a Mux call per request |
| L check results' size | WB·5 | Capped at 64 kB a version and not selected by the Versions list |
Measured: the delivery check's 10 reads take 0.02–0.32 ms each as `frata_app` under RLS at a 10× seed; about 19 statements on a CDN miss.

## Owner steps and open questions (none blocks wave 2)
| Item | State | Blocks |
|---|---|---|
| **Where partner websites are hosted** | **Decided: Vercel teams** (owner, 2026-11-22: "vercel teams it is for now"), as ADR-0017 stands. Cloudflare for hosting and R2 for images are revisited on P5·0's 30-day usage read (§ Unit economics) | — |
| S22 Vercel teams | **Decided (owner, 2026-11-22: "keeping one vercel account for pilot/testing"), with `security-reviewer`'s conditions:** the existing team hosts **the pilot only**, deployed by Vercel's Git integration as today (ADR-0017:157-160 already rules it); **no fleet or build-service token ever lives in the `frata` team** (a team token there is a production token: it can deploy `frata`, change its firewall and repoint any store host). When V2a·5 builds the fleet, **one** new Pro team holds partner websites and the fleet (kit spec § 6 asks only that the fleet be "inside the hosting account"); staging is projects inside it. Split to three before outside partners' code is live. Forced, not remembered: `sites` records its host team and the create-site definer refuses a second site, or any store with a partner, while that team is `frata`'s (proved in `verify:tenancy`); the preflight refuses a host token of `frata`'s team; an accepted-findings row. Before the split: review S1's owner steps (Blob token rotation, old previews, MFA; `docs/setup.md:262-268`), P5·1 re-run across teams, the pen test | V2a·5 (the fleet), not before |
| O6 preview domain | Open | V2a previews |
| O4 `frrata.shop` to 3 years | Open | P4b only |
| Frrata's Razorpay, live | Owner, 2026-11-22: "razorpay is live". Seen in Vercel (names and dates only, never values): `RAZORPAY_BILLING_KEY_ID` and `_SECRET` replaced 2026-11-20; `FRRATA_GSTIN`, `_LEGAL_NAME`, `_ADDRESS`, `_SAC` added the same day; `RAZORPAY_BILLING_WEBHOOK_SECRET` unchanged since 2026-11-15. Production: 5 invoices, all test mode; no billing webhook ever stored | C1 taking real money: the live webhook must be confirmed first |
| A merchant's own Razorpay keys | Built and live: Settings › Online payments, owner only, `rzp_live_` or `rzp_test_`, checked with Razorpay before saving | nothing |

## Practices recorded in skills (landed with the phase that builds each; versions bumped in that commit)
| Skill | Practice |
|---|---|
| `frata-storefront-api` | An app's website part is declared in the registry; one route table; `not_available`; every app stop purges the `apps` scope only; `check:api-docs` |
| `frata-design-language` | The workbench: three regions, the rail, the resize edge, the key map, a panel never opens by itself |
| `frata-architecture` | Test orders (T1's rules, once approved) |
| `frata-planning` | A proposal that re-orders an approved security decision is reviewed before it is shown (2026-11-22: P5a) |

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| A route or an app shipped without docs | `check:api-docs` (AP1·6) |
| An app with a shopper part and no website entry | `check:modules` (AP1·2) |

## Deviations (BUILT AS DRAWN; for the owner before a phase ships)
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| Screen 2: the Live key's chip "Starts when the store opens" | No chip; the approved key list's row (one-address § 4) | A fact the mockup got wrong: a Live key answers once the Website is on a proved domain, opened or not (0149). Mockup corrected 2026-11-22 | told 2026-11-22 |
| Screen 2: the refusal names the address the Test key is used from | "Your website runs on a Test key. Test keys stop when the store opens." | A fact the mockup got wrong: Frrata never learns where a Test key is used from. Mockup corrected 2026-11-22 | told 2026-11-22 |
| Screen 2: "New key", and key rows without prefix, maker, last used or Delete | The approved key list and "Create key" (one-address § 4), plus the days-left chip | Screen 2 was a sketch beside an approved, fuller drawing of the same list | told 2026-11-22 |
| Screen 2: the days-left chip as a "Test" tag beside a warn chip "6 days left" | One warn chip "Test · 6 days left" in the key list's own chip (from day 7 down; "Test · ends 22 Dec" before) | The approved list (one-address § 4) carries the kind inside the chip; one chip, as drawn there | no |
| Screen 2: the refusal as a raised card on the page | The console's Dialog primitive, title, body and the two buttons as ruled | A refusal that stops an action is a dialog in the design language; words and buttons as drawn | no |
| One-address § 4: a build key's maker "Made by Kabir Shah, Neel Studio" | "Made by kabir@…, Neel Studio" (the person's email) | Frrata stores no name for a partner's Lead or Builder, only their email | told 2026-11-22 |
| One-address § 4: "Used 10:06 am" on a build key | "Used today" | A key's last use is stored as a day, not a time (last_seen_on) | told 2026-11-22 |
| One-address § 4: "Kabir Shah’s access ended · 16 Nov" | "<email>’s access ended · 16 Nov"; the date only when the person left the partner (an unassignment has no date) | As the maker row above; an assignment's removal is not dated | no |
| Screen 1: the step "Site" | "Website" | Owner, 2026-11-22 | yes, 2026-11-22 |
| Screen 1, phone bar: "Chat · Site · More" | "Chat · Website · More" (its icon the console's More, not the brush) | Owner's step name; the orchestrator's ruling on More (2026-11-22) | yes, 2026-11-22 |
| Screen 1, chat: one bare proposal, Apply and Not this | The 16 Nov redraw's "Words for Content" card: 3 proposals, "3 to apply", Apply all 3 | The approved chat cards stay as drawn 16 Nov (plan § V3b); orchestrator ruling 2 | yes, 2026-11-22 |
| Screen 1, composer while v8 builds: Send, "Ask for a change" | Stop (named "Stop the agent"), "Working · you can still type" | The redraw's working state; orchestrator ruling 3 | yes, 2026-11-22 |
| Screen 1, preview bar | Adds what is building before "Preview · v7": its spinner and words when the bar has room (46 rem), else the spinner with the words for a screen reader (so at 1280 with both panels open); absent on a phone | Screen 1 § States: "the preview keeps v7 and says so"; orchestrator ruling 4 | yes, 2026-11-22 |
| Screen 1, cases: Normal, No products, Longest heading | Adds Sold out | Spec § 1 lists it; orchestrator ruling 5 | yes, 2026-11-22 |
| Screen 1: Brand book's place | Not built in the shell | Undrawn; the orchestrator draws it for the owner (ruling 7) | yes, 2026-11-22 |
| Undrawn: the resize edge, the `?` list, the keys switch, the rail dot's count | Edge: a 12 px separator over the panel's line, a 2 px neel line on hover and focus. `?`: the console's key sheet (Neel Dialog) with Shift+F6 and the one switch. Dot: drawn, its words in the button's name | Spec § 1 asks for them; orchestrator ruling 8 | yes, 2026-11-22 |
| Screen 1 Keys card: Ctrl/⌘ K find | Not built | Find is not built anywhere yet (design language § Neel layout, "Not yet: ⌘K"); ruling 9 | yes, 2026-11-22 |
| Screen 1: selects, segments, Apply, Not this and the suggestion chips 30 px | Neel's controls: 36 px (buttons 30) from 768, 44 on a phone | Design language § UX foundation 19 (controls' heights and phone targets); the bar scrolls on a phone as drawn | yes, 2026-11-22 |
| Screen 1: steps not current, the agent's name, Design's labels and check details in text 3 | Text 2 | Text 3 on the side colour and on white is 3.3:1, under WCAG 1.4.3 (axe failed it) | yes, 2026-11-22 |
| Screen 1: panels and the preview's width slide (200 ms) | They change at once | check:motion forbids animating a grid's columns or a width (UX foundation 22) | yes, 2026-11-22 |
| Screen 1: the store drawn at 300 / 460 / 640 px | The store at its true 390 / 768 / 1280, scaled down to fit (never up) | A preview at a shopper's width; the mockup's widths were stand-ins | yes, 2026-11-22 |
| Screen 1: the store's serif (Cormorant Garamond) | Georgia | Fixture only; the real preview draws the store's own faces (WB·4) | yes, 2026-11-22 |
| Screen 1 § States: Publish reads "Fix 1 check" while a check fails | "Publish v8", as the screen draws it | The screen and its States table disagreed. Owner, 2026-11-22: "It should read publish v8"; the States table's "Fix 1 check" is dropped | yes, 2026-11-22 |
| Screen 1: the device frame 14 px radius, the user's bubble 12/12/4/12, the box 10 px | 12 px (card role), 12 with a 4 px corner, 8 px (field role) | Radius by role (design language § Tokens) | yes, 2026-11-22 |
| Screen 1: a folded panel's widths under 640 px (chat folds too) | Under 768 px is the phone layout, so that case never shows | The console's phone width (UX foundation 10) | yes, 2026-11-22 |
| Screen 1 § States: someone else building ("Kabir is building v8"), a Builder (no Publish, Design a proposal), no code yet (no Code or Checks tab) | Not drawn in the shell | Each needs the session's data (who builds, the person's role, whether a build exists): WB·4. `inspectorTabs(phone, built)` already answers the third | yes, 2026-11-22 |
| Screen 1's "Who" switch (Designer, Developer, Partner, chat only) | Not built | The mockup's own demo control, not part of the screen | yes, 2026-11-22 |

## Lane B's plan check (2026-11-22; the orchestrator's rulings, for the owner where marked)
| Item | Ruling |
|---|---|
| G·3 the page where a person confirms the device code (Settings › Developer) | Drawn in no approved mockup. The server parts are built; the page waits for a mockup. **Owner** |
| D0·2 a Renew button on a Test key | Not drawn. The chip is built; the button waits. **Owner** |
| D0·3 what "no proved address" means before `app_website_of` exists | Open my store refuses when the store holds a Test or Build key that still answers and has no Website on a proved, live domain |
| G·4 G14 the compliance certificate | Frrata holds no such record; G14 waits on what it is and where the merchant enters it. **Owner** |
| G·4 `jsonLd` URLs | `site_origin` when set, else the store's frrata.shop host: one pure function P5·2 moves behind the predicate |
| G·1 the per-key limit | 300 a minute a key for Test and Build, failing closed; judged by `speed-reviewer` and `security-reviewer` on the diff |

## Lane D's mockup check (2026-11-22; the orchestrator's rulings, for the owner where marked)
Where the 22 Nov workbench and the 16 Nov redraw differ, the chat's cards, composer and build status follow the redraw
(approved for the chat) and the layout follows the workbench.
| Item | Ruling |
|---|---|
| Phone bar | Chat · Website · More (the mockup's Phone card corrected) |
| Proposal card, composer while building, the preview bar's build status | the redraw's |
| Cases | the three drawn plus a sold-out product |
| The branch button | "Hand branch to the agent" |
| Brand book's place in the inspector | Not drawn. Not built in the shell; a drawing goes to the owner. **Owner** |
| The resize edge, the `?` key list with its off switch, the rail dot's count | Not drawn. Built to defaults (a 4 px separator; a Dialog listing the keys with the switch; a dot with a hidden count) and shown to the owner on the built screen. **Owner** |
| Ctrl/⌘+K find; the credits drawer | Not in the shell |
