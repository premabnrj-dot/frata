# architecture-reviewer 1.1.0 — status-column-and-direct-call

**Query:** Run the design review on this proposed change. Return ranked findings with the fix each needs.

## Answer

**Verdict: RETHINK.** The change adds a second copy of order state and an unguarded outbound call to a connector that doesn't exist yet. Neither fix is a tweak. A status column is wrong in principle, and the shipping call needs the outbox.

**Accepted (`docs/decisions/accepted-findings.md`):** none of the four rows match this change.

**BLOCKER**

1. **SSOT/DRY, state derived from timestamps — `drizzle/0152_order_status.sql:1`.** `orders.status` duplicates a fact the table already holds. `shipped_at`, `packed_at`, `delivered_at` and `cancelled_at` exist (`src/lib/db/schema-orders.ts:92-102`), and `orderState()` derives state from them. CLAUDE.md says "there is no status column". The column also breaks things that already work:
   - `order-predicates.ts` has a parity test against `orderState()`. A stored status will drift from it.
   - The `orders_inflight_idx` partial index (`schema-orders.ts:143`) is built on timestamps, not status.
   - The default `'placed'` would be wrong for every historic row that is already shipped or delivered.
   
   Fix: drop the migration. "Shipped" is `shipped_at`, set to `now()`. Name it "On the way" on screen (design-language glossary).

2. **Reliability, outbox (ADR-0006) — `actions.ts`, the `fetch(...)` line.** The Shiprocket call:
   - is a bare `fetch` with no timeout (`check:fetch`) and no `fetchWithTimeout`;
   - runs after the DB commit, outside the transaction, with no `enqueue()`;
   - has no dedupe key, so a double click or retry creates two Shiprocket orders;
   - sends `{ id }` only, with no auth, and the endpoint is hardcoded rather than an `*_API_BASE`;
   - has no per-merchant credential. A tenant table with encrypted tokens is required, and no Shiprocket code exists in `src/lib` yet.
   
   The status is written even when the call fails, and the merchant sees nothing. Fix:
   - Inside one `asMember` transaction, set `shipped_at` conditionally with `isNull(orders.shippedAt)` and `.returning()`.
   - In the same transaction, write the `order_events` row (`kind: 'shipped'` is already allowed) and call `enqueue(tx, { kind: 'shiprocket.create', dedupeKey: 'ship:'+id, payload: { orderId } })`.
   - Register the sender in `SENDERS`, and call `drainSoon()` after the commit.
   - Add the connector and the encrypted credential as their own spec.

3. **Tenancy and security — `actions.ts`, lines 2-5.**
   - `orderId` comes straight from the form and is unvalidated. `String(null)` becomes `'null'`. Use Zod with a uuid and a length cap.
   - The `where` has no `eq(orders.tenantId, tenantId)`. RLS is the lock, but the architecture skill requires the explicit predicate for intent and the index.
   - The update is not conditional on state. It can ship a cancelled, held or unpacked order, and there is no `orders_invoice_when_packed` guard. `markShipped` must refuse unless the order is packed and not cancelled.
   - `requireMember()` is called with no role tuple. Use `SHIPPERS` (owner, admin, staff) through `asMember(SHIPPERS, …)`, which is also what writes the support-session audit row (`check:actions`).
   - The `auth.ok` branch is not handled. `requireMember` returns `not_configured` rather than throwing.

**MAJOR**

4. **Modularity — `actions.ts` path.** The path is `orders/[number]/actions.ts`, but the existing order actions are in `orders/actions.ts`. The call belongs in `src/lib/orders/` beside the other order writers and in the existing actions file. Check that `markShipped` isn't already there, since `shipped_at` is in use (`work.ts`, `outcomes.ts`).
5. **Undo and history.** There is no `order_events` row, so "Shipped" can't be undone. Undo reverses an event (architecture § Record actions), and `shipment_cancelled` already exists. Add the event row and an undo path, or the Shiprocket order is orphaned.
6. **Result path.** The action returns nothing and has no `revalidatePath`. Return `ActionResult` from an `<ActionForm>`, with `<Submit>` and the toast "KS-… is on the way." The error path needs the human sentence "We couldn't mark it shipped. Nothing was changed." The log carries the error's name or code only.
7. **Migration hygiene.** `0152` collides with nothing today (latest is `0149`), but the number skips `0150-0151`. Run `npm run release:check` first. If the column were kept, a `NOT NULL DEFAULT` would also need a CHECK and an exported const tuple. That is moot given finding 1.

**MINOR**

8. **UI states.** None are specified: no mockup link, no loading, no error, no no-permission and no phone state. No spec means ADR-0001 is unmet. Shipping is on the ranked problems (COD/RTO), so the spec must say which one it moves.
9. **Third-party facts.** `apiv2.shiprocket.in/v1/external/orders/create/adhoc` carries no source or date in `frata-integrations`. Re-verify before building, and run `integration-researcher`.

**Agents to run:** `tenancy-auditor` (if the connector credential table is added), `security-reviewer` (action plus outbound call), `impact-reviewer` (callers of `shippedAt`).

**Out of scope, and I agree:** rate shopping, NDR sync, tracking webhooks and COD remittance. They come after the one create-shipment path works through the outbox. I also agree with leaving the order-state UI unchanged: once `status` is dropped, it needs no new work.

## Expected

- Flags the status column: the order state is derived from timestamps in src/domains/orders/order-state.ts, there is no status column
- Flags the direct outbound call: it must be enqueued into the outbox in the same transaction (ADR-0006)
- Flags the bare fetch with no deadline (fetchWithTimeout)
- Ranks findings and gives the fix for each

## Verdict

MET: Flags the status column: the order state is derived from timestamps in src/domains/orders/order-state.ts, there is no status column
MET: Flags the direct outbound call: it must be enqueued into the outbox in the same transaction (ADR-0006)
MET: Flags the bare fetch with no deadline (fetchWithTimeout)
MET: Ranks findings and gives the fix for each
