# Brand: Frata becomes frrata
Status: active · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/S55h8hC9dYNJC2fQghjFvi (v2) · Approved: owner, 2026-11-07 (calls 1–4; display toned to 600; chapter 5 and the tinge added at the owner's ask, v2 for a look)

## Goal
Ranked problem (5), a premium-looking storefront, and trust in the product a merchant runs their shop on. The owner
asked for the rename to "frrata" with a new wordmark, guideline, typography, palette and icons. Measure: the owner's
sign-off on the brand book, then `check:contrast`, `check:scale` and a new `check:name` holding it in code.

## Job
Give the platform one bold, ownable identity that reads as Indian fashion and as fast, without getting in the way of
a tool used all day.

## Research
The owner's references (two boards, 2026-11-07): custom geometric wordmarks with one drawn detail (an arrow, a cut, a
letter swapped for a symbol, a ligature). Taken: a drawn lowercase mark whose detail is the double r. The UX foundation
research (`docs/research/2026-11-07-ux-foundation.md`) still holds for how the brand sits in the product: brand in the
chrome only, status colours never change between surfaces.

## Design (see the mockup)
- **Wordmark:** drawn, lowercase, stroke 14 on x-height 54. Three directions: A Thread (recommended: the first r's arm
  runs on to within a 3-unit "stitch" of the second; joining them read as "nr" or "π" in testing), B Tick, C Soft.
- **Monogram:** the rr of A in a square with a 23% radius. It replaces the oxblood "F".
- **Colour:** Ink and Paper do the work. Rani (#D61F69) is the signature, with Rani Deep (#A8124F) as text on paper and
  Rani Light (#FF4F93) on ink. Haldi (#F2B233) and Neel (#23307A) appear on brand surfaces only. Status colours are
  unchanged. Rani is never a button, link, number or status.
- **Type:** Bricolage Grotesque 800 for display (page h1s, brand, empty states, website), Inter for work (unchanged,
  with Indic fallbacks), JetBrains Mono for numbers. An eight-step scale.
- **Icons:** 21 domain icons, 24 grid, stroke 1.75, round ends; the current page's icon at 2.25; no filled variants.

## Owner decisions (2026-11-07)
1. Wordmark **A · Thread**, with the 3-unit stitch gap (joining the r's read as "nr" or "π" in testing).
2. **Rani**, with Haldi and Neel.
3. Display **Bricolage Grotesque at 600** (v1's 800 was too loud); **Inter for work**.
4. Rename **the product, emails and legal pages now**; shop addresses later (B·4).
5. Added by the owner: **a tinge of rani in icons and buttons**, and **a subtle graphic identity** for the UI (brand book
   chapter 5: the running stitch, the block print, the thread on buttons, the thread progress bar, empty-state drawings).
6. "Frata" said aloud is fine: no single-r redirect domain needed.

## Domain check (2026-11-07)
- **Available** (Vercel registrar lookup): frrata.com ($12.03 a year, the same to renew), frrata.app, .shop, .store, .co
  and .io. The owner buys frrata.com on 2026-11-08 and adds it to Vercel.
- **Not confirmed:** frrata.in and frrata.co.in. Vercel does not sell .in, who.is returned no record, and whois.com sat
  behind a security check. Check at an Indian registrar.
- **Not checked:** the IP India trademark search (classes 35 and 42) and the Instagram and WhatsApp handles. These need a
  person at a browser.
- The web shows no brand, shop or account named "frrata".

## Plan (reviewers before code; built only after the owner's look at v2's chapter 5)

| Task | What | Verify |
|---|---|---|
| B·1a tokens | `globals.css`: `--brand` becomes Rani (#D61F69) with `--brand-text` (Rani Deep #A8124F) and `--brand-on-ink` (#FF4F93); `--haldi` and `--neel` for brand surfaces only; dark values for each. `--icon-accent` = brand. The oxblood goes. | `check:contrast` gains the new pairs (Rani Deep on paper ≥ 4.5; Rani mark ≥ 3; white on Rani ≥ 4.5) |
| B·1b type | Bricolage Grotesque (OFL) committed as a variable woff2 through `next/font/local` (like the Noto faces: no Google Fonts fetch at build, which has flaked), `--font-display`, used at 600 by `PageHeader`'s h1, empty-state titles and the brand moment; everything else stays Inter. | `check:scale`; build with no network font fetch |
| B·1c mark | `src/components/brand/wordmark.tsx` and `monogram.tsx` (inline SVG, `currentColor`, an optional `thread` colour). The skeleton path data lives once, in `src/components/brand/mark-paths.ts`. Favicon, apple-touch and manifest icons come from the monogram (committed PNG/SVG). It replaces the "F" square in the shell, sign-in and Admin. | ux flow screenshots; a gate test that the path data is the one copy |
| B·1d graphic identity | Buttons: the primary button gets a 2 px brand thread at its foot (`scaleX` .34, then 1 on hover or focus, 120 ms), the secondary one on hover only, the destructive one never. Links get a brand underline colour. NavProgress, the current view tab and the active nav item draw a brand line. `.stitch` (6/4 dashed) for drop zones and "setup steps left". The block-print tile (5%) on sign-in and empty states. `EmptyState` gets an optional line drawing. | `check:motion` (transform only); contrast of focus rings unchanged |
| B·2 name | "Frata" becomes "Frrata" in every user-facing string: Console, Admin, partner, sign-in, emails, WhatsApp templates, legal pages and metadata. The legal entity's name on legal pages stays whatever the owner confirms it is. Internal names stay: storage keys (`frata.bag.v1` and the like, so shoppers' bags survive), the repo, the Vercel and Supabase projects, and DB roles. New gate `check:name`: fails a user-facing "Frata" (strings and JSX text outside comments and the allowed internal identifiers). | `check:name` red on today's tree, green after; e2e green |
| B·3 icons | `src/components/icons/`: the 21 icons as components with a `tinge` prop (on in the frame: nav, buttons, empty states; off in tables and beside status badges). They replace the shell's nav icons. | ux flow; `check:hex` (the accent is a token) |
| B·4 addresses (later, its own call) | Shop subdomains and the app domain on frrata.com, with permanent redirects from `*.frata.store` and the current hosts. | old links land on the same shop |

Skills in the same commits: `frata-design-language` (brand, the tinge, the graphic identity, display at 600) and
`CLAUDE.md` (the product's name). `impact-reviewer` runs on each task's diff.

## Out of scope
A marketing website; packaging print files; renaming the GitHub repo, Vercel project or Supabase project (these are
internal names and can stay).
