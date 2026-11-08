# Plan: three purposeful themes (Editorial 2, Bazaar 2, Studio) with deeper options and sample content
Status: executing · Date: 2026-11-09 · Research: `docs/research/2026-11-08-themes-pro-grade.md` · Mockup: https://claude.ai/artifact/S2bPoCzyBPKA1NW4BesKfz
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
