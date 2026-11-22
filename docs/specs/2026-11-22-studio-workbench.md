# Studio workbench, one address while building, and apps for websites
Status: draft (for the owner; reviews pending; nothing built) · Date: 2026-11-22 · Mockup: MOCKUP_LINK
(`docs/mockups/2026-11-22-studio-workbench.html`) · Approved: —
Builds on: `docs/plans/2026-11-16-execution.md`, `docs/plans/2026-11-12-studio-build.md`,
`docs/plans/2026-11-16-one-address-checkout.md`, ADR-0018, ADR-0019, ADR-0020. The plan file is written after sign-off
(`check:plans` refuses a plan without a dated approval).

The owner, 2026-11-22: "pick all the remaining studio and it's relevant plans … do a final review and prepare for
execution"; why a domain before keys; a cleaner, best-in-the-world UX; a developer's and a designer's regular work;
"sidebars/panels should be collapsible"; checkout on a second address "isn't feasible at all"; how developers use apps on
a frontend; rules so every app's API lands in the docs; stress test and what is missing.

## In short
1. **A key no longer needs a domain.** A Test key answers with no domain since migration 0149 (16 Nov). The live Website
   page still draws a disabled "Connect a domain first", and a Live key still needs a proved address. D0 removes the
   dead end; P5a lets the store's `frrata.shop` name be that address.
2. **One address is approved (ADR-0019) but scheduled behind the secure frame.** ADR-0019 point 5 already allows a store
   with no real shoppers to move first. P5 splits: **P5a** (stores never opened) right after V2a; **P5b** (open stores)
   after P3.
3. **The approved Studio screen has no code view, no checks, no page states and nothing collapses.** V3b is built as a
   workbench: chat, preview, inspector; the two side panels fold and resize.
4. **No app owns an API resource; `shop.apps` and `API_RESOURCES` are specified and unbuilt.** AP1 builds the contract and
   its gate; AP2 moves Delivery Zones' PIN check and Product video onto it.
5. **Eight rules, three gates** keep the docs in step with every app.

## Goal
Ranked problem 5 (a premium storefront built as code) and 4 (mobile checkout conversion). Measures: a developer's time
from a new client store to products on their own page (target under 10 minutes, no domain, no support message); the
share of Studio sessions where a panel is folded or the Code or Checks tab opened (are they used); zero websites blank
on opening day; every app with a shopper part has a docs page (the gate, 100 %).

## Job
A partner's developer and designer build, check and hand over a brand's website in one screen that gets out of the way,
test a real order on one address before the brand owns a domain, and use each app from documented data and blocks.

## What is wrong today (read in the code and plans, 2026-11-22)
| What | Where | Why it matters |
|---|---|---|
| "Connect a domain first" drawn as a disabled select when Your own website is picked with no domain | `src/app/(console)/console/settings/website/website-view.tsx:102` | Keys render below (`:129`) and a Test key works; the screen says the opposite |
| A Test key's browser CORS: `localhost` or the website's own origin only | `src/lib/storefront-api/request.ts:47,113-117` | A shared preview link reads nothing in the browser |
| A Test key stops at `first_opened_at`, and after 30 days | `drizzle/0149_test_keys_before_domain.sql:9,29,52` | A website on a preview address is blank the day the store opens; nothing warns |
| A Live key answers only with `site_origin` on a proved domain | `drizzle/0142`, `0149` | No way to go live on the store's frrata name before P5 |
| V1 plan still says "keys answer only once the shop's Website points at a connected domain" | `docs/plans/2026-11-15-v1-storefront-api.md:391-393` | Stale; reads as the rule |
| Studio one screen: chat, preview, two drawers; no keyboard map, no folding, no code or checks view; designers unnamed | `docs/specs/2026-11-15-studio-one-screen.md:18-47`, `docs/mockups/2026-11-16-studio-redraw.html` | A developer cannot read a change or a failing check; a designer cannot see states or a tablet width |
| No module declares `apiResources`; `Shop` has no `apps` | `src/domains/modules/registry.ts:24-49`, `src/domains/storefront-api/2026-12/schemas.ts:135-162` | A website cannot tell what is on |
| Product video: theme only (`shopVideos`), no API field. PIN check: shop-host route only | `src/lib/queries/storefront.ts:322`, `src/app/api/shop/pincode` | A code website loses both |
| OpenAPI `paths` hand-listed; no gate ties a served route to a path or a docs page | `src/domains/storefront-api/2026-12/openapi.ts:38-55` | A route can ship undocumented |
| ADR-0017's body still describes Cloudflare and `frrata.site`; kit spec § 1 the same; agent spec § 14 three rows "Owner seen: no"; headers "Approved: —" on active specs | `docs/decisions/0017-site-hosting.md:91-174`, `docs/specs/2026-11-12-kit-and-fleet.md:88-95,242-243`, `docs/specs/2026-11-16-studio-agent.md:510-512` | A lane worker builds from them |
| The owner's test guide holds no marks | artifact `Y9AGNhzcPBqToN9wunrtcR`, collection `results`, read 2026-11-22: empty | Resume step 1 has nothing to fix; say so |

