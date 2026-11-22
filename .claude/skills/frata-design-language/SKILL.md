---
name: frata-design-language
description: Use when building or changing any Frata UI - a console page, table, filter, form, dialog, badge, empty or error state, the storefront, a theme - or when choosing a colour, font, spacing or motion, or how to show money, an order number, a date, a status or COD risk.
metadata:
  version: 10.4.0
  owner: owner
  verified: 2026-11-22
  covers: ["src/app/base.css", "src/app/globals.css", "src/app/shop.css", "src/app/site.css", "src/components/brand/site-home.tsx"]
---

# Frata design language

## Rule 0 — no explanations (owner, 2026-11-08; binding on every screen AND every mockup)

**Clients and partners already understand their work. A screen never explains anything unless it is required.**
Pages are clean, the layout tight, space used for the work, not for words.

- **Default: no helper text at all.** A screen is labels, values, controls and actions. No intro paragraphs under a
  heading, no "what happens next", no "Not asked now" asides, no "you can change this later", no reassurance ("nothing
  is charged…"), no notes repeating what a label or the layout already shows, no notes for staff on how a feature works.
- **Required, so it stays — and only as short as it can be:** an error and how to fix it; a limit a person must meet
  (a format, a range); money that will be taken, with its date (one line, at the action); legal or GST wording the law
  asks for; a consequence that cannot be undone, in the confirm dialog of that action; a risk reason.
- **Anything else optional goes in an (i) tip** (§ Labels, info tips) — and only if a real person would ask.
- **The cut before shipping** (and before publishing a mockup): read every sentence on the screen and delete it;
  restore it only if the screen is wrong or unsafe without it. A status is a chip or a value ("Trial · 12 days left"),
  never a sentence.
- **Space:** one card per job, no cards that only hold text, dense rows over stacked paragraphs, actions beside what
  they act on.

## Words (Neel N3, owner-approved 2026-11-13; mockup § Voice, § Words; supersedes the 2026-11-07 Voice rules)

A store owner reads the console on a phone, between orders: every line is clear in one read. Frrata sounds like a calm,
sharp colleague who knows the trade. `npm run check:words` holds what a script can (marked **gate**); `words-reviewer`
judges the rest.

1. **One idea, one sentence.** Aim for 12 words; the gate warns from 13 and fails at 16 (owner call 4). **gate**
2. **No joining marks.** No colon, semicolon or dash gluing two thoughts; make two sentences. A label before a value
   ("Delivery address: …", "₹85 · free above ₹1,999") is fine. **gate**
3. **Everyday words**, never ours (tenant, sync, server, token, webhook, variant, readiness). **gate**
4. **Say what to do, or what happened. Start with it.** "Add a price for Ivory." "Saved."
5. **Buttons are a verb and a thing**: "Confirm 2 orders", "Mark delivered". Never OK, Submit, Proceed. **gate**
6. **Errors: what's wrong, then the fix**, next to the field. No "invalid", "error occurred", blame. A refusal says
   what's safe: "We couldn't save that. Nothing was changed." **gate** (the banned words)
7. **Numbers, not adjectives.** ₹2,490, 8 days, 3 sizes. A moment in a list: `momentIN` (§ Numbers, dates).
8. **Confirm with the consequence only.** Title asks with the thing ("Close your store?"); buttons name both outcomes
   ("Keep it open", "Close store").
9. **Law and tax words only where the law needs them**, then an (i) says it plainly. Legal text is never rewritten:
   it goes in `scripts/check-words.allow.json` with its reason.
10. **Calm and direct.** "You" for the brand, "we" for Frrata. No please, kindly, sorry, oops, emoji or "!". **gate**
11. **Easy to translate.** No idioms or wordplay.
12. **Filler is banned** in every string on every surface (simply, easily, seamless, powerful, unlock…). **gate**
13. **Swap these** (**gate**): in order to → to · prior to → before · utilise → use · via → through · e.g. → like ·
    commence → start · successfully → (cut) · please note → (cut) · at this time → now · in case of → if.

Tone by moment: done → past tense, the thing ("Archived 2 products"); fixable → what, then how; refused → what
happened, what's safe; money → exact amount and date; risk → the reason plainly; can't undo → the consequence, once;
empty → the first step ("No products yet · Add product"); waiting → what's happening, when; celebration → once, short.

The gate's scope: the console, the partner workspace and the shared code that speaks there (`ROOTS`/`NOT` in
`scripts/check-words.mjs`). The storefront, themes and EkCode are outside it until their phases. Frrata Admin joined in
Neel N4 with every rule but the glossary below (merchant, token, API are staff words there); text inside `<code>` is code.

