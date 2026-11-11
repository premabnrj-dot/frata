# Plan: Theme Studio TS0a — the seam (invisible)
Status: reviewed (architecture and speed reviews folded in) · Date: 2026-11-11 · Spec: `docs/specs/2026-11-11-theme-studio.md` (active; mockup v2 approved by the owner
2026-11-11) · Reviews: architecture-reviewer (2026-11-11, folded in below); speed-reviewer (2026-11-11, within budget; folded in below)

## Goal
Nothing a merchant sees changes. After TS0a, a theme manifest can come from somewhere other than a code file without
touching any caller again, every manifest passes one schema and one check function, and the two shop caches the studio
would overload are fixed. Measure: every e2e flow green, `05-shop-look` 0 px, resolved-looks and released-manifests
snapshots byte-identical, shop JS/CSS unchanged, `shopPublishes` entry ≤ 10 kB for a shop with 20 publishes.

## Decisions taken from the architecture review (2026-11-11)
- **Cache keys change with their shape** (blocker): `publishes` → `publishes-v2` (candidates only), `sf-theme-versions` →
  `sf-theme-withdrawn` holding a `string[]` (a cached `Set` comes back as `{}`); the Set is built after the read.
- **Parity compares like with like** (blocker): `parse(m)` is compared with `{ ...m, home: m.home.map(SectionSchema.parse) }`;
  the schema is strict (unknown keys refused, never stripped); a type test holds `z.input<typeof ManifestSchema>` and
  `ThemeManifest` assignable both ways.
- **Injection is refused where it reaches CSS**: the 12 colour roles (`#RRGGBB`), style keys (`^[a-z0-9-]{1,40}$`, the
  database check), enums and numbers; free text (features, job, names) is shown escaped by rendering it in a test.
  Manifest images: `ImageSchema.base` limited to `/themes/samples/` for manifests now (`studio/<id>/` in TS2).
- **Callers missed**: `productForEdit` (`queries/catalogue.ts:111`) reads the source at its top (it calls `extrasOffered`
  inside its own `withTenant`); Classic always comes from code (`isBaseline`): `classicFromSettings` imports
  `classic_1_0_0` directly, so `shell.tsx` and `pages.tsx` stay as they are; `resolve.test.ts`, `site.test.ts` updated;
  `seo` (share cards, icons), `documents` (`brand.ts`) and `paging` join the regression list.
- **Enforcement on the right half**: `manifestOf` / `manifestNear` stop being exports of the catalogue, so typecheck proves
  every caller moved; a `check:layers` rule allows `CATALOGUE` only in `source.ts`, `lib/admin/themes.ts`, the Admin
  version page and `__tests__`; `cmpSemver` moves to `semver.ts` (release.ts stops importing the catalogue).
- **Source shape**: `{ keys(), versions(key) }`; pure `manifestOf(src, k, v)` and `manifestNear(src, k, v)` built from
  `versions()` (one nearest-version rule). `OFFERED` stays code until TS2.
