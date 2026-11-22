# Studio workbench, the road to one address, and apps for websites
Status: active (owner, 2026-11-22: "go with your recommendation"; "Yes, test orders before opening"; four reviews folded in, § Reviews; nothing built) · Date: 2026-11-22 · Mockup: https://claude.ai/artifact/7nJMbpWCz2z4EBXmNeyj2n
(`docs/mockups/2026-11-22-studio-workbench.html`) · Approved: owner, 2026-11-22 (all ten calls as recommended) · Plan: `docs/plans/2026-11-22-studio-workbench.md`
Builds on: `docs/plans/2026-11-16-execution.md`, `docs/plans/2026-11-12-studio-build.md`,
`docs/plans/2026-11-16-one-address-checkout.md`, ADR-0018, ADR-0019, ADR-0020.

The owner, 2026-11-22: "pick all the remaining studio and it's relevant plans … do a final review and prepare for
execution"; why a domain before keys; a cleaner, best-in-the-world UX; a developer's and a designer's regular work;
"sidebars/panels should be collapsible"; checkout on a second address "isn't feasible at all"; how developers use apps on
a frontend; rules so every app's API lands in the docs; stress test and what is missing.

## In short
1. **A key no longer needs a domain.** A Test key answers with no domain since migration 0149 (16 Nov). The live Website
   page still draws a disabled "Connect a domain first"; a Live key still needs a proved address. D0 removes the box and
   adds the opening-day check.
2. **One address stays behind the secure frame** (ADR-0019, decision 7). The first draft of this spec proposed moving
   unopened stores early (P5a); `security-reviewer` and `architecture-reviewer` showed it cannot hold as written
   (§ 3). Instead **P3 moves up**: built straight after P2, beside V2a, so P5 waits on nothing but them.
3. **An unopened store takes no orders** (`src/app/s/[host]/_frame.tsx:23`, `src/lib/orders/place.ts:135`), so nobody
   can test checkout before opening day. **Test orders** become their own spec and mockup (T1).
4. **The approved Studio screen has no code view, no checks, no page cases and nothing folds.** V3b is built as a
   workbench: chat, preview, inspector; the two side panels fold and resize.
5. **No app declares what a website can use.** AP1 builds the contract (`ModuleDef.site`, `shop.apps`, one pure route
   table, `check:api-docs`); AP2 moves Delivery Zones' check and Product video onto it.

## Goal
Ranked problem 5 (a premium storefront built as code) and 4 (mobile checkout conversion). Measures: a developer's time
from a new client store to products on their own page (target under 10 minutes, no domain, no support message); the
share of Studio sessions where a panel is folded or the Code or Checks tab opened (are they used); zero websites blank
on opening day; a test order placed on every website before it opens; every app with a shopper part has a docs page (the gate, 100 %).

## Job
A partner's developer and designer build, check and hand over a brand's website in one screen that gets out of the way,
place a test order before opening day, and use each app from documented data and blocks.