## Research (vendor pages read 2026-11-22 by `integration-researcher`; "undated" = live page, no date on it)
| Product · page date | What it does | Taken |
|---|---|---|
| Lovable · editor, preview-toolbar, 2026-11-20–22 | Chat left, preview right; Hide chat (Ctrl/⌘+B), `[` folds the sidebar; toolbar modes select, edit text, draw, comment; desktop, tablet, mobile | One key folds a panel; select, edit and note on the preview; three widths |
| Bolt · code-view 2026-11-11, visual-edits 2026-11-16 | Code view behind an icon; visual edits free until saved | Code behind a tab; hand edits cost no credits. Skipped: a terminal |
| v0 · design-mode, github, 2026-11-20 | Design panel on the picked element; a note carries the element's screenshot; Apply makes a version; branch per chat | The Design tab; a pinned note; Apply = version. Skipped: free colour and spacing (ours are the brand record's scales) |
| VS Code · 2026-11-18; Figma · undated | Side bar folds with one key; Zen mode; Figma minimises or hides all UI, right panel returns on selection | Preview only; the inspector returns when a part is picked |
| Shopify Hydrogen · go-live, installed-apps, undated (API 2026-10) | Tokenless reads, mock.shop demo data; checkout on `checkout.example.com`; "Hydrogen doesn't render app blocks" | Build before a domain; sample data. Skipped: a checkout subdomain; apps left for each developer to wire |
| Stripe · versioning 2026-11-18, keys undated; Razorpay · api-keys undated | Test keys at once ("without adding a website"); embedded checkout with `return_url`; no-break monthly versions; OpenAPI builds the SDKs | Test first, address at go-live; a return address; docs from the description |
| BigCommerce · embedded-checkout tutorial, undated | Embedded checkout in Safari "must be served from the same domain" | A frame only at one address |
| oasdiff · undated; llms.txt · 2026-08-10 | A CI command fails on a breaking change; a text index for agents | A failing check; ours are `released-api.test.ts` and `/llms.txt`, plus the new gate |
No current source found: panel shortcuts in v0, Webflow, Framer; GoKwik on code storefronts; whether Shopify's or
Stripe's keys are domain-bound (pages silent).

## Design (screens in the mockup)

### 1. The Studio workbench (replaces V3b's layout; the chat's cards, steps, credits and words stay as approved 16 Nov)
- **Three regions:** Chat (left, 340 px, 280–480), Preview (centre), Inspector (right, 320 px, 280–440). Each side panel
  folds to a 44 px rail; the rail keeps its icons and a dot with a count when the agent needs an answer or a check
  fails. A panel never opens by itself. Widths and folded state are kept per person in the browser (a convenience,
  never state).
