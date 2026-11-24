# Open Studio on Partner workspace › Clients: the task plan (lane I)
Status: active, built on `claude/lane-i-studio-button`; released by the orchestrator after the reviews below.
**Mockup:** https://claude.ai/artifact/Ubt5ZTpxqWQ3afM8rYdsYh (`docs/mockups/2026-11-24-open-studio-button.html`, at 57fc900)
**Approved:** owner, 2026-11-24 ("Mockup for open studio button is approved.", relayed by the orchestrator)
**Review:** design-system-reviewer FAIL then fixed (phone placement, button gap), 2026-11-24
**Review:** tenancy-auditor SAFE, no cross-tenant path (2 low, fixed), 2026-11-24
Migrations: none.

## The gap (owner, 2026-11-24)

"currently in partner>clients, there is no options to open studio." Studio is at `/partner/studio`. The only way in was
Clients › a store › Open store, then typing the address.

## What is built

- `studioStoreIds()` in `src/lib/studio/with-studio.ts`: the set of store ids Studio's door would admit this person to,
  from the door's own pieces (Studio on and configured; Frrata staff and a live partner person on one sign-in; their own
  partner stores from `app_access_for`, never a support visit, a Lead only while assigned, a Builder never). Empty for
  anyone else, so a missing button tells nothing. The entry's store step now reads the same list (`partnerStoresOf`).
- `OpenStudio` (`_components/open-studio.tsx`): a server-drawn form, no script, a secondary button posting the store id
  and `to=/partner/studio` to `switchStoreAction`. That action already picks the store among the person's own list and
  allows `/partner/studio`. No new path takes a store from a URL.
- Placed as drawn: the client page beside Open store, and in each Clients row's action cell (a Lead now gets that cell
  too, for the button only).

## Deviations

| Screen | Drawn | Built | Why |
|---|---|---|---|
| Clients list, a Lead | row actions drawn for the owner | the action cell also exists for a Lead, empty unless the button shows | the owner-only cell would hide the button from a Lead who Studio admits |
| Clients list, a phone | the button on the row card | the button sits in the card's own full-width row (a second form, shown only below 768 px), because the actions cell is hidden on a phone | Remind and Record bill stay desktop-only as before |
| Ended clients | not drawn | no button on an ended (removed) client | a removed link is never admitted; the page skips the read |

## Checks

`src/lib/studio/__tests__/studio-store-ids.test.ts` (admitted, passkey check pending, not staff, not partner, other
user, not a partner on that store, Builder, support visit, Studio off, not configured);
`src/lib/auth/__tests__/switch-store-studio.test.ts` (lands on `/partner/studio` for the person's own store only);
`e2e/flows/99-studio-agent.mjs` (click from the list, button on the client page, hidden for a non-staff person).
