# Plan: three purposeful themes (Editorial 2, Bazaar 2, Studio) with deeper options and sample content
Status: built (2.0.0 versions await release in Admin) · Date: 2026-11-09 · Showcase: https://claude.ai/artifact/8bvMF5mdhJQkVDayoVjabc · Research: `docs/research/2026-11-08-themes-pro-grade.md` · Mockup: https://claude.ai/artifact/S2bPoCzyBPKA1NW4BesKfz
Owner, 2026-11-08 (night, then away until morning): "let's execute this plan and make existing themes distinctive,
purposeful, better, use dummy data/demo data … options: product page styling, image gallery styling, button motions,
transitions, checkout page styles, nav bar styles, footer options … just have 3 with each having its own purpose,
style, layout options, configurator options … take up this work autonomously … if stuck take best decision".
That is the sign-off for this cut. Every judgement call made without the owner is listed in § Decisions taken alone.

## Goal
North star (5) a premium-looking storefront, with (4) mobile checkout conversion. **Measures:** share of open shops
on one of the three themes that publish within 14 days of trying one, and sessions → delivered orders 28 days
either side of a publish (both already in the themes spec).

## What ships
| # | Piece | What a merchant sees |
|---|---|---|
| 1 | **Three themes in the gallery**, each a 2.0.0 version with its own purpose: **Editorial** (occasion and designer wear; takes in Atelier's arch), **Bazaar** (big catalogues, sale-ready), **Studio** (Minimal renamed: contemporary, basics, western) | Look › Themes shows three cards. Classic stays as "your shop today" for a shop that never published, and as the fallback; Atelier and Classic aren't offered to try. Shops already on any theme keep rendering it |
| 2 | **Per-theme options**: a manifest lists which values of each choice it allows (`allowed.choices`); the customizer shows only those | Each theme's settings differ: Bazaar has pill buttons and a sticky buy bar; Editorial has a stacked gallery and a statement footer; Studio has the split header and underline buttons |
| 3 | **New choices** (additive; absent = today's look exactly) | **Buttons:** shape (theme corners / pill), motion (press / lift / fill). **Product page:** photos (swipe, thumbnails, + rail of thumbnails beside, + stacked), buy box stays beside photos on computers, sticky Add to bag bar on phones. **Cards:** hover (none / lift / zoom). **Motion:** page entrance (none / fade / rise), sections rise in on scroll. **Header:** + Split (collections left, logo centred). **Footer:** + Statement (the shop's name large), footer colours (paper / tint / ink). **Checkout:** standard / focused (header without menu, no announcement, no bottom tabs, footer reduced to policies) |
| 4 | **Sample content in the customizer** | A shop with fewer than 4 listed pieces sees sample pieces (marked "Sample") in its draft preview, so a theme can be judged before the catalogue exists; "A product" in the page picker opens a sample piece when the shop has none. Never on the shop itself |
| 5 | **Placeholder art** (new themes only) | A Hero or Image with text with no photo shows the theme's drawn placeholder (an arch and a garment in the theme's colours, inline SVG, decorative) instead of falling back to text, on the shop too, until the merchant adds a photo |
| 6 | **Customizer feel** | Click a section in the preview to select it (the bridge answers back); hover outline; a section that throws shows "This section couldn't be shown" in the preview and nothing on the shop |

## Decisions taken alone (owner away; each reversible)
1. **Three = Editorial, Bazaar, Studio.** They cover the three jobs the earlier research found (occasion/designer,
   big-catalogue value, contemporary basics). Atelier's arch hero moves into Editorial; Classic stays only as the
   baseline. Studio is Minimal's 2.0.0 under a new name (the key stays `minimal`, so shops on Minimal 1.0 update
   through the normal draft).
2. **New versions, not edits.** Released manifests never change (T3 guard). 2.0.0 files are added; Admin › Themes
   must **release** them before merchants can try them (the T3 model). I don't release anything: that is a
   production action for the owner (Admin › Themes › Add → Release, three times).
3. **Sample pieces only in the preview**, never on the shop: a shopper must never be able to try buying a piece that
   doesn't exist. Placeholder **art** (not products) does show on the shop, like Shopify's placeholder images:
   it's decoration in the theme's own colours and makes no claim.
4. **Page transitions are CSS entrance animations, not the View Transitions API.** Shop links are client-side
   (Next `<Link>`), so cross-document transitions never fire; React's `ViewTransition` is experimental in Next 15.
   An entrance on the page's template animates `transform` (and opacity from 0.6, never 0, so the largest paint
   isn't held back). Nothing is added that could freeze an Instagram in-app browser.
5. **Reveal on scroll** with `animation-timeline: view()` inside `@supports` and reduced-motion off; never the
   first section (the largest paint).
