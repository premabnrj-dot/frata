# frata-design-language — Brand and the public pages

Part of `frata-design-language` (SKILL.md holds the rules every screen obeys: Rule 0, Words, tokens, feedback).
These sections are the owner-approved rules of one surface; they are moved here unchanged (practices plan G4).

## Contents

- Brand: frrata
- The public pages

## Brand: frrata (owner-approved 2026-11-07; spec `docs/specs/2026-11-07-brand-frrata.md`, book https://claude.ai/artifact/S55h8hC9dYNJC2fQghjFvi)

33. **The name** is "Frrata" in a sentence (capital F) and "frrata" in the
    mark, always drawn, never typed. Said aloud it is "frata"; that is fine.
    `check:name` fails the old name in any string, template or JSX text in
    `src/`; internal names that must not change (storage keys, the
    key-derivation salt, taxonomy ids, hosts until B·4) are listed in
    `scripts/check-name.allow.json`, each with its reason.
34. **The mark** is drawn once (`src/components/brand/mark-paths.ts`): A
    "Thread", the first r's arm stopping a 3-unit stitch short of the second.
    `<Wordmark thread>` (rani thread) on brand surfaces (sign-in, the website),
    plain in working screens; `<Monogram>` in the shell (ink tile; rani tile
    on ink). The platform icon is generated from the same paths
    (`/frrata-icon`); a shop's tab never shows it.
35. **Type:** Bricolage Grotesque at **600** (`font-display`, committed, shell
    pages only, never a shop: `check:storefront-build`) for page h1s, the brand
    moment and brand empty states; everything a merchant works with is Inter;
    numbers are mono. 800 was too loud (owner).
36. **Icons** are two strokes: the body in the text colour and one detail, the
    tinge, in `var(--icon-accent, currentColor)`. The tinge is on only inside a
    `[data-tinge]` frame (today: the navs and the More sheet; `--brand-on-ink`
    on ink). A new frame (an Apps tile grid, an icon button) opts in the same way.
    In a table or beside a status badge an icon is one colour. The current
    page's icon is drawn at 2.25.
37. **The thread** (`--thread`, 2 px, ≥ 3:1 on ink and card) — brand surfaces only; Neel draws no thread on a button
    or a tab (the loading line stays rani). On a brand surface a primary button
    carries it a third wide at its foot and the full width on hover or keyboard
    focus (a `scale` transform, 120 ms); a secondary button on hover and focus
    only; destructive, ghost and disabled buttons never, nor a secondary button
    that undoes something (Close shop, Disconnect, Delete: `after:hidden`).
    The line sits inside the corner curve (`inset-x-1.5`); no `overflow-hidden`
    on a button (it would clip a wrapping label). Also the Console's
    active nav bar, the current view tab, the loading bar and a working link's
    underline. Admin's active bar stays yellow (rule 8).
38. **The running stitch**: a dashed edge (`border-dashed`) for a place to drop
    something and for "setup steps left"; never around a card that is content.
39. **The block print** (`block-print` utility): the mark's quarter circle and
    circle as a repeat, a mask over a token at 6%. On the public pages it is the
    `Selvedge` only (paper on ink, under the stage; rule 42), never behind a
    number, a table, a form or a control. Brand empty states use a `PictoTile`.
40. **Haldi and `--neel` (neel 900)** live on brand surfaces only and are never text or a control. The console's
    action colour is neel 600 (`--primary` inside `[data-neel]`), a different step of the same family. Rani as text is `--brand-text`.

## The public pages (owner-approved W·1, 2026-11-07; spec `docs/specs/2026-11-07-website-rework.md`)

41. **Fewer words, more pictures** (owner): each section makes one point, in a
    heading of at most 6 words, a line of at most 12, a card of at most 2 short
    lines (a page's h1, the one promise, may run to 8 words), and shows it in a
    drawing, the product picture or a number. No
    reassurance paragraphs, no notes about how the page is made. These stay
    visible whatever the word count: "+ 18% GST" and "of each delivered order"
    on every plan, "up to N orders a month", the partner's 90-day tail and "24
    months, from opening", "₹0 added to the brand's price", and "Example · ex
    GST · paid monthly once billing starts" beside partner numbers. Anything not built carries a Next tag, in the
    product picture too.
42. **The frame** is `src/components/brand/site.tsx`: an ink `SiteStage` with
    `SiteHeader` (skip link, the mark with its thread on ink, the `inverse`
    button), the `Selvedge` (the block print as a woven edge under the stage, the
    only place it appears), a Neel `NumberBand` of terms (paper on Neel, gated),
    and `SiteFooter` with WhatsApp written out. /, /partners, /login and /start.
43. **The product is shown as it is**, drawn (`ConsolePreview`,
    `EarningsPreview`): `inert`, marked "Example", every figure from the engines
    (`exampleOrder()` through `orderProfit()`, `shareExample()`), never typed.
    No invented testimonials or logos.
44. **No new client script on a public page**: a choice is radio chips, with
    one panel per choice in a shared cell, shown by `[data-calc]:has(:checked)`
    and named by `aria-describedby` (the partner calculator over
    `shareTable()`). The shared `InfoTip` and the sign-in form are the only
    islands.
    Large ₹ figures are mono (a ₹ in the display face pulls the Devanagari file).