- **Actions**: `requireMember` first (cached), then `manifestsFor(tenant)` (under `cache()`), then `asMember`.
- **Speed**: candidates in one query (`DISTINCT ON (key, version)`, today's first query only); revision bodies under their
  own tag `shop:<t>:revision:<id>` and a long revalidate (frozen), never the `'shop'` scope's 60 s or `refreshShop`'s
  purge; statements counted with the speed proof's statement log before and after.
- **Console path**: `liveCandidates` = `publishCandidates` + one fetch of the bodies it needs (one "newest publish per
  version" rule); `lookFor`, `liveRevision`, `undoPublish`, `extrasOffered` keep full revisions. Admin's `liveOf` unchanged.
- **Minor**: candidate fields `themeKey`/`themeVersion`; measure with 10 distinct versions; `shopTheme(shop)` cached by
  `shop.id` replaces eleven `themeOf(shop, await shopLook(shop.id))` (previews unmemoised); per-manifest "key and version
  match its catalogue slot" instead of a catalogue-wide unique check; resolved-looks gains fixture rows through
  `resolveStored(row, shop, codeSource)`; `previewLook` one `withTenant` and the same withdrawn function, uncached.
  The goal no longer says "without touching any caller again": TS2 touches `THEME_KEYS`, the revisions CHECK and the
  Signal test. Spec aligned: `manifestsFor` / `manifests.ts`; revision cap stays the database's 64 kB.
- **Speed review (2026-11-11), measured on the e2e seed with 16 versions:** today a cold home runs 44 statements
  (24 work, 5 transactions; `theme_versions` read 4×) and the `publishes` entry is 24 kB at 16 versions (worst case 1.05 MB).
  - **No cached read inside a transaction (P4):** in the console path only `revisionBody(tx, t, ids)` runs inside
    `asMember`; a vitest greps `src/lib/themes/look.ts` for `shopRevision` and `withTenant(`.
  - **Fewer transactions:** the candidates query also returns the newest candidate's body; `shopRevision` is read only
    when that version is withdrawn; candidates and the withdrawn list load together (`Promise.all`). Measure: work
    statements −4, transactions −1, against today's log.
  - **A publish purges only the look:** the candidates entry carries `shop:<t>:look`; Publish, Undo and Restore purge that
    tag, never `refreshShop(t, 'shop')` (P11: a festive publish would otherwise rebuild the 880 kB catalogue everywhere).
  - `shopTheme(shopId: string)` and `manifestsFor(tenantId)` are `cache()`d by string; in TS2 the source loads alongside
    the look.
  - `shopRevision` is unexported, never caches a null (throws, like `hostFacts`), checks the id's UUID shape, names its
    columns, key `['sf','revision',t,id]`, read in `withTenant(t)` with an explicit tenant where.
  - Measure the entry at 10 and 16 distinct versions with merchant-sized layers.
  - Never share `.next` between a build and an e2e run (the review's build broke the first regression run).
- **Process note**: TS0a-1's schema was started before this review finished; it is held, reworked to the decisions above,
  and lands only after the speed review.

## Regression net first (TS0a-R)
`npm run e2e -- --only shop-look,look,signal,themes-three,themes-v4,themes-admin,video,seo,documents,paging` green on the current code
(numbers recorded); `npx vitest run src/domains/themes src/lib/themes` green; snapshot files committed as they are.

## Design

### 1. `ManifestSource` — the seam (spec § 1, architecture B2)
- **Pure** `src/domains/themes/source.ts`:
  ```ts
  export type ManifestSource = {
    of(key: string, version: string): ThemeManifest | null        // exact version
    near(key: string, version: string): ThemeManifest | null      // today's manifestNear rule
    versions(key: string): ThemeManifest[]                        // every version of a theme this source knows
  }
  export const codeSource: ManifestSource                          // over CATALOGUE (today's behaviour, unchanged)
  ```
- Domain functions that today reach `CATALOGUE` / `manifestOf` / `manifestNear` directly take a `ManifestSource`
  argument instead: `resolveStored(row, shop, src)`, the baseline in `resolve.ts:133`, `releaseProblems` callers, and
  `latestAvailable` callers pass `src.versions(key)` (its signature already takes the list). `src/domains/**` never reads
  `CATALOGUE` except `codeSource` itself (a vitest greps for it).
- **I/O side** `src/lib/themes/manifests.ts`: `manifestsFor(tenantId: string | null): Promise<ManifestSource>` — today
  `return codeSource` (tenant unused); TS2 merges the shop's entitled studio versions here, and only here. Called
  **before** any transaction (P4: never inside `withTenant`/`asMember`), result passed down.

### 2. Callers migrated (blast radius, every one with its proof)
| Caller | Change |
|---|---|
| `src/lib/themes/page-look.ts` `themeOf` | takes the source; shop routes pass `await manifestsFor(shop.id)` |
| shop routes: `(shop)/page.tsx`, `products/[handle]`, `collections/[handle]` (+ `page/[n]`), `policies/[page]`, `layout.tsx`, `_frame.tsx`, `(order)/layout.tsx`, `icon/[...icon]`, `og/[...card]` | pass the source to `themeOf` |
| `src/lib/seo/share-image.ts`, `src/lib/documents/brand.ts` | take the source |
| `console/look/actions.ts` (Try, Save, Publish, Restore, Undo) | read the source before `asMember`; pass `src.of/near/versions` |
| `console/look/page.tsx`, `look/history`, `look/customize`, `theme-preview/[revision]`, `console/preview`, `settings/[section]` | read the source at the top of the page |
| `src/lib/queries/look.ts` (`extrasOffered`) | takes the source |
| `src/lib/admin/themes.ts`, `admin/themes/[key]/[version]` | `codeSource` (Admin decides about code versions; studio versions arrive in TS2 with their own reads) |
Each shop route keeps its exact render: `05-shop-look` 0 px and the resolved-looks snapshot prove it.

### 3. `ManifestSchema` (spec § 1, security H1)
- `src/domains/themes/manifest-schema.ts` (pure, Zod): the whole `ThemeManifest` — key, version (semver), name, job,
  goodFor, features, styles (1–5, schemes with **every colour `^#[0-9A-Fa-f]{6}$`**), defaults (typed choices), allowed
  lists (closed enums), choices, samples, made, rhythm, scale, home (via `SectionSchema`).
- **Parity test:** every code manifest parses, and the parsed output deep-equals the manifest (a field the schema lacks
  fails the test, so the schema can't silently drop one).
- **Injection test:** a manifest whose colour, name, label or any token holds `;`, `}`, `url(`, `</style>` or a 7-char
  hex with a trailing space is refused.
- Not wired to any input yet (nothing stores a manifest until TS2); the shop still renders code manifests.

### 4. `themeCheck` — one function (spec § 5)
- `src/domains/themes/check.ts`: `themeCheck(m: ThemeManifest): string[]` — the checks `check-theme.test.ts` makes
  today (semver, styles 1–5 unique, defaults allowed, `made` ⊆ allowed, home sections valid and allowed and unique and
  ≤ 20, sources in the list, contrast for every scheme, unique key) returned as problems in words.
- `check-theme.test.ts` becomes `expect(themeCheck(m)).toEqual([])` per manifest, plus unit tests that each rule fires
  (a bad manifest per rule).

### 5. The shop caches the studio would overload (spec § 7, speed 3–4, 6)
- **`shopPublishes`** today caches every published version's whole revision (settings jsonb included). New:
  - `liveCandidates` split: `publishCandidates(tx, t)` → `{ publishId, revisionId, key, version }[]` (the cached list,
    tag `shop:<t>`), and `revisionBody(tx, t, revisionId)` → `{ revisionId, key, version, styleKey, settings }`.
  - `shopRevision(t, revisionId)`: `shopCached('revision', 'shop', …)`, keyed by tenant **and** revision id (the cache key
    carries the tenant, like every `shopCached` entry; the read runs in `withTenant(t)` with an explicit tenant where).
    A published revision is frozen (`app_theme_revision_frozen`), so the entry never goes stale; it still carries the
    shop tag so a shop purge clears it.
  - `shopLook(t)` = `liveOf(candidates, withdrawn)` then `shopRevision(t, live.revisionId)`. `previewLook` the same,
    uncached.
- **`versionStates`** returns only the withdrawn `key@version` set (what `withdrawnKeys` uses), wrapped in `cache()`
  over the `unstable_cache` entry (P3).
- **`themeOf`** memoised per request on primitives (`shop.id`, revision id, accent, display font) with React `cache()`,
  so the 4–5 calls per render resolve once.
- Measure: entry bytes before/after (`shopPublishes` for Kesar with 20 publishes), cold statements per shop page
  before/after (must not rise; target −1), `05-shop-look` 0 px.

### 6. ADR-0011 and skills
- `docs/decisions/0011-manifests-as-data.md`: a manifest may be authored data; the same guarantees (schema, immutable
  versions, one check, shops read only entitled versions — TS2); code stays the baseline; the domain stays pure through
  `ManifestSource`.
- `frata-architecture` § Themes: `ManifestSource`/`manifestsFor` (read before a transaction, pass down), `ManifestSchema`
  parity, `themeCheck`, the publish cache shape. Version bump.

## Tasks (verify each; impact-reviewer on each diff)
| # | Task | Verify |
|---|---|---|
| TS0a-R | Regression net (numbers recorded) | `npm run e2e -- --only shop-look,look,signal,themes-three,themes-v4,themes-admin,video`; `npx vitest run src/domains/themes src/lib/themes` |
| TS0a-1 | `ManifestSchema` + parity + injection tests | `npx vitest run src/domains/themes` |
| TS0a-2 | `themeCheck` extracted; check-theme uses it; rule tests | `npx vitest run src/domains/themes`; `npm test` |
| TS0a-3 | `ManifestSource` + `manifestsFor`; domain functions take a source; callers migrated (table above) | `npm test`; typecheck; resolved-looks + released-manifests snapshots unchanged |
| TS0a-4 | Publish cache split, `versionStates`, `themeOf` memo | entry bytes + statements measured; `npm run e2e -- --only shop-look,look,signal` (0 px) |
| TS0a-5 | ADR-0011, architecture skill, plan as-built; full e2e; reviews (impact, speed) on the diff; ship | `npm test`, typecheck, build budgets, full e2e |

## Practices recorded in skills
- frata-architecture § Themes: a manifest reaches code only through a `ManifestSource` read before any transaction;
  `src/domains` never reads `CATALOGUE` except `codeSource`.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| A domain function reaching `CATALOGUE` directly | the vitest grep in `source.test.ts` |
| A schema missing a manifest field | the parity test |

## Out of scope (TS0b and later)
Blocks, the `design` section, studio tables, entitlements, pages, any UI.
