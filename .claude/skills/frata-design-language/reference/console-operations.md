# frata-design-language — Console: orders, apps, content, settings, shipping, analytics, billing

Part of `frata-design-language` (SKILL.md holds the rules every screen obeys: Rule 0, Words, tokens, feedback).
These sections are the owner-approved rules of one surface; they are moved here unchanged (practices plan G4).

## Contents

- Work queues and records
- Apps
- Apps gallery
- Console › Content
- Settings choices and GST
- Shipping
- Analytics
- Shop addresses
- Plan and billing
- Neel analytics
- Neel finding
- Brand, Website and publishing on a code-site store

## Work queues and records (owner-approved with 1D Orders, 2026-11-07)

Research: Shopify Orders, Razorpay RTO review, Shiprocket (2026-08-24), Linear
triage, Gmail, Stripe, NN/g confirmation dialogs (2026-08-07). Spec:
`docs/specs/2026-11-07-orders.md`.

1. **Two axes, two badges.** How something is paid and where it is in its life
   are separate badges, never one merged label ("COD" + "To confirm").
2. **Risk is reasons, not a score:** a level as a word + mark (never colour
   alone), up to three reasons in plain words, ONE next step with its action
   (Call, WhatsApp). Low shows nothing. Risk advises; it never acts.
3. **One primary action per state** in a record's header; everything else under
   More. The button names the outcome ("Mark packed", not "Update").
4. **Undo for routine, a dialog for serious.** Routine, reversible actions
   happen at once with Undo for 8 s and an Undo link left on the record. A
   dialog only for what loses work, money or stock, its buttons naming the
   outcome ("Cancel order", "Keep order"), a reason required where it matters.
5. **Conflicts said in words:** "Already confirmed by Riya at 10:42" — never a
   silent overwrite or a generic error.
6. **Keyboard on queues:** `j`/`k` move, `x` select, `Enter` open, single
   letters for the commonest actions, `z` undo, `/` search, `?` the sheet.
   Never in an input. A key whose action is risky on this row opens the record
   instead. The `?` sheet has a switch to turn single-key shortcuts off (WCAG
   2.1.4), kept on the device (`localStorage`; per person when profiles exist).
   `?` always opens the sheet, so the switch can be found.
7. **Bulk actions skip what needs a person** and say so: "Confirmed 12.
   Skipped 2 high-risk orders — open them to decide." The skip is decided on
   the server (risk is never sent by the page); each failure keeps its own
   words ("KS-1012: Already confirmed by riya@…"), never a generic one. No bulk
   for destructive actions that need a reason. Bulk is a desktop tool: on a
   phone a row is one target, so selection hides.
   - **A queue row with three or more badges** puts them on a full line of
     their own on a phone (DataTable cell `e`), so number and name never squeeze.
   - **Row links never prefetch** (`prefetch={false}`): a page of rows would be
     a page of server renders on every visit.
   - **Risk that cannot be read fails closed:** "Risk unavailable", and the
     confirm key opens the order instead of confirming it.
8. **Views as tabs with counts**, derived from the record's state, one search
   box; every tab has its own empty state that says what lands there.
9. **Documents are print pages** (A4, browser print), not PDFs; the number on
   them is issued once and reprints show the same one.
10. **Shoppers never see internal words:** a state shown to a shopper goes
    through its shopper mapping ("Confirming your order"), never the raw value.

## Apps (approved mockup v2, 2026-11-07; the gallery and app pages: § Apps gallery below)

- **Console › Apps** (`/console/apps`, Store group; in More on a phone): the gallery in § Apps gallery. Every card and
  app page reads `offerFor()` (`src/domains/modules/offer.ts`) — footer, state chip, filter and the one action.
- Turning a module off asks once: "Turn off X?" · "Keep X" / "Turn off X".
- **Messages setup** (`/console/apps/communication`, from the Apps row's "Set up"): not connected → two path cards
  (Business app, bordered 2 px, "Most brands"; a new number) with an icon tile, the app-changes and other-tool
  notes as (i) tips, and a muted "Next" band. Connected → the number card (mono phone, name · which apps, Quality,
  Limit, Chats from the app; More: Check again, Disconnect) and "Needs you" rows: a badge (Blocks messages / By 31
  Dec / Quality low / In review), the need in words, one action. Meta's raw values never show.
- **Apps, everywhere a person reads it** (owner, 2026-11-15: "It'll be Apps. across the whole ecosystem"): never
  "module" or "add-on" in what anyone reads; a paid one is a **paid app**. Code names (`modules`, `tenant_addons`) keep
  their spelling. Frrata Admin: `/admin/apps` (tabs Apps · Waiting list) and a merchant's Apps tab (Overview · Plan ·
  Apps · Addresses · Activity); the old `/modules` addresses redirect. Pause for everyone sits in a row's More and asks
  why; the store sees "Paused by Frrata". Admin writes are master-admin only.
  The Addresses tab lists the store's names, then "Rename <store>'s address" and "Freeze <store>'s address", each with
  a reason. Admin › Names: a claimed domain leads; Blocked · Held · Reserved as tabs; Block, Unblock, Release in dialogs.

