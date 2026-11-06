---
type: rule
status: active
paths:
  - "src/app/(console)/**"
  - "src/components/**"
---

# Console pages

Load `frata-design-language` before writing a console page or primitive. Start
with `requireMember`, read through `src/lib/queries/`, render money with
`<Money>` and dates with `src/lib/format-date.ts`. A page in a signed-off mockup
is built as drawn (`frata-planning`). Design every state, including phone width.
