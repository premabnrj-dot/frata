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
| 2 | A late online capture after an abandoned payment can take an offer past its use limit | Accepted in writing, as `refund_due` already accepts it for stock | owner, 2026-11-08 | `docs/specs/2026-11-08-coupons.md` § Uses, locks and limits |
| 3 | A link from any site can replace a bag that only bag links filled (the bag link's L1, narrowed); the shopper lands on checkout with that site's lines, server-priced | Accepted while (a) checkout lists every line and places only on the shopper's own Place order (re-raise if P3 or EkCode adds one-tap placing), (b) no other site can frame `/cart`, (c) only `bag.replace` writes `link` | owner, 2026-11-16 (decision 2, "approve all") | `docs/plans/2026-11-16-one-address-checkout.md` P0; security-reviewer 2026-11-16 |
| 4 | Before `frrata.shop` is on the Public Suffix List, a sibling store's page can flood `Domain=frrata.shop` cookies: X's host-only session cookie is evicted (the shopper is signed out) and enough of them make X answer 431 (seen in e2e `94-cross-store`) | Accepted while (a) every cookie X reads is host-only and `__Host-` (`check:cookies`), (b) store X is the only victim and the flood is attributable to one store's code, (c) P4b's listing is pursued. Struck through once browsers carry the listing; re-raised if a store's partner code is found doing it | owner, 2026-11-16 (decision 5, spec T16, "approve all") | `docs/specs/2026-11-16-one-address-checkout.md` § 6, T16; `docs/plans/2026-11-16-one-address-checkout.md` P4a·3; security-reviewer 2026-11-16 |

## Proposed, for the owner (not yet ruled — still raised as findings)

| # | Finding | Proposed ruling and its condition | Proposed by, date |
|---|---|---|---|
| P1 | The pre-bash hook lets a commit through when it fails by its own error, and does not see git aliases, a remote set to force, `bash -c` or backticks | Accept: it guards against an agent's mistake, CI's `npm test` is the gate, and GitHub branch protection on `main` (the owner's setting, not yet confirmed) is the lock on force-pushes | security-reviewer, 2026-11-16 (`docs/plans/2026-11-16-practices-from-ekatan.md` § Owner) |
| P2 | Nine Console pages at or over 148 kB on 2026-11-16 are pinned at that size + 2 kB, six of them over the 150 kB budget | Accept while each pin only comes down (`scripts/lib/app-budget.mjs`); a page past its pin is a finding | the practices plan, task 7, 2026-11-16 |