## Glossary (Neel § Glossary, owner 2026-11-13) — one word for each thing, on every surface

- **Surfaces:** Console (the brand's team and its partner; never "dashboard", "admin"); Partner workspace (never
  "partner console"); Frrata Admin (never "Admin" alone); the store (shoppers; never shop, website, site).
  **Website** is the one exception (owner, 2026-11-15, Storefront API mockup): the brand's own site built as code on the
  Storefront API, as in Settings › Website ("Runs on Frrata" · "Your own website"; the partner's button "New website").
  Never for the store itself. Its keys are **Live**, **Test** or **Build**, and are **deleted** (never "revoked" on
  screen). **Brand** is the console page of a code-site store's look (Look's place); Look stays for theme shops.
- **Roles:** Owner · **Manager** (was Admin; the stored value `admin` keeps its spelling) · Staff · Accountant ·
  Partner · Partner owner and Lead (the agency's) · Frrata support (on a **support visit**). "Admin" is never a person.
- **Words:** store (never shop; "Shop all", "Shop now", "Shop the look" stay as the store's verbs) · shopper (never
  customer; the invoice says buyer by law) · product in the catalogue, item in an order or bag (never piece) · sizes
  and colours (never variants) · offer · code · discount (never coupon, voucher) · payout (never settlement,
  remittance) · app (never module, add-on) · Archive (hide and keep) · Delete (gone) · Remove · Disconnect · Turn off.
- **Order states** (console · shopper sees): To confirm · Order placed; To pack · Confirmed; To ship · Packed;
  **On the way** · On its way; Delivered; Couldn't deliver · Delivery attempt failed; Coming back · Came back
  (Returning to / Returned to the store); Returned (a shopper's return); On hold; Cancelled. The action stays a verb
  ("Mark shipped"; its toast "KS-5012 is on the way."). Shopper emails use the shopper column.
- **Short forms:** COD in console tags (sentences and shoppers: "Pay on delivery"); RTO only in detail ("Coming back"
  in headings); SKU, AWB in mono with an (i); GST terms as the law writes them; M.R.P. always dotted; **PIN code**
  exactly; UPI, OTP, CSV, PDF, CA as is. Never in the UI: NDR, tenant, SKU combo, UQC (invoice only), API (except a
  provider's own label).
- A merchant's stored words never change with the glossary: the merge token `[Shop name]` still fills beside
  `[Store name]`.

## Graphic language (owner, 2026-11-07)

Pictures carry the model; words label it. One drawing rule, used everywhere a
graphic appears: the website, the partner workspace, and brand empty states in
the console (§ Brand). Haldi here is `--haldi` (the illustration token derives
from it).

- **Pictograms** (`src/components/brand/pictogram.tsx`): a 48 grid, 4 px margin,
  a **2 px ink line**, round caps and joins, paper inside, **one haldi accent
  shape**, at most one warm fill. 32, 48 or 64 px. Names: store, build,
  handover, earn, delivered, clients, owner, calendar, shield, apply. A new one
  follows the same rule and joins `PICTOGRAMS`.
- **A pictogram always sits on its tile** (`PictoTile`: 64 px, radius 12,
  fill / haldi-soft / indigo-soft). Never loose, never coloured another way.
- **Spot illustrations** (`src/components/brand/illustrations.tsx`) are built
  from pictograms on a haldi-soft field, flat, no perspective, no faces, no
  stock art. One per page at most (the hero).
- **Tokens**: `--illo-line`, `--illo-paper`, `--illo-fill`, `--illo-haldi`,
  `--illo-haldi-soft`, `--illo-indigo-soft` (base.css, both themes). Never
  rani (rule 6), never on a control, never the only sign of anything:
  every graphic is `aria-hidden` beside words that say the same.
- **UI icons are frrata's own** (§ UX foundation rule 20, § Brand rule 36). Pictograms are not icons.
- **Rule 20's "no illustrations in empty states" is superseded for the website
  and the partner workspace only** (owner, 2026-11-07): an empty state there may
  lead with one `PictoTile`. The console may too, in a brand empty state
  (§ Brand rule 39, owner 2026-11-07).
- A page that sells (the website, /partners) leads with the illustration and a
  numbers strip; steps are pictogram + 1–3 words + one short line; rules and
  details are pictogram + a title + an (i) tip.

## Tokens (`src/app/base.css` — shared by the app sheet `globals.css` and the shop sheet `shop.css` since Signal S2-0; the only hex; images drawn outside CSS — PDFs, share cards — keep their palette in one allowed file each; `check:hex`)

- `--primary` (ink) is interaction: buttons, focus. `--brand` is **rani**
  (#D61F69, the frrata mark; brand spec 2026-11-07): never a button fill, a
  number or a status. Rani as words is `--brand-text` only; on an ink surface,
  `--brand-on-ink`. `--thread` is the 2 px line (§ Brand rules 33–40).
  The website in Rani Mela is the one exception: its `--site-*` tokens (in `src/app/site.css`) make rani the action colour there
  (reference/brand-and-public.md rules 45–51, owner 2026-11-22).
  `--haldi` and `--neel` are for brand surfaces only (sign-in, the website,
  drawings); the illustration haldi derives from `--haldi`.
- `--accent`, `--muted`, `--secondary` are neutral hover surfaces.
- Status pairs, background then text, all ≥ 4.5:1: `ok`, `warn`, `danger`,
  `info`, `neutral` → `bg-ok text-ok-text` …
- **NEEL (owner, 2026-11-13; Neel N0): the console, Frrata Admin, the partner workspace and the look editor carry
  `data-neel`** and draw from `src/app/neel.css` (globals.css only, never a store): warm grey, neel 600 the one action
  colour (`--primary`), focus neel 500, rani for the mark and the loading line only. Outside `[data-neel]` (the store,
  the website, sign-in) every token is as before; the store preview inside resets to them. Mockup:
  `docs/mockups/2026-11-13-design-language-neel.html`; plan `docs/plans/2026-11-13-neel-n0.md`.
- **Depth by role in Neel:** e1 rests (secondary button, segment), e2 floats (menu, popover), e3 overlays (dialog,
  toast, save bar) — `shadow-sm` / `shadow-md` / `shadow-lg`. Outside Neel, borders, not shadows.
- **Radius by role in Neel:** 4 checkbox and kbd (`rounded-xs`) · 6 chip and tag (`rounded-sm`) · 8 button and field
  (`rounded-md`) · 10 toast, banner, segmented (`rounded-mid`) · 12 card and menu (`rounded-lg`) · 16 dialog
  (`rounded-xl`). Hand-written CSS reads `--r-*`, never `--radius-*`.
- Inter for everything in Neel, numbers included (`font-num`: tabular). Mono only for codes: SKU, AWB, GSTIN, a code,
  a domain being copied. Weights 400, 500, 600 (no `font-bold` in Neel).
- Neel-only colours (`bg-select`, `text-link`, `bg-sunk`, `bg-side`, `border-edge`, `bg-off`, `bg-chart` …) fall back
  outside the scope to what the place used before (base.css @theme), so a shared primitive renders as before there.
- Motion: `duration-fast|base|slow` + `ease-standard|entrance|exit`. Never
  `duration-[…]`. Reduced motion is honoured globally. Lists never animate;
  they dim while loading.

## Type scale

Neel: display `text-display` 30/36 · page title `text-title` 22/28 semibold · card (every `Section` title)
`text-section` 16/24 semibold · body `text-sm` 14/20 · label `text-label` 13/18 medium · small `text-small` 12/16 · key
`text-kbd` 11 px Inter. Outside Neel `text-section` keeps 15 px (tokens `--t-*`). The roles are registered with
tailwind-merge in `cn()` (`src/lib/utils.ts`): add a new size role there too, or `cn` drops it beside a colour.
No other size: `check:scale` fails `text-[Npx]` in app code.

## Numbers, dates, people

- Every ₹, order number and count in a column: `<Money paise>` / `<Numeric>`
  (`font-num`: Inter with tabular figures in Neel, mono outside it), right-aligned. A loss renders in `text-danger-text` with a
  real minus (−₹430).
- Dates only through `src/lib/format-date.ts` (`dayIN`, `dateTimeIN`,
  `sinceIN`, `momentIN`) — always IST (`check:dates`). A moment in a live list or page: `momentIN(at, now)` → "Today,
  10:06 pm", "Yesterday, 1:36 am", "13 Nov, 10:06 pm" (the year only when not this year; IST calendar days), in
  `<time dateTime>`. Print, PDF, CSV and emails keep `dateTimeIN`; a wait or an edit time keeps `sinceIN`. Months are three letters
  everywhere ("13 Sep", never en-IN's "Sept"; owner, 2026-11-15): every format-date helper does it, never a page.
- Phones `formatPhone` → "+91 98450 12345".

## Console patterns

- **Shell**: navigation grouped by job (`AppShell`, § UX foundation); a row is
  added when its page exists, never "coming soon". Phone: bottom bar + More;
  ≥ 768px: sidebar. Waiting counts as a warn pill.
- **Page header**: `PageHeader`: way back, title + badges, a meta line, at most one primary action (+ More). Details in § UX foundation rule 13.
- **Lists**: `DataTable` shares chrome, not columns. Default view is a WORK
  QUEUE (to confirm, delivery failed), not history. Filters live in the URL,
  the server filters; 50 rows a page, numbered, never infinite scroll.
  View tabs (`ViewTabs`) show an exception tab (couldn't deliver, coming back) only while it holds orders; on a phone
  they may scroll sideways inside the page gutter (`scroll`, 2026-11-12) — tabs over a list, not navigation, so
  UX rule 10's "never a sideways strip" (the bottom bar) doesn't apply.
- **Order row**: number (mono link) · placed · payment badge · status badge ·
  value · COD risk badge (Medium/High in words, never a bare score; Low shows
  nothing). Profit per order waits for Phase 3, and staff never see cost.
- **Detail**: breadcrumb, record header with number and badges, main column +
  side column of facts; cards read first, edited in place.
- **Status** is always a `Badge` with words, never a dot alone.
- **Dialogs**: the caller writes the sentences; cancel names the safe outcome
  ("Keep the order").
- **States**: every screen designs empty, loading, error, one, many, no
  permission, phone. Use `Panel` for non-data states: a title that says what is
  true, one sentence why, one way on. Error copy: "We could not load this
  screen · Nothing was changed · Try again" (`error.tsx` per surface, `check:states`).
- No `loading.tsx` in the console (Ekatan: it made search-param navigation commit
  nothing in production); use a top progress bar.
- **A server-action form's submit is `<Submit>`** (`src/components/ui/submit.tsx`, 2026-11-11): while the action runs
  it refuses clicks (aria-disabled, keeping focus) and runs the top bar; the label stays, naming the outcome. A GET
  form (search, a month picker) keeps `Button`. A refusal or a form that doesn't parse says so on the page, never a
  silent redirect to a list.

## Feedback: toasts, popups, field errors (owner-approved 2026-11-12; spec `docs/specs/2026-11-12-feedback.md`, mockup https://claude.ai/artifact/J74M3yUytfbgkMh4UNQbcp) — the default on every surface

1. **A failure after a button is an error toast** (`toast.error(text, { sub?, action? })`, `src/components/ui/toast.tsx`):
   save refused, a conflict ("Already confirmed by Riya at 10:42" + Reload), no connection, a server refusal, Admin's
   result. Ink toast, red mark, one line (+ one short second line), ONE action (Try again / Reload / Show) and ×.
   **It never leaves by itself** (WCAG 2.2.1), `role="alert"`, Esc or × closes it. Never a red line at the top of a
   page, never a `?error=` paragraph.
2. **Success is a toast of kind ok** (green check), 8 s, paused on hover/focus, Undo where reversible (§ Work queues 4).
   No role of its own: spoken through the one polite region (the shell's, or the Toaster's where there is no shell).
3. **Field mistakes stay at the field** (`<FieldError>` + `useFieldErrors`, or `<ActionForm>` + `<FieldMessage>`):
   red edge, one short line with the mark, checked on submit (on blur where a form already does), cleared the moment the field is fixed, nothing typed is ever cleared. On submit,
   focus goes to the first wrong field and ONE error toast says "2 fields need fixing" with **Show**; it counts down
   as they are fixed and leaves at zero. The toast never takes focus and is not an alert (said once, politely); inside
   a Dialog there is no toast (the page behind is inert): the marks and the focus say it.
4. **Popups confirm what loses work, money or stock** (`Dialog`, the phone sheet), with a pictogram from § Graphic
   language. A failure inside a popup is shown in that popup (`Dialog`'s error slot), never a second popup or a toast
   behind it. No other kind of popup for errors.
5. **Stays where it is** (pinned by its own rule): "Pick a size.", a code that doesn't apply, a failed payment's filled
   form and its line above Pay, "Price updated to ₹…", a domain's row problem, "Couldn't count" / "Risk unavailable",
   autosave's "Not saved", Publish's blocking list, `Panel` states, the support-mode and billing banners.
6. **One toast at a time** (a new one replaces the last), bottom centre, clear of a phone's pay or save bar and never
   over the focused control (WCAG 2.4.11). The shop's toast wears the shop's colours.
7. **Motion**: toast in 200 ms (`ease-entrance`, 12 px up), out 200 ms (`ease-exit`); its mark pops once on
   `--ease-snap` (scale .5 → 1); a field's line drops in 4 px over 200 ms; dialogs as § UX foundation 23/25a. **No
   shake.** Reduced motion: a 120 ms fade, nothing travels.
8. **The shop's toast** (`src/components/storefront/store-toast.ts`, built 2026-11-12): the same `ToastApi` in the shop's
   colours, in three parts to fit the shop's script budgets — a server-rendered box and polite region in `ShopShell`
   (the real shop only, never the console's preview), a tiny store the islands call (`useStoreToast()`), and the view,
   loaded lazily into the box. An ok toast leaves after 5 s (no Undo, nothing to pause for); an error stays. If the
   view cannot load, the words show plainly in the box. A state the shopper cannot act on without it (no price at all,
   a failed payment, a changed price) stays on the page, never only in a toast.
9. **By default**: every surface mounts ONE `<Toaster>` in its layout (the shop: its box); `check:feedback` refuses a hand-written error
   line (`role="alert"` paragraph, `text-danger-text` sentence, `?error=` read) outside the primitives and the rule-5
   allow-list.

## Labels, info tips and help text (owner, 2026-11-07 — overrides any earlier "say it under the field")

The owner's rule: **explanation and detail go in an (i) info tip, never as text
under every field. Cleaner screens.** Research (dated): NN/g "Why So Many Info
Tips Are Bad" 2026-01-23; Polaris and Atlassian tooltip guidance (undated, live);
Carbon toggletip 2026-09-30; WCAG 2.2 SC 1.4.13 (updated 2026-07-12); DWP hint
text 2026-07-15.

1. **Labels first.** Fix the label or the layout before adding anything. A screen
   needing more than 2–3 tips has unclear labels.
2. **(i) for optional detail only:** a definition, why we ask, what happens
   later, an example. One or two sentences, ≤ 288 px wide, at most one link.
3. **Never in a tip:** errors and validation, a required format or limit the
   person must meet, money or anything that cannot be undone, legal or GST
   wording, a risk reason. These stay visible — as the error, or one short line
   only where the action needs it (the button's own confirm, a dialog).
4. **Click or tap to open, not hover** (phones have no hover): `InfoTip`
   (`src/components/ui/info-tip.tsx`) — a button named "About <field>",
   `aria-expanded`, the popover right after it, Esc / outside click / second tap
   closes, focus stays on the button; a 24 px target around the 14 px mark (§ UX
   foundation rule 19). The popover is a `span`: a tip sits inside labels and
   paragraphs, where a `div` ends the paragraph and breaks hydration.
5. Hover/focus tooltips (`role="tooltip"`) only name icon-only buttons and show
   truncated text in full — never on a field, never with links.
6. Never the `title` attribute for anything a person needs.

## Neel primitives (N0, 2026-11-13)

The gallery `/console/fixtures/neel` (test-only) shows each in its states; `e2e/flows/81-neel.mjs` holds the drawn
values, keyboard and axe at phone and desktop. A new primitive or state joins the gallery and the flow.

- **Button** (`ui/button.tsx`): primary, secondary (edge + e1), ghost (text 2), destructive; `default` 44/36, `sm` 30,
  `lg`. `busy` keeps the label, adds `Spinner`, and is `aria-disabled` (focus stays). No thread in Neel.
- **Badge** is a status (a pill, a 6 px dot, a word); **Tag** is a fact (outlined, text 2). Never a dot alone.
- **ViewTabs**: underline tabs, count pills, one row that scrolls — never a second row.
- **Switch** 34×20; **Segmented** (`ui/segmented.tsx`) for two to four short words, arrows move the choice; more is a
  Select. **Checkbox and radio** are native inputs painted in neel.css: 16 px in a 24 px target.
- **SaveBar** says "N unsaved changes" when given `count`; **Toast** actions in `--bar-link`.
- **Panels** (Studio workbench WB·2, mockup 2026-11-22 screen 1): `PanelRail` (`ui/panel-rail.tsx`) is a side panel
  folded to a 44 px column of icon buttons on `--side`; a dot marks what needs the person, its words in the button's name
  ("Show chat. 1 new"); a panel never opens by itself. `ResizeEdge` (`ui/resize-edge.tsx`) is a window splitter on the
  panel's inner edge: its value the width, ← → 16 px (Shift 64), Home and End its limits, a drag; a 2 px neel line on
  hover and focus. `ICON_BUTTON`: 32 px from 768, 44 on a phone. `Tabs variant="line"`: underline tabs over a panel.
- **Dialog**: 16 px, e3, its body `[data-dialog-body]` 18 in; a sheet on a phone. **Menu**: 12 px, e2, 220 wide.
- **DataTable**: 36 px sunk header, 48 px rows from md (a phone reflows), `selected` rows in neel 50.
- **Section**: 12 px, 20 in (16 on a phone). **Fields**: `FIELD` / `FIELD_BOX`; a mistake is `fieldProps` +
  `FieldError` (13/18), its edge and halo drawn by neel.css.
- **Never inside the store preview:** every Neel rule skips `[data-store-theme] *`, and the Neel-only tokens are unset there.

## Neel layout (N1, 2026-11-13)

- **The shell**: rule 9 above; `src/components/shell/{app-shell,nav,rail,rail-toggle}.tsx`, the rail's CSS at the end of
  `src/app/neel.css` (two blocks, one list of rules: change both). Page padding 28 · 32 at 1280, 24 from 768, 16 on a
  phone; body 15/22 and titles 20/26 on a phone in `[data-neel]`.
- **The header**: rule 13 above; one `PageHeader` for every page in Console, Admin and the partner workspace.
- **Lists**: rows 48 px (56 with a photo: `DataTableRow tall`), the picked rows in neel 50 and `BulkBar`; Orders shows
  Payment as a Tag and Status (with risk) as chips, one status cell that reflows on a phone.
- **Settings, in five groups** (owner, 2026-11-15; mockup https://claude.ai/artifact/GGkvYuwqxL7YEoXxAjbYLD,
  `src/domains/settings/groups.ts` is the one list): Store, Checkout, Business and tax, Messages, Team and plan. Pick a
  group, its pages appear: on a wide screen the groups at the left (each with its one line and a count of what to fix),
  the picked group's pages at the right (name, current value, chevron); on a phone the groups first, then the group's
  pages with "‹ Settings". The group is in the address (`?group=`). A settings page opens "Settings › <group>", its title,
  then its group's other pages as tabs (`SettingsHead`). A field lives where a merchant looks for it (the legal name
  beside the GSTIN, order and invoice numbering together); a moved page keeps its old address as a redirect (`movedTo`).
  "Ready for live payments" stays a chip in the header, what is missing a warn banner above the groups.
- **A settings form** (Neel N2b·3): one card per block; a page of one block hides its block title (screen readers keep
  it); switch rows carry their line under the label; short fields side by side (three across when there are three);
  wide fields and groups of a kind under a hairline; no intro paragraph under the title (Rule 0); a list of codes is
  chips (`ChipInput`), never a text box; the save bar at the foot with its count and Ctrl/⌘+S; a side card says what a
  shopper meets (Pay on delivery: "At checkout", from checkout's own rule and words).
- **What only the owner or a Manager changes now** (PP1, owner-approved mockup 2026-11-16,
  `docs/mockups/2026-11-16-pp1-owner-only.html`): locked values read as `Facts` (label in text 2, its (i) kept; a radio
  card as its choice with the card's note under it, a switch On or Off), never disabled inputs. Content's chip "Only the
  owner or a Manager can edit" sits beside the page's title (a page locked whole) or the block's title (a block), and
  **Ask the owner** (secondary) is the header's one action or sits in that block's header; a page in part locked by
  fields puts the chip beside each value. No save bar on a page locked whole, no editing links. After asking: an ok
  toast "Asked the owner." and the button Off with Button's `reason` "Asked today" for the rest of the India day. A save
  refused because the store was handed over meanwhile is an error toast in those words with "Nothing was changed." and
  Reload. A support visit sees the same facts with no Ask the owner.
- **Not yet**: ⌘K (N1b).

## Reference files — open the one for the surface you are building

The rules above bind every screen. Each surface's approved rules are in one file below, moved there unchanged
(practices plan G4, 2026-11-16); a section named "§ <name>" elsewhere is in SKILL.md or in the file listed here.

| Open | When you build | Sections |
|---|---|---|
| [reference/states.md](reference/states.md) | any screen: its seven states and the primitive for each | Empty, loading, error, one, many, no permission, phone |
| [reference/ux-foundation.md](reference/ux-foundation.md) | any Console, Admin or partner screen: the shell, page layout, controls, **Motion** (rules 22–29, reduced motion, the phone sheet), accessibility, phone widths | UX foundation |
| [reference/console-catalogue.md](reference/console-catalogue.md) | a product, collection, import, order edit or offer screen, or the Phase 1 console rules | Phase 1, Product page, Products rework, Import and order edit, Offers |
| [reference/console-operations.md](reference/console-operations.md) | the orders queue and records, Apps, Content, Settings and GST, Shipping, Analytics, shop addresses, Plan and billing, Neel analytics and finding, a code-site store's Brand, Website card, build keys and publishing Notices | Work queues, Apps, Apps gallery, Console › Content, Settings choices, Shipping, Analytics, Shop addresses, Plan and billing, Neel analytics, Neel finding, Brand, Website and publishing |
| [reference/shop.md](reference/shop.md) | anything a shopper sees: the storefront, live themes (retiring, ADR-0014), Theme Studio and Signal, checkout and order pages on a code-site store, EkCode, share cards | Storefront as built, Storefront, Shop themes, Theme Studio, Theme Signal, Checkout and order pages, EkCode, Share cards |
| [reference/admin-and-partner.md](reference/admin-and-partner.md) | a Frrata Admin screen or the partner workspace | Frrata Admin, Frata Admin, Partner workspace |
| [reference/brand-and-public.md](reference/brand-and-public.md) | the Frrata brand (logo, voice of the marketing site) or the public pages (home, pricing, sign-up) | Brand, The public pages, Rani Mela (the website's look since 2026-11-22) |
