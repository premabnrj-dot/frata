# Neel N3 — Words: the `check:words` gate and the console copy sweep
Status: built, awaiting the owner's ship call (step 6 done 2026-11-15 after N1b reached main; reviews folded: architecture, words, impact, security, design-system, mockup-parity) · Date: 2026-11-15 · Branch: `claude/neel-n3-words`
Spec: `docs/specs/2026-11-13-design-language-neel.md` (§ v4 voice, owner calls 1–4, § Phases · N3) · Mockup:
`docs/mockups/2026-11-13-design-language-neel.html` (§ Voice, § Words, § Glossary; § Screens: Orders, Settings) ·
Approved: owner, 2026-11-13 (the mockup; the calls "Manager", "store", "On the way", "warn from 13, fail at 16")

## Goal
The console speaks the way the drawn screens do: a store owner on a phone, between orders, reads each line once.
Ranked problems 3 (catalogue operations) and 1 (COD/RTO): the screens that act on orders and products are the ones
read most, and a line read twice is a confirm or a pack done late. Measure: `check:words` at zero failures on
the console, partner workspace and the shared code that speaks in them; warnings (13–15 words) counted and falling;
parity on Orders and Settings with every N1 words Deviation closed.

## Scope
**In:**
1. `scripts/check-words.mjs` (`npm run check:words`, in `npm test`): the rulebook where a script can hold it (§ The gate).
2. The copy sweep, screen by screen: console (`src/app/(console)`, `src/app/(lookeditor)` console side), the partner
   workspace (`src/app/(partner)`), and the shared strings that render there (`src/components`, `src/lib`, `src/domains`,
   except the storefront's and Admin's own modules). Owner calls applied: **store**, never shop; the role **Manager**
   (was Admin; the code value `admin` keeps its spelling, like `frata_app`); **On the way** for the state Shipped in
   badges and tabs. Order states as the glossary's table: the console's "Confirmed" state → **To pack**; shopper emails
   use the "Shopper sees" column ("On its way", "On its way with [Courier]"), their subjects a sentence as drawn
   ("Order KS-5012 is on the way"). The action stays a verb: "Mark shipped"; its toast "KS-5012 is on the way."; the
   undo line "Moved back to To ship"; the queue's "Delivered" button → "Mark delivered".
3. N1/N1c words Deviations closed as drawn:
   - Settings values as drawn: Store details "Kesar Studio LLP · Jaipur" (legal name · city); Contact "email · name";
     Pay on delivery "On · up to ₹3,000 · fee ₹49"; Shipping "₹85 · free above ₹1,999 · 2 days"; Taxes and invoices
     the GSTIN alone in mono; Online payments "Not connected" as a warn chip; Plan and billing "Growth · ₹4,999 a
     month"; " · " between values everywhere.
   - Orders: the pager "Showing 1–50 of 300" with "Previous" and "Next" (", newest first" dropped); Placed as
     "Today, 10:06 pm", "Yesterday, 1:36 am", then "13 Nov, 10:06 pm" (the year only when not this year), through
     one new `momentIN(at, now)` in `src/lib/format-date.ts`: Today and Yesterday are IST calendar days (day keys
     compared, never now − 24 h), rendered in `<time dateTime>`. Durable output keeps absolute dates (`dateTimeIN`):
     print, PDF, CSV, emails. A list says a moment with `momentIN`; a wait or "edited 2 h ago" keeps `sinceIN`; the "Keyboard shortcuts · press ?" line under the table
     removed (Rule 0: helper text; "?" still opens the sheet and the KeySheet keeps its title).
   - Setup / the open-store control: "Close the shop for now" → "Close the store for now"; the ask "Close your store?",
     "Shoppers can't place orders until you open it.", buttons "Keep it open" / "Close store"; its failure "We couldn't
     close the store. Nothing was changed."; Home's chip label "Store open. Go to setup to close it." 