## Apps gallery (owner-approved 2026-11-11, mockup https://claude.ai/artifact/6Th5A8X4YSXCcyozpzPLEg; plan `docs/plans/2026-11-11-apps-gallery.md`; supersedes the Apps list rows and the details dialog above)

- **One card for every app**, whatever its state: icon tile, name, "By Frrata", the job in one line, a footer with the
  price or "Included" and one state chip (On · Coming next · a lock with the plan). No ratings or install counts.
- **Your apps first** (compact cards: state "Working" or a meter at 80%, Open), then the gallery grouped by the
  merchant's job: Talk to shoppers · Get paid and ship · Sell more · Run the books. Search and filters with counts.
- **At most one featured card**, chosen from the shop's own numbers (the pricing ladder's nudge), dismissible, staying
  dismissed. Never a pop-up, timer or animated upgrade button; no promised outcome. As built (A2): owners and admins
  only, never a support visit; it names the shop's own invoice ("On Growth your 1 Dec invoice would have been ₹X
  less"), both totals and "both + 18% GST", one link (See <plan>) and Not now; hidden until the browser has read the
  dismissal (no flash); `FeaturedCard` in `src/components/modules/`, the words rendered on the server.
- **An app's page, not a dialog**: a benefit headline, ≤ 3 features each with a drawn 16:10 picture of the app working
  (console tokens, no real shopper), ≤ 3 questions; a side column with the price box (GST, trial, first charge date),
  Works with, What it uses, Billed by others. On a phone the price and button sit in a bar at the bottom.
- **One button that matches the state**: Turn on · Start free trial (an add-on never tried, A3) · Ask Frrata to add (tried
  before) · See Growth with the
  shop's own rupees · Open · Tell me when it's ready. A higher-plan app is shown locked, never a button that fails.
  An app that needs another one off offers "Turn on <that app> first" (a link to its page); one that is on while what
  it needs is off says "Waiting for <that app>" in warn and stays in Your apps.
- **Once on, one home for every app** (A2, `AppHome`): ONE state chip ("Working", `homeState()`, the same one Your apps
  shows) and the app's own condition as a second badge (Not live yet, Connected, Needs attention, Ready); tabs
  Overview · the app's own · Usage and billing (`AppFacts`, the app page's side column without its button; never for
  the accountant); ≤ 4 numbers; a meter only once an app has an allowance; **Turn off <app> alone at the foot**, no
  explanation on the page (Rule 0) — what it does is listed in the confirm (`OFF` in `src/domains/modules/showcase.ts`).
  Owners and admins only, never a support visit (`mayTurnOff`, the same rule as `setModuleAction`).
- **Add-on trials (A3, 2026-11-12)**: the confirm lists, as bullets, "Free until <date>", the monthly price + 18% GST
  with the GST-inclusive figure and on which invoice the first part-month comes, and "End the trial before <date> and
  nothing is charged" (CCPA 2023: no drip pricing, no subscription trap). In a trial the state chip is "Trial · N days
  left" (IST days), Usage and billing says "Then ₹X/month + GST from <date>", and the foot shows **End trial** in place of
  Turn off; a paid add-on's Turn off confirm says billing stops at the month's end. No retention screen anywhere.
