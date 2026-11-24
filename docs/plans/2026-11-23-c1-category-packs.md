# C1 · Category packs: the task plan
Status: active (C1a and C1c; C1b blocked on its mockup)
**Mockup:** none — C1a and C1c are a refactor with no visible change; C1b (Settings › Store details, "What you sell") is to be drawn, and its build tasks wait for its approval
**Approved:** owner, 2026-11-23 (calls 10 and 11)
**Review:** architecture-reviewer 3 major, 6 minor findings fixed, 2026-11-23
**Review (C1b):** tenancy-auditor pending
**Review (C1b):** security-reviewer pending (C1b changes `saveSection` and a lock)
**Review (C1b):** speed-reviewer pending (C1b adds one read to the Store details page's `Promise.all`)
(The three C1b lines carry "(C1b)" so `check:plans`, which reads `**Review:**` lines once a plan is active, holds C1a and C1c
to their one review; each becomes a `**Review:**` line with its verdict before C1b executes.)
Spec: `docs/specs/2026-11-23-merchant-onboarding.md` § C1–C3, § What is there today, calls 10 and 11. Builds on
`docs/plans/2026-11-09-gst-core-and-categories.md` § 4 (phase 6) and `docs/research/2026-11-09-all-categories.md` § 3.
**api-contract-reviewer is not needed.** No accessor feeds a Storefront API mapper (`src/domains/storefront-api/2026-12/map.ts`
reads no `sells`). The answers keep their shape. The returns answer's text can change when a store changes what it sells, and
every API copy carries `shop:<t>`, which `refreshShop(t,'shop')` already purges (`src/lib/queries/storefront.ts:52-55`).

The owner, 2026-11-23: "Keep categories work modular and scalable. Clients should be able to update categories later on as
well." This plan holds three goals: (a) a new category is one pack file, one line in the registry's list and one
generated migration, with no edit to any reader; (b) a store's owner or Manager changes what it sells in Settings › Store
details; (c) a fashion store sees no change when C1 ships.

Lanes: O1 and O2 own migrations 0178–0181 and change `src/app/start/*` first. **C1 needs no migration.** The one exception
is open question 1: if the owner wants Ask the owner on Store details, that is `0170_ask_owner_store.sql`. C1a·6 changes
`src/app/start/*` only to take the tiles from the registry, and it rebases onto O1. C1b·2 edits the Store details section after O1 adds the PIN code field there.

## Regression net (first; green before C1a·2 starts)
| What | Where | Pins |
|---|---|---|
| New characterization test (C1a·1), written against today's exports and unchanged afterwards | `src/domains/catalogue/__tests__/sells-today.test.ts` | every derived value for 19 lists (table below) |
| Labels | `src/domains/catalogue/__tests__/label.test.ts:5-10` | `labelAsked` |
| Size charts | `src/domains/catalogue/__tests__/size-charts.test.ts:5-8` | `presetsFor` order |
| Sample sets | `src/lib/themes/__tests__/sample.test.ts:62-68` | `sampleSetFor` |
| Returns text | `src/domains/policies/__tests__/render.test.ts:23-30` | condition lines, mixed store |
| Kinds | `src/domains/catalogue/__tests__/kind.test.ts` | `startSizes`, which reads `PRESETS` and is retyped in C1a·2 |
| Settings | `src/domains/settings/__tests__/{sections,owner-only,editors,groups}.test.ts`; `src/domains/tenancy/__tests__/capabilities.test.ts` (snapshot) | sections, locks, who opens what |
| e2e | `63-signup`, `78-products-pr0`, `88-neel-settings`, `93-owner-only`, `47-look` | sign-up tiles, the new product's kind and sizes, Settings saves, PP1 locks, the theme sample set |
| Gates | `npm test` (all gates, check:layers among them), `npm run typecheck` | — |

The characterization table. Each row was measured on today's code on 2026-11-23 with `npx tsx` calling the real functions:

| sells | startingHsn | sellsSized | presetsFor (names, in order) | labelAsked | sampleSetFor | returns condition |
|---|---|---|---|---|---|---|
| `[]` | 6211 | true | Kurta set · Women, Shirt · Men, One size | false | clothing | F |
| women | 6204 | true | Kurta set · Women, One size | false | clothing | F |
| men | 6203 | true | Shirt · Men, One size | false | clothing | F |
| men, women | 6204 | true | Shirt · Men, Kurta set · Women, One size | false | clothing | F |
| kids | 6209 | true | Kids, One size | false | clothing | F |
| ethnic | 6211 | true | Kurta set · Women, One size | false | clothing | F |
| accessories | 4202 | false | One size | false | accessories | F |
| footwear | 6403 | true | Footwear, One size | false | footwear | F |
| jewellery | 7117 | false | One size | false | accessories | J |
| beauty | 3304 | false | One size | true | clothing | S |
| wellness | 3004 | false | One size | true | clothing | S |
| women, beauty | 6204 | true | Kurta set · Women, One size | true | clothing | F S |
| ethnic, women | 6211 | true | Kurta set · Women, One size | false | clothing | F |
| jewellery, men | 6203 | true | One size, Shirt · Men | false | clothing | F J |
| footwear, accessories | 6403 | true | Footwear, One size | false | accessories | F |
| jewellery, footwear | 6403 | true | One size, Footwear | false | accessories | F J |
| women, jewellery, wellness | 6204 | true | Kurta set · Women, One size | true | clothing | F J S |
| beauty, wellness | 3304 | false | One size | true | clothing | S |
| unknown | 6211 | false | One size | false | clothing | (empty) |

The packs a store sells are taken in the store's own order (`of(sells) = sells.flatMap((k) => BY_KEY[k] ?? [])`), which is
today's: `men, women` gives Shirt · Men before Kurta set · Women, and `jewellery, men` gives One size, then Shirt · Men (architecture
review, finding 4). The `men, women` row was added at the review; it was measured on today's code like the rest.