6. **Focused checkout through CSS `:has()`** on the shell (the checkout marks itself `data-checkout`): no route
   move, no layout change, and browsers without `:has()` simply show the standard checkout.
7. **No migration.** Every new choice lives in the existing `settings` jsonb of a revision, checked by the same Zod
   schema; no table changes, so no tenancy proof changes.

## Tasks (each: tests, gates, impact-reviewer on its diff)
| # | Task | Verify |
|---|---|---|
| 0 | Regression net: `npm test`, typecheck; e2e 05-shop-look (Classic pixel-identical) and 47-look green **before** | baseline run recorded |
| 1 | Types and resolve: new choice fields with `CHOICE_DEFAULTS` (today's look), `allowed.choices` per manifest, `pick` honours it; layer schema; SETTING_NAMES; carryOver keeps the new choices (merchant's layout is theirs); placeholder flag on the manifest | vitest: defaults reproduce today's resolved theme for every 1.x manifest; allowed lists enforced; carryOver |
| 2 | Storefront: CSS for button shape/motion, card hover, page entrance (template), reveal, footer colours; shell: split header, statement footer, focused checkout; buy box: rail and stacked galleries, sticky buy box, phone buy bar; placeholder art component; section try/catch | e2e 05-shop-look 0 px on Classic; new screenshots per theme; `check:motion`, `check:contrast`, storefront JS budget |
| 3 | Manifests: editorial 2.0.0, bazaar 2.0.0, minimal 2.0.0 ("Studio"); THEME_ORDER for the gallery = the three; Atelier/Classic still render | check:theme vitest; released-manifests snapshot: only additions |
| 4 | Sample catalogue (pure, `src/domains/themes/sample.ts`): 8 pieces with sizes, prices, colours, art keys; preview-only merge (< 4 listed) and `/products/sample-*` in the preview | vitest (merge rule, never on the shop path); e2e: empty-ish shop preview shows Sample |
| 5 | Customizer: theme form groups (Buttons, Motion, Footer, Checkout), page form (photos, buy box), only allowed values; click-to-select bridge; gallery copy for three | e2e 47-look extended |
| 6 | Skills: design-language § Shop themes (the three, the new choices, motion rules), architecture note on sample content; spec addendum | — |
| 7 | Reviews: architecture, security, speed on the diff; impact-reviewer; e2e full run | findings fixed |

## Design review (short form, frata-planning § 3)
- **UI/UX:** each theme form shows only the choices its theme allows; every new choice is a picture-free `Choice`
  with words a merchant uses ("Press", "Lift", "Fill"; "Stacked photos"). Focused checkout keeps the shop's logo
  (a way back) and every legal link. Sample pieces wear a "Sample" tag and link only inside the preview.
- **Tenancy:** no new table, no new read; sample data is code. The preview still reads the revision inside the
  member's tenant.
- **Modularity:** pure: `types`, `resolve`, `layer`, `sample.ts`, manifests. Rendering: shell, sections, buy box,
  `placeholder.tsx`. The preview merge lives in `preview-body.tsx` (preview only).
- **SSOT:** defaults in one `CHOICE_DEFAULTS`; per-theme lists in the manifest; the form reads both through one
  helper (`choicesFor`).
- **YAGNI:** out: View Transitions API, zoom lightbox, video, search page, new sections, blocks, start-from-a-look
  wizard (the research's P3), demo shops on public addresses.
- **Performance:** no new JS on shop pages beyond the buy box's phone bar (an IntersectionObserver in the existing
  island, < 1 kB). Placeholder art is inline SVG (< 2 kB) only where a photo is missing. Animations: transform and
  opacity only. Budget 120 kB unchanged.
- **Security:** no new action; saves go through `saveLookAction` and the stricter schema. SVG art is static markup in
  code, never merchant input. The bridge's new message (`picked`) is origin- and source-checked.
- **Unit economics:** none (themes stay free; no new cost).
- **Blast radius:** shell (every shop page), buy box (every product page), checkout (a CSS rule only), the customizer.
  Classic's look must not move a pixel (05-shop-look).

## Review findings (2026-11-09) — every finding taken; these override the sections above where they differ
### architecture-reviewer: CHANGES NEEDED
1. **Legal text stays.** The focused checkout uses the compact footer (every legal fact, no social links); the
   Statement footer adds the shop's name large above all the legal facts and removes none. e2e checks both.
2. **New choices are pinned per manifest.** One helper `choicesFor(m, key)`, used by `resolveTheme` and the forms: a new
   key a manifest doesn't list allows only `CHOICE_DEFAULTS[key]` (so a 1.x manifest can never render a 2.0 value
   after a recall, a revert or carryOver); an existing key keeps today's rule. Vitest: every new value in a layer on
   every 1.x manifest resolves exactly like `{}`.