- **Delivery Zones** (approved mockup https://claude.ai/artifact/67kHoVDaRX5AFS5vWcWAgR): tabs Zones · PIN code rules ·
  Delivery dates · Usage and billing. Zones is a DataTable (rows on a phone: name + charge, then days · pay on delivery),
  ↑ ↓ to reorder (in place of drag: keyboard first), Edit in a dialog. Rules: search, Import CSV (preview of counts and
  line errors), Export, Add a rule; Settings' no-COD list shows dimmed "From Settings". Dates: dispatch, ship-day
  toggles, holidays, and "Ordered now" with each zone's LATEST day.

## Console › Content (owner-approved final mockup 2026-11-15, https://claude.ai/artifact/6WemLUPWd2z9rPXsVRzTv4; V1)

- **What the store says, saved live**: tabs Announcement · Menus · Pages · FAQ · Contact line (`ViewTabs`, one row that
  scrolls on a phone); "View store" the header's action. Placements (V2) and Season (V1.5) join as tabs when they exist.
- **A dated entry's state is a chip, never a sentence**: Live now · Starts 1 Dec, 10:00 am · Shows after the offer ·
  Shows after the newer bar · Ended · Ended early, from `barChip` on the server's `now`. A live offer heads the bars,
  read-only, with Open Offers.
- **Add and Edit open a dialog** (a sheet on a phone); a mistake stays at its field ("End is before the start. Pick a later
  end."); a refusal is in the dialog. Cancel names the safe outcome ("Keep as it is", "Don't add").
- **Menus save with one explicit Save per menu** (shoppers see it at once), an unsaved bar with "Discard change" and
  "Save main menu"; moves are Up, Down, "Move under Kurtas", "Move out of Kurtas". Bars, questions, pages and the Contact
  line save from their dialog or field.
- **Every save is a toast with Undo** (the saver's own, a minute); End now and Delete too. A stale save is an error toast
  naming who saved, as a role ("The owner changed this today, 10:42 pm. Reload to see it.").
- **Read only says who can**, as a chip: "Only the owner, a Manager or the partner can edit" (staff, accountants; the partner named only where the store has one); a support visit
  sees "Support visit · read only". Edit is disabled, never hidden.
- **What comes from Settings is read-only here** with "From Settings" and Change in Settings (an FAQ answer, the Contact
  page's details).
- **The Look links, never edits**: where Menus, the bar, the Contact line and a page were, one row "Edit in Content ›".

## Settings choices and GST (built 2026-11-09; mockups https://claude.ai/artifact/M4VfNAgqFHYmhCxFwZmepE, https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs)
- **Which control:** one of 2–4 exclusive choices that change what else is asked → **radio cards** (`kind: 'radio'`,
  each with a short note: Registration). A short scale or cadence → a **segmented** control (`kind: 'segmented'`:
  turnover, filing, a unit, months). On/off → a **switch**. A field that only applies to one choice is hidden until it
  does (`showIf`), never shown disabled; a switch that can't apply (B2B at ₹5 crore and above) is shown locked with the
  reason.
- **Segmented, in code:** `role="radiogroup"` of `role="radio"` buttons, `aria-checked`, `min-h-9`, the picked one
  `bg-card shadow-sm` on a `bg-muted` track (tax-panel, label-panel, settings-form).
- **Tax on a product:** the HSN combobox shows the code, its words and its rate chip; the rate at this price is shown,
  never explained; the inclusive-price gap is the one warning, with the price that fits as a button.
- **Console › GST:** period stepper (‹ label ›), three steps (Fix · Check the tables · Send to your CA), five KPI tiles,
  the Fix list with a count badge and one action each, the tables as tabs, the CA files as download rows. Filing (when
  on): username → OTP → Connect; Push; Frrata vs GST portal totals with ✓ / ≠; a tick that says a filed return can't be
  changed (an irreversible consequence: Rule 0 allows it), then the EVC OTP.
- **The pack (beauty, wellness):** "On the pack" section — net quantity with a unit segment, best before in months,
  "Made or packed by" with a one-tap "We pack it"; the product page lists the declarations in the Details table.

## Shipping (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-ship.md`, mockup https://claude.ai/artifact/VfTnw5iJAT3JY7AAjteNC5)

53. **The queue by next step:** Couldn't deliver (first, in danger, when it has any) · To confirm · To pack · To ship ·
    On the way · Coming back. Each tab is a state the order already has; never a stored status.
54. **One button that changes with the step** on a packed order: "Ship ₹62 via Delhivery Surface" → "Print label";
    the courier is pre-chosen, cheapest and fastest one tap away. Staff see the courier and days, never a rupee.
55. **Lists never call the courier:** prices appear when Ship opens on one order.
56. **Shipping it yourself is a peer path,** not a fallback: Mark shipped (courier and tracking number optional), then
    Delivered or Came back, one tap each, with Undo until anything later happens.
57. **A failed delivery is today's work:** the courier's reason, the attempt, the shopper's phone (Call), and one
    action; a re-attempt needs one fix (a date, a phone, or the address with a warning when it lacks a house number).
58. **The shopper's tracking** is on the shop's own order page: the expected date first, then a four-step progress
    (Packed · Shipped · Out for delivery · Delivered), the courier and tracking number, the latest scans, the pieces,
    the way back to the shop. Never a cost.
59. **Settings › Shipping costs** (`seesCosts`: owners and admins; a partner before handover, who may set them too): a delivery, a return, a COD fee, in whole rupees, with
    what a 0.5 kg parcel usually costs offered until confirmed; saving IS confirming ("Confirmed on 8 Nov 2026").
    Until then Settings says "Needs you" and profit on orders shipped another way says "Before shipping costs".
60. **An outcome's Undo outlives the row it was on:** the toast stays when the order leaves its tab or panel. Undo
    closes at the end of the IST month the outcome was marked in; Shipped also once it has been 30 days on its way
    (it counts as delivered then).

## Analytics (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-analytics-a1.md`, mockup https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt; A·1 built)

61. **One question first:** "Where did this period's orders come from, and what did each keep after returns?" The
    period is the kit's picker (Today · 7 days · 30 days · This month · Custom up to 92 days; Neel N1b, owner 2026-11-15:
    the 90-day preset became Custom), always read against the same span just before it, at the same moment when it runs
    to now ("vs yesterday at this time"), and the header names both.
62. **Pending is never zero and never a return.** Orders not sent yet or on the way are counted as such; a share of
    returns names its denominator ("6% of 54 with an outcome"), and an order joins it only once it has an outcome.
63. **Under 30, counts:** below `JUDGE_MIN` a share is "3 of 12" and a per-order ₹ says "too few to judge"; under 30
    orders on the whole page, one line says so ("Too few to judge: N orders so far") above the figures, which stay, each
    in counts (Neel N1b: the figures are the page's frame; hiding them hid Sales too).
64. **"Source known for N%"** sits beside "Where orders came from"'s heading (Neel N1b); under half, one info line points
    to Make a link. A source is what the link said: the (i) on "Where orders came from" says how it is decided, once.
65. **₹ kept only where `seesCosts`:** staff (and a partner after handover) see the same page with orders leading and
    no ₹ kept anywhere (column, headline, caption); sales and order totals stay, as on Orders.
66. **Make a link** is the page's one primary action: where it will be shared (lowercase presets; "A creator" goes to
    Offers), which page opens, an optional name; out comes the link, Copy, and "Orders from it show as …". A shop not
    open yet says so instead. A source's own page lists its campaigns and its latest 50 orders, each opening the order;
    the order page says "Came from: <source> · <campaign>" as text, never a link.

## Shop addresses (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-shop-addresses.md`, mockup https://claude.ai/artifact/BStSSZeC35kgWfxQQ6VWNz)

67. **An address is mono, whole and copyable** (`kesar-studio.frrata.shop`), with Copy and Open beside it; a merchant
    types only the name part, the domain shown as a fixed suffix.
68. **A domain's state is a badge in words** (Main · Connected · Waiting for records · Securing · Not working ·
    Disconnected), never a colour or icon alone; a failing record says only the fix ("Points to … · use …").
69. **DNS records are a table to copy** (Type · Name · Value · State, Copy per row), values read from the provider at
    the time, never hard-coded; one **Check records** button with "Checked N min ago".
70. **No explanations on these screens** (Rule 0; the owner's note at approval): what stays visible is the address, the state, an
    error, a limit ("2 changes left"), and one risk line where an action can't be undone ("Bags in progress start
    empty."). Anything else is an (i) tip or not said.
71. **Trust and safety actions** (Admin) name the shop on the button and require a reason the shop will read; the shop
    sees the reason and a **Reply**, never who reported it.

**Own domains v2** (owner-approved 2026-11-09, mockup https://claude.ai/artifact/XrDQj61tSBe4YKvUrH76xt; replaces the
8 Nov mockup's § 5–7):

72. **One address list, titled "Custom domain"** (owner 2026-11-09) on Settings › Web address: every address a row (mono, its state chip, actions beside it);
    the main one carries a `Main` chip; rows change in place and never animate (rule 28).
73. **Connect is a `Dialog`** (a sheet on a phone, rule 27) of three steps (Domain · Records · Securing) with step dots
    and the step slide; the domain is cleaned as typed (`https://www.KesarStudio.in/` → `kesarstudio.in`, www added),
    the DNS host is read, never asked, and opens with **Open <provider> DNS**.
74. **The dialog checks for itself** every 15 s while open: each record's chip crossfades to Found, "N of 3 found", then
    Securing (a scaleX bar) and Connected (the tick drawn once) with no press; **Check now** stays. Records:
    Copy per row, Copy all, **Send on WhatsApp** (the records written out).
75. **Make main is gated and works like Publish**: the row keeps "Razorpay approved it" (never the dialog: Razorpay's
    review takes 24–48 h) and Make main appears once it is ticked (Razorpay fails live payments from an unregistered
    website); a one-line confirm ("Bags in progress start empty."), the 1.3 s rani
    Going-live line, then a popup with Copy, View your shop and Undo for 8 s.
76. **A problem lives on its row** as a chip and one line with the fix; the red banner on every console page only
    after 24 h of failures; our own failure reads `Checking paused`, never red.

## Plan and billing (billing rework R1, owner-approved 2026-11-15; spec `docs/specs/2026-11-15-billing-rework.md`, mockup https://claude.ai/artifact/Tp6T3A68mzNrYzVP8NhsxD)

- **Tabs in the address** (`?tab=`): Overview, Charges, Plans, Invoices, Payment, Details; the Settings group's tabs stay
  above them. Each tab loads only its own reads.
- **A summary reconciles.** Every bill shows rows that add up to its total (plan, apps, fee on delivered orders,
  credits, carry, before GST, the GST heads, total), and each row drills down to its orders or its plan lines.
- **Money a merchant compares is worked out by one rule** (`src/domains/billing/charges.ts`): a plan's cost at a sales
  figure, cost as a share of delivered sales, delivered sales less credited bases. "Orders included" never shows to a
  merchant (owner, 2026-11-15); Admin keeps it.
- **A row of link choices** (a bill, a view, a filter) is `BillPicks` (`settings/billing/_components/pills.tsx`): 44 px
  on a phone, the picked one in the selection colours. A comparison table keeps its columns and scrolls on a phone.

## Neel analytics (N1b, 2026-11-15; plan `docs/plans/2026-11-15-neel-n1b-analytics.md`, screen mockup
`docs/mockups/2026-11-15-analytics-n1b/`)

- **One period picker per page** (`PeriodPicker`, `src/components/charts/`), top right of the header: the presets as
  links, Custom as a dialog of two days; what every figure is against said beside it in words ("vs previous 30 days").
- **A figure answers "is this good?"** (`Figure`): its change in words from `kit.ts change`, coloured by MEANING (returns
  up is red, "↑ 2.1 points — worse"), what it is against once per row, a sparkline; too little says how much is needed.
- **Every chart has its numbers in words or a table**: the trend's sentence and hidden table (and ← → on it), the
  heat's busiest cell in words, the state tiles' "See as a table", the cohort's table. Colour never alone.
- **One colour per chart**, light to dark (`--heat-*`; `--risk-*` where darker is worse), levels from `kit.ts levels`;
  a month that has not come yet is empty ("not yet"), never 0. Shares as a bar beside the number (`ShareBar`).
- **No chart library**: SVG drawn by hand; a client chart takes plain numbers and a unit, never a function.

## Neel finding (N1c, 2026-11-13; plan `docs/plans/2026-11-13-neel-n1c.md`)

- **Filters are chips that read back** ("Payment is COD", "Total ₹500–₹2,000"): `FilterBar` (`src/components/data/`),
  × is a link to the list without it, "Clear all" when there is something to clear, "9 of 300 orders" at the right.
  Everything lives in the address in ONE canonical form (`filterQuery`), so Back works, a link shares and a view saves it.
- **"+ Filter"**: fields on the left, a field's values on the right with how many each has (inside the tab and the
  other filters; no counts when they could not be read in time), ranges for money and dates, and the button counts
  what applying shows ("Show 25 orders") before the person looks. On a phone the same panel is a sheet ("Filters").
- **Saved views** are the team's, after the queue's own tabs, with their counts (streamed: the page never waits on
  them); "+ Save view" when filters are on and match no view; a view's ⋯ menu renames it and removes it with Undo. A view
  never holds a search.
- **Search answers as you type**: 150 ms after the last key (Orders through its rows route; a small list may render its
  page per search, 250 ms: `LiveSearchField`), the one in flight aborted, `?q=` written with replaceState, Enter and
  Back render the page. The match is marked (`<Marked>`, from `highlight()`: text parts, never HTML, never a RegExp
  from what was typed); a phone or AWB match shows under the name. Nothing found: "No order matches “9845”" and what it
  searched. Letters with digits (8+) search tracking numbers; digits search numbers and phones, and 8+ of them tracking numbers too; words search names.
- **Quick look** (`QuickLook`): 400 px from the right over the list, not modal; Space on a focused row or the row's eye
  button; ↑ ↓ move it, Esc gives the row its focus back, "Open order" goes to the page; words only, never a cost;
  desktop only (a phone opens the page).
- **Phone order rows**: line 1 "KS-5006 · Sneha" with ₹ at the right, line 2 the place and the status chip; the
  customer cell lends its parts to the row's grid (`neel.css`), so the name is in the DOM once.

## Brand, Website and publishing on a code-site store (owner-approved mockups 2026-11-16: `docs/mockups/2026-11-16-p1-brand.html`, `docs/mockups/2026-11-16-website-one-address.html`, `docs/mockups/2026-11-16-v2b-publishing.html`)

- **Brand** takes Look's place in the console menu (Store group) for a code-site store; a theme shop keeps Look and never
  sees Brand. Tabs "Logo, colours and type" · "Checkout" (§ Checkout and order pages, in the shop file). Cards Logo ·
  Colours · Type · Shape · Preview; logo slots Main logo · Mark · Stacked · On dark; eleven colour roles, each pair's
  contrast a chip, a pair under 4.5:1 refused at its field; fonts from a closed list; corners 0, 4, 8, 12, 16; spacing
  Compact · Standard · Roomy.
- **A partner's change on an open store waits for the owner:** chip "Waiting for the owner", toast "Sent to the owner.";
  the owner's Notices row ("Your partner changed your brand · 4 logo files and 2 fonts.") and a card on Brand carry
  Approve change · Decline. A Builder and a support visit see "Preview only"; Staff and Accountants don't open Brand.
- **The review card** (four-screens mockup `docs/mockups/2026-11-22-four-screens.html` § 4, owner-approved 2026-11-22):
  one card on Brand and on Brand › Checkout, "Your partner's change" with chip **Needs you** (warn), Sent, one row per
  changed part ("Left → Centred"), and Approve change · Decline (sm) for the owner and Managers; anyone else who sees
  it (a support visit; staff, on Checkout only while a change waits) reads it with chip "Waiting for the owner" and no
  buttons. The preview carries **Live | Waiting** while a change waits, for everyone incl. the partner (hidden while
  the form has unsaved edits). Phone: the card, then the switch and preview, then the editor. A stale answer comes back
  with Reload: "Your partner sent a newer change." or "Already approved by the owner, today, 10:44 am." (by a Manager,
  by you). Toasts as Brand's: "Approved. It's live." with Undo, "Declined. Nothing changed.".
- **Publishing per partner** (Settings › People, the partner's row, after handover only): Segmented "Publishes freely ·
  Ask me first", saved on the tap with an ok toast and Undo; a support visit sees it as a fact.
- **Notices type "Website"** for a publish the owner is told about after: one line per publish ("Neel Studio published
  v9 · Added Lookbook and Our weavers."), collapsed to one line an hour per partner, with **Preview** and **Undo**. Undo
  confirms once ("Undo Neel Studio's v9?" · Keep v9 · Go back to v8) and is offered until the next version goes live. A
  waiting version opens Review and publish: Publish v9 or Not now (no Decline; a newer version replaces it). A version
  that adds an outside service needs its own confirm naming the host and what it can see ("Allow and publish v10").
- **The Website card** (Settings › Store › Website): one state chip, **Live · Opening soon · Paused till <date> · Stopped
  by Frrata · No partner · Not answering**. Stopped by Frrata shows its reason in one line, written by Frrata staff, to
  the owner and the partner. Facts: Built by, Live version, Latest preview (Open preview, a new tab).
- **The Address card** holds the one address and Connect my domain. Each record's chip: **Waiting for record ·
  Securing · Connected** (never "proved" or "certified"); the `secure.` row's (i) "Holds the checkout form. Shoppers
  never see this address." The website moves only once both records are Connected and the owner taps Make main.
- **Build keys sit in the keys list** beside live and test keys: chip "Build · ends 17 Nov" (or "Build · ended"), the
  line "Made by <person>, <partner>", a name Frrata sets (Studio session, Preview v9, <person>'s computer). The owner
  or a Manager deletes one; its confirm names whose work stops ("Neel Studio's work with it stops within a minute.").
- The partner's button is **New website**, never "New site". If the website stops answering, shoppers meet "We'll be
  back soon" with Go to checkout and Your orders.
