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
    and `SiteFooter` with WhatsApp written out. /partners, /login and /build-that-converts (`/` is Rani Mela, rules 45–51;
    /start is the sign-up surface, rule 42a).
42a. **Sign-up (/start) is its own surface** (O1, mockup `docs/mockups/2026-11-23-merchant-onboarding.html` § 1): the
    wordmark with its 2 px thread and one 22×4 dot per step, the question column (max 400 wide, Bricolage headings,
    48 px fields and the ink button with the thread under it), the store drawing itself on the haldi illustration tint
    beside it; on a phone the store is a strip above the question. Keeps "Sign in" (signed out) and "Stuck? WhatsApp
    us". Its colours are tokens; a store's own colours and the per-category stops live in `src/app/start/signup.css`.
43. **The product is shown as it is**, drawn (`ExampleOrderCard` on `/`,
    `EarningsPreview`): `inert`, marked "Example", every figure from the engines
    (`exampleOrder()` through `orderProfit()`, `shareExample()`), never typed.
    No invented testimonials or logos.
44. **No new client script on a public page**: a choice is radio chips, with
    one panel per choice in a shared cell, shown by `[data-calc]:has(:checked)`
    and named by `aria-describedby` (the partner calculator over
    `shareTable()`). The shared `InfoTip` and the sign-in form are the only
    islands.
    Large ₹ figures are mono (a ₹ in the display face pulls the Devanagari file).

## Rani Mela — the website's look (owner-approved 2026-11-22; mockup `docs/mockups/2026-11-17-homepage-rani-mela.html`, spec `docs/specs/2026-11-22-homepage-rani-mela.md`)

Live on `/` (the pilot); /partners, /build-that-converts and /login keep rules 42 and the W·1 frame until each
moves. Where this section and rules 36–42 disagree on a Rani Mela page, this section wins. Rules 41, 43 and 44 still hold.

45. **Colour has one job each**, from the `--site-*` tokens at the top of `src/app/site.css` (never `base.css`: the
    shop sheet imports it and its CSS budget has no room; the same in both modes; `check:contrast` holds every pair): **rani** is every action (buttons fill rani on the website, the logo's thread, one highlight
    word per screen); **neel** is trust (the number band, help, Hindi lines, the footer at neel-night); **marigold**
    celebrates (a sticker, "Most brands pick this"), only ever as a filled shape, never text; **peacock** is good news
    (Delivered, what you keep, ticks; as text only in its `-text` shade). Text on a tint uses that colour's deep shade.
46. **Type:** Bricolage Grotesque at 800 for headings, DM Sans for words (`src/components/brand/site-fonts.ts`), Mukta
    700, cut to the letters the page uses (`MUKTA_LETTERS`, tested), for a Hindi line (`lang="hi"`, one per section at most, never a translation of the heading beside it),
    JetBrains Mono for ₹ and order numbers.
47. **The frame:** a white page; `HomeHeader` (sticky, the wordmark with its thread, a rani Start free), sections that
    alternate paper, a rani or neel tint and one full neel band, a full rani closing band, `HomeFooter` on neel-night.
    The mark's quarter circle and circle are the only shapes, behind the hero and inside the two bands.
48. **Sections follow the founder's feeling, one per scroll:** this is for me (hero) · that's my problem (leaks) ·
    there's a fix (tiles) · the terms are fair (neel band) · I can do this (steps) · I know which plan (pricing) · my
    last worry is gone (questions) · let's start (rani band).
49. **Icons** on the website are its own sprite (`SiteIconSprite`): a 32 grid, a 2 px round line, one fill at 18%,
    coloured by the tile they sit on; always `aria-hidden` beside words.
50. **Motion is CSS only:** the hero rises once on load (320 ms, 60 ms apart), the sticker pops once, buttons press
    down 1 px and lift 2 px on hover, tiles lift 4 px; nothing moves on scroll; reduced motion moves nothing.
51. **Not built yet says Next**, on the tile, the step, the order card and the toast that show it (rule 41).
