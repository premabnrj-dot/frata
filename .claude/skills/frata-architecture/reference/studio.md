# Studio's agent as built (V3a) — the advance, the screen, Send and the cron

Read with `SKILL.md` § Studio's agent (the rules) and `docs/plans/2026-11-22-v3a-runtime.md` (the plan as built).

- **Tools propose, a person applies:** tokens and logos are checked with saveBrand's own rules before a card shows them
  and stored as `studio_proposals` (one per call); Apply runs the console's save as the person. No tool publishes, hands
  over, opens a store, touches a domain or a key, or reads stock, orders, shoppers, costs or members.
- **The advance** (`advance.ts`): a 90 s lease a session, events read by cursor (ids stored once; an idle before this
  turn's `user.message` is the last turn's), calls accepted only inside the turn's window, a round answered in ONE send
  with results kept until it succeeds, then the turn closed ended, paused or failed and the measured list cost settled.
  No transaction is held across a runtime call.
- **The screen** (`/partner/studio`, V3a R7): `requireStudio()` or state 1. The chat reads `studioChat`
  (`src/lib/queries/studio.ts`, under withStudio, the person's own latest session, keyset on `seq`) through the rows route,
  whose `after()` runs `pollAdvance` on the person's own open turn (no id from the request; cross-site refused).
  Apply (`src/lib/studio/apply.ts`) runs `saveBrand` with the version the person holds; a card reads Applied only when the
  change went live; refused on a store with an owner until V3b. The preview pane frames `/console/studio-preview`: the store alone, never the console (owner 2026-11-23).
- **Send and the cron**: `src/lib/studio/sessions.ts` (send, start, Stop, the poll's advance; imported by the Studio
  actions and rows route only) and `src/lib/studio/cron.ts` (end, clean, delete from `app_studio_due`'s ids, no bind;
  imported by the cron route only). With Studio unconfigured the cron still ends open sessions as `switch` and revokes
  their keys. A run does the ends first, the advances four at once, then clean-ups and deletes, each kind starting only
  with room for its longest step; an end holds the turn's reserve, and its final cost settles once the runtime has stopped
  (`app_studio_settle_ended`: Stop after its interrupt, bound and uncapped; the clean-up after archive, capped at the
  reserve; `measure.ts` is the one settle delta). A fresh start checks `agentMatches()` first. Migrations 0166–0167.
