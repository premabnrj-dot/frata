# Studio workbench, the road to one address, apps for websites: the build
Status: draft (the spec is approved; three plan reviews still pending below; no lane opens before they are dated)
· Date: 2026-11-22 · Spec: `docs/specs/2026-11-22-studio-workbench.md` (active)
**Mockup:** https://claude.ai/artifact/7nJMbpWCz2z4EBXmNeyj2n (`docs/mockups/2026-11-22-studio-workbench.html`); T1 and AP2's two blocks still to draw
**Approved:** owner, 2026-11-22 ("go with your recommendation"; "Yes, test orders before opening")
**Review:** architecture-reviewer CHANGES NEEDED (4 blockers, 6 majors), all folded in, 2026-11-22
**Review:** security-reviewer FIX BEFORE MERGE (3 high, 4 medium, 3 low), all folded in, 2026-11-22
**Review:** api-contract-reviewer 3 blockers, 4 majors, all folded in, 2026-11-22
**Review:** words-reviewer 40 rows on the mockup, all rewritten, 2026-11-22
**Review:** tenancy-auditor FIX BEFORE MERGE (3 high, 3 medium, 1 low), all folded in (§ Tenancy audit), 2026-11-22
**Review:** speed-reviewer pending
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

## W0 · Stale text (documents only)
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

## Owner steps and open questions (none blocks wave 2)
| Item | State | Blocks |
|---|---|---|
| **Where partner websites are hosted** | Owner, 2026-11-22: asks for one Vercel account, or Cloudflare for hosting and images. ADR-0017 is "accepted as revised: Vercel only", with Cloudflare kept as the second adapter and a one-week measured test drawn as V2's first step. Not decided here | V2a; S22 is not acted on until it is decided |
| S22 Vercel teams | On hold behind the row above | V2a |
| O6 preview domain | Open | V2a previews |
| O4 `frrata.shop` to 3 years | Open | P4b only |
| Frrata's Razorpay, live | Owner, 2026-11-22: "razorpay is live". Seen in Vercel (names and dates only, never values): `RAZORPAY_BILLING_KEY_ID` and `_SECRET` replaced 2026-11-20; `FRRATA_GSTIN`, `_LEGAL_NAME`, `_ADDRESS`, `_SAC` added the same day; `RAZORPAY_BILLING_WEBHOOK_SECRET` unchanged since 2026-11-15. Production: 5 invoices, all test mode; no billing webhook ever stored | C1 taking real money: the live webhook must be confirmed first |
| A merchant's own Razorpay keys | Built and live: Settings › Online payments, owner only, `rzp_live_` or `rzp_test_`, checked with Razorpay before saving | nothing |

## Practices recorded in skills (landed with the phase that builds each; versions bumped in that commit)
| Skill | Practice |
|---|---|
| `frata-storefront-api` | An app's website part is declared in the registry; one route table; `not_available`; every app stop purges `shop:<t>`; `check:api-docs` |
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