## What is wrong today (read in the code and plans, 2026-11-22)
| What | Where | Why it matters |
|---|---|---|
| "Connect a domain first" drawn as a disabled select when Your own website is picked with no domain | `src/app/(console)/console/settings/website/website-view.tsx:102` | Keys render below (`:129`) and a Test key works; the screen says the opposite |
| A Test key's browser CORS: `localhost` or the website's own origin only | `src/lib/storefront-api/request.ts:47,113-117` | Only a client-side read on a preview host is refused; server renders work (0149:14-15). Docs line, not a build (call 1) |
| An unopened store draws Opening soon and refuses orders | `src/app/s/[host]/_frame.tsx:23`, `(order)/layout.tsx:13`, `src/lib/orders/place.ts:135`, `payment.ts:223` | Checkout cannot be tested before opening; no test-order concept exists; `online-payments/actions.ts:20` accepts live Razorpay keys before opening |
| A Test key stops at `first_opened_at`, and after 30 days | `drizzle/0149_test_keys_before_domain.sql:9,29,52` | A website on a preview address is blank the day the store opens; nothing warns |
| A Live key answers only with `site_origin` on a proved domain | `drizzle/0142`, `0149` | No way to go live on the store's frrata name before P5 |
| Studio one screen: chat, preview, two drawers; no keyboard map, no folding, no code or checks view; designers unnamed | `docs/specs/2026-11-15-studio-one-screen.md:18-47`, `docs/mockups/2026-11-16-studio-redraw.html` | A developer cannot read a change or a failing check; a designer cannot see states or a tablet width |
| No module declares `apiResources`; `Shop` has no `apps` | `src/domains/modules/registry.ts:24-49`, `src/domains/storefront-api/2026-12/schemas.ts:135-162` | A website cannot tell what is on |
| Product video: theme only (`shopVideos`, on Mux), no API field. Delivery check: a POST by host only | `src/lib/queries/storefront.ts:322`, `src/lib/queries/videos.ts`, `src/app/api/shop/delivery/route.ts` | A code website loses both |
| An app stopped by Frrata Admin (pause, trial end) or by the clock purges nothing | `src/lib/admin/modules.ts`; `drizzle/0143`, `0148` boundary sweep | `shop.apps` and a cached `not_available` would be stale up to an hour |
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
- **Preview bar:** page, case (Normal, No products, Longest heading, a sold-out product; each a real record of the store, never made-up data: execution plan, reconciliation 2), width (390, 768,
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

### 2. Start with no domain (D0; small, thrown away by V2a·8's approved card)
- The Website card's address row shows the store's `frrata.shop` name with **Connect my domain**; no disabled select.
- Days left on a Test key as a warn chip from day 7; Renew makes a new key and deletes the old.
- **Open my store** refuses while the website's kind is `elsewhere` with no proved address ("Your store is still
  closed."), offering Connect my domain and Keep it closed; Move the website to Frrata joins after P5.
- The key dialog says in one line that a Test key also reads products not yet published
  (`src/lib/storefront-api/resources.ts:30-32,96`), and the docs' Start guide says to read on the server on preview hosts.
- **Not built (call 1):** per-key preview origins. They matter only for client-side reads off the fleet; they widen
  where a draft-reading key is shipped; a deleted `*.vercel.app` project can be reclaimed by someone else.

### 3. The road to one address
| Step | What | Needs | State |
|---|---|---|---|
| A | P2 (approved): checkout and order pages in the brand's look. **T1 Test orders** (new, own spec and mockup): a signed-in member places an order on an unopened store from the console or Studio | P2; T1's spec | T1 is new |
| B | P3 the secure frame, then P5 one address, for unopened and open stores alike | P2; P3·1; V2a·1, ·5, ·6; P5·0; P5·1 | approved; **P3 moved up** to follow P2 directly, beside V2a |
| C | The checkout sheet | B; P3·1(a) | draft, nine calls |
**T1's constraints (from the reviews; its spec answers each):** test status derived on the server from the order's
time against `first_opened_at` (no column, never a parameter); only a member (or a console-minted token) reaches
checkout on an unopened store, the public keeps Opening soon; online payment only with an `rzp_test_` key; no stock
moved, no invoice serial taken, no outbox row for WhatsApp, courier or Conversions API, out of Analytics; erased at
opening and after a set number of days; EkCode not offered on a test checkout. Reviews: `security-reviewer`,
`tenancy-auditor`, `unit-economics-reviewer`.
**One address before the frame (P5a), withdrawn as a recommendation; call 4 if the owner wants it anyway.** What it
would need: `/api/shop/ekcode/*` answering 404 and no EkCode on such a host (`ekcode/me/route.ts:16-24` answers name,
phone and address to any same-origin script); checkout gated to members; `check:storage` and P5·5's COOP brought
forward; `Referrer-Policy: no-referrer` on order pages; opening blocked by a BEFORE trigger on `published_at` derived
from the `secure.` certified time (`first_opened_at` is set by an AFTER trigger, `drizzle/0068:79-86`), never a stored
flag; `customer_sessions` ended and `Clear-Site-Data: "storage"` at opening; the service-worker unregister answer as an
exit test; the `secure.` record still proved (P5·7); the build-mode state "Opening soon, noindex" and V2a·8 amended;
decision 7, S34 and the pen-test rule (`docs/specs/2026-11-16-one-address-checkout.md:497,587,703`) amended in the
owner's words. It saves about one wave; building P3 first saves nearly the same with nothing to undo.
Rejected: the website's server proxying `/checkout` (the partner's hosting reads personal data; ADR-0014 rule 3);
`checkout.<domain>` (two addresses); a cross-site frame (Safari and in-app browsers; BigCommerce's own rule); a
developer's own hosting as the upstream (call 6: not now); one address on `localhost`.

### 4. Apps for websites (AP1, AP2; the contract in `docs/specs/2026-11-11-storefront-api.md:134-145`, built)
- **Three ways:** **Data** (a GET through the key, closed schema), **Block** (a starter component that reads the data,
  wears the brand record, draws nothing while the app is off), **Frrata-drawn** (anything personal opens on the secure
  host; partner code never holds the field).
- `ModuleDef.site`: `{ resources, blocks, drawn } | { none: '<reason>' }`. `shop.apps`: an optional array, open enum
  (`MAY_GROW`) of usable keys with a website part, keys only, additive on `2026-12`, read through an `api*` loader at the
  API's hour, its key set pinned by a test.
- **Off, not in plan, paused, trial ended:** `404 {"error":"not_available"}`, a named sentinel returned only after the key
  checks out (a door change: `request.ts:49,138` has one 404 body; skill rule 3 updated). The block draws nothing.
- **Purges, each named in the plan and each purging `shop:<t>` (not `settings` alone):** the console switch (exists,
  `console/apps/actions.ts:75,148,180`), Admin pause and unpause, Admin trial or end, a trial or add-on ending by the
  clock (`app_shops_with_boundary` extended), a plan change.
- **One pure route table** in `src/domains/storefront-api/2026-12/` (paths, summaries, parameters) for core and app
  resources; `RESOURCES` (server-only, `src/lib`) and `openapi.ts` both read it (`check:layers`). Today's `paths` are
  pinned as a fixture first; the generated output must deep-equal it. The released snapshot, `check:api`'s closed-schema
  and cost scans and `waf.test.ts` derive from the table, so an app's schemas in `src/domains/<key>/api/` are inside the
  gates. Covers `k/`, `t/` and G·2's `h/`, so **AP1 follows G·2**.
- **AP2 Delivery Zones:** `delivery/check?pin=`, **dynamic like search** (never a cached `[pin]` route), its own limit
  kind per network (/64, failing closed) with a per-key ceiling; one function in `src/lib/queries/delivery.ts` shared
  with the theme's POST (`api/shop/delivery/route.ts`), one answer shape with the fields listed (delivers, place as city
  and state, the arrive-by date, charge, Pay on delivery offered); never a zone's id, a rule's kind or a note
  (`route.ts:15`); "up to 60 s stale" stated; the WAF path and the `check-api.mjs:57` allow-list entry. Block `<PinCheck>`.
