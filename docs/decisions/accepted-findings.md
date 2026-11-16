# Accepted findings — what the owner has ruled acceptable, so reviews stop raising it

Every review agent reads this file before it reports (practices plan, task 18; after Ekatan's
`price-behaviour-accepted.ts`). A finding that matches a row below is not raised again as a finding: the report lists
it under "Accepted (docs/decisions/accepted-findings.md)" with the row's number, in one line.

Rules for this file:
- **A row is an owner's ruling, with a reason and a date.** Never add one because a review is inconvenient. A reviewer
  proposes a row ("for the owner to accept"); the owner's words go in the Ruling column.
- **A row names the condition it rests on.** When the condition stops being true (the mitigation is removed, the
  traffic or the money grows past the figure), the finding is raised again and the row is struck through.
- A row that a later change made moot is struck through, not deleted, so the history stays readable.

| # | Finding | Ruling and the condition it rests on | Owner, date | Source |
|---|---|---|---|---|
| 1 | The Vercel domains token is a team token, not one scoped to the project | Accepted risk while it stays Production only, marked Sensitive, read only in `src/lib/env.ts`, its base URL fixed to api.vercel.com and never logged | owner, 2026-11-08 | `docs/plans/2026-11-08-shop-addresses.md` call 6 |
| 2 | A late online capture after an abandoned payment can take an offer past its use limit | Accepted in writing, as `refund_due` already accepts it for stock; the budget itself is never exceeded | owner, 2026-11-08 | `docs/specs/2026-11-08-coupons.md` § Limits |
| 3 | The pre-bash hook lets a commit through when it fails by its own error, and does not see git aliases, a remote set to force, `bash -c` or backticks | Accepted: it guards against an agent's mistake, CI's `npm test` is the gate, and GitHub branch protection on `main` is the lock on force-pushes | owner, 2026-11-16 (practices spec, call 2) | `docs/plans/2026-11-16-practices-from-ekatan.md` § Owner |
| 4 | Nine Console pages are over the 150 kB first-load budget | Accepted at their 2026-11-16 size + 2 kB (`APP_PINNED`), as long as each pin only comes down; a page that grows past its pin is a finding | owner, 2026-11-16 (practices spec, call 1) | `scripts/lib/app-budget.mjs` |
