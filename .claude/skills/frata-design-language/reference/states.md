# frata-design-language — the seven states of a screen

Part of `frata-design-language`. Every screen designs seven states: empty, loading, error, one, many, no permission,
phone (SKILL.md § Console patterns, "States"; frata-planning § 3 UI/UX). This table names the primitive each state
uses on each surface. It restates rules already in the skill and its reference files, and adds none; where they
disagree, the section it names wins.

| State | Console (`src/app/(console)`) | Admin (`src/app/(admin)`) | Partner workspace (`src/app/(partner)`) | Shop (`src/app/s/[host]`) |
|---|---|---|---|---|
| **Empty**, first use | `Empty` (`src/components/ui/empty.tsx`): one drawing, one line, the action; a brand empty state may lead with one `PictoTile` (§ Graphic language) | `Empty` | `Empty`, may lead with a `PictoTile` (§ Graphic language) | the shop's own words; an empty story section shows nothing (reference/shop.md) |
| **Empty**, a filter or search with nothing | `NoMatch`: one line and the way back | `NoMatch` | `NoMatch` | the shop's own words (reference/shop.md) |
| **Loading** | the top progress bar; `Skeleton` for a part that loads late. No `loading.tsx` (§ Console patterns) | the top progress bar, as Console | the top progress bar, as Console | cached pages (ISR): no loading state on first paint |
| **Error**, the page | `error.tsx` at the surface root (`check:states`): "We could not load this screen · Nothing was changed · Try again" | `src/app/(admin)/admin/error.tsx` | `src/app/(partner)/partner/error.tsx` | `src/app/s/[host]/error.tsx` |
| **Error**, after an action | a toast (`toast.error`); a field mistake is `FieldError` at the field; inside a popup, the Dialog's error slot (§ Feedback, `check:feedback`) | as Console | as Console | a failed payment returns to a filled form (reference/shop.md) |
| **One** and **many** | `DataTable` (48 px rows from md) and `Section`; a list is paged (§ Console patterns, reference/console-operations.md § Work queues) | `DataTable` | `DataTable` | lists page at 48 (frata-architecture § Speed) |
| **No permission** | `Panel` with `requireMember`'s words and one way on; `Locked` names what the person cannot do and who can | `Panel` | `Panel` (a Builder on a page that isn't theirs: the way on is drawn in `Panel`) | n/a: the shop is public |
| **Phone** (< 768 px) | the bottom bar; tables become rows (`<Td cell>`); a `Dialog` becomes a sheet (reference/ux-foundation.md rules 10, 15) | as Console | as Console | the shop's phone rules (reference/shop.md) |