- **AP2 Product video:** `product.video`, optional and nullable: a closed, named pair of Mux hosts with a playback-id
  pattern (HLS), ready videos only, never the asset id or upload state; null when the app is not usable; a video
  turning ready and the app switch purge the product copies. Mux minutes on partner websites are Frrata's bill:
  `unit-economics-reviewer` before it ships. Block `<ProductVideo>`.
- **Not built:** `?sample=1` and sample products (their only named user is Reviews, not yet built; skill rule 5 says
  never a sample).

### 5. Rules for every app (the mockup's table, 1–8)
Gates: `check:modules` (a `site` entry or a reason), **`check:api-docs`** (new: every served route in the generated
description and the reverse; every field described; every example parses; a snapshot change has a "What's new" line),
`kit.test` (each named block exists; types current), plus the existing `check:api`, `released-api.test.ts`,
`check:client-bundle`, `api-contract-reviewer`. `check:api-docs` skips comment lines and is run against its own description.

## Proposed phases (each usable on its own; tasks and verify commands go in the plan after sign-off)
| Phase | Lane | After it | Waits on | Mockup |
|---|---|---|---|---|
| W0 Stale text | — | V0·1's ADR-0017 body, kit spec § 1, spec headers, agent spec § 14's three rows corrected | nothing | none — documents |
| D0 Start with no domain | B | screen 2 | call 2 | screen 2 |
| P3 moved up | E | the frame built straight after P2, beside V2a | P2; P3·1 | P3's, approved |
| T1 Test orders | E | a member places an order before opening | its own spec, mockup and reviews; call 5 | to draw |
| AP1 App contract and docs gate | B | `shop.apps`, the route table, generated paths and app pages, `check:api-docs` | G·2; call 7 | screen 4 (docs page) |
| AP2 Two apps on websites | B | delivery check and video on code websites | AP1; the Mux cost review | the two blocks, in the pilot's look |
| V3b as the workbench | D | screen 1 | call 3; V3a's proof | screen 1 |
Unchanged: G-a, P2, P4b, V2a, C1, V2b, A1a, V2c, V3a, P5, P6, V3c, V3d, G-b, A1b. **P7** becomes "Checkout in the
preview's page list" (drawn in screen 1), not a separate tab.

