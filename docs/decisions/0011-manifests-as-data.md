# ADR-0011: A theme manifest may be authored data

Status: accepted (owner approved the Theme Studio mockup v2, 2026-11-11) · spec `docs/specs/2026-11-11-theme-studio.md`
· plan `docs/plans/2026-11-11-theme-studio-ts0a.md` · builds on the themes spec (2026-11-08) and ADR-0002

## Context
Every theme manifest has been a typed file in `src/domains/themes/catalogue/`, immutable once released, with Admin
deciding only who may use a version. The owner wants Frrata's staff to build gallery themes in Admin and partners to
build themes for their own clients — without code. That needs manifests that are created as data, while every shop
keeps today's guarantees: nothing a theme says can run code or style beyond Frrata's tokens, a released version never
changes, and one shop never renders another's private theme.

## Decision
1. **A manifest is the same object from code or from data.** One Zod `ManifestSchema`
   (`src/domains/themes/manifest-schema.ts`) describes it; every code manifest parses to itself (parity test); a data
   manifest is stored only after it parses. Colours are exactly `#RRGGBB` (they reach a `style` attribute); every other
   token is a closed choice or a bounded number; photos only from Frrata's samples (a studio theme's own folder in TS2).
2. **One check.** `themeCheck(manifest)` (`src/domains/themes/check.ts`) is the check every manifest passes: the vitest
   for code manifests, the studio on save and submit.
3. **Readers take a source.** A `ManifestSource` (`src/domains/themes/source.ts`) lists the manifests a reader may use;
   pure functions take it as an argument; `manifestsFor(tenantId)` (`src/lib/themes/manifests.ts`) hands each request
   its source, read before any transaction. Only the source, Admin's code-version pages and tests read the code
   catalogue (`check:layers`). Classic 1.0.0, the baseline every shop can fall back to, always comes from code.
4. **Versions stay immutable**, whether a file or a row (TS2: frozen on submission by a trigger).
5. **Which data manifests a shop may render is decided when it is written** (TS2: an entitlement row written only by a
   definer, and a trigger on `shop_theme_revisions`), so the content cache can be shared by version.

## Consequences
- TS0a changes no pixel: the code catalogue is the only source until TS2; snapshots and `05-shop-look` prove it.
- The architecture skill's "manifests are typed files" becomes "manifests are typed files or validated rows, read
  through a source".
- Theme keys stop being a fixed list in TS2 (`THEME_KEYS`, the revisions CHECK, the Signal test move with it).