F, J and S are the three sentences in `src/domains/policies/render.ts:87-89`, in that order and joined by one space. The test
reads them through `renderPolicy('returns', …)` because `condition` is private. It also pins `SELL_KEYS` (order
women, men, kids, ethnic, accessories, footwear, jewellery, beauty, wellness) and `SELL_LABELS` (order and words,
`sell-keys.ts:6-9`).

## The Pack type
`src/domains/catalogue/packs/types.ts` holds the shape C1 needs. A pack is pure data and imports types only.
```ts
import type { PresetKey } from '../size-charts'

/** One sentence of the returns page (policies/render.ts). A store that sells several packs gets each distinct line once, by rank. */
export type ReturnLine = { readonly rank: number; readonly text: string }

export type Pack = {
  /** The sell key in shop_settings.sells and its CHECK: /^[a-z][a-z_]{1,23}$/. Never renamed or removed, because stores hold it. */
  readonly key: string
  /** Sign-up and Settings › Store details: the words, the place in the grid, a 24×24 stroke path. */
  readonly tile: { readonly label: string; readonly order: number; readonly icon: string }
  /** shop_settings.default_hsn at sign-up: the pack with the lowest rank among those the store sells wins. A prefill, never a fallback. */
  readonly startingHsn: { readonly code: string; readonly rank: number }
  /** Clothing or footwear: the kind step, starting sizes, the size chart and model panels. */
  readonly sized: boolean
  /** Starting size charts (size-charts.ts PRESETS). Every store also gets one_size. */
  readonly charts: readonly PresetKey[]
  /** The editor asks what the pack says (label.ts), and Active needs it. */
  readonly label: boolean
  readonly returns: ReturnLine
  // Not declared in C1 (YAGNI, architecture review finding 5); each arrives as an optional member, so no reader changes:
  //   noun?, photo?: shopper words and photo shape                                     C1d
  //   fields?: typed product fields (text, number with unit, date, choice)            C2
  //   declarations?: what Active needs by law (licence or mark number, batch, dates)  C3, absorbs `label`
  //   shipping?: flags (fragile, liquid, perishable, volumetric)                       C2 and C3
  //   rates?: the pack's own GST rate rules (never apparel's price slab by inheritance) C2 and C3, with a CA's read
  //   taxonomy?: its category extract and search words (taxonomy.ts is apparel only)   C2
  //   kindWords?: one-size and sized words for the name guess (kind.ts:17-23)          C2
}
```
The theme preview's sample set is not a pack fact: `sampleSetFor` stays in frozen theme code
(`src/domains/themes/catalogue/samples.ts`, ADR-0014), untouched, and rule 5 allowlists it (finding 5).
`size-charts.ts:21` becomes `export const PRESETS = { … } satisfies Record<string, Preset>` and `export type PresetKey = keyof typeof PRESETS`.
`kind.ts:40` `first3` takes a `PresetKey`.

Shared lines, `packs/shared.ts`. The wording is today's, `render.ts:87-89`:
```ts
export const FASHION_RETURNS = { rank: 10, text: 'Clothes, footwear and accessories must be unused, unwashed and with their tags.' } as const
export const JEWELLERY_RETURNS = { rank: 20, text: 'Jewellery must be unworn, in its original packaging.' } as const
export const SEALED_RETURNS = { rank: 30, text: 'Beauty, personal care and wellness products can be returned only unopened, with their seal intact: once opened they can’t be taken back, for hygiene.' } as const
```
The filled examples. Every value is today's (`sell-keys.ts:7-8,16-17,23`, `size-charts.ts:37-41`, `label.ts:20`, `render.ts:85-89`,
`create-shop-form.tsx:251-254`):
```ts
// packs/women.ts
export const women = {
  key: 'women',
  tile: { label: 'Women', order: 10, icon: 'M9 3h6l1 5-2 1 2 12H8l2-12-2-1z' },
  startingHsn: { code: '6204', rank: 20 },
  sized: true, charts: ['womens_kurta'], label: false,
  returns: FASHION_RETURNS,
} as const satisfies Pack

// packs/beauty.ts
export const beauty = {
  key: 'beauty',
  tile: { label: 'Beauty and personal care', order: 80, icon: 'M9 3h6v4l2 3v10H7V10l2-3z' },
  startingHsn: { code: '3304', rank: 80 },
  sized: false, charts: ['one_size'], label: true,
  returns: SEALED_RETURNS,
} as const satisfies Pack
```
The other seven packs, as key · tile order · HSN code and rank · sized · charts · label · returns:
men 20 · 6203/30 · yes · mens_shirt · no · F; kids 30 · 6209/40 · yes · kids · no · F; ethnic 40 ·
6211/10 · yes · womens_kurta · no · F; footwear 50 · 6403/50 · yes · footwear · no · F; accessories 60 ·
4202/60 · no · one_size · no · F; jewellery 70 · 7117/70 · no · one_size · no · J; wellness 90 ·
3004/90 · no · one_size · yes · S. Icons are the paths at `create-shop-form.tsx:251-254`.