- **Preview bar:** page, state (Normal, No products, Long heading, Sold out, Empty bag, Signed in), width (390, 768,
  1280), "Preview · vN", open in a new tab, Preview only. States come from pure fixtures (P2·5's pattern).
- **Inspector tabs:** Design (the picked part: words, photo, height, placement, block, the brand's colours read-only, a
  note for the agent), Code (files changed in this version, a read-only diff or file, the `npx frrata dev` command, a
  developer's branch with Hand to the agent), Checks (the publish gate's results with file and line, Fix with the
  agent), Versions (restore, compare two, side by side). Brand book opens from Design's brand row. **Versions and Brand
  book were drawers in the approved screen: this is a deviation and needs the owner's yes (call 3).**
- **Design writes data, never code** (agent spec § hand edits): each change is a chat line and a version, free of
  credits; a Builder's change is a proposal.
- **Code is read here, written elsewhere** (the developer's computer through G·3, or the agent). Call 8.
- **Keys:** `[` chat, `]` inspector, `\` preview only, F6 next region, 1–4 inspector tab, Ctrl/⌘+K find, `?` the list;
  single keys only outside a text box; one switch turns them off (the orders queue's rule).
- **Phone:** one region at a time from a bottom bar (Chat, Site, Design); Code is absent; Checks and Versions under
  Design.
- **Access:** WCAG 2.2 AA; regions are named landmarks; toggles carry `aria-expanded`; the resize edge is a separator
  with a value, moved by arrow keys; agent progress in one polite region, once a step; reduced motion: nothing travels.
- **States:** listed in the mockup (folded with a question, building, a failed check, Builder, someone else building,
  narrow computer, no code yet, a panel that couldn't load).

### 2. Start with no domain (D0; until V2a's approved Website card replaces the page)
- The Website card's address row shows the store's `frrata.shop` name with **Connect my domain**; no disabled select.
- A Test key lists **Works from**: `localhost` and up to five exact `https` origins (no wildcard, no path; Test keys
  only). The API echoes CORS for those. The same list is the only place a test order's way back may point.
- Days left on a Test key as a warn chip from day 7; Renew makes a new key and deletes the old.
- **Open my store** refuses while the website's kind is `elsewhere` with no proved address; it names Move the website
  to Frrata (after V2a) and Connect my domain.
- **Sample products:** twelve marked samples into an empty catalogue of a store never opened; deleted in one action.

### 3. One address (re-ordering approved work)
| Step | What | Needs | State |
|---|---|---|---|
| A | P2 (approved) plus a **way back**: a bag link made with a Test key carries its origin, matched exactly against the key's list; checkout's Back, Continue shopping and the order page return there; a "Test order" line on test orders only | P2; D0's list | return is new |
| B | **P5a**: a store never opened serves website, checkout and order pages on its `frrata.shop` name | V2a·1, ·5, ·6; P5·1; P5·2–P5·8. Not P3 | new split |
| C | **P5b**: open stores, frame holding every personal field | P3; then P5·9 | approved |
| D | The checkout sheet | C; P3·1(a) | draft, nine calls |
**P5a's rule, in the database:** `app_website_of` answers `one_address` for a store without the frame only while
`first_opened_at is null`; opening such a store fails closed until the frame flag is set for it. The brand origin then
holds only test orders, made with Razorpay's test mode.
Rejected: the website's server proxying `/checkout` (the partner's server reads personal data; ADR-0014 rule 3);
`checkout.<domain>` (two addresses); a cross-site frame (Safari and in-app browsers drop its cookies; BigCommerce's own
rule); a developer's own hosting as the upstream (call 5: not now); one address on `localhost` (step A covers it).

### 4. Apps for websites (AP1, AP2; the contract in `docs/specs/2026-11-11-storefront-api.md:134-145`, built)
- **Three ways:** **Data** (a GET through the key, closed schema, tagged), **Block** (a starter component that reads the
  data, wears the brand record, draws nothing while the app is off), **Frrata-drawn** (anything personal opens on the
  secure host; partner code never holds the field).
- `ModuleDef.site`: `{ resources, blocks, drawn } | { none: '<reason>' }`. `shop.apps`: an open enum of usable keys with
  a website part, additive on `2026-12`, on the `settings` tag.
- Off, not in plan or paused: `404 {"error":"not_available"}`; the block draws nothing.
- `?sample=1` on the test tree answers the resource's documented example, so a block is built before the brand has data.
- **AP2:** Delivery Zones `delivery/check?pin=` (the shop route's handler, one implementation; rate-limited per network
  and key; answers delivers, zone, days, never a fee rule's cost side) with `<PinCheck>`; Product video as
  `product.video` (poster, sources on Frrata media) with `<ProductVideo>`. Reviews follows the same contract when built.

### 5. Rules for every app (the mockup's table, 1–8)
Gates: `check:modules` (a `site` entry or a reason), **`check:api-docs`** (new: every served route in the generated
description and the reverse; every field described; every example parses; a snapshot change has a "What's new" line),
`kit.test` (each named block exists; types current), plus the existing `check:api`, `released-api.test.ts`,
`check:client-bundle`, `api-contract-reviewer`. OpenAPI `paths` are generated from `RESOURCES` and `API_RESOURCES`.

## Proposed phases (each merchant- or partner-usable; tasks and verify commands go in the plan after sign-off)
| Phase | Lane | After it | Waits on | Mockup |
|---|---|---|---|---|
| W0 Stale text | — | ADR-0017 body, kit spec § 1, spec headers, § 14's three rows, V1 plan `:391` corrected | nothing | none — documents |
| D0 Start with no domain | B | screen 2 | calls 1, 2 | screen 2 (key dialog still to draw) |
| P2 + way back | E | step A | P2 as planned | P2's, plus the Test order line |
| AP1 App contract and docs gate | B | `shop.apps`, the map, generated paths and app pages, `check:api-docs` | calls 6 | screen 4 (docs page) |
| AP2 Two apps on websites | B | PIN check and video on code websites | AP1 | starter blocks, drawn in the pilot's look |
| P5a One address while building | A | step B | V2a; P5·1; call 4 | V2a's approved card + a Building state |
| V3b as the workbench | D | screen 1 | call 3; V3a's proof | screen 1 |
Unchanged: G-a, P3, P4b, V2a, C1, V2b, A1a, V2c, V3a, P5b, P6, P7, V3c, V3d, G-b, A1b.

## Design review
- **UI/UX** — Jobs: build (chat), judge (preview), adjust and verify (inspector). One primary action in the top bar per
  step, as approved. Readers: partner owner, Lead, Builder, their developer and designer; the brand's owner on review.
  States in the mockup. Norman: the rail's icons are the signifiers; fold and resize are constraints, never modes that
  lose work; every hand edit has Undo through Versions; a developer's model is files, changes and checks; a designer's
  is pages, states and widths. Built from Neel primitives (Segmented, ViewTabs, Tag, Badge, Button, Dialog); the rail
  and the resize edge are two new primitives that join the Neel gallery and flow `81-neel`.
- **Tenancy** — D0: `storefront_key_origins` (tenant_id, key id, origin; grant, RLS, policy, one migration; at most five
  by CHECK-backed trigger); read only inside `app_storefront_key`'s definer result. The way back is derived from that
  row, never from the URL alone. AP1: resources take the tenant from the key through `apiRequest` only. P5a: the
  predicate reads `first_opened_at`; no new tenant source. Sample products are ordinary tenant rows with a marker
  column. `tenancy-auditor` on the plan.
- **Modularity** — pure: `src/domains/storefront-api/origins.ts`, `src/domains/modules/site.ts`,
  `src/domains/studio/layout.ts` (panel maths, key map); reads in `src/lib/queries/`; one map `API_RESOURCES`.
- **SSOT / DRY** — an app's website part: the registry, once; docs, OpenAPI, llms.txt and the starter's types derive.
  A key's allowed origins: one table. Whether a store may be at one address: `app_website_of`. The PIN check: one
  handler mounted twice. Panel layout: browser storage only.
- **YAGNI** — out: a browser code editor, Figma import, events to partner servers, wildcard origins, own-hosting
  upstream, checkout slots. Signals in § Out of scope.
- **KISS** — D0 is one small table, one CORS branch, one refusal at opening. AP1 is a field on `ModuleDef`, a map and a
  gate. The workbench is CSS grid with two folding columns; no new dependency.
- **Scalability** — origins: ≤ 5 rows a Test key, read in the key lookup already made (test tree is uncached,
  `private, no-store`). `delivery/check`: the theme route's cost today, now reachable by key: per-network and per-key
  limits, cached negative answers per PIN for the zone table's tag. `shop.apps` rides the cached `shop` entry.
- **Performance and speed** — (a) no page gains a statement except Settings › Website (+1 in the same `withTenant`);
  (b) the origins read joins by key id (primary key); `delivery/check` reuses the indexed zone lookup: EXPLAIN in the
  plan; (c) `shop` entry grows by the apps list (< 200 bytes); (d) no shop page changes; (e) the app switch purges
  `shop:<t>:settings`; (f) Studio's first-load JS: the inspector's Code and Checks tabs load on first open; budget set
  in V3b against the partner surface; (g) nothing new preloaded.
- **Reliability** — no new outbound call. Checks and Code read the fleet's stored build result; a missing result says
  "We couldn't load this. Nothing was changed." in that panel alone.
- **Security** — Origins: owner, Manager or the partner's owner/Lead (`api.manage`); Zod: `https://` + host, ≤ 253,
  lower-case, no path, no port but 443, no wildcard, not a Frrata host, not another store's proved domain; exact-match
  CORS, never reflected otherwise; Test keys only, so drafts stay behind build keys (G·2). Way back: built server-side
  from the key's stored list, rendered as a link, never an auto-redirect; live orders never carry one (no open
  redirect). P5a: fail-closed opening; `security-reviewer` and a person on the predicate change. `delivery/check`: a
  PIN is not personal alone; no address fields; limits fail closed. `?sample=1`: test tree only, fixture bytes, no
  tenant data. Code tab: files of the site's own repository at that version, to people `requireCapability` already
  lets build; secrets never live in a site repository (publish gate).
- **Motion and visuals** — panel fold: the Neel base duration and standard easing on the grid columns; reduced motion:
  instant. No new duration. Pictures over words: the address-bar strip in screen 3; icons from the console's own set.
- **Unit economics** — hand edits and Checks cost no credits (as approved for data edits); `delivery/check` adds API
  reads on Frrata's bill (bounded by the limits); P5a brings the router's cost forward for stores that earn nothing yet
  (ADR-0019's ₹0.21–4.57 per 1,000 views): cap unopened one-address stores by V2a's decision 18 gate.
  `unit-economics-reviewer` on P5a.
- **Theme blocks** — n/a: themes are retiring; blocks here are starter components.
- **Storefront API** — additive on `2026-12`: `shop.apps`, `product.video`, `delivery/check`, `?sample=1` (test tree).
  No cost, shopper or draft field. Tags: `settings` (apps), the product's tag (video), the zones tag (check).
  `api-contract-reviewer` on the plan.
- **Blast radius** — `apiRequest` (every API call: the CORS branch); `app_storefront_key` (every key lookup);
  `app_website_of` (P5·2, not yet built); the registry (every app page); the V3b mockup (two drawers become tabs).

### Stress test
The mockup's table (15 rows) is the record. The three highs: a website blank on opening day (fixed in D0); a code
website silently losing the PIN check and product video (AP2 before a second website); a one-address store without the
frame opening to real shoppers (P5a's fail-closed rule, proved in `scripts/verify/tenancy.sql`).

## Owner decisions
1 preview addresses on a Test key (yes) · 2 Open my store refuses without a proved address (yes) · 3 the workbench with
Versions and Brand book docked (yes; a deviation from 16 Nov) · 4 P5a before the frame (yes) · 5 own hosting behind one
address (not now) · 6 every app declares its website part, gate-held (yes) · 7 AP2 before a second website (yes) · 8
code read in Studio, written elsewhere (yes) · 9 Purchase events for a site's own pixel: server-side, own spec.

## Out of scope
| Left out | Signal that brings it back |
|---|---|
| A code editor in Studio | two partners ask after a month with the Code tab |
| Figma import | a designer partner sends a file and asks |
| Events to a partner's server | an app needs one; then through the outbox, signed |
| Own hosting as the one-address upstream | a partner with their own pipeline asks |
| A "changed" call to hosted websites on a tag purge | confirmed needed in V2a (stress row 12) |

## Facts used
The Research table's rows (vendor pages read 2026-11-22). Frrata's own: migration 0149; ADR-0019 point 5 and 7;
`docs/specs/2026-11-11-storefront-api.md:134-145`.
