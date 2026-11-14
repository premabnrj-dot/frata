# Studio and storefront findings (review session 14 Nov 2026), checked against the repository
Date: 2026-11-14 · Checked at: branch `claude/amazing-wright-7irwn3` merged with main `d08bdd4e` · Method: three
read-only passes (ADRs and specs; the Studio mockup rendered in Chromium, every view and dialog; Storefront API, kit
and reuse) plus spot checks by hand. Plan built on this: `docs/specs/2026-11-14-site-content-layer.md`.

Abbreviations: **ADR14** `docs/decisions/0014-storefronts-as-code.md` · **AS** `docs/specs/2026-11-11-agentic-storefront.md`
· **SA** `docs/specs/2026-11-11-storefront-api.md` · **KF** `docs/specs/2026-11-12-kit-and-fleet.md` · **ST**
`docs/specs/2026-11-11-frrata-studio.md` · **SH** `docs/specs/2026-11-12-studio-shell-clients-billing.md` · **IT**
`docs/specs/2026-11-12-studio-intake-and-team.md` · **MK** `docs/mockups/2026-11-13-studio-v2.html` · **HD**
`docs/mockups/2026-11-11-studio-hardening.html`.

## Part A · Where things stand
| # | Verdict | Evidence | Correction |
|---|---|---|---|
| A1 | **Partly** | No Storefront API code: `src/app/api/` holds auth, console, cron, ek, shop, webhooks; no `src/domains/storefront-api`, no key table, no `api` route kind. No hosting record: ADR-0005 amendments cover files, AWS, share images only; ADR14:45 "A hosting decision record amending ADR-0005 comes before V2". ST:2 draft; SH:2 "proposed"; KF:2 approved. | Too narrow on what is approved: **ADR-0014 is accepted** (ADR14:3), AS's direction accepted (AS:2), the studio build plan is active (`docs/plans/2026-11-12-studio-build.md:2`), **T1a is built and live** (0123/0124), T1b is approved and paused after task 1 on a branch. ADR-0015 is proposed. `src/app/api/shop/delivery/route.ts:11` calls itself "the Storefront API's delivery resource" but is a host-routed shop route with no key. SA:2 still says **"parked"**: outdated, ADR-0014 un-parked it (AS:24). |
| A2 | **Verified** | ADR14:23-24 "No new theme work … Live looks keep rendering until each shop moves (V5); then the theme catalogue, the customizer and ADR-0012 are removed." AS:22. | Themes are frozen for new work, not switched off: the customizer still edits live looks, menus, pages and the announcement today. |
| A3 | **Verified (wording)** | ADR14:37-38 "**Content stays data:** pages' words, FAQ, policies, menus and announcements are edited in the console and served by the API; a site's code owns layout. The legal block is runtime data, never compiled in." | It says "owns layout", not "only layout". It does not list banners, featured collections, size help, seasons, images or SEO text, and no editable-fields contract exists anywhere. **Today** menus and the Contact line live in the look's layer (`src/domains/themes/layer.ts:63-66`), pages and the FAQ in `shop_pages` (`src/lib/db/schema-themes.ts:63`), edited in the Look customizer that V5 removes. AS:23 still lists "pages as data" under **Goes**: contradicts amendment 3. |
| A4 | **Partly** | SH:51 "every edit by hand on the right is mirrored in the chat". MK:1020 "Edit by hand · every change is a new version"; MK:2013. | The spec says it; **the mockup does not do it**: a hand edit to a swatch changes the tokens (MK:1440) and nothing appears in the chat. |