3. **Placeholder art in the preview only.** Readiness is unchanged: a photo Hero or Image with text still needs a
   photo before Publish (decision 3 above is narrowed: nothing drawn reaches a shop).
4. **Samples:** only from the customizer's preview (`samples: true` from theme-preview, never `/console/preview`);
   a real product is looked up first and a `sample-` page shows only when that is `none`; merged after
   `previewCatalogue`, never in the cached reads; variant ids not uuid-shaped (the quote refuses them); the sample
   product renders `live={false}`; `sample.ts` lives in `src/lib/themes/` (it builds query-layer types); `Photo` gets
   no change: a sample card carries `art` and the card draws it. Vitest: the cached reads never return a sample.
5. **Section guard calls `One()` as a function** inside try/catch, rethrows Next's own errors (`unstable_rethrow`),
   logs the error's name only.
6. **Names:** `buttonMotion`, `entrance`, `reveal`; `motion: none` and reduced motion turn all of them off. Studio's
   underline buttons are a new value of `buttons`.
7. **A reverted deploy keeps the rest of a layer:** settings are parsed key by key; an unknown value drops only itself.
8. `split` / `statement` go in `allowed.headers` / `allowed.footers`; `allowed.choices` is typed per key; check:theme
   asserts each default is in its own list.
9. Entrance: CSS keyed on a shell attribute; the template adds no box (`display: contents` when off); `(order)` gets
   none.
10. Focused checkout: a `(checkout)` route group with its own layout (same shop checks) passing `focused` to the shell;
    no `:has()`. The preview has no checkout page: the setting is described in the form by its two names only.
11. Gallery shows three; a shop on Atelier or Classic keeps its look and its card at the top of Look (not in the list).
12. CSS for new choices targets non-default values only; no unconditional transition on `.store-btn`.
### speed-reviewer: WITHIN BUDGET with these (all taken)
1. Entrance keyframes end on `transform: none`, fill `backwards`, no `will-change` (a leftover transform would pin
   the phone buy bar to the page); the bar is portalled to `body`.
2. `check:storefront-build`: product page and checkout ≤ 115 kB; no sample or placeholder marker in any `/s/` chunk.
3. Every new rule scoped `[data-store-theme][data-…]`; shop CSS ≤ 20 kB gz in the same gate.
4. Gallery `sizes` per layout (stack 55vw; grid photos after the first 27vw; rail `calc(55vw - 72px)`); thumbnails
   `fetchPriority="low"`; photo 0 the only priority; e2e asserts one `fetchpriority=high` on a product page.
5. Reveal: `animation-range: entry 0% entry 60%`, `animation-timeline` after the shorthand, never on the lead section.
6. template.tsx stays a server component reading nothing; checkout and order pages get no entrance.
7. Placeholder art (preview only now) is drawn once per page as a `<symbol>` and `<use>`d.
8. Card hover inside `@media (hover: hover)`, transform only; lift's shadow is a pseudo-element's opacity.
9. Phone bar state lives in its own child; hidden with transform + `inert`; the page pads for it.
10. Focused checkout is a route group (no `:has()`), so n/a.

## As built (2026-11-09)
- Tasks 0–7 done. `npm test` 588 passed; typecheck clean; `npm run build` with every postbuild gate (product page
  114.1 kB of 115, checkout 113.8, shop CSS under 20 kB); e2e 05-shop-look, 10-checkout, 12-security, 47-look,
  48-themes-admin, 48-themes-three green.
- **Changed from the plan:** placeholder art is the sample scenes (drawn WebP, preview only), not inline SVG; the
  focused checkout is a `(checkout)` route group; `rhythm: 'even'` (2.0 manifests) evens section spacing; carryOver
  also treats a new major version of the same theme as a switch (impact review).
- **Classic's one visual change:** horizontal rails no longer snap 16 px past their padding (a bug every theme had);
  `e2e/baselines/shop-home-phone.png` regenerated for it, nothing else moved.
- **Reviews on the diff:** impact-reviewer (FIX BEFORE COMMIT: the section guard returned elements, so it caught
  nothing — now it calls each section's function, with a test; major-version carryOver; sample count in one place;
  the preview wraps pages for the entrance; THEME_ORDER removed; spec amended; Look thumbnails draw Split and
  Statement); security-reviewer (SAFE; `readSettings` reads own fields only, tested).
- **Known gaps:** the checkout has no preview page, so "Checkout: Focused" is seen after Publish; no automated test
  of the phone bar's timing or the CSS motion (screenshots only); `src/lib/queries/storefront.ts` is at 395 of 400
  lines (split before its next change).
- **For the owner:** Admin › Themes shows Editorial 2.0.0, Bazaar 2.0.0 and Studio 2.0.0 as "New in this deploy".
  Until they are released, shops see the 1.x versions of the same three themes. Release (or stage to a pilot shop
  first) once the branch is merged.