The list is its own file, `packs/list.ts`, so a test can append a fixture pack to it and re-import the real readers (C1c·1,
finding 3):
```ts
/** Append only: this order is the CHECK's order (schema.ts, check:packs). */
export const PACKS = [women, men, kids, ethnic, accessories, footwear, jewellery, beauty, wellness] as const
```
`packs/registry.ts` is the pure, generic `registry()`; `packs/index.ts` applies it to the list and is what readers import:
```ts
// packs/registry.ts
/** A store that skipped "What do you sell?" is treated as selling these. Its labels follow these packs, so none is asked. */
export const UNSAID = ['ethnic', 'women', 'men'] as const
export const FALLBACK_HSN = '6211'

export function registry<const P extends readonly Pack[]>(packs: P) {
  // of(sells): the packs a store sells, in the store's own order: sells.flatMap((k) => BY_KEY[k] ?? []).
  // An empty list is UNSAID; an unknown key is ignored.
  return {
    keys,            // packs.map(key), typed { [I in keyof P]: P[I]['key'] }, so z.enum and the CHECK take it
    tiles,           // { key, label, order, icon }[] sorted by tile.order
    startingHsn,     // (sells) => lowest startingHsn.rank in of(sells), else FALLBACK_HSN
    sized,           // (sells) => of(sells).some(p => p.sized)
    chartKeys,       // (sells) => unique, in of(sells) order, of each pack's charts, then 'one_size'
    labelAsked,      // (sells) => of(sells).some(p => p.label)
    returnLines,     // (sells) => distinct ReturnLine texts of of(sells), sorted by rank
    change,          // (before, after, defaultHsn) => { added, removed, hsn: string | null }   (C1b·1)
  }
}

// packs/index.ts
const R = registry(PACKS)
export const SELL_KEYS = R.keys
export type SellKey = (typeof SELL_KEYS)[number]
export const { tiles: SELL_TILES, startingHsn, sized: sellsSized, chartKeys, labelAsked, returnLines } = R
/** The starting charts (moved here from size-charts.ts, so size-charts.ts stays free of the registry: finding 2). */
export const presetsFor = (sells: readonly string[]) => chartKeys(sells).map((k) => PRESETS[k])
```
UNSAID reproduces every `[]` row of the table: ethnic gives HSN 6211, women and men give the three charts, all three are sized, F, and no label.
`['unknown']` is not empty, so it matches no pack: 6211, unsized, One size only, no line.

**Pack data and the browser (finding 2).** Client files import `label.ts` (`product-editor.tsx:29`, `label-panel.tsx:4`),
`size-charts.ts` (`size-chart.tsx:7`, and `kind.ts:11`, which `new-product-form.tsx:7` imports) and `policies/render.ts`
(`policy-pages.tsx:10`, loaded with `next/dynamic` from `settings-form.tsx:36`), and `registry(PACKS)` is a top-level call that no
bundler drops. So `label.ts` and `size-charts.ts` never import the packs: `labelAsked` and `presetsFor` are read from
`@/domains/catalogue/packs` directly (`[handle]/page.tsx`, `readiness.ts`, `handles.ts`, all server code). `render.ts` does read
`returnLines`, so pack data reaches whichever chunk renders a policy in the browser; the two pinned pages are measured before and
after (C1a·3) and must not grow. `create-shop-form.tsx` (`/start`, a client file, not pinned) reads `SELL_LABELS` through
`sell-keys.ts` until C1a·6 hands it the tiles from the server.

## Reader map
| # | Read today | file:line | Derives | After C1 |
|---|---|---|---|---|
| 1 | `SELL_KEYS` | `src/domains/catalogue/sell-keys.ts:2` | the keys | `sell-keys.ts` re-exports `SELL_KEYS`, `SellKey` from `packs` |
| 2 | `SELL_LABELS` | `sell-keys.ts:6-9` | tile words and order | derived from `SELL_TILES`; kept for the pinned test. **Debt:** after C1a·6 its only reader is `sells-today.test.ts`; it goes when C1b's field reads `SELL_TILES` too (finding 8) |
| 3 | `STARTING`, `startingHsn` | `sell-keys.ts:15-21` | starting HSN | re-export of `startingHsn` |
| 4 | `sellsSized` | `sell-keys.ts:23` | sized | re-export of `sellsSized` |
| 5 | `SELLS` | `src/lib/db/schema.ts:224` | re-export for Zod | unchanged (via sell-keys) |
| 6 | CHECK literal | `schema.ts:321` | DB domain | `array[${sql.raw(sqlList(SELL_KEYS))}]::text[]` (`sqlList`: `src/domains/tenancy/roles.ts:105`, as `schema-modules.ts:26`) |
| 7 | CHECK in SQL | `drizzle/0070_serious_payback.sql:19` (after `0007:58`, dropped at `0070:1`) | DB domain | `check:packs` compares it with the registry |
| 8 | `presetsFor` | `src/domains/catalogue/size-charts.ts:34-47` | starting charts | moves to `src/domains/catalogue/starting-charts.ts` as `chartKeys(sells).map((k) => PRESETS[k])`, taking `readonly string[]`; `size-charts.ts` keeps no registry import, because client files import it (finding 2) |
| 9 | `labelAsked` | `src/domains/catalogue/label.ts:19-20` | label asked | removed from `label.ts` (client files import it: finding 2); readers import `labelAsked` from `@/domains/catalogue/packs`; the comment moves with it, saying "set at sign-up" (C1a·3; C1b·5 adds Settings) |
| 10 | `condition` | `src/domains/policies/render.ts:82-91` | returns lines | `returnLines(f.sells).join(' ')` |
| 11 | `sampleSetFor` | `src/domains/themes/catalogue/samples.ts:37-48` | sample set | left untouched: frozen theme code (ADR-0014), not a pack fact; allowlisted by rule 5 (finding 5) |
| 12 | Zod `z.enum(SELLS)` | `src/app/start/actions.ts:44` | input | unchanged |
| 13 | `startingHsn(sells)` | `start/actions.ts:5,76` | sign-up prefill | unchanged import |
| 14 | `SELL_LABELS`, `SellIcon` | `start/create-shop-form.tsx:3,223-234,249-256` | tiles and icons | a `tiles` prop from `start/page.tsx:37` (`SELL_TILES`) rendered by `<SellTiles>` (C1a·6) |
| 15 | `sellsSized` | `console/products/actions.ts:7,57` | starting sizes | unchanged import |
| 16 | `sellsSized` | `console/products/new/page.tsx:2,13` | kind step | unchanged |
| 17 | `sellsSized`, `labelAsked` | `console/products/[handle]/page.tsx:16-17,113` | editor panels | `labelAsked` imported from `@/domains/catalogue/packs` (one import line) |
| 18 | `EditorShop.sized/label` | `products/_components/product-editor.tsx:63-64` | panels, readiness | unchanged (flags) |
| 19 | `presetsFor` + cast | `src/lib/catalogue/handles.ts:14-20` | `ensureTypes` | `presetsFor` imported from `@/domains/catalogue/starting-charts`, cast removed; C1b adds `packTypesIn` beside it |
| 20 | `labelAsked` | `src/lib/catalogue/readiness.ts:38,41` | Active rule | `labelAsked` imported from `@/domains/catalogue/packs` (one import line) |
| 21 | `readiness()` | `src/domains/catalogue/product-form.ts:173-188` | the list | unchanged (takes flags) |
| 22 | `shopSells` | `src/lib/queries/settings.ts:146-150` | read | unchanged |
| 23 | `setStartingHsn` | `settings.ts:152-155` | write | unchanged; C1b writes the HSN in `packTypesIn`'s transaction instead |
| 24 | `createShop` | `src/lib/db/platform.ts:154-163`, `drizzle/0065_trial_signup.sql:89` | write | unchanged (no key list in SQL) |
| 25 | `shopFacts.sells` | `console/settings/_components/facts.ts:17` | Settings values | the C1b field reads it |
| 26 | policy facts | `src/lib/queries/store-shop.ts:31`, `src/lib/queries/catalogue.ts:184` | `renderPolicy`, product page | unchanged |
| 27 | look facts, `goodFor ∩ sells` | `src/lib/themes/facts.ts:10,18`, `src/lib/queries/look.ts:14`, `console/look/page.tsx:37,48` | theme gallery sort | frozen theme code, not a pack fact (`goodFor` holds non-keys such as `sarees`); left |
| 28 | name word lists | `src/domains/catalogue/kind.ts:17-23` | kind guess | not a sells read; C2 (`kindWords`) |
| 29 | option names | `src/domains/catalogue/option-kind.ts:15-17` | size and colour | not category-specific; stays |
| 30 | apparel taxonomy | `src/domains/catalogue/taxonomy.ts:14` | categories | C2 (`taxonomy`) |
| 31 | `'Kurta, sari, lehenga…'` | `console/products/_components/organise-card.tsx:90` | placeholder | C2, with the taxonomy it searches |
| 32 | "piece" words | `src/components/storefront/words.ts:25,35` | shopper words | C1d (`noun`) |
| 33 | size and model words | `words.ts:32,68,73` | shopper words | shown only when sized or set; C1d checks them |
| 34 | "Photos on a model, sizes…" | `src/domains/setup/checklist.ts:52` | setup line | O2 rewrites this step (open question 4) |
| 35 | 4:5 photo frames | `src/components/storefront/buy-box.tsx:195,208,220` | photo shape | C1d (`photo`) |
| 36 | API mappers | `src/domains/storefront-api/2026-12/map.ts:119-127` | details, model, chart | no sells read; unchanged |
| 37 | `availability.ts` | `src/domains/catalogue/availability.ts` | stock | no sells read |