## Design review
- **UI/UX** — Jobs: build (chat), judge (preview), adjust and verify (inspector). One primary action in the top bar per
  step, as approved. Readers: partner owner, Lead, Builder, their developer and designer; the brand's owner on review.
  States in the mockup. Norman: the rail's icons are the signifiers; fold and resize are constraints, never modes that
  lose work; every hand edit has Undo through Versions; a developer's model is files, changes and checks; a designer's
  is pages, states and widths. Built from Neel primitives (Segmented, ViewTabs, Tag, Badge, Button, Dialog); the rail
  and the resize edge are two new primitives that join the Neel gallery and flow `81-neel`.
- **Tenancy** — D0 adds no table. AP1: resources take the tenant from the key through `apiRequest` only. V3b's Code
  and Checks resolve the site and version from `requireCapability`'s store, never from a URL id alone. T1 gets its own
  audit. `tenancy-auditor` on the plan.
- **Modularity** — pure: `src/domains/storefront-api/2026-12/routes.ts`, `src/domains/modules/site.ts`,
  `src/domains/studio/layout.ts` (panel maths, key map); reads in `src/lib/queries/`; one map `API_RESOURCES`.
- **SSOT / DRY** — an app's website part: the registry, once; docs, OpenAPI, llms.txt and the starter's types derive.
  Paths: the one route table. The delivery check: one query function, two doors. Panel layout: browser storage only.
- **YAGNI** — out: a browser code editor, Figma import, events to partner servers, wildcard origins, own-hosting
  upstream, checkout slots. Signals in § Out of scope.
- **KISS** — D0 is one card, one chip, one refusal at opening. AP1 is a field on `ModuleDef`, a map and a
  gate. The workbench is CSS grid with two folding columns; no new dependency.
- **Scalability** — `delivery/check` is dynamic: per-network and per-key limits; a 60 s CDN copy. `shop.apps` rides the
  cached `shop` entry. Code and Checks read per version on open, never on every turn.
- **Performance and speed** — (a) Settings › Website gains no statement (days left derive from the key's row already
  read); (b) `delivery/check` reuses the theme route's indexed lookup: EXPLAIN in the plan; (c) the `shop` entry grows by
  the apps list (< 200 bytes); (d) no shop page changes; (e) every app stop purges `shop:<t>`; (f) Studio: the Code and
  Checks tabs load on first open, so the partner layout's first load stays at its 101 kB; (g) nothing new preloaded.
- **Reliability** — one new outbound read: a version's changed files from the site's repository through the session
  App, by `fetchWithTimeout`, on open of the Code tab; check results are stored with the build by V2a·6's gate (a column
  or table named in V2a's plan). A miss says "We couldn't load this. Nothing was changed." in that panel alone.
- **Security** — D0: the opening refusal is `CAN_MANAGE`'s action, checked on the server. `delivery/check`: a PIN alone
  is not personal; no address fields; limits fail closed. Code and Checks: a path allowlist without dotfiles or
  `.env*`; size caps; rendered as text, never HTML or links; `frs_` and `rzp_` patterns and the build-key header
  redacted from check output. T1 and (if chosen) P5a: the constraints in § 3, with `security-reviewer` and a person.
- **Motion and visuals** — panel fold: the Neel base duration and standard easing on the grid columns; reduced motion:
  instant. No new duration. Pictures over words: the address-bar strip in screen 3; icons from the console's own set.
- **Unit economics** — hand edits and Checks cost no credits (as approved for data edits); `delivery/check` adds API
  reads on Frrata's bill (bounded by the limits); Product video on websites adds Mux delivery minutes with no budget
  today (`registry.ts:85`): `unit-economics-reviewer` on AP2 before it ships.
- **Theme blocks** — n/a: themes are retiring; blocks here are starter components.
- **Storefront API** — additive on `2026-12`: `shop.apps`, `product.video`, `delivery/check` (dynamic), the
  `not_available` sentinel. No cost, shopper or draft field. Purges as § 4. `2026-12.json` grows by a reviewed
  `UPDATE_API=1` commit.
  `api-contract-reviewer` on the plan.
