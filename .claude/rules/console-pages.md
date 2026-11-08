---
type: rule
status: active
paths:
  - "src/app/(console)/**"
  - "src/app/(admin)/**"
  - "src/app/start/**"
  - "src/components/**"
  - "docs/mockups/**"
---

# Console pages

Load `frata-design-language` before writing a console page or primitive, and obey its **Rule 0: no explanations** —
no helper text unless it is required (an error, a limit, money taken, legal wording, an irreversible consequence);
clean, space-optimised layouts (owner, 2026-11-08). It binds Admin pages and mockups too. Start
with `requireMember`, read through `src/lib/queries/`, render money with
`<Money>` and dates with `src/lib/format-date.ts`. A page in a signed-off mockup
is built as drawn (`frata-planning`). Design every state, including phone width.
