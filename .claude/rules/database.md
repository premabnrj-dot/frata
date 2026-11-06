---
type: rule
status: active
paths:
  - "src/lib/db/**"
  - "src/lib/queries/**"
  - "drizzle/**"
---

# Database

Before changing a table, a policy or a query, load `frata-architecture` and
follow § Tenancy → "A new table — the checklist" in order. A new table ships
with its grant, revoke, RLS and policy in the same migration, and a row in
`scripts/verify/tenancy.sql`. Then `npm test` and `npm run verify:tenancy`
(`frata-verify`). Run the `tenancy-auditor` agent before merging any change here.