After C1a, nothing in `src` outside `packs/` and tests holds a quoted sell key, except the allowlisted files, each with its reason.
Rule 5 of `check:packs` holds this (finding 1: the first draft's rule, a key on a line that names `sells`, missed today's
`size-charts.ts:37-41`, whose lines name `s`).

## Tasks
Each task: write the test first, make the change, run the verify command and read its output, then `npm test && npm run typecheck`, then
**impact-reviewer on the diff**, then commit. The tree is green after every task.

### C1a · The registry (no visible change)
**C1a·0 · Regression net green.** Run the net above on main before the first change.
Verify: `npx vitest run src/domains/catalogue src/domains/policies src/lib/themes src/domains/settings src/domains/tenancy`
reports all passed; `npm run e2e -- --only signup,products-pr0,neel-settings,owner-only,look` reports 5 flows passed. No commit.

**C1a·1 · Pin today.** Test first, and this test is the whole task: `src/domains/catalogue/__tests__/sells-today.test.ts` reads the 19-row
table (kept beside it in `sells-today.rows.ts`, so C1a·2's bridge and C1c·1 read the same rows), `SELL_KEYS` and `SELL_LABELS`. It imports only today's names: `startingHsn`, `sellsSized`, `SELL_KEYS`, `SELL_LABELS` (sell-keys),
`presetsFor` (size-charts), `labelAsked` (label), `sampleSetFor` (`@/lib/themes/sample`), `renderPolicy` (policies).
Verify: `npx vitest run src/domains/catalogue/__tests__/sells-today.test.ts` reports 1 file passed on unchanged code. Commit it alone.
Its table and assertions are not edited again until C1c·1, which adds rows only. One edit is planned: C1a·3 moves `presetsFor` and
`labelAsked` out of `size-charts.ts` and `label.ts` (finding 2), so their two import lines change path, and nothing else does.

**C1a·2 · The packs.** Files: `src/domains/catalogue/packs/{types,shared,registry,list,index}.ts` and the nine pack files
`women,men,kids,ethnic,accessories,footwear,jewellery,beauty,wellness.ts`; `size-charts.ts:21` (`satisfies`, `PresetKey`);
`kind.ts:40` (`PresetKey`). No reader is touched. Test first, `packs/__tests__/registry.test.ts`:
- keys are unique and match the key regex;
- `tile.order` values and `startingHsn.rank` values are each unique;
- labels are 1–30 characters;
- icons match `/^[MmLlHhVvCcSsQqAaZz0-9 .,-]+$/`, and the nine paths equal literal copies of `create-shop-form.tsx:251-254`
  (finding 7), so the move cannot change a tile;
- every `charts` key is in `PRESETS`; every `UNSAID` key is a pack;
- HSN codes match `^\d{4}(\d{2}){0,2}$`;
- for every row of the C1a·1 table, each registry accessor equals the old function.

The last test is a bridge: it is deleted in C1a·3, once the old functions are the registry.
Verify: `npx vitest run src/domains/catalogue` all passed; `node scripts/check-layers.mjs` reports clean; `npm run typecheck` reports 0 errors.

**C1a·3 · Readers move to the registry.** Files: `sell-keys.ts` (becomes re-exports: `SELL_KEYS`, `SellKey`, `SELL_LABELS` derived,
`startingHsn`, `sellsSized`), `size-charts.ts:10,33-47` (`presetsFor` leaves for `starting-charts.ts`), `label.ts:19-20` (`labelAsked`
leaves for the packs), `render.ts:82-91`, `lib/catalogue/handles.ts:3,18` (import from the packs, cast removed),
`lib/catalogue/readiness.ts:4` and `console/products/[handle]/page.tsx:16` (`labelAsked` from the packs), and the import lines of
`label.test.ts` and `size-charts.test.ts` (the same two names). `themes/catalogue/samples.ts` is not touched (finding 5).
Delete the bridge test. The test written first is C1a·1, its table and assertions unchanged.
Verify: `npx vitest run src/domains src/lib/themes` all passed; the diff of `sells-today.test.ts` since C1a·1 is its two import lines
only; `npm run build`, whose `check:storefront-build` is clean, and `SHOW_BUDGETS=1 node scripts/check-storefront-build.mjs` prints
`products/[handle]` (pinned 209.1 kB) and `settings/[section]` (pinned 187.0 kB) no larger than before (finding 2):

| Page (first-load JS, gz) | Before C1a | After C1a·3 |
|---|---|---|
| `/(console)/console/products/[handle]/page` | 208.4 kB | 208.4 kB |
| `/(console)/console/settings/[section]/page` | 186.6 kB | 186.7 kB: no pack data in any of its first-load files (grep of the build for a tile word and the returns text); the 0.1 kB is webpack's runtime, whose chunk map names the new modules |
| `/(console)/console/content/page` (pinned 227.2 kB) | 227.0 kB | 227.0 kB (231.3 kB before `pure`, below) |
| `/start` (not pinned; until C1a·6) | 128 kB | 129 kB |

As built (C1a·3), two changes to the shape above, both for the browser:
- `presetsFor` lives in `src/domains/catalogue/starting-charts.ts`, not `packs/index.ts`: with it there, every chunk that read the packs
  also carried all the size charts (Content's first load went to 231.3 kB, over its 227.2 pin).
- Webpack counts a top-level object literal as a side effect and keeps such a module wherever it is imported, even for nothing:
  `policies/answers.ts` imports `render.ts` in Content's browser chunk for a constant, so the packs and the whole of `render.ts` came
  with it. Each pack, each shared line, the list and `SELL_LABELS` are therefore made through `packs/define.ts`'s
  `/*#__PURE__*/ pure(() => ({ … }) as const satisfies Pack)`, and `packs/index.ts` exports only functions and pure calls; an unused
  import of the packs is then dropped. A new pack file copies that form (the recipe, C1c·2).

**C1a·4 · The CHECK from the registry.** File: `schema.ts:321` built with `sqlList(SELL_KEYS)`. The new SQL must be
byte-identical to `0070:19`. Test first: in `src/lib/db/__tests__/public-plans.test.ts`'s style, a test that renders the
check's SQL and compares it with the literal `"shop_settings"."sells" <@ array['women',…,'wellness']::text[]`.
Verify: `npm run db:generate` prints drizzle-kit's "No schema changes, nothing to migrate", and `git status drizzle/` is clean.

**C1a·5 · The gate `check:packs`.** Files: `scripts/check-packs.mjs` (pure `packProblems(tree)` exported, `main()` reads
the disk), `package.json` (`check:packs`, and the gate in `gates` before `check-skills`), `scripts/__tests__/check-packs.test.ts`.
The header opens `// Fails: a category pack that is not one file named by its key, a pack missing from the registry's list, a registry whose keys differ from the shop_settings_sells CHECK the newest migration adds, or a sell key quoted outside the packs.`
Rules, with comment lines (`//`, `/*`, `*`, `--`) skipped everywhere:
1. Every `src/domains/catalogue/packs/*.ts` except `index.ts`, `list.ts`, `registry.ts`, `types.ts`, `shared.ts` and `define.ts` holds exactly one
   `key: '<k>'`, and `<k>` is its file name.
2. `list.ts` imports each pack file and names it in `PACKS = [ … ]`. A listed name has a file.
3. Walk `drizzle/meta/_journal.json` in order and read each file. The last `CONSTRAINT "shop_settings_sells" CHECK (… array[…]`
   lists exactly the registry's keys, in `PACKS` order; a later `DROP CONSTRAINT "shop_settings_sells"` with no new one fails. The one
   pattern matches both forms (finding 6): `ALTER TABLE … ADD CONSTRAINT` (`0070:19`) and the `CREATE TABLE` column list (`0007:58`).
   A registry key the migration lacks fails with: "widen the CHECK first: npm run db:generate, apply the migration before the deploy
   that adds the pack". A CHECK key with no pack fails with: "a pack is never removed: stores hold its key".
4. The `shop_settings_sells` line in `schema.ts` names `SELL_KEYS` and holds no quoted key.
5. Every `src/**` file outside `packs/` that is not a test holds no quoted registry key (`'women'`, `"men"`, `` `kids` ``), except
   this allowlist, each with its reason (finding 1):
   - `src/domains/catalogue/kind.ts` and `src/app/(console)/console/products/new/new-product-form.tsx`: product kinds
     (`footwear`, `kids`), not sell keys;
   - `src/domains/themes/catalogue/**`: frozen theme code (ADR-0014), `goodFor` and `SampleSet`/`sampleSetFor`.

Test first, with fixtures for each rule's pass and fail. Cases that matter most: a 10th pack file with no migration fails rule 3,
and the same pack with a migration passes; a `CREATE TABLE` CHECK alone is read; today's `size-charts.ts` (its `presetsFor` before
C1a·3, copied into the test) fails rule 5. The gate must not match its own documentation, so a test feeds `scripts/check-packs.mjs`
(whose header names the constraint) in beside `0070` as a migration file and as a src file, and expects nothing.
Verify: `node scripts/check-packs.mjs` prints `check:packs — clean (9 packs; CHECK in 0070_serious_payback)`;
`npm run gates:list` shows its line; `npx vitest run scripts/__tests__/check-packs.test.ts` passed.

**C1a·6 · Sign-up tiles from the registry** (after O1 has merged its form). Files: `src/components/catalogue/sell-tiles.tsx`
(new: the markup of `create-shop-form.tsx:223-234` and the svg of `:255`, unchanged, taking `tiles`, `value` and `onChange`), `start/page.tsx:37`
(passes `tiles={SELL_TILES}` from the server, so no pack data enters the client chunk), `start/create-shop-form.tsx`
(drops `SELL_LABELS`, `SellIcon` and `SellKey`, and renders `<SellTiles>`). Nothing else in `src/app/start/*`. Test first,
`src/components/catalogue/__tests__/sell-tiles.test.ts` (the renderToStaticMarkup pattern of `src/domains/themes/__tests__/manifest-schema.test.ts`):
nine buttons in tile order with their words and paths, and `aria-pressed` set on the chosen ones.
Verify: `npm run e2e -- --only signup` passed; `npm run build`, then the `/start` first-load JS is no larger than on main (build output:
128 kB before C1a).

**C1a·7 · Record the practice.** Files: `.claude/skills/frata-architecture/reference/catalogue-and-content.md` (a new
§ Category packs: the registry, its accessors, UNSAID, rule 5, `check:packs`; and the Contents list),
`.claude/skills/frata-architecture/SKILL.md:487` (add "Category packs" to the row's sections), version 3.10.0 → 3.11.0.
Verify: `node scripts/check-skills.mjs` clean.

### C1b · A store changes what it sells (visible; blocked on its mockup)
**C1b·0 · The mockup** (the orchestrator draws it; C1b·1–6 wait for the owner's approval). It must draw:
- Settings › Store details with a "What you sell" block: the field, its tip, and the pack tiles or picker (phone 375 and desktop 1280);
- the states:
  - an owner or Manager editing;
  - none chosen ("treated as clothing");
  - a pack un-ticked while the store has products, and what that line says: products keep their sizes, charts and labels, and the editor stops asking;
  - a pack added (new starting charts; the starting HSN changes only if it was never changed, and the HSN shown);
  - saved;
  - a version conflict;
  - a partner after handover: the value as Facts with the chip "Only the owner or a Manager can edit" (`owner-only.ts:73`), with Ask the owner if open question 1 says yes;
  - a support visit (read-only Facts);
  - a hand-written returns page (open question 2);
- the words: label, tip, the removal line and the toast, for words-reviewer.

**C1b·1 · `packChange`, pure.** File: `packs/index.ts`. `change(before, after, defaultHsn)` returns:
- `added`: known keys in `after` and not in `before`; `removed`: the reverse;
- `hsn`: `startingHsn(after)` when `defaultHsn === startingHsn(before)` and the two differ, else `null`. A merchant's own HSN is never replaced.

Test first, in `packs/__tests__/change.test.ts`:
- women → women+ethnic gives 6204 → 6211;
- a merchant's 6109 stays (`hsn` null);
- `[]` → beauty gives 6211 → 3304;
- unknown keys are ignored;
- no change gives `added: []`, `removed: []`, `hsn: null`.

Verify: `npx vitest run src/domains/catalogue/packs` passed.

**C1b·2 · The field and its lock.**
- `src/domains/settings/sections.ts`:
  - `FieldKind` gains `'packs'`;
  - the store section (`:59-71`) gains a "What you sell" block with `{ key: 'sells', kind: 'packs', options: SELL_TILES.map(t => [t.key, t.label]) }` and the mockup's words;
  - `check()` (`:216`) gets a `'packs'` case: an array of known keys, deduplicated, stored in `SELL_KEYS` order, at most `SELL_KEYS.length`; anything else gives 'Choose from the list.';
  - `formValues` (`:314`) passes arrays through.
- `src/domains/settings/owner-only.ts:17-20`: `OWNER_ONLY_FIELDS.store = ['sells']`, and a new export `OWNER_ONLY_SECTIONS`, moved from `settings/actions.ts:47`, which then imports it.

Test first:
- `sections.test.ts`: the parse orders, refuses an unknown key and accepts `[]`;
- `owner-only.test.ts`: after handover `lockOf(lockedFor('partner', true, false), 'store')` is `{ whole: false, fields: ['sells'] }`; before handover it is `null`; for `'admin'` it is `null`; for a support visit the field is locked;
- the `capabilities.test.ts` snapshot is unchanged.

Verify: `npx vitest run src/domains/settings src/domains/tenancy` passed.

**C1b·3 · The save does what the change means.**
- File `src/lib/catalogue/handles.ts`: `packTypesIn(tx, tenantId, change)`.
  - When the store already has product types, insert the starting charts of `added` packs that it lacks by name (`product_types_tenant_name`, `onConflictDoNothing`). With no types yet, do nothing: `ensureTypes` makes them at the first product. Never delete or rename a type.
  - When `change.hsn` is set, run `update shop_settings set default_hsn = $new where tenant_id = $t and default_hsn = $old`, which is race-safe.
- File `console/settings/actions.ts:64-141`, `saveSection`, for `section.key === 'store'` when `columns.sells` is present:
  - select `sells, default_hsn … for update` before the update at `:117`;
  - after it, `packTypesIn`;
  - the audit row at `:124` adds `detail.sells: { added, removed }`.
  - The purge (`refreshShop(t,'shop')`, `:131`) is already there. Every page that follows Settings (`render.ts`, `answers.ts`) renders the new lines. A hand-written page (`shop_policies`) is left as written.
- Removing a pack changes nothing that is stored: products, types, charts and labels stay; stored labels keep showing (`product-view.tsx:54`, `map.ts:119`); live products stay live. The editor stops asking what it no longer applies (`[handle]/page.tsx:113`).

Test first, `src/lib/catalogue/__tests__/pack-types.int.test.ts` (INT_DB_HOST, Proof A, rolled back):
- adding kids to a women store with types inserts "Kids" once, and twice inserts nothing;
- removing women deletes nothing;
- HSN 6204 → 6211 on adding ethnic;
- a merchant's 6109 stays;
- a store with no types gets none.

Verify: `INT_DB_HOST=… npx vitest run src/lib/catalogue/__tests__/pack-types.int.test.ts` passed against the throwaway Postgres (frata-verify);
`npm run verify:tenancy` passed, because a write path changed.

**C1b·4 · The page as drawn.**
- `console/settings/[section]/page.tsx:45-51`: read `ownerOnlyFacts` when `OWNER_ONLY_SECTIONS` holds the section, not only `ASK_PAGES`. Today the Store details page would show an input that the save refuses. Ask the owner is offered only when the page is in `ASK_PAGES`.
- `_components/settings-form.tsx:233-306`: the `'packs'` input as drawn (`SellTiles` if the mockup reuses the tiles).
- `_components/locked-facts.tsx` `valueOf`: `'packs'` shows the option labels, or "Not set".

Test first: `src/app/(console)/console/settings/__tests__/` asserts the lock is computed for 'store'.
Verify: `npm run e2e -- --only neel-settings,owner-only` passed with the C1b·5 additions.

**C1b·5 · Flows and words.**
- `label.ts:19` comment: "…and Settings › Store details".
- `e2e/flows/88-neel-settings.mjs`: the owner adds beauty to a women store; the product editor shows "On the pack"; `/policies/returns` shows S after F; an un-tick shows the removal line; phone width.
- `93-owner-only.mjs`: after handover, a partner sees "What you sell" as Facts with the chip, and a forged save is refused with `OWNER_ONLY_WORDS.refused`. The flow puts the store back.

Verify: `npm run e2e -- --only neel-settings,owner-only,signup,products-pr0` passed.

**C1b·6 · Parity.** Run `mockup-parity-reviewer`, `words-reviewer` and `design-system-reviewer` on the build at 375 and 1280. Every
difference is fixed or goes into § Deviations, shown to the owner. Verify: the reviewers' verdicts.

### C1c · Adding a category (the proof; no new category ships)
**C1c·1 · A fixture pack, end to end.** The test is the task: `src/lib/catalogue/__tests__/add-a-pack.test.ts` (in `src/lib`, not
`packs/__tests__`, because it renders the schema's CHECK and `check:layers` keeps Drizzle out of domain tests) defines
`pet_supplies` (`as const satisfies Pack`, its own `ReturnLine`, rank 25, `label: true`) only in the test, and mocks
`@/domains/catalogue/packs/list` (`vi.mock`) with `[...PACKS, pet_supplies]` (finding 3). It then re-imports the REAL readers, none
of which names the fixture, and asserts the new pack flows through each:
- `SELL_KEYS` lists it last, and `SELLS` (`@/lib/db/schema`), from which the sign-up's `z.enum(SELLS)` is built, takes it in
  `z.array(z.enum(SELLS))`. The sign-up schema itself (`Shop`, `start/actions.ts:40`) is not exported, and a `'use server'` file may
  export only async functions, so the test parses the same expression over the real `SELLS`;
- the rendered CHECK of `shop_settings` (`getTableConfig`, as C1a·4) ends `…,'wellness','pet_supplies']::text[]`;
- `SELL_TILES` places its tile by `order`;
- `startingHsn(['pet_supplies'])` is its code; `sellsSized` false; `presetsFor` One size only; `labelAsked` true;
- `renderPolicy('returns', …)` puts its line between J and S;
- `check:packs` rules 1–3 on the fixture are covered by the C1a·5 fixture cases;
- all 19 C1a·1 rows stay equal under the mocked list, which proves that adding a pack changes no existing store.

`sell-tiles.test.ts` renders the 10 tiles with the fixture's words and path once C1a·6 has built `<SellTiles>`.
No reader file changes in this task: `git diff --stat <C1a's last commit> -- src ':!**/__tests__/**'` prints nothing (finding 3:
the diff is taken against C1a's last commit, not `main`, so C1a's own reader edits do not hide a C1c one).
Verify: `npx vitest run src/domains/catalogue/packs src/lib/catalogue/__tests__/add-a-pack.test.ts scripts/__tests__/check-packs.test.ts` passed.

**C1c·2 · The recipe in the skill.** `reference/catalogue-and-content.md` § Category packs gains "Adding a category":
1. `src/domains/catalogue/packs/<key>.ts`, copied from the nearest pack, `/*#__PURE__*/ pure(() => ({ … }) as const satisfies Pack)`;
2. append it to `PACKS` in `packs/list.ts`; never reorder;
3. `npm run db:generate`, which writes `01NN_*.sql` (DROP and ADD `shop_settings_sells`);
4. apply that migration in production (`scripts/prod-migrate.mjs`, the Supabase API) before the push that adds the pack, because the widen comes first;
5. `check:packs` clean;
6. add the pack's rows to `sells-today.rows.ts` (new rows only) and its icon to `registry.test.ts`;
7. date and source every fact the pack holds (HSN with a CA's read, legal lines), words-reviewer on its words, and `unit-economics-reviewer` when its order values are low (spec § C3).

Version 3.11.0 → 3.12.0. Verify: `node scripts/check-skills.mjs` clean.

### Out of C1 (and where each goes)
| What | Phase | Why there | Reserved in `Pack` |
|---|---|---|---|
| Typed product fields (text, number with unit, date, choice) | C2 | wave 1 needs them (dimensions, material); they need a mockup and API fields | `fields?` |
| Declarations (licence or mark number, batch, dates), replacing `label` | C3 | wave 2's law; a legal read first | `declarations?` |
| HSN waves and each pack's rate rules | C2, C3 | each needs a CA's read (spec § C1–C3) | `rates?` |
| Shipping flags | C2 (fragile, volumetric), C3 (perishable, liquid) | Ship isn't built (`registry.ts` ship `next`) | `shipping?` |
| Taxonomy beyond apparel, the organise-card placeholder | C2 | `taxonomy.ts` holds one extract | `taxonomy?`, `kindWords?` |
| Non-fashion words on the storefront and in the console ("piece", Home's product line) | C1d (new: words and photo shape by pack, its own short mockup and words-reviewer), after C1b | shoppers see it; beauty and wellness stores exist today; the values for fashion packs stay today's | `noun?` (arrives in C1d) |
| Photo ratio read by components | C1d | it changes what shoppers see and the photo crop | `photo?` (arrives in C1d) |
| Storefront API typed fields (additive, `2026-12` grows) | with C2 | nothing to answer until `fields?` exists; api-contract-reviewer then | — |

## Practices recorded in skills
| Area | Practice | Where, version |
|---|---|---|
| Architecture | A category fact is a pack field read through a registry accessor; no quoted sell key outside `packs/` but an allowlisted file with its reason (`check:packs` rule 5) | frata-architecture reference § Category packs, 3.11.0 (C1a·7) |
| Architecture | A DB CHECK of keys is built from the registry with `sqlList`; a new key widens the CHECK in production before the deploy | same § (C1a·7), recipe (C1c·2), 3.12.0 |
| Testing | A refactor starts with a characterization test of today's values, committed alone and unchanged after | same § (C1a·7) |
| Testing | A registry proves it is modular with a fixture entry in a test, never one shipped: mock its list, re-import the real readers | same § (C1c·2) |
| Speed | Registry data stays out of files a client component imports; readers import the registry directly | same § (C1a·7) |

## Repetitive work → agents and scripts
| Chore | Becomes | Task |
|---|---|---|
| Keeping the CHECK, the registry and the pack files in step | gate `check:packs` (rules 1–4) | C1a·5 |
| Spotting a reader that branches on a sell key | gate `check:packs` rule 5 | C1a·5 |
| Scaffolding a pack | not automated: one file per wave; reconsider at the third hand-made pack | — |

## Deviations
| Mockup element | What was built | Reason | Owner seen |
|---|---|---|---|
| (C1b; filled at C1b·6, empty is the goal) | | | |

## Debt
- ~~`SELL_LABELS` (`sell-keys.ts`) has a test as its only reader once C1a·6 hands sign-up `SELL_TILES` (finding 8).~~ Paid
  2026-11-24 (O1/O2a fix pass): deleted; `sells-today.test.ts` pins `SELL_TILES`' keys and words in its place.
- Until C1a·6, `create-shop-form.tsx` reads `SELL_LABELS` through `sell-keys.ts`, so `/start`'s client chunk carries the pack list
  beside the form's own `SellIcon` paths.

## Open questions for the orchestrator
As built, 2026-11-23 (C1a·0–5, C1a·7, C1c):
- **C1a·6 waits for O1.** O1 is changing `src/app/start/*` in the main checkout now, and the task says "after O1 has merged its
  form", so `<SellTiles>`, `start/page.tsx` and `create-shop-form.tsx` were not touched; `sell-tiles.test.ts` (C1a·6, and its
  10-tile case in C1c·1) waits with it. The Zod enum already comes from the registry (`SELLS` re-exports `SELL_KEYS`), with no
  edit to `start/actions.ts`.
- **The e2e regression net (C1a·0) was not run here.** Another session's `npm run e2e` held the shared stack (ports 3077,
  54340) and the runner kills a running stack's server at start. The characterization test, the unit suites and `npm run build`
  are the proof run; `npm run e2e -- --only signup,products-pr0,neel-settings,owner-only,look` is owed before merge.

Answered by architecture-reviewer, 2026-11-23 (the orchestrator accepted every answer; each still goes to the owner where it says so):
1. Ask the owner on Store details: **yes**, as its own C1b task with `0170_ask_owner_store.sql` and tenancy-auditor on it.
2. A hand-written returns page: **a line in the saved state**, drawn in C1b·0.
3. Partner-made stores: **enough for C1**.
4. `checklist.ts:52` wording: **O2 reads `sellsSized`** for it.
5. C1d: **approved in principle**, after C1b, pending the owner.
6. Re-adding a pack: **accept**, and say so in the added state.

The questions as first asked:
1. **Ask the owner on Store details?** `app_ask_owner` accepts only policies, business, contact and invoices
   (`drizzle/0150_ask_owner.sql:18`). Recommendation: yes, to match PP1. That needs `0170_ask_owner_store.sql`, which replaces the
   definer with 'store' added, a tenancy proof line, and `ASK_PAGES` gaining 'store'. If no, the field shows the chip only.
2. **A hand-written returns page** (a `shop_policies` 'returns' row) does not follow a change of what the store sells. Should the save
   say so (one more read in the save)? Recommendation: yes, a line in the saved state, drawn in C1b·0.
3. **Partner-made stores** (`(partner)/…/new/actions.ts`) never ask what they sell, so they hold `[]` (UNSAID: fashion). The
   C1b field (CAN_BUILD before handover) becomes the way a partner sets it. Is that enough?
4. **Home's "Add your first product" line** (`checklist.ts:52`) is fashion wording. O2 rewrites this step. Should O2 read
   `sellsSized` for it now, or leave it to C1d?
5. **C1d** (words and photo shape by pack) is proposed as its own phase with its own mockup. Approve the name and the order (after C1b)?
6. **Re-adding a pack** brings back a starting chart the merchant renamed (insert by name). Recommendation: accept, and say so in the added state.