- **Blast radius** — `apiRequest` (every API call: the 404 sentinel); `openapi.ts` and `docs.ts:88` (slugs follow path
  order); the registry (every app page); `app_shops_with_boundary` (the drain); the V3b mockup (two drawers become tabs;
  P7's tab becomes a page in the list).

### Stress test
| Severity | What | Where | Fix |
|---|---|---|---|
| High | A store opens while its website runs on a Test key with no proved address: blank website | 0149:29,52 | D0's opening refusal |
| High | No order can be placed before opening | `_frame.tsx:23`, `place.ts:135` | T1 |
| High | A code website silently loses the delivery check and product video | § What is wrong | AP2 before a second website |
| High | An app stopped by Admin or the clock stays listed for up to an hour | `src/lib/admin/modules.ts` | § 4's purges |
| Medium | A Test key reaches day 30 mid-build | 0149:9 | days-left chip, Renew |
| Medium | A Test key in a public preview's bundle reads unpublished products | `resources.ts:30-32,96` | the dialog's line; build keys (G·2) server-only |
| Medium | Mux minutes on partner websites unbudgeted | `registry.ts:85` | the cost review before AP2 |
| Medium | Code and Checks have no stored data to read | `site_deployments` | V2a·6 stores check results; changes read from the repository |
| Medium | Two people in Studio on one website | agent spec, unwritten | one agent turn at a time on each website; word edits still save |
| Medium | An app turned on after the website was built | — | a suggestion above the composer |
| Low | Chat folded while the agent asks | screen 1 | the rail's dot and count; nothing opens by itself |
| Low | A site's own cached pages after a price change | to confirm in V2a | one "changed" call to a hosted website on a purge |
| Low | A website's own Meta pixel wants Purchase | checkout is Frrata's | call 9 |

## Reviews (2026-11-22, on the first draft; all folded in above)
| Agent | Verdict | What changed |
|---|---|---|
| `architecture-reviewer` | CHANGES NEEDED (4 blockers, 6 majors) | P5a withdrawn; test orders named as missing and split out as T1; origins dropped; the pure route table; the delivery route corrected; P7 and the workbench's data needs written |
| `security-reviewer` | FIX BEFORE MERGE (3 high, 4 medium, 3 low) | P5a's real exposure (EkCode, tab storage) and what it would need; T1's constraints; the draft-reading Test key; Code and Checks limits |
| `api-contract-reviewer` | 3 blockers, 4 majors | video on Mux hosts; purges for every app stop; module schemas inside the gates; `delivery/check` dynamic; the `not_available` sentinel; `?sample=1` dropped |
| `words-reviewer` | 40 rows on the mockup | all rewritten; "Site" against the glossary's "Website" is call 10 |
Still to run once the owner decides: `tenancy-auditor`, `speed-reviewer` and `unit-economics-reviewer` on the plan;
`design-system-reviewer` on screen 1; every reviewer again on T1's spec.

## Owner decisions (all taken as recommended, owner 2026-11-22)
1 preview addresses on a Test key (not now) · 2 Open my store refuses without a proved address (yes) · 3 the workbench
with Versions and Brand book docked (yes; a deviation from 16 Nov) · 4 one address before the frame (no; build P3
first) · 5 test orders before opening, own spec (yes) · 6 own hosting behind one address (not now) · 7 every app declares
its website part, and AP2 before a second website, after the video cost review (yes) · 8 code read in Studio, written
elsewhere (yes) · 9 Purchase events for a website's own pixel: sent by Frrata, own spec · 10 Studio's step "Site"
becomes "Website" (yes).

## Out of scope
| Left out | Signal that brings it back |
|---|---|
| A code editor in Studio | two partners ask after a month with the Code tab |
| Figma import | a designer partner sends a file and asks |
| Events to a partner's server | an app needs one; then through the outbox, signed |
| Own hosting as the one-address upstream | a partner with their own pipeline asks |
| A "changed" call to hosted websites on a tag purge | confirmed needed in V2a |
| Preview origins on a Test key | a partner's website reads the store in the browser |
| Sample products and `?sample=1` | a partner starts before the brand has products, or Reviews ships |

## Facts used
The Research table's rows (vendor pages read 2026-11-22). Frrata's own: migration 0149; ADR-0019 point 5 and 7;
`docs/specs/2026-11-11-storefront-api.md:134-145`; decision 7 and lines 497, 587 of the one-address spec.