4. Admin only where the glossary names a word: "support visit" (never "support session"), "Frrata Admin" (never
   "Admin" alone) where the console shows it (the support banner's "Back to Admin" → "Back to Frrata Admin").
   Partner workspace roles as the glossary: "Partner owner" and "Lead".
5. The merge-field token `[Shop name]` is a stored key (merchants typed it into saved email overrides and message
   text: `src/domains/messaging/placeholders.ts`, `src/lib/email/compose.ts`). The editor shows `[Store name]`; `fill()`
   and `unknownPlaceholders()` accept both, so saved text keeps working without a migration; unit tests for both.
6. **Last, after the owner says N1b has shipped to main** (asked, never assumed): merge `origin/main`; the words pass on
   Analytics; desktop body text 14/20 in `[data-neel]` (one rule in `src/app/neel.css`); console baselines retaken
   (`UPDATE_BASELINES=1 npm run e2e -- --only shop-look`, store pages 0 px); the full e2e suite.

**Out:** Admin's own screens (N4, "Admin after" in § Phases; Admin keeps "merchant" by the glossary). The storefront,
its themes and shopper-facing pages (`src/app/s/**`, `src/components/storefront/**`, `src/domains/themes/**`, the look
preview): themes are retiring (ADR-0014) and store pages stay 0 px in the baselines; their "shop" words wait for the
Storefront API move (a row in Deviations, owner told). Fixed legal words stay: PDFs (invoice "buyer", UQC), the
grievance officer page's statutory lines, consent lines. "Customer" → "shopper" as a column name is the owner's
question; "your customer" in a sentence is gated.

Until step 6, nothing under `src/app/(console)/console/analytics/**`, `src/lib/queries/analytics.ts`,
`src/lib/queries/traffic.ts`, `src/domains/analytics/**`, `src/components/charts/**`, neel.css heat/risk tokens,
`e2e/flows/51-analytics.mjs`, `e2e/flows/72-traffic.mjs`, the True profit app (`apps/true_profit/**`,
`e2e/flows/70-true-profit.mjs`: N1b shares its periods) or the N1b plan is touched (the N1b session is rewriting
them): the gate lists those paths as **pending N1b** and skips them until step 6 removes the entry. N3 ships after N1b
(step 6 needs it on main), so N1b never inherits a failing gate. 90-ux and 05-shop-look are shared: N3 edits 90-ux only
where a word it reads changes, and retakes baselines only in step 6, after the merge. In
`frata-design-language` only § Voice (replaced by § Words) and a new § Glossary change; § Analytics and § Neel
analytics are the other session's.

## The gate (`scripts/check-words.mjs`)
Reads every string a person reads through TypeScript's parser, reusing `strings()` from `check-name.mjs`, with a
template literal joined into one sentence (a stand-in word per `${}`), so W1 and W9 see whole sentences. It reads only
the roots in scope, listed in the script: `src/app/(console)`, `src/app/(partner)`, `src/app/(lookeditor)`,
`src/app/choose`, `src/app/join`, `src/components` (not `storefront/`, `ekcode/`, `shop-preview/`), `src/lib` (not
`db/`, `admin/`, `storefront/`, `ekcode/`, `seo/`, `documents/`), `src/domains` (not `themes`, `checkout`, `storefront`,
`ekcode-core`, `pages`, `policies`, `seo`, `documents`, `reviews`' shopper text, `analytics`). Never reads comments,
identifiers, import/export paths, object keys, tagged templates (`sql\`…\``) and `sql.raw` arguments, the arguments of
`console.*`, `new Error`/`Error()`/`errName`, `cn()`/`cva()`/`twMerge()`, `className`/`class` values, header objects
and values shaped like a MIME type or CSP (`\w+/\w+;`, `-src `), or a code-shaped token (`/^[a-z0-9_.:\/@-]+$/`:
lower case, snake, dotted, path). A capitalised single word is UI text ("Shipped", "Admin", "OK", "Pincode").
`scripts/` and `.claude/` are not read, so the gate never matches its own documentation; its unit test runs each rule on
a fixture that quotes it, and each skipped code shape on another.

| # | Rule (mockup § Words, § Glossary) | Fails | Warns |
|---|---|---|---|
| W1 | One idea, one sentence (owner call 4) | a sentence of 16 words or more | 13–15 words (counted, printed) |
| W2 | No joining marks | `; ` between words; `: ` followed by a clause (3+ words, or a lower-case word) and not a value (a digit, ₹, a placeholder, the end); ` — ` or ` – ` with 2+ words each side and no digit ("10 am – 6 pm" passes). Sentences split on . ? ! but not inside M.R.P., incl., e.g. | — |
| W3 | Swap these · tone by moment · filler (folds in `check:voice`, which is deleted) | in order to, prior to, utilise/utilize, via, e.g., commence, respective(ly), successfully, please, kindly, sorry, oops, is not able to, at this time, in case of, invalid, error occurred, please note, exceeded, something went wrong, are you sure, let's, congratulations; check:voice's list (simply, easily, seamless, powerful, unlock, leverage, robust, hassle-free…) | — |
| W4 | Everyday words · never in the UI · one word for each thing | tenant, webhook, sync, server, token, readiness, variant(s), NDR, pincode (any case: "PIN code"), coupon, voucher, support session, SKU combo, UQC, merchant, buyer, your customer, settlement, remittance, module, add-on, dashboard, partner console, website, MRP (undotted), API, piece(s); US spelling color, canceled, catalog | — |
| W5 | "Store", never "shop" | shop, shops, shop's, Shop. Verbs are a list of exact phrases ("Shop all", "Shop now", "Shop the look") allowed only in look-editor files | — |
| W6 | Roles | a person called admin ("an admin", "admins", "owner or admin", the label `Admin`); "Admin" not after "Frrata" | — |
| W7 | Order states | `Shipped` or `Confirmed` as a value in the state map, the tabs or the email state names (scoped to those files; the verb "Mark shipped" passes) | — |
| W8 | Buttons | JSX text exactly OK, Submit, Proceed, Click here | — |
| W9 | Calm | a sentence ending in "!"; an emoji | — |
| W10 | The name | — (`check:name` already owns "Frata") | — |

Exceptions go in `scripts/check-words.allow.json` as `{ file, rule, text, why }` (store names in fixtures and seeds,
the `[Shop name]` token, a provider's own "API" label); an entry nothing matches fails, so the list never rots.
Today's failures sit in `scripts/check-words.todo` in `check-scale.allow`'s shrink-only form, `count path · rule`: the
gate fails when a file's count for a rule rises, when a file not listed fails, and when a line is stale. Each sweep
step deletes its lines; N3 closes with the file deleted.

## Regression net first
Before any change: `npm test`, `npm run typecheck` and the full e2e suite green on this branch (it is main as of
d08bdd4). 45 of 50 flows read a word this sweep may change; each task moves its flows' words in the same commit
(the new words, never a looser match). Flows that read changed copy, by task (`node scripts/affected-flows.mjs`):
10-checkout (shopper words: unchanged, a guard), 20-orders-count (pager), 30-primitives, 40-partners, 40-queue,
45-modules, 46-messages, 47-look, 47-offers, 49-ship, 79-products-list, 82-neel-shell, 90-ux. `momentIN` gets unit
tests (today, yesterday across IST midnight, this year, last year, a UTC clock at 23:30). The gate gets unit tests.

Baseline (2026-11-15, d08bdd4 untouched): 339 steps passed, 3 failed before any N3 change — offers O·4 (Admin stops
an offer), neel-finding "save the view", ux "support mode" pill count. They are rerun alone before ship to tell flaky
from broken; N3 is not the cause.

## Order of work (each step: npm test · typecheck · the flows it touches · impact-reviewer on its diff · commit)
**N3·1 — The gate.** `check-words.mjs`, its allow file, its test, `check:words` in `package.json` and `npm test`;
`check:voice` folded in and removed. It lands with the burn-down file (§ The gate). The `words-reviewer` agent's rule 11
fixed in the same commit (it said "shop not store", the reverse of the owner's call). `scripts/affected-flows.mjs`
learns the `(partner)` surface. (Counted 2026-11-15 by a prototype: about 160 "shop" strings in the console,
50 in shared code, 27 admin-as-a-person, 100+ joining marks, 85 sentences over 16 words.)
**N3·2 — Orders** (labels, queue, list, order page, ship panel, print, peek; `src/lib/orders`, `src/domains/orders`):
`momentIN` and Placed; the pager; the shortcuts line; the state words (On the way, To pack), the toast and undo lines;
print keeps `dateTimeIN`; the rest of the rulebook.
**N3·3 — Products and catalogue** (list, editor, import, collections, bulk; `src/domains/catalogue`, `src/lib/catalogue`).
**N3·4 — Settings, Setup, Home and the shell** (Settings values as drawn; people with the Manager label and every
"owner or an admin" → "owner or a manager"; the open-store control; billing banner; support banner; layout).
**N3·5 — Apps, offers, look, activity, notices** (GST, WhatsApp, delivery zones, true profit, reviews; offers; the
console side of the look editor; emails' state words in `src/domains/email/words.ts` from the "Shopper sees" column;
the `[Store name]` token with `[Shop name]` still read).
**N3·6 — The partner workspace and what is left of shared code** (`src/app/(partner)`, `src/components`, `src/lib`,
`src/domains`, `/choose`, `/join`). The todo file is empty: deleted.
**N3·7 — Skills.** `frata-design-language`: § Voice replaced by § Words (the rulebook, the swap list, the gate, what a
script cannot hold) and a new § Glossary (surfaces, roles, words, order states, short forms); version bump (minor).
**N3·8 — Step 6 above**, only after the owner says N1b is on main.

## Deviations (mockup element · built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| "Store", never "shop", on every surface (owner call 2) | Console, partner workspace, emails and shared code (checkout's refusals included); not the storefront's own pages and themes, not Admin's screens | Store pages stay 0 px and themes are retiring (ADR-0014); Admin is N4 | Owner's call, 2026-11-15: "take your call" (storefront keeps "shop" until it moves to code) |
| Orders column "Customer" | "Shopper" (the column, the quick look, the order page's section, the cancel and edit reasons) | The glossary's one word for each thing; the drawing and the glossary disagreed | Owner's call, 2026-11-15: "take your call" |
| Orders pager "Showing 1–50 of 43" | The pager as drawn ("Showing 1–50 of 300", Previous and Next, the side with no page shown but not pressable) on a list of more than one page; none on one page (as today) | The drawing's numbers cannot happen together (a fact the mockup got wrong) | Not yet |
| Placed: only Today and Yesterday drawn | Older rows "13 Nov, 10:06 pm", the year when not this year | The rulebook's "12 Nov" with the time a list needs | Not yet |
| Shopper emails "On the way" (owner call 3) | "On its way" to shoppers (subject, heading, preview); the console's email list says "On the way" | The glossary's "Shopper sees" column | Owner's call, 2026-11-15: "take your call" |
| Store details "legal name · city" | The legal name only | No city is stored (the address is free text); a city field is its own change | Not yet |
| Orders: no shortcuts line under the table | A quiet "Keyboard shortcuts" button there (no "· press ?") | The sheet holds the switch that turns single-key shortcuts off; WCAG 2.1.4 needs it reachable by pointer and touch (design-system review) | Not yet |
| The free gift's tax note in an (i) (§ Words, rewritten line) | As drawn | The design-system review asked for it visible (InfoTip's contract: no tax wording in a tip); the approved mockup puts it in the (i) | Not yet (a question of rule against drawing) |
| Orders tabs: all seven drawn with counts, "Couldn't deliver 15" first | "Couldn't deliver" and "Coming back" appear only when they hold orders (Couldn't deliver then first) | Older than N3 (1D queue), not a words change, missed by N1's Deviations (found by N3's parity review); a change to the queue's tabs is its own step | Not yet |
| N1b Analytics mockup: "Pincodes with the most returns", column "Pincode" (and True profit's) | "PIN codes …", "PIN code" | The glossary's one spelling (§ Short forms), the same call as Shopper | Not yet |
| Months as en-IN writes them ("Sept") | Three letters everywhere ("13 Sep") | Neel draws three-letter months | Owner's call, 2026-11-15 |
| Settings "Ready for live payments" chip beside "Not connected" | As built in N1 | The chip counts what blocks live payments; Online payments is its own row | Not yet |

## Design review
- **UI/UX:** words only; no layout change before step 6. Each changed line is checked against the drawn screen where
  one exists (Orders, Settings, Home, Products), else against the rulebook. States keep their words' shape (empty:
  the first step; error: what's wrong then the fix; refused: what happened, what's safe). Rule 0: a sentence that
  explains the obvious is cut, not shortened. Toasts keep past tense + Undo. Aria labels move with their visible words.
- **Tenancy:** n/a: no table, query or tenant path changes (strings only; `momentIN` is pure).
- **Modularity:** the gate in `scripts/`; `momentIN` in `src/lib/format-date.ts` (the one date module, `check:dates`);
  role words from `ROLE_LABEL` (`src/domains/tenancy/roles.ts`) only; state words from `orders/_components/labels.ts`.
- **SSOT/DRY:** one date phrase (`momentIN`), one role label map, one state label map, one email words file. A copy
  string repeated across files (e.g. "That product is not in your shop.") is moved to one constant only where three
  or more files say it.
- **YAGNI:** no i18n framework, no string catalogue; the gate is a grep with a parser, not a grammar checker. The
  warn band (13–15) does not fail; the signal to tighten it is the warn count at zero for a month.
- **KISS:** one script, one allow file, one temporary todo file. No new dependency (TypeScript is already used by
  `check:name`).
- **Scalability / performance:** the gate parses ~800 files with TypeScript like `check:name` (a few seconds in `npm
  test`; it reuses `strings()`, one parser module). `momentIN` reads `now` passed in (`check:clock`): pages pass the
  request's time; client rows use `useNow()`. Today/Yesterday is only used on uncached pages (Orders rows, built on the
  server with the page's `now`; the rows route is no-store; peek, order page, activity, notices); a cached page keeps
  `dayMonthIN`. A tab left open past midnight shows yesterday's "Today" until it reloads (accepted). "Yesterday, 10:06
  pm" is checked at 390 in the phone row.
- **Reliability:** n/a: no outbound call. Emails' subject words change for new sends only.
- **Security:** n/a: no action, route or header changes; error replies keep their named fields.
- **Motion and visuals:** none before step 6; step 6 moves body text 16/24 → 14/20 on desktop and retakes baselines.
- **Unit economics:** none.
- **Blast radius:** the `[Shop name]` merge token (stored in merchants' email overrides and message text: both tokens
  read, § Scope 5); saved view names and any text a merchant typed are data, never rewritten;
  every console screen's words; 45 e2e flows read text; `ROLE_LABEL` (people, partner team, choose,
  join, console layout); `dateTimeIN` callers in the console; email subjects (shopper-facing, new sends). Footguns:
  an aria-label or a `getByRole({ name })` in a flow that reads the old word; a word used as a key (`'shop'` cache
  tags, `refreshShop(…, 'shop')`, audit action names such as `shop.accountant_invite_revoked`) must not change: the
  gate skips strings with no space, and any keyed string with a space goes in the allow file with its reason.

## Verify
`npm test` (includes `check:words`) · `npm run typecheck` · `npm run e2e -- --only <flows of the step>` · before ship:
the full suite, `mockup-parity-reviewer` on Orders and Settings (§ Screens) and any screen whose words were drawn,
`words-reviewer` on the full diff, `design-system-reviewer` and `impact-reviewer` on the diff. The gate's own check:
`node scripts/check-words.mjs` passes while `.claude/skills/frata-design-language/SKILL.md` and this plan quote every
banned word (they are not read), and its unit test proves each rule fires on a fixture and stays quiet on code shapes.

## Practices recorded in skills
frata-design-language § Words (replaces § Voice) and § Glossary; § Numbers, dates: `momentIN` for a moment in a list.
(frata-verify lists no gates by name: nothing to add there.)

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Finding shop/store, admin-as-a-person, long and joined sentences by hand | `check:words` |
| Judging a rewrite (tone by moment, Rule 0, the glossary beyond a grep) | `words-reviewer` (fixed, rule 11) |
| A temporary burn-down for a sweep across many files | `scripts/check-words.todo`, deleted when empty (pattern noted in frata-verify) |

## Questions for the owner (answered 2026-11-15: "for questions — take your call"; the calls are in Deviations)
1. Orders' "Customer" column: keep as drawn, or "Shopper" by the glossary?
2. Storefront and themes keep "shop" until each store moves to code: agreed?
3. Shopper emails: "On its way" (the glossary's shopper column) rather than the console's "On the way"?
4. States the glossary does not name: "Lost by the courier", "Paying now", "Payment abandoned", "Refund due": kept as
   they are unless you name them.

## Review findings folded (2026-11-15)
architecture-reviewer: the `[Shop name]` stored token (blocker → § Scope 5); W1 fails at 16 (owner call 4); check:voice
folded in; check-scale's per-rule shrink-only form instead of a per-file count; code shapes the gate skips (MIME/CSP,
Error and console arguments, class helpers, db/, template joins); explicit roots; N1b coordination (true profit, 90-ux,
the agent fix moved to N3·1); momentIN on IST day keys, durable output absolute; W7 scoped; affected-flows learns
(partner). words-reviewer: single-word UI text is read; W7 the state not the verb (toast, undo, "Mark delivered");
shopper emails from the shopper column; "Confirmed" → "To pack"; W2 values after a colon pass; the banned words the
glossary and tone table name; "Shop" verbs as an exact list; "Admin" not after "Frrata"; partner roles; the pager's
impossible numbers and the older Placed rows as Deviations; Settings' Contact, COD and Shipping values; the close-store
dialog's words; legal text out of scope.
