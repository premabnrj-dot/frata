import 'server-only'

// =============================================================================
// FILE: src/lib/studio/hosting.ts — WHAT STUDIO NEEDS FROM HOSTING, BEHIND ONE INTERFACE (plan
// docs/plans/2026-11-22-v3a-runtime.md § The hosting stand-in). V2a (sites, site_deployments, the fleet, the gate) is not
// built, so `preview_build` answers "not available yet" through StandInHosting. What V2a must provide behind this port:
// `sites` and `site_deployments` keyed by tenant (read in src/lib/queries/sites.ts); an outbox `site.build`, enqueued in the
// tool's own bound write (requestPreview), for the branch head Frrata reads (never a SHA from the model or a caller), one in flight per site, at a turn's end only; the
// fleet's answer through webhook_events with the shop from the site_deployments row; the gate's verdict and
// frrata/fields.json, capped at 64 kB; a preview URL on the preview domain behind protection, frame-ancestors the
// console only. The repository token and the instruction-file check are V3a·7's, not hosting's.
// =============================================================================

import type { Tx } from '@/lib/db'
import type { TurnRef } from './as-turn'
export type GateVerdict = { passed: boolean; checks: { name: string; ok: boolean }[] }
export type EditableField = { key: string; label: string }
export type Preview = { state: 'queued' | 'building' | 'ready' | 'failed'; url?: string; gate?: GateVerdict; editable?: EditableField[] }

/** A preview is a row before it is a request (ADR-0006; architecture review of the phase, M5): the tool asks in its own
 *  bound write, and hosting's outbox worker builds it; the agent then reads the latest preview hosting recorded. */
export interface HostingPort {
  /** Asks for a preview of the session branch's head, which hosting reads itself (never a SHA from the model or a
   *  caller): an outbox `site.build` enqueued in `tx`, one in flight per site. */
  requestPreview(tx: Tx, turn: TurnRef): Promise<{ ok: true } | { ok: false; why: 'not_available' | 'busy' }>
  /** The session's latest preview as hosting last recorded it (a row: never a call out), or null. */
  latest(turn: TurnRef): Promise<Preview | null>
}

/** Until V2a: no previews. */
export const standInHosting: HostingPort = {
  async requestPreview() { return { ok: false, why: 'not_available' } },
  async latest() { return null },
}
