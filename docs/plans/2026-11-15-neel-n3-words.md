# Neel N3 — Words: the `check:words` gate and the console copy sweep
Status: draft (review agents next) · Date: 2026-11-15 · Branch: `claude/neel-n3-words`
Spec: `docs/specs/2026-11-13-design-language-neel.md` (§ v4 voice, owner calls 1–4, § Phases · N3) · Mockup:
`docs/mockups/2026-11-13-design-language-neel.html` (§ Voice, § Words, § Glossary; § Screens: Orders, Settings) ·
Approved: owner, 2026-11-13 (the mockup; the calls "Manager", "store", "On the way", "warn from 13, fail at 16")

## Goal
The console speaks the way the drawn screens do: a store owner on a phone, between orders, reads each line once.
Ranked problems 3 (catalogue operations) and 1 (COD/RTO): the screens that act on orders and products are the ones
read most, and a line read twice is a confirm or a pack done late. Measure: `check:words` at zero failures on
the console, partner workspace and the shared code that speaks in them; warnings (13–16 words) counted and falling;
parity on Orders and Settings with every N1 words Deviation closed.

## Scope
**In:**
1. `scripts/check-words.mjs` (`npm run check:words`, in `npm test`): the rulebook where a script can hold it (§ The gate).
2. The copy sweep, screen by screen: console (`src/app/(console)`, `src/app/(lookeditor)` console side), the partner
   workspace (`src/app/(partner)`), and the shared strings that render there (`src/components`, `src/lib`, `src/domains`,
   except the storefront's and Admin's own modules). Owner calls applied: **store**, never shop; the role **Manager**
   (was Admin; the code value `admin` keeps its spelling, like `frata_app`); **On the way** for the state Shipped in
   badges and emails.
3. N1/N1c words Deviations closed as drawn:
   - Settings values: Online payments "Not connected" as a warn chip; Plan and billing "Growth · ₹4,999 a month";
     " · " between values; Taxes and invoices the GSTIN alone in mono; Store details "legal name · city".
   - Orders: the pager "Showing 1–50 of 300" with "Previous" and "Next" (", newest first" dropped); Placed as
     "Today, 10:06 pm", "Yesterday, 1:36 am", then "13 Nov, 10:06 pm" (the year only when not this year), through
     one new `momentIN(at, now)` in `src/lib/format-date.ts`; the "Keyboard shortcuts · press ?" line under the table
     removed (Rule 0: helper text; "?" still opens the sheet and the KeySheet keeps its title).
   - Setup / the open-store control: "Close the shop for now" → "Close the store for now", and the dialog with it.
