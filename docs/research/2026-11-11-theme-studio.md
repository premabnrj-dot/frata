# Research: a Theme Studio for Frrata staff and partners
Date: 2026-11-11 · For: `docs/specs/2026-11-11-theme-studio.md` · Owner (2026-11-11): everything runs on Frrata;
Frrata staff build gallery themes, partners build themes for their own clients, owners use Look; building blocks now,
a Claude assistant next. Every fact carries its page's date; undated official pages are marked unverified.

## Products
| Product | What it does | Source + date | Taken |
|---|---|---|---|
| Shopify theme blocks / Horizon | Blocks as files, offered only through **presets**; sections accept `@theme` blocks; nesting 8 below a section; 50 blocks/section, 25 sections/template, 1,250 blocks/template | shopify.dev (undated, unverified); changelog 2026-07-21; Fall '26 Edition 2026-10-28 | Presets are the only way a block reaches the picker; hard depth + per-block accepted children; hard caps checked in code |
| Shopify colour palettes | One named palette (2–20), referenced by role; local overrides pick from the palette | changelog 2026-06-17 | Palette by role; overrides from the palette only, never a hex |
| Shopify Theme Store | Lighthouse ≥ 60 performance, ≥ 90 accessibility on home/product/collection, real content; 4.5:1 / 3:1; 24 px targets; alt on every image | shopify.dev requirements (undated, unverified) | The floor for Frrata's gallery |
| Shopify theme updates | Fixes automatic; version updates opt-in as an "Updated copy of…" draft that keeps settings and content; old theme kept for rollback | help.shopify.com (undated, unverified) | Look's "Update ready" lands in a draft with content carried over |
| Shopify partners | Dev, transfer and collaborator stores in one Dev Dashboard; collaborator access controlled by the merchant | changelog 2026-03-30 | Partner access to a client is the client's to control |
| Wix Studio | Agency templates; Client role sees only its site; per-page edit permissions; handover kit; breakpoints cascade down (users report breakage between them) | support.wix.com 2026-10-05, 2026-10-20, 2026-11; blog 2026-11-04 | Limit what an owner can change to content and order; **not** free breakpoints |
| Webflow Libraries, slots, page slots | Shared components from a source site; each site **accepts** updates, bulk push, rollback by restoring a version; **slots with allowed-component lists** bind the less-trusted role; ≤ 40 page templates; audit panel (alt, skipped headings, link text, duplicate ids) | help.webflow.com 2026-10-09, 2026-10-26, 2026-10-28, 2026-03-26 | Allow-lists per slot; per-shop accept with a bulk offer; checks while building |
| Framer | Shared components pull updates per component with Update; template marketplace **with no review** | framer.com/help 2026-09-15, 2026-10-27 | Not taken: no review (merchants trust the gallery with checkout) |
| WordPress Site Editor | List View tree (select, collapse, ⋯ menu: duplicate, copy, hide, rename, delete, save as pattern); keyboard map; synced patterns with Detach; insertions announced; decorative-image toggle | wordpress.org docs 2026-07-02, 2026-09-09, 2026-11-01; make.wordpress.org 2026-08-13 | Layers tree beside the preview, the ⋯ menu, shortcuts, announcements, "decorative" |
| W3C WCAG 2.5.7 | Every drag needs a single-pointer alternative (adjacent up/down) | Understanding page 2026-08-10 | ↑ ↓ and "Move to…" beside every drag |
| WCAG 1.4.3 | 4.5:1 text, 3:1 large (≥ 24 px, or 18.5 px bold); strict | Understanding page 2026-10-04 | Contrast on every role pair, strict |
| Baymard product page | 57% of sites lack size buttons; 44% no returns on the product page; 37% no in-scale image | baymard.com 2026-03-18; apparel study 2026-06-12 | Product template's required blocks are Frrata's (gallery, size buttons, size guide, delivered price with COD, returns summary) |
| Framer responsive | Design the primary breakpoint fluid; minimal overrides | Academy 2026-09-15 | Fluid sections, a few phone choices only |

No current source: NN/g on block editors; evidence that phone-first or per-breakpoint authoring is easier; About and
Contact page research; contrast auto-fix in a builder (Frrata's own idea).

## What Frrata already has (code, 2026-11-11)
- A theme is a manifest **in code** (`src/domains/themes/catalogue/<theme>/<semver>.ts`), immutable once released
  (snapshot test); Admin only releases, stages, recalls and withdraws versions (`theme_versions`, T3).
- One section library (12 keys, `src/domains/themes/sections.ts`) drawn by server components; the owner's layer is
  data, re-parsed at every read; drafts, publish, undo, carryOver, "update ready".
- Contrast is checked from tokens (`check:contrast`, `check:theme`); motion and budgets are gated.
- Partners are platform rows with no frata_app grant; their workspace reads through uid-keyed definers.

## Conclusion
Make the manifest **authored data** with the same guarantees (validated, frozen once released, versioned), add
**section designs composed from a catalogue of blocks** drawn by Frrata's components, and keep every output check
Frrata already has. Partners get the same studio, scoped to their clients by the partner link.