## Part B · Customizer or chat
| # | Verdict | Evidence | Correction |
|---|---|---|---|
| B1 | **Verified** | IT:15-17 "the partner uses its own credits on that brand's site. The brand never needs credits"; ST:89-91; SH:79. | — |
| B2 | **Wrong (framing)** | ST:57, ST:81 "a turn costs ₹5–150"; ADR14:33 credit = ₹6.33 measured, sold at ₹19. | ₹5–150 is Frrata's **measured cost**; at 3× a turn is about **₹15–450**. The build and checks are **inside** that measured cost (ST:56), not added; HD #28 "no build per turn" (previews from the sandbox dev server, a build only on publish). The argument gets stronger, not weaker. |
| B3 | **Partly** | AS:106 and ST:133 "Builds on publish only; a global turn queue" (review findings, marked not yet folded, AS:82). Ranked problem 7 is festive-peak reliability (`frata-planning`). | Two separate controls: the global queue is for **model turns**; builds use reserved publish slots, queued per site (ST:70, KF:167). A content edit as data is a tag purge: confirmed as the cheaper path (SA:94 tags `shop:<tenant>`). |
| B4 | **Partly** | ADR14:21 "a person publishes"; KF:133 publish gate; AS:31-32. | Exceptions: the patch lane deploys with no click (ADR14:34-35); before handover the partner publishes with no approval (ADR14:52-53); routines "publish if the partner allowed it" (ST:34-35, open question ST:75). |
| B5 | **No support found** | Phone appears for intake (IT:41), the client's approval (ST:14), push, phone layouts. | Not a recorded fact. The console is used on phones (Rule 0, `frata-design-language`) and the Look was phone-first (TS specs), so the claim is a reasonable design premise, not a finding. Treated as a premise in the plan. |
| B6 | **Verified, stance since reversed** | SA:6-8 "their Claude builds the client's website against this API with the kit Frrata gives it"; kill signal SA:16 and AS:61 "< 3 external sites live in 90 days". | ADR14:11-12 reversed "Claude never runs on Frrata's servers" (Studio is Frrata's own builder). HD's V1 gate softens the kill to external self-hosting only. Self-hosting before V2 is allowed (ADR14:44-45, KF:241). So "bring your own agent first" is consistent with the specs; making Studio wait on V1's signal is a new decision for the owner. |
| B7 | **Partly** | "Live looks keep rendering" ADR14:24; V5 "Live looks turned into code" AS:65; KF:245 parity checks to Starter 0. | **"Free" is not written anywhere**, and KF:271 says migrations for shops with no partner are "priced in credits at 3× … or absorbed for security". "Done by Frrata" is implied by the fleet, not stated. Needs an owner decision. |
| B8 | **Partly / outdated** | AS:82, ST:109 "findings recorded, not yet folded"; HD "Decisions for you". | HD's six questions **are answered** in ADR-0014's amendment (credits, patch lane, content as data, hosting, today-fixes, verification). What is not folded: the AS phase table (no V1.5, not reordered), ST pricing ("a new page 10–30 credits" vs HD 50–100), free tier (10 credits vs "60 once"), status lines. ST:75-76 has a **different** six: credits answered (B1); seat prices, routines that publish, client approval on every publish, brands' own developers, model host still open. |
| B9 | **Verified, with a limit** | `frata-unit-economics` § 3× rule: model tokens, sandboxes, builds, bandwidth sell at 3×. | Free direct edits fit **only** when no metered resource runs. Content edits saved as data: free. A hand edit to the design system: sandbox seconds for the preview and a build at publish; inside the plan's build-minute allowance (ST:55) or at 3×. |

**Phases as written** (AS:58-65): V0 decision (it says ADR-0013; a typo for ADR-0014); V1 Storefront API SA1, keys,
docs, a starter (kill: < 3 external sites in 90 days); V2 repo and isolated deployment per shop on Frrata hosting
(kill: hosting cost above plans); V3 the builder (kill: agent sites slower or less accessible than the starter); V4
the gallery (kill: < 5 partner starters in 120 days); V5 looks to code, themes removed. KF adds **V1.5** (brand
tokens, KF:104-105, 241); the studio build plan puts the hosting record and the key amendment in V0.

## Part C · The Studio mockup (it is **v2.4**, `6c8634a7`, not v2.3)
| # | Verdict | Evidence (view · line) | Correction |
|---|---|---|---|
| C1 | **Verified** | Routines dialog: "Refresh the New in row from the catalogue" / "Every Monday, 9:00 · Ask before publishing" (MK:1783); Hand over dialog "Every Monday: refresh New in" (MK:2098). | It asks before publishing; still a weekly commit and build for what the API serves live. |
| C2 | **Verified** | Routines: "Add it to the menu and make its page" / "When a collection is created · Publish if checks pass" (MK:1783); Hand over "New collection → menu and page" (MK:2099). | — |
| C3 | **Partly** | Two separate Home inbox cards: "Haldi House · Festive banner · 3 variants · Checks passed" (Ready to review, MK:922); "Haldi House · v3a sent to Meher for approval · 2 days" (Waiting on client, MK:925). | Not one item; the point stands. |
| C4 | **Verified (wording differs)** | Build › Data: "Your site can read" · Shop (policies, legal block, COD, delivery promises) · Products (…) · "Collections, search, offers" · Through apps · Handed to checkout · Never (MK:1635). | No content group; "announcement", "FAQ", "menu", "page words" appear nowhere in the file. |
| C5 | **Verified** | Hand over dialog (MK:2094-2104): checks again on 7f3a, Riya accepts this version, the partner stays, 46 credits, routines. | Nothing says what the owner can change herself. |
| C6 | **Verified** | Design system › Seasons (MK:1832, 1893); chat writes `seasons/wedding.json` "15 Nov to 15 Feb … gold accent, zari band, 'Wedding edit'" (MK:1919-1920). | The season, its dates and even the badge's words are a versioned token file in the site's code: changing the end date is a commit and a build. |
| C7 | **Partly** | Pages list "Home, Collection, Product, Size help, Our weavers, Lookbook, Contact, Questions" (MK:1489). | The mockup says nothing on screen; its plan maps them to `app/contact/page.tsx` and `app/questions/page.tsx` (MK:1519), and its Files tab shows copy in code (`title={voice.hero}`): words in code, against amendment 3. |
| extra | — | Wishlist heart in the preview header and a "Wishlist" component (MK:1420, 1881). Agency starter "Atelier · Pixel & Thread · your agency starter" (MK:1490). Apps tab "Riya turns them on in her console; Studio never does" (MK:1633). | Missing: an editable-fields tab, a content group, a handover step showing what she can change, any brand content editor. |

## Part D · What a developer can build
| Claim | Verdict | Evidence | Correction |
|---|---|---|---|
| No server or database of the site's own | **Partly** | ADR14:18-19; KF:131 "no route handlers, middleware or server actions in site code" | Holds for Frrata-hosted sites (V2+). In V1 a developer may self-host anywhere (ADR14:44-45); SA2 adds server keys (SA:24). |
| Checkout, payment, sign-in, personal data on Frrata; bag by link | **Verified** | ADR14:20; SA:113 | — |
| Outbound only to Frrata, image host, fonts; at the router | **Partly** | ST:47; KF:130 `connect-src`, `form-action`; KF:138 "outbound Worker … and at the router" | The outbound Worker plus router headers, from V2; checkout is also allowed (AS:40). Third-party scripts are **deferred**, not forbidden (IT:13, owner "a later stage"). Frrata's own `fe.js` beacon runs on sites (KF:99, 208): "no analytics" is wrong. |
| Packages: allow-list, exact versions, 7-day wait, install scripts blocked | **Verified** | KF:135-137 | `@frrata/*` exempt (KF:74-75); an advisory fix may skip the wait with two approvals (KF:136). |
| Checks before every publish | **Verified** | AS:38-40; KF:133 | Also the build and the outbound hosts. |
| API text plain, never HTML | **Verified** | SA:107 | — |
| Images only from Frrata's host | **Partly** | SA:101; KF:99 | True for API images; no `img-src` floor, and the Studio mockup allows "the partner's licensed uploads" (`docs/mockups` Studio v1:693). |
| A person publishes | **Partly** | ADR14:21 | Exceptions as B4. |
| **API data** (version 2026-12, read-only, 60 s) | **Verified, with corrections** | SA:93-104 | `search` is dynamic, not cached (SA:104); HD asked for 900 s with tag purges (AS:105, not folded). The cart link is a checkout-host URL (§ 4), not a § 3 resource. **Brand tokens** are V1.5 (KF:104), not § 3. **Module resources**: only a contract, "No module resource in SA1" (SA:140); SH:97 names PIN check and product video, a conflict. A product's JSON-LD object (KF:99) is missing from § 3. The claim omits keys in the path, test keys, CORS, open enums, Deprecation/Sunset (SA:83-86, 109, 151-154). |
| D1 Content resources missing | **Partly** | SA:97-104 | Policies (in `shop`) and the announcement (in `offers`, and today it is an **offer**, not free text: `src/lib/queries/announcement.ts:8`) are there. Page words, FAQ, menus, banners, size help are not; the starter's About and FAQ pages (SA:158) have no resource. |
| D2 No filters | **Verified** | SA:100-104 | The facts exist: `colourFamilies, minPrice, inStock` (`src/domains/storefront/listing.ts:57`). |
| D3 600 cap | **Verified** | SA:100; `src/lib/queries/storefront.ts:117-118` `MAX_LISTED = 600` ("a cached entry must stay well under the data cache's 2 MB") | — |
| D4 Wishlist needs shopper data | **Partly** | No Sites spec mentions a wishlist | A wishlist **on the device** (like `bag-store.ts`) needs no shopper data; only a cross-device one needs sign-in, which stays on Frrata. |
| D5 Reviews has no API resource | **Verified, deliberate** | `src/domains/reviews/*`; `registry.ts:61` `status: 'next'`; SA:140 "(Reviews is still `next`)"; R1 parked (`docs/plans/2026-11-09-reviews-r1.md:2`) | Follows the module contract when Reviews ships. |
| D6 No third-party scripts, no shopper accounts | **Verified** | IT:13 "Third-party scripts: a later stage"; ADR14:20 | No allowed-scripts list exists. Deferred by the owner, not refused. |

## Reuse
| Claim | Verdict | Evidence | Correction |
|---|---|---|---|
| A repo per site recording its starter and version | **Verified** | ADR14:18; KF:118-119 | — |
| Starters are repository templates | **Verified** | KF:117 | Plus a brand-brain template, skill, screenshots, licence, parity test. |
| Starter 0 is free | **Partly** | Implied by SA:158 "public repo" | Never stated. |
| Partner starters to a gallery at V4, re-reviewed every release | **Verified** | KF:121-122, 244 | — |
| Partner keeps 85% if paid | **Partly** | ST:60 | A pricing hypothesis; partners' money is open (AS:70). |
| The owner can export the code at any time | **Conflicting** | KF:211-212 yes | The owner's **later** answer: "Code export / leaving with the code: later" (IT:11), out of scope (IT:191). KF should be corrected to match. |
| The code holds no brand data | **Partly** | ADR14:37-38; KF:175 "Never a release: … content, brand tokens, the legal block's words" | Tokens are API data only from V1.5; content resources are missing (D1); `brand.md` and the design system are per brand and live with the site (ST:36, IT:56). Copied code would carry brand A's design system and brand.md today. |
| Ownership, cross-brand reuse, private agency starters undecided | **Verified** | IT:14 "Templates between partners: a later stage" | HD:135 proposes "repos belong to the shop in a Frrata org … starters licensed for perpetual, transferable use … export = git bundle + media" (not folded, AS:82); ST:36 "skills stacked Frrata → starter → agency"; the Studio v1 mockup "House style as a skill, reused across clients". |