4. Admin only where the glossary names a word: "support visit" (never "support session"), "Frrata Admin" (never
   "Admin" alone) where the console shows it (the support banner's "Back to Admin" → "Back to Frrata Admin").
5. **Last, after the owner says N1b has shipped to main** (asked, never assumed): merge `origin/main`; the words pass on
   Analytics; desktop body text 14/20 in `[data-neel]` (one rule in `src/app/neel.css`); console baselines retaken
   (`UPDATE_BASELINES=1 npm run e2e -- --only shop-look`, store pages 0 px); the full e2e suite.

**Out:** Admin's own screens (N4, "Admin after" in § Phases; Admin keeps "merchant" by the glossary). The storefront,
its themes and shopper-facing pages (`src/app/s/**`, `src/components/storefront/**`, `src/domains/themes/**`, the look
preview): themes are retiring (ADR-0014) and store pages stay 0 px in the baselines; their "shop" words wait for the
Storefront API move (a row in Deviations, owner told). PDFs keep their legal words (invoice "buyer", UQC). "Customer"
→ "shopper" is not gated (the drawn Orders column reads "Customer"; a question for the owner, below).

Until step 5, nothing under `src/app/(console)/console/analytics/**`, `src/lib/queries/analytics.ts`,
`src/lib/queries/traffic.ts`, `src/domains/analytics/**`, `src/components/charts/**`, neel.css heat/risk tokens,
`e2e/flows/51-analytics.mjs`, `e2e/flows/72-traffic.mjs` or the N1b plan is touched (the N1b session is rewriting
them): the gate lists those paths as **pending N1b** and skips them until step 5 removes the entry. In
`frata-design-language` only § Voice (replaced by § Words) and a new § Glossary change; § Analytics and § Neel
analytics are the other session's.

## The gate (`scripts/check-words.mjs`)
Reads every string a person reads through TypeScript's parser, as `check:name` does: string literals, template text,
JSX text. Never reads comments, identifiers, import/export paths, `className`/`class` values, tagged templates
(`sql\`…\``), object keys, or strings with no space or no letters (codes, tags, MIME types such as
`text/csv; charset=utf-8`, routes). `scripts/` and `.claude/` are not read, so the gate never matches its own
documentation; its unit test runs it on a fixture that quotes each rule (§ Verify).

| # | Rule (mockup § Words) | Fails | Warns |
|---|---|---|---|
| W1 | One idea, one sentence (owner call 4) | a sentence over 16 words | 13–16 words (counted, printed) |
| W2 | No joining marks | `; ` between words; `: ` with 2+ words before it, or a lower-case clause of 3+ words after it; ` — ` or ` – ` with 2+ words each side | — |
| W3 | Swap these | in order to, prior to, utilise/utilize, via, e.g., commence, respective(ly), successfully, please, kindly, sorry, is not able to, at this time, in case of, invalid, error occurred, please note | — |
| W4 | Everyday words · Never in the UI | tenant, webhook, readiness, variant(s), NDR, pincode, coupon, voucher, support session, SKU combo, UQC (outside PDFs) | — |
| W5 | "Store", never "shop" | shop, shops, shop's as a noun ("Shop all", "Shop now", "Shop the look" are verbs and pass) | — |
| W6 | Roles | a person called admin: "an admin", "admins", "owner or admin", the label `'Admin'` | — |
| W7 | Order states | the state label `'Shipped'` alone (a badge, a tab, an email's subject word) → "On the way" | — |
| W8 | Buttons | JSX text exactly OK, Submit, Proceed, Click here | — |
| W9 | Calm | a sentence ending in "!" | — |

Exceptions go in `scripts/check-words.allow.json` as `{ file, rule, text, why }`; an entry nothing matches fails, so
the list never rots (the `check:name` pattern). Out-of-scope surfaces (storefront, Admin, pending N1b) are one list
at the top of the script with the reason on each line, not allow entries.

## Regression net first
Before any change: `npm test`, `npm run typecheck` and the full e2e suite green on this branch (it is main as of
d08bdd4). 45 of 50 flows read a word this sweep may change; each task moves its flows' words in the same commit
(the new words, never a looser match). Flows that read changed copy, by task (`node scripts/affected-flows.mjs`):
10-checkout (shopper words: unchanged, a guard), 20-orders-count (pager), 30-primitives, 40-partners, 40-queue,
45-modules, 46-messages, 47-look, 47-offers, 49-ship, 79-products-list, 82-neel-shell, 90-ux. `momentIN` gets unit
tests (today, yesterday across IST midnight, this year, last year, a UTC clock at 23:30). The gate gets unit tests.

## Order of work (each step: npm test · typecheck · the flows it touches · impact-reviewer on its diff · commit)
**N3·1 — The gate.** `check-words.mjs`, its allow file, its test, `check:words` in `package.json` and `npm test`.
It lands with a **burn-down list**: the failures today, by file, in `scripts/check-words.todo` (path · count); the gate
fails on any file not on the list and on any listed file whose count rises. Each sweep step deletes its lines; N3
closes with the file empty and deleted. (Counted 2026-11-15 by a prototype: about 160 "shop" strings in the console,
50 in shared code, 27 admin-as-a-person, 100+ joining marks, 85 sentences over 16 words.)
**N3·2 — Orders** (labels, queue, list, order page, ship panel, print, peek; `src/lib/orders`, `src/domains/orders`):
`momentIN` and Placed; the pager; the shortcuts line; Shipped → On the way in badges and the activity line; the rest
of the rulebook.
**N3·3 — Products and catalogue** (list, editor, import, collections, bulk; `src/domains/catalogue`, `src/lib/catalogue`).
**N3·4 — Settings, Setup, Home and the shell** (Settings values as drawn; people with the Manager label and every
"owner or an admin" → "owner or a manager"; the open-store control; billing banner; support banner; layout).
**N3·5 — Apps, offers, look, activity, notices** (GST, WhatsApp, delivery zones, true profit, reviews; offers; the
console side of the look editor; emails' state words in `src/domains/email/words.ts`).
**N3·6 — The partner workspace and what is left of shared code** (`src/app/(partner)`, `src/components`, `src/lib`,
`src/domains`, `/choose`, `/join`). The todo file is empty: deleted.
**N3·7 — Skills.** `frata-design-language`: § Voice replaced by § Words (the rulebook, the swap list, the gate, what a
script cannot hold) and a new § Glossary (surfaces, roles, words, order states, short forms); version bump (minor).
The `words-reviewer` agent fixed: its rule 11 says "shop not store", the reverse of the owner's call.
**N3·8 — Step 5 above**, only after the owner says N1b is on main.

## Deviations (mockup element · built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| "Store", never "shop", on every surface (owner call 2) | Console, partner workspace, emails and shared code; not the storefront's own pages and themes, not Admin's screens | Store pages stay 0 px and themes are retiring (ADR-0014); Admin is N4 | Not yet |
| Orders column "Customer" | Kept as drawn | The glossary says "shopper, never customer"; the mockup draws "Customer". Owner's call | Not yet (question) |

## Design review
- **UI/UX:** words only; no layout change before step 5. Each changed line is checked against the drawn screen where
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
  warn band (13–16) does not fail; the signal to tighten it is the warn count at zero for a month.
- **KISS:** one script, one allow file, one temporary todo file. No new dependency (TypeScript is already used by
  `check:name`).
- **Scalability / performance:** n/a for words. `momentIN` reads `now` passed in (`check:clock`): pages pass the
  request's time; client rows use `useNow()`. Today/Yesterday is only used on uncached pages (Orders rows, peek, order
  page, activity, notices); a cached page keeps `dayMonthIN`.
- **Reliability:** n/a: no outbound call. Emails' subject words change for new sends only.
- **Security:** n/a: no action, route or header changes; error replies keep their named fields.
- **Motion and visuals:** none before step 5; step 5 moves body text 16/24 → 14/20 on desktop and retakes baselines.
- **Unit economics:** none.
- **Blast radius:** every console screen's words; 45 e2e flows read text; `ROLE_LABEL` (people, partner team, choose,
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
frata-verify: `check:words` in the gate list.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Finding shop/store, admin-as-a-person, long and joined sentences by hand | `check:words` |
| Judging a rewrite (tone by moment, Rule 0, the glossary beyond a grep) | `words-reviewer` (fixed, rule 11) |
| A temporary burn-down for a sweep across many files | `scripts/check-words.todo`, deleted when empty (pattern noted in frata-verify) |

## Questions for the owner
1. Orders' "Customer" column: keep as drawn, or "Shopper" by the glossary?
2. Storefront and themes keep "shop" until each store moves to code: agreed?
