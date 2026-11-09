# Plan: Theme Signal — S0 and S1
Status: active · Date: 2026-11-09 · Spec: docs/specs/2026-11-09-theme-signal.md (active, mockup approved by the owner
2026-11-09) · Reviews: architecture-reviewer 2026-11-09 (findings 1–19, below), speed-reviewer 2026-11-09 (below)

## Decisions taken from the reviews (owner's "take the best decision" stands for these)
- **No new sells key** (finding 3): the sample sets are **footwear**, **accessories** (bags-led: "Bags and accessories")
  and today's **clothing** set. Precedence for a shop that sells several things: footwear only if it sells nothing
  clothing; else accessories if it sells accessories or jewellery and no clothing; else clothing. Other themes'
  previews follow the same sets (preview only; the shop never shows samples).
- **Narrow before adding** (findings 1–2): `BASE_CHOICES.card`, `desktopColumns`, and every new setting get a base list
  equal to today's values; sections get optional `allowed.productLayouts` and `allowed.schemes` (defaults = today's),
  applied in `resolveTheme` and the forms. Old themes can't render a Signal value; `carryOver` drops what isn't offered.
- **The signal band** (finding 4) is a derived `signal` scheme computed in `resolveTheme` from the FINAL accent (after the
  brand colour and the palette), never written in a manifest.
- **Section labels** (finding 5) are text: optional `label` (≤ 24 chars) on products, image_text and collection_tiles;
  a `labels` setting (`none` in every base list; Signal offers `pill`, `plain`, `none`).
- **Photo footer** (finding 6) takes the first hero photo, no new stored image; falls back to `statement` with none.
- **Trust row** (finding 7) = the shop's true promises (`truePromises`: pay on delivery, exchanges/returns, dispatch).
  Warranty is out of S1 (no such fact exists); it comes back as a product detail if merchants ask.
- **Delivery line** (finding 8): S1 restyles today's estimate ("Ships in … · arrives in … days"). A date and a pincode
  check are a later task (cached HTML; `useNow`).
- **Compare tab** cut (finding 9). Colours stay as swatches.
- **Fonts** (finding 10): Schibsted Grotesk via next/font with `preload: false` (rule P6); a pairing → body mapping
  (`--store-body`, default Inter) so Signal is one grotesk for everything.
- **Version** (finding 15): `signal@1.0.0`, an `OFFERED` entry, released in Admin › Themes like the others.
- **Interactivity** (finding 14): the float header is CSS (like `overlay`); tabs and the rail counter share ONE island
  ≤ 2 kB gz; tabs ≤ 5 collections × 8 products.
- **S0 photos** (finding 11): realistic photos replace drawn ones only for Signal's sets, because Signal is
  photography-led; the drawn sets stay for the other themes. Source: the owner or a design partner (asked
  2026-11-09), or a Pexels key; each file credited in ONE file, `public/themes/samples/CREDITS.json` (the drawn files
  credited as "Frrata, drawn"); a gate `check:credits` in `npm test`. Until photos arrive, Signal previews use the
  drawn sets. People in lifestyle stock: model releases are the source's terms, dated in `frata-integrations` before use.

## Tasks (each ends with its verify command, read before the commit; impact-reviewer on each diff)
| # | Task | Verify |
|---|---|---|
| T0 | Regression net: a vitest snapshot of `resolveTheme`, `settingAttrs`, `settingVars` for every released manifest with an empty and a full layer; shop-look green on a clean run | `npx vitest run src/domains/themes && npm run e2e -- --only shop-look` |
| T1 | Narrowing: `BASE_CHOICES.card`/`desktopColumns`, `CHOICE_FORM_KEYS`, `<Offered>` in the page form; `allowed.productLayouts`/`schemes` in resolve and the forms | `npm test && npm run typecheck`, T0 snapshots unchanged |
| S0-1 | `sampleSetFor(sells)` and the three sets (drawn until photos) | `npx vitest run src/lib/themes` |
| S0-2 | `CREDITS.json` and `check:credits` (fails an uncredited file; run once with one planted, and against its own doc) | `node scripts/check-credits.mjs && npm test` |
| S1-1 | Schema: header `float`, card `tile`, setting `labels`, section `label` text, products layout `tabs` and rail `counter`, footer `photo`, the derived `signal` scheme; pairing `schibsted` + body mapping | `npx vitest run src/domains/themes` (sections snapshot updated on purpose) |
| S1-2 | Split `sections/index.tsx` (Products out) and `shell.tsx` (headers out) with no visible change | `npm run build && npm run e2e -- --only shop-look` (0 px) |
| S1-3 | Renderers: float header (CSS), tile card, label pills, tabs + counter island, signal band, photo footer | `npm run build` (budgets) `&& npm run e2e -- --only shop-look` (0 px on existing pages) |
| S1-4 | Product page: swatches as tiles, restyled estimate, trust row from promises | `npx vitest run src/domains/themes && npm run e2e -- --only shop-look` |
| S1-5 | `signal@1.0.0` manifest, `OFFERED`, customizer forms show only what a theme offers; Signal baselines added on purpose; release row in Admin | `npm test && npm run e2e -- --only look,shop-look,themes-three` |
| S1-6 | Reviews on the diff (impact, speed, security for the label text), docs, ship | gates, full e2e, `npm run build` |

## Practices recorded in skills
- frata-architecture § Themes: "a new value on a shared setting ships with a base choice list equal to today's, so
  older themes can't render it"; derived schemes are computed after the brand colour.
- frata-design-language § Theme Signal (landed with the approval).

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Checking every sample file has a source and licence | `check:credits` gate |
| Checking a new theme value doesn't leak into older themes | the T0 snapshot (any change to an old theme's resolved output fails) |

## Later (not in this plan)
V1 (Mux video) with the architecture review's V1 notes: ADR-0008 attempt row first, timestamps not status, renderer
falls back to the poster when an asset is gone, webhook key `mux:<env>:<id>`, unknown assets ignored, processing in
`after()`, CSP media-src/img-src and the console's connect-src. Then S2, S3.
